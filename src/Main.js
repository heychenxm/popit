import { GameState } from './GameState.js'
import { AudioManager } from './AudioManager.js'
import { BubbleGrid } from './BubbleGrid.js'
import { UIManager } from './UIManager.js'
import { wechatAPI } from './WechatAPI.js'
import { getUniqueRandomIndices, setStorage, getColorClass, safeRequestAnimationFrame } from './utils.js'
import { config } from './config.js'

/**
 * 游戏主类 - 整合所有模块
 */
export class Main {
  constructor() {
    // 初始化微信 API
    wechatAPI.init()
    
    // 初始化云开发（根据环境自动选择云环境 ID）
    try {
      wx.cloud.init({
        env: config.cloudEnv,
        traceUser: true
      })
      console.log(`云开发初始化成功 (环境: ${config.env})`)
    } catch (err) {
      console.error('云开发初始化失败:', err)
    }
    
    // 获取 canvas
    this.canvas = wx.createCanvas()
    this.ctx = this.canvas.getContext('2d')
    
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.pixelRatio = systemInfo.pixelRatio || 1
    this.width = systemInfo.windowWidth
    this.height = systemInfo.windowHeight
    
    // 设置 canvas 尺寸为物理像素（解决图标模糊的关键）
    this.canvas.width = this.width * this.pixelRatio
    this.canvas.height = this.height * this.pixelRatio
    
    // 缩放绘图上下文，使坐标系统保持逻辑像素一致
    this.ctx.scale(this.pixelRatio, this.pixelRatio)
    
    // 初始化模块（传入 pixelRatio）
    this.gameState = new GameState()
    this.audioManager = new AudioManager()
    this.bubbleGrid = new BubbleGrid(this.canvas, { pixelRatio: this.pixelRatio })
    this.uiManager = new UIManager(this.canvas, { pixelRatio: this.pixelRatio })
    
    // 游戏循环
    this.lastTime = 0
    this.isRunning = false
    
    // 观察阶段计时
    this.observeStartTime = 0
    
    // 初始化
    this.init()
  }

  // 初始化
  async init() {
    // 设置屏幕常亮
    wechatAPI.keepScreenOn(true)
    
    // 设置分享
    this.setupShare()
    
    // 绑定触摸事件
    this.bindEvents()
    
    // 绑定游戏生命周期事件
    this.bindLifecycleEvents()
    
    // 同步云端数据（异步，不阻塞游戏启动）
    this.gameState.syncCloudData().then(() => {
      console.log('云端数据同步完成')
      // 更新分享礼包状态
      this.gameState.updateShareGiftStatus()
    }).catch(err => {
      console.error('云端数据同步失败:', err)
      // 即使云端同步失败，也要更新本地状态
      this.gameState.updateShareGiftStatus()
    })
    
    // 开始游戏循环
    this.start()
  }
  
  /**
   * 绑定游戏生命周期事件
   */
  bindLifecycleEvents() {
    // 记录上次同步时间
    let lastSyncTime = 0
    const syncInterval = 60000 // 1 分钟内不重复同步
    
    // 游戏隐藏（切换到后台）时强制同步数据
    wx.onHide(() => {
      // 先同步待同步的通关数据
      this.gameState.syncPendingData().then(() => {
        // 再强制同步所有数据
        return this.gameState.forceSyncCloudData()
      }).catch(err => {
        console.error('强制同步失败:', err)
      })
    })
    
    // 游戏显示（回到前台）时刷新数据
    wx.onShow(() => {
      const now = Date.now()
      // 如果距离上次同步超过 1 分钟，才同步
      if (now - lastSyncTime > syncInterval) {
        lastSyncTime = now
        this.gameState.syncCloudData().catch(err => {
          console.error('刷新数据失败:', err)
        })
      }
    })
  }

  // 首次点击时触发用户信息授权（符合微信规范）
  async tryInitUserInfo() {
    // 如果已经授权过，不再弹出
    if (this.gameState.userInfo.authorized) {
      return
    }
    
    // 标记已尝试，避免重复弹出
    if (this.hasTriedInitUserInfo) {
      return
    }
    this.hasTriedInitUserInfo = true
    
    await this.initUserInfo()
  }

