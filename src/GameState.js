import { getStorage, setStorage } from './utils.js'
import { getTodayString, getYesterdayString, safeCancelAnimationFrame } from './utils.js'
import { config } from './config.js'
import { getSeasonCycle, getSeasonTimeRemaining, formatSeasonCountdown } from './seasonUtils.js'

/**
 * 游戏状态管理
 */
export class GameState {
  constructor() {
    // 玩家数据
    this.score = 0
    this.highScore = Number(getStorage('highScore', 0)) || 0
    this.bestWave = Number(getStorage('bestWave', 0)) || 0
    this.coins = Number(getStorage('coins', config.game.initialCoins)) || config.game.initialCoins
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
    this.lastCheckinDate = getStorage('lastCheckinDate', '')
    this.checkinStreak = getStorage('checkinStreak', 0)
    this.hasCheckedInToday = false  // 当前是否已签到
    this.hasSharedGiftToday = false  // 今天是否已领取分享礼包
    // 初始化时检查今天是否已领取
    this.updateShareGiftStatus()
    
    // 分享次数数据（用于限制每日分享刷金币）
    this.lastShareDate = getStorage('lastShareDate', '')
    this.todayShareCount = getStorage('todayShareCount', 0)
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
    
    // 排行榜缓存
    this.leaderboardCache = {
      score: { data: null, timestamp: 0, expire: 1800000 },  // 30 分钟缓存
      wave: { data: null, timestamp: 0, expire: 1800000 }    // 30 分钟缓存
    }
    
    // 赛季排名缓存（30 分钟）
    this.seasonLeaderboardCache = {
      score: { data: null, timestamp: 0, expire: 1800000 },  // 30 分钟缓存
      wave: { data: null, timestamp: 0, expire: 1800000 }    // 30 分钟缓存
    }
    
    // 用户信息
    this.userInfo = {
      nickname: getStorage('nickname', ''),
      avatarUrl: getStorage('avatarUrl', ''),
      authorized: getStorage('userInfoAuthorized', false)
    }
    
    // 签到状态缓存（5 分钟）
    this.checkinStatusCache = {
      data: null,
      timestamp: 0
    }
    this.checkinCacheDuration = 300000 // 5 分钟缓存
    
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

  // 设置计时器
  setTimer(callback, duration) {
    this.clearTimer()
    this.timerInterval = setInterval(callback, 30)
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
    return Number(this.score) > Number(this.sessionStartHighScore)
  }

  // 保存最高分和最高关卡（关卡结束后调用）
  async saveHighScore() {
    let hasUpdate = false
    
    // 更新最高分
    if (Number(this.score) > Number(this.highScore)) {
      this.highScore = Number(this.score)
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
    setStorage('coins', this.coins)
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
    setStorage('todayShareCount', this.todayShareCount)
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
    
    // 根据签到天数给予奖励
    const reward = this.getTodayReward()
    
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
      setStorage('coins', this.coins)
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
      // 1-19 关：2000ms 起，每关 -100ms，最少 1000ms
      return Math.max(1000, 2000 - (this.wave * 100))
    } else {
      // 20 关 +：2000ms 起，每关 -25ms，最少 1000ms
      return Math.max(1000, 2000 - (this.wave * 25))
    }
  }

  // 获取点击时间（毫秒）
  getPlayDuration() {
    if (this.wave < 20) {
      // 1-19 关：4500ms 起，每关 -150ms，最少 2500ms
      return Math.max(2500, 4500 - (this.wave * 150))
    } else {
      // 20 关 +：4500ms 起，每关 -50ms，最少 1500ms
      return Math.max(1500, 4500 - (this.wave * 50))
    }
  }

  // 重置关卡状态（新关卡开始时）
  resetWave() {
    this.waveScore = 0
    // 注意：purchaseCount 不在这里重置，它在整个游戏会话中累计
  }

  // 获取排行榜数据（本地版本，无云端数据）
  async getLeaderboard(type = 'score') {
    // 纯本地模式，返回空排行榜
    return {
      success: true,
      data: {
        type,
        leaderboard: [],
        userRank: 0,
        userValue: 0
      },
      fromCache: false
    }
  }
  
  /**
   * 清除排行榜缓存
   */
  clearLeaderboardCache() {
    this.leaderboardCache.score.data = null
    this.leaderboardCache.score.timestamp = 0
    this.leaderboardCache.wave.data = null
    this.leaderboardCache.wave.timestamp = 0
    console.log('排行榜缓存已清除')
  }

  // 获取用户信息授权
  async getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料，在排行榜中展示',
        success: (res) => {
          resolve(res.userInfo)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
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
   * 获取赛季数据（本地版本，无云端数据）
   * @param {string} type - 数据类型：'score' 或 'wave'
   * @returns {Promise<Object>} 赛季数据
   */
  async getSeasonData(type = 'score') {
    // 纯本地模式，返回空赛季数据
    return {
      success: true,
      data: {
        type,
        seasonId: this.seasonInfo.currentSeasonId,
        seasonStartTime: this.seasonInfo.seasonStartTime,
        seasonEndTime: this.seasonInfo.seasonEndTime,
        leaderboard: [],
        userRank: 0,
        userValue: 0,
        userStats: {
          totalGames: 0,
          totalClears: 0,
          bestStreak: 0
        }
      },
      fromCache: false
    }
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
}
