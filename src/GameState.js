import { getStorage, setStorage } from './utils.js'
import { getTodayString, getYesterdayString, safeCancelAnimationFrame } from './utils.js'
import { config } from './config.js'
import { cloudDataManager } from './CloudDataManager.js'

/**
 * 游戏状态管理
 */
export class GameState {
  constructor() {
    // 玩家数据
    this.score = 0
    this.highScore = Number(getStorage('highScore', 0)) || 0
    this.bestWave = Number(getStorage('bestWave', 0)) || 0
    this.coins = getStorage('coins', config.game.initialCoins)
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
    
    // 签到状态缓存
    this.checkinStatusCache = {
      data: null,
      timestamp: 0
    }
    this.checkinCacheDuration = 300000 // 5 分钟缓存
    
    // 分享礼包数据
    this.lastShareGiftDate = getStorage('lastShareGiftDate', '')
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
    
    // 云端数据同步标志
    this.cloudSynced = false
    this.cloudAvailable = true
    
    // 待同步的通关数据（延迟同步优化）
    this.pendingCloudSync = false
    
    // 排行榜缓存
    this.leaderboardCache = {
      score: { data: null, timestamp: 0, expire: 600000 },  // 10 分钟缓存
      wave: { data: null, timestamp: 0, expire: 600000 }
    }
    
    // 用户信息
    this.userInfo = {
      nickname: getStorage('nickname', ''),
      avatarUrl: getStorage('avatarUrl', ''),
      authorized: getStorage('userInfoAuthorized', false)
    }
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

  // 重置所有数据（用于数据迁移）
  resetAllData() {
    this.highScore = 0
    this.bestWave = 0
    this.coins = config.game.initialCoins
    setStorage('highScore', 0)
    setStorage('bestWave', 0)
    setStorage('coins', config.game.initialCoins)
  }

  // 返回主菜单
  resetToMenu() {
    this.clearTimer()
    this.phase = 'MENU'
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
    // 同步待同步的通关数据
    this.syncPendingData().catch(err => {
      console.error('同步待同步数据失败:', err)
    })
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
  // 优化：延迟同步，只在游戏结束时同步
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
    
    // 标记有待同步的数据（延迟到游戏结束时同步）
    if (hasUpdate) {
      this.pendingCloudSync = true
      console.log('标记待同步数据，将在游戏结束时同步')
    }
  }
  
  /**
   * 同步待同步的通关数据（游戏结束时调用）
   */
  async syncPendingData() {
    if (!this.pendingCloudSync) {
      return
    }
    
    console.log('开始同步待同步数据...')
    
    const updates = {
      highestScore: this.highScore,
      highestWave: this.bestWave
    }
    
    await this.updateCloudGameData(updates)
    
    this.pendingCloudSync = false
    console.log('待同步数据同步完成')
  }

  // 增加金币
  addCoins(amount) {
    this.coins += amount
    this.sessionCoins += amount  // 累加会话金币
    setStorage('coins', this.coins)
  }

  // 检查是否可以签到（用于 UI 显示红点）
  canCheckin() {
    const today = getTodayString()
    // 如果云端已同步，使用云端数据；否则使用本地数据
    if (this.cloudSynced) {
      return this.lastCheckinDate !== today
    } else {
      // 云端未同步时，保守处理：不显示红点，避免误导
      return false
    }
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

  // 获取云端签到状态
  // 优化：添加 5 分钟缓存，使用合并后的 gameData 云函数
  async checkCloudCheckinStatus() {
    // 检查缓存
    const now = Date.now()
    if (this.checkinStatusCache.data && 
        (now - this.checkinStatusCache.timestamp) < this.checkinCacheDuration) {
      return this.checkinStatusCache.data
    }
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: { action: 'checkinStatus' }
      })
      
      if (result.result.success && result.result.data.cloudAvailable) {
        const status = {
          canCheckin: !result.result.data.isTodayChecked,
          streak: result.result.data.checkinStreak,
          todayReward: result.result.data.todayReward,
          cloudAvailable: true
        }
        
        // 更新缓存
        this.checkinStatusCache.data = status
        this.checkinStatusCache.timestamp = now
        
        return status
      } else {
        throw new Error('云端不可用')
      }
    } catch (err) {
      // 云端不可用时降级到本地检查
      const status = {
        canCheckin: this.canCheckin(),
        streak: this.checkinStreak,
        todayReward: this.getTodayReward(),
        cloudAvailable: false
      }
      
      // 也缓存本地结果
      this.checkinStatusCache.data = status
      this.checkinStatusCache.timestamp = now
      
      return status
    }
  }

  // 执行云端签到
  // 优化：使用合并后的 gameData 云函数
  async doCloudCheckin() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: { action: 'doCheckin' }
      })
      
      if (result.result.success && result.result.data.cloudAvailable) {
        // 更新本地数据
        this.lastCheckinDate = getTodayString()
        this.checkinStreak = result.result.data.checkinStreak
        setStorage('lastCheckinDate', this.lastCheckinDate)
        setStorage('checkinStreak', this.checkinStreak)
        
        // 更新金币/宝石
        if (result.result.data.reward.type === 'coin') {
          this.addCoins(result.result.data.reward.amount)
          // 同步到云端
          await this.updateCloudGameData({ addCoins: result.result.data.reward.amount })
        } else {
          // 宝石逻辑（暂未实现）
        }
        
        return {
          success: true,
          reward: result.result.data.reward,
          streak: result.result.data.checkinStreak
        }
      } else {
        return {
          success: false,
          message: result.result.message || '云端不可用'
        }
      }
    } catch (err) {
      console.error('云端签到失败:', err)
      return {
        success: false,
        message: '网络错误，请稍后重试'
      }
    }
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

  // 执行签到（本地降级方案，云端不可用时使用）
  doCheckin() {
    const today = getTodayString()
    const yesterday = getYesterdayString()
    
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
    
    // 根据签到天数给予奖励（新规则）
    const reward = this.getTodayReward()
    
    // 判断是金币还是宝石（第 2 天和第 5 天为宝石）
    const isGem = (this.checkinStreak === 2 || this.checkinStreak === 5)
    if (isGem) {
      return { type: 'gem', amount: reward.amount }
    }
    this.addCoins(reward.amount)
    return { type: 'coin', amount: reward.amount }
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
    
    // 检查缓存是否有效
    if (cache && cache.data && (now - cache.timestamp) < cache.expire) {
      console.log(`使用排行榜缓存 (${type})`)
      return {
        success: true,
        data: cache.data,
        fromCache: true
      }
    }
    
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

  // 更新云端用户游戏数据（添加昵称和头像）
  // 优化：使用合并后的 gameData 云函数 + CloudDataManager 批量更新
  async updateCloudGameData(updateData) {
    // 添加用户信息到更新数据中
    const dataWithUserInfo = {
      action: 'update',
      ...updateData,
      nickname: this.userInfo.nickname,
      avatarUrl: this.userInfo.avatarUrl
    }
    
    // 使用 CloudDataManager 批量更新
    cloudDataManager.addUpdate(dataWithUserInfo)
    
    return true
  }
  
  /**
   * 强制同步云端数据（用于游戏退出等关键场景）
   */
  async forceSyncCloudData() {
    await cloudDataManager.forceSync()
  }
}
