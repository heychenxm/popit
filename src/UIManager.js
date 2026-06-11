import { Colors, drawRoundRect, drawText, drawTextWithShadow, isPointInRect, getPhaseIndicatorLayout } from './utils.js'
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
    this.currentScreen = 'menu' // 'menu' | 'game' | 'win' | 'fail' | 'leaderboard' | 'checkin' | 'share' | 'profile'
    
    // 动画状态
    this.animationFrame = 0
    
    // 排行榜加载状态
  this.leaderboardLoading = false
  this.leaderboardLoadTime = 0

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
    testCtx.font = 'bold 11.2px sans-serif'  // 金币字体
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
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        this.menuCache = wx.createOffscreenCanvas(this.width, this.height)
        this.menuCtx = this.menuCache.getContext('2d')
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
    if (gameState.canShareGift()) {
      this.drawShareGiftIcon()
    }
    
    // 恢复 ctx
    this.ctx = originalCtx
  }
  
  // 设置字体（带缓存）
  setFont(fontKey) {
    const fontMap = {
      'bold18': 'bold 18px sans-serif',
      'bold11_2': 'bold 11.2px sans-serif',
      'normal10': '10px sans-serif',
      'bold16': 'bold 16px sans-serif'
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
      if (gameState.canShareGift()) {
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
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(value, x + 28, y + 15)
    
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
    
    // 背景
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

    const logoScale = 1.05
    drawWidth *= logoScale
    drawHeight *= logoScale

    const centerX = this.width / 2
    const centerY = this.height * 0.18

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
    const y = this.height * 0.28
    
    ctx.save()
    ctx.font = '14px sans-serif'
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
    
    // 检测微信版本
    const systemInfo = wx.getSystemInfoSync()
    const version = systemInfo.SDKVersion || ''
    const [major, minor] = version.split('.').map(Number)
    const isOldVersion = major < 2 || (major === 2 && minor < 27)
    
    ctx.save()
    
    // 绘制按钮背景
    const gradient = ctx.createLinearGradient(btnX, btnY, btnX + btnWidth, btnY + btnHeight)
    gradient.addColorStop(0, '#6366f1')
    gradient.addColorStop(1, '#8b5cf6')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 22)
    ctx.fill()
    
    // 绘制按钮边框
    ctx.strokeStyle = '#a5b4fc'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 根据版本显示不同文字
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const buttonText = isOldVersion ? '授权获取昵称和头像' : '设置昵称和头像'
    ctx.fillText(buttonText, this.width / 2, btnY + btnHeight / 2)
    
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
    
    // 3D阴影层（底部）
    ctx.fillStyle = '#c26a00'
    drawRoundRect(ctx, btnX, btnY + 6, btnWidth, btnHeight, btnRadius)
    ctx.fill()
    
    // 主按钮体
    const gradient = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnHeight)
    gradient.addColorStop(0, '#ffd13b')
    gradient.addColorStop(1, '#ff9e00')
    
    ctx.fillStyle = gradient
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
    ctx.font = 'bold 22px sans-serif'
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
      { id: 'share', icon: 'share', label: '分享', color1: '#ec4899', color2: '#f43f5e', borderColor: '#f9a8d4', hasBadge: true }
    ]
    
    buttons.forEach((btn, i) => {
      const x = startX + i * (btnSize + gap)
      const y = btnY
      
      ctx.save()
      
      // 声音按钮特殊处理：静音时使用灰色背景
      let bgColor, borderColor
      if (btn.id === 'sound' && !gameState.soundEnabled) {
        // 静音状态：灰色背景
        bgColor = ctx.createLinearGradient(x, y, x + btnSize, y + btnSize)
        bgColor.addColorStop(0, '#475569')
        bgColor.addColorStop(1, '#334155')
        borderColor = '#64748b'
      } else {
        // 正常状态：原色背景
        bgColor = ctx.createLinearGradient(x, y, x + btnSize, y + btnSize)
        bgColor.addColorStop(0, btn.color1)
        bgColor.addColorStop(1, btn.color2)
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
      ctx.font = '10px sans-serif'
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
    })
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
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText('新赛季开启', textStartX, bannerY + bannerH / 2 - 8)
    
    // 副标题 + 赛季倒计时（同行显示）
    ctx.font = '10px sans-serif'
    ctx.textBaseline = 'middle'
    
    const subtitleText = '每周五 24:00 结算排行榜'
    ctx.fillStyle = Colors.gray300
    ctx.textAlign = 'left'
    ctx.fillText(subtitleText, textStartX, bannerY + bannerH / 2 + 10)
    
    // 赛季倒计时显示（同行右侧）
    if (gameState && gameState.seasonInfo && gameState.seasonInfo.timeRemaining > 0) {
      const remaining = gameState.seasonInfo.timeRemaining
      const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
      
      ctx.textAlign = 'right'
      ctx.fillText(`剩余 ${days}天${hours}时`, bannerX + bannerW - 80, bannerY + bannerH / 2 + 10)
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
    
    ctx.font = 'bold 11px sans-serif'
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
    ctx.font = 'bold 10px sans-serif'
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
  }

  // 绘制游戏HUD
  drawGameHUD(gameState) {
    const ctx = this.ctx
    const padding = 20
    const topPadding = 60
    
    ctx.save()
    
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
    
    ctx.restore()
  }

  // 绘制分数卡片
  drawScoreCard(x, y, w, h, label, value, valueColor) {
    const ctx = this.ctx
    
    ctx.save()
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
    
    ctx.restore()
  }

  // 绘制生命卡片
  drawLifeCard(x, y, w, h, gameState) {
    const ctx = this.ctx
    
    ctx.save()
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
    
    ctx.restore()
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
    
    ctx.font = 'bold 16px sans-serif'
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
    
    // 标题
    const titleY = modalY + 35
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#34d399'
    ctx.fillText('每日签到', this.width / 2, titleY)
    
    // 副标题
    ctx.font = '12px sans-serif'
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
    // 当前周期起始天数（0, 7, 14, 21...）
    const cycleStart = Math.floor((streak - 1) / 7) * 7
    // 当前周期内已签到天数（0-7）
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
    
    // 7 天连签奖励
    const bonusX = gridStartX + cellWidth + gap
    const bonusY = day7Y
    const bonusWidth = cellWidth * 2 + gap
    const bonusHeight = cellHeight
    
    this.drawBonusCard(ctx, bonusX, bonusY, bonusWidth, bonusHeight, bonusObtained, day7)
    
    // 签到按钮
    const btnWidth = modalW - 60
    const btnHeight = 46
    const btnX = modalX + 30
    const btnY = bonusY + bonusHeight + 25
    
    if (gameState.canCheckin()) {
      const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnHeight)
      btnGrad.addColorStop(0, '#4ade80')
      btnGrad.addColorStop(1, '#16a34a')
      
      ctx.fillStyle = btnGrad
      drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 16)
      ctx.fill()
      ctx.strokeStyle = '#86efac'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = 'bold 16px sans-serif'
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.fillText('立即签到领奖', modalX + modalW / 2, btnY + btnHeight / 2)
      
      this.buttons.push({
        id: 'checkin',
        x: btnX,
        y: btnY,
        w: btnWidth,
        h: btnHeight
      })
    } else {
      ctx.fillStyle = '#374151'
      drawRoundRect(ctx, btnX, btnY, btnWidth, btnHeight, 16)
      ctx.fill()
      ctx.strokeStyle = '#6b7280'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = 'bold 16px sans-serif'
      ctx.fillStyle = Colors.gray400
      ctx.textAlign = 'center'
      ctx.fillText('今日已签到', modalX + modalW / 2, btnY + btnHeight / 2)
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
    
    ctx.font = isToday ? 'bold 12px sans-serif' : '11px sans-serif'
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
    
    ctx.font = 'bold 12px sans-serif'
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
    
    ctx.font = 'bold 16px sans-serif'
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
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('专属分享礼包已备好', this.width / 2, titleY)
    
    // 描述文字
    const descY = titleY + 28
    ctx.font = '12px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.textAlign = 'center'
    
    const descText1 = '分享本游戏至群聊或好友，'
    const descText2 = '立即免费获得'
    ctx.fillText(descText1, this.width / 2, descY)
    ctx.fillText(descText2, this.width / 2, descY + 18)
    
    // 奖励文字（高亮）
    ctx.font = 'bold 14px sans-serif'
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
    ctx.font = '11px sans-serif'
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
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('🎈', gameIconX + gameIconSize / 2, previewContentY + gameIconSize / 2)
    
    // 游戏标题
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'left'
    ctx.fillText('来挑战泡泡大师！', gameIconX + gameIconSize + 10, previewContentY + 12)
    
    // 游戏描述
    ctx.font = '11px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.fillText('我轻松闯过第 12 关，你敢来比一比吗？', gameIconX + gameIconSize + 10, previewContentY + 32)
    
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
    
    ctx.font = 'bold 16px sans-serif'
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
    
    // 标题
    ctx.font = '11px sans-serif'
    ctx.fillStyle = isSigned ? Colors.gray300 : '#fde68a'
    ctx.textAlign = 'center'
    ctx.fillText(isSigned ? `${bonusDay}天连续奖励已获得` : `${bonusDay} 天连签奖励`, x + w / 2, y + 22)
    
    // 金币图标
    const iconSize = 36
    const iconY = y + h / 2 + 10
    drawCoinIcon(ctx, x + w / 2, iconY, iconSize, '#facc15')
    
    // 奖励文字
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = Colors.gray300
    ctx.textAlign = 'center'
    ctx.fillText(isSigned ? '+2000' : '额外 +2000', x + w / 2, y + h - 12)
  }

  // 绘制排行榜弹窗
  drawLeaderboardModal(gameState) {
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
    gradient.addColorStop(0, '#312e81')
    gradient.addColorStop(1, '#4c1d95')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 关闭按钮
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
    
    ctx.font = 'bold 16px sans-serif'
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
    
    // 标题
    const titleY = modalY + 35
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText('🏆 排行榜', this.width / 2, titleY)
    
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
    const scoreBtnActive = this.leaderboardType === 'score'
    
    if (scoreBtnActive) {
      const scoreGrad = ctx.createLinearGradient(scoreBtnX, switchContainerY, scoreBtnX, switchContainerY + switchContainerH)
      scoreGrad.addColorStop(0, '#fbbf24')
      scoreGrad.addColorStop(1, '#d97706')
      ctx.fillStyle = scoreGrad
      drawRoundRect(ctx, scoreBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = scoreBtnActive ? Colors.white : Colors.gray400
    ctx.textAlign = 'center'
    ctx.fillText('最高分', scoreBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: 'leaderboard_score',
      x: scoreBtnX,
      y: switchContainerY,
      w: scoreBtnW,
      h: switchContainerH
    })
    
    // 切换按钮：最高关卡
    const waveBtnX = switchContainerX + scoreBtnW
    const waveBtnActive = this.leaderboardType === 'wave'
    
    if (waveBtnActive) {
      const waveGrad = ctx.createLinearGradient(waveBtnX, switchContainerY, waveBtnX, switchContainerY + switchContainerH)
      waveGrad.addColorStop(0, '#fbbf24')
      waveGrad.addColorStop(1, '#d97706')
      ctx.fillStyle = waveGrad
      drawRoundRect(ctx, waveBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.fillStyle = waveBtnActive ? Colors.white : Colors.gray400
    ctx.fillText('最高关卡', waveBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: 'leaderboard_wave',
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
    const showSkeleton = this.leaderboardLoading || !this.leaderboardData || !this.leaderboardData.leaderboard || this.leaderboardData.leaderboard.length === 0
    
    if (showSkeleton) {
      // 显示骨架屏 - 前三名
      for (let i = 0; i < 3; i++) {
        const itemX = modalX + 20 + i * (top3ItemW + 10)
        const itemY = i === 1 ? top3ContainerY - 10 : top3ContainerY
        const itemH = i === 1 ? top3ContainerH + 10 : top3ContainerH
        
        // 骨架屏背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, itemX, itemY, top3ItemW, itemH, 16)
        ctx.fill()
        
        // 骨架屏动画（闪烁效果）
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.2})`
        drawRoundRect(ctx, itemX + 5, itemY + 5, top3ItemW - 10, itemH - 10, 12)
        ctx.fill()
      }
    } else {
      const leaderboard = this.leaderboardData.leaderboard
      const top1 = leaderboard[0]
      const top2 = leaderboard[1]
      const top3 = leaderboard[2]
      
      if (top2) {
        this.drawLeaderboardRankCard(
          modalX + 20, top3ContainerY, top3ItemW, top3ContainerH,
          top2.rank, top2.nickname, top2.avatarUrl, top2.value,
          2, top2.isUser
        )
      }
      
      if (top1) {
        this.drawLeaderboardRankCard(
          modalX + 20 + top3ItemW + 10, top3ContainerY - 10, top3ItemW, top3ContainerH + 10,
          top1.rank, top1.nickname, top1.avatarUrl, top1.value,
          1, top1.isUser, true
        )
      }
      
      if (top3) {
        this.drawLeaderboardRankCard(
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
    const listContainerH = 160
    const listItemH = 40
    const listItemGap = 8
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, listContainerX, listContainerY, listContainerW, listContainerH, 16)
    ctx.fill()
    
    if (showSkeleton) {
      // 显示骨架屏 - 列表
      for (let i = 0; i < 3; i++) {
        const itemY = listContainerY + listInnerPadding + i * (listItemH + listItemGap)
        
        // 骨架屏背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, listContainerX + listInnerPadding, itemY, listContainerW - listInnerPadding * 2, listItemH, 8)
        ctx.fill()
        
        // 骨架屏动画
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + i * 0.5)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.15})`
        drawRoundRect(ctx, listContainerX + listInnerPadding + 5, itemY + 5, listContainerW - listInnerPadding * 2 - 10, listItemH - 10, 6)
        ctx.fill()
      }
    } else {
      const leaderboard = this.leaderboardData.leaderboard
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
    }
    
    ctx.restore()
  }

  // 绘制赛季排名弹窗
  drawSeasonLeaderboardModal(gameState) {
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
    gradient.addColorStop(0, '#312e81')
    gradient.addColorStop(1, '#4c1d95')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 关闭按钮
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
    
    ctx.font = 'bold 16px sans-serif'
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
    
    // 标题
    const titleY = modalY + 35
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#a5b4fc'
    
    // 显示赛季编号 + 标题（如：S23 赛季排名）
    let titleText = '🏆 赛季排名'
    if (gameState && gameState.seasonInfo && gameState.seasonInfo.currentSeasonId) {
      const seasonNum = gameState.seasonInfo.currentSeasonId.replace(/^\d+-S/, 'S')
      titleText = `🏆 ${seasonNum} 赛季排名`
    }
    ctx.fillText(titleText, this.width / 2, titleY)
    
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
    const scoreBtnActive = this.seasonLeaderboardType === 'score'
    
    if (scoreBtnActive) {
      const scoreGrad = ctx.createLinearGradient(scoreBtnX, switchContainerY, scoreBtnX, switchContainerY + switchContainerH)
      scoreGrad.addColorStop(0, '#fbbf24')
      scoreGrad.addColorStop(1, '#d97706')
      ctx.fillStyle = scoreGrad
      drawRoundRect(ctx, scoreBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = scoreBtnActive ? Colors.white : Colors.gray400
    ctx.textAlign = 'center'
    ctx.fillText('最高分', scoreBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: 'season_leaderboard_score',
      x: scoreBtnX,
      y: switchContainerY,
      w: scoreBtnW,
      h: switchContainerH
    })
    
    // 切换按钮：最高关卡
    const waveBtnX = switchContainerX + scoreBtnW
    const waveBtnActive = this.seasonLeaderboardType === 'wave'
    
    if (waveBtnActive) {
      const waveGrad = ctx.createLinearGradient(waveBtnX, switchContainerY, waveBtnX, switchContainerY + switchContainerH)
      waveGrad.addColorStop(0, '#fbbf24')
      waveGrad.addColorStop(1, '#d97706')
      ctx.fillStyle = waveGrad
      drawRoundRect(ctx, waveBtnX, switchContainerY, scoreBtnW, switchContainerH, 18)
      ctx.fill()
    }
    
    ctx.fillStyle = waveBtnActive ? Colors.white : Colors.gray400
    ctx.fillText('最高关卡', waveBtnX + scoreBtnW / 2, switchContainerY + switchContainerH / 2)
    
    this.buttons.push({
      id: 'season_leaderboard_wave',
      x: waveBtnX,
      y: switchContainerY,
      w: scoreBtnW,
      h: switchContainerH
    })
    
    // 前 6 名展示区（2 行 3 列）
    const topContainerY = switchContainerY + switchContainerH + 20
    const topContainerH = 140
    const topItemW = (modalW - 60) / 3
    
    // 检查是否需要显示骨架屏
    const showSeasonSkeleton = this.seasonLeaderboardLoading || !this.seasonLeaderboardData || !this.seasonLeaderboardData.leaderboard || this.seasonLeaderboardData.leaderboard.length === 0
    
    if (showSeasonSkeleton) {
      // 显示骨架屏 - 前三名（与普通排行榜一致）
      for (let i = 0; i < 3; i++) {
        const itemX = modalX + 20 + i * (topItemW + 10)
        const itemY = i === 1 ? topContainerY - 10 : topContainerY
        const itemH = i === 1 ? topContainerH + 10 : topContainerH
        
        // 骨架屏背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, itemX, itemY, topItemW, itemH, 16)
        ctx.fill()
        
        // 骨架屏动画（闪烁效果）
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + i * 0.3)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.2})`
        drawRoundRect(ctx, itemX + 5, itemY + 5, topItemW - 10, itemH - 10, 12)
        ctx.fill()
      }
    } else {
      const leaderboard = this.seasonLeaderboardData.leaderboard
      
      // 第 1 行：第 2、1、3 名
      if (leaderboard[1]) {
        this.drawSeasonLeaderboardRankCard(
          modalX + 20, topContainerY, topItemW, topContainerH,
          leaderboard[1].rank, leaderboard[1].nickname, leaderboard[1].avatarUrl, leaderboard[1].value,
          2, leaderboard[1].isUser
        )
      }
      
      if (leaderboard[0]) {
        this.drawSeasonLeaderboardRankCard(
          modalX + 20 + topItemW + 10, topContainerY - 10, topItemW, topContainerH + 10,
          leaderboard[0].rank, leaderboard[0].nickname, leaderboard[0].avatarUrl, leaderboard[0].value,
          1, leaderboard[0].isUser, true
        )
      }
      
      if (leaderboard[2]) {
        this.drawSeasonLeaderboardRankCard(
          modalX + 20 + (topItemW + 10) * 2, topContainerY, topItemW, topContainerH,
          leaderboard[2].rank, leaderboard[2].nickname, leaderboard[2].avatarUrl, leaderboard[2].value,
          3, leaderboard[2].isUser
        )
      }
    }
    
    // 排行榜列表（4-6 名占满容器宽度，左右等距）
    const modalPadding = 20
    const listInnerPadding = 10
    const listContainerX = modalX + modalPadding
    const listContainerW = modalW - modalPadding * 2
    const listContainerY = topContainerY + topContainerH + 10
    const listContainerH = 160
    const listItemH = 40
    const listItemGap = 8
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, listContainerX, listContainerY, listContainerW, listContainerH, 16)
    ctx.fill()
    
    if (showSeasonSkeleton) {
      // 显示骨架屏 - 列表（与普通排行榜一致）
      for (let i = 0; i < 3; i++) {
        const itemY = listContainerY + listInnerPadding + i * (listItemH + listItemGap)
        
        // 骨架屏背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        drawRoundRect(ctx, listContainerX + listInnerPadding, itemY, listContainerW - listInnerPadding * 2, listItemH, 8)
        ctx.fill()
        
        // 骨架屏动画
        const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + i * 0.5)
        ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.15})`
        drawRoundRect(ctx, listContainerX + listInnerPadding + 5, itemY + 5, listContainerW - listInnerPadding * 2 - 10, listItemH - 10, 6)
        ctx.fill()
      }
    } else {
      const leaderboard = this.seasonLeaderboardData.leaderboard
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
    }
    
    // 底部提示
    const footerY = modalY + modalH - 35
    ctx.font = '10px sans-serif'
    ctx.fillStyle = 'rgba(165, 180, 252, 0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('新赛季将于每周五 24:00 结束自动结算并派发金币奖励', this.width / 2, footerY)
    
    ctx.restore()
  }
  
  // 绘制骨架屏动画
  drawSkeletonScreen(ctx, x, y, w, h, delay = 0) {
    // 骨架屏背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    drawRoundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    
    // 骨架屏动画（闪烁效果）
    const skeletonAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500 + delay)
    ctx.fillStyle = `rgba(255, 255, 255, ${skeletonAlpha * 0.2})`
    drawRoundRect(ctx, x + 5, y + 5, w - 10, h - 10, 6)
    ctx.fill()
  }

  // 绘制赛季排名卡片
  drawSeasonLeaderboardRankCard(x, y, w, h, rank, nickname, avatarUrl, value, rankNum, isUser, isTop1 = false) {
    const ctx = this.ctx
    
    ctx.save()
    
    let bgColor
    if (isTop1) {
      const grad = ctx.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, '#4f46e5')
      grad.addColorStop(1, '#3730a3')
      bgColor = grad
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
    
    ctx.font = isTop1 ? 'bold 12px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    const rankText = isTop1 ? '🏆 第 1 名' : `第${rank}名`
    ctx.fillText(rankText, x + w / 2, y + 20)
    
    const avatarSize = isTop1 ? 52 : 44
    const avatarX = x + w / 2
    const avatarY = y + 55
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1, isUser)
    
    ctx.font = isTop1 ? 'bold 11px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 6 ? safeNickname.substring(0, 5) + '...' : safeNickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)
    
    ctx.font = isTop1 ? 'bold 18px sans-serif' : 'bold 14px sans-serif'
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(value.toString(), x + w / 2, y + 120)
    
    ctx.restore()
  }

  // 绘制排行榜前三名卡片
  drawLeaderboardRankCard(x, y, w, h, rank, nickname, avatarUrl, value, rankNum, isUser, isTop1 = false) {
    const ctx = this.ctx
    
    ctx.save()
    
    let bgColor
    if (isTop1) {
      const grad = ctx.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, '#4f46e5')
      grad.addColorStop(1, '#3730a3')
      bgColor = grad
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
    
    ctx.font = isTop1 ? 'bold 12px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    const rankText = isTop1 ? '🏆 第 1 名' : `第${rank}名`
    ctx.fillText(rankText, x + w / 2, y + 20)
    
    const avatarSize = isTop1 ? 52 : 44
    const avatarX = x + w / 2
    const avatarY = y + 55
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1, isUser)
    
    ctx.font = isTop1 ? 'bold 11px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 6 ? safeNickname.substring(0, 5) + '...' : safeNickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)
    
    ctx.font = isTop1 ? 'bold 18px sans-serif' : 'bold 14px sans-serif'
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(value.toString(), x + w / 2, y + 120)
    
    ctx.restore()
  }

  // 绘制排行榜列表项
  drawLeaderboardListItem(x, y, w, h, rank, nickname, avatarUrl, value, isHighlight, isUser) {
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
    
    ctx.font = isHighlight ? 'bold 12px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.gray400
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const rankText = typeof rank === 'number' ? `${rank}.` : rank
    ctx.fillText(rankText, x + itemPadding, y + h / 2)
    
    const avatarSize = 32
    const avatarX = x + itemPadding + 28
    const avatarY = y + h / 2
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, false, isUser)
    
    ctx.font = isHighlight ? 'bold 11px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.white
    ctx.textAlign = 'left'
    const safeNickname = nickname || '泡泡大师'
    const displayNickname = safeNickname.length > 10 ? safeNickname.substring(0, 9) + '...' : safeNickname
    ctx.fillText(displayNickname, avatarX + avatarSize / 2 + 12, y + h / 2)
    
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#a5b4fc'
    ctx.textAlign = 'right'
    ctx.fillText(value.toString(), x + w - itemPadding, y + h / 2)
    
    ctx.restore()
  }

  // 绘制阶段指示器（对齐 index_v1.0.3.html：HUD 下方独立提示区，不与网格重叠）
  drawPhaseIndicator(gameState) {
    const ctx = this.ctx
    const { titleY, descY } = getPhaseIndicatorLayout(this.width, this.height)
    
    ctx.save()
    
    if (gameState.phase === 'OBSERVE') {
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.purple500
      ctx.shadowColor = 'rgba(168, 85, 247, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('请观察！', this.width / 2, titleY)
      
      ctx.font = '12px sans-serif'
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.textBaseline = 'middle'
      ctx.fillText('记住闪烁的气泡', this.width / 2, descY)
    } else if (gameState.phase === 'PLAY') {
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.yellow300
      ctx.shadowColor = 'rgba(234, 179, 8, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('点它！', this.width / 2, titleY)
      
      ctx.font = '12px sans-serif'
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.textBaseline = 'middle'
      ctx.fillText('在倒计时结束前点破所有闪烁的气泡', this.width / 2, descY)
    }
    
    ctx.restore()
  }

  // 绘制倒计时进度条
  drawCountdownBar(gameState) {
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
    
    ctx.font = 'bold 10px sans-serif'
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
    const progress = Math.max(0, gameState.timerRemaining / gameState.playDuration)
    const fillW = progressW * progress
    
    const gradient = ctx.createLinearGradient(progressX, barY, progressX + fillW, barY)
    gradient.addColorStop(0, Colors.pink500)
    gradient.addColorStop(1, Colors.rose500)
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, progressX, barY + 4, fillW, progressH, progressH / 2)
    ctx.fill()
    
    // 时间文字
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    
    // 绘制时钟图标
    const clockIconX = this.width / 2 - 50
    const clockIconY = barY - 16
    this.drawClockIcon(ctx, clockIconX, clockIconY, 14, Colors.yellow300)
    
    ctx.fillText(`剩余时间: ${(gameState.timerRemaining / 1000).toFixed(1)} 秒`, this.width / 2 + 10, barY - 16)
    
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
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = scoreColor
      ctx.fillText(`${labelPrefix}${scoreText}`, this.width / 2, centerY)
      return
    }
    
    ctx.font = `${fontSize}px sans-serif`
    const prefixWidth = ctx.measureText(labelPrefix).width
    
    ctx.font = `bold ${fontSize}px sans-serif`
    const scoreWidth = ctx.measureText(scoreText).width
    
    ctx.font = `${badgeFontSize}px sans-serif`
    const badgeW = ctx.measureText(badgeText).width + 12
    const badgeH = Math.max(16, badgeFontSize + 7)
    const gap = 6
    const totalWidth = prefixWidth + scoreWidth + gap + badgeW
    let startX = this.width / 2 - totalWidth / 2
    
    ctx.textAlign = 'left'
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = labelColor
    ctx.fillText(labelPrefix, startX, centerY)
    startX += prefixWidth
    
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillStyle = newScoreColor
    ctx.fillText(scoreText, startX, centerY)
    startX += scoreWidth + gap
    
    ctx.fillStyle = Colors.rose500
    drawRoundRect(ctx, startX, centerY - badgeH / 2, badgeW, badgeH, badgeH / 2)
    ctx.fill()
    
    ctx.font = `${badgeFontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = Colors.white
    ctx.fillText(badgeText, startX + badgeW / 2, centerY)
    
    ctx.textAlign = 'center'
  }

  // 绘制胜利弹窗中的最高分栏（破纪录时显示「新纪录!」徽章）
  drawWinHighScoreBanner(ctx, modalX, modalW, scoreY, gameState) {
    const barH = 28
    const centerY = scoreY + barH / 2
    
    this.drawScoreWithRecordBadge(ctx, centerY, '最高分: ', `${gameState.highScore}`, {
      isNewRecord: gameState.isNewHighScore(),
      labelColor: Colors.gray300,
      scoreColor: Colors.gray300,
      fontSize: 11
    })
  }

  // 绘制胜利弹窗
  drawWinModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalH = 420
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 弹窗背景
    const gradient = ctx.createLinearGradient(modalX, modalY, modalX, modalY + modalH)
    gradient.addColorStop(0, '#4c2299')
    gradient.addColorStop(1, '#290f63')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = Colors.purple500
    ctx.lineWidth = 4
    ctx.stroke()
    
    // 胜利标题
    const titleY = modalY + 30
    ctx.fillStyle = '#ef4444'
    drawRoundRect(ctx, modalX + 60, titleY, modalW - 120, 44, 16)
    ctx.fill()
    ctx.strokeStyle = Colors.yellow400
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.fillText('胜利！', this.width / 2, titleY + 22)
    
    // 星星（使用 Canvas 路径绘制）
    ctx.shadowBlur = 0
    const starY = titleY + 50
    this.drawStar(ctx, this.width / 2 - 30, starY, 14, Colors.yellow400)
    this.drawStar(ctx, this.width / 2, starY - 8, 18, Colors.yellow400)
    this.drawStar(ctx, this.width / 2 + 30, starY, 14, Colors.yellow400)
    
    // 关卡
    ctx.font = '14px sans-serif'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(`第 ${gameState.wave} 关`, this.width / 2, starY + 30)
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, starY + 50)
    ctx.lineTo(modalX + modalW - 20, starY + 50)
    ctx.stroke()
    
    // 奖励标题
    ctx.font = '12px sans-serif'
    ctx.fillStyle = Colors.gray300
    ctx.fillText('获得奖励', this.width / 2, starY + 70)
    
    // 奖励物品（居中展示）
    const rewardY = starY + 90
    const rewardBoxH = 60
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + 20, rewardY, modalW - 40, rewardBoxH, 12)
    ctx.fill()
    
    const rewardCenterX = this.width / 2
    const rewardCenterY = rewardY + rewardBoxH / 2
    const coinSize = 24
    const valueText = `+${config.rewards.waveClear}`
    
    ctx.font = 'bold 14px sans-serif'
    ctx.textBaseline = 'middle'
    const valueWidth = ctx.measureText(valueText).width
    const totalWidth = coinSize + 8 + valueWidth
    let startX = rewardCenterX - totalWidth / 2
    
    drawCoinIcon(ctx, startX + coinSize / 2, rewardCenterY, coinSize, '#facc15')
    startX += coinSize + 8
    
    ctx.textAlign = 'left'
    ctx.fillStyle = Colors.white
    ctx.fillText(valueText, startX, rewardCenterY)
    
    // 最高分
    const scoreY = rewardY + 80
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    drawRoundRect(ctx, modalX + 30, scoreY, modalW - 60, 28, 14)
    ctx.fill()
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.drawWinHighScoreBanner(ctx, modalX, modalW, scoreY, gameState)
    
    // 按钮
    const btnY = scoreY + 40
    const btnW = (modalW - 60) / 2
    const btnH = 40
    
    // 返回首页按钮
    ctx.fillStyle = '#0284c7'
    drawRoundRect(ctx, modalX + 20, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = '#7dd3fc'
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('返回首页', modalX + 20 + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'home',
      x: modalX + 20,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    // 下一关按钮
    const nextBtnX = modalX + 40 + btnW
    const nextGradient = ctx.createLinearGradient(nextBtnX, btnY, nextBtnX, btnY + btnH)
    nextGradient.addColorStop(0, '#a3e635')
    nextGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = nextGradient
    drawRoundRect(ctx, nextBtnX, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = '#f0fdf4'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('下一关', nextBtnX + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'next',
      x: nextBtnX,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    ctx.restore()
  }

  // 绘制失败弹窗中的「继续 + 金币价格」按钮文字
  drawContinuePurchaseButton(ctx, btnX, btnY, btnW, btnH, price, enabled = true) {
    const centerY = btnY + btnH / 2
    const centerX = btnX + btnW / 2
    const coinSize = 14
    const textColor = enabled ? Colors.white : Colors.gray400
    const coinColor = enabled ? '#facc15' : '#6b7280'
    
    ctx.font = 'bold 13px sans-serif'
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
    const modalH = 380
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons.length = 0
    
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
    
    // 失败标题
    const titleY = modalY + 30
    ctx.fillStyle = '#334155'
    drawRoundRect(ctx, modalX + 60, titleY, modalW - 120, 44, 16)
    ctx.fill()
    ctx.strokeStyle = Colors.gray500
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 4
    ctx.fillText('失败！', this.width / 2, titleY + 22)
    
    // 哭泣泡泡图标（使用 Canvas 路径绘制）
    ctx.shadowBlur = 0
    this.drawCryingBubbleIcon(ctx, this.width / 2, titleY + 60, 48)
    
    // 关卡
    ctx.font = '14px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.fillText(`第 ${gameState.wave} 关`, this.width / 2, titleY + 90)
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 110)
    ctx.lineTo(modalX + modalW - 20, titleY + 110)
    ctx.stroke()
    
    // 本局总得分
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.drawScoreWithRecordBadge(ctx, titleY + 135, '本局得分：', `${gameState.score}`, {
      isNewRecord: gameState.isNewHighScore(),
      labelColor: Colors.yellow300,
      scoreColor: Colors.yellow300,
      fontSize: 16
    })
    
    // 分隔线 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 155)
    ctx.lineTo(modalX + modalW - 20, titleY + 155)
    ctx.stroke()
    
    // 当前金币
    const infoY = titleY + 170
    const infoH = 50
    const canPurchase = gameState.canPurchaseLife()
    const purchasePrice = gameState.getPurchasePrice()
    
    ctx.fillStyle = canPurchase ? 'rgba(34, 197, 94, 0.15)' : 'rgba(75, 85, 99, 0.2)'
    drawRoundRect(ctx, modalX + 20, infoY, modalW - 40, infoH, 12)
    ctx.fill()
    ctx.strokeStyle = canPurchase ? Colors.emerald500 : Colors.gray600
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText(`当前金币：${gameState.coins}`, this.width / 2, infoY + infoH / 2)
    
    // 按钮区域
    const btnY = infoY + infoH + 20
    const btnW = (modalW - 60) / 2
    const btnH = 42
    
    // 返回首页
    ctx.fillStyle = Colors.gray700
    drawRoundRect(ctx, modalX + 20, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = Colors.gray500
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('返回首页', modalX + 20 + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'home',
      x: modalX + 20,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    const continueBtnX = modalX + 40 + btnW
    const hasPurchaseAttempts = gameState.purchaseCount < config.game.maxPurchaseCount
    
    if (hasPurchaseAttempts) {
      if (canPurchase) {
        const purchaseBtnGradient = ctx.createLinearGradient(continueBtnX, btnY, continueBtnX + btnW, btnY + btnH)
        purchaseBtnGradient.addColorStop(0, '#22c55e')
        purchaseBtnGradient.addColorStop(1, '#16a34a')
        
        ctx.fillStyle = purchaseBtnGradient
        drawRoundRect(ctx, continueBtnX, btnY, btnW, btnH, 12)
        ctx.fill()
        ctx.strokeStyle = '#86efac'
        ctx.lineWidth = 2
        ctx.stroke()
      } else {
        ctx.fillStyle = Colors.gray700
        drawRoundRect(ctx, continueBtnX, btnY, btnW, btnH, 12)
        ctx.fill()
        ctx.strokeStyle = Colors.gray500
        ctx.lineWidth = 1
        ctx.stroke()
      }
      
      this.drawContinuePurchaseButton(ctx, continueBtnX, btnY, btnW, btnH, purchasePrice, canPurchase)
      
      this.buttons.push({
        id: 'purchase',
        x: continueBtnX,
        y: btnY,
        w: btnW,
        h: btnH
      })
    } else {
      const retryGradient = ctx.createLinearGradient(continueBtnX, btnY, continueBtnX, btnY + btnH)
      retryGradient.addColorStop(0, '#ffd13b')
      retryGradient.addColorStop(1, '#ff9e00')
      
      ctx.fillStyle = retryGradient
      drawRoundRect(ctx, continueBtnX, btnY, btnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fffdf0'
      ctx.lineWidth = 3
      ctx.stroke()
      
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('重新开始', continueBtnX + btnW / 2, btnY + btnH / 2)
      
      this.buttons.push({
        id: 'restart',
        x: continueBtnX,
        y: btnY,
        w: btnW,
        h: btnH
      })
    }
    
    ctx.restore()
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
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText('游戏暂停', this.width / 2, titleY)
    
    // 副标题
    ctx.font = '12px sans-serif'
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
    
    ctx.font = 'bold 16px sans-serif'
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
    
    ctx.font = 'bold 18px sans-serif'
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
    ctx.font = 'bold 12px sans-serif'
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
    
    ctx.font = 'bold 12px sans-serif'
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
    this.animationFrame++
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
      case 'win':
        this.drawWinModal(gameState)
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
    }
    
    this.drawToast()
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

  // 绘制星星
  drawStar(ctx, x, y, size, color) {
    ctx.save()
    ctx.translate(x, y)
    
    const spikes = 5
    const outerRadius = size
    const innerRadius = size * 0.4
    
    ctx.fillStyle = color
    ctx.beginPath()
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius
      const angle = (i * Math.PI) / spikes - Math.PI / 2
      const px = Math.cos(angle) * radius
      const py = Math.sin(angle) * radius
      
      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
    
    ctx.closePath()
    ctx.fill()
    
    ctx.restore()
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

  // 绘制头像（支持文字头像）
  drawAvatar(x, y, size, avatarUrl, isTop1, isUser = false) {
    const ctx = this.ctx
    
    // 安全检查：确保 size 是有效正数
    if (!size || size <= 0) {
      console.warn('drawAvatar: invalid size', size)
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
      ctx.save()
      ctx.translate(x, y)
      
      const imgSize = size
      
      // 裁剪为圆形
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.clip()
      
      // 绘制默认头像
      ctx.drawImage(
        this.defaultAvatarImage,
        -imgSize / 2,
        -imgSize / 2,
        imgSize,
        imgSize
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
      return
    }
    
    ctx.save()
    ctx.translate(x, y)
    
    // 绘制文字头像背景（整个渐变逻辑包裹在 try-catch 中）
    try {
      const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius)
      if (isTop1) {
        gradient.addColorStop(0, '#fde68a')
        gradient.addColorStop(1, '#d97706')
      } else {
        const hue = this.getHueFromText(avatarUrl || 'default')
        const safeHue = (typeof hue === 'number' && !isNaN(hue)) ? hue : 240
        // 使用 RGB 格式替代 HSL，避免微信 Canvas 不支持 HSL 格式
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
    ctx.font = `bold ${size * 0.35}px sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(displayText, 0, 1)
    
    ctx.restore()
    
    // 用户标签（在裁剪外绘制，使用绝对坐标）
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
    ctx.font = `bold ${badgeSize * 1.2}px sans-serif`
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
