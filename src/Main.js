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
    
    // 初始化云开发（可选功能，失败不影响游戏）
    try {
      wx.cloud.init({
        env: config.cloudEnv,
        traceUser: true
      })
      console.log(`云开发初始化成功 (环境：${config.env})`)
      this.cloudInitialized = true
    } catch (err) {
      console.warn('云开发初始化失败，使用纯本地模式:', err.message)
      this.cloudInitialized = false
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
    
    // 分享发奖状态（微信已移除 shareAppMessage 的 success 回调）
    this.pendingShare = null
    this.shareReturnTimer = null
    this.shareShowTimer = null
    this.sharePollTimer = null
    
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
    
    // 不再自动同步云端数据，完全使用本地数据
    // 本地数据优先，云端仅作为备份，不主动同步
    console.log('使用本地数据，云端同步已禁用')
    
    // 开始游戏循环
    this.start()
  }
  
  /**
   * 绑定游戏生命周期事件
   */
  bindLifecycleEvents() {
    // 游戏隐藏（切换到后台）时不再同步数据
    // 数据完全保存在本地，不需要主动同步
    wx.onHide(() => {
      if (this.pendingShare) {
        this.pendingShare.sawHide = true
        this.pendingShare.hiddenAt = Date.now()
      }
      // 不再调用 syncPendingData，数据只保存在本地
    })
    
    // 游戏显示（回到前台）时不再自动同步数据
    // 完全使用本地数据，避免频繁调用云函数
    wx.onShow(() => {
      if (this.shareShowTimer) {
        clearTimeout(this.shareShowTimer)
      }
      this.shareShowTimer = setTimeout(() => {
        this.onSharePanelClosed(false)
      }, 120)
      
      // 不再自动同步云端数据
      // 本地数据优先，云端仅作为备份
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
    
    // 分享返回后，部分机型 onShow 不触发；浮层分享需点击屏幕领取
    this.onSharePanelClosed(true)
    
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
    
    // 检查云开发是否已初始化
    if (!this.cloudInitialized) {
      console.warn('云开发未初始化，无法获取赛季排名')
      this.uiManager.showToast('云开发未初始化')
      this.uiManager.seasonLeaderboardData = null
      return
    }
    
    // 获取赛季排名数据（默认最高分）
    this.uiManager.seasonLeaderboardType = 'score'
    await this.refreshSeasonLeaderboard()
  }

  // 刷新赛季排名数据
  async refreshSeasonLeaderboard() {
    const result = await this.gameState.getSeasonData(this.uiManager.seasonLeaderboardType)
    
    if (result.success) {
      this.uiManager.seasonLeaderboardData = result.data
    } else {
      this.uiManager.showToast(result.message || '获取赛季排名失败')
      this.uiManager.seasonLeaderboardData = null
    }
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
    
    // 更新赛季数据
    await this.gameState.updateSeasonData(
      this.gameState.score,
      this.gameState.wave,
      1,  // 通关次数 +1
      this.gameState.consecutiveWins
    )
    
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
  navigateToMenu() {
    this.gameState.isNewScoreRecord = false
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

  // 显示排行榜（先同步数据，再获取排名）
  async showLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 切换到排行榜界面
    this.uiManager.currentScreen = 'leaderboard'
    
    // 检查云开发是否已初始化
    if (!this.cloudInitialized) {
      console.warn('云开发未初始化，无法获取排行榜')
      this.uiManager.showToast('云开发未初始化')
      this.uiManager.leaderboardData = null
      return
    }
    
    // 先同步本地数据到云端（5 分钟最多同步 1 次）
    const syncResult = await this.gameState.syncToCloud()
    if (!syncResult.success) {
      console.log('数据同步跳过:', syncResult.message)
    }
    
    // 获取排行榜数据（默认最高分）
    this.uiManager.leaderboardType = 'score'
    await this.refreshLeaderboard()
  }

  // 刷新排行榜数据
  async refreshLeaderboard() {
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

  // 执行签到（完全本地处理，不调用云函数）
  async doCheckin() {
    // 使用本地签到逻辑
    const result = this.gameState.doLocalCheckin()
    
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
  
  clearShareState() {
    if (this.shareReturnTimer) {
      clearTimeout(this.shareReturnTimer)
      this.shareReturnTimer = null
    }
    if (this.sharePollTimer) {
      clearInterval(this.sharePollTimer)
      this.sharePollTimer = null
    }
    this.pendingShare = null
  }
  
  // 发起分享，返回游戏后本地发奖
  startShareForReward(type) {
    this.clearShareState()
    this.vibrate('light')
    
    const startedAt = Date.now()
    this.pendingShare = {
      type,
      startedAt,
      hiddenAt: null,
      sawHide: false,
      armed: false,
      granted: false
    }
    
    wx.shareAppMessage({
      title: '来挑战 POPIT 记忆大师！',
      query: `wave=${this.gameState.wave}&score=${this.gameState.score}`
    })
    
    // 分享面板弹出后再开始判定，避免打开面板时的 onShow 误触发
    setTimeout(() => {
      if (this.pendingShare && this.pendingShare.startedAt === startedAt) {
        this.pendingShare.armed = true
        this.sharePollTimer = setInterval(() => {
          this.onSharePanelClosed(false)
        }, 250)
      }
    }, 400)
    
    this.shareReturnTimer = setTimeout(() => {
      this.clearShareState()
    }, 60000)
  }
  
  // 分享面板关闭后尝试发奖（fromTouch：用户点击屏幕触发）
  onSharePanelClosed(fromTouch = false) {
    const pending = this.pendingShare
    if (!pending || !pending.armed || pending.granted) {
      return
    }
    
    const elapsed = Date.now() - pending.startedAt
    
    // 分享面板刚弹出，忽略
    if (elapsed < 400) {
      return
    }
    
    // 很快回到游戏且未离开过小游戏，视为取消
    if (elapsed < 700 && !pending.sawHide) {
      this.clearShareState()
      return
    }
    
    const leftApp = pending.sawHide
    
    // 切到微信聊天再返回：可自动发奖（用户确实进行了分享操作）
    if (leftApp && pending.hiddenAt) {
      const awayMs = Date.now() - pending.hiddenAt
      if (awayMs < 300) {
        this.clearShareState()
        return
      }
      if (elapsed >= 500) {
        this.applyShareReward(pending.type)
      }
      return
    }
    
    // 分享浮层未触发 onHide：需要用户点击屏幕确认，并且离开时间足够长才发奖
    // 避免用户只是打开分享面板就关闭也发奖
    if (fromTouch && elapsed >= 1000 && leftApp) {
      // 只有确实离开过小游戏（触发 onHide）才发奖
      this.applyShareReward(pending.type)
    } else if (fromTouch) {
      // 用户点击屏幕但无法确认是否分享，清除状态不发奖
      console.log('无法确认分享是否成功，不发奖')
      this.clearShareState()
    }
  }
  
  // 发放分享奖励（仅本地）
  applyShareReward(type) {
    if (this.pendingShare?.granted) {
      return
    }
    
    if (this.pendingShare) {
      this.pendingShare.granted = true
    }
    this.clearShareState()
    
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
