import { getStorage, setStorage } from './utils.js'
import { getTodayString, getYesterdayString, safeCancelAnimationFrame } from './utils.js'
import { config } from './config.js'
import { getSeasonCycle, getSeasonTimeRemaining, formatSeasonCountdown } from './seasonUtils.js'
import { wechatAPI } from './WechatAPI.js'
import { FriendLeaderboard } from './FriendLeaderboard.js'

/**
 * 游戏状态管理
 */
export class GameState {
  constructor() {
    // 批量读取所有 Storage 数据（减少阻塞 IO 次数）
    const saved = this._loadAllFromStorage()

    // 玩家数据
    this.score = 0
    this.highScore = saved.highScore
    this.bestWave = saved.bestWave
    this.coins = saved.coins
    this.lives = config.game.initialLives
    this.maxLives = config.game.maxLives

    // 游戏关卡数据
    this.wave = 1
    this.targets = []       // 需要记住的目标泡泡索引
    this.playerClicks = []  // 玩家点击的索引
    this.phase = 'MENU'     // 'MENU' | 'COUNTDOWN' | 'OBSERVE' | 'PLAY' | 'FAIL'
    
    // 计时器
    this.soundEnabled = true
    this.observeDuration = 1500  // 观察阶段时长（毫秒）
    this.playDuration = 4000     // 游戏阶段时长（毫秒）
    this.timerInterval = null
    this.timerType = null        // 'raf' | 'interval' | null
    this.timerRemaining = 0
    this.countdownRemaining = 0  // 复活倒计时剩余时间（毫秒）
    this.activeWaveCompleted = false
    
    // 暂停状态
    this.isPaused = false
    this.pausedPhase = null      // 暂停时的阶段
    this.pausedTimerRemaining = 0 // 暂停时的剩余时间

    // 签到数据
    this.lastCheckinDate = saved.lastCheckinDate
    this.checkinStreak = saved.checkinStreak
    this.lastCheckinType = saved.lastCheckinType || ''
    // 根据 lastCheckinDate 正确初始化签到状态
    this.hasCheckedInToday = (this.lastCheckinDate === getTodayString())
    this.hasNormalCheckinToday = this.hasCheckedInToday
    this.hasAdDoubleCheckinToday = false  // 广告双倍签到需要每次启动重新判断
    this.hasSharedGiftToday = false  // 今天是否已领取分享礼包
    this.lastShareGiftDate = saved.lastShareGiftDate
    // 初始化时检查今天是否已领取
    this.updateShareGiftStatus()
    
    // 分享次数数据（用于限制每日分享刷金币）
    this.lastShareDate = saved.lastShareDate
    this.todayShareCount = saved.todayShareCount
    // 初始化时检查分享次数
    this.updateShareCountStatus()
    
    // 积分规则相关
    this.waveScore = 0           // 当前关卡得分
    this.consecutiveWins = 0     // 连续胜利关卡数
    this.purchaseCount = 0       // 购买生命次数（整个游戏会话累计，最多 3 次）
    this.shareReviveCount = 0    // 分享复活次数（整个游戏会话累计，最多 3 次）
    this.adReviveCount = 0       // 广告复活次数（整个游戏会话累计，最多 3 次）
    this.sessionCoins = 0        // 本次游戏会话获得的金币（不包含初始 1000）
    this.isNewScoreRecord = false        // 本次结算是否破了最高分纪录
    this.sessionStartHighScore = this.highScore  // 本局开始时的历史最高分
    this.sessionStartSeasonScore = 0  // 本局开始时的赛季最高分（seasonData 初始化后更新）
    this.isWaitingShareRevive = false    // 是否正在等待分享复活返回
    
    // 首次游玩标记
    this.hasPlayedBefore = saved.hasPlayedBefore
    
    // 用户信息
    let nickname = saved.nickname
    
    // 如果没有昵称，生成默认昵称
    if (!nickname) {
      const randomNum = Math.floor(Math.random() * 9000) + 1000
      nickname = `泡泡大师${randomNum}`
      setStorage('nickname', nickname)
    }
    
    this.userInfo = {
      nickname: nickname,
      avatarUrl: saved.avatarUrl,
      authorized: saved.authorized
    }
    
    // 赛季数据
    this.seasonData = {
      seasonId: '',
      seasonScore: 0,
      seasonWave: 0,
      totalGames: 0,
      totalClears: 0,
      bestStreak: 0,
      userRank: 0,
      rewardCoins: 0,
      settled: false
    }
    
    // 赛季信息
    this.seasonInfo = {
      currentSeasonId: '',
      seasonStartTime: 0,
      seasonEndTime: 0,
      timeRemaining: 0
    }
    
    // 初始化赛季信息
    this.initSeasonInfo()
    
    // 赛季数据初始化后，记录本局开始时的赛季最高分
    this.sessionStartSeasonScore = this.seasonData.seasonScore
    
    // 好友排行榜
    this.friendLeaderboard = new FriendLeaderboard(this)
    this.friendLeaderboard.init()
  }

