import { Colors, FONT_FAMILY, drawRoundRect, isPointInRect, getPhaseIndicatorLayout } from './utils.js'
import { config } from './config.js'
import { 
  drawBarChartIcon, 
  drawSpeakerIcon, 
  drawCalendarIcon, 
  drawShareIcon, 
  drawTrophyIcon,
  drawCrownIcon, 
  drawChestIcon,
  drawHeartIcon,
  drawCoinIcon
} from './Icons.js'

/**
 * UI 管理器 - 处理所有 UI 元素的绘制和交互
 */
export class UIManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.pixelRatio = options.pixelRatio || 1
    
    // 使用逻辑像素（canvas 已缩放，所以直接用 width/height 即可）
    this.width = canvas.width / this.pixelRatio
    this.height = canvas.height / this.pixelRatio
    
    // UI 按钮列表
    this.buttons = []
    
    // Toast 提示
    this.toast = null
    this.toastTimer = 0
    
    // 当前屏幕
    this.currentScreen = 'menu' // 'menu' | 'game' | 'fail' | 'leaderboard' | 'checkin' | 'share' | 'profile'
    
    // 动画状态
    this.animationFrame = 0

    // 屏幕过渡动画
    this.transition = { active: false, phase: 0, startTime: 0, onMidpoint: null }
    
    // 排行榜加载状态
  this.leaderboardLoading = false
  this.leaderboardLoadTime = 0

    // 赛季排行榜相关状态
    this.seasonLeaderboardLoading = false
    this.seasonLeaderboardData = null
    this.seasonLeaderboardType = 'score'  // 'score' | 'wave'
    
    // 历史赛季查看模式
    this.viewingSeasonArchive = false
    this.archiveSeasonId = null

    // Logo 图片
    this.logoImage = null
    this.logoImageLoaded = false
    this._loadLogoImage()
    
    // 默认头像图片
    this.defaultAvatarImage = null
    this.defaultAvatarLoaded = false
    this._loadDefaultAvatar()
    
    // 缓存常用字体设置（优化：避免每帧重复设置）
    this.cachedFonts = {
      bold18: null,
      bold11_2: null,
      normal10: null,
      bold16: null
    }
    
    // 缓存文字测量结果（优化：避免重复测量）
    this.textMeasureCache = new Map()
    
    // 缓存微信 SDK 版本（避免重复调用 wx.getSystemInfoSync）
    this._sdkVersion = ''
    this._isOldWxVersion = false
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const systemInfo = wx.getSystemInfoSync()
        this._sdkVersion = systemInfo.SDKVersion || ''
        const [major, minor] = this._sdkVersion.split('.').map(Number)
        this._isOldWxVersion = major < 2 || (major === 2 && minor < 27)
      } catch (e) {
        // 忽略错误
      }
    }
    
    // 预计算常用数值宽度（优化：避免重复 measureText）
    this.numberWidths = []
    this._precomputeNumberWidths()
    
    // 离屏 Canvas 缓存静态 UI（优化：批量绘制，减少 draw call）
    this.menuCache = null
    this.menuCtx = null
    this.menuNeedsUpdate = true
  }
  
  // 预计算数值宽度
  _precomputeNumberWidths() {
    const testCtx = this.ctx
    testCtx.font = `bold 11.2px ${FONT_FAMILY}`  // 金币字体
    for (let i = 0; i <= 9999; i++) {
      this.numberWidths[i] = testCtx.measureText(i.toString()).width
    }
  }

  // 更新布局
  updateLayout() {
    this.width = this.canvas.width / this.pixelRatio
    this.height = this.canvas.height / this.pixelRatio
    
    // 布局变化时标记 UI 需要重新缓存
    this.menuNeedsUpdate = true
  }
  
  // 创建主菜单缓存
  createMenuCache() {
    // 如果缓存已存在，直接标记为需要更新（避免重复创建）
    if (this.menuCache && this.menuCtx) {
      this.menuNeedsUpdate = true
      return
    }
    
    try {
      let offscreen = null
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        offscreen = wx.createOffscreenCanvas({ type: '2d', width: Math.ceil(this.width), height: Math.ceil(this.height) })
      } else if (typeof OffscreenCanvas !== 'undefined') {
        offscreen = new OffscreenCanvas(Math.ceil(this.width), Math.ceil(this.height))
      }
      if (offscreen) {
        // 释放旧引用（防止内存泄漏）
        this.menuCache = null
        this.menuCtx = null
        this.menuCache = offscreen
        this.menuCtx = offscreen.getContext('2d')
        this.menuNeedsUpdate = true
      }
    } catch (e) {
      console.warn('离屏 Canvas 不可用，使用降级方案')
      this.menuCache = null
      this.menuCtx = null
    }
  }
  
  // 绘制主菜单到缓存
  drawMenuToCache(gameState) {
    if (!this.menuCtx) return
    
    const ctx = this.menuCtx
    ctx.clearRect(0, 0, this.width, this.height)
    
    // 调用原有的绘制方法
    this.drawMenuToCtx(ctx, gameState)
  }
  
  // 绘制主菜单到指定 ctx（用于缓存）
  drawMenuToCtx(ctx, gameState) {
    // 临时保存当前 ctx
    const originalCtx = this.ctx
    this.ctx = ctx
    
    // 调用原有绘制逻辑
    this.buttons.length = 0
    this.drawTopCoins(gameState)
    this.drawLogo()
    this.drawBestScore(gameState)
    this.drawAuthButton(gameState)
    this.drawStartButton()
    this.drawBottomButtons(gameState)
    this.drawSeasonBanner(gameState)
    if (gameState.canShareGift() && gameState.getTodayShareCount() < config.game.maxShareCountPerDay) {
      this.drawShareGiftIcon()
    }
    
    // 恢复 ctx
    this.ctx = originalCtx
  }
  
  // 设置字体（带缓存）
  setFont(fontKey) {
    const fontMap = {
      'bold18': `bold 18px ${FONT_FAMILY}`,
      'bold11_2': `bold 11.2px ${FONT_FAMILY}`,
      'normal10': `10px ${FONT_FAMILY}`,
      'bold16': `bold 16px ${FONT_FAMILY}`
    }
    const font = fontMap[fontKey]
    if (font && this.ctx.font !== font) {
      this.ctx.font = font
    }
  }
  
  // 测量文字宽度（带缓存）
  measureText(text) {
    const cacheKey = `${text}_${this.ctx.font}`
    let cached = this.textMeasureCache.get(cacheKey)
    if (cached === undefined) {
      cached = this.ctx.measureText(text).width
      // 限制缓存大小，防止内存泄漏（减少到 200 个）
      if (this.textMeasureCache.size >= 200) {
        const firstKey = this.textMeasureCache.keys().next().value
        this.textMeasureCache.delete(firstKey)
      }
      this.textMeasureCache.set(cacheKey, cached)
    }
    return cached
  }

  // 绘制主菜单
  drawMenu(gameState) {
    const ctx = this.ctx
    
    // 使用缓存的主菜单（优化：减少 draw call）
    if (this.menuCache && this.menuCtx) {
      // 首次或布局变化时重新绘制缓存
      if (this.menuNeedsUpdate) {
        this.drawMenuToCache(gameState)
        this.menuNeedsUpdate = false
      }
      // 一次性复制整个菜单（1 次 draw call）
      ctx.drawImage(this.menuCache, 0, 0)
      
      // 绘制按钮列表（用于触摸检测）
      // 注意：按钮已经在 drawMenuToCtx 中创建
    } else {
      // 降级方案：直接绘制
      this.buttons.length = 0
      this.drawTopCoins(gameState)
      this.drawLogo()
      this.drawBestScore(gameState)
      this.drawAuthButton(gameState)
      this.drawStartButton()
      this.drawBottomButtons(gameState)
      this.drawSeasonBanner(gameState)
      if (gameState.canShareGift() && gameState.getTodayShareCount() < config.game.maxShareCountPerDay) {
        this.drawShareGiftIcon()
      }
    }
  }

  // 绘制信息徽章
  drawInfoBadge(x, y, type, value, color) {
    const ctx = this.ctx
    
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    drawRoundRect(ctx, x, y, 70, 30, 15)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 图标
    if (type === 'heart') {
      drawHeartIcon(ctx, x + 10, y + 8, 14, color)
    } else if (type === 'coin') {
      drawCoinIcon(ctx, x + 10, y + 8, 14, color)
    }
    
    // 数值
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(value, x + 28, y + 15)
    
    ctx.restore()
  }
  
  // 绘制游戏规则弹窗（首次游玩展示）
  drawRulesModal(gameState) {
    const ctx = this.ctx
    const modalW = 340
    
    // 清空按钮数组
    this.buttons.length = 0
    
    // 规则内容
    const rules = [
      '1. 观察阶段：记住闪烁的泡泡位置',
      '2. 游戏阶段：在倒计时结束前',
      '   点破所有闪烁的泡泡',
      '3. 点错不扣分，但会提示错误',
      '4. 超时未点完将失去 1 点生命',
      '5. 生命归零则游戏结束',
      '6. 连续胜利可恢复生命',
      '7. 关卡越高，难度越大！'
    ]
    
    // 计算各区域高度
    const paddingTop = 30        // 顶部边距
    const titleH = 28            // 标题高度
    const titleBottomGap = 40    // 标题到底部间距
    const lineH = 28             // 每行规则高度
    const rulesH = rules.length * lineH  // 规则内容总高度
    const tipTopGap = 15         // 提示文字顶部间距
    const tipH = 18              // 提示文字高度
    const btnTopGap = 40         // 按钮顶部间距
    const btnH = 50              // 按钮高度
    const paddingBottom = 30     // 底部边距
    
    // 动态计算弹窗总高度
    const modalH = paddingTop + titleH + titleBottomGap + rulesH + tipTopGap + tipH + btnTopGap + btnH + paddingBottom
    
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景渐变
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#1e1b4b')
    gradient.addColorStop(1, '#312e81')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 标题
    const titleY = modalY + paddingTop + titleH / 2
    ctx.font = `bold 22px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('🎮 游戏规则', this.width / 2, titleY)
    
    // 规则内容
    const contentY = titleY + titleBottomGap / 2 + titleH / 2
    ctx.font = `13px ${FONT_FAMILY}`
    ctx.textAlign = 'left'
    ctx.fillStyle = '#e0e7ff'
    
    for (let i = 0; i < rules.length; i++) {
      ctx.fillText(rules[i], modalX + 30, contentY + i * lineH)
    }
    
    // 提示文字
    const tipY = contentY + rules.length * lineH + tipTopGap + tipH / 2
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fde68a'
    ctx.fillText('💡 提示：每关目标泡泡颜色不同', this.width / 2, tipY)
    
    // 按钮区域
    const btnY = tipY + tipH / 2 + btnTopGap
    const btnW = modalW - 60
    
    const btnGradient = ctx.createLinearGradient(modalX + 30, btnY, modalX + 30, btnY + btnH)
    btnGradient.addColorStop(0, '#22c55e')
    btnGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = btnGradient
    drawRoundRect(ctx, modalX + 30, btnY, btnW, btnH, 16)
    ctx.fill()
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 18px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('我知道了，开始游戏！', this.width / 2, btnY + btnH / 2)
    
    // 注册按钮
    this.buttons.push({
      id: 'rules_ok',
      x: modalX + 30,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    ctx.restore()
  }

  // 绘制顶部金币余额（缩小 30%）
  drawTopCoins(gameState) {
    const ctx = this.ctx
    const padding = 20
    const verticalPadding = padding + 24  // 向下移动 24px
    const scale = 0.7  // 缩小 30%
    const iconSize = 28 * scale
    const badgeHeight = 40 * scale
    const leftPadding = 20 * scale  // 左边距
    const rightPadding = 20 * scale // 右边距
    const iconGap = 12 * scale      // 图标和文字的间距
    
    ctx.save()
    
    // 使用缓存的字体设置
    this.setFont('bold11_2')
    ctx.textBaseline = 'middle'
    const coinsText = gameState.coins.toString()
    // 使用预计算的数值宽度
    const textWidth = this.numberWidths[gameState.coins] || this.measureText(coinsText)
    
    // 计算徽章总宽度 = 左边距 + 图标 + 间距 + 文字 + 右边距
    const badgeWidth = leftPadding + iconSize + iconGap + textWidth + rightPadding
    
    // 金币背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    drawRoundRect(ctx, padding, verticalPadding, badgeWidth, badgeHeight, 20 * scale)
    ctx.fill()
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)'
    ctx.lineWidth = 1 * scale
    ctx.stroke()
    
    // 金币图标（居中绘制）
    drawCoinIcon(ctx, padding + leftPadding + iconSize / 2, verticalPadding + badgeHeight / 2, iconSize, '#facc15')
    
    // 金币数值
    ctx.textAlign = 'left'
    ctx.fillStyle = '#facc15'
    ctx.fillText(coinsText, padding + leftPadding + iconSize + iconGap, verticalPadding + badgeHeight / 2)

    ctx.restore()
  }
  
  // 加载 Logo 图片
  _loadLogoImage() {
    try {
      const img = typeof wx !== 'undefined' && wx.createImage
        ? wx.createImage()
        : (typeof Image !== 'undefined' ? new Image() : null)
      if (!img) return

      img.onload = () => {
        this.logoImage = img
        this.logoImageLoaded = true
      }
      img.onerror = () => {
        console.warn('Logo 图片加载失败')
      }
      img.src = 'src/assets/images/pop_logo.png'
    } catch (e) {
      console.warn('Logo 图片初始化失败:', e)
    }
  }

  // 加载默认头像图片
  _loadDefaultAvatar() {
    try {
      const img = typeof wx !== 'undefined' && wx.createImage
        ? wx.createImage()
        : (typeof Image !== 'undefined' ? new Image() : null)
      if (!img) return

      img.onload = () => {
        this.defaultAvatarImage = img
        this.defaultAvatarLoaded = true
      }
      img.onerror = () => {
        console.warn('默认头像图片加载失败')
      }
      img.src = 'src/assets/images/temp-avatar.png'
    } catch (e) {
      console.warn('默认头像图片初始化失败:', e)
    }
  }

  // 计算 Logo 自适应尺寸
  _getLogoLayout() {
    const img = this.logoImage
    const aspectRatio = img && img.width && img.height
      ? img.width / img.height
      : 1.5

    const maxWidth = this.width * 0.85
    const maxHeight = this.height * 0.22

    let drawWidth = maxWidth
    let drawHeight = drawWidth / aspectRatio

    if (drawHeight > maxHeight) {
      drawHeight = maxHeight
      drawWidth = drawHeight * aspectRatio
    }

    const logoScale = 1.30 
    drawWidth *= logoScale
    drawHeight *= logoScale

    const centerX = this.width / 2
    const centerY = this.height * 0.2178  // 下移 10%（0.198 * 1.1）

    return {
      x: centerX - drawWidth / 2,
      y: centerY - drawHeight / 2,
      width: drawWidth,
      height: drawHeight,
    }
  }

  // 绘制 LOGO 图片（自适应屏幕尺寸）
  drawLogo() {
    if (!this.logoImageLoaded || !this.logoImage) return

    const ctx = this.ctx
    const layout = this._getLogoLayout()

    ctx.save()
    ctx.drawImage(
      this.logoImage,
      layout.x,
      layout.y,
      layout.width,
      layout.height
    )
    ctx.restore()
  }

  // 绘制最高分数
  drawBestScore(gameState) {
    const ctx = this.ctx
    const y = this.height * 0.3388  // 跟随 Logo 下移 10%（0.308 * 1.1）
    
    ctx.save()
    ctx.font = `14px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    ctx.fillStyle = Colors.yellow400
    ctx.fillText(`最高关卡: ${gameState.bestWave}`, this.width / 2 - 60, y)
    
    ctx.fillStyle = Colors.white
    ctx.fillText(`最高分: ${gameState.highScore}`, this.width / 2 + 60, y)
    
    ctx.restore()
  }

  // 绘制授权按钮（仅未授权时显示）
  drawAuthButton(gameState) {
    if (gameState.userInfo.authorized) return // 已授权则不显示
    
    const ctx = this.ctx
    const btnWidth = 200
    const btnHeight = 44
    const btnX = (this.width - btnWidth) / 2
    const btnY = this.height * 0.44
    
    ctx.save()
    
    // 使用预创建的渐变
    if (!this.cachedGradients) {
      this.cachedGradients = {}
    }
    if (!this.cachedGradients.authBtn) {
      this.cachedGradients.authBtn = ctx.createLinearGradient(0, 0, 0, 40)
      this.cachedGradients.authBtn.addColorStop(0, '#6366f1')
      this.cachedGradients.authBtn.addColorStop(1, '#8b5cf6')
    }
    
    // 绘制按钮背景
    ctx.fillStyle = this.cachedGradients.authBtn
    drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 22)
    ctx.fill()
    
    // 绘制按钮边框
    ctx.strokeStyle = '#a5b4fc'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 14px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    ctx.fillText('设置昵称和头像', this.width / 2, btnY + btnHeight / 2)
    
    // 添加按钮到按钮列表
    this.buttons.push({
      id: 'authorize',
      x: btnX,
      y: btnY,
      w: btnWidth,
      h: btnHeight
    })
    
    ctx.restore()
  }

  // 绘制开始按钮
  drawStartButton() {
    const ctx = this.ctx
    const btnWidth = 200
    const btnHeight = 56
    const btnX = this.width / 2 - btnWidth / 2
    const btnY = this.height * 0.52
    const btnRadius = 28
    
    ctx.save()
    
    // 3D 阴影层（底部）
    ctx.fillStyle = '#c26a00'
    drawRoundRect(ctx, btnX, btnY + 6, btnWidth, btnHeight, btnRadius)
    ctx.fill()
    
    // 使用预创建的渐变
    if (!this.cachedGradients) {
      this.cachedGradients = {}
    }
    if (!this.cachedGradients.startBtn) {
      this.cachedGradients.startBtn = ctx.createLinearGradient(0, 0, 0, 56)
      this.cachedGradients.startBtn.addColorStop(0, '#ffd13b')
      this.cachedGradients.startBtn.addColorStop(1, '#ff9e00')
    }
    
    // 主按钮体
    ctx.fillStyle = this.cachedGradients.startBtn
    drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, btnRadius)
    ctx.fill()
    
    // 白色边框
    ctx.strokeStyle = '#fffdf0'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 顶部高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    drawRoundRect(ctx, btnX + 6, btnY + 4, btnWidth - 12, 14, 7)
    ctx.fill()
    
    // 文字 - 带阴影
    ctx.font = `bold 22px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // 文字阴影
    ctx.shadowColor = 'rgba(171, 81, 0, 0.8)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 2
    ctx.fillStyle = Colors.white
    ctx.fillText('开始游戏', this.width / 2, btnY + btnHeight / 2)
    
    // 记录按钮区域
    this.buttons.push({
      id: 'start',
      x: btnX,
      y: btnY,
      w: btnWidth,
      h: btnHeight
    })
    
    ctx.restore()
  }

  // 绘制底部按钮 - 使用 SVG 图标
  drawBottomButtons(gameState) {
    const ctx = this.ctx
    const btnSize = 56
    const gap = 16
    const totalWidth = btnSize * 4 + gap * 3
    const startX = (this.width - totalWidth) / 2
    const btnY = this.height * 0.72
    
    const buttons = [
      { id: 'leaderboard', icon: 'barChart', label: '排行榜', color1: '#6366f1', color2: '#a855f7', borderColor: '#a5b4fc' },
      { id: 'sound', icon: 'speaker', label: '声音', color1: '#0ea5e9', color2: '#3b82f6', borderColor: '#7dd3fc' },
      { id: 'checkin', icon: 'calendar', label: '签到', color1: '#10b981', color2: '#16a34a', borderColor: '#6ee7b7', hasBadge: gameState.canCheckin() },
      { id: 'share', icon: 'share', label: '分享', color1: '#ec4899', color2: '#f43f5e', borderColor: '#f9a8d4', hasBadge: gameState.canShareGift() && gameState.getTodayShareCount() < config.game.maxShareCountPerDay }
    ]
    
    const btnCount = buttons.length
    for (let i = 0; i < btnCount; i++) {
      const btn = buttons[i]
      const x = startX + i * (btnSize + gap)
      const y = btnY
      
      ctx.save()
      
      // 使用预创建的渐变
      if (!this.cachedGradients) {
        this.cachedGradients = {}
      }
      
      // 声音按钮特殊处理：静音时使用灰色背景
      let bgColor, borderColor
      if (btn.id === 'sound' && !gameState.soundEnabled) {
        // 静音状态：灰色背景
        const cacheKey = 'soundMuted'
        if (!this.cachedGradients[cacheKey]) {
          this.cachedGradients[cacheKey] = ctx.createLinearGradient(0, 0, 50, 50)
          this.cachedGradients[cacheKey].addColorStop(0, '#475569')
          this.cachedGradients[cacheKey].addColorStop(1, '#334155')
        }
        bgColor = this.cachedGradients[cacheKey]
        borderColor = '#64748b'
      } else {
        // 正常状态：原色背景
        const cacheKey = `btn_${btn.id}`
        if (!this.cachedGradients[cacheKey]) {
          this.cachedGradients[cacheKey] = ctx.createLinearGradient(0, 0, 50, 50)
          this.cachedGradients[cacheKey].addColorStop(0, btn.color1)
          this.cachedGradients[cacheKey].addColorStop(1, btn.color2)
        }
        bgColor = this.cachedGradients[cacheKey]
        borderColor = btn.borderColor || 'rgba(255, 255, 255, 0.3)'
      }
      
      // 圆形按钮
      ctx.fillStyle = bgColor
      ctx.beginPath()
      ctx.arc(x + btnSize / 2, y + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
      ctx.fill()
      
      // 边框
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 图标（居中绘制）
      const iconX = x + btnSize / 2
      const iconY = y + btnSize / 2 + 2  // 微调垂直位置
      const iconSize = 28
      
      switch (btn.icon) {
        case 'barChart':
          drawBarChartIcon(ctx, iconX, iconY, iconSize, Colors.white)
          break
        case 'speaker':
          // 根据声音状态绘制不同图标
          const isMuted = !gameState.soundEnabled
          drawSpeakerIcon(ctx, iconX, iconY, iconSize, Colors.white, isMuted)
          break
        case 'calendar':
          drawCalendarIcon(ctx, iconX, iconY, iconSize, Colors.white)
          break
        case 'share':
          drawShareIcon(ctx, iconX, iconY, iconSize, Colors.white)
          break
      }
      
      // 通知徽章
      if (btn.hasBadge) {
        const badgeX = x + btnSize - 8
        const badgeY = y + 8
        ctx.fillStyle = Colors.rose500
        ctx.beginPath()
        ctx.arc(badgeX, badgeY, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = Colors.white
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      
      // 标签
      ctx.font = `10px ${FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.fillText(btn.label, x + btnSize / 2, y + btnSize + 12)
      
      // 记录按钮区域
      this.buttons.push({
        id: btn.id,
        x: x,
        y: y,
        w: btnSize,
        h: btnSize + 16
      })
      
      ctx.restore()
    }  // 结束 for 循环
  }

  // 绘制赛季横幅 - 精确匹配 index.html
  drawSeasonBanner(gameState) {
    const ctx = this.ctx
    const bannerX = 20
    const bannerY = this.height * 0.82
    const bannerW = this.width - 40
    const bannerH = 60
    
    ctx.save()
    
    // 背景：rgba(15, 23, 42, 0.6) + border-purple-500/30
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'
    drawRoundRect(ctx, bannerX, bannerY, bannerW, bannerH, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 皇冠图标容器：w-10 h-10 (40x40)，rounded-xl
    const iconContainerX = bannerX + 12
    const iconContainerY = bannerY + (bannerH - 40) / 2
    const iconContainerSize = 40
    
    // 容器背景渐变：from-yellow-400 to-amber-600
    const iconGradient = ctx.createLinearGradient(iconContainerX, iconContainerY, iconContainerX + iconContainerSize, iconContainerY + iconContainerSize)
    iconGradient.addColorStop(0, '#facc15')  // yellow-400
    iconGradient.addColorStop(1, '#d97706')  // amber-600
    
    ctx.fillStyle = iconGradient
    drawRoundRect(ctx, iconContainerX, iconContainerY, iconContainerSize, iconContainerSize, 12) // rounded-xl = 12px
    ctx.fill()
    
    // 皇冠图标：w-6 h-6 (24x24)，居中绘制
    const iconSize = 24
    const iconX = iconContainerX + iconContainerSize / 2
    const iconY = iconContainerY + iconContainerSize / 2
    drawCrownIcon(ctx, iconX, iconY, iconSize, Colors.white)
    
    // 文字：gap-2 = 8px，所以文字从 iconContainerX + iconContainerSize + 8 开始
    const textStartX = iconContainerX + iconContainerSize + 8
    
    // 标题：text-xs font-extrabold text-yellow-300
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText('新赛季开启', textStartX, bannerY + bannerH / 2 - 8)
    
    // 副标题 + 赛季倒计时（同行显示）
    ctx.font = `10px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    
    const subtitleText = '每周五 24:00 结算排行榜'
    ctx.fillStyle = Colors.gray300
    ctx.textAlign = 'left'
    ctx.fillText(subtitleText, textStartX, bannerY + bannerH / 2 + 10)
    
    // 赛季倒计时显示（同行右侧）- 动态计算剩余时间
    if (gameState && gameState.seasonInfo && gameState.seasonInfo.seasonEndTime > 0) {
      const remaining = Math.max(0, gameState.seasonInfo.seasonEndTime - Date.now())
      if (remaining > 0) {
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

        ctx.textAlign = 'right'
        ctx.fillText(`剩余 ${days}天${hours}时`, bannerX + bannerW - 80, bannerY + bannerH / 2 + 10)
      }
    }
    
    // 查看详情按钮：rounded-full
    const detailBtnX = bannerX + bannerW - 70
    const detailBtnY = bannerY + 15
    const detailBtnW = 65
    const detailBtnH = 30
    
    // 渐变：from-purple-500 to-indigo-600
    const btnGradient = ctx.createLinearGradient(detailBtnX, detailBtnY, detailBtnX + detailBtnW, detailBtnY)
    btnGradient.addColorStop(0, '#a855f7')  // purple-500
    btnGradient.addColorStop(1, '#4f46e5')  // indigo-600
    
    ctx.fillStyle = btnGradient
    drawRoundRect(ctx, detailBtnX, detailBtnY, detailBtnW, detailBtnH, 15)
    ctx.fill()
    
    ctx.font = `bold 11px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('查看详情', detailBtnX + detailBtnW / 2, detailBtnY + detailBtnH / 2)
    
    this.buttons.push({
      id: 'leaderboard_detail',
      x: detailBtnX,
      y: detailBtnY,
      w: detailBtnW,
      h: detailBtnH
    })
    
    ctx.restore()
  }

  // 绘制分享礼包图标 - 使用 SVG 宝箱图标
  drawShareGiftIcon() {
    const ctx = this.ctx
    const iconX = this.width - 40
    const iconY = this.height * 0.15
    const iconSize = 56
    
    // 弹跳动画（先应用动画偏移）
    const bounce = Math.sin(this.animationFrame * 0.05) * 3
    const animatedY = iconY + bounce
    
    ctx.save()
    
    // 背景
    const gradient = ctx.createLinearGradient(iconX - iconSize / 2, animatedY - iconSize / 2, iconX + iconSize / 2, animatedY + iconSize / 2)
    gradient.addColorStop(0, '#a855f7')
    gradient.addColorStop(1, '#ec4899')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, iconX - iconSize / 2, animatedY - iconSize / 2, iconSize, iconSize, 16)
    ctx.fill()
    
    ctx.strokeStyle = '#fef08a'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 宝箱图标（居中绘制）
    drawChestIcon(ctx, iconX, animatedY + 1, 38)
    
    // 标签
    ctx.font = `bold 10px ${FONT_FAMILY}`
    const labelY = animatedY + iconSize / 2 + 12
    ctx.fillStyle = '#581c87'
    drawRoundRect(ctx, iconX - 24, labelY - 8, 48, 16, 8)
    ctx.fill()
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('分享礼包', iconX, labelY)
    
    // 记录按钮区域（使用动画后的位置）
    this.buttons.push({
      id: 'share_gift',
      x: iconX - iconSize / 2,
      y: animatedY - iconSize / 2,
      w: iconSize,
      h: iconSize + 24
    })
    
    ctx.restore()
  }

  // 绘制游戏界面
  drawGameUI(gameState) {
    const ctx = this.ctx
    
    // 清空按钮数组
    this.buttons.length = 0
    
    // 顶部HUD
    this.drawGameHUD(gameState)
    
    // 阶段提示
    this.drawPhaseIndicator(gameState)
    
    // 倒计时进度条
    this.drawCountdownBar(gameState)
    
    // 复活倒计时（3秒）
    if (gameState.phase === 'COUNTDOWN') {
      this.drawReviveCountdown(gameState)
    }
  }

  // 绘制复活倒计时画面
  drawReviveCountdown(gameState) {
    const ctx = this.ctx
    const remaining = gameState.countdownRemaining
    
    // 计算当前显示的数字（3, 2, 1）
    const currentNum = Math.ceil(remaining / 1000)
    if (currentNum <= 0) return
    
    // 计算当前数字的动画进度（0-1）
    const progressInSecond = (remaining % 1000) / 1000
    
    // 缩放动画：从 1.5 缩小到 1.0
    const scale = 1.0 + 0.5 * progressInSecond
    // 透明度动画：从 0.3 到 1.0
    const alpha = 0.3 + 0.7 * progressInSecond
    
    const centerX = this.width / 2
    const centerY = this.height / 2
    
    ctx.save()
    
    // 绘制半透明背景遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 移动到中心并应用缩放
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    
    // 绘制数字
    ctx.globalAlpha = alpha
    ctx.font = 'bold 120px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // 数字阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillText(currentNum.toString(), 4, 4)
    
    // 数字主体（渐变）
    const gradient = ctx.createLinearGradient(0, -60, 0, 60)
    gradient.addColorStop(0, '#FFD700')
    gradient.addColorStop(1, '#FFA500')
    ctx.fillStyle = gradient
    ctx.fillText(currentNum.toString(), 0, 0)
    
    ctx.restore()
    
    // 绘制"准备好了吗？"文字（不受缩放影响）
    ctx.save()
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('准备好了吗？', centerX, centerY + 100)
    ctx.restore()
  }

  // 绘制游戏HUD
  drawGameHUD(gameState) {
    const ctx = this.ctx
    const padding = 20
    const topPadding = 60
    
    // 优化：减少 save/restore 调用
    // ctx.save()  // 移除不必要的 save
    
    // 暂停按钮
    const pauseBtnX = padding
    const pauseBtnY = topPadding
    const pauseBtnSize = 40
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    ctx.arc(pauseBtnX + pauseBtnSize / 2, pauseBtnY + pauseBtnSize / 2, pauseBtnSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 暂停图标（两条竖线）
    const pauseCenterX = pauseBtnX + pauseBtnSize / 2
    const pauseCenterY = pauseBtnY + pauseBtnSize / 2
    const pauseBarWidth = 4
    const pauseBarHeight = 14
    const pauseGap = 6
    
    ctx.fillStyle = Colors.white
    ctx.fillRect(pauseCenterX - pauseGap - pauseBarWidth / 2, pauseCenterY - pauseBarHeight / 2, pauseBarWidth, pauseBarHeight)
    ctx.fillRect(pauseCenterX + pauseGap - pauseBarWidth / 2, pauseCenterY - pauseBarHeight / 2, pauseBarWidth, pauseBarHeight)
    
    this.buttons.push({
      id: 'pause',
      x: pauseBtnX,
      y: pauseBtnY,
      w: pauseBtnSize,
      h: pauseBtnSize
    })
    
    // 关卡数
    const waveX = this.width / 2
    const waveY = topPadding + 10
    
    this.setFont('bold18')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText(`第 ${gameState.wave} 波`, waveX, waveY)
    
    // 进度点（根据当前关卡显示进度）
    const dotY = waveY + 20
    const dotSpacing = 24
    const totalDots = 4
    const dotsStartX = waveX - (totalDots - 1) * dotSpacing / 2
    
    // 根据关卡计算进度（每 5 关为一个进度点）
    const progressDot = Math.min(Math.floor((gameState.wave - 1) / 5), totalDots - 1)
    
    for (let i = 0; i < totalDots; i++) {
      const dotX = dotsStartX + i * dotSpacing
      const isActive = i <= progressDot
      
      ctx.fillStyle = isActive ? Colors.green500 : Colors.gray600
      ctx.beginPath()
      ctx.arc(dotX, dotY, 6, 0, Math.PI * 2)
      ctx.fill()
      
      if (isActive) {
        ctx.strokeStyle = '#a3e635'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      
      // 连接线
      if (i < totalDots - 1) {
        ctx.strokeStyle = isActive ? Colors.green500 : Colors.gray600
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(dotX + 8, dotY)
        ctx.lineTo(dotX + dotSpacing - 8, dotY)
        ctx.stroke()
      }
    }
    
    // 分数卡片
    const cardY = topPadding + 50
    const cardHeight = 50
    const cardGap = 8
    const totalCardsWidth = this.width - padding * 2
    const cardWidth = (totalCardsWidth - cardGap * 2) / 3
    
    // 得分卡片
    this.drawScoreCard(padding, cardY, cardWidth, cardHeight, '得分', gameState.score.toString(), Colors.white)
    
    // 历史最高
    this.drawScoreCard(padding + cardWidth + cardGap, cardY, cardWidth, cardHeight, '历史最高', gameState.highScore.toString(), Colors.yellow300)
    
    // 生命
    this.drawLifeCard(padding + (cardWidth + cardGap) * 2, cardY, cardWidth, cardHeight, gameState)
    
    // ctx.restore()  // 移除不必要的 restore
  }

  // 绘制分数卡片
  drawScoreCard(x, y, w, h, label, value, valueColor) {
    const ctx = this.ctx
    
    // 优化：减少 save/restore
    // ctx.save()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'
    drawRoundRect(ctx, x, y, w, h, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    this.setFont('normal10')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.gray400
    ctx.fillText(label, x + w / 2, y + 14)
    
    this.setFont('bold16')
    ctx.fillStyle = valueColor
    ctx.fillText(value, x + w / 2, y + h - 14)
    
    // ctx.restore()
  }

  // 绘制生命卡片
  drawLifeCard(x, y, w, h, gameState) {
    const ctx = this.ctx
    
    // 优化：减少 save/restore
    // ctx.save()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'
    drawRoundRect(ctx, x, y, w, h, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    this.setFont('normal10')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.gray400
    ctx.fillText('生命', x + w / 2, y + 14)
    
    // 心形（使用 Canvas 路径绘制）
    const heartSize = 14
    const totalHearts = gameState.maxLives
    const heartsWidth = totalHearts * (heartSize + 4)
    const heartsStartX = x + w / 2 - heartsWidth / 2
    
    for (let i = 0; i < totalHearts; i++) {
      const heartX = heartsStartX + i * (heartSize + 4) + heartSize / 2
      const heartY = y + h - 14
      const color = i < gameState.lives ? Colors.rose500 : Colors.gray600
      drawHeartIcon(ctx, heartX, heartY, heartSize, color)
    }
    
    // ctx.restore()
  }

  // 绘制签到弹窗（新布局：8 个格子 + 7 天连签奖励）
  drawCheckinModal(gameState) {
    const ctx = this.ctx
    const modalW = 360
    const modalH = 520
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景渐变
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#0f172a')
    gradient.addColorStop(1, '#312e81')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 关闭按钮
    this._drawCloseButton(modalX, modalW, modalY)
    
    // 标题
    const titleY = modalY + 35
    ctx.font = `bold 20px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#34d399'
    ctx.fillText('每日签到', this.width / 2, titleY)
    
    // 副标题
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray400
    ctx.fillText('每日上线签到即可领金币奖励！', this.width / 2, titleY + 22)
    
    // 签到网格布局（整体居中）
    const gridStartX = modalX + 20  // 左右边距各 20，使整体居中
    const gridStartY = titleY + 60
    const cellWidth = (modalW - 40 - 30) / 3  // 减去左右边距 40，间距 30（2 个 gap）
    const cellHeight = 95
    const gap = 15
    
    // 签到天数持续累加，每 7 天为一个周期
    const streak = gameState.checkinStreak
    const canCheckin = gameState.canCheckin()
    // 当前周期起始偏移（0, 7, 14, 21...），streak=0 时从 0 开始
    const cycleStart = streak === 0 ? 0 : Math.floor((streak - 1) / 7) * 7
    // 当前周期内已签到天数（0-6）
    const daysInCycle = streak - cycleStart
    // 7天连签奖励是否已获得（当前周期已完成7天）
    const bonusObtained = daysInCycle >= 7
    
    // 绘制当前周期的第 1-6 天
    for (let i = 1; i <= 6; i++) {
      const day = cycleStart + i
      const col = (i - 1) % 3
      const row = Math.floor((i - 1) / 3)
      const cellX = gridStartX + col * (cellWidth + gap)
      const cellY = gridStartY + row * (cellHeight + gap)
      
      const isToday = canCheckin ? (i === daysInCycle + 1) : (i === daysInCycle)
      const isSigned = (i <= daysInCycle)
      
      this.drawCheckinCell(ctx, cellX, cellY, cellWidth, cellHeight, day, isToday, isSigned)
      
      const reward = gameState.getTodayReward(day)
      this.drawCheckinReward(ctx, cellX, cellY, cellWidth, cellHeight, reward, isSigned)
    }
    
    // 当前周期的第 7 天
    const day7 = cycleStart + 7
    const day7X = gridStartX
    const day7Y = gridStartY + 2 * (cellHeight + gap)
    const isDay7Today = canCheckin ? (7 === daysInCycle + 1) : (7 === daysInCycle)
    const isDay7Signed = (7 <= daysInCycle)
    
    this.drawCheckinCell(ctx, day7X, day7Y, cellWidth, cellHeight, day7, isDay7Today, isDay7Signed)
    const day7Reward = gameState.getTodayReward(day7)
    this.drawCheckinReward(ctx, day7X, day7Y, cellWidth, cellHeight, day7Reward, isDay7Signed)
    
    // 7 天连签奖励（显示当前周期的总天数）
    const bonusX = gridStartX + cellWidth + gap
    const bonusY = day7Y
    const bonusWidth = cellWidth * 2 + gap
    const bonusHeight = cellHeight
    
    this.drawBonusCard(ctx, bonusX, bonusY, bonusWidth, bonusHeight, bonusObtained, day7)
    
    // 签到按钮区域
    const btnHeight = 46
    const btnWidth = modalW - 60
    const btnX = modalX + 30
    const btnY = bonusY + bonusHeight + 25
    
    const canAdDoubleCheckin = gameState.canAdDoubleCheckin()
    const isAllSigned = !canCheckin && !canAdDoubleCheckin
    
    if (isAllSigned) {
      // 全部完成：显示一个全宽的灰色按钮
      ctx.fillStyle = '#374151'
      drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 16)
      ctx.fill()
      ctx.strokeStyle = '#6b7280'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 16px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.gray400
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('今日已签到', modalX + modalW / 2, btnY + btnHeight / 2)
    } else {
      // 普通签到按钮（左）
      if (canCheckin) {
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnHeight)
        btnGrad.addColorStop(0, '#4ade80')
        btnGrad.addColorStop(1, '#16a34a')
        ctx.fillStyle = btnGrad
      } else {
        ctx.fillStyle = '#374151'
      }
      drawRoundRect(ctx, btnX, btnY, btnWidth / 2 - 6, btnHeight, 16)
      ctx.fill()
      ctx.strokeStyle = canCheckin ? '#86efac' : '#6b7280'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = canCheckin ? Colors.white : Colors.gray400
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(canCheckin ? '立即签到' : '今日已签到', btnX + (btnWidth / 2 - 6) / 2, btnY + btnHeight / 2)
      
      this.buttons.push({
        id: 'checkin',
        x: btnX,
        y: btnY,
        w: btnWidth / 2 - 6,
        h: btnHeight
      })
      
      // 看广告双倍按钮（右）
      const adBtnX = btnX + (btnWidth / 2 - 6) + 12
      if (canAdDoubleCheckin) {
        const adBtnGrad = ctx.createLinearGradient(adBtnX, btnY, adBtnX, btnY + btnHeight)
        adBtnGrad.addColorStop(0, '#8b5cf6')
        adBtnGrad.addColorStop(1, '#7c3aed')
        ctx.fillStyle = adBtnGrad
      } else {
        ctx.fillStyle = '#374151'
      }
      drawRoundRect(ctx, adBtnX, btnY, btnWidth / 2 - 6, btnHeight, 16)
      ctx.fill()
      ctx.strokeStyle = canAdDoubleCheckin ? '#c4b5fd' : '#6b7280'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = canAdDoubleCheckin ? Colors.white : Colors.gray400
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(canAdDoubleCheckin ? '双倍奖励' : '今日已双倍', adBtnX + (btnWidth / 2 - 6) / 2, btnY + btnHeight / 2)
      
      this.buttons.push({
        id: 'adCheckin',
        x: adBtnX,
        y: btnY,
        w: btnWidth / 2 - 6,
        h: btnHeight
      })
    }
    
    ctx.restore()
  }

  // 绘制签到格子
  drawCheckinCell(ctx, x, y, w, h, day, isToday, isSigned) {
    if (isToday) {
      const grad = ctx.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, '#059669')
      grad.addColorStop(1, '#047857')
      ctx.fillStyle = grad
    } else if (isSigned) {
      // 已签到的天数保持与未签到天数一致的样式
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    }
    
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    if (isToday) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 3
    } else if (isSigned) {
      // 已签到的天数边框与未签到天数一致
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.3)'
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.3)'
      ctx.lineWidth = 2
    }
    ctx.stroke()
    
    ctx.font = isToday ? `bold 12px ${FONT_FAMILY}` : `11px ${FONT_FAMILY}`
    ctx.fillStyle = isToday ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    // 已签到的格子顶部显示"已获得"，未签到的显示"第 X 天"，今天的显示"今天"
    const dayText = isSigned ? '已获得' : (isToday ? '今天' : `第${day}天`)
    ctx.fillText(dayText, x + w / 2, y + 22)
  }

  // 绘制奖励内容
  drawCheckinReward(ctx, x, y, w, h, reward, isSigned) {
    const iconSize = 36
    // 金币图标位置下移，给顶部"已获得"留空间
    const iconY = y + h / 2 + 10
    // 增加金币图标和金币数量之间的间距（+10px）
    const amountY = y + h - 12
    
    // 金币图标颜色保持一致，不置灰
    drawCoinIcon(ctx, x + w / 2, iconY, iconSize, '#facc15')
    
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray300
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // 第 7 天只显示基础奖励 +1000，不显示额外奖励
    const amountText = `+${reward.amount}`
    
    // 只显示金币数量，不显示"已获得"（顶部已显示）
    ctx.fillText(amountText, x + w / 2, amountY)
  }

  // 绘制分享弹窗
  drawShareModal(gameState) {
    const ctx = this.ctx
    const modalW = 340
    const modalH = 480
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景渐变
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#0f172a')
    gradient.addColorStop(1, '#1e293b')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 关闭按钮
    this._drawCloseButton(modalX, modalW, modalY)
    
    // 礼物图标容器
    const iconContainerSize = 64
    const iconContainerX = modalX + modalW / 2
    const iconContainerY = modalY + 50
    
    // 粉红色圆形背景
    const iconBgGradient = ctx.createRadialGradient(iconContainerX, iconContainerY, 0, iconContainerX, iconContainerY, iconContainerSize / 2)
    iconBgGradient.addColorStop(0, '#ec4899')
    iconBgGradient.addColorStop(1, '#be185d')
    
    ctx.fillStyle = iconBgGradient
    ctx.beginPath()
    ctx.arc(iconContainerX, iconContainerY, iconContainerSize / 2, 0, Math.PI * 2)
    ctx.fill()
    
    // 绘制宝箱图标（居中）
    const chestSize = 40
    const chestX = iconContainerX
    const chestY = iconContainerY + 2
    drawChestIcon(ctx, chestX, chestY, chestSize, '#fbbf24')
    
    // 标题
    const titleY = iconContainerY + 50
    ctx.font = `bold 18px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('专属分享礼包已备好', this.width / 2, titleY)
    
    // 描述文字
    const descY = titleY + 28
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray400
    ctx.textAlign = 'center'
    
    const descText1 = '分享本游戏至群聊或好友，'
    const descText2 = '立即免费获得'
    ctx.fillText(descText1, this.width / 2, descY)
    ctx.fillText(descText2, this.width / 2, descY + 18)
    
    // 奖励文字（高亮）
    ctx.font = `bold 14px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.yellow400
    ctx.fillText('1000 金币', this.width / 2, descY + 34)
    
    // 微信小游戏消息预览
    const previewX = modalX + 20
    const previewY = descY + 50
    const previewW = modalW - 40
    const previewH = 80
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, previewX, previewY, previewW, previewH, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 预览标题
    ctx.font = `11px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray500
    ctx.textAlign = 'left'
    ctx.fillText('微信小游戏消息预览', previewX + 12, previewY + 18)
    
    // 预览内容
    const previewContentX = previewX + 12
    const previewContentY = previewY + 30
    
    // 游戏图标
    const gameIconSize = 40
    const gameIconX = previewContentX
    const gameIconY = previewContentY + gameIconSize / 2
    
    ctx.fillStyle = 'rgba(139, 92, 246, 0.3)'
    drawRoundRect(ctx, gameIconX, previewContentY, gameIconSize, gameIconSize, 10)
    ctx.fill()
    
    // 气泡图标
    ctx.font = `20px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('🎈', gameIconX + gameIconSize / 2, previewContentY + gameIconSize / 2)
    
    // 游戏标题
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'left'
    ctx.fillText('来挑战泡泡大师！', gameIconX + gameIconSize + 10, previewContentY + 12)
    
    // 游戏描述
    ctx.font = `11px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray400
    const previewText = gameState.bestWave > 0
      ? `我轻松闯过了第 ${gameState.bestWave} 关，你敢来比一比吗？`
      : '别以为简单，是你你也上不了榜'
    ctx.fillText(previewText, gameIconX + gameIconSize + 10, previewContentY + 32)
    
    // 分享按钮
    const btnWidth = modalW - 60
    const btnHeight = 46
    const btnX = modalX + 30
    const btnY = previewY + previewH + 25
    
    const btnGradient = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnHeight)
    btnGradient.addColorStop(0, '#22c55e')
    btnGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = btnGradient
    drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 16)
    ctx.fill()
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 16px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('发送到微信好友', modalX + modalW / 2, btnY + btnHeight / 2)
    
    this.buttons.push({
      id: 'share_wechat',
      x: btnX,
      y: btnY,
      w: btnWidth,
      h: btnHeight
    })
    
    ctx.restore()
  }
  
  // 绘制连签奖励卡片
  drawBonusCard(ctx, x, y, w, h, isSigned, bonusDay) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h)
    gradient.addColorStop(0, '#7c3aed')
    gradient.addColorStop(1, '#a855f7')
    
    ctx.fillStyle = isSigned ? 'rgba(0, 0, 0, 0.3)' : gradient
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    ctx.strokeStyle = isSigned ? 'rgba(52, 211, 153, 0.3)' : '#c084fc'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 标题（bonusDay 是当前周期的总天数，如 7、14、21...）
    ctx.font = `11px ${FONT_FAMILY}`
    ctx.fillStyle = isSigned ? Colors.gray300 : '#fde68a'
    ctx.textAlign = 'center'
    ctx.fillText(isSigned ? `${bonusDay}天连续奖励已获得` : `${bonusDay}天连签奖励`, x + w / 2, y + 22)
    
    // 金币图标
    const iconSize = 36
    const iconY = y + h / 2 + 10
    drawCoinIcon(ctx, x + w / 2, iconY, iconSize, '#facc15')
    
    // 奖励文字（使用 config 中的 bonusAmount）
    const bonusAmount = config.checkin.bonusAmount
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray300
    ctx.textAlign = 'center'
    ctx.fillText(isSigned ? `+${bonusAmount}` : `额外 +${bonusAmount}`, x + w / 2, y + h - 12)
  }

  // 绘制排行榜弹窗
  drawLeaderboardModal(gameState) {
    this._drawLeaderboardModal(gameState, {
      title: '🏆 排行榜',
      data: this.leaderboardData,
      loading: this.leaderboardLoading,
      type: this.leaderboardType,
      btnPrefix: 'leaderboard',
      gradientKey: 'rankSwitchActive',
      rankCardMethod: 'drawLeaderboardRankCard',
      showFooter: false
    })
  }

  // 绘制赛季排名弹窗
  drawSeasonLeaderboardModal(gameState) {
    let titleText = ' 赛季排名'
    let seasonId = null
    
    // 修复：区分当前赛季和历史赛季
    if (this.viewingSeasonArchive && this.archiveSeasonId) {
      // 查看历史赛季
      seasonId = this.archiveSeasonId
      const seasonNum = seasonId.replace(/^\d+-S/, 'S')
      titleText = `🏆 ${seasonNum} 赛季排名（历史）`
    } else if (gameState && gameState.seasonInfo && gameState.seasonInfo.currentSeasonId) {
      // 查看当前赛季
      seasonId = gameState.seasonInfo.currentSeasonId
      const seasonNum = seasonId.replace(/^\d+-S/, 'S')
      titleText = `🏆 ${seasonNum} 赛季排名`
    }
    
    this._drawLeaderboardModal(gameState, {
      title: titleText,
      data: this.seasonLeaderboardData,
      loading: this.seasonLeaderboardLoading,
      type: this.seasonLeaderboardType,
      btnPrefix: 'season_leaderboard',
      gradientKey: 'seasonSwitchActive',
      rankCardMethod: 'drawSeasonLeaderboardRankCard',
      showFooter: !this.viewingSeasonArchive  // 历史赛季不显示底部提示
    })
  }

  // 通用排行榜弹窗绘制方法
  _drawLeaderboardModal(gameState, options) {
    const ctx = this.ctx
    const { title, data, loading, type, btnPrefix, gradientKey, rankCardMethod, showFooter } = options
    const modalW = 360
    const modalH = 560
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景渐变
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#312e81')
    gradient.addColorStop(1, '#4c1d95')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 关闭按钮
    this._drawCloseButton(modalX, modalW, modalY)
    
    // 标题
    const titleY = modalY + 35
    ctx.font = `bold 20px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(title, this.width / 2, titleY)
    
    // 切换按钮容器
    const switchContainerY = titleY + 35
    const switchContainerW = 200
    const switchContainerH = 36
    const switchContainerX = modalX + (modalW - switchContainerW) / 2
    
    // 切换按钮背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, switchContainerX, switchContainerY, switchContainerW, switchContainerH, 18)
    ctx.fill()
    
    // 切换按钮：最高分
    const scoreBtnW = switchContainerW / 2
    const scoreBtnX = switchContainerX
    const scoreBtnActive = type === 'score'
    
    if (scoreBtnActive) {
      if (!this.cachedGradients) {
        this.cachedGradients = {}
      }
      if (!this.cachedGradients[gradientKey]) {
        this.cachedGradients[gradientKey] = ctx.createLinearGradient(0, 0, 0, 36)
        this.cachedGradients[gradientKey].addColorStop(0, '#fbbf24')
        this.cachedGradients[gradientKey].addColorStop(1, '#d97706')
      }
      ctx.fillStyle = this.cachedGradients[gradientKey]
      drawRoundRect(ctx, scoreBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.font = `bold 13px ${FONT_FAMILY}`
    ctx.fillStyle = scoreBtnActive ? Colors.white : Colors.gray400
    ctx.textAlign = 'center'
    ctx.fillText('最高分', scoreBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: `${btnPrefix}_score`,
      x: scoreBtnX,
      y: switchContainerY,
      w: scoreBtnW,
      h: switchContainerH
    })
    
    // 切换按钮：最高关卡
    const waveBtnX = switchContainerX + scoreBtnW
    const waveBtnActive = type === 'wave'
    
    if (waveBtnActive) {
      if (!this.cachedGradients) {
        this.cachedGradients = {}
      }
      if (!this.cachedGradients[gradientKey]) {
        this.cachedGradients[gradientKey] = ctx.createLinearGradient(0, 0, 0, 36)
        this.cachedGradients[gradientKey].addColorStop(0, '#fbbf24')
        this.cachedGradients[gradientKey].addColorStop(1, '#d97706')
      }
      ctx.fillStyle = this.cachedGradients[gradientKey]
      drawRoundRect(ctx, waveBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.fillStyle = waveBtnActive ? Colors.white : Colors.gray400
    ctx.fillText('最高关卡', waveBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: `${btnPrefix}_wave`,
      x: waveBtnX,
      y: switchContainerY,
      w: scoreBtnW,
      h: switchContainerH
    })
    
    // 前三名展示区
    const top3ContainerY = switchContainerY + switchContainerH + 20
    const top3ContainerH = 140
    const top3ItemW = (modalW - 60) / 3
    
    // 检查是否需要显示骨架屏
    const showSkeleton = loading || !data || !data.leaderboard || data.leaderboard.length === 0
    
    if (showSkeleton) {
      // 显示骨架屏 - 前三名
      for (let i = 0; i < 3; i++) {
        const itemX = modalX + 20 + i * (top3ItemW + 10)
        const itemY = i === 1 ? top3ContainerY - 10 : top3ContainerY
        const itemH = i === 1 ? top3ContainerH + 10 : top3ContainerH
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, itemX, itemY, top3ItemW, itemH, 16)
        ctx.fill()
        
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + i * 0.3)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.2})`
        drawRoundRect(ctx, itemX + 5, itemY + 5, top3ItemW - 10, itemH - 10, 12)
        ctx.fill()
      }
    } else {
      const leaderboard = data.leaderboard
      const top1 = leaderboard[0]
      const top2 = leaderboard[1]
      const top3 = leaderboard[2]
      
      if (top2) {
        this[rankCardMethod](
          modalX + 20, top3ContainerY, top3ItemW, top3ContainerH,
          top2.rank, top2.nickname, top2.avatarUrl, top2.value,
          2, top2.isUser
        )
      }
      
      if (top1) {
        this[rankCardMethod](
          modalX + 20 + top3ItemW + 10, top3ContainerY - 10, top3ItemW, top3ContainerH + 10,
          top1.rank, top1.nickname, top1.avatarUrl, top1.value,
          1, top1.isUser, true
        )
      }
      
      if (top3) {
        this[rankCardMethod](
          modalX + 20 + (top3ItemW + 10) * 2, top3ContainerY, top3ItemW, top3ContainerH,
          top3.rank, top3.nickname, top3.avatarUrl, top3.value,
          3, top3.isUser
        )
      }
    }
    
    // 排行榜列表（4-6 名占满容器宽度，左右等距）
    const modalPadding = 20
    const listInnerPadding = 10
    const listContainerX = modalX + modalPadding
    const listContainerW = modalW - modalPadding * 2
    const listContainerY = top3ContainerY + top3ContainerH + 10
    const listItemH = 40
    const listItemGap = 8
    
    // 判断用户是否在前 6 名
    const userInTop6 = data && data.leaderboard && data.leaderboard.some(u => u.isUser)
    const showUserUnranked = !showSkeleton && !userInTop6
    const listCount = showUserUnranked ? 4 : 3
    const listContainerH = listInnerPadding + listCount * listItemH + (listCount - 1) * listItemGap + listInnerPadding
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, listContainerX, listContainerY, listContainerW, listContainerH, 16)
    ctx.fill()
    
    if (showSkeleton) {
      // 显示骨架屏 - 列表
      for (let i = 0; i < 3; i++) {
        const itemY = listContainerY + listInnerPadding + i * (listItemH + listItemGap)
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, listContainerX + listInnerPadding, itemY, listContainerW - listInnerPadding * 2, listItemH, 8)
        ctx.fill()
        
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + i * 0.5)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.15})`
        drawRoundRect(ctx, listContainerX + listInnerPadding + 5, itemY + 5, listContainerW - listInnerPadding * 2 - 10, listItemH - 10, 6)
        ctx.fill()
      }
    } else {
      const leaderboard = data.leaderboard
      const listStartIndex = 3
      const itemX = listContainerX + listInnerPadding
      const itemW = listContainerW - listInnerPadding * 2
      
      leaderboard.slice(listStartIndex, listStartIndex + 3).forEach((user, index) => {
        const itemY = listContainerY + listInnerPadding + index * (listItemH + listItemGap)
        const isHighlight = user.isUser || (user.rank <= 3)
        
        this.drawLeaderboardListItem(
          itemX, itemY, itemW, listItemH,
          user.rank, user.nickname, user.avatarUrl, user.value,
          isHighlight, user.isUser
        )
      })
      
      // 用户不在前 6 名时，在第 7 行显示「未上榜」
      if (showUserUnranked) {
        const itemY = listContainerY + listInnerPadding + 3 * (listItemH + listItemGap)
        this.drawLeaderboardListItem(
          itemX, itemY, itemW, listItemH,
          0, gameState.userInfo.nickname, gameState.userInfo.avatarUrl, 0,
          false, true, true
        )
      }
    }
    
    // 排行榜更新提示
    const hintY = listContainerY + listContainerH + 14
    ctx.font = `10px ${FONT_FAMILY}`
    ctx.fillStyle = 'rgba(165, 180, 252, 0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('排行榜数据每 30 分钟自动更新', this.width / 2, hintY)
    
    // 赛季底部提示
    if (showFooter) {
      const footerY = modalY + modalH - 35
      ctx.font = `10px ${FONT_FAMILY}`
      ctx.fillStyle = 'rgba(165, 180, 252, 0.6)'
      ctx.textAlign = 'center'
      ctx.fillText('赛季将于每周五 24:00 结束自动结算，前 6 名可获得金币奖励', this.width / 2, footerY)
    }
    
    // 游戏圈按钮
    this.drawGameClubButton(modalX, modalW, modalY, modalH)
    
    ctx.restore()
  }

  // 绘制游戏圈按钮
  drawGameClubButton(modalX, modalW, modalY, modalH) {
    const ctx = this.ctx
    
    const btnW = modalW - 40
    const btnH = 40
    const btnX = modalX + 20
    const btnY = modalY + modalH - 60
    
    // 使用预创建的渐变（如果存在）
    if (!this.cachedGradients) {
      this.cachedGradients = {}
    }
    if (!this.cachedGradients.gameClubBtn) {
      this.cachedGradients.gameClubBtn = ctx.createLinearGradient(0, 0, 320, 40)
      this.cachedGradients.gameClubBtn.addColorStop(0, '#a855f7')
      this.cachedGradients.gameClubBtn.addColorStop(1, '#6366f1')
    }
    
    ctx.fillStyle = this.cachedGradients.gameClubBtn
    drawRoundRect(ctx, btnX, btnY, btnW, btnH, 20)
    ctx.fill()
    ctx.strokeStyle = '#c084fc'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 文字（居中）
    ctx.font = `bold 14px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('进入游戏圈交流', btnX + btnW / 2, btnY + btnH / 2)
    
    // 记录按钮区域
    this.buttons.push({
      id: 'game_club',
      x: btnX,
      y: btnY,
      w: btnW,
      h: btnH
    })
  }

  // 绘制赛季排名卡片
  drawSeasonLeaderboardRankCard(x, y, w, h, rank, nickname, avatarUrl, value, rankNum, isUser, isTop1 = false) {
    const ctx = this.ctx
    
    ctx.save()
    
    // 使用预创建的渐变
    if (!this.cachedGradients) {
      this.cachedGradients = {}
    }
    
    let bgColor
    if (isTop1) {
      const cacheKey = 'rank1Grad'
      if (!this.cachedGradients[cacheKey]) {
        this.cachedGradients[cacheKey] = ctx.createLinearGradient(0, 0, 0, h)
        this.cachedGradients[cacheKey].addColorStop(0, '#4f46e5')
        this.cachedGradients[cacheKey].addColorStop(1, '#3730a3')
      }
      bgColor = this.cachedGradients[cacheKey]
    } else if (rankNum === 2) {
      bgColor = 'rgba(148, 163, 184, 0.3)'
    } else if (rankNum === 3) {
      bgColor = 'rgba(234, 179, 8, 0.2)'
    } else {
      bgColor = 'rgba(99, 102, 241, 0.2)'
    }
    
    ctx.fillStyle = bgColor
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    let borderColor
    if (isTop1) {
      borderColor = '#fbbf24'
    } else if (rankNum === 2) {
      borderColor = '#94a3b8'
    } else if (rankNum === 3) {
      borderColor = '#eab308'
    } else {
      borderColor = '#6366f1'
    }
    
    ctx.strokeStyle = borderColor
    ctx.lineWidth = isTop1 ? 3 : 2
    ctx.stroke()
    
    ctx.font = isTop1 ? `bold 12px ${FONT_FAMILY}` : `10px ${FONT_FAMILY}`
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    const rankText = isTop1 ? '🏆 第 1 名' : `第${rank}名`
    ctx.fillText(rankText, x + w / 2, y + 20)
    
    const avatarSize = isTop1 ? 52 : 44
    const avatarX = x + w / 2
    const avatarY = y + 55
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1, isUser)
    
    ctx.font = isTop1 ? `bold 11px ${FONT_FAMILY}` : `10px ${FONT_FAMILY}`
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 6 ? safeNickname.substring(0, 5) + '...' : safeNickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)
    
    ctx.font = isTop1 ? `bold 18px ${FONT_FAMILY}` : `bold 14px ${FONT_FAMILY}`
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(value.toString(), x + w / 2, y + 120)
    
    ctx.restore()
  }

  // 绘制排行榜前三名卡片
  drawLeaderboardRankCard(x, y, w, h, rank, nickname, avatarUrl, value, rankNum, isUser, isTop1 = false) {
    const ctx = this.ctx
    
    ctx.save()
    
    // 使用预创建的渐变
    if (!this.cachedGradients) {
      this.cachedGradients = {}
    }
    
    let bgColor
    if (isTop1) {
      const cacheKey = 'rank1Grad'
      if (!this.cachedGradients[cacheKey]) {
        this.cachedGradients[cacheKey] = ctx.createLinearGradient(0, 0, 0, h)
        this.cachedGradients[cacheKey].addColorStop(0, '#4f46e5')
        this.cachedGradients[cacheKey].addColorStop(1, '#3730a3')
      }
      bgColor = this.cachedGradients[cacheKey]
    } else if (rankNum === 2) {
      bgColor = 'rgba(148, 163, 184, 0.3)'
    } else {
      bgColor = 'rgba(234, 179, 8, 0.2)'
    }
    
    ctx.fillStyle = bgColor
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    let borderColor
    if (isTop1) {
      borderColor = '#fbbf24'
    } else if (rankNum === 2) {
      borderColor = '#94a3b8'
    } else {
      borderColor = '#eab308'
    }
    
    ctx.strokeStyle = borderColor
    ctx.lineWidth = isTop1 ? 3 : 2
    ctx.stroke()
    
    ctx.font = isTop1 ? `bold 12px ${FONT_FAMILY}` : `10px ${FONT_FAMILY}`
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    const rankText = isTop1 ? '🏆 第 1 名' : `第${rank}名`
    ctx.fillText(rankText, x + w / 2, y + 20)
    
    const avatarSize = isTop1 ? 52 : 44
    const avatarX = x + w / 2
    const avatarY = y + 55
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1, isUser)
    
    ctx.font = isTop1 ? `bold 11px ${FONT_FAMILY}` : `10px ${FONT_FAMILY}`
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 6 ? safeNickname.substring(0, 5) + '...' : safeNickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)
    
    ctx.font = isTop1 ? `bold 18px ${FONT_FAMILY}` : `bold 14px ${FONT_FAMILY}`
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(value.toString(), x + w / 2, y + 120)
    
    ctx.restore()
  }

  // 绘制排行榜列表项
  drawLeaderboardListItem(x, y, w, h, rank, nickname, avatarUrl, value, isHighlight, isUser, isUnranked = false) {
    const ctx = this.ctx
    const itemPadding = 12
    
    ctx.save()
    
    if (isHighlight) {
      ctx.fillStyle = isUser ? 'rgba(99, 102, 241, 0.3)' : 'rgba(0, 0, 0, 0.2)'
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    }
    
    drawRoundRect(ctx, x, y, w, h, 12)
    ctx.fill()
    
    if (isUser) {
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    // 排名列：未上榜时不显示排名
    ctx.font = isHighlight ? `bold 12px ${FONT_FAMILY}` : `11px ${FONT_FAMILY}`
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.gray400
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    if (!isUnranked) {
      const rankText = typeof rank === 'number' ? `${rank}.` : rank
      ctx.fillText(rankText, x + itemPadding, y + h / 2)
    }
    
    const avatarSize = 32
    const avatarX = x + itemPadding + 28
    const avatarY = y + h / 2
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, false, isUser)
    
    ctx.font = isHighlight ? `bold 11px ${FONT_FAMILY}` : `11px ${FONT_FAMILY}`
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.white
    ctx.textAlign = 'left'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 10 ? safeNickname.substring(0, 9) + '...' : safeNickname
    ctx.fillText(displayNickname, avatarX + avatarSize / 2 + 12, y + h / 2)
    
    // 右侧显示分数或未上榜文案
    ctx.font = `bold 13px ${FONT_FAMILY}`
    ctx.fillStyle = isUnranked ? '#f87171' : '#a5b4fc'
    ctx.textAlign = 'right'
    ctx.fillText(isUnranked ? '未上榜' : value.toString(), x + w - itemPadding, y + h / 2)
    
    ctx.restore()
  }

  // 绘制阶段指示器（对齐 index_v1.0.3.html：HUD 下方独立提示区，不与网格重叠）
  drawPhaseIndicator(gameState) {
    const ctx = this.ctx
    const { titleY, descY, countY } = getPhaseIndicatorLayout(this.width, this.height)
    const centerX = this.width / 2 + 2 // 微调视觉居中
    
    ctx.save()
    
    if (gameState.phase === 'OBSERVE') {
      ctx.font = `bold 24px ${FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.purple500
      ctx.shadowColor = 'rgba(168, 85, 247, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('请观察', centerX, titleY)
      
      ctx.font = `12px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.textBaseline = 'middle'
      ctx.fillText('记住闪烁的气泡', centerX, descY)
    } else if (gameState.phase === 'PLAY') {
      ctx.font = `bold 24px ${FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.yellow300
      ctx.shadowColor = 'rgba(234, 179, 8, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('点它', centerX, titleY)
      
      ctx.font = `12px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.textBaseline = 'middle'
      ctx.fillText('在倒计时结束前点破所有闪烁的气泡', centerX, descY)
      
      // 剩余泡泡计数
      const remaining = gameState.targets.length - gameState.playerClicks.length
      const countText = remaining > 0 ? `剩余: ${remaining} 个` : '全部点破！'
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.purple500
      ctx.shadowColor = 'rgba(168, 85, 247, 0.4)'
      ctx.shadowBlur = 6
      ctx.fillText(countText, centerX, countY)
    }
    
    ctx.restore()
  }

  // 绘制倒计时进度条
  drawCountdownBar(gameState) {
    // 复活倒计时阶段不显示进度条
    if (gameState.phase === 'COUNTDOWN') return
    
    const ctx = this.ctx
    const barY = this.height * 0.85
    const barHeight = 24
    const barPadding = 20
    
    ctx.save()
    
    // 时钟图标
    const clockX = barPadding + 20
    const clockY = barY + barHeight / 2
    const clockSize = 40
    
    ctx.fillStyle = Colors.rose500
    ctx.beginPath()
    ctx.arc(clockX, clockY, clockSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = Colors.white
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 10px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText(`${(gameState.timerRemaining / 1000).toFixed(1)}s`, clockX, clockY)
    
    // 进度条背景
    const progressX = clockX + clockSize / 2 + 12
    const progressW = this.width - progressX - barPadding
    const progressH = barHeight - 8
    
    ctx.fillStyle = 'rgba(88, 28, 135, 0.8)'
    drawRoundRect(ctx, progressX, barY + 4, progressW, progressH, progressH / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 进度条填充
    const totalDuration = gameState.phase === 'OBSERVE' 
      ? gameState.observeDuration 
      : gameState.playDuration
    const progress = Math.max(0, gameState.timerRemaining / totalDuration)
    const fillW = progressW * progress
    
    const gradient = ctx.createLinearGradient(progressX, barY, progressX + fillW, barY)
    gradient.addColorStop(0, Colors.pink500)
    gradient.addColorStop(1, Colors.rose500)
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, progressX, barY + 4, fillW, progressH, progressH / 2)
    ctx.fill()
    
    // 时间文字
    ctx.font = `14px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    
    ctx.restore()
  }

  // 绘制带「新纪录!」徽章的得分行
  drawScoreWithRecordBadge(ctx, centerY, labelPrefix, scoreText, options = {}) {
    const {
      isNewRecord = false,
      labelColor = Colors.gray300,
      scoreColor = Colors.yellow300,
      newScoreColor = '#fb7185',
      fontSize = 11,
      badgeText = '新纪录!'
    } = options
    const badgeFontSize = Math.max(9, fontSize - 2)
    
    ctx.textBaseline = 'middle'
    
    if (!isNewRecord) {
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.fillStyle = scoreColor
      ctx.fillText(`${labelPrefix}${scoreText}`, this.width / 2, centerY)
      return
    }
    
    ctx.font = `${fontSize}px ${FONT_FAMILY}`
    const prefixWidth = ctx.measureText(labelPrefix).width
    
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const scoreWidth = ctx.measureText(scoreText).width
    
    ctx.font = `${badgeFontSize}px ${FONT_FAMILY}`
    const badgeW = ctx.measureText(badgeText).width + 12
    const badgeH = Math.max(16, badgeFontSize + 7)
    const gap = 6
    const totalWidth = prefixWidth + scoreWidth + gap + badgeW
    let startX = this.width / 2 - totalWidth / 2
    
    ctx.textAlign = 'left'
    ctx.font = `${fontSize}px ${FONT_FAMILY}`
    ctx.fillStyle = labelColor
    ctx.fillText(labelPrefix, startX, centerY)
    startX += prefixWidth
    
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    ctx.fillStyle = newScoreColor
    ctx.fillText(scoreText, startX, centerY)
    startX += scoreWidth + gap
    
    ctx.fillStyle = Colors.rose500
    drawRoundRect(ctx, startX, centerY - badgeH / 2, badgeW, badgeH, badgeH / 2)
    ctx.fill()
    
    ctx.font = `${badgeFontSize}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.fillStyle = Colors.white
    ctx.fillText(badgeText, startX + badgeW / 2, centerY)
    
    ctx.textAlign = 'center'
  }

  // 绘制失败弹窗中的「继续 + 金币价格」按钮文字
  drawContinuePurchaseButton(ctx, btnX, btnY, btnW, btnH, price, enabled = true) {
    const centerY = btnY + btnH / 2
    const centerX = btnX + btnW / 2
    const coinSize = 14
    const textColor = enabled ? Colors.white : Colors.gray400
    const coinColor = enabled ? '#facc15' : '#6b7280'
    
    ctx.font = `bold 13px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    
    const continueText = '继续'
    const priceText = `${price}`
    const continueWidth = ctx.measureText(continueText).width
    const priceWidth = ctx.measureText(priceText).width
    const totalWidth = continueWidth + 6 + coinSize + 4 + priceWidth
    let startX = centerX - totalWidth / 2
    
    ctx.textAlign = 'left'
    ctx.fillStyle = textColor
    ctx.fillText(continueText, startX, centerY)
    startX += continueWidth + 6
    
    drawCoinIcon(ctx, startX + coinSize / 2, centerY, coinSize, coinColor)
    startX += coinSize + 4
    
    ctx.fillText(priceText, startX, centerY)
    
    return totalWidth
  }

  // 绘制失败弹窗
  drawFailModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalX = (this.width - modalW) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    // 判断按钮状态
    const hasPurchaseAttempts = gameState.purchaseCount < config.game.maxPurchaseCount
    const canPurchase = gameState.canPurchaseLife()
    const purchasePrice = gameState.getPurchasePrice()
    const canAdRevive = gameState.canAdRevive()
    const canShareRevive = gameState.canShareRevive()
    
    // 判断是否破了赛季记录
    const isNewSeasonRecord = gameState.isNewSeasonRecord()
    
    // 计算弹窗高度（根据实际按钮行数动态计算）
    const btnH = 56
    const btnGap = 15
    const titleAreaH = 125 + btnGap
    const friendRankBtnH = 44
    const friendRankBtnGap = 15
    let buttonRows = 0
    const hasGold = hasPurchaseAttempts
    const hasAd = canAdRevive
    
    if (hasGold && hasAd) {
      buttonRows++ // 金币+广告并排
    } else if (hasGold || hasAd) {
      buttonRows++ // 金币或广告全宽
    }
    buttonRows += 2 // 再来一局 + 返回首页
    
    // 弹窗高度 = 标题区 + 复活按钮区 + 好友排行按钮 + 底部间距
    const modalH = titleAreaH + buttonRows * btnH + (buttonRows - 1) * btnGap + friendRankBtnGap + friendRankBtnH + 30
    const modalY = (this.height - modalH) / 2
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#374151')
    gradient.addColorStop(1, '#1f2937')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = Colors.gray500
    ctx.lineWidth = 4
    ctx.stroke()
    
    // 新纪录标签（红底白字，弹窗顶部居中，与卡片重叠）
    if (isNewSeasonRecord) {
      const badgeW = 90
      const badgeH = 26
      const badgeX = this.width / 2 - badgeW / 2
      const badgeY = modalY - badgeH * 0.6  // 调整位置，让标签部分突出卡片外
      
      ctx.fillStyle = '#ef4444'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
      ctx.shadowBlur = 8
      drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 13)
      ctx.fill()
      ctx.shadowBlur = 0
      
      ctx.font = `bold 13px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('新纪录', this.width / 2, badgeY + badgeH / 2)
    }
    
    // 标题（破赛季记录时显示"本赛季最高记录"，否则显示"本局成绩"）
    const titleY = modalY + 30
    const titleText = isNewSeasonRecord ? '本赛季最高记录' : '本局成绩'
    ctx.fillStyle = '#334155'
    drawRoundRect(ctx, modalX + 60, titleY, modalW - 120, 44, 16)
    ctx.fill()
    ctx.strokeStyle = Colors.gray500
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 24px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 4
    ctx.fillText(titleText, this.width / 2, titleY + 22)
    
    // 关卡
    ctx.font = `14px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray400
    ctx.fillText(`第 ${gameState.wave} 关`, this.width / 2, titleY + 60)
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 80)
    ctx.lineTo(modalX + modalW - 20, titleY + 80)
    ctx.stroke()
    
    // 本局总得分
    ctx.font = `bold 16px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.drawScoreWithRecordBadge(ctx, titleY + 105, '本局得分：', `${gameState.score}`, {
      isNewRecord: false, // 顶部已显示新纪录标签，这里不再重复显示
      labelColor: Colors.yellow300,
      scoreColor: Colors.yellow300,
      fontSize: 16
    })
    
    // 分隔线 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 125)
    ctx.lineTo(modalX + modalW - 20, titleY + 125)
    ctx.stroke()
    
    // 按钮区域
    const btnY1 = titleY + 125 + btnGap
    const halfBtnW = (modalW - 60) / 2
    const fullBtnW = modalW - 40
    
    // ========== 场景1：金币+广告并排 ==========
    if (hasGold && hasAd) {
      // 金币购买按钮（左）
      if (canPurchase) {
        const purchaseBtnGradient = ctx.createLinearGradient(modalX + 20, btnY1, modalX + 20 + halfBtnW, btnY1 + btnH)
        purchaseBtnGradient.addColorStop(0, '#22c55e')
        purchaseBtnGradient.addColorStop(1, '#16a34a')
        ctx.fillStyle = purchaseBtnGradient
      } else {
        ctx.fillStyle = Colors.gray700
      }
      drawRoundRect(ctx, modalX + 20, btnY1, halfBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = canPurchase ? '#86efac' : Colors.gray500
      ctx.lineWidth = canPurchase ? 2 : 1
      ctx.stroke()
      this.drawContinuePurchaseButton(ctx, modalX + 20, btnY1, halfBtnW, btnH, purchasePrice, canPurchase)
      
      this.buttons.push({
        id: 'purchase',
        x: modalX + 20,
        y: btnY1,
        w: halfBtnW,
        h: btnH
      })
      
      // 广告复活按钮（右）
      const adBtnX = modalX + 40 + halfBtnW
      const adBtnGradient = ctx.createLinearGradient(adBtnX, btnY1, adBtnX + halfBtnW, btnY1 + btnH)
      adBtnGradient.addColorStop(0, '#8b5cf6')
      adBtnGradient.addColorStop(1, '#7c3aed')
      ctx.fillStyle = adBtnGradient
      drawRoundRect(ctx, adBtnX, btnY1, halfBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#c4b5fd'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 广告复活标题（上半部分）
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🎬 广告复活', adBtnX + halfBtnW / 2, btnY1 + 18)
      
      // 广告复活剩余次数（下半部分）
      const adRemaining = gameState.getAdReviveRemaining()
      ctx.font = `11px ${FONT_FAMILY}`
      ctx.fillStyle = '#c4b5fd'
      ctx.fillText(`剩余${adRemaining}次`, adBtnX + halfBtnW / 2, btnY1 + 38)
      
      this.buttons.push({
        id: 'adRevive',
        x: adBtnX,
        y: btnY1,
        w: halfBtnW,
        h: btnH
      })
      
      // 第二行：再来一局
      const btnY2 = btnY1 + btnH + btnGap
      const restartBtnGradient = ctx.createLinearGradient(modalX + 20, btnY2, modalX + 20 + fullBtnW, btnY2 + btnH)
      restartBtnGradient.addColorStop(0, '#f59e0b')
      restartBtnGradient.addColorStop(1, '#d97706')
      ctx.fillStyle = restartBtnGradient
      drawRoundRect(ctx, modalX + 20, btnY2, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('再来一局', modalX + modalW / 2, btnY2 + btnH / 2)
      
      this.buttons.push({
        id: 'restart',
        x: modalX + 20,
        y: btnY2,
        w: fullBtnW,
        h: btnH
      })
      
      // 第三行：返回首页
      const btnY3 = btnY2 + btnH + btnGap
      ctx.fillStyle = Colors.gray700
      drawRoundRect(ctx, modalX + 20, btnY3, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = Colors.gray500
      ctx.lineWidth = 1
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('返回首页', modalX + modalW / 2, btnY3 + btnH / 2)
      
      this.buttons.push({
        id: 'home',
        x: modalX + 20,
        y: btnY3,
        w: fullBtnW,
        h: btnH
      })
      
      // 好友排行按钮（在返回首页按钮下方）
      const friendRankBtnY = btnY3 + btnH + friendRankBtnGap
      const friendRankBtnW = modalW - 40
      
      ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
      drawRoundRect(ctx, modalX + 20, friendRankBtnY, friendRankBtnW, friendRankBtnH, 12)
      ctx.fill()
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🏆 好友排行', this.width / 2, friendRankBtnY + friendRankBtnH / 2)
      
      this.buttons.push({
        id: 'leaderboard',
        x: modalX + 20,
        y: friendRankBtnY,
        w: friendRankBtnW,
        h: friendRankBtnH
      })
    }
    // ========== 场景2：广告可用，金币不可用 ==========
    else if (!hasPurchaseAttempts && canAdRevive) {
      // 第一行：广告复活（全宽）
      const adBtnGradient = ctx.createLinearGradient(modalX + 20, btnY1, modalX + 20 + fullBtnW, btnY1 + btnH)
      adBtnGradient.addColorStop(0, '#8b5cf6')
      adBtnGradient.addColorStop(1, '#7c3aed')
      ctx.fillStyle = adBtnGradient
      drawRoundRect(ctx, modalX + 20, btnY1, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#c4b5fd'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 广告复活标题（上半部分）
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🎬 广告复活', modalX + modalW / 2, btnY1 + 18)
      
      // 广告复活剩余次数（下半部分）
      const adRemaining = gameState.getAdReviveRemaining()
      ctx.font = `11px ${FONT_FAMILY}`
      ctx.fillStyle = '#c4b5fd'
      ctx.fillText(`剩余${adRemaining}次`, modalX + modalW / 2, btnY1 + 38)
      
      this.buttons.push({
        id: 'adRevive',
        x: modalX + 20,
        y: btnY1,
        w: fullBtnW,
        h: btnH
      })
      
      // 第二行：再来一局
      const btnY2 = btnY1 + btnH + btnGap
      const restartBtnGradient = ctx.createLinearGradient(modalX + 20, btnY2, modalX + 20 + fullBtnW, btnY2 + btnH)
      restartBtnGradient.addColorStop(0, '#f59e0b')
      restartBtnGradient.addColorStop(1, '#d97706')
      ctx.fillStyle = restartBtnGradient
      drawRoundRect(ctx, modalX + 20, btnY2, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('再来一局', modalX + modalW / 2, btnY2 + btnH / 2)
      
      this.buttons.push({
        id: 'restart',
        x: modalX + 20,
        y: btnY2,
        w: fullBtnW,
        h: btnH
      })
      
      // 返回首页
      const btnY3 = btnY2 + btnH + btnGap
      ctx.fillStyle = Colors.gray700
      drawRoundRect(ctx, modalX + 20, btnY3, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = Colors.gray500
      ctx.lineWidth = 1
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('返回首页', modalX + modalW / 2, btnY3 + btnH / 2)
      
      this.buttons.push({
        id: 'home',
        x: modalX + 20,
        y: btnY3,
        w: fullBtnW,
        h: btnH
      })
      
      // 好友排行按钮（在返回首页按钮下方）
      const friendRankBtnY = btnY3 + btnH + friendRankBtnGap
      const friendRankBtnW = modalW - 40
      
      ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
      drawRoundRect(ctx, modalX + 20, friendRankBtnY, friendRankBtnW, friendRankBtnH, 12)
      ctx.fill()
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🏆 好友排行', this.width / 2, friendRankBtnY + friendRankBtnH / 2)
      
      this.buttons.push({
        id: 'leaderboard',
        x: modalX + 20,
        y: friendRankBtnY,
        w: friendRankBtnW,
        h: friendRankBtnH
      })
    }
    // ========== 场景 3：金币可用，广告不可用 ==========
    else if (hasPurchaseAttempts && !canAdRevive) {
      // 第一行：金币购买（全宽）
      if (canPurchase) {
        const purchaseBtnGradient = ctx.createLinearGradient(modalX + 20, btnY1, modalX + 20 + fullBtnW, btnY1 + btnH)
        purchaseBtnGradient.addColorStop(0, '#22c55e')
        purchaseBtnGradient.addColorStop(1, '#16a34a')
        ctx.fillStyle = purchaseBtnGradient
      } else {
        ctx.fillStyle = Colors.gray700
      }
      drawRoundRect(ctx, modalX + 20, btnY1, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = canPurchase ? '#86efac' : Colors.gray500
      ctx.lineWidth = canPurchase ? 2 : 1
      ctx.stroke()
      this.drawContinuePurchaseButton(ctx, modalX + 20, btnY1, fullBtnW, btnH, purchasePrice, canPurchase)
      
      this.buttons.push({
        id: 'purchase',
        x: modalX + 20,
        y: btnY1,
        w: fullBtnW,
        h: btnH
      })
      
      // 第二行：再来一局
      const btnY2 = btnY1 + btnH + btnGap
      const restartBtnGradient = ctx.createLinearGradient(modalX + 20, btnY2, modalX + 20 + fullBtnW, btnY2 + btnH)
      restartBtnGradient.addColorStop(0, '#f59e0b')
      restartBtnGradient.addColorStop(1, '#d97706')
      ctx.fillStyle = restartBtnGradient
      drawRoundRect(ctx, modalX + 20, btnY2, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('再来一局', modalX + modalW / 2, btnY2 + btnH / 2)
      
      this.buttons.push({
        id: 'restart',
        x: modalX + 20,
        y: btnY2,
        w: fullBtnW,
        h: btnH
      })
      
      // 返回首页
      const btnY3 = btnY2 + btnH + btnGap
      ctx.fillStyle = Colors.gray700
      drawRoundRect(ctx, modalX + 20, btnY3, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = Colors.gray500
      ctx.lineWidth = 1
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('返回首页', modalX + modalW / 2, btnY3 + btnH / 2)
      
      this.buttons.push({
        id: 'home',
        x: modalX + 20,
        y: btnY3,
        w: fullBtnW,
        h: btnH
      })
      
      // 好友排行按钮（在返回首页按钮下方）
      const friendRankBtnY = btnY3 + btnH + friendRankBtnGap
      const friendRankBtnW = modalW - 40
      
      ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
      drawRoundRect(ctx, modalX + 20, friendRankBtnY, friendRankBtnW, friendRankBtnH, 12)
      ctx.fill()
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🏆 好友排行', this.width / 2, friendRankBtnY + friendRankBtnH / 2)
      
      this.buttons.push({
        id: 'leaderboard',
        x: modalX + 20,
        y: friendRankBtnY,
        w: friendRankBtnW,
        h: friendRankBtnH
      })
    }
    // ========== 场景 4：金币和广告都不可用 ==========
    else {
      // 第一行：再来一局
      const btnY1 = titleY + 125 + btnGap
      const restartBtnGradient = ctx.createLinearGradient(modalX + 20, btnY1, modalX + 20 + fullBtnW, btnY1 + btnH)
      restartBtnGradient.addColorStop(0, '#f59e0b')
      restartBtnGradient.addColorStop(1, '#d97706')
      ctx.fillStyle = restartBtnGradient
      drawRoundRect(ctx, modalX + 20, btnY1, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('再来一局', modalX + modalW / 2, btnY1 + btnH / 2)
      
      this.buttons.push({
        id: 'restart',
        x: modalX + 20,
        y: btnY1,
        w: fullBtnW,
        h: btnH
      })
      
      // 返回首页
      const btnY2 = btnY1 + btnH + btnGap
      ctx.fillStyle = Colors.gray700
      drawRoundRect(ctx, modalX + 20, btnY2, fullBtnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = Colors.gray500
      ctx.lineWidth = 1
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('返回首页', modalX + modalW / 2, btnY2 + btnH / 2)
      
      this.buttons.push({
        id: 'home',
        x: modalX + 20,
        y: btnY2,
        w: fullBtnW,
        h: btnH
      })
      
      // 好友排行按钮（在返回首页按钮下方）
      const friendRankBtnY = btnY2 + btnH + friendRankBtnGap
      const friendRankBtnW = modalW - 40
      
      ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
      drawRoundRect(ctx, modalX + 20, friendRankBtnY, friendRankBtnW, friendRankBtnH, 12)
      ctx.fill()
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      
      ctx.font = `bold 14px ${FONT_FAMILY}`
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🏆 好友排行', this.width / 2, friendRankBtnY + friendRankBtnH / 2)
      
      this.buttons.push({
        id: 'leaderboard',
        x: modalX + 20,
        y: friendRankBtnY,
        w: friendRankBtnW,
        h: friendRankBtnH
      })
    }
    
    ctx.restore()
    
    // 最高关卡和最高分（弹窗外底部，与弹窗保持 12px 间距，白色字体，单行显示）
    const statsY = modalY + modalH + 30
    
    ctx.font = `14px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    
    // 左侧：最高关卡
    ctx.fillText(`最高关卡：${gameState.bestWave}`, modalX + modalW / 4, statsY)
    
    // 右侧：最高分
    ctx.fillText(`最高分：${gameState.highScore}`, modalX + modalW * 3 / 4, statsY)
  }

  // 绘制暂停弹窗
  drawPauseModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalH = 380
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景渐变
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#1e293b')
    gradient.addColorStop(1, '#0f172a')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 暂停图标
    const iconSize = 64
    const iconX = modalX + modalW / 2
    const iconY = modalY + 60
    
    // 圆形背景
    ctx.fillStyle = 'rgba(100, 116, 139, 0.3)'
    ctx.beginPath()
    ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 暂停符号（两条竖线）
    const pauseBarWidth = 8
    const pauseBarHeight = 24
    const pauseGap = 12
    const pauseCenterX = iconX
    const pauseCenterY = iconY
    
    ctx.fillStyle = Colors.white
    ctx.fillRect(pauseCenterX - pauseGap - pauseBarWidth / 2, pauseCenterY - pauseBarHeight / 2, pauseBarWidth, pauseBarHeight)
    ctx.fillRect(pauseCenterX + pauseGap - pauseBarWidth / 2, pauseCenterY - pauseBarHeight / 2, pauseBarWidth, pauseBarHeight)
    
    // 标题
    const titleY = iconY + 50
    ctx.font = `bold 22px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('游戏暂停', this.width / 2, titleY)
    
    // 副标题
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.gray400
    ctx.fillText('休息一下，马上回来', this.width / 2, titleY + 24)
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 30, titleY + 50)
    ctx.lineTo(modalX + modalW - 30, titleY + 50)
    ctx.stroke()
    
    // 按钮区域
    const btnY = titleY + 90
    const btnW = modalW - 60
    const btnH = 48
    
    // 返回首页按钮
    ctx.fillStyle = '#475569'
    drawRoundRect(ctx, modalX + 30, btnY, btnW, btnH, 16)
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 16px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('返回首页', modalX + modalW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'home',
      x: modalX + 30,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    // 继续游戏按钮
    const resumeBtnY = btnY + btnH + 16
    const resumeGradient = ctx.createLinearGradient(modalX + 30, resumeBtnY, modalX + 30, resumeBtnY + btnH)
    resumeGradient.addColorStop(0, '#22c55e')
    resumeGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = resumeGradient
    drawRoundRect(ctx, modalX + 30, resumeBtnY, btnW, btnH, 16)
    ctx.fill()
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold 18px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('继续游戏', modalX + modalW / 2, resumeBtnY + btnH / 2)
    
    this.buttons.push({
      id: 'resume',
      x: modalX + 30,
      y: resumeBtnY,
      w: btnW,
      h: btnH
    })
    
    ctx.restore()
  }

  // 绘制 Toast 提示
  drawToast() {
    if (!this.toast) return
    
    const ctx = this.ctx
    const elapsed = Date.now() - this.toast.time
    
    if (elapsed > 2000) {
      this.toast = null
      return
    }
    
    ctx.save()
    
    // 根据文本内容自适应宽度
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    const textWidth = ctx.measureText(this.toast.text).width
    const toastW = Math.min(400, Math.max(200, textWidth + 40))  // 最小 200，最大 400，左右各留 20px 边距
    const toastH = 36
    const toastX = (this.width - toastW) / 2
    const toastY = this.height - 100
    
    // 动画效果
    let alpha = 1
    let translateY = 0
    if (elapsed < 300) {
      alpha = elapsed / 300
      translateY = 50 * (1 - alpha)
    } else if (elapsed > 1700) {
      alpha = (2000 - elapsed) / 300
      translateY = -30 * (1 - alpha)
    }
    
    ctx.globalAlpha = alpha
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    drawRoundRect(ctx, toastX, toastY + translateY, toastW, toastH, 18)
    ctx.fill()
    ctx.strokeStyle = Colors.purple500
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = `bold 12px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText(this.toast.text, this.width / 2, toastY + toastH / 2 + translateY)
    
    ctx.restore()
  }

  // 显示Toast
  showToast(text) {
    this.toast = {
      text: text,
      time: Date.now()
    }
  }

  // 处理触摸事件
  handleTouch(x, y) {
    for (const btn of this.buttons) {
      if (isPointInRect(x, y, btn)) {
        return btn.id
      }
    }
    return null
  }

  // 更新动画
  update(deltaTime) {
    // 限制动画帧计数器，防止数值溢出（约 16 分钟后重置）
    this.animationFrame = (this.animationFrame + 1) % 600000
  }

  // 启动屏幕过渡动画
  startTransition(onMidpoint) {
    this.transition.active = true
    this.transition.phase = 1
    this.transition.startTime = Date.now()
    this.transition.onMidpoint = onMidpoint
  }

  // 绘制过渡遮罩
  _drawTransitionOverlay() {
    const elapsed = Date.now() - this.transition.startTime
    const DURATION = 300
    let alpha

    if (this.transition.phase === 1) {
      alpha = Math.min(1, elapsed / DURATION)
      if (elapsed >= DURATION) {
        this.transition.onMidpoint?.()
        this.transition.phase = 2
        this.transition.startTime = Date.now()
      }
    } else {
      alpha = 1 - Math.min(1, elapsed / DURATION)
      if (elapsed >= DURATION) {
        this.transition.active = false
        return
      }
    }

    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  // 渲染
  render(gameState) {
    switch (this.currentScreen) {
      case 'menu':
        this.drawMenu(gameState)
        break
      case 'game':
        this.drawGameUI(gameState)
        break
      case 'fail':
        this.drawFailModal(gameState)
        break
      case 'pause':
        this.drawPauseModal(gameState)
        break
      case 'leaderboard':
        this.drawLeaderboardModal(gameState)
        break
      case 'season_leaderboard':
        this.drawSeasonLeaderboardModal(gameState)
        break
      case 'checkin':
        this.drawCheckinModal(gameState)
        break
      case 'share':
        this.drawShareModal(gameState)
        break
      case 'rules':
        this.drawRulesModal(gameState)
        break
    }
    
    this.drawToast()

    // 屏幕过渡遮罩（仅过渡期间生效）
    if (this.transition.active) {
      this._drawTransitionOverlay()
    }
  }

  // ==================== 辅助图标绘制方法 ====================

  // 绘制时钟图标
  drawClockIcon(ctx, x, y, size, color) {
    ctx.save()
    ctx.translate(x, y)
    
    const radius = size / 2
    
    // 圆形
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    
    // 指针
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    
    // 时针
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -radius * 0.6)
    ctx.stroke()
    
    // 分针
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(radius * 0.5, radius * 0.3)
    ctx.stroke()
    
    ctx.restore()
  }

  // 绘制关闭按钮（通用方法）
  _drawCloseButton(modalX, modalW, modalY) {
    const ctx = this.ctx
    const closeBtnSize = 32
    const closeBtnPadding = 20
    const closeBtnX = modalX + modalW - closeBtnPadding - closeBtnSize / 2
    const closeBtnY = modalY + closeBtnPadding + closeBtnSize / 2
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.arc(closeBtnX, closeBtnY, closeBtnSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = `bold 16px ${FONT_FAMILY}`
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✕', closeBtnX, closeBtnY)
    
    this.buttons.push({
      id: 'close',
      x: closeBtnX - closeBtnSize / 2,
      y: closeBtnY - closeBtnSize / 2,
      w: closeBtnSize,
      h: closeBtnSize
    })
  }

  // 绘制宝石图标
  drawGemIcon(ctx, x, y, size, color) {
    ctx.save()
    ctx.translate(x, y)
    
    const halfSize = size / 2
    
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    
    // 宝石形状（菱形）
    ctx.beginPath()
    ctx.moveTo(0, -halfSize)
    ctx.lineTo(halfSize * 0.8, -halfSize * 0.2)
    ctx.lineTo(halfSize * 0.6, halfSize * 0.8)
    ctx.lineTo(-halfSize * 0.6, halfSize * 0.8)
    ctx.lineTo(-halfSize * 0.8, -halfSize * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    
    // 内部高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.beginPath()
    ctx.moveTo(0, -halfSize * 0.6)
    ctx.lineTo(halfSize * 0.3, -halfSize * 0.1)
    ctx.lineTo(-halfSize * 0.3, -halfSize * 0.1)
    ctx.closePath()
    ctx.fill()
    
    ctx.restore()
  }

  // 绘制头像（支持图片头像和文字头像）
  drawAvatar(x, y, size, avatarUrl, isTop1, isUser = false) {
    const ctx = this.ctx
    
    // 安全检查：确保 size 是有效正数
    if (!size || size <= 0) {
      return
    }
    
    const radius = size / 2
    
    // 检查头像 URL 是否有效（排除空字符串、默认值、无效 URL）
    const isValidAvatarUrl = avatarUrl && 
                             avatarUrl.trim() !== '' && 
                             avatarUrl !== '微信用户' &&
                             !avatarUrl.includes('default') &&
                             !avatarUrl.includes('anonymous') &&
                             !avatarUrl.includes('temp-avatar')
    
    // 如果没有有效头像 URL，使用默认头像图片
    if (!isValidAvatarUrl && this.defaultAvatarLoaded) {
      this.drawImageAvatar(x, y, size, this.defaultAvatarImage, isTop1, isUser)
      return
    }
    
    // 检查是否有缓存的用户头像
    if (isValidAvatarUrl && this.avatarCache && this.avatarCache[avatarUrl]) {
      const cached = this.avatarCache[avatarUrl]
      if (cached.loaded && cached.image) {
        // 已加载完成，绘制图片
        this.drawImageAvatar(x, y, size, cached.image, isTop1, isUser)
        return
      } else if (cached.loading) {
        // 正在加载中，先绘制文字头像
        this.drawTextAvatar(x, y, size, avatarUrl, isTop1, isUser)
        return
      }
    }
    
    // 没有缓存，开始加载
    if (isValidAvatarUrl) {
      this.loadAvatarImage(avatarUrl)
    }
    
    // 加载期间绘制文字头像
    this.drawTextAvatar(x, y, size, avatarUrl, isTop1, isUser)
  }
  
  // 加载头像图片
  loadAvatarImage(avatarUrl) {
    if (!this.avatarCache) {
      this.avatarCache = {}
    }
    
    // 如果已经在加载中或已加载，跳过
    if (this.avatarCache[avatarUrl]) {
      return
    }
    
    // 限制缓存大小，防止内存泄漏（减少到 20 个，每个 Image 对象占用较大）
    const cacheKeys = Object.keys(this.avatarCache)
    if (cacheKeys.length >= 20) {
      // 删除最早的缓存条目
      const oldestKey = cacheKeys[0]
      const oldest = this.avatarCache[oldestKey]
      // 显式清除图片引用
      if (oldest && oldest.image) {
        oldest.image.src = ''
        oldest.image = null
      }
      delete this.avatarCache[oldestKey]
    }
    
    // 标记为加载中
    this.avatarCache[avatarUrl] = { loading: true, loaded: false, image: null }
    
    try {
      const img = wx.createImage()
      img.onload = () => {
        this.avatarCache[avatarUrl] = { loading: false, loaded: true, image: img }
      }
      img.onerror = () => {
        this.avatarCache[avatarUrl] = { loading: false, loaded: false, image: null }
      }
      img.src = avatarUrl
    } catch (e) {
      this.avatarCache[avatarUrl] = { loading: false, loaded: false, image: null }
    }
  }
  
  // 绘制图片头像
  drawImageAvatar(x, y, size, image, isTop1, isUser) {
    const ctx = this.ctx
    const radius = size / 2
    
    ctx.save()
    ctx.translate(x, y)
    
    // 裁剪为圆形
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.clip()
    
    // 绘制头像图片
    ctx.drawImage(
      image,
      -size / 2,
      -size / 2,
      size,
      size
    )
    
    ctx.restore()
    
    // 边框（在裁剪外绘制）
    ctx.strokeStyle = isTop1 ? '#fef3c7' : 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.stroke()
    
    // 用户标签（在裁剪外绘制，使用绝对坐标）
    if (isUser) {
      this.drawUserBadge(x, y, radius)
    }
  }
  
  // 绘制文字头像
  drawTextAvatar(x, y, size, avatarUrl, isTop1, isUser) {
    const ctx = this.ctx
    const radius = size / 2
    
    ctx.save()
    ctx.translate(x, y)
    
    // 绘制文字头像背景
    try {
      const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius)
      if (isTop1) {
        gradient.addColorStop(0, '#fde68a')
        gradient.addColorStop(1, '#d97706')
      } else {
        const hue = this.getHueFromText(avatarUrl || 'default')
        const safeHue = (typeof hue === 'number' && !isNaN(hue)) ? hue : 240
        const color1 = this.hslToHex(safeHue, 70, 65)
        const color2 = this.hslToHex(safeHue, 70, 45)
        gradient.addColorStop(0, color1)
        gradient.addColorStop(1, color2)
      }
      ctx.fillStyle = gradient
    } catch (e) {
      console.warn('drawAvatar gradient failed, using fallback:', e)
      ctx.fillStyle = isTop1 ? '#d97706' : '#6366f1'
    }
    
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = isTop1 ? '#fef3c7' : 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 文字
    const displayText = avatarUrl ? avatarUrl.substring(0, 3).toUpperCase() : 'U'
    ctx.font = `bold ${size * 0.35}px ${FONT_FAMILY}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(displayText, 0, 1)
    
    ctx.restore()
    
    // 用户标签
    if (isUser) {
      this.drawUserBadge(x, y, radius)
    }
  }

  // 绘制用户标签（右下角圆形"我"字，使用绝对坐标避免被裁剪）
  drawUserBadge(cx, cy, radius) {
    const ctx = this.ctx
    const badgeSize = radius * 0.5
    // 右下角位置：圆心 + 半径偏移
    const badgeX = cx + radius * 0.65
    const badgeY = cy + radius * 0.65
    
    // 圆形背景（主色调）
    ctx.fillStyle = '#6366f1'
    ctx.beginPath()
    ctx.arc(badgeX, badgeY, badgeSize, 0, Math.PI * 2)
    ctx.fill()
    
    // 白色边框
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    
    // "我"字
    ctx.font = `bold ${badgeSize * 1.2}px ${FONT_FAMILY}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('我', badgeX, badgeY + 1)
  }

  // 根据文字生成固定色相值
  getHueFromText(text) {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash)
    }
    return Math.abs(hash % 360)
  }

  // HSL 转 HEX 颜色（避免微信 Canvas 不支持 HSL 格式）
  hslToHex(h, s, l) {
    s /= 100
    l /= 100
    const a = s * Math.min(l, 1 - l)
    const f = (n) => {
      const k = (n + h / 30) % 12
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }

  // 绘制哭泣泡泡图标
  drawCryingBubbleIcon(ctx, x, y, size) {
    ctx.save()
    ctx.translate(x, y)
    
    const r = size / 2
    
    // 泡泡渐变
    const bubbleGrad = ctx.createRadialGradient(0, -r * 0.1, r * 0.1, 0, 0, r)
    bubbleGrad.addColorStop(0, '#a78bfa')
    bubbleGrad.addColorStop(1, '#4c1d95')
    
    // 泪滴渐变
    const tearGrad = ctx.createLinearGradient(0, 0, 0, r)
    tearGrad.addColorStop(0, '#38bdf8')
    tearGrad.addColorStop(1, '#0284c7')
    
    // 外圈泡泡形状
    ctx.fillStyle = bubbleGrad
    ctx.strokeStyle = '#f472b6'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 2])
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    
    // 内圈发光
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2)
    ctx.stroke()
    
    // 悲伤哭泣的眼睛
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(-r * 0.35, -r * 0.1, r * 0.15, Math.PI * 0.1, Math.PI * 0.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(r * 0.35, -r * 0.1, r * 0.15, Math.PI * 0.1, Math.PI * 0.9)
    ctx.stroke()
    
    // 蓝色泪滴
    ctx.fillStyle = tearGrad
    // 左泪滴
    ctx.beginPath()
    ctx.moveTo(-r * 0.5, r * 0.05)
    ctx.quadraticCurveTo(-r * 0.5, r * 0.35, -r * 0.6, r * 0.45)
    ctx.quadraticCurveTo(-r * 0.65, r * 0.55, -r * 0.55, r * 0.55)
    ctx.quadraticCurveTo(-r * 0.45, r * 0.55, -r * 0.5, r * 0.35)
    ctx.quadraticCurveTo(-r * 0.5, r * 0.15, -r * 0.5, r * 0.05)
    ctx.fill()
    // 右泪滴
    ctx.beginPath()
    ctx.moveTo(r * 0.5, r * 0.05)
    ctx.quadraticCurveTo(r * 0.5, r * 0.35, r * 0.6, r * 0.45)
    ctx.quadraticCurveTo(r * 0.65, r * 0.55, r * 0.55, r * 0.55)
    ctx.quadraticCurveTo(r * 0.45, r * 0.55, r * 0.5, r * 0.35)
    ctx.quadraticCurveTo(r * 0.5, r * 0.15, r * 0.5, r * 0.05)
    ctx.fill()
    
    // 悲伤下弯的嘴巴
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-r * 0.2, r * 0.35)
    ctx.quadraticCurveTo(0, r * 0.2, r * 0.2, r * 0.35)
    ctx.stroke()
    
    // 红色创可贴（表示泡泡被戳破的伤痕）
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(r * 0.35, -r * 0.55)
    ctx.lineTo(r * 0.55, -r * 0.35)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(r * 0.55, -r * 0.55)
    ctx.lineTo(r * 0.35, -r * 0.35)
    ctx.stroke()
    
    // 左上角光泽高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.save()
    ctx.translate(-r * 0.25, -r * 0.45)
    ctx.rotate(-Math.PI / 6)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.15, r * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    
    ctx.restore()
  }
}
