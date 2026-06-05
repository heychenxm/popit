import { Colors, drawRoundRect, drawText, drawTextWithShadow, isPointInRect } from './utils.js'
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
    this.currentScreen = 'menu' // 'menu' | 'game' | 'win' | 'fail' | 'leaderboard' | 'checkin' | 'share'
    
    // 动画状态
    this.animationFrame = 0
    
    // 按钮布局
    this.menuButtons = []
    this.gameButtons = []
    this.modalButtons = []
  }

  // 更新布局
  updateLayout() {
    this.width = this.canvas.width / this.pixelRatio
    this.height = this.canvas.height / this.pixelRatio
  }

  // 绘制主菜单
  drawMenu(gameState) {
    const ctx = this.ctx
    
    // 清空按钮数组
    this.buttons = []
    
    // 顶部金币余额
    this.drawTopCoins(gameState)
    
    // LOGO 区域
    this.drawLogo()
    
    // 最高关卡和分数
    this.drawBestScore(gameState)
    
    // 开始游戏按钮
    this.drawStartButton()
    
    // 底部导航按钮
    this.drawBottomButtons(gameState)
    
    // 赛季横幅
    this.drawSeasonBanner()
    
    // 分享礼包图标（根据是否可以分享来决定是否显示）
    if (gameState.canShareGift()) {
      this.drawShareGiftIcon()
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
    
    // 设置字体并测量文字宽度（字体也缩小 30%）
    ctx.font = 'bold 11.2px sans-serif'  // 16 * 0.7 = 11.2
    ctx.textBaseline = 'middle'
    const coinsText = gameState.coins.toString()
    const textWidth = ctx.measureText(coinsText).width
    
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

  // 绘制 LOGO - 精确还原 index.html 中的 SVG POPIT LOGO
  drawLogo() {
    const ctx = this.ctx
    const logoX = this.width / 2
    const logoY = this.height * 0.18
    const logoWidth = 200
    const logoHeight = 80
    
    ctx.save()
    
    // 创建渐变
    const gradients = [
      this.createLogoGradient(ctx, logoX - 50, logoY - 20, logoX - 30, logoY + 20, '#ff4b5c', '#c70039'), // P1
      this.createLogoGradient(ctx, logoX - 15, logoY - 20, logoX + 5, logoY + 20, '#ffe600', '#ff9900'), // O
      this.createLogoGradient(ctx, logoX + 20, logoY - 20, logoX + 40, logoY + 20, '#69f0ae', '#00b0ff'), // P2
      this.createLogoGradient(ctx, logoX + 55, logoY - 20, logoX + 75, logoY + 20, '#00e5ff', '#2979ff'), // I
      this.createLogoGradient(ctx, logoX + 90, logoY - 20, logoX + 110, logoY + 20, '#d500f9', '#651fff'), // T
    ]
    
    const letterWidth = logoWidth / 5
    const startX = logoX - logoWidth / 2
    
    // 绘制每个字母
    const letters = ['P', 'O', 'P', 'I', 'T']
    letters.forEach((letter, i) => {
      const x = startX + i * letterWidth + letterWidth / 2
      const y = logoY
      
      ctx.font = 'bold 36px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 白色描边
      ctx.strokeStyle = Colors.white
      ctx.lineWidth = 4
      ctx.strokeText(letter, x, y)
      
      // 渐变填充
      ctx.fillStyle = gradients[i]
      ctx.fillText(letter, x, y)
      
      // 高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.beginPath()
      ctx.ellipse(x - 5, y - 10, 4, 2, -0.4, 0, Math.PI * 2)
      ctx.fill()
    })
    
    // 装饰点（Sprinkles）
    const sprinkles = [
      { x: startX - 10, y: logoY - 25, color: '#ff4b5c', size: 6 },
      { x: startX + 10, y: logoY - 30, color: '#00e5ff', size: 4 },
      { x: startX + 25, y: logoY - 22, color: '#ffe600', size: 5 },
      { x: logoX + logoWidth / 2 + 10, y: logoY + 25, color: '#ffe600', size: 5 },
      { x: logoX + logoWidth / 2 + 20, y: logoY + 20, color: '#69f0ae', size: 3 },
      { x: logoX + logoWidth / 2 + 15, y: logoY + 30, color: '#00e5ff', size: 4 },
    ]
    
    sprinkles.forEach(s => {
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
      ctx.fill()
    })
    
    ctx.restore()
  }

  // 创建 LOGO 渐变
  createLogoGradient(ctx, x1, y1, x2, y2, color1, color2) {
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    gradient.addColorStop(0, color1)
    gradient.addColorStop(1, color2)
    return gradient
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
    
    // 播放箭头
    ctx.shadowColor = 'transparent'
    ctx.shadowOffsetY = 0
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.fillText('▶', btnX + btnWidth - 28, btnY + btnHeight / 2)
    
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
  drawSeasonBanner() {
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
    
    // 副标题：text-[10px] text-gray-300
    ctx.font = '10px sans-serif'
    ctx.fillStyle = Colors.gray300
    ctx.fillText('每周五 24:00 结算排行榜', textStartX, bannerY + bannerH / 2 + 10)
    
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
    ctx.fillText('查看详情 >', detailBtnX + detailBtnW / 2, detailBtnY + detailBtnH / 2)
    
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
    
    ctx.save()
    
    // 背景
    const gradient = ctx.createLinearGradient(iconX - iconSize / 2, iconY - iconSize / 2, iconX + iconSize / 2, iconY + iconSize / 2)
    gradient.addColorStop(0, '#a855f7')
    gradient.addColorStop(1, '#ec4899')
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, iconX - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize, 16)
    ctx.fill()
    
    ctx.strokeStyle = '#fef08a'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 宝箱图标（居中绘制）
    drawChestIcon(ctx, iconX, iconY + 1, 38)
    
    // 标签
    ctx.font = 'bold 10px sans-serif'
    const labelY = iconY + iconSize / 2 + 12
    ctx.fillStyle = '#581c87'
    drawRoundRect(ctx, iconX - 24, labelY - 8, 48, 16, 8)
    ctx.fill()
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('分享礼包', iconX, labelY)
    
    // 弹跳动画
    const bounce = Math.sin(this.animationFrame * 0.05) * 3
    ctx.translate(0, bounce)
    
    this.buttons.push({
      id: 'share_gift',
      x: iconX - iconSize / 2,
      y: iconY - iconSize / 2,
      w: iconSize,
      h: iconSize + 24
    })
    
    ctx.restore()
  }

  // 绘制游戏界面
  drawGameUI(gameState) {
    const ctx = this.ctx
    
    // 清空按钮数组
    this.buttons = []
    
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
    
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.fillText(`第 ${gameState.wave} 波`, waveX, waveY)
    
    // 进度点
    const dotY = waveY + 20
    const dotSpacing = 24
    const totalDots = 4
    const dotsStartX = waveX - (totalDots - 1) * dotSpacing / 2
    
    for (let i = 0; i < totalDots; i++) {
      const dotX = dotsStartX + i * dotSpacing
      const isActive = i < 2
      
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
    
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.gray400
    ctx.fillText(label, x + w / 2, y + 14)
    
    ctx.font = 'bold 16px sans-serif'
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
    
    ctx.font = '10px sans-serif'
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
    this.buttons = []
    
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
    ctx.fillText('🗓️ 每日签到', this.width / 2, titleY)
    
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
    
    const todayIndex = gameState.checkinStreak + 1
    
    // 绘制第 1-6 天
    for (let day = 1; day <= 6; day++) {
      const col = (day - 1) % 3
      const row = Math.floor((day - 1) / 3)
      const cellX = gridStartX + col * (cellWidth + gap)
      const cellY = gridStartY + row * (cellHeight + gap)
      
      const isToday = (day === todayIndex)
      const isSigned = (day < todayIndex) || (isToday && !gameState.canCheckin())
      
      this.drawCheckinCell(ctx, cellX, cellY, cellWidth, cellHeight, day, isToday, isSigned)
      
      const reward = gameState.getTodayReward(day)
      this.drawCheckinReward(ctx, cellX, cellY, cellWidth, cellHeight, reward, isSigned)
    }
    
    // 第 7 天
    const day7X = gridStartX
    const day7Y = gridStartY + 2 * (cellHeight + gap)
    const isDay7Today = (7 === todayIndex)
    const isDay7Signed = (7 < todayIndex) || (isDay7Today && !gameState.canCheckin())
    
    this.drawCheckinCell(ctx, day7X, day7Y, cellWidth, cellHeight, 7, isDay7Today, isDay7Signed)
    const day7Reward = gameState.getTodayReward(7)
    this.drawCheckinReward(ctx, day7X, day7Y, cellWidth, cellHeight, day7Reward, isDay7Signed)
    
    // 7 天连签奖励
    const bonusX = gridStartX + cellWidth + gap
    const bonusY = day7Y
    const bonusWidth = cellWidth * 2 + gap
    const bonusHeight = cellHeight
    
    this.drawBonusCard(ctx, bonusX, bonusY, bonusWidth, bonusHeight, isDay7Signed)
    
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
      ctx.fillStyle = 'rgba(55, 65, 81, 0.5)'
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    }
    
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    if (isToday) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 3
    } else if (isSigned) {
      ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)'
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.3)'
      ctx.lineWidth = 2
    }
    ctx.stroke()
    
    ctx.font = isToday ? 'bold 12px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isToday ? '#fbbf24' : (isSigned ? Colors.gray500 : Colors.gray300)
    ctx.textAlign = 'center'
    const dayText = isSigned ? '已签到' : (isToday ? '今天' : `第${day}天`)
    ctx.fillText(dayText, x + w / 2, y + 18)
  }

  // 绘制奖励内容
  drawCheckinReward(ctx, x, y, w, h, reward, isSigned) {
    const iconSize = 36
    const iconY = y + h / 2 + 5
    const amountY = y + h - 20
    
    drawCoinIcon(ctx, x + w / 2, iconY, iconSize, isSigned ? '#9ca3af' : '#facc15')
    
    ctx.font = isSigned ? 'bold 11px sans-serif' : 'bold 14px sans-serif'
    ctx.fillStyle = isSigned ? Colors.gray500 : Colors.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // 第 7 天只显示基础奖励 +1000，不显示额外奖励
    const amountText = `+${reward.amount}`
    
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
    this.buttons = []
    
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
    const descText2 = '立即免费获得 '
    ctx.fillText(descText1, this.width / 2, descY)
    ctx.fillText(descText2, this.width / 2, descY + 18)
    
    // 奖励文字（高亮）
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = Colors.yellow400
    ctx.fillText('1000 金币', this.width / 2 + 35, descY + 18)
    
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
    ctx.fillText('来挑战 POPIT 记忆大师！', gameIconX + gameIconSize + 10, previewContentY + 12)
    
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
  
  // 绘制 7 天连签奖励卡片
  drawBonusCard(ctx, x, y, w, h, isSigned) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h)
    gradient.addColorStop(0, '#7c3aed')
    gradient.addColorStop(1, '#a855f7')
    
    ctx.fillStyle = isSigned ? 'rgba(55, 65, 81, 0.5)' : gradient
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    ctx.strokeStyle = isSigned ? 'rgba(107, 114, 128, 0.5)' : '#c084fc'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 标题
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = isSigned ? Colors.gray500 : '#fde68a'
    ctx.textAlign = 'center'
    ctx.fillText('7 天连签奖励', x + w / 2, y + 25)
    
    // 金币图标（位置向上调整）
    const iconSize = 40
    const iconY = y + h / 2
    drawCoinIcon(ctx, x + w / 2, iconY, iconSize, isSigned ? '#9ca3af' : '#fbbf24')
    
    // 奖励文字（位置向下调整，避免与金币重叠）
    ctx.font = isSigned ? 'bold 12px sans-serif' : 'bold 16px sans-serif'
    ctx.fillStyle = isSigned ? Colors.gray500 : Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('额外 +2000', x + w / 2, y + h - 25)
  }

  // 绘制排行榜弹窗
  drawLeaderboardModal(gameState) {
    const ctx = this.ctx
    const modalW = 360
    const modalH = 520
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons = []
    
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
    
    if (this.leaderboardData && this.leaderboardData.leaderboard) {
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
    
    // 排行榜列表
    const listContainerY = top3ContainerY + top3ContainerH + 10
    const listItemH = 50
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + 20, listContainerY, modalW - 40, 160, 16)
    ctx.fill()
    
    if (this.leaderboardData && this.leaderboardData.leaderboard) {
      const leaderboard = this.leaderboardData.leaderboard
      const listStartIndex = 3
      
      leaderboard.slice(listStartIndex).forEach((user, index) => {
        const itemY = listContainerY + 10 + index * listItemH
        const isHighlight = user.isUser || (user.rank <= 3)
        
        this.drawLeaderboardListItem(
          modalX + 30, itemY, modalW - 80, listItemH - 10,
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
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1)
    
    ctx.font = isTop1 ? 'bold 11px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const displayNickname = nickname.length > 6 ? nickname.substring(0, 5) + '...' : nickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)
    
    ctx.font = isTop1 ? 'bold 18px sans-serif' : 'bold 14px sans-serif'
    ctx.fillStyle = '#a5b4fc'
    ctx.fillText(value.toString(), x + w / 2, y + 120)
    
    ctx.restore()
  }

  // 绘制排行榜列表项
  drawLeaderboardListItem(x, y, w, h, rank, nickname, avatarUrl, value, isHighlight, isUser) {
    const ctx = this.ctx
    
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
    ctx.fillText(rankText, x + 12, y + h / 2)
    
    const avatarSize = 32
    const avatarX = x + 50
    const avatarY = y + h / 2
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, false)
    
    ctx.font = isHighlight ? 'bold 11px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.white
    ctx.textAlign = 'left'
    const displayNickname = nickname.length > 10 ? nickname.substring(0, 9) + '...' : nickname
    ctx.fillText(displayNickname, avatarX + avatarSize + 8, y + h / 2)
    
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#a5b4fc'
    ctx.textAlign = 'right'
    ctx.fillText(value.toString(), x + w - 10, y + h / 2)
    
    ctx.restore()
  }

  // 绘制阶段指示器
  drawPhaseIndicator(gameState) {
    const ctx = this.ctx
    const y = this.height * 0.28
    
    ctx.save()
    
    if (gameState.phase === 'OBSERVE') {
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.purple500
      ctx.shadowColor = 'rgba(168, 85, 247, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('请观察！', this.width / 2, y)
      
      ctx.font = '12px sans-serif'
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.fillText('记住高亮的气泡', this.width / 2, y + 24)
    } else if (gameState.phase === 'PLAY') {
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = Colors.yellow300
      ctx.shadowColor = 'rgba(234, 179, 8, 0.5)'
      ctx.shadowBlur = 10
      ctx.fillText('点它！', this.width / 2, y)
      
      ctx.font = '12px sans-serif'
      ctx.fillStyle = Colors.gray300
      ctx.shadowBlur = 0
      ctx.fillText('在倒计时结束前点破所有高亮的气泡', this.width / 2, y + 24)
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

  // 绘制胜利弹窗
  drawWinModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalH = 420
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons = []
    
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
    
    // 奖励物品
    const rewardY = starY + 90
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + 20, rewardY, modalW - 40, 60, 12)
    ctx.fill()
    
    const rewards = [
      { type: 'coin', value: '+1250', color: Colors.white },
      { type: 'gem', value: '+10', color: '#c084fc' },
      { type: 'heart', value: '+5', color: '#fb7185' }
    ]
    
    rewards.forEach((reward, i) => {
      const rx = modalX + 50 + i * 90
      const ry = rewardY + 20
      
      // 绘制图标（居中）
      switch (reward.type) {
        case 'coin':
          drawCoinIcon(ctx, rx + 12, ry + 4, 24, '#facc15')
          break
        case 'gem':
          this.drawGemIcon(ctx, rx + 12, ry + 4, 24, '#c084fc')
          break
        case 'heart':
          drawHeartIcon(ctx, rx + 12, ry + 4, 24, '#fb7185')
          break
      }
      
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = reward.color
      ctx.fillText(reward.value, rx + 20, rewardY + 48)
    })
    
    // 最高分
    const scoreY = rewardY + 80
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    drawRoundRect(ctx, modalX + 30, scoreY, modalW - 60, 28, 14)
    ctx.fill()
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = '11px sans-serif'
    ctx.fillStyle = Colors.gray300
    ctx.fillText(`最高分: ${gameState.highScore}`, this.width / 2, scoreY + 14)
    
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

  // 绘制失败弹窗
  drawFailModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalH = 400
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons = []
    
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
    
    // 骷髅图标（使用 Canvas 路径绘制）
    ctx.shadowBlur = 0
    this.drawSkullIcon(ctx, this.width / 2, titleY + 60, 48, Colors.gray400)
    
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
    
    // 本关得分
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(`本关得分：${gameState.waveScore}`, this.width / 2, titleY + 135)
    
    // 分隔线 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 155)
    ctx.lineTo(modalX + modalW - 20, titleY + 155)
    ctx.stroke()
    
    // 购买生命区域
    const purchaseY = titleY + 170
    const canPurchase = gameState.canPurchaseLife()
    const purchasePrice = gameState.getPurchasePrice()
    
    // 购买生命背景
    ctx.fillStyle = canPurchase ? 'rgba(34, 197, 94, 0.15)' : 'rgba(75, 85, 99, 0.2)'
    drawRoundRect(ctx, modalX + 20, purchaseY, modalW - 40, 65, 12)
    ctx.fill()
    ctx.strokeStyle = canPurchase ? Colors.emerald500 : Colors.gray600
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 购买生命标题
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = canPurchase ? Colors.emerald400 : Colors.gray400
    ctx.textAlign = 'left'
    ctx.fillText('购买生命继续游戏', modalX + 35, purchaseY + 22)
    
    // 剩余次数
    ctx.font = '11px sans-serif'
    ctx.fillStyle = canPurchase ? Colors.gray300 : Colors.gray500
    ctx.fillText(`剩余次数：${3 - gameState.purchaseCount}/3`, modalX + 35, purchaseY + 42)
    
    // 金币图标和价格
    drawCoinIcon(ctx, modalX + modalW - 95, purchaseY + 32, 18, canPurchase ? '#facc15' : '#6b7280')
    ctx.font = 'bold 15px sans-serif'
    ctx.fillStyle = canPurchase ? Colors.yellow300 : Colors.gray500
    ctx.textAlign = 'right'
    ctx.fillText(`${purchasePrice}`, modalX + modalW - 65, purchaseY + 42)
    
    // 当前金币
    ctx.font = '11px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.textAlign = 'left'
    ctx.fillText(`当前金币：${gameState.coins}`, modalX + modalW - 95, purchaseY + 22)
    
    // 按钮区域
    const btnY = purchaseY + 85
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
    ctx.fillText('返回首页', modalX + 20 + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'home',
      x: modalX + 20,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    // 购买生命按钮（如果可以购买）
    if (canPurchase) {
      const purchaseBtnGradient = ctx.createLinearGradient(modalX + 40 + btnW, btnY, modalX + 40 + btnW + btnW, btnY + btnH)
      purchaseBtnGradient.addColorStop(0, '#22c55e')
      purchaseBtnGradient.addColorStop(1, '#16a34a')
      
      ctx.fillStyle = purchaseBtnGradient
      drawRoundRect(ctx, modalX + 40 + btnW, btnY, btnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#86efac'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.font = 'bold 13px sans-serif'
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.fillText(`购买生命 (${purchasePrice})`, modalX + 40 + btnW + btnW / 2, btnY + btnH / 2)
      
      this.buttons.push({
        id: 'purchase',
        x: modalX + 40 + btnW,
        y: btnY,
        w: btnW,
        h: btnH
      })
    } else {
      // 再试一次（不能购买时显示）
      const retryBtnX = modalX + 40 + btnW
      const retryGradient = ctx.createLinearGradient(retryBtnX, btnY, retryBtnX, btnY + btnH)
      retryGradient.addColorStop(0, '#ffd13b')
      retryGradient.addColorStop(1, '#ff9e00')
      
      ctx.fillStyle = retryGradient
      drawRoundRect(ctx, retryBtnX, btnY, btnW, btnH, 12)
      ctx.fill()
      ctx.strokeStyle = '#fffdf0'
      ctx.lineWidth = 3
      ctx.stroke()
      
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.fillText('再试一次', retryBtnX + btnW / 2, btnY + btnH / 2)
      
      this.buttons.push({
        id: 'retry',
        x: retryBtnX,
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
    this.buttons = []
    
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
    
    const toastW = 200
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
  drawAvatar(x, y, size, avatarUrl, isTop1) {
    const ctx = this.ctx
    
    // 安全检查：确保 size 是有效正数
    if (!size || size <= 0) {
      console.warn('drawAvatar: invalid size', size)
      return
    }
    
    ctx.save()
    ctx.translate(x, y)
    
    const radius = size / 2
    
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

  // 绘制骷髅图标
  drawSkullIcon(ctx, x, y, size, color) {
    ctx.save()
    ctx.translate(x, y)
    
    const halfSize = size / 2
    
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    
    // 头部（圆形）
    ctx.beginPath()
    ctx.arc(0, -halfSize * 0.2, halfSize * 0.7, 0, Math.PI * 2)
    ctx.fill()
    
    // 下巴（矩形）
    ctx.fillRect(-halfSize * 0.3, halfSize * 0.2, halfSize * 0.6, halfSize * 0.5)
    
    // 眼睛（两个圆形）
    ctx.fillStyle = '#03040c'
    ctx.beginPath()
    ctx.arc(-halfSize * 0.25, -halfSize * 0.2, halfSize * 0.15, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(halfSize * 0.25, -halfSize * 0.2, halfSize * 0.15, 0, Math.PI * 2)
    ctx.fill()
    
    // 鼻子（小三角形）
    ctx.fillStyle = '#03040c'
    ctx.beginPath()
    ctx.moveTo(0, halfSize * 0.05)
    ctx.lineTo(-halfSize * 0.08, halfSize * 0.15)
    ctx.lineTo(halfSize * 0.08, halfSize * 0.15)
    ctx.closePath()
    ctx.fill()
    
    // 嘴巴（线条）
    ctx.strokeStyle = '#03040c'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-halfSize * 0.2, halfSize * 0.35)
    ctx.lineTo(halfSize * 0.2, halfSize * 0.35)
    ctx.stroke()
    
    // 牙齿（小竖线）
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(i * halfSize * 0.1, halfSize * 0.3)
      ctx.lineTo(i * halfSize * 0.1, halfSize * 0.4)
      ctx.stroke()
    }
    
    ctx.restore()
  }
}