  // 批量从 Storage 读取所有数据（减少阻塞 IO 次数）
  _loadAllFromStorage() {
    return {
      highScore: Number(getStorage('highScore', 0)) || 0,
      bestWave: Number(getStorage('bestWave', 0)) || 0,
      coins: Number(getStorage('coins', config.game.initialCoins)) || config.game.initialCoins,
      lastCheckinDate: getStorage('lastCheckinDate', ''),
      checkinStreak: getStorage('checkinStreak', 0),
      lastShareGiftDate: getStorage('lastShareGiftDate', ''),
      lastShareDate: getStorage('lastShareDate', ''),
      todayShareCount: getStorage('todayShareCount', 0),
      nickname: getStorage('nickname', ''),
      avatarUrl: getStorage('avatarUrl', ''),
      authorized: getStorage('userInfoAuthorized', false),
      // 首次游玩标记
      hasPlayedBefore: getStorage('hasPlayedBefore', false)
    }
  }

  // 延迟批量写入 Storage（合并同一帧内的多次写入）
  _scheduleStorageWrite(key, value) {
    if (!this._pendingWrites) this._pendingWrites = new Map()
    this._pendingWrites.set(key, value)
    if (!this._storageFlushTimer) {
      this._storageFlushTimer = setTimeout(() => {
        this._flushStorageWrites()
      }, 16)  // 改为 16ms（约 1 帧），减少频繁写入
    }
  }

  // 立即执行所有待写入的 Storage 操作
  _flushStorageWrites() {
    if (this._storageFlushTimer) {
      clearTimeout(this._storageFlushTimer)
      this._storageFlushTimer = null
    }
    if (this._pendingWrites && this._pendingWrites.size > 0) {
      this._pendingWrites.forEach((value, key) => {
        setStorage(key, value)
      })
      this._pendingWrites.clear()
    }
  }

  // 重置游戏状态（开始新游戏）
  reset() {
    this.score = 0
    this.wave = 1
    this.lives = config.game.initialLives
    this.targets = []
    this.playerClicks = []
    this.phase = 'OBSERVE'
    this.activeWaveCompleted = false
    this.waveScore = 0
    this.consecutiveWins = 0
    this.purchaseCount = 0
    this.shareReviveCount = 0  // 重置分享复活次数
    this.adReviveCount = 0     // 重置广告复活次数
    this.sessionCoins = 0  // 重置会话金币
    this.isNewScoreRecord = false
    this.sessionStartHighScore = this.highScore
    this.sessionStartSeasonScore = this.seasonData.seasonScore
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
    this.isWaitingShareRevive = false  // 重置分享复活等待标志
    this.clearTimer()
  }
  
  // 标记已玩过（首次游戏结束后调用）
  markAsPlayed() {
    if (!this.hasPlayedBefore) {
      this.hasPlayedBefore = true
      setStorage('hasPlayedBefore', true)
    }
  }
  
  // 返回主菜单
  resetToMenu() {
    this.clearTimer()
    this.phase = 'MENU'
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
    // 不再同步待同步数据，数据只保存在本地
    // 注意：不重置 uiManager.currentScreen，由 Main.js 控制
  }

  // 设置计时器（interval 模式，duration 参数保留供未来使用）
  setTimer(callback, interval = 100) {
    this.clearTimer()
    this.timerInterval = setInterval(callback, interval)
    this.timerType = 'interval'
  }

  // 清除计时器
  clearTimer() {
    if (this.timerInterval) {
      safeCancelAnimationFrame(this.timerInterval)
      this.timerInterval = null
      this.timerType = null
    }
    // 先 flush 待执行的 Storage 写入，再清理定时器（防止数据丢失）
    this._flushStorageWrites()
  }

  // 本局得分是否破了历史最高分（与本局开始时记录比较）
  isNewHighScore() {
    return this.score > this.sessionStartHighScore
  }

  // 本局得分是否破了赛季最高记录（与本局开始时赛季记录比较）
  isNewSeasonRecord() {
    return this.score > this.sessionStartSeasonScore && this.sessionStartSeasonScore >= 0
  }

  // 保存最高分和最高关卡（本地存储，关卡结束后调用）
  saveHighScoreLocal() {
    let hasUpdate = false
    
    // 更新最高分
    if (this.score > this.highScore) {
      this.highScore = this.score
      setStorage('highScore', this.highScore)
      hasUpdate = true
    }
    
    // 更新最高关卡（只有成功通过的关卡才算）
    if (this.wave > this.bestWave) {
      this.bestWave = this.wave
      setStorage('bestWave', this.bestWave)
      hasUpdate = true
    }
    
    return hasUpdate
  }

  // 上报当前得分到微信排行榜（生命值耗尽时调用）
  reportScoreToLeaderboard() {
    if (this.friendLeaderboard) {
      // 上报当前得分（不是历史最高分）
      this.friendLeaderboard.syncScore(this.score).catch(err => {
        console.warn('微信排行榜上报失败:', err)
      })
    }
  }

  // 增加金币
  addCoins(amount) {
    const delta = Number(amount) || 0
    this.coins = Number(this.coins) + delta
    this._scheduleStorageWrite('coins', this.coins)
  }

  // 检查是否可以签到（用于 UI 显示红点）
  canCheckin() {
    const today = getTodayString()
    // 完全使用本地数据判断
    return this.lastCheckinDate !== today
  }

  // 检查是否可以看广告双倍签到
  canAdDoubleCheckin() {
    // 未使用过广告双倍签到即可（允许普通签到后再看广告）
    return !this.hasAdDoubleCheckinToday
  }

