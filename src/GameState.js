import { getStorage, setStorage } from './utils.js'
import { getTodayString, getYesterdayString, safeCancelAnimationFrame } from './utils.js'
import { config } from './config.js'
import { getSeasonCycle, getSeasonTimeRemaining, formatSeasonCountdown } from './seasonUtils.js'
import { wechatAPI } from './WechatAPI.js'

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
    this.phase = 'MENU'     // 'MENU' | 'OBSERVE' | 'PLAY' | 'WIN' | 'FAIL'
    
    // 计时器
    this.soundEnabled = true
    this.observeDuration = 1500  // 观察阶段时长（毫秒）
    this.playDuration = 4000     // 游戏阶段时长（毫秒）
    this.timerInterval = null
    this.timerType = null        // 'raf' | 'interval' | null
    this.timerRemaining = 0
    this.activeWaveCompleted = false
    
    // 暂停状态
    this.isPaused = false
    this.pausedPhase = null      // 暂停时的阶段
    this.pausedTimerRemaining = 0 // 暂停时的剩余时间

    // 签到数据
    this.lastCheckinDate = saved.lastCheckinDate
    this.checkinStreak = saved.checkinStreak
    this.hasCheckedInToday = false  // 当前是否已签到
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
    this.sessionCoins = 0        // 本次游戏会话获得的金币（不包含初始 1000）
    this.hasShownRecordBreakModal = false  // 本局是否已显示破纪录弹窗
    this.isNewScoreRecord = false        // 本次结算是否破了最高分纪录
    this.sessionStartHighScore = this.highScore  // 本局开始时的历史最高分
    
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
      authorized: getStorage('userInfoAuthorized', false)
    }
  }

  // 延迟批量写入 Storage（合并同一帧内的多次写入）
  _scheduleStorageWrite(key, value) {
    if (!this._pendingWrites) this._pendingWrites = new Map()
    this._pendingWrites.set(key, value)
    if (!this._storageFlushTimer) {
      this._storageFlushTimer = setTimeout(() => {
        this._flushStorageWrites()
      }, 0)
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
    this.sessionCoins = 0  // 重置会话金币
    this.hasShownRecordBreakModal = false  // 重置破纪录弹窗标志
    this.isNewScoreRecord = false
    this.sessionStartHighScore = this.highScore
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
    this.clearTimer()
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
  }

  // 本局得分是否破了历史最高分（与本局开始时记录比较）
  isNewHighScore() {
    return this.score > this.sessionStartHighScore
  }

  // 保存最高分和最高关卡（关卡结束后调用）
  async saveHighScore() {
    let hasUpdate = false
    
    // 更新最高分
    if (this.score > this.highScore) {
      this.highScore = this.score
      setStorage('highScore', this.highScore)
      hasUpdate = true
    }
    
    // 更新最高关卡（只有成功通过的关卡才算）
    if (this.phase === 'WIN' && this.wave > this.bestWave) {
      this.bestWave = this.wave
      setStorage('bestWave', this.bestWave)
      hasUpdate = true
    }
    
    return hasUpdate
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

  // 更新今日是否已签到状态
  updateCheckinStatus() {
    const today = getTodayString()
    this.hasCheckedInToday = (this.lastCheckinDate === today)
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
    setStorage('lastCheckinDate', today)
    setStorage('checkinStreak', this.checkinStreak)
    
    // 更新今日是否已签到状态
    this.hasCheckedInToday = true
    
    // 根据签到天数给予奖励（传入当前签到天数，而非 +1）
    const reward = this.getTodayReward(this.checkinStreak)
    
    // 判断是金币还是宝石（第 2 天和第 5 天为宝石）
    const isGem = (this.checkinStreak === 2 || this.checkinStreak === 5)
    if (isGem) {
      return { type: 'gem', amount: reward.amount }
    }
    this.addCoins(reward.amount)
    return { type: 'coin', amount: reward.amount }
  }

  // 获取当天签到奖励（新规则：纯金币模式）
  getTodayReward(day = null) {
    const checkinDay = day !== null ? day : this.checkinStreak + 1
    
    // 基础奖励
    let baseReward = config.checkin.defaultBase
    if (config.checkin.rewards[checkinDay]) {
      baseReward = config.checkin.rewards[checkinDay].base
    }
    
    // N 的倍数天额外奖励
    const bonusReward = (checkinDay % config.checkin.bonusDay === 0) ? config.checkin.bonusAmount : 0
    
    return {
      type: 'coin',
      amount: baseReward + bonusReward,
      baseReward: baseReward,
      bonusReward: bonusReward,
      isBonusDay: bonusReward > 0
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

  // 获取观察时间（毫秒）
  getObserveDuration() {
    if (this.wave < 20) {
      // 1-19 关：2000ms 起，每关 -50ms，最少 1200ms
      return Math.max(1200, 2000 - (this.wave - 1) * 50)
    } else if (this.wave < 40) {
      // 20-39 关：2000ms 起，每关 -30ms，最少 1400ms
      return Math.max(1400, 2000 - (this.wave - 1) * 30)
    } else if (this.wave < 60) {
      // 40-59 关：2000ms 起，每关 -20ms，最少 1800ms
      return Math.max(1800, 2000 - (this.wave - 1) * 20)
    } else {
      // 60+ 关：2000ms 起，每关 -15ms，最少 1900ms
      return Math.max(1900, 2000 - (this.wave - 1) * 15)
    }
  }

  // 获取点击时间（毫秒）
  getPlayDuration() {
    if (this.wave < 20) {
      // 1-19 关：4500ms 起，每关 -80ms，最少 3000ms
      return Math.max(3000, 4500 - (this.wave - 1) * 80)
    } else if (this.wave < 40) {
      // 20-39 关：4500ms 起，每关 -50ms，最少 3200ms
      return Math.max(3200, 4500 - (this.wave - 1) * 50)
    } else if (this.wave < 60) {
      // 40-59 关：4500ms 起，每关 -35ms，最少 3800ms
      return Math.max(3800, 4500 - (this.wave - 1) * 35)
    } else {
      // 60+ 关：4500ms 起，每关 -25ms，最少 4100ms
      return Math.max(4100, 4500 - (this.wave - 1) * 25)
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
      console.log(`读取${label}缓存失败:`, e)
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
      
      const result = await wechatAPI.saveGameData({
        nickname: this.userInfo.nickname || '',
        avatarUrl: this.userInfo.avatarUrl || ''
      })
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
        console.log('云端无数据，使用本地数据')
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
        lastShareDate: this.lastShareDate,
        todayShareCount: this.todayShareCount,
        lastShareGiftDate: this.lastShareGiftDate,
        seasonId: this.seasonInfo.currentSeasonId,
        seasonScore: this.seasonData.seasonScore,
        seasonWave: this.seasonData.seasonWave,
        totalGames: this.seasonData.totalGames,
        totalClears: this.seasonData.totalClears,
        bestStreak: this.seasonData.bestStreak,
        // 注意：昵称和头像只在授权时保存，这里不主动保存
        // nickname: this.userInfo.nickname || '',
        // avatarUrl: this.userInfo.avatarUrl || ''
      }
      
      console.log('准备保存到云端（游戏数据）')
      
      const result = await wechatAPI.saveGameData(saveData)
      console.log('保存到云端结果:', JSON.stringify(result))
    } catch (err) {
      console.log('保存到云端失败（不影响游戏）:', err.message || err)
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
    console.log(`检测到赛季变更: ${lastSeasonId} → ${currentSeasonId}，开始结算上赛季`)

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

    // 更新本地记录的赛季 ID
    setStorage('lastSeasonId', currentSeasonId)
  }

  /**
   * 云端签到（服务端校验，防篡改）
   * 签到成功时自动更新本地数据
   */
  async doCloudCheckin() {
    // 先做本地快速校验
    const today = getTodayString()
    if (this.lastCheckinDate === today) {
      return null // 今天已签到
    }

    if (!wechatAPI.isCloudAvailable()) {
      // 云端不可用，降级到本地签到
      return this.doLocalCheckin()
    }

    try {
      const result = await wechatAPI.cloudCheckin()
      if (!result.success) {
        console.log('云端签到失败:', result.error)
        // 如果是"今天已签到"，同步本地状态
        if (result.error === '今天已签到') {
          this.lastCheckinDate = today
          setStorage('lastCheckinDate', today)
          this.hasCheckedInToday = true
        }
        return null
      }

      const data = result.data
      // 用服务端返回的数据更新本地
      this.coins = data.coins
      this.checkinStreak = data.checkinStreak
      this.lastCheckinDate = data.lastCheckinDate
      this.hasCheckedInToday = true

      setStorage('coins', this.coins)
      setStorage('checkinStreak', this.checkinStreak)
      setStorage('lastCheckinDate', this.lastCheckinDate)

      return data.reward
    } catch (err) {
      console.log('云端签到异常，降级到本地签到:', err.message || err)
      return this.doLocalCheckin()
    }
  }
}