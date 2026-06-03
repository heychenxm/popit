import { getStorage, setStorage } from './utils.js'

/**
 * 游戏状态管理
 */
export class GameState {
  constructor() {
    // 玩家数据
    this.score = 0
    this.highScore = getStorage('highScore', 0)
    this.bestWave = getStorage('bestWave', 0)
    this.coins = getStorage('coins', 1000)
    this.lives = 3
    this.maxLives = 5

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
    this.timerRemaining = 0
    this.activeWaveCompleted = false
    
    // 暂停状态
    this.isPaused = false
    this.pausedPhase = null      // 暂停时的阶段
    this.pausedTimerRemaining = 0 // 暂停时的剩余时间

    // 签到数据
    this.lastCheckinDate = getStorage('lastCheckinDate', '')
    this.checkinStreak = getStorage('checkinStreak', 0)
    
    // 积分规则相关
    this.waveScore = 0           // 当前关卡得分
    this.consecutiveWins = 0     // 连续胜利关卡数
    this.purchaseCount = 0       // 购买生命次数（整个游戏会话累计，最多 3 次）
    this.sessionCoins = 0        // 本次游戏会话获得的金币（不包含初始 1000）
    this.hasShownRecordBreakModal = false  // 本局是否已显示破纪录弹窗
    
    // 云端数据同步标志
    this.cloudSynced = false
    this.cloudAvailable = true
  }