  // 更新今日是否已签到状态
  updateCheckinStatus() {
    const today = getTodayString()
    const isToday = (this.lastCheckinDate === today)
    this.hasCheckedInToday = isToday
    
    // 根据 lastCheckinType 恢复签到状态
    if (isToday) {
      this.hasNormalCheckinToday = (this.lastCheckinType !== 'ad')
      this.hasAdDoubleCheckinToday = (this.lastCheckinType === 'ad')
    } else {
      // 新的一天，重置所有签到状态
      this.hasNormalCheckinToday = false
      this.hasAdDoubleCheckinToday = false
    }
  }
  
  // 更新分享礼包状态（每天 0 点重置）
  updateShareGiftStatus() {
    const today = getTodayString()
    // 如果今天已经领取过，保持状态
    if (this.lastShareGiftDate === today) {
      this.hasSharedGiftToday = true
    } else {
      // 否则重置为未领取
      this.hasSharedGiftToday = false
    }
  }
  
  // 更新分享次数状态（每天 0 点重置）
  updateShareCountStatus() {
    const today = getTodayString()
    if (this.lastShareDate !== today) {
      // 新的一天，重置分享次数
      this.lastShareDate = today
      this.todayShareCount = 0
      setStorage('lastShareDate', today)
      setStorage('todayShareCount', 0)
    }
  }
  
  // 获取今日分享次数
  getTodayShareCount() {
    this.updateShareCountStatus()
    return this.todayShareCount
  }
  
  // 记录分享并发放奖励
  recordShare() {
    this.updateShareCountStatus()
    this.todayShareCount++
    this._scheduleStorageWrite('todayShareCount', this.todayShareCount)
    // 发放奖励金币
    this.addCoins(config.rewards.share)
    
    // 保存到云端
    this.saveToCloud().catch(() => {})
  }
  
  // 检查是否可以领取分享礼包
  canShareGift() {
    return !this.hasSharedGiftToday
  }
  
  // 执行分享礼包领取
  claimShareGift() {
    const today = getTodayString()
    this.lastShareGiftDate = today
    this.hasSharedGiftToday = true
    setStorage('lastShareGiftDate', today)
    
    // 奖励金币
    this.addCoins(config.rewards.shareGift)
    
    // 保存到云端
    this.saveToCloud().catch(() => {})
    
    return { type: 'coin', amount: config.rewards.shareGift }
  }

  // 执行签到（完全本地处理，不调用云函数）
  doLocalCheckin() {
    const today = getTodayString()
    const yesterday = getYesterdayString()
    
    // 检查今天是否已签到
    if (this.lastCheckinDate === today) {
      return null // 今天已签到
    }
    
    if (this.lastCheckinDate === yesterday) {
      // 连续签到
      this.checkinStreak++
    } else if (this.lastCheckinDate !== today) {
      // 中断后重新签到或首次签到
      this.checkinStreak = 1
    }
    
    this.lastCheckinDate = today
    this.lastCheckinType = 'normal'
    setStorage('lastCheckinDate', today)
    setStorage('checkinStreak', this.checkinStreak)
    setStorage('lastCheckinType', this.lastCheckinType)

    // 更新今日是否已签到状态
    this.hasCheckedInToday = true
    this.hasNormalCheckinToday = true
    
    // 根据签到天数给予基础奖励
    const reward = this.getTodayReward(this.checkinStreak)
    
    // bonus 单独计算（7 的倍数天额外奖励）
    const isBonusDay = (this.checkinStreak % config.checkin.bonusDay === 0)
    const bonusAmount = isBonusDay ? config.checkin.bonusAmount : 0
    const totalAmount = reward.amount + bonusAmount
    
    // 判断是金币还是宝石（第 2 天和第 5 天为宝石）
    const isGem = (this.checkinStreak === 2 || this.checkinStreak === 5)
    if (isGem) {
      return { type: 'gem', amount: totalAmount, baseReward: reward.amount, bonusReward: bonusAmount, isBonusDay }
    }
    this.addCoins(totalAmount)
    return { type: 'coin', amount: totalAmount, baseReward: reward.amount, bonusReward: bonusAmount, isBonusDay }
  }

  // 执行广告双倍签到（看广告后调用）
  doAdDoubleCheckin() {
    const today = getTodayString()
    const yesterday = getYesterdayString()
    
    // 检查是否可以使用广告双倍签到
    if (this.hasAdDoubleCheckinToday) {
      return null
    }
    
    // 判断是否已普通签到（决定给 1x 还是 2x）
    const hasNormalCheckin = this.hasNormalCheckinToday
    
    // 如果还没签到，更新连续签到天数
    if (!hasNormalCheckin) {
      if (this.lastCheckinDate === yesterday) {
        this.checkinStreak++
      } else if (this.lastCheckinDate !== today) {
        this.checkinStreak = 1
      }
      
      this.lastCheckinDate = today
      setStorage('lastCheckinDate', today)
      setStorage('checkinStreak', this.checkinStreak)
    }
    
    // 标记今天已使用广告双倍签到
    this.hasAdDoubleCheckinToday = true
    this.hasCheckedInToday = true
    
    // 根据签到天数给予基础奖励
    const reward = this.getTodayReward(this.checkinStreak)
    
    // bonus 单独计算（7 的倍数天额外奖励）
    const isBonusDay = (this.checkinStreak % config.checkin.bonusDay === 0)
    const bonusAmount = isBonusDay ? config.checkin.bonusAmount : 0
    
    // 已普通签到：补齐到 2 倍（再给 1x）；未签到：直接给 2 倍
    const multiplier = hasNormalCheckin ? 1 : 2
    const totalAmount = (reward.amount + bonusAmount) * multiplier
    
    // 判断是金币还是宝石（第 2 天和第 5 天为宝石）
    const isGem = (this.checkinStreak === 2 || this.checkinStreak === 5)
    
    // 广告签到也需要保存到云端（防篡改）
    this.saveToCloud().catch(() => {})
    
    if (isGem) {
      return { type: 'gem', amount: totalAmount, baseReward: reward.amount * multiplier, bonusReward: bonusAmount * multiplier, isBonusDay, isDouble: !hasNormalCheckin }
    }
    this.addCoins(totalAmount)
    return { type: 'coin', amount: totalAmount, baseReward: reward.amount * multiplier, bonusReward: bonusAmount * multiplier, isBonusDay, isDouble: !hasNormalCheckin }
  }

