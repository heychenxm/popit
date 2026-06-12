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
    
    // 头像昵称填写组件引用
    this.avatarButton = null
    this.nicknameInput = null
    this.showingAvatarPicker = false
    
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
    
    // 从云端加载数据（异步，不阻塞游戏启动）
    this.gameState.loadCloudData()
    
    // 阶段 1：立即创建必要的缓存（背景）
    this.bubbleGrid.createBgCache()
    
    // 开始游戏循环（先启动，保证快速响应）
    this.start()
    
    // 阶段 2：延迟创建非必要的缓存（使用 requestIdleCallback 或 setTimeout）
    this.createDeferredCaches()
  }
  
  // 延迟创建缓存（在空闲时执行）
  createDeferredCaches() {
    // 使用 requestIdleCallback（如果可用）或 setTimeout
    const scheduleTask = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb) => setTimeout(cb, 100)
    
    scheduleTask(() => {
      // 创建玻璃框网格缓存
      this.bubbleGrid.createGlassGridCache()
      console.log('玻璃框网格缓存创建完成')
    })
    
    scheduleTask(() => {
      // 创建 UI 缓存
      this.uiManager.createMenuCache()
      console.log('UI 缓存创建完成')
    }, 50)
  }
  
  /**
   * 绑定游戏生命周期事件
   */
  bindLifecycleEvents() {
    // 游戏隐藏（切换到后台）—— 不再自动保存
    wx.onHide(() => {
      console.log('游戏隐藏')
      // 不再自动保存到云端
    })
    
    // 游戏显示（回到前台）
    wx.onShow(() => {
      console.log('游戏显示')
    })
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
        title: '来挑战泡泡大师！',
        query: `score=${this.gameState.score}&wave=${this.gameState.wave}`
      }
    })
  }

  // 绑定事件
  bindEvents() {
    // 触摸开始
    wx.onTouchStart((e) => {
      if (this.gameState.phase === 'PLAY' && !this.gameState.isPaused) {
        // PLAY 阶段：最多处理2个触摸点，支持多点触控
        const count = Math.min(e.touches.length, 2)
        for (let i = 0; i < count; i++) {
          const touch = e.touches[i]
          const x = touch.clientX || touch.x || 0
          const y = touch.clientY || touch.y || 0
          this.handleTouchStart(x, y)
        }
      } else {
        // 其他阶段：单点触控
        if (e.touches.length > 0) {
          const touch = e.touches[0]
          const x = touch.clientX || touch.x || 0
          const y = touch.clientY || touch.y || 0
          this.handleTouchStart(x, y)
        }
      }
    })
    
    // 触摸结束
    wx.onTouchEnd((e) => {
      // 可以在这里添加触摸结束逻辑
    })
  }

  // 处理触摸开始
  handleTouchStart(x, y) {
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
    
    // 检查是否在赛季排名界面
    if (this.uiManager.currentScreen === 'season_leaderboard') {
      this.handleSeasonLeaderboardTouch(x, y)
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
        this.uiManager.showToast('先记住闪烁气泡的位置哦~')
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

  // 处理赛季排名触摸
  async handleSeasonLeaderboardTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      switch (buttonId) {
        case 'close':
          this.closeSeasonLeaderboard()
          break
        case 'season_leaderboard_score':
          await this.switchSeasonLeaderboardType('score')
          break
        case 'season_leaderboard_wave':
          await this.switchSeasonLeaderboardType('wave')
          break
      }
    }
  }

  // 显示赛季排名
  async showSeasonLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 切换到赛季排名界面
    this.uiManager.currentScreen = 'season_leaderboard'
    
    // 获取赛季排名数据（默认最高分）
    this.uiManager.seasonLeaderboardType = 'score'
    await this.refreshSeasonLeaderboard()
  }

  // 刷新赛季排名数据
  async refreshSeasonLeaderboard() {
    // 设置加载状态
    this.uiManager.seasonLeaderboardLoading = true
    
    const result = await this.gameState.getSeasonData(this.uiManager.seasonLeaderboardType)
    
    if (result.success) {
      this.uiManager.seasonLeaderboardData = result.data
    } else {
      this.uiManager.showToast(result.message || '获取赛季排名失败')
      this.uiManager.seasonLeaderboardData = null
    }
    
    // 清除加载状态
    this.uiManager.seasonLeaderboardLoading = false
  }

  // 切换赛季排名类型
  async switchSeasonLeaderboardType(type) {
    if (this.uiManager.seasonLeaderboardType === type) return
    
    this.uiManager.seasonLeaderboardType = type
    this.audioManager.play('click')
    this.vibrate('light')
    
    await this.refreshSeasonLeaderboard()
  }

  // 关闭赛季排名
  closeSeasonLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    this.uiManager.currentScreen = 'menu'
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
          this.showLeaderboard()
          break
        case 'leaderboard_detail':
          this.showSeasonLeaderboard()
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
        case 'authorize':
          // 授权按钮：请求获取用户昵称和头像
          this.handleAuthorize()
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
    this.gameState.isNewScoreRecord = false
    this.gameState.reset()
    this.gameState.incrementSeasonGames()
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 开始游戏
  startGame() {
    this.gameState.reset()
    this.gameState.incrementSeasonGames()
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
    
    // 高亮目标泡泡（根据索引分配颜色）- 观察阶段，气泡会闪动
    this.gameState.targets.forEach((targetIdx) => {
      const colorClass = getColorClass(targetIdx)
      // 使用 'observing' 状态标记，表示正在观察阶段（会闪动）
      this.bubbleGrid.setBubbleStateForObserving(targetIdx, colorClass)
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
        // 生命归零，游戏失败
        this.onGameFail()
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
    
    // ✅ 优化：只更新本地数据，不调用云函数
    this.gameState.updateSeasonDataLocal(
      this.gameState.score,
      this.gameState.wave,
      1,  // 通关次数 +1
      this.gameState.consecutiveWins
    )
    
    // 不再每关都保存，等待用户点击"返回首页"时统一保存
    
    // 检查是否显示胜利弹窗（在保存之前判断）
    const modalType = this.shouldShowVictoryModal()
    const isNewScoreRecord = this.gameState.isNewHighScore()
    this.gameState.isNewScoreRecord = modalType ? isNewScoreRecord : false
    
    // 设置胜利状态（用于 saveHighScore 判断）
    this.setGameState('WIN', 'win')
    
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

  // 游戏失败（生命归零等）
  onGameFail({ playFeedback = false } = {}) {
    if (playFeedback) {
      this.audioManager.play('wrong')
      this.vibrate('heavy')
    }
    
    // 与本局开始时的历史最高分比较，避免关卡中途已更新 highScore 导致判断失效
    this.gameState.isNewScoreRecord = this.gameState.isNewHighScore()
    this.gameState.resetConsecutiveWins()
    this.setGameState('FAIL', 'fail')
    this.uiManager.showToast(`本局得分：${this.gameState.score}`)
    
    // 保存最高分
    this.gameState.saveHighScore().catch(err => {
      console.error('保存最高分失败:', err)
    })
  }

  // 处理游戏结束
  handleGameOver() {
    this.onGameFail({ playFeedback: true })
  }

  // 下一关
  nextLevel() {
    this.gameState.isNewScoreRecord = false
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
      this.gameState.isNewScoreRecord = false
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
  async navigateToMenu() {
    this.gameState.isNewScoreRecord = false
    this.gameState.resetToMenu()
    
    // 返回首页时同步数据到云端
    await this.gameState.saveToCloud()
    
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
    // 设置加载状态
    this.uiManager.leaderboardLoading = true
    
    const result = await this.gameState.getLeaderboard(this.uiManager.leaderboardType)
    
    if (result.success) {
      this.uiManager.leaderboardData = result.data
      // 显示同步状态
      if (result.fromCache) {
        console.log('使用缓存的排行榜数据')
      }
    } else {
      this.uiManager.showToast(result.message || '获取排行榜失败')
      this.uiManager.leaderboardData = null
    }
    
    // 清除加载状态
    this.uiManager.leaderboardLoading = false
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

  // 执行签到（优先云端，降级本地）
  async doCheckin() {
    const result = await this.gameState.doCloudCheckin()
    
    if (result) {
      this.vibrate('medium')
      this.audioManager.play('success')
      this.uiManager.showToast(
        `签到成功！领取 ${result.amount} ${result.type === 'gem' ? '宝石 💎' : '金币'}`
      )
      return true
    } else {
      this.vibrate('light')
      this.uiManager.showToast('签到失败')
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
  
  // 发起分享，调用成功即发奖
  startShareForReward(type) {
    this.vibrate('light')
    
    wx.shareAppMessage({
      title: '来挑战泡泡大师！',
      query: `wave=${this.gameState.wave}&score=${this.gameState.score}`
    })
    
    // 分享调用成功即发奖
    this.applyShareReward(type)
  }
  
  // 发放分享奖励（仅本地）
  applyShareReward(type) {
    if (type === 'quick') {
      if (this.gameState.getTodayShareCount() >= config.game.maxShareCountPerDay) {
        this.uiManager.showToast('今日分享次数已达上限')
        return
      }
      this.gameState.recordShare()
      this.uiManager.currentScreen = 'menu'
      this.uiManager.showToast(`分享成功！金币 +${config.rewards.share}`)
      return
    }
    
    if (type === 'gift') {
      if (!this.gameState.canShareGift()) {
        this.uiManager.showToast('今日分享礼包已领取')
        this.uiManager.currentScreen = 'menu'
        return
      }
      this.gameState.claimShareGift()
      this.uiManager.currentScreen = 'menu'
      this.uiManager.showToast(`分享成功！金币 +${config.rewards.shareGift}`)
    }
  }

  // 快速分享（底部分享按钮）
  handleQuickShare() {
    if (this.gameState.getTodayShareCount() >= config.game.maxShareCountPerDay) {
      this.uiManager.showToast('今日分享次数已达上限')
      return
    }
    
    this.startShareForReward('quick')
  }
  
  // 处理微信分享（分享礼包弹窗中的分享按钮）
  handleWechatShare() {
    if (!this.gameState.canShareGift()) {
      this.uiManager.showToast('今日分享礼包已领取')
      this.uiManager.currentScreen = 'menu'
      return
    }
    
    this.startShareForReward('gift')
  }

  // 处理用户授权（获取昵称和头像）
  handleAuthorize() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 获取基础库版本
    const systemInfo = wx.getSystemInfoSync()
    const version = systemInfo.SDKVersion || ''
    const [major, minor] = version.split('.').map(Number)
    const isOldVersion = major < 2 || (major === 2 && minor < 27)
    
    if (isOldVersion) {
      // 低版本微信：使用 wx.getUserProfile（可以弹出授权弹窗）
      wx.getUserProfile({
        desc: '用于完善用户资料和排行榜展示',
        success: (res) => {
          const userInfo = res.userInfo
          this.saveAndSyncUserInfo(userInfo.nickName, userInfo.avatarUrl)
        },
        fail: (err) => {
          console.log('用户拒绝授权')
          this.uiManager.showToast('已取消授权')
        }
      })
    } else {
      // 高版本微信：wx.getUserProfile 已失效，返回默认值
      // 提示用户手动选择头像和填写昵称
      this.uiManager.showToast('请点击头像和昵称进行设置')
      
      // 尝试获取，如果返回的是默认值则提示
      wx.getUserProfile({
        desc: '用于完善用户资料和排行榜展示',
        success: (res) => {
          const userInfo = res.userInfo
          // 检查是否返回默认值（微信用户 + 灰色头像）
          const isDefault = userInfo.nickName === '微信用户' || 
                           !userInfo.avatarUrl || 
                           userInfo.avatarUrl.includes('default') ||
                           userInfo.avatarUrl.includes('anonymous')
          
          if (isDefault) {
            // 高版本已无法通过 API 获取，提示用户使用头像昵称填写组件
            this.uiManager.showToast('请使用下方头像和昵称组件设置')
            // 显示头像昵称填写组件（如果已实现）
            this.showAvatarNicknamePicker()
          } else {
            this.saveAndSyncUserInfo(userInfo.nickName, userInfo.avatarUrl)
          }
        },
        fail: (err) => {
          console.log('授权失败，显示填写组件')
          this.showAvatarNicknamePicker()
        }
      })
    }
  }
  
  // 保存用户信息并同步到云端（仅在授权时调用）
  saveAndSyncUserInfo(nickname, avatarUrl) {
    this.gameState.saveUserProfileLocally(nickname, avatarUrl)
    this.uiManager.showToast('设置成功！')
    // 立即保存到云端（只保存用户信息）
    this.gameState.saveUserProfileToCloud().catch(() => {})
  }
  
  // 显示头像昵称选择组件（高版本微信降级方案）
  showAvatarNicknamePicker() {
    if (this.showingAvatarPicker) return // 防止重复创建
    
    this.showingAvatarPicker = true
    
    const systemInfo = wx.getSystemInfoSync()
    const windowWidth = systemInfo.windowWidth
    const windowHeight = systemInfo.windowHeight
    
    // 创建半透明遮罩
    const mask = wx.createInput({
      type: 'text',
      style: {
        left: 0,
        top: 0,
        width: windowWidth,
        height: windowHeight,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderWidth: 0,
        borderColor: 'transparent'
      }
    })
    
    // 点击遮罩关闭
    mask.onTap(() => {
      this.hideAvatarNicknamePicker()
    })
    
    // 创建头像选择按钮
    const btnWidth = 200
    const btnHeight = 44
    const avatarBtnX = (windowWidth - btnWidth) / 2
    const avatarBtnY = windowHeight * 0.45
    
    this.avatarButton = wx.createButton({
      type: 'text',
      text: '选择头像',
      style: {
        left: avatarBtnX,
        top: avatarBtnY,
        width: btnWidth,
        height: btnHeight,
        backgroundColor: '#6366f1',
        color: '#ffffff',
        fontSize: 14,
        borderRadius: 22,
        textAlign: 'center',
        lineHeight: btnHeight
      }
    })
    
    this.avatarButton.onTap(() => {
      // 调用 chooseAvatar API
      wx.chooseAvatar({
        success: (res) => {
          const avatarUrl = res.avatarUrl
          // 保存头像（不立即同步到云端）
          this.gameState.saveUserProfileLocally(
            this.gameState.userInfo.nickname,
            avatarUrl
          )
          this.uiManager.showToast('头像设置成功！')
          // 不立即同步，等待用户点击完成按钮时统一保存
          this.hideAvatarNicknamePicker()
        },
        fail: (err) => {
          console.log('选择头像失败', err)
          this.uiManager.showToast('已取消选择')
        }
      })
    })
    
    // 创建昵称输入框
    const inputWidth = 240
    const inputHeight = 40
    const inputX = (windowWidth - inputWidth) / 2
    const inputY = avatarBtnY + 70
    
    this.nicknameInput = wx.createInput({
      type: 'text',
      value: this.gameState.userInfo.nickname || '',
      placeholder: '请输入昵称',
      style: {
        left: inputX,
        top: inputY,
        width: inputWidth,
        height: inputHeight,
        backgroundColor: '#ffffff',
        color: '#333333',
        fontSize: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#cccccc',
        textAlign: 'center'
      }
    })
    
    this.nicknameInput.onTap(() => {
      // 输入框获得焦点
    })
    
    this.nicknameInput.onConfirm((res) => {
      const nickname = res.value.trim()
      if (nickname) {
        // 保存昵称（不立即同步到云端）
        this.gameState.saveUserProfileLocally(
          nickname,
          this.gameState.userInfo.avatarUrl
        )
        this.uiManager.showToast('昵称设置成功！')
        // 不立即同步，等待用户点击完成按钮时统一保存
        this.hideAvatarNicknamePicker()
      } else {
        this.uiManager.showToast('昵称不能为空')
      }
    })
    
    // 创建确认按钮
    const confirmBtn = wx.createButton({
      type: 'text',
      text: '完成设置',
      style: {
        left: avatarBtnX,
        top: inputY + 60,
        width: btnWidth,
        height: btnHeight,
        backgroundColor: '#10b981',
        color: '#ffffff',
        fontSize: 14,
        borderRadius: 22,
        textAlign: 'center',
        lineHeight: btnHeight
      }
    })
    
    confirmBtn.onTap(() => {
      const nickname = this.nicknameInput ? this.nicknameInput.getValue() : ''
      if (nickname && nickname.trim()) {
        // 保存用户信息并同步到云端
        this.gameState.saveUserProfileLocally(
          nickname.trim(),
          this.gameState.userInfo.avatarUrl
        )
        this.uiManager.showToast('设置成功！')
        // 只在点击完成按钮时同步到云端（只保存用户信息）
        this.gameState.saveUserProfileToCloud().catch(() => {})
      }
      this.hideAvatarNicknamePicker()
    })
    
    // 存储遮罩引用以便销毁
    this._avatarPickerMask = mask
    this._avatarPickerConfirm = confirmBtn
  }
  
  // 隐藏头像昵称填写组件
  hideAvatarNicknamePicker() {
    this.showingAvatarPicker = false
    
    // 销毁所有组件
    if (this.avatarButton) {
      this.avatarButton.destroy()
      this.avatarButton = null
    }
    if (this.nicknameInput) {
      this.nicknameInput.destroy()
      this.nicknameInput = null
    }
    if (this._avatarPickerMask) {
      this._avatarPickerMask.destroy()
      this._avatarPickerMask = null
    }
    if (this._avatarPickerConfirm) {
      this._avatarPickerConfirm.destroy()
      this._avatarPickerConfirm = null
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

