import { GameState } from './GameState.js'
import { AudioManager } from './AudioManager.js'
import { BubbleGrid } from './BubbleGrid.js'
import { UIManager } from './UIManager.js'
import { wechatAPI } from './WechatAPI.js'
import { FRIEND_RANK_LAYOUT } from './FriendLeaderboard.js'
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
    
    // 延迟定时器（用于清理）
    this._pendingTimers = []
    
    // 隐私合规授权标记
    this._privacyAuthorized = false
    
    // 开放数据域 sharedCanvas（用于好友排行榜）
    this.sharedCanvas = null
    this._initSharedCanvas()
    
    // 好友排行榜滚动状态（滚动位置由开放数据域持有并钳制，主域只转发增量）
    this.friendListTouchStartY = 0
    this.friendListLastY = 0
    this.friendListIsScrolling = false
    
    // 头像昵称填写组件引用
    this.showingAvatarPicker = false
    this._userInfoButton = null
    
    // 分享冷却时间戳
    this._lastShareTime = 0
    
    // 激励视频广告
    this._rewardedVideoAd = null
    this._initRewardedVideoAd()
    
    // 签到激励视频广告
    this._checkinRewardedVideoAd = null
    this._initCheckinRewardedVideoAd()
    
    // 初始化
    this.init()
  }

  // 初始化
  async init() {
    try {
      // 设置屏幕常亮
      wechatAPI.keepScreenOn(true)
      
      // 设置分享
      this.setupShare()
      
      // 绑定触摸事件
      this.bindEvents()
      
      // 绑定游戏生命周期事件
      this.bindLifecycleEvents()
      
      // 从云端加载数据（异步，不阻塞游戏启动）
      this.gameState.loadCloudData().then(() => {
        // 赛季奖励到账提示
        const reward = this.gameState.checkPendingSeasonReward()
        if (reward && reward.reward > 0) {
          this.uiManager.showToast(`赛季奖励 +${reward.reward} 金币已到账`)
          this.gameState.clearSeasonReward()
        }
        // 云端赛季分加载后刷新本局对照基准（仍在菜单时）
        if (this.gameState.phase === 'MENU') {
          this.gameState.sessionStartSeasonScore = this.gameState.seasonData.seasonScore || 0
          this.gameState.sessionStartHighScore = this.gameState.highScore || 0
        }
      }).catch(() => {})
      
      // 阶段 1：立即创建必要的缓存（背景）
      this.bubbleGrid.createBgCache()
      
      // 开始游戏循环（先启动，保证快速响应）
      this.start()

      // 游戏初始化时拉起隐私合规弹窗和好友关系授权弹窗（非阻塞）
      this._initPrivacyAuthorize()
      // this._initFriendAuthorize()

      // 阶段 2：延迟创建非必要的缓存（使用 requestIdleCallback 或 setTimeout）
      this.createDeferredCaches()
    } catch (error) {
      console.error('初始化失败:', error)
      // 即使初始化失败，也尝试启动游戏循环
      this.start()
    }
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
   * 初始化开放数据域 sharedCanvas
   * sharedCanvas 的宽高只能在主域设置；使用固定视口，滚动在开放数据域内完成
   */
  _initSharedCanvas() {
    if (typeof wx === 'undefined' || typeof wx.getOpenDataContext !== 'function') return
    
    try {
      const openDataContext = wx.getOpenDataContext()
      this.sharedCanvas = openDataContext.canvas
      
      // 按设备像素比放大（高清渲染），尺寸与开放数据域布局常量一致
      const dpr = this.pixelRatio || 2
      this.sharedCanvas.width = FRIEND_RANK_LAYOUT.width * dpr
      this.sharedCanvas.height = FRIEND_RANK_LAYOUT.height * dpr
      
      console.log('sharedCanvas 初始化完成, 物理尺寸:', this.sharedCanvas.width, 'x', this.sharedCanvas.height)
    } catch (e) {
      console.warn('初始化 sharedCanvas 失败:', e)
    }
  }

  /**
   * 初始化激励视频广告
   */
  _initRewardedVideoAd() {
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return
    
    try {
      this._rewardedVideoAd = wx.createRewardedVideoAd({
        adUnitId: config.game.rewardedVideoAdUnitId
      })
      
      this._rewardedVideoAd.onError((err) => {
        console.warn('激励视频广告加载失败:', err)
      })
    } catch (e) {
      console.warn('创建激励视频广告失败:', e)
    }
  }

  /**
   * 初始化签到激励视频广告
   */
  _initCheckinRewardedVideoAd() {
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return
    
    try {
      this._checkinRewardedVideoAd = wx.createRewardedVideoAd({
        adUnitId: config.checkin.rewardedVideoAdUnitId
      })
      
      this._checkinRewardedVideoAd.onError((err) => {
        console.warn('签到激励视频广告加载失败:', err)
      })
    } catch (e) {
      console.warn('创建签到激励视频广告失败:', e)
    }
  }

  /**
   * 绑定游戏生命周期事件
   */
  bindLifecycleEvents() {
    // 游戏隐藏（切换到后台）
    wx.onHide(() => {
      console.log('游戏隐藏')
      this.gameState._flushStorageWrites()

      // 对局中切后台自动暂停，避免回来后倒计时瞬间超时
      if (!this.gameState.isPaused
          && (this.gameState.phase === 'OBSERVE' || this.gameState.phase === 'PLAY'
              || this.gameState.phase === 'COUNTDOWN')
          && this.uiManager.currentScreen === 'game') {
        this.pauseGame()
      }
    })
    
    // 游戏显示（回到前台）
    wx.onShow(() => {
      console.log('游戏显示')

      // 刷新赛季信息（防止挂机跨周）
      if (this.gameState && typeof this.gameState.initSeasonInfo === 'function') {
        const prevSeasonId = this.gameState.seasonInfo && this.gameState.seasonInfo.currentSeasonId
        this.gameState.initSeasonInfo()
        const nextSeasonId = this.gameState.seasonInfo && this.gameState.seasonInfo.currentSeasonId
        if (prevSeasonId && nextSeasonId && prevSeasonId !== nextSeasonId) {
          this.gameState.checkAndSettleSeason().catch(() => {})
        }
      }
      
      if (this._shareReviveTimeout) {
        clearTimeout(this._shareReviveTimeout)
        this._shareReviveTimeout = null
      }
      
      if (this.gameState.isWaitingShareRevive) {
        this.gameState.isWaitingShareRevive = false
        this.executeShareRevive()
      }
    })
  }

  // 设置分享
  setupShare() {
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
        success: () => {
          console.log('分享菜单设置成功')
        },
        fail: (err) => {
          console.warn('分享菜单设置失败:', err)
        }
      })
      
      // 监听分享
      wx.onShareAppMessage(() => {
        return {
          title: '来挑战泡泡大师！',
          query: `score=${this.gameState.score}&wave=${this.gameState.wave}`
        }
      })
    } catch (error) {
      console.warn('设置分享失败:', error)
    }
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
    
    // 触摸移动（用于好友排行榜滚动）
    wx.onTouchMove((e) => {
      if (this.uiManager.currentScreen === 'friend_leaderboard' && e.touches.length > 0) {
        const touch = e.touches[0]
        const y = touch.clientY || touch.y || 0
        this.handleFriendLeaderboardTouchMove(y)
      }
    })
    
    // 触摸结束
    wx.onTouchEnd((e) => {
      if (this.uiManager.currentScreen === 'friend_leaderboard') {
        this.friendListIsScrolling = false
      }
    })
  }

  // 处理触摸开始
  handleTouchStart(x, y) {
    // 暂停状态优先处理
    if (this.gameState.isPaused) {
      this.handlePauseTouch(x, y)
      return
    }
    
    // 检查是否在暂停界面
    if (this.uiManager.currentScreen === 'pause') {
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
    
    // 检查是否在好友排行榜界面
    if (this.uiManager.currentScreen === 'friend_leaderboard') {
      // 记录触摸起始位置（用于转发滚动增量）
      this.friendListTouchStartY = y
      this.friendListLastY = y
      this.friendListIsScrolling = false
      this.handleFriendLeaderboardTouch(x, y)
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
      case 'COUNTDOWN':
        // 倒计时阶段不允许点击，给出提示
        this.uiManager.showToast('倒计时结束后开始观察~')
        break
      case 'OBSERVE':
        // 观察阶段不允许点击，给出提示
        this.uiManager.showToast('先记住闪烁气泡的位置哦~')
        break
      case 'PLAY':
        this.handleGameTouch(x, y)
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
      this.audioManager.play('click')
      this.vibrate()
      
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
        case 'game_club':
          this.openGameClub()
          break
      }
    }
  }

  // 处理赛季排名触摸
  async handleSeasonLeaderboardTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      switch (buttonId) {
        case 'close':
          // 修复：如果在查看历史赛季，退出历史赛季模式
          if (this.uiManager.viewingSeasonArchive) {
            this.exitSeasonArchiveMode()
            this.uiManager.currentScreen = 'menu'
          } else {
            this.closeSeasonLeaderboard()
          }
          break
        case 'season_leaderboard_score':
          // 修复：区分当前赛季和历史赛季
          if (this.uiManager.viewingSeasonArchive) {
            await this.switchSeasonArchiveType('score')
          } else {
            await this.switchSeasonLeaderboardType('score')
          }
          break
        case 'season_leaderboard_wave':
          // 修复：区分当前赛季和历史赛季
          if (this.uiManager.viewingSeasonArchive) {
            await this.switchSeasonArchiveType('wave')
          } else {
            await this.switchSeasonLeaderboardType('wave')
          }
          break
        case 'game_club':
          this.openGameClub()
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
    this.uiManager.seasonLeaderboardLoading = true
    this.uiManager.seasonLeaderboardData = null
    
    const result = await this.gameState.getSeasonData(this.uiManager.seasonLeaderboardType)
    
    if (result.success) {
      this.uiManager.seasonLeaderboardData = result.data
    } else {
      this.uiManager.showToast(result.message || '获取赛季排名失败')
      this.uiManager.seasonLeaderboardData = {
        type: this.uiManager.seasonLeaderboardType,
        seasonId: this.gameState.seasonInfo.currentSeasonId,
        leaderboard: [],
        userRank: 0,
        userValue: 0
      }
    }
    
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

  // 查看历史赛季排行榜
  async showSeasonArchive(seasonId) {
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 切换到赛季排名界面
    this.uiManager.currentScreen = 'season_leaderboard'
    
    // 设置查看历史赛季模式
    this.uiManager.viewingSeasonArchive = true
    this.uiManager.archiveSeasonId = seasonId
    this.uiManager.seasonLeaderboardType = 'score'  // 默认显示分数榜
    
    // 加载历史赛季数据
    await this.refreshSeasonArchive()
  }

  // 刷新历史赛季数据
  async refreshSeasonArchive() {
    // 设置加载状态
    this.uiManager.seasonLeaderboardLoading = true
    
    const result = await this.gameState.getSeasonArchive(
      this.uiManager.archiveSeasonId,
      this.uiManager.seasonLeaderboardType
    )
    
    if (result.success) {
      this.uiManager.seasonLeaderboardData = result.data
    } else {
      this.uiManager.showToast(result.message || '获取历史赛季数据失败')
      this.uiManager.seasonLeaderboardData = null
    }
    
    // 清除加载状态
    this.uiManager.seasonLeaderboardLoading = false
  }

  // 切换历史赛季排名类型
  async switchSeasonArchiveType(type) {
    if (this.uiManager.seasonLeaderboardType === type) return
    
    this.uiManager.seasonLeaderboardType = type
    this.audioManager.play('click')
    this.vibrate('light')
    
    await this.refreshSeasonArchive()
  }

  // 退出历史赛季查看模式
  exitSeasonArchiveMode() {
    this.uiManager.viewingSeasonArchive = false
    this.uiManager.archiveSeasonId = null
  }

  // 处理好友排行榜触摸
  async handleFriendLeaderboardTouch(x, y) {
    // 如果正在滚动，不处理按钮点击
    if (this.friendListIsScrolling) return
    
    const buttonId = this.uiManager.handleTouch(x, y)
    
    if (buttonId) {
      this.audioManager.play('click')
      this.vibrate()
      
      switch (buttonId) {
        case 'close':
          this.closeFriendLeaderboard()
          break
        case 'open_friend_setting':
          this.openFriendSetting()
          break
      }
    }
  }

  // 处理好友排行榜触摸移动（滚动）
  handleFriendLeaderboardTouchMove(y) {
    const totalDelta = this.friendListTouchStartY - y

    // 移动超过 5px 视为滚动
    if (Math.abs(totalDelta) > 5) {
      this.friendListIsScrolling = true
    }

    if (!this.friendListIsScrolling) return

    // 转发本帧增量；滚动钳制在开放数据域内完成
    const frameDelta = this.friendListLastY - y
    this.friendListLastY = y
    if (frameDelta !== 0 && this.gameState.friendLeaderboard) {
      this.gameState.friendLeaderboard.postScrollDelta(frameDelta)
    }
  }

  // 打开好友信息设置
  openFriendSetting() {
    if (typeof wx === 'undefined' || !wx.openSetting) {
      this.uiManager.showToast('当前环境不支持打开设置')
      return
    }
    wx.openSetting({
      success: (res) => {
        console.log('设置页面返回:', res)
        // 用户从设置返回后，重新请求授权并刷新排行榜
        if (res.authSetting && res.authSetting['scope.WxFriendInteraction']) {
          this.uiManager.showToast('授权成功，正在刷新...')
          this.refreshFriendLeaderboard()
        } else {
          this.uiManager.showToast('未开启好友权限，无法查看排行榜')
        }
      },
      fail: (err) => {
        console.warn('打开设置失败:', err)
        this.uiManager.showToast('打开设置失败')
      }
    })
  }

  // 关闭好友排行榜
  closeFriendLeaderboard() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    this.uiManager.friendLeaderboardData = null
    this.uiManager.friendLeaderboardLoading = false
    this.uiManager.friendLeaderboardError = null
    
    this.friendListIsScrolling = false
    this.friendListLastY = 0
    if (this.gameState.friendLeaderboard) {
      this.gameState.friendLeaderboard.resetScroll()
    }

    // 恢复打开前的界面（例如失败页），避免丢失复活入口
    const returnScreen = this._friendLbReturnScreen || 'menu'
    const returnPhase = this._friendLbReturnPhase || 'MENU'
    this._friendLbReturnScreen = null
    this._friendLbReturnPhase = null

    if (returnScreen === 'fail') {
      this.uiManager.currentScreen = 'fail'
      this.gameState.phase = 'FAIL'
    } else if (returnScreen === 'pause') {
      this.uiManager.currentScreen = 'pause'
      this.gameState.isPaused = true
    } else {
      this.uiManager.currentScreen = 'menu'
      this.gameState.phase = 'MENU'
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
        case 'adCheckin':
          this.adDoubleCheckin()
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
    
    // 如果当前是游戏规则弹窗
      if (this.uiManager.currentScreen === 'rules') {
        if (buttonId === 'rules_ok') {
          this.gameState.markAsPlayed()
          this._doStartGame()
        }
        return
      }
      
      switch (buttonId) {
        case 'start':
          this.startGame()
          break
        case 'friend_rank':
          // 好友排行按钮：检查授权并显示好友排行榜
          this.showFriendLeaderboard()
          break
        case 'leaderboard':
          // 首页的排行榜按钮 - 显示全局排行榜
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
          // 右上角分享礼包图标：显示分享礼包弹窗，每天可领一次
          // 奖励金额见 config.rewards.shareGift
          this.showShare()
          break
        case 'authorize':
          // 授权按钮：请求获取用户昵称和头像
          this.handleAuthorize()
          break
        case 'game_club':
          // 游戏圈按钮：打开游戏圈
          this.openGameClub()
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

  // 处理失败弹窗触摸
  handleFailTouch(x, y) {
    const buttonId = this.uiManager.handleTouch(x, y)
    console.log('handleFailTouch - buttonId:', buttonId)
    
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
        case 'shareRevive':
          this.shareReviveAndContinue()
          break
        case 'adRevive':
          this.adReviveAndContinue()
          break
        case 'restart':
          this.restartGame()
          break
        case 'leaderboard':
          // 失败弹窗中的好友排行按钮
          console.log('点击好友排行按钮')
          this.showFriendLeaderboard()
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
    // 修复：移除重复的 incrementSeasonGames()，只在 startGame() 中调用
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 开始游戏
  startGame() {
    // 首次游玩：显示游戏规则弹窗
    if (!this.gameState.hasPlayedBefore) {
      this.uiManager.currentScreen = 'rules'
      return
    }
    
    this._doStartGame()
  }
  
  // 实际开始游戏（跳过规则弹窗）
  _doStartGame() {
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

  // 通用倒计时方法（减少代码重复）
  _startCountdown(duration, remaining, onExpire, options = {}) {
    const { enableTick = false } = options
    const startTime = Date.now() - (duration - remaining)
    this.gameState.clearTimer()
    
    let lastSecond = -1  // 追踪上一秒，避免重复播放
    
    const checkTimer = () => {
      const elapsed = Date.now() - startTime
      this.gameState.timerRemaining = Math.max(0, duration - elapsed)
      
      if (elapsed >= duration) {
        this.gameState.clearTimer()
        onExpire()
      } else {
        // 检测秒数变化，触发 tick 音效
        if (enableTick) {
          const currentSecond = Math.ceil(this.gameState.timerRemaining / 1000)
          if (currentSecond !== lastSecond && currentSecond <= 3 && currentSecond > 0) {
            lastSecond = currentSecond
            this.audioManager.play('tick', currentSecond)
          }
        }
        this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(checkTimer)
    this.gameState.timerType = 'raf'
  }

  // 开始观察阶段
  startObservePhase() {
    // 修复：设置 phase 为 OBSERVE，确保底部倒计时条正常显示
    this.setGameState('OBSERVE', 'game')
    
    this.observeStartTime = Date.now()
    
    // 高亮目标泡泡（根据索引分配颜色）- 观察阶段，气泡会闪动
    this.gameState.targets.forEach((targetIdx) => {
      const colorClass = getColorClass(targetIdx)
      // 使用 'observing' 状态标记，表示正在观察阶段（会闪动）
      this.bubbleGrid.setBubbleStateForObserving(targetIdx, colorClass)
    })
    
    // 设置计时器
    this.gameState.timerRemaining = this.gameState.observeDuration
    
    this._startCountdown(
      this.gameState.observeDuration,
      this.gameState.observeDuration,
      () => this.startPlayPhase()
    )
  }
  
  // 恢复观察阶段
  resumeObservePhase() {
    this.observeStartTime = Date.now() - (this.gameState.observeDuration - this.gameState.timerRemaining)
    
    this._startCountdown(
      this.gameState.observeDuration,
      this.gameState.timerRemaining,
      () => this.startPlayPhase()
    )
  }

  // 开始游戏阶段
  startPlayPhase() {
    this.setGameState('PLAY', 'game')
    
    // 重置泡泡显示（隐藏目标）
    this.bubbleGrid.resetBubbles()
    
    // 开始倒计时
    this.gameState.timerRemaining = this.gameState.playDuration
    
    this._startCountdown(
      this.gameState.playDuration,
      this.gameState.playDuration,
      () => this.handleTimeOut()
    )
  }
  
  // 恢复游戏阶段
  resumePlayPhase() {
    this.setGameState('PLAY', 'game')
    
    this._startCountdown(
      this.gameState.playDuration,
      this.gameState.timerRemaining,
      () => this.handleTimeOut()
    )
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
      this.vibrate('heavy')
      
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
        const timer = setTimeout(() => this.handleWaveSuccess(), 500)
        this._pendingTimers.push(timer)
      }
    } else {
      // 错误！
      this.audioManager.play('wrong')
      this.vibrate('long')
      
      // 显示红色闪烁
      this.bubbleGrid.setBubbleState(index, 'red', 'red')
      const timer = setTimeout(() => {
        this.bubbleGrid.setBubbleState(index, 'normal')
      }, 400)
      this._pendingTimers.push(timer)
      
      // 显示 Toast 提示，但不扣生命
      // this.uiManager.showToast('点错了！')
    }
  }

  // 设置游戏状态（统一 phase 和 currentScreen，避免状态不一致）
  setGameState(phase, screen) {
    this.gameState.phase = phase
    this.uiManager.currentScreen = screen
  }
  
  // 处理超时（倒计时结束）
  handleTimeOut() {
    // 标记当前波次已结束，阻止后续点击
    this.gameState.activeWaveCompleted = true
    
    // 检查是否还有正确气泡未点完
    if (this.gameState.playerClicks.length < this.gameState.targets.length) {
      // 扣 1 生命
      this.audioManager.play('wrong')
      this.vibrate('heavy')
      this.gameState.lives--
      this.uiManager.showToast('时间到！失去 1 点生命')
      
      if (this.gameState.lives > 0) {
        // 还有生命，重新开始当前关卡
        const timer = setTimeout(() => this.restartCurrentWave(), 500)
        this._pendingTimers.push(timer)
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
    // this.uiManager.showToast(`第 ${this.gameState.wave} 波过关！`)
    
    // 增加连续胜利计数，检查是否恢复生命
    const lifeRecovered = this.gameState.addConsecutiveWin()
    if (lifeRecovered) {
      // this.uiManager.showToast(`连续 ${config.rewards.consecutiveWin} 胜！恢复 1 生命`)
    }
    
    // 发放通关奖励：金币（阶梯式奖励）
    const waveReward = this.gameState.getWaveReward()
    this.gameState.addCoins(waveReward)
    // this.uiManager.showToast(`通关奖励：+${waveReward} 金币 `)
    
    // ✅ 优化：只更新本地数据，不调用云函数
    this.gameState.updateSeasonDataLocal(
      this.gameState.score,
      this.gameState.wave,
      1,  // 通关次数 +1
      this.gameState.consecutiveWins
    )
    
    // 通关后防抖写云，避免只依赖「返回首页」
    this.gameState.scheduleSaveToCloud(2000)
    
    // 本地保存最高分和最高关卡（通关时才更新 bestWave）
    this.gameState.saveHighScoreLocal({ updateBestWave: true })
    
    // 进入下一关
    this.gameState.wave++
    this.startNewWave()
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
    
    // 清理音频对象池（防止内存泄漏）
    this.audioManager.clearAudioPool()
    
    // 本地保存最高分（失败不更新 bestWave）
    this.gameState.saveHighScoreLocal({ updateBestWave: false })
    
    // 并入赛季最高分，上报好友榜，并立即同步到云端 seasonRecords
    this.gameState.reportScoreToLeaderboard()
    this.gameState.scheduleSaveToCloud(300)
  }

  // 重试关卡
  retryLevel() {
    this.gameState.reset()
    this.gameState.incrementSeasonGames()
    this.uiManager.currentScreen = 'game'
    this.startNewWave()
  }

  // 购买生命并继续
  purchaseLifeAndContinue() {
    const currentPrice = this.gameState.getPurchasePrice()
    this.audioManager.play('click')
    
    if (this.gameState.purchaseLife()) {
      this.vibrate('medium')
      this.uiManager.showToast(`购买成功！花费 ${currentPrice} 金币，生命 +1`)
      
      // 关闭失败弹窗
      this.gameState.isNewScoreRecord = false
      this.uiManager.currentScreen = 'game'
      
      // 金币复活：重置当前关卡（带倒计时）
      this.restartCurrentWave(true)
    } else {
      this.vibrate('light')
      this.uiManager.showToast(`金币不足或已达到购买上限（需要${currentPrice}金币，最多${config.game.maxPurchaseCount}次）`)
    }
  }

  // 分享复活并继续
  shareReviveAndContinue() {
    this.audioManager.play('click')
    
    if (this.gameState.canShareRevive()) {
      try {
        // 设置等待标志
        this.gameState.isWaitingShareRevive = true
        
        // 添加超时保护：如果 10 秒内 onShow 未触发，自动清除标志
        this._shareReviveTimeout = setTimeout(() => {
          if (this.gameState.isWaitingShareRevive) {
            this.gameState.isWaitingShareRevive = false
            console.log('分享复活超时，自动清除标志')
          }
        }, 10000)
        
        // 触发微信分享
        wx.shareAppMessage({
          title: '行不行，来一局再说',
          imageUrl: '/src/assets/images/share-cover1.png',
          query: `wave=${this.gameState.wave}&score=${this.gameState.score}`,
          success: () => {
            console.log('分享调用成功')
          },
          fail: (err) => {
            console.warn('分享调用失败:', err)
            // 分享失败时清除等待标志
            this.gameState.isWaitingShareRevive = false
            if (this._shareReviveTimeout) {
              clearTimeout(this._shareReviveTimeout)
              this._shareReviveTimeout = null
            }
          }
        })
        
        // 用户分享后返回游戏，会在 onShow 中执行复活
      } catch (error) {
        console.warn('分享复活失败:', error)
        this.gameState.isWaitingShareRevive = false
        this.uiManager.showToast('分享功能暂不可用')
      }
    } else {
      this.vibrate('light')
      this.uiManager.showToast('分享复活次数已用完')
    }
  }

  // 执行分享复活（分享返回后调用）
  executeShareRevive() {
    if (this.gameState.useShareRevive()) {
      this.vibrate('medium')
      const remaining = this.gameState.getShareReviveRemaining()
      this.uiManager.showToast(`分享成功！生命 +1（剩余${remaining}次）`)
      
      // 关闭失败弹窗
      this.gameState.isNewScoreRecord = false
      this.uiManager.currentScreen = 'game'
      
      // 分享复活：重置当前关卡（带倒计时）
      this.restartCurrentWave(true)
    }
  }

  // 广告复活并继续
  adReviveAndContinue() {
    this.audioManager.play('click')
    
    if (!this.gameState.canAdRevive()) {
      this.vibrate('light')
      this.uiManager.showToast('广告复活次数已用完')
      return
    }
    
    if (!this._rewardedVideoAd) {
      this.uiManager.showToast('广告功能暂不可用')
      return
    }
    
    try {
      // 监听关闭回调（一次性）
      const onCloseHandler = (res) => {
        this._rewardedVideoAd.offClose(onCloseHandler)
        
        if (res && res.isEnded) {
          // 用户完整观看广告
          if (this.gameState.useAdRevive()) {
            this.vibrate('medium')
            const remaining = this.gameState.getAdReviveRemaining()
            this.uiManager.showToast(`广告观看成功！生命 +1（剩余${remaining}次）`)
            
            // 关闭失败弹窗
            this.gameState.isNewScoreRecord = false
            this.uiManager.currentScreen = 'game'
            
            // 广告复活：重置当前关卡（带倒计时）
            this.restartCurrentWave(true)
          }
        } else {
          this.vibrate('light')
          this.uiManager.showToast('需要完整观看广告才能获得奖励')
        }
      }
      
      this._rewardedVideoAd.onClose(onCloseHandler)
      
      // 尝试展示广告
      this._rewardedVideoAd.show().catch(() => {
        // 展示失败，先加载再展示
        this._rewardedVideoAd.load().then(() => {
          this._rewardedVideoAd.show()
        }).catch((err) => {
          this._rewardedVideoAd.offClose(onCloseHandler)
          console.warn('广告加载失败:', err)
          this.uiManager.showToast('广告加载失败，请稍后再试')
        })
      })
    } catch (error) {
      console.warn('广告复活失败:', error)
      this.uiManager.showToast('广告功能暂不可用')
    }
  }

  // 重新开始当前关卡（生命扣除后）
  restartCurrentWave(isRevival = false) {
    // 清除待执行的定时器
    this._clearPendingTimers()
    
    // 重置关卡状态
    this.gameState.activeWaveCompleted = false
    this.gameState.playerClicks = []
    this.setGameState(isRevival ? 'COUNTDOWN' : 'OBSERVE', 'game')
    this.gameState.waveScore = 0
    
    // 重新生成目标气泡位置（重新随机）
    const gridSize = this.gameState.getGridSize()
    const totalTargetsCount = this.gameState.getTargetCount()
    this.gameState.targets = getUniqueRandomIndices(gridSize.cols * gridSize.rows, totalTargetsCount)
    
    // 重置泡泡
    this.bubbleGrid.resetBubbles()
    
    if (isRevival) {
      // 复活：开始倒计时，倒计时结束后进入观察阶段
      this.startCountdownBeforeObserve()
    } else {
      // 普通重试：直接进入观察阶段
      this.startObservePhase()
    }
  }

  // 复活后倒计时（3秒），倒计时结束后进入观察阶段
  startCountdownBeforeObserve() {
    const duration = 3000  // 3 秒倒计时
    this.gameState.countdownRemaining = duration

    const startTime = Date.now()
    this.gameState.clearTimer()
    
    let lastSecond = -1  // 追踪上一秒，避免重复播放

    const tick = () => {
      const elapsed = Date.now() - startTime
      this.gameState.countdownRemaining = Math.max(0, duration - elapsed)

      if (elapsed >= duration) {
        this.gameState.clearTimer()
        this.startObservePhase()
      } else {
        // 检测秒数变化，触发 tick 音效
        const currentSecond = Math.ceil(this.gameState.countdownRemaining / 1000)
        if (currentSecond !== lastSecond && currentSecond <= 3 && currentSecond > 0) {
          lastSecond = currentSecond
          this.audioManager.play('tick', currentSecond)
        }
        this.gameState.timerInterval = safeRequestAnimationFrame(tick)
        this.gameState.timerType = 'raf'
      }
    }
    this.gameState.timerInterval = safeRequestAnimationFrame(tick)
    this.gameState.timerType = 'raf'
  }

  // 清除待执行的定时器
  _clearPendingTimers() {
    for (const timer of this._pendingTimers) {
      clearTimeout(timer)
    }
    this._pendingTimers.length = 0  // 使用 length = 0 而不是重新赋值，减少内存分配
  }

  // 返回主菜单
  async navigateToMenu() {
    // 回首页前合并本局成绩到赛季/历史最高，并上报好友榜
    this.gameState.updateSeasonDataLocal(
      this.gameState.score,
      Math.max(1, this.gameState.wave - 1),
      0,
      this.gameState.consecutiveWins
    )
    this.gameState.saveHighScoreLocal({ updateBestWave: false })
    this.gameState.reportScoreToLeaderboard()

    this.gameState.isNewScoreRecord = false
    this.gameState.resetToMenu()
    
    this._clearPendingTimers()
    
    this.bubbleGrid.resetBubbles()
    this.audioManager.clearAudioPool()
    
    this.uiManager.startTransition(() => {
      this.uiManager.currentScreen = 'menu'
    })
    
    this.gameState.saveToCloud().catch(err => {
      console.warn('保存到云端失败（不影响游戏）:', err.message || err)
    })
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

  // 显示好友排行榜
  async showFriendLeaderboard() {
    console.log('showFriendLeaderboard 被调用')
    this.audioManager.play('click')
    this.vibrate('light')

    // 记录来源界面，关闭时恢复
    this._friendLbReturnScreen = this.uiManager.currentScreen
    this._friendLbReturnPhase = this.gameState.phase
    
    this.friendListIsScrolling = false
    this.friendListLastY = 0
    if (this.gameState.friendLeaderboard) {
      this.gameState.friendLeaderboard.resetScroll()
    }
    
    this.uiManager.currentScreen = 'friend_leaderboard'
    this.uiManager.friendLeaderboardError = null
    
    await this.refreshFriendLeaderboard()
  }

  // 请求好友互动授权（先读设置，已授权则跳过 authorize）
  async requestFriendInteractionAuth() {
    return new Promise((resolve) => {
      if (typeof wx === 'undefined' || !wx.authorize) {
        console.warn('当前环境不支持 wx.authorize')
        this.uiManager.showToast('当前环境不支持授权')
        resolve(false)
        return
      }

      const doAuthorize = () => {
        console.log('开始请求好友互动授权...')
        wx.authorize({
          scope: 'scope.WxFriendInteraction',
          success: () => {
            console.log('好友互动授权成功')
            resolve(true)
          },
          fail: (err) => {
            console.warn('好友互动授权失败:', err)
            resolve(false)
          }
        })
      }

      if (typeof wx.getSetting === 'function') {
        wx.getSetting({
          success: (res) => {
            if (res.authSetting && res.authSetting['scope.WxFriendInteraction']) {
              console.log('已授权好友互动，跳过 authorize')
              resolve(true)
              return
            }
            doAuthorize()
          },
          fail: () => doAuthorize()
        })
      } else {
        doAuthorize()
      }
    })
  }

  // 刷新好友排行榜数据
  async refreshFriendLeaderboard() {
    console.log('refreshFriendLeaderboard 开始执行')
    
    // 重置滚动状态
    this.friendListIsScrolling = false
    this.friendListLastY = 0
    if (this.gameState.friendLeaderboard) {
      this.gameState.friendLeaderboard.resetScroll()
    }
    
    // 检查是否在微信环境中
    if (typeof wx === 'undefined') {
      console.error('不在微信小游戏环境中')
      this.uiManager.friendLeaderboardError = null
      this.uiManager.friendLeaderboardData = { leaderboard: [] }  // 空数据
      this.uiManager.friendLeaderboardLoading = false
      this.uiManager.showToast('请在微信小游戏中运行')
      return
    }
    
    // 设置加载状态
    this.uiManager.friendLeaderboardLoading = true
    
    // 第一步：先请求授权
    console.log('第一步：请求好友互动授权')
    this.uiManager.showToast('正在请求授权...')
    const authSuccess = await this.requestFriendInteractionAuth()
    
    if (!authSuccess) {
      // 授权失败
      console.log('授权失败，显示错误提示')
      this.uiManager.friendLeaderboardData = null
      this.uiManager.friendLeaderboardError = 'auth_deny'
      this.uiManager.friendLeaderboardLoading = false
      this.uiManager.showToast('需要授权才能查看好友排行榜')
      return
    }
    
    console.log('授权成功，第二步：获取好友排行榜数据')
    this.uiManager.showToast('授权成功，获取数据中...')
    
    // 第二步：授权成功后，获取好友数据
    const result = await this.gameState.getFriendLeaderboard(true)
    console.log('getFriendLeaderboard 返回结果:', result)
    
    if (result.success) {
      this.uiManager.friendLeaderboardData = result.data
      this.uiManager.friendLeaderboardError = null
      console.log('好友排行榜数据加载成功')
      this.uiManager.showToast('加载成功')
    } else {
      this.uiManager.friendLeaderboardData = null
      // 只显示已知错误，不显示 unknown
      if (result.error && result.error !== 'unknown') {
        this.uiManager.friendLeaderboardError = result.error
      } else {
        this.uiManager.friendLeaderboardError = null
      }
      console.log('好友排行榜加载失败:', result.message, 'error:', result.error)
      
      // 特殊处理：如果是开发工具环境，提示使用真机调试
      if (result.message === '请在微信小游戏中运行') {
        this.uiManager.showToast('请在真机上测试')
      } else if (result.message) {
        this.uiManager.showToast(result.message)
      }
    }
    
    // 清除加载状态
    this.uiManager.friendLeaderboardLoading = false
    console.log('refreshFriendLeaderboard 执行完成')
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

  // 打开游戏圈
  openGameClub() {
    this.audioManager.play('click')
    this.vibrate('light')
    
    if (typeof wx === 'undefined' || !wx.createPageManager) {
      this.uiManager.showToast('当前环境不支持游戏圈')
      return
    }
    
    try {
      const pageManager = wx.createPageManager()
      pageManager.load({
        openlink: config.gameClub.openlink
      }).then((res) => {
        console.log('游戏圈加载成功', res)
        pageManager.show()
      }).catch((err) => {
        console.error('游戏圈加载失败', err)
        this.uiManager.showToast('打开游戏圈失败')
      })
    } catch (e) {
      console.error('创建 PageManager 失败', e)
      this.uiManager.showToast('打开游戏圈失败')
    }
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
      if (typeof wx !== 'undefined') {
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
          case 'long':
            if (wx.vibrateLong) {
              wx.vibrateLong()
            } else {
              wx.vibrateShort({ type: 'heavy' })
            }
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

    await this.gameState.ensureCheckinStateReady()
    
    // 切换到签到界面
    this.uiManager.currentScreen = 'checkin'
  }

  // 执行签到（优先云端，降级本地）
  async doCheckin() {
    await this.gameState.ensureCheckinStateReady()
    const result = await this.gameState.doCloudCheckin()
    
    if (result && result.amount !== undefined) {
      this.vibrate('medium')
      this.audioManager.play('success')
      this.uiManager.showToast(
        `签到成功！领取 ${result.amount} 金币`
      )
      return true
    } else {
      this.vibrate('light')
      this.uiManager.showToast(result?.error || '签到失败')
      return false
    }
  }

  // 广告双倍签到
  async adDoubleCheckin() {
    this.audioManager.play('click')

    if (!this.gameState.canAdDoubleCheckin()) {
      this.vibrate('light')
      this.uiManager.showToast('今日已使用广告双倍奖励')
      return
    }

    if (!this._checkinRewardedVideoAd) {
      this.uiManager.showToast('广告功能暂不可用')
      return
    }

    try {
      // 监听关闭回调（一次性）
      const onCloseHandler = async (res) => {
        this._checkinRewardedVideoAd.offClose(onCloseHandler)

        if (res && res.isEnded) {
          // 用户完整观看广告，调用云端广告签到
          await this.gameState.ensureCheckinStateReady()
          const result = await this.gameState.doCloudCheckin(true)
          if (result && result.amount !== undefined) {
            this.vibrate('medium')
            this.audioManager.play('success')
            const rewardText = result.isAdDouble ? '双倍奖励' : '补齐奖励'
            this.uiManager.showToast(
              `广告签到成功！领取 ${result.amount} 金币（${rewardText}）`
            )
          } else {
            this.vibrate('light')
            this.uiManager.showToast(result?.error || '签到失败')
          }
        } else {
          this.vibrate('light')
          this.uiManager.showToast('需要完整观看广告才能获得奖励')
        }
      }

      this._checkinRewardedVideoAd.onClose(onCloseHandler)

      // 尝试展示广告
      this._checkinRewardedVideoAd.show().catch(() => {
        // 展示失败，先加载再展示
        this._checkinRewardedVideoAd.load().then(() => {
          this._checkinRewardedVideoAd.show()
        }).catch((err) => {
          this._checkinRewardedVideoAd.offClose(onCloseHandler)
          console.warn('签到广告加载失败:', err)
          this.uiManager.showToast('广告加载失败，请稍后再试')
        })
      })
    } catch (error) {
      console.warn('广告双倍签到失败:', error)
      this.uiManager.showToast('广告功能暂不可用')
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
    
    // 冷却检查：防止快速连续点击刷奖励
    const now = Date.now()
    if (this._lastShareTime && now - this._lastShareTime < 3000) {
      this.uiManager.showToast('请勿频繁操作')
      return
    }
    this._lastShareTime = now
    
    // 根据分享类型设置文案
    let shareTitle
    if (type === 'gift') {
      // 分享礼包：使用用户闯过的最高关卡
      const bestWave = this.gameState.bestWave
      if (bestWave > 0) {
        shareTitle = `我轻松闯过第${bestWave}关，快来挑战我`
      } else {
        shareTitle = '比比谁的分数更高'
      }
    } else {
      // 快速分享：固定文案
      shareTitle = '你能闯过第几关？试试'
    }
    
    wx.shareAppMessage({
      title: shareTitle,
      imageUrl: '/src/assets/images/share-cover1.png',
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

  // 游戏初始化时触发隐私合规授权（非阻塞）
  _initPrivacyAuthorize() {
    if (typeof wx !== 'undefined' && wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => {
          console.log('隐私合规授权同意')
          this._privacyAuthorized = true
          this._initFriendAuthorize()
        },
        fail: (err) => {
          console.warn('隐私合规授权拒绝:', err)
        }
      })
    }
  }

  // 游戏初始化时触发好友关系授权（非阻塞）
  // 通过 wx.authorize 请求 scope.WxFriendInteraction 权限
  _initFriendAuthorize() {
    if (typeof wx === 'undefined' || !wx.authorize) {
      console.warn('当前环境不支持 wx.authorize')
      return
    }
    wx.authorize({
      scope: 'scope.WxFriendInteraction',
      success: () => {
        console.log('好友互动授权同意')
      },
      fail: (err) => {
        console.warn('好友互动授权拒绝:', err)
      }
    })
  }

  // 处理用户授权（获取昵称和头像）
  handleAuthorize() {
    console.log('handleAuthorize----》')
    this.audioManager.play('click')
    this.vibrate('light')
    
    // 隐私已授权过，直接获取用户信息
    if (this._privacyAuthorized) {
      this._doAuthorize()
      return
    }
    
    // 先触发隐私授权，用户同意后再继续
    if (typeof wx !== 'undefined' && wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => {
          this._privacyAuthorized = true
          this._doAuthorize()
        },
        fail: (err) => {
          console.warn('用户拒绝隐私授权:', err)
          this.uiManager.showToast('需要同意隐私政策才能设置昵称和头像')
        }
      })
    } else {
      this._doAuthorize()
    }
  }
  
  // 执行授权流程（隐私授权通过后调用）
  _doAuthorize() {
    // 已授权过：直接获取用户信息
    if (this.gameState.userInfo.authorized) {
      wx.getUserInfo({
        success: (res) => {
          const userInfo = res.userInfo
          this.saveAndSyncUserInfo(userInfo.nickName, userInfo.avatarUrl)
        },
        fail: () => {
          // 授权过期，需要重新授权
          this._createUserInfoButton()
        }
      })
      return
    }
    
    // 未授权但隐私已通过：直接尝试获取用户信息（当前处于用户点击事件中，满足调用条件）
    if (this._privacyAuthorized && wx.getUserProfile) {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          const userInfo = res.userInfo
          // 检查是否返回了有效用户信息（新版微信可能返回默认值"微信用户"）
          if (userInfo && userInfo.nickName && userInfo.nickName !== '微信用户') {
            this.saveAndSyncUserInfo(userInfo.nickName, userInfo.avatarUrl)
          } else {
            // 返回默认值，回退到原生按钮方式
            this._createUserInfoButton()
          }
        },
        fail: () => {
          // getUserProfile 不可用或失败，回退到原生按钮方式
          this._createUserInfoButton()
        }
      })
      return
    }
    
    // 回退：创建微信原生按钮，用户点击后弹出授权弹窗
    this._createUserInfoButton()
  }
  
  // 创建微信原生用户信息按钮
  _createUserInfoButton() {
    if (this._userInfoButton) {
      this._userInfoButton.destroy()
      this._userInfoButton = null
    }
    
    // 按钮位置与 Canvas 绘制的授权按钮对齐（height * 0.44, 宽200 居中）
    const btnWidth = 200
    const btnHeight = 44
    const btnX = Math.round((this.width - btnWidth) / 2) || 0
    const btnY = Math.round(this.height * 0.44) || 0
    
    this._userInfoButton = wx.createUserInfoButton({
      type: 'text',
      text: '',
      style: {
        left: btnX,
        top: btnY,
        width: btnWidth,
        height: btnHeight,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        color: '#ffffff',
        textAlign: 'center',
        fontSize: 14
      }
    })
    
    this._userInfoButton.onTap((res) => {
      if (res.userInfo) {
        this.saveAndSyncUserInfo(res.userInfo.nickName, res.userInfo.avatarUrl)
      }
      // 授权完成后销毁按钮
      if (this._userInfoButton) {
        this._userInfoButton.destroy()
        this._userInfoButton = null
      }
    })
  }
  
  // 保存用户信息并同步到云端
  saveAndSyncUserInfo(nickname, avatarUrl) {
    this.gameState.saveUserProfileLocally(nickname, avatarUrl)
    this.uiManager.showToast('设置成功！')
    this.uiManager.menuNeedsUpdate = true
    // 立即保存到云端
    this.gameState.saveUserProfileToCloud().catch(() => {})
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
    
    // 限制 deltaTime 防止跳帧（安卓端可能出现的大跳帧）
    const cappedDelta = Math.min(deltaTime, 100)  // 最大 100ms
    
    // 更新
    this.update(cappedDelta)
    
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
    if (this.gameState.phase === 'COUNTDOWN' || this.gameState.phase === 'OBSERVE' || this.gameState.phase === 'PLAY') {
      this.bubbleGrid.drawBubbles()
    }
    
    // 渲染 UI
    this.uiManager.render(this.gameState)
  }
}