  // 获取当天签到基础奖励（不含 bonus，bonus 在签到时单独计算）
  getTodayReward(day = null) {
    const checkinDay = day !== null ? day : this.checkinStreak + 1
    
    // 基础奖励
    let baseReward = config.checkin.defaultBase
    if (config.checkin.rewards[checkinDay]) {
      baseReward = config.checkin.rewards[checkinDay].base
    }
    
    return {
      type: 'coin',
      amount: baseReward,
      baseReward: baseReward,
      bonusReward: 0,
      isBonusDay: false
    }
  }

  // 获取签到状态（完全本地判断，不调用云函数）
  getCheckinStatus() {
    const today = getTodayString()
    const localCanCheckin = (this.lastCheckinDate !== today)
    
    return {
      canCheckin: localCanCheckin,
      streak: this.checkinStreak,
      todayReward: this.getTodayReward(),
      cloudAvailable: false  // 使用本地数据
    }
  }

  // 购买生命
  canPurchaseLife() {
    return this.purchaseCount < config.game.maxPurchaseCount && this.coins >= this.getPurchasePrice()
  }

  // 获取当前购买价格
  getPurchasePrice() {
    return config.game.purchasePrices[this.purchaseCount] || 9999
  }

  // 执行购买生命
  purchaseLife() {
    const price = this.getPurchasePrice()
    if (this.canPurchaseLife()) {
      this.coins -= price
      this.lives++
      this.purchaseCount++
      this._scheduleStorageWrite('coins', this.coins)
      return true
    }
    return false
  }

  // 判断是否可使用分享复活
  canShareRevive() {
    return this.shareReviveCount < config.game.maxShareReviveCount
  }

  // 获取分享复活剩余次数
  getShareReviveRemaining() {
    return config.game.maxShareReviveCount - this.shareReviveCount
  }

  // 执行分享复活
  useShareRevive() {
    if (!this.canShareRevive()) return false
    
    this.shareReviveCount++
    if (this.lives < this.maxLives) {
      this.lives++
    }
    this._scheduleStorageWrite('shareReviveCount', this.shareReviveCount)
    return true
  }

  // 判断是否可使用广告复活
  canAdRevive() {
    return this.adReviveCount < config.game.maxAdReviveCount
  }

  // 获取广告复活剩余次数
  getAdReviveRemaining() {
    return config.game.maxAdReviveCount - this.adReviveCount
  }

  // 执行广告复活
  useAdRevive() {
    if (!this.canAdRevive()) return false
    
    this.adReviveCount++
    if (this.lives < this.maxLives) {
      this.lives++
    }
    this._scheduleStorageWrite('adReviveCount', this.adReviveCount)
    return true
  }

  // 增加连续胜利计数
  addConsecutiveWin() {
    this.consecutiveWins++
    // 每连续胜利 N 关，恢复 1 生命（不超过上限）
    if (this.consecutiveWins % config.rewards.consecutiveWin === 0 && this.lives < this.maxLives) {
      this.lives++
      return true // 返回 true 表示恢复了生命
    }
    return false
  }

  // 重置连续胜利计数（失败时调用）
  resetConsecutiveWins() {
    this.consecutiveWins = 0
  }

  // 获取当前关卡的网格大小
  getGridSize() {
    if (this.wave < 20) {
      return { cols: 4, rows: 4 }
    } else if (this.wave < 40) {
      return { cols: 5, rows: 5 }
    } else if (this.wave < 60) {
      return { cols: 6, rows: 6 }
    } else {
      return { cols: 7, rows: 7 }
    }
  }

  // 获取当前关卡的目标数量
  getTargetCount() {
    if (this.wave < 20) {
      // 1-19 关：2 个起始，每 3 关 +1，最多 7 个
      return Math.min(2 + Math.floor(this.wave / 3), 7)
    } else if (this.wave < 40) {
      // 20-39 关：7 个起始，每 5 关 +1，最多 9 个
      const stage = Math.floor((this.wave - 20) / 5)
      return Math.min(7 + stage, 9)
    } else if (this.wave < 60) {
      // 40-59 关：9 个起始，每 5 关 +1，最多 11 个
      const stage = Math.floor((this.wave - 40) / 5)
      return Math.min(9 + stage, 11)
    } else {
      // 60 关 +：11 个起始，每 5 关 +1，最多 13 个
      const stage = Math.floor((this.wave - 60) / 5)
      return Math.min(11 + stage, 13)
    }
  }

