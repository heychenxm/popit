import { getStorage, setStorage } from './utils.js'
import { getTodayString, getYesterdayString, safeCancelAnimationFrame } from './utils.js'
import { config } from './config.js'
import { cloudDataManager } from './CloudDataManager.js'
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
    
    // 云端数据同步标志（已移除，不再使用）
    this.cloudSynced = false
    this.cloudAvailable = true
    
    // 有待同步的数据标志（用于排行榜同步判断）
    this.pendingCloudSync = false
    
    // 排行榜缓存
    this.leaderboardCache = {
      score: { data: null, timestamp: 0, expire: 1800000 },  // 30 分钟缓存（从 600000 改为 1800000）
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

  // 同步云端数据
  // 优化：本地优先策略，云端数据仅作为备份
  async syncCloudData() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: {
          action: 'sync',
          highestWave: this.bestWave,
          highestScore: this.highScore,
          coins: this.coins,
          gems: 0
        }
      })
      
      if (result.result.success) {
        const cloudData = result.result.data
        
        // 本地优先策略：只在本地数据为空时才使用云端数据
        if (cloudData.profile) {
          // 只有当本地数据为 0 时，才使用云端数据
          if (this.bestWave === 0 && cloudData.profile.highestWave > 0) {
            this.bestWave = cloudData.profile.highestWave
          }
          if (this.highScore === 0 && cloudData.profile.highestScore > 0) {
            this.highScore = cloudData.profile.highestScore
          }
          if (this.coins === 0 && cloudData.profile.coins > 0) {
            this.coins = cloudData.profile.coins
          }
        }
        
        // 签到数据：本地优先，云端作为备份
        if (cloudData.signin && !this.lastCheckinDate) {
          this.lastCheckinDate = cloudData.signin.lastCheckinDate || ''
          this.checkinStreak = cloudData.signin.checkinStreak || 0
        }
        
        // 分享礼包数据：本地优先
        if (cloudData.shareGift && !this.lastShareGiftDate) {
          this.lastShareGiftDate = cloudData.shareGift.lastShareGiftDate || ''
        }
        
        // 保存到本地
        setStorage('highScore', this.highScore)
        setStorage('bestWave', this.bestWave)
        setStorage('coins', this.coins)
        setStorage('lastCheckinDate', this.lastCheckinDate)
        setStorage('checkinStreak', this.checkinStreak)
        
        // 更新今日是否已签到状态
        this.updateCheckinStatus()
        
        // 更新分享礼包状态
        this.updateShareGiftStatus()
        
        this.cloudSynced = true
        this.cloudAvailable = true
        
        return true
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      // 云端同步失败不影响游戏运行
      this.cloudAvailable = false
      return {
        success: false,
        message: '云端同步失败，使用本地数据',
        cloudAvailable: false
      }
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
  // 完全本地保存，不同步到云端
  async saveHighScore() {
    let hasUpdate = false
    
    // 更新最高分
    if (Number(this.score) > Number(this.highScore)) {
      this.highScore = Number(this.score)
      setStorage('highScore', this.highScore)
      hasUpdate = true
    }
    
    // 更新最高关卡（只有成功通过的关卡才算）
    // 注意：这里只在胜利时更新，失败时不更新
    if (this.phase === 'WIN' && this.wave > this.bestWave) {
      this.bestWave = this.wave
      setStorage('bestWave', this.bestWave)
      hasUpdate = true
    }
    
    // 标记有待同步的数据（只在打开排行榜时同步）
    if (hasUpdate) {
      this.pendingCloudSync = true
    }
  }

  // 增加金币
  addCoins(amount) {
    const delta = Number(amount) || 0
    this.coins = Number(this.coins) + delta
    this.sessionCoins += delta
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

  // 获取排行榜数据（带缓存）
  async getLeaderboard(type = 'score') {
    const cache = this.leaderboardCache[type]
    const now = Date.now()
    
    // 检查缓存是否有效（30 分钟）
    if (cache && cache.data && (now - cache.timestamp) < cache.expire) {
      console.log(`使用排行榜缓存 (${type})`)
      return {
        success: true,
        data: cache.data,
        fromCache: true
      }
    }
    
    // 缓存无效，调用云端获取最新数据
    try {
      const result = await wx.cloud.callFunction({
        name: 'getLeaderboard',
        data: { type }
      })
      
      if (result.result.success) {
        // 更新缓存
        if (cache) {
          cache.data = result.result.data
          cache.timestamp = now
        }
        
        return {
          success: true,
          data: result.result.data,
          fromCache: false
        }
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('获取排行榜失败:', err)
      // 如果缓存存在但过期，返回缓存数据作为降级
      if (cache && cache.data) {
        console.log('返回过期缓存数据')
        return {
          success: true,
          data: cache.data,
          fromCache: true,
          expired: true
        }
      }
      return {
        success: false,
        message: '获取排行榜失败，请稍后重试'
      }
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

  // 保存用户信息到云端
  async saveUserProfileToCloud(nickname, avatarUrl) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'saveUserProfile',
        data: {
          nickname,
          avatarUrl
        }
      })
      
      if (result.result.success) {
        // 保存到本地
        this.userInfo.nickname = nickname
        this.userInfo.avatarUrl = avatarUrl
        this.userInfo.authorized = true
        
        setStorage('nickname', nickname)
        setStorage('avatarUrl', avatarUrl)
        setStorage('userInfoAuthorized', true)
        
        return {
          success: true,
          message: '用户资料保存成功'
        }
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('保存用户资料失败:', err)
      return {
        success: false,
        message: '保存失败，请稍后重试'
      }
    }
  }

  // 更新云端用户游戏数据（完全本地优先，不自动同步）
  // 数据只保存在本地，不主动同步到云端
  async updateCloudGameData(updateData) {
    // 添加用户信息到更新数据中
    const dataWithUserInfo = {
      ...updateData,
      nickname: this.userInfo.nickname,
      avatarUrl: this.userInfo.avatarUrl
    }
    
    // 只保存到本地，不自动同步
    cloudDataManager.addUpdate(dataWithUserInfo)
    
    // 返回成功，但不执行实际同步
    return true
  }
  
  /**
   * 手动同步数据到云端（只在需要时调用，如打开排行榜前）
   * @returns {Promise<Object>} 同步结果
   */
  async syncToCloud() {
    // 检查是否有待同步数据
    const pendingUpdates = cloudDataManager.getPendingUpdates()
    if (Object.keys(pendingUpdates).length === 0) {
      return { success: true, message: '无待同步数据' }
    }
    
    const result = await cloudDataManager.flush()
    return result
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
   * 获取赛季数据
   * @param {string} type - 数据类型：'score' 或 'wave'
   * @returns {Promise<Object>} 赛季数据
   */
  async getSeasonData(type = 'score') {
    try {
      const result = await wx.cloud.callFunction({
        name: 'seasonLeaderboard',
        data: { type }
      })
      
      if (result.result.success) {
        // 更新赛季信息
        this.seasonInfo = {
          currentSeasonId: result.result.data.seasonId,
          seasonStartTime: result.result.data.seasonStartTime,
          seasonEndTime: result.result.data.seasonEndTime,
          timeRemaining: result.result.data.seasonEndTime - Date.now()
        }
        
        // 更新用户赛季数据
        if (result.result.data.userStats) {
          this.seasonData = {
            ...this.seasonData,
            ...result.result.data.userStats,
            userRank: result.result.data.userRank,
            seasonScore: result.result.data.userValue
          }
        }
        
        return {
          success: true,
          data: result.result.data
        }
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('获取赛季数据失败:', err)
      return {
        success: false,
        message: '获取赛季数据失败，请稍后重试'
      }
    }
  }
  
  /**
   * 更新赛季数据
   * @param {number} score - 当前得分
   * @param {number} wave - 当前关卡
   * @param {number} clears - 通关次数
   * @param {number} streak - 连胜次数
   * @returns {Promise<boolean>} 是否成功
   */
  async updateSeasonData(score, wave, clears, streak) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: {
          action: 'updateSeasonData',
          seasonScore: score,
          seasonWave: wave,
          totalClears: clears,
          bestStreak: streak
        }
      })
      
      if (result.result.success) {
        // 更新本地赛季数据
        this.seasonData.seasonScore = Math.max(this.seasonData.seasonScore, score)
        this.seasonData.seasonWave = Math.max(this.seasonData.seasonWave, wave)
        this.seasonData.totalClears = (this.seasonData.totalClears || 0) + (clears || 0)
        this.seasonData.bestStreak = Math.max(this.seasonData.bestStreak, streak || 0)
        return true
      }
      return false
    } catch (err) {
      console.error('更新赛季数据失败:', err)
      return false
    }
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