  // 同步云端数据
  async syncCloudData() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'syncData',
        data: {
          highestWave: this.bestWave,
          highestScore: this.highScore,
          coins: this.coins,
          gems: 0 // 宝石数据
        }
      })
      
      if (result.result.success) {
        const cloudData = result.result.data
        
        // 同步用户档案数据（取最大值）
        if (cloudData.profile) {
          this.bestWave = Math.max(this.bestWave, cloudData.profile.highestWave || 0)
          this.highScore = Math.max(this.highScore, cloudData.profile.highestScore || 0)
          this.coins = Math.max(this.coins, cloudData.profile.coins || 0)
        }
        
        // 同步签到数据
        if (cloudData.signin) {
          this.lastCheckinDate = cloudData.signin.lastCheckinDate || ''
          this.checkinStreak = cloudData.signin.checkinStreak || 0
        }
        
        // 保存到本地
        setStorage('highScore', this.highScore)
        setStorage('bestWave', this.bestWave)
        setStorage('coins', this.coins)
        setStorage('lastCheckinDate', this.lastCheckinDate)
        setStorage('checkinStreak', this.checkinStreak)
        
        this.cloudSynced = true
        this.cloudAvailable = true
        
        console.log('云端数据同步成功')
        return true
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('云端数据同步失败:', err)
      this.cloudAvailable = false
      return false
    }
  }

  // 更新云端游戏数据
  async updateCloudGameData(updateData) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateGameData',
        data: updateData
      })
      
      if (result.result.success) {
        const cloudData = result.result.data
        
        // 更新本地数据
        if (cloudData.highestWave !== undefined) {
          this.bestWave = cloudData.highestWave
          setStorage('bestWave', this.bestWave)
        }
        if (cloudData.highestScore !== undefined) {
          this.highScore = cloudData.highestScore
          setStorage('highScore', this.highScore)
        }
        if (cloudData.coins !== undefined) {
          this.coins = cloudData.coins
          setStorage('coins', this.coins)
        }
        
        this.cloudAvailable = true
        return true
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('更新云端游戏数据失败:', err)
      this.cloudAvailable = false
      return false
    }
  }

  // 重置游戏状态（开始新游戏）
  reset() {
    this.score = 0
    this.wave = 1
    this.lives = 3
    this.targets = []
    this.playerClicks = []
    this.phase = 'OBSERVE'
    this.activeWaveCompleted = false
    this.waveScore = 0
    this.consecutiveWins = 0
    this.purchaseCount = 0
    this.sessionCoins = 0  // 重置会话金币
    this.hasShownRecordBreakModal = false  // 重置破纪录弹窗标志
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
    this.clearTimer()
  }

  // 重置所有数据（用于数据迁移）
  resetAllData() {
    this.highScore = 0
    this.bestWave = 0
    this.coins = 1000
    setStorage('highScore', 0)
    setStorage('bestWave', 0)
    setStorage('coins', 1000)
  }

  // 返回主菜单
  resetToMenu() {
    this.clearTimer()
    this.phase = 'MENU'
    this.isPaused = false
    this.pausedPhase = null
    this.pausedTimerRemaining = 0
  }

  // 设置计时器
  setTimer(callback, duration) {
    this.clearTimer()
    this.timerInterval = setInterval(callback, 30)
  }

  // 清除计时器
  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  // 保存最高分和最高关卡（关卡结束后调用）
  async saveHighScore() {
    // 更新最高分
    if (this.score > this.highScore) {
      this.highScore = this.score
      setStorage('highScore', this.highScore)
      // 同步到云端（异步，不阻塞）
      this.updateCloudGameData({ highestScore: this.highScore })
    }
    // 更新最高关卡（只有成功通过的关卡才算）
    // 注意：这里只在胜利时更新，失败时不更新
    if (this.phase === 'WIN' && this.wave > this.bestWave) {
      this.bestWave = this.wave
      setStorage('bestWave', this.bestWave)
      // 同步到云端（异步，不阻塞）
      this.updateCloudGameData({ highestWave: this.bestWave })
    }
  }

  // 增加金币
  addCoins(amount) {
    this.coins += amount
    this.sessionCoins += amount  // 累加会话金币
    setStorage('coins', this.coins)
  }

  // 检查是否可以签到
  canCheckin() {
    const today = new Date().toDateString()
    return this.lastCheckinDate !== today
  }

  // 获取云端签到状态
  async checkCloudCheckinStatus() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'checkin',
        data: { action: 'getStatus' }
      })
      
      if (result.result.success && result.result.data.cloudAvailable) {
        return {
          canCheckin: !result.result.data.isTodayChecked,
          streak: result.result.data.checkinStreak,
          todayReward: result.result.data.todayReward,
          cloudAvailable: true
        }
      } else {
        throw new Error('云端不可用')
      }
    } catch (err) {
      console.error('获取云端签到状态失败:', err)
      // 云端不可用时降级到本地检查
      return {
        canCheckin: this.canCheckin(),
        streak: this.checkinStreak,
        todayReward: this.getTodayReward(),
        cloudAvailable: false
      }
    }
  }

  // 执行云端签到
  async doCloudCheckin() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'checkin',
        data: { action: 'checkin' }
      })
      
      if (result.result.success && result.result.data.cloudAvailable) {
        // 更新本地数据
        this.lastCheckinDate = new Date().toDateString()
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

  // 获取当天签到奖励
  getTodayReward() {
    const dayReward = [100, 200, 5, 500, 1000, 10, 2000]
    const dayIndex = Math.min(this.checkinStreak, dayReward.length - 1)
    const reward = dayReward[dayIndex]
    const isGem = (dayIndex === 2 || dayIndex === 5)
    return {
      type: isGem ? 'gem' : 'coin',
      amount: reward
    }
  }

  // 执行签到
  doCheckin() {
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    
    if (this.lastCheckinDate === yesterday) {
      this.checkinStreak++
    } else if (this.lastCheckinDate !== today) {
      this.checkinStreak = 1
    }
    
    this.lastCheckinDate = today
    setStorage('lastCheckinDate', today)
    setStorage('checkinStreak', this.checkinStreak)
    
    // 根据签到天数给予奖励
    const dayReward = [100, 200, 5, 500, 1000, 10, 2000]
    const dayIndex = Math.min(this.checkinStreak - 1, dayReward.length - 1)
    const reward = dayReward[dayIndex]
    
    // 判断是金币还是宝石
    const isGem = (dayIndex === 2 || dayIndex === 5)
    if (isGem) {
      return { type: 'gem', amount: reward }
    }
    this.addCoins(reward)
    return { type: 'coin', amount: reward }
  }

  // 购买生命
  canPurchaseLife() {
    return this.purchaseCount < 3 && this.coins >= this.getPurchasePrice()
  }

  // 获取当前购买价格
  getPurchasePrice() {
    const prices = [300, 500, 1000]
    return prices[this.purchaseCount] || 9999
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
    // 每连续胜利 5 关，恢复 1 生命（不超过上限）
    if (this.consecutiveWins % 5 === 0 && this.lives < this.maxLives) {
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
}