  // 获取当前关卡的通关奖励（金币）
  getWaveReward() {
    if (this.wave < 20) {
      return config.rewards.waveClear  // 5金币
    } else if (this.wave < 40) {
      return config.rewards.waveClearTier2  // 15金币
    } else if (this.wave < 60) {
      return config.rewards.waveClearTier3  // 30金币
    } else {
      return config.rewards.waveClearTier4  // 50金币
    }
  }

  // 获取观察时间（毫秒）
  getObserveDuration() {
    if (this.wave <= 20) {
      // 1-20 关：2500ms 起，每关 -25ms，最低 2000ms
      return Math.max(2000, 2500 - (this.wave - 1) * 25)
    } else if (this.wave <= 40) {
      // 21-40 关：2000ms 起，每关 -15ms，最低 1700ms
      return Math.max(1700, 2000 - (this.wave - 21) * 15)
    } else if (this.wave <= 60) {
      // 41-60 关：1700ms 起，每关 -10ms，最低 1500ms
      return Math.max(1500, 1700 - (this.wave - 41) * 10)
    } else {
      // 61+ 关：固定 2000ms（网格变大，需要更多观察时间）
      return 2000
    }
  }

  // 获取点击时间（毫秒）
  getPlayDuration() {
    if (this.wave <= 20) {
      // 1-20 关：5000ms 起，每关 -40ms，最低 4200ms
      return Math.max(4200, 5000 - (this.wave - 1) * 40)
    } else if (this.wave <= 40) {
      // 21-40 关：4200ms 起，每关 -30ms，最低 3600ms
      return Math.max(3600, 4200 - (this.wave - 21) * 30)
    } else if (this.wave <= 60) {
      // 41-60 关：3600ms 起，每关 -20ms，最低 3200ms
      return Math.max(3200, 3600 - (this.wave - 41) * 20)
    } else {
      // 61+ 关：固定 3500ms（网格变大，需要更多操作时间）
      return 3500
    }
  }

  // 重置关卡状态（新关卡开始时）
  resetWave() {
    this.waveScore = 0
    // 注意：purchaseCount 不在这里重置，它在整个游戏会话中累计
  }

  // 通用缓存+云端获取模式（减少重复代码）
  async _fetchWithCache(cacheKey, fetchFn, fallbackData, label) {
    // 尝试从缓存读取
    try {
      const cached = wx.getStorageSync(cacheKey)
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached
        const now = Date.now()
        if (parsed.timestamp && (now - parsed.timestamp) < parsed.expire) {
          console.log(`使用缓存的${label}数据`)
          return { success: true, data: parsed.data, fromCache: true }
        }
      }
    } catch (e) {
      console.warn(`读取${label}缓存失败:`, e)
    }

    // 缓存过期或无缓存，从云端获取
    if (wechatAPI.isCloudAvailable()) {
      try {
        const result = await fetchFn()
        if (result.success && result.data) {
          setStorage(cacheKey, {
            data: result.data,
            timestamp: Date.now(),
            expire: 1800000
          })
          return { success: true, data: result.data, fromCache: false }
        }
      } catch (err) {
        console.log(`获取云端${label}失败:`, err.message || err)
      }
    }