  // 初始化用户信息（在用户确认授权后调用）
  async initUserInfo() {
    // 如果已经授权过，直接使用本地数据
    if (this.gameState.userInfo.authorized) {
      console.log('用户已授权，使用本地数据')
      return true
    }
    
    try {
      // 尝试获取用户信息
      const userInfo = await this.gameState.getUserProfile()
      console.log('获取用户信息成功:', userInfo)
      
      // 保存到云端
      const result = await this.gameState.saveUserProfileToCloud(
        userInfo.nickName,
        userInfo.avatarUrl
      )
      
      if (result.success) {
        console.log('用户资料保存成功')
        return true
      } else {
        console.error('用户资料保存失败:', result.message)
        return false
      }
    } catch (err) {
      // 用户拒绝授权，使用默认头像
      console.log('用户拒绝授权，使用默认头像')
      // 生成默认昵称
      const defaultNickname = `玩家${wx.getSystemInfoSync().SDKVersion || 'default'}`
      await this.gameState.saveUserProfileToCloud(defaultNickname, '')
      return false
    }
  }

  // 设置分享
  setupShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    // 监听分享
    wx.onShareAppMessage(() => {
      return {
        title: '来挑战 POPIT 记忆大师！',
        query: `score=${this.gameState.score}&wave=${this.gameState.wave}`
      }
    })
  }

  // 绑定事件
  bindEvents() {
    // 触摸开始（单点触控）
    wx.onTouchStart((e) => {
      // 只处理第一个触摸点
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        const x = touch.clientX || touch.x || 0
        const y = touch.clientY || touch.y || 0
        this.handleTouchStart(x, y)
      }
    })
    
    // 触摸结束
    wx.onTouchEnd((e) => {
      // 可以在这里添加触摸结束逻辑
    })
  }

  // 处理触摸开始
  handleTouchStart(x, y) {
    // 首次点击时触发用户信息授权（符合微信规范）
    this.tryInitUserInfo()
    
    // 暂停状态优先处理
    if (this.gameState.isPaused) {
      this.handlePauseTouch(x, y)
      return
    }
    
    // 检查是否在排行榜界面
    if (this.uiManager.currentScreen === 'leaderboard') {
      this.handleLeaderboardTouch(x, y)
      return
    }
    
    // 检查是否在签到界面
    if (this.uiManager.currentScreen === 'checkin') {
      this.handleCheckinTouch(x, y)
      return
    }
    
    switch (this.gameState.phase) {
      case 'MENU':
        this.handleMenuTouch(x, y)
        break
      case 'OBSERVE':
        // 观察阶段不允许点击，给出提示
        this.uiManager.showToast('先记住高亮气泡的位置哦~')
        break
      case 'PLAY':
        this.handleGameTouch(x, y)
        break
      case 'WIN':
        this.handleWinTouch(x, y)
        break
      case 'FAIL':
        this.handleFailTouch(x, y)
        break
    }
  }

  // 处理排行榜触摸
  async handleLeaderboardTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      switch (buttonId) {
        case 'close':
          this.closeLeaderboard()
          break
        case 'leaderboard_score':
          await this.switchLeaderboardType('score')
          break
        case 'leaderboard_wave':
          await this.switchLeaderboardType('wave')
          break
      }
    }
  }

  // 处理签到触摸
  async handleCheckinTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      switch (buttonId) {
        case 'close':
          this.closeCheckin()
          break
        case 'checkin':
          await this.doCheckin()
          break
      }
    }
  }

  // 处理主菜单触摸
  handleMenuTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      // 如果当前是分享弹窗，处理分享按钮
      if (this.uiManager.currentScreen === 'share') {
        if (buttonId === 'share_wechat') {
          this.handleWechatShare()
        } else if (buttonId === 'close') {
          this.uiManager.currentScreen = 'menu'
        }
        return
      }
      
      switch (buttonId) {
        case 'start':
          this.startGame()
          break
        case 'leaderboard':
        case 'leaderboard_detail':
          this.showLeaderboard()
          break
        case 'sound':
          this.toggleSound()
          break
        case 'checkin':
          this.showCheckin()
          break
        case 'share':
          // 底部分享按钮：直接调用微信分享，奖励 +50 金币
          this.handleQuickShare()
          break
        case 'share_gift':
          // 右上角分享礼包图标：显示分享礼包弹窗，每天可领一次，奖励 +1000 金币
          this.showShare()
          break
      }
    }
  }

  // 处理游戏触摸（单点触控）
  handleGameTouch(x, y) {
    // 检查是否点击暂停按钮
    const buttonId = this.uiManager.handleTouch(x, y)
    if (buttonId === 'pause') {
      this.audioManager.play('click')
      this.vibrate()
      this.pauseGame()
      return
    }
    
    // 暂停期间不允许点击泡泡
    if (this.gameState.isPaused) return
    
    // 检查是否点击泡泡
    if (this.gameState.phase === 'PLAY') {
      const bubbleIndex = this.bubbleGrid.getBubbleIndexAtPoint(x, y)
      if (bubbleIndex >= 0) {
        // 防止重复点击同一个气泡
        if (this.gameState.playerClicks.includes(bubbleIndex)) {
          return
        }
        // 处理气泡点击
        this.handleBubbleClick(bubbleIndex)
      }
    }
  }

  // 处理胜利弹窗触摸
  handleWinTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      switch (buttonId) {
        case 'home':
          this.navigateToMenu()
          break
        case 'next':
          this.nextLevel()
          break
      }
    }
  }

  // 处理失败弹窗触摸
  handleFailTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      switch (buttonId) {
        case 'home':
          this.navigateToMenu()
          break
        case 'retry':
          this.retryLevel()
          break
        case 'purchase':
          this.purchaseLifeAndContinue()
          break
        case 'restart':
          this.restartGame()
          break
      }
    }
  }

  // 处理暂停弹窗触摸
  handlePauseTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      switch (buttonId) {
        case 'home':
          this.navigateToMenu()
          break
        case 'resume':
          this.resumeGame()
          break
      }
    }
  }

  // 重新开始游戏
  restartGame() {
    this.gameState.reset()
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 开始游戏
  startGame() {
    this.gameState.reset()
    this.uiManager.currentScreen = 'game'
    this.bubbleGrid.resetBubbles()
    this.startNewWave()
  }

  // 开始新关卡
  startNewWave() {
    this.gameState.activeWaveCompleted = false
    this.gameState.playerClicks = []
    this.setGameState('OBSERVE', 'game')
    
    // 重置关卡状态（清空当关得分和购买次数）
    this.gameState.resetWave()
    
    // 获取当前关卡的网格大小并设置
    const gridSize = this.gameState.getGridSize()
    this.bubbleGrid.setGridSize(gridSize.cols, gridSize.rows)
    
    // 计算目标数量
    const totalTargetsCount = this.gameState.getTargetCount()
    
    // 生成目标索引
    this.gameState.targets = getUniqueRandomIndices(gridSize.cols * gridSize.rows, totalTargetsCount)
    
    // 调整计时器
    this.gameState.observeDuration = this.gameState.getObserveDuration()
    this.gameState.playDuration = this.gameState.getPlayDuration()
    
    // 重置泡泡
    this.bubbleGrid.resetBubbles()
    
    // 开始观察阶段
    this.startObservePhase()
  }

  // 开始观察阶段
  startObservePhase() {
    this.observeStartTime = Date.now()
    
    // 高亮目标泡泡（根据索引分配颜色）
    this.gameState.targets.forEach((targetIdx) => {
      const colorClass = getColorClass(targetIdx)
      this.bubbleGrid.setBubbleState(targetIdx, 'pink', colorClass)
    })
    
    // 设置计时器
    this.gameState.timerRemaining = this.gameState.observeDuration
    
    this.gameState.clearTimer()
    // 使用 requestAnimationFrame 提高计时精度
    const checkTimer = () => {
      const elapsed = Date.now() - this.observeStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.observeDuration - elapsed)
      
      if (elapsed >= this.gameState.observeDuration) {
        this.gameState.clearTimer()
        this.startPlayPhase()
      } else {
        this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
    this.gameState.timerType = 'raf'
  }
  
  // 恢复观察阶段
  resumeObservePhase() {
    this.observeStartTime = Date.now() - (this.gameState.observeDuration - this.gameState.timerRemaining)
    
    this.gameState.clearTimer()
    // 使用 requestAnimationFrame 提高计时精度
    const checkTimer = () => {
      const elapsed = Date.now() - this.observeStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.observeDuration - elapsed)
      
      if (elapsed >= this.gameState.observeDuration) {
        this.gameState.clearTimer()
        this.startPlayPhase()
      } else {
        this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
    this.gameState.timerType = 'raf'
  }

  // 开始游戏阶段
  startPlayPhase() {
    this.setGameState('PLAY', 'game')
    
    // 重置泡泡显示（隐藏目标）
    this.bubbleGrid.resetBubbles()
    
    // 开始倒计时
    this.gameState.timerRemaining = this.gameState.playDuration
    this.gameState.clearTimer()
    
    const playStartTime = Date.now()
    // 使用 requestAnimationFrame 提高计时精度
    const checkTimer = () => {
      const elapsed = Date.now() - playStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.playDuration - elapsed)
      
      if (this.gameState.timerRemaining <= 0) {
        this.gameState.clearTimer()
        this.handleTimeOut()
      } else {
        this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
    this.gameState.timerType = 'raf'
  }
  
  // 恢复游戏阶段
  resumePlayPhase() {
    this.setGameState('PLAY', 'game')
    
    const playStartTime = Date.now() - (this.gameState.playDuration - this.gameState.timerRemaining)
    this.gameState.clearTimer()
    
    // 使用 requestAnimationFrame 提高计时精度
    const checkTimer = () => {
      const elapsed = Date.now() - playStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.playDuration - elapsed)
      
      if (this.gameState.timerRemaining <= 0) {
        this.gameState.clearTimer()
        this.handleTimeOut()
      } else {
        this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
    this.gameState.timerType = 'raf'
  }

  // 处理泡泡点击（单点触控）
  handleBubbleClick(index) {
    if (this.gameState.phase !== 'PLAY' || this.gameState.activeWaveCompleted) return
    
    // 防止重复点击
    if (this.gameState.playerClicks.includes(index)) return
    
    // 检查是否正确
    if (this.gameState.targets.includes(index)) {
      // 正确！
      this.audioManager.play('pop')
      this.vibrate('light')
      
      // 设置泡泡状态（根据索引分配颜色）
      const colorClass = getColorClass(index)
      this.bubbleGrid.setBubbleState(index, 'pink', colorClass)
      
      this.gameState.playerClicks.push(index)
      // 每个泡泡 +5 分
      this.gameState.score += 5
      this.gameState.waveScore += 5
      
      // 检查是否全部找到
      if (this.gameState.playerClicks.length === this.gameState.targets.length) {
        this.gameState.clearTimer()
        this.gameState.activeWaveCompleted = true
        setTimeout(() => this.handleWaveSuccess(), 500)
      }
    } else {
      // 错误！
      this.audioManager.play('wrong')
      this.vibrate('heavy')
      
      // 显示红色闪烁
      this.bubbleGrid.setBubbleState(index, 'red', 'red')
      setTimeout(() => {
        this.bubbleGrid.setBubbleState(index, 'normal')
      }, 400)
      
      // 显示 Toast 提示，但不扣生命
      this.uiManager.showToast('点错了！')
    }
  }

  // 设置游戏状态（统一 phase 和 currentScreen，避免状态不一致）
  setGameState(phase, screen) {
    this.gameState.phase = phase
    this.uiManager.currentScreen = screen
  }
  
  // 处理超时（倒计时结束）
  handleTimeOut() {
    // 检查是否还有正确气泡未点完
    if (this.gameState.playerClicks.length < this.gameState.targets.length) {
      // 扣 1 生命
      this.audioManager.play('wrong')
      this.vibrate('heavy')
      this.gameState.lives--
      this.uiManager.showToast('时间到！失去 1 点生命 ❤️')
      
      if (this.gameState.lives > 0) {
        // 还有生命，重新开始当前关卡
        setTimeout(() => this.restartCurrentWave(), 500)
      } else {
        // 生命归零，游戏失败 - 设置 FAIL 状态，等待用户操作
        this.setGameState('FAIL', 'fail')
      }
    }
  }

  // 处理关卡成功
  async handleWaveSuccess() {
    this.audioManager.play('success')
    this.vibrate('medium')
    this.uiManager.showToast(`第 ${this.gameState.wave} 波过关！`)
    
    // 增加连续胜利计数，检查是否恢复生命
    const lifeRecovered = this.gameState.addConsecutiveWin()
    if (lifeRecovered) {
      this.uiManager.showToast(`连续 ${config.rewards.consecutiveWin} 胜！恢复 1 生命 ❤️`)
    }
    
    // 发放通关奖励：金币
    this.gameState.addCoins(config.rewards.waveClear)
    this.uiManager.showToast(`通关奖励：+${config.rewards.waveClear} 金币 `)
    
    // 设置胜利状态（用于 saveHighScore 判断）
    this.setGameState('WIN', 'win')
    
    // 检查是否显示胜利弹窗（在保存之前判断）
    const modalType = this.shouldShowVictoryModal()
    
    // 保存最高分和最高关卡
    await this.gameState.saveHighScore()
    
    // 如果是破纪录弹窗，标记已显示
    if (modalType === 'record') {
      this.gameState.hasShownRecordBreakModal = true
    }
    
    if (modalType) {
      // 显示胜利弹窗（传递弹窗类型）
      this.uiManager.winModalType = modalType
    } else {
      // 进入下一关
      this.gameState.wave++
      this.startNewWave()
    }
  }

  // 判断是否显示胜利弹窗
  shouldShowVictoryModal() {
    const wave = this.gameState.wave
    const bestWave = this.gameState.bestWave
    
    // 条件 1：破历史最高关卡（本局只弹一次）
    if (wave > bestWave && !this.gameState.hasShownRecordBreakModal) {
      return 'record'  // 返回 'record' 表示破纪录弹窗
    }
    
    // 条件 2：固定关卡（5, 10, 20, 30, 40, 50, 60...）
    if (wave === 5 || wave === 10 || wave === 20 || wave === 30 || wave === 40) {
      return 'victory'  // 返回 'victory' 表示胜利弹窗
    }
    // 40 关之后每 10 关
    if (wave > 40 && wave % 10 === 0) {
      return 'victory'
    }
    
    // 不满足任何条件
    return null
  }

  // 处理游戏结束
  async handleGameOver() {
    this.audioManager.play('wrong')
    this.vibrate('heavy')
    await this.gameState.saveHighScore()
    
    // 重置连续胜利计数
    this.gameState.resetConsecutiveWins()
    
    // 失败没有金币奖励
    this.uiManager.showToast(`本关得分：${this.gameState.waveScore}`)
    
    // 显示失败弹窗，提供购买生命选项
    this.setGameState('FAIL', 'fail')
  }

  // 下一关
  nextLevel() {
    this.gameState.wave++
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 重试关卡
  retryLevel() {
    this.gameState.reset()
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 购买生命并继续
  purchaseLifeAndContinue() {
    const currentPrice = this.gameState.getPurchasePrice()
    this.audioManager.play('click')
    
    if (this.gameState.purchaseLife()) {
      this.vibrate('medium')
      this.uiManager.showToast(`购买成功！花费 ${currentPrice} 金币，生命 +1 ❤️`)
      
      // 关闭失败弹窗
      this.uiManager.currentScreen = 'game'
      
      // 重置当前关卡（重新开始，包括观察阶段）
      this.restartCurrentWave()
    } else {
      this.vibrate('light')
      this.uiManager.showToast(`金币不足或已达到购买上限（需要${currentPrice}金币，最多${config.game.maxPurchaseCount}次）`)
    }
  }

  // 重新开始当前关卡（生命扣除后）
  restartCurrentWave() {
    // 重置关卡状态
    this.gameState.activeWaveCompleted = false
    this.gameState.playerClicks = []
    this.setGameState('OBSERVE', 'game')
    this.gameState.waveScore = 0
    
    // 重新生成目标气泡位置（重新随机）
    const gridSize = this.gameState.getGridSize()
    const totalTargetsCount = this.gameState.getTargetCount()
    this.gameState.targets = getUniqueRandomIndices(gridSize.cols * gridSize.rows, totalTargetsCount)
    
    // 重置泡泡
    this.bubbleGrid.resetBubbles()
    
    // 重新开始观察阶段
    this.startObservePhase()
  }

  // 返回主菜单
  navigateToMenu() {
    this.gameState.resetToMenu()
    this.uiManager.currentScreen = 'menu'
    this.bubbleGrid.resetBubbles()
  }

  // 暂停游戏
  pauseGame() {
    // 保存暂停状态
    this.gameState.isPaused = true
    this.gameState.pausedPhase = this.gameState.phase
    this.gameState.pausedTimerRemaining = this.gameState.timerRemaining
    
    // 清除计时器
    this.gameState.clearTimer()
    
    // 显示暂停弹窗
    this.uiManager.currentScreen = 'pause'
  }

  // 恢复游戏
  resumeGame() {
    // 恢复暂停状态
    this.gameState.isPaused = false
    this.gameState.phase = this.gameState.pausedPhase
    this.gameState.timerRemaining = this.gameState.pausedTimerRemaining
    
    // 关闭暂停弹窗
    this.uiManager.currentScreen = 'game'
    
    // 恢复倒计时
    if (this.gameState.pausedPhase === 'OBSERVE') {
      this.resumeObservePhase()
    } else if (this.gameState.pausedPhase === 'PLAY') {
      this.resumePlayPhase()
    }
  }

  // 显示排行榜
  async showLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 切换到排行榜界面
    this.uiManager.currentScreen = 'leaderboard'
    
    // 获取排行榜数据（默认最高分）
    this.uiManager.leaderboardType = 'score'
    await this.refreshLeaderboard()
  }

  // 刷新排行榜数据
  async refreshLeaderboard() {
    const result = await this.gameState.getLeaderboard(this.uiManager.leaderboardType)
    
    if (result.success) {
      this.uiManager.leaderboardData = result.data
    } else {
      this.uiManager.showToast(result.message || '获取排行榜失败')
      this.uiManager.leaderboardData = null
    }
  }

  // 切换排行榜类型
  async switchLeaderboardType(type) {
    if (this.uiManager.leaderboardType === type) return
    
    this.uiManager.leaderboardType = type
    this.audioManager.play('click')
    this.vibrate('light')
    
    await this.refreshLeaderboard()
  }

  // 关闭排行榜
  closeLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    this.uiManager.currentScreen = 'menu'
  }

  // 切换声音
  toggleSound() {
    const enabled = this.audioManager.toggle()
    this.gameState.soundEnabled = enabled
    this.uiManager.showToast(`声音：${enabled ? '开启' : '静音'}`)
  }

  // 震动反馈
  vibrate(intensity = 'light') {
    try {
      if (typeof wx !== 'undefined' && wx.vibrateShort) {
        switch (intensity) {
          case 'light':
            wx.vibrateShort({ type: 'light' })
            break
          case 'medium':
            wx.vibrateShort({ type: 'medium' })
            break
          case 'heavy':
            wx.vibrateShort({ type: 'heavy' })
            break
          default:
            wx.vibrateShort({ type: 'light' })
        }
      }
    } catch (e) {
      // 忽略震动错误
    }
  }

  // 显示签到
  async showCheckin() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 切换到签到界面
    this.uiManager.currentScreen = 'checkin'
  }

  // 执行签到（在签到弹窗中点击按钮时调用）
  async doCheckin() {
    // 获取云端签到状态
    const status = await this.gameState.checkCloudCheckinStatus()
    
    if (status.canCheckin) {
      // 执行云端签到
      const result = await this.gameState.doCloudCheckin()
      if (result.success) {
        this.vibrate('medium')
        this.audioManager.play('success')
        this.uiManager.showToast(
          `签到成功！领取 ${result.reward.amount} 金币`
        )
        // 更新签到状态，让 UI 显示已签到
        this.gameState.hasCheckedInToday = true
        // 签到成功后不关闭弹窗，用户手动关闭
        return true
      } else {
        this.vibrate('light')
        this.uiManager.showToast(result.message)
        return false
      }
    } else {
      this.vibrate('light')
      this.uiManager.showToast('今天已经签到过了！')
      return false
    }
  }

  // 关闭签到弹窗
  closeCheckin() {
    this.audioManager.play('click')
    this.vibrate('light')
    this.uiManager.currentScreen = 'menu'
  }

  // 显示分享礼包（右上角图标）
  async showShare() {
    this.vibrate('light')
    
    // 检查今天是否已领取
    if (!this.gameState.canShareGift()) {
      this.uiManager.showToast('今日分享礼包已领取')
      return
    }
    
    // 显示分享礼包弹窗
    this.uiManager.currentScreen = 'share'
  }
  
  // 快速分享（底部分享按钮）
  async handleQuickShare() {
    this.vibrate('light')
    
    // 检查每日分享次数限制
    const todayShareCount = this.gameState.getTodayShareCount()
    if (todayShareCount >= config.game.maxShareCountPerDay) {
      this.uiManager.showToast('今日分享次数已达上限')
      return
    }
    
    try {
      // 调用微信分享 API
      const shareResult = await wechatAPI.shareToChat({
        title: '来挑战 POPIT 记忆大师！',
        imageUrl: '',
        query: `wave=${this.gameState.wave}&score=${this.gameState.score}`
      })
      
      console.log('分享成功:', shareResult)
      
      // 记录分享次数并发放奖励
      this.gameState.recordShare()
      
      // 确保回到菜单界面
      this.uiManager.currentScreen = 'menu'
      
      // 显示奖励提示（底部 Toast）
      this.uiManager.showToast('分享成功！金币 +50 🪙')
      
      // 同步到云端（异步）
      this.gameState.updateCloudGameData({ addCoins: config.rewards.share }).catch(() => {})
    } catch (err) {
      console.error('分享失败:', err)
      this.uiManager.showToast('分享失败')
    }
  }
  
  // 处理微信分享（分享礼包弹窗中的分享按钮）
  async handleWechatShare() {
    this.vibrate('light')
    
    try {
      // 调用微信分享 API
      await wechatAPI.shareToChat({
        title: '来挑战 POPIT 记忆大师！',
        imageUrl: '',
        query: `wave=${this.gameState.wave}&score=${this.gameState.score}`
      })
      
      // 分享成功后发放奖励
      const reward = this.gameState.claimShareGift()
      
      // 自动关闭弹窗，回到首页
      this.uiManager.currentScreen = 'menu'
      
      // 显示奖励提示
      this.uiManager.showToast(`分享成功！金币 +${reward.amount} 🪙`)
      
      // 同步到云端（异步）
      this.gameState.updateCloudGameData({ addCoins: reward.amount })
    } catch (err) {
      console.error('分享失败:', err)
      this.uiManager.showToast('分享失败，请重试')
    }
  }

  // 开始游戏循环
  start() {
    this.isRunning = true
    this.lastTime = Date.now()
    this.gameLoop()
  }

  // 游戏循环
  gameLoop() {
    if (!this.isRunning) return
    
    const now = Date.now()
    const deltaTime = now - this.lastTime
    this.lastTime = now
    
    // 更新
    this.update(deltaTime)
    
    // 渲染
    this.render()
    
    // 继续循环
    safeRequestAnimationFrame(() => this.gameLoop())
  }

  // 更新
  update(deltaTime) {
    this.bubbleGrid.update(deltaTime)
    this.uiManager.update(deltaTime)
  }

  // 渲染
  render() {
    // 清除画布
    this.ctx.clearRect(0, 0, this.width, this.height)
    
    // 始终渲染背景（无论哪个界面）
    this.bubbleGrid.drawBackground()
    
    // 只在游戏界面渲染泡泡网格
    if (this.gameState.phase === 'OBSERVE' || this.gameState.phase === 'PLAY') {
      this.bubbleGrid.drawBubbles()
    }
    
    // 渲染 UI
    this.uiManager.render(this.gameState)
  }
}
