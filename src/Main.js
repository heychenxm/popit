import { GameState } from './GameState.js'
import { AudioManager } from './AudioManager.js'
import { BubbleGrid } from './BubbleGrid.js'
import { UIManager } from './UIManager.js'
import { wechatAPI } from './WechatAPI.js'
import { getUniqueRandomIndices } from './utils.js'

/**
 * 游戏主类 - 整合所有模块
 */
export class Main {
  constructor() {
    // 初始化微信 API
    wechatAPI.init()
    
    // 初始化云开发（替换为你的云环境 ID）
    try {
      wx.cloud.init({
        env: 'cloud1-d2gbhgc8abb1ab532', // TODO: 替换为实际的云环境 ID
        traceUser: true
      })
      console.log('云开发初始化成功')
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
    
    // 同步云端数据（异步，不阻塞游戏启动）
    this.gameState.syncCloudData().then(() => {
      console.log('云端数据同步完成')
    }).catch(err => {
      console.error('云端数据同步失败:', err)
    })
    
    // 开始游戏循环
    this.start()
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
    // 触摸开始（支持多点触控）
    wx.onTouchStart((e) => {
      // 只在游戏阶段处理多点触控
      if (this.gameState.phase === 'PLAY') {
        // 限制最多处理 3 个触摸点
        const maxTouches = Math.min(e.touches.length, 3)
        for (let i = 0; i < maxTouches; i++) {
          const touch = e.touches[i]
          const x = touch.clientX || touch.x || 0
          const y = touch.clientY || touch.y || 0
          this.handleTouchStart(x, y, i) // 传入触摸点索引
        }
      } else if (e.touches.length > 0) {
        // 非游戏阶段，只处理第一个触摸点
        const touch = e.touches[0]
        const x = touch.clientX || touch.x || 0
        const y = touch.clientY || touch.y || 0
        this.handleTouchStart(x, y, 0)
      }
    })
    
    // 触摸结束
    wx.onTouchEnd((e) => {
      // 可以在这里添加触摸结束逻辑
    })
  }

  // 处理触摸开始
  handleTouchStart(x, y, touchIndex = 0) {
    // 暂停状态优先处理
    if (this.gameState.isPaused) {
      this.handlePauseTouch(x, y)
      return
    }
    
    switch (this.gameState.phase) {
      case 'MENU':
        this.handleMenuTouch(x, y)
        break
      case 'OBSERVE':
        // 观察阶段不允许点击
        break
      case 'PLAY':
        this.handleGameTouch(x, y, touchIndex)
        break
      case 'WIN':
        this.handleWinTouch(x, y)
        break
      case 'FAIL':
        this.handleFailTouch(x, y)
        break
    }
  }

  // 处理主菜单触摸
  handleMenuTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
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
        case 'share_gift':
          this.showShare()
          break
      }
    }
  }

  // 处理游戏触摸（支持多点触控）
  handleGameTouch(x, y, touchIndex = 0) {
    // 检查是否点击暂停按钮（只有第一个触摸点有效）
    if (touchIndex === 0) {
      const buttonId = this.uiManager.handleTouch(x, y)
      if (buttonId === 'pause') {
        this.audioManager.play('click')
        this.vibrate()
        this.pauseGame()
        return
      }
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
        // 处理气泡点击（传入是否第一个触摸点，控制音效和震动）
        this.handleBubbleClick(bubbleIndex, touchIndex === 0)
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
    this.gameState.phase = 'OBSERVE'
    
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
    
    // 高亮目标泡泡（根据索引分配颜色，匹配 index_v1.0.1.html）
    this.gameState.targets.forEach((targetIdx, arrIndex) => {
      let colorClass = 'purple'
      if (targetIdx === 1) {
        colorClass = 'pink'
      } else if (targetIdx === 10) {
        colorClass = 'blue'
      } else {
        // 其他位置循环使用三种颜色
        const cycle = targetIdx % 3
        if (cycle === 0) colorClass = 'pink'
        else if (cycle === 1) colorClass = 'purple'
        else colorClass = 'blue'
      }
      this.bubbleGrid.setBubbleState(targetIdx, 'pink', colorClass)
    })
    
    // 设置计时器
    this.gameState.timerRemaining = this.gameState.observeDuration
    
    this.gameState.clearTimer()
    this.gameState.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.observeStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.observeDuration - elapsed)
      
      if (elapsed >= this.gameState.observeDuration) {
        this.gameState.clearTimer()
        this.startPlayPhase()
      }
    }, 30)
  }

  // 恢复观察阶段
  resumeObservePhase() {
    this.observeStartTime = Date.now() - (this.gameState.observeDuration - this.gameState.timerRemaining)
    
    this.gameState.clearTimer()
    this.gameState.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.observeStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.observeDuration - elapsed)
      
      if (elapsed >= this.gameState.observeDuration) {
        this.gameState.clearTimer()
        this.startPlayPhase()
      }
    }, 30)
  }

  // 开始游戏阶段
  startPlayPhase() {
    this.gameState.phase = 'PLAY'
    
    // 重置泡泡显示（隐藏目标）
    this.bubbleGrid.resetBubbles()
    
    // 开始倒计时
    this.gameState.timerRemaining = this.gameState.playDuration
    this.gameState.clearTimer()
    
    const playStartTime = Date.now()
    this.gameState.timerInterval = setInterval(() => {
      const elapsed = Date.now() - playStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.playDuration - elapsed)
      
      if (this.gameState.timerRemaining <= 0) {
        this.gameState.clearTimer()
        this.handleTimeOut()
      }
    }, 30)
  }

  // 恢复游戏阶段
  resumePlayPhase() {
    this.gameState.phase = 'PLAY'
    
    const playStartTime = Date.now() - (this.gameState.playDuration - this.gameState.timerRemaining)
    this.gameState.clearTimer()
    
    this.gameState.timerInterval = setInterval(() => {
      const elapsed = Date.now() - playStartTime
      this.gameState.timerRemaining = Math.max(0, this.gameState.playDuration - elapsed)
      
      if (this.gameState.timerRemaining <= 0) {
        this.gameState.clearTimer()
        this.handleTimeOut()
      }
    }, 30)
  }

  // 处理泡泡点击（支持多点触控）
  handleBubbleClick(index, playSoundAndVibrate = true) {
    if (this.gameState.phase !== 'PLAY' || this.gameState.activeWaveCompleted) return
    
    // 防止重复点击
    if (this.gameState.playerClicks.includes(index)) return
    
    // 检查是否正确
    if (this.gameState.targets.includes(index)) {
      // 正确！
      if (playSoundAndVibrate) {
        this.audioManager.play('pop')
        this.vibrate('light')
      }
      
      // 设置泡泡状态（根据索引分配颜色，匹配 index_v1.0.1.html）
      let colorClass = 'purple'
      if (index === 1) {
        colorClass = 'pink'
      } else if (index === 10) {
        colorClass = 'blue'
      } else {
        const cycle = index % 3
        if (cycle === 0) colorClass = 'pink'
        else if (cycle === 1) colorClass = 'purple'
        else colorClass = 'blue'
      }
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
      if (playSoundAndVibrate) {
        this.audioManager.play('wrong')
        this.vibrate('heavy')
      }
      
      // 显示红色闪烁
      this.bubbleGrid.setBubbleState(index, 'red', 'red')
      setTimeout(() => {
        this.bubbleGrid.setBubbleState(index, 'normal')
      }, 400)
      
      // 显示 Toast 提示，但不扣生命
      this.uiManager.showToast('点错了！')
    }
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
        this.gameState.phase = 'FAIL'
        this.uiManager.currentScreen = 'fail'
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
      this.uiManager.showToast(`连续 5 胜！恢复 1 生命 ❤️`)
    }
    
    // 发放通关奖励：50 金币
    this.gameState.addCoins(50)
    this.uiManager.showToast(`通关奖励：+50 金币 `)
    
    // 设置胜利状态（用于 saveHighScore 判断）
    this.gameState.phase = 'WIN'
    
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
      this.uiManager.currentScreen = 'win'
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
    this.gameState.phase = 'FAIL'
    this.uiManager.currentScreen = 'fail'
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
      this.uiManager.showToast(`金币不足或已达到购买上限（需要${currentPrice}金币）`)
    }
  }

  // 重新开始当前关卡（生命扣除后）
  restartCurrentWave() {
    // 重置关卡状态
    this.gameState.activeWaveCompleted = false
    this.gameState.playerClicks = []
    this.gameState.phase = 'OBSERVE'
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
  showLeaderboard() {
    this.uiManager.showToast('排行榜功能开发中...')
    // TODO: 实现排行榜功能
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
    // 获取云端签到状态
    const status = await this.gameState.checkCloudCheckinStatus()
    
    if (status.canCheckin) {
      // 执行云端签到
      const result = await this.gameState.doCloudCheckin()
      if (result.success) {
        this.vibrate('medium')
        this.uiManager.showToast(
          `签到成功！领取 ${result.reward.amount}${result.reward.type === 'coin' ? '金币' : '宝石'}`
        )
      } else {
        this.vibrate('light')
        this.uiManager.showToast(result.message)
      }
    } else {
      this.vibrate('light')
      this.uiManager.showToast('今天已经签到过了！')
    }
  }

  // 显示分享
  showShare() {
    this.vibrate('light')
    this.uiManager.showToast('分享功能开发中...')
    // TODO: 实现分享功能
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
    requestAnimationFrame(() => this.gameLoop())
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