    // 返回 fallback 数据
    return { success: true, data: fallbackData, fromCache: false }
  }

  // 获取排行榜数据（云端 + 本地缓存）
  async getLeaderboard(type = 'score') {
    return this._fetchWithCache(
      `leaderboard_${type}_cache`,
      () => wechatAPI.getLeaderboard(type),
      { type, leaderboard: [], userRank: 0, userValue: 0 },
      '排行榜'
    )
  }
  
  // 保存用户信息到本地
  saveUserProfileLocally(nickname, avatarUrl) {
    this.userInfo.nickname = nickname
    this.userInfo.avatarUrl = avatarUrl
    this.userInfo.authorized = true
    
    setStorage('nickname', nickname)
    setStorage('avatarUrl', avatarUrl)
    setStorage('userInfoAuthorized', true)
  }

  /**
   * 保存用户信息到云端（仅在授权时调用）
   */
  async saveUserProfileToCloud() {
    if (!wechatAPI.isCloudAvailable()) {
      console.log('云开发不可用，跳过保存用户信息')
      return
    }

    try {
      console.log('保存用户信息到云端:', {
        nickname: this.userInfo.nickname,
        avatarUrl: this.userInfo.avatarUrl ? this.userInfo.avatarUrl.substring(0, 50) + '...' : 'null'
      })
      
      const saveData = {
        nickname: this.userInfo.nickname || '',
        avatarUrl: this.userInfo.avatarUrl || ''
      }

      // 同时传入赛季数据，确保 seasonRecords 中的昵称/头像也被更新
      if (this.seasonInfo && this.seasonInfo.currentSeasonId) {
        saveData.seasonId = this.seasonInfo.currentSeasonId
        saveData.seasonScore = this.seasonData.seasonScore || 0
        saveData.seasonWave = this.seasonData.seasonWave || 0
      }

      const result = await wechatAPI.saveGameData(saveData)
      console.log('用户信息保存到云端结果:', JSON.stringify(result))
    } catch (err) {
      console.log('保存用户信息到云端失败:', err.message || err)
    }
  }

  /**
   * 初始化赛季信息
   */
  initSeasonInfo() {
    const { seasonId, seasonStart, seasonEnd } = getSeasonCycle(new Date())
    this.seasonInfo = {
      currentSeasonId: seasonId,
      seasonStartTime: seasonStart.getTime(),
      seasonEndTime: seasonEnd.getTime(),
      timeRemaining: Math.max(0, seasonEnd.getTime() - Date.now())
    }
  }
  
  /**
   * 获取赛季排行榜数据（云端 + 本地缓存）
   * @param {string} type - 数据类型：'score' 或 'wave'
   * @returns {Promise<Object>} 赛季数据
   */
  async getSeasonData(type = 'score') {
    return this._fetchWithCache(
      `season_leaderboard_${type}_cache`,
      () => wechatAPI.getSeasonLeaderboard(type),
      {
        type,
        seasonId: this.seasonInfo.currentSeasonId,
        seasonStartTime: this.seasonInfo.seasonStartTime,
        seasonEndTime: this.seasonInfo.seasonEndTime,
        leaderboard: [],
        userRank: 0,
        userValue: 0,
        userStats: { totalGames: 0, totalClears: 0, bestStreak: 0 }
      },
      '赛季排行榜'
    )
  }
  
  /**
   * 获取历史赛季排行榜数据
   * @param {string} seasonId - 赛季 ID
   * @param {string} type - 数据类型：'score' 或 'wave'
   * @returns {Promise<Object>} 历史赛季数据
   */
  async getSeasonArchive(seasonId, type = 'score') {
    return this._fetchWithCache(
      `season_archive_${seasonId}_${type}_cache`,
      () => wechatAPI.getSeasonArchive(seasonId, type),
      {
        seasonId,
        type,
        leaderboard: [],
        totalParticipants: 0,
        settledAt: null
      },
      `历史赛季 ${seasonId}`
    )
  }
  
  /**
   * 递增赛季参与局数（开始新游戏时调用）
   */
  incrementSeasonGames() {
    this.seasonData.totalGames = (this.seasonData.totalGames || 0) + 1
  }

  /**
   * 更新赛季数据（本地更新）
   * @param {number} score - 当前得分
   * @param {number} wave - 当前关卡
   * @param {number} clears - 通关次数
   * @param {number} streak - 连胜次数
   */
  updateSeasonDataLocal(score, wave, clears, streak) {
    // 只更新本地数据
    this.seasonData.seasonScore = Math.max(this.seasonData.seasonScore, score)
    this.seasonData.seasonWave = Math.max(this.seasonData.seasonWave, wave)
    this.seasonData.totalClears = (this.seasonData.totalClears || 0) + (clears || 0)
    this.seasonData.bestStreak = Math.max(this.seasonData.bestStreak, streak || 0)
  }
  
  /**
   * 获取赛季倒计时字符串
   * @returns {string} 倒计时字符串
   */
  getSeasonCountdownText() {
    return formatSeasonCountdown()
  }
  
  /**
   * 获取赛季剩余时间（毫秒）
   * @returns {number} 剩余时间（毫秒）
   */
  getSeasonTimeRemaining() {
    return getSeasonTimeRemaining()
  }

  /**
   * 检测是否有待显示的赛季奖励
   * @returns {Object|null} 奖励信息，如果没有则返回 null
   */
  checkPendingSeasonReward() {
    if (this.seasonData.lastSeasonReward > 0) {
      return {
        seasonId: this.seasonData.lastSeasonId,
        reward: this.seasonData.lastSeasonReward,
        scoreRank: this.seasonData.lastSeasonScoreRank,
        waveRank: this.seasonData.lastSeasonWaveRank,
        detail: this.seasonData.lastSeasonRewardDetail
      }
    }
    return null
  }

  /**
   * 清除赛季奖励标记（显示后调用，避免重复提示）
   */
  clearSeasonReward() {
    this.seasonData.lastSeasonReward = 0
    this.seasonData.lastSeasonId = ''
    this.seasonData.lastSeasonScoreRank = 0
    this.seasonData.lastSeasonWaveRank = 0
    this.seasonData.lastSeasonRewardDetail = null
    // 同步到云端，标记已显示
    this.saveToCloud().catch(() => {})
  }

  // ========== 云端同步 ==========

  /**
   * 从云端加载数据并与本地合并（游戏启动时调用）
   * 策略：高分/高关卡取较大值，金币取较大值，签到以云端为准
   */
  async loadCloudData() {
    if (!wechatAPI.isCloudAvailable()) {
      console.log('云开发不可用，使用本地数据')
      return
    }

    try {
      const result = await wechatAPI.loadGameData()
      if (!result.success || !result.data) {
        console.log('云端无数据，尝试主动初始化')
        // 方案 3：前端主动初始化兜底
        this.saveToCloud().catch(err => {
          console.warn('前端主动初始化云端数据失败:', err.message || err)
        })
        return
      }

      const cloud = result.data
      let updated = false

      // 用户信息（昵称、头像）以云端为准
      if (cloud.nickname && cloud.nickname !== this.userInfo.nickname) {
        this.userInfo.nickname = cloud.nickname
        this._scheduleStorageWrite('nickname', cloud.nickname)
        updated = true
      }
      if (cloud.avatarUrl && cloud.avatarUrl !== this.userInfo.avatarUrl) {
        this.userInfo.avatarUrl = cloud.avatarUrl
        this._scheduleStorageWrite('avatarUrl', cloud.avatarUrl)
        updated = true
      }
      // 如果云端有头像，标记为已授权
      if (cloud.avatarUrl) {
        this.userInfo.authorized = true
        this._scheduleStorageWrite('userInfoAuthorized', true)
        console.log('用户已授权，使用云端头像')
      }

      // 金币取较大值
      if (typeof cloud.coins === 'number' && cloud.coins > this.coins) {
        this.coins = cloud.coins
        this._scheduleStorageWrite('coins', this.coins)
        updated = true
      }

      // 最高分取较大值
      if (typeof cloud.highScore === 'number' && cloud.highScore > this.highScore) {
        this.highScore = cloud.highScore
        this._scheduleStorageWrite('highScore', this.highScore)
        updated = true
      }

      // 最高关卡取较大值
      if (typeof cloud.bestWave === 'number' && cloud.bestWave > this.bestWave) {
        this.bestWave = cloud.bestWave
        this._scheduleStorageWrite('bestWave', this.bestWave)
        updated = true
      }

      // 签到数据以云端为准（防篡改）
      if (cloud.lastCheckinDate && cloud.lastCheckinDate !== this.lastCheckinDate) {
        this.lastCheckinDate = cloud.lastCheckinDate
        this._scheduleStorageWrite('lastCheckinDate', this.lastCheckinDate)
        updated = true
      }
      if (typeof cloud.checkinStreak === 'number' && cloud.checkinStreak !== this.checkinStreak) {
        this.checkinStreak = cloud.checkinStreak
        this._scheduleStorageWrite('checkinStreak', this.checkinStreak)
        updated = true
      }
      if (cloud.lastCheckinType && cloud.lastCheckinType !== this.lastCheckinType) {
        this.lastCheckinType = cloud.lastCheckinType
        this._scheduleStorageWrite('lastCheckinType', this.lastCheckinType)
        updated = true
      }

      // 分享数据以云端为准
      if (cloud.lastShareDate) {
        this.lastShareDate = cloud.lastShareDate
        this._scheduleStorageWrite('lastShareDate', this.lastShareDate)
      }
      if (typeof cloud.todayShareCount === 'number') {
        this.todayShareCount = cloud.todayShareCount
        this._scheduleStorageWrite('todayShareCount', this.todayShareCount)
      }
      if (cloud.lastShareGiftDate) {
        this.lastShareGiftDate = cloud.lastShareGiftDate
        this._scheduleStorageWrite('lastShareGiftDate', this.lastShareGiftDate)
      }

      // 加载赛季数据（修复：从云端加载赛季数据，支持跨会话累积）
      if (cloud.seasonId === this.seasonInfo.currentSeasonId) {
        if (typeof cloud.seasonScore === 'number' && cloud.seasonScore > this.seasonData.seasonScore) {
          this.seasonData.seasonScore = cloud.seasonScore
          updated = true
        }
        if (typeof cloud.seasonWave === 'number' && cloud.seasonWave > this.seasonData.seasonWave) {
          this.seasonData.seasonWave = cloud.seasonWave
          updated = true
        }
        if (typeof cloud.totalGames === 'number' && cloud.totalGames > this.seasonData.totalGames) {
          this.seasonData.totalGames = cloud.totalGames
          updated = true
        }
        if (typeof cloud.totalClears === 'number' && cloud.totalClears > this.seasonData.totalClears) {
          this.seasonData.totalClears = cloud.totalClears
          updated = true
        }
        if (typeof cloud.bestStreak === 'number' && cloud.bestStreak > this.seasonData.bestStreak) {
          this.seasonData.bestStreak = cloud.bestStreak
          updated = true
        }
      }

      // 新增：加载赛季奖励数据
      if (typeof cloud.lastSeasonReward === 'number' && cloud.lastSeasonReward > 0) {
        this.seasonData.lastSeasonReward = cloud.lastSeasonReward
        this.seasonData.lastSeasonId = cloud.lastSeasonId || ''
        this.seasonData.lastSeasonScoreRank = cloud.lastSeasonScoreRank || 0
        this.seasonData.lastSeasonWaveRank = cloud.lastSeasonWaveRank || 0
        this.seasonData.lastSeasonRewardDetail = cloud.lastSeasonRewardDetail || null
        updated = true
      }

      // 刷新状态
      this.updateCheckinStatus()
      this.updateShareCountStatus()
      this.updateShareGiftStatus()

      if (updated) {
        console.log('云端数据已合并到本地')
      }

      // 检测赛季变更，触发上赛季结算
      this.checkAndSettleSeason()
    } catch (err) {
      console.log('加载云端数据失败（不影响游戏）:', err.message || err)
    }
  }

  /**
   * 保存当前数据到云端（在点击"返回首页"时调用）
   * 始终保存完整数据，确保云端数据与本地同步
   */
  async saveToCloud() {
    if (!wechatAPI.isCloudAvailable()) {
      console.log('云开发不可用，跳过保存')
      return
    }

    try {
      const saveData = {
        coins: this.coins,
        highScore: this.highScore,
        bestWave: this.bestWave,
        lastCheckinDate: this.lastCheckinDate,
        checkinStreak: this.checkinStreak,
        lastCheckinType: this.lastCheckinType || '',
        lastShareDate: this.lastShareDate,
        todayShareCount: this.todayShareCount,
        lastShareGiftDate: this.lastShareGiftDate,
        seasonId: this.seasonInfo.currentSeasonId,
        seasonScore: this.seasonData.seasonScore,
        seasonWave: this.seasonData.seasonWave,
        totalGames: this.seasonData.totalGames,
        totalClears: this.seasonData.totalClears,
        bestStreak: this.seasonData.bestStreak,
        nickname: this.userInfo.nickname || '',
        avatarUrl: this.userInfo.avatarUrl || ''
      }
      
      console.log('准备保存到云端（游戏数据）')
      
      const result = await wechatAPI.saveGameData(saveData)
      console.log('保存到云端结果:', JSON.stringify(result))
    } catch (err) {
      console.warn('保存到云端失败（不影响游戏）:', err.message || err)
    }
  }

  /**
   * 检测赛季变更，触发上赛季结算
   * 新赛季首次进入游戏时调用
   */
  async checkAndSettleSeason() {
    if (!wechatAPI.isCloudAvailable()) return

    const lastSeasonId = getStorage('lastSeasonId', '')
    const currentSeasonId = this.seasonInfo.currentSeasonId

    // 首次记录或赛季未变更
    if (!lastSeasonId || lastSeasonId === currentSeasonId) {
      // 仅记录当前赛季
      if (!lastSeasonId) {
        setStorage('lastSeasonId', currentSeasonId)
      }
      return
    }

    // 赛季变更，结算上赛季
    console.warn(`检测到赛季变更: ${lastSeasonId} → ${currentSeasonId}，开始结算上赛季`)

    try {
      const result = await wechatAPI.settleSeason(lastSeasonId)
      if (result.success) {
        console.log(`赛季 ${lastSeasonId} 结算完成:`, result.data)
      } else {
        console.log(`赛季 ${lastSeasonId} 结算失败:`, result.error)
      }
    } catch (err) {
      console.log(`赛季结算异常（不影响游戏）:`, err.message || err)
    }

    // 修复：赛季变更时主动清除旧赛季的缓存，确保新赛季看到最新数据
    try {
      wx.removeStorageSync(`season_leaderboard_score_cache`)
      wx.removeStorageSync(`season_leaderboard_wave_cache`)
      console.log('已清除赛季排行榜缓存')
    } catch (e) {
      console.warn('清除赛季排行榜缓存失败:', e)
    }

    // 更新本地记录的赛季 ID
    setStorage('lastSeasonId', currentSeasonId)
  }

  /**
   * 云端签到（服务端校验，防篡改）
   * 签到成功时自动更新本地数据
   * @param {boolean} isAd - 是否通过广告签到
   */
  async doCloudCheckin(isAd = false) {
    const today = getTodayString()

    // 普通签到：今天已签到则直接返回
    if (!isAd && this.lastCheckinDate === today) {
      return null
    }

    // 广告签到：今天已广告签到则返回
    if (isAd && this.lastCheckinType === 'ad') {
      return null
    }

    if (!wechatAPI.isCloudAvailable()) {
      // 云端不可用，降级到本地签到
      return this.doLocalCheckin()
    }

    try {
      const result = await wechatAPI.cloudCheckin(isAd)
      if (!result.success) {
        console.warn('云端签到失败:', result.error)
        // 如果是"今天已签到"，同步本地状态
        if (result.error === '今天已签到') {
          this.lastCheckinDate = today
          setStorage('lastCheckinDate', today)
          this.hasCheckedInToday = true
          this.hasNormalCheckinToday = true
        }
        return null
      }

      const data = result.data
      // 用服务端返回的数据更新本地
      this.coins = data.coins
      this.checkinStreak = data.checkinStreak
      this.lastCheckinDate = data.lastCheckinDate
      this.lastCheckinType = data.lastCheckinType || (isAd ? 'ad' : 'normal')
      this.hasCheckedInToday = true
      if (!isAd) {
        this.hasNormalCheckinToday = true
      } else {
        this.hasAdDoubleCheckinToday = true
      }

      setStorage('coins', this.coins)
      setStorage('checkinStreak', this.checkinStreak)
      setStorage('lastCheckinDate', this.lastCheckinDate)
      setStorage('lastCheckinType', this.lastCheckinType)

      return data.reward
    } catch (err) {
      console.warn('云端签到异常，降级到本地签到:', err.message || err)
      return this.doLocalCheckin()
    }
  }

  /**
   * 获取好友排行榜数据
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Object>} - { success, data, message, fromCache }
   */
  async getFriendLeaderboard(forceRefresh = false) {
    if (!this.friendLeaderboard) {
      return {
        success: false,
        message: '好友排行榜未初始化'
      }
    }

    return await this.friendLeaderboard.getLeaderboard(forceRefresh)
  }

  /**
   * 清除好友排行榜缓存
   */
  clearFriendLeaderboard() {
    if (this.friendLeaderboard) {
      this.friendLeaderboard.clearData()
    }
  }
}