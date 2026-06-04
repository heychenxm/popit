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
    this.currentScreen = 'menu' // 'menu' | 'game' | 'win' | 'fail' | 'pause' | 'leaderboard'
    
    // 排行榜状态
    this.leaderboardType = 'score' // 'score' | 'wave'
    this.leaderboardData = null
    
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
    
    // 顶部信息栏（生命值和金币）
    this.drawTopBar(gameState)
    
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
    
    // 分享礼包图标
    this.drawShareGiftIcon()
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
    gradient.addColorStop(0, '#312e81')  // indigo-950
    gradient.addColorStop(1, '#4c1d95')  // purple-950
    
    ctx.fillStyle = gradient
    drawRoundRect(ctx, modalX, modalY, modalW, modalH, 24)
    ctx.fill()
    ctx.strokeStyle = '#818cf8'  // indigo-400
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 关闭按钮（右上角，与边框等距）
    const closeBtnSize = 32
    const closeBtnPadding = 20  // 与边框的距离
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
    ctx.fillStyle = '#a5b4fc'  // indigo-300
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
      const scoreGradient = ctx.createLinearGradient(scoreBtnX, switchContainerY, scoreBtnX, switchContainerY + switchContainerH)
      scoreGradient.addColorStop(0, '#fbbf24')  // amber-400
      scoreGradient.addColorStop(1, '#d97706')  // amber-600
      ctx.fillStyle = scoreGradient
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
      const waveGradient = ctx.createLinearGradient(waveBtnX, switchContainerY, waveBtnX, switchContainerY + switchContainerH)
      waveGradient.addColorStop(0, '#fbbf24')
      waveGradient.addColorStop(1, '#d97706')
      ctx.fillStyle = waveGradient
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
    
    // 前三名展示区（移除分隔线）
    const top3ContainerY = switchContainerY + switchContainerH + 20
    const top3ContainerH = 140
    const top3ItemW = (modalW - 60) / 3  // 3 列，间距 10
    
    if (this.leaderboardData && this.leaderboardData.leaderboard) {
      const leaderboard = this.leaderboardData.leaderboard
      
      // 获取前三名（可能少于 3 个）
      const top1 = leaderboard[0]
      const top2 = leaderboard[1]
      const top3 = leaderboard[2]
      
      // 绘制第 2 名（左侧）
      if (top2) {
        this.drawLeaderboardRankCard(
          modalX + 20, top3ContainerY, top3ItemW, top3ContainerH,
          top2.rank, top2.nickname, top2.avatarUrl, top2.value,
          2, top2.isUser
        )
      }
      
      // 绘制第 1 名（中间，突出显示）
      if (top1) {
        this.drawLeaderboardRankCard(
          modalX + 20 + top3ItemW + 10, top3ContainerY - 10, top3ItemW, top3ContainerH + 10,
          top1.rank, top1.nickname, top1.avatarUrl, top1.value,
          1, top1.isUser, true
        )
      }
      
      // 绘制第 3 名（右侧）
      if (top3) {
        this.drawLeaderboardRankCard(
          modalX + 20 + (top3ItemW + 10) * 2, top3ContainerY, top3ItemW, top3ContainerH,
          top3.rank, top3.nickname, top3.avatarUrl, top3.value,
          3, top3.isUser
        )
      }
    }
    
    // 排行榜列表（第 4-6 名 + 自己）
    const listContainerY = top3ContainerY + top3ContainerH + 8  // 与前三名间距
    const listItemH = 50
    
    // 计算实际需要的列表高度（根据实际条目数）
    const leaderboard = this.leaderboardData && this.leaderboardData.leaderboard ? this.leaderboardData.leaderboard : []
    const listCount = Math.max(0, leaderboard.length - 3)  // 减去前 3 名
    const actualListHeight = listCount > 0 ? (listCount * listItemH + 10) : 50  // 至少显示一定高度
    
    // 增加列表宽度，保持左右同等边距
    const listPadding = 15  // 左右边距
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + listPadding, listContainerY, modalW - listPadding * 2, actualListHeight, 16)
    ctx.fill()
    
    // 绘制列表项
    if (this.leaderboardData && this.leaderboardData.leaderboard) {
      const listStartIndex = 3  // 从第 4 名开始
      
      leaderboard.slice(listStartIndex).forEach((user, index) => {
        const itemY = listContainerY + 10 + index * listItemH
        const isHighlight = user.isUser || (user.rank <= 3)
        
        // 增加列表项宽度，减少左右边距
        this.drawLeaderboardListItem(
          modalX + listPadding + 10, itemY, modalW - (listPadding + 10) * 2, listItemH - 10,
          user.rank, user.nickname, user.avatarUrl, user.value,
          isHighlight, user.isUser
        )
      })
    }
    
    // 底部提示
    const footerY = modalY + modalH - 35
    ctx.font = '10px sans-serif'
    ctx.fillStyle = 'rgba(165, 180, 252, 0.6)'  // indigo-300/60
    ctx.textAlign = 'center'
    ctx.fillText('新赛季将于每周五 24:00 结束自动结算并派发金币奖励', this.width / 2, footerY)
    
    ctx.restore()
  }

  // 绘制排行榜前三名卡片
  drawLeaderboardRankCard(x, y, w, h, rank, nickname, avatarUrl, value, rankNum, isUser, isTop1 = false) {
    const ctx = this.ctx
    
    ctx.save()
    
    // 背景
    let bgColor
    if (isTop1) {
      const gradient = ctx.createLinearGradient(x, y, x, y + h)
      gradient.addColorStop(0, '#4f46e5')  // indigo-600
      gradient.addColorStop(1, '#3730a3')  // indigo-800
      bgColor = gradient
    } else if (rankNum === 2) {
      bgColor = 'rgba(148, 163, 184, 0.3)'  // 银色
    } else {
      bgColor = 'rgba(234, 179, 8, 0.2)'  // 铜色
    }
    
    ctx.fillStyle = bgColor
    drawRoundRect(ctx, x, y, w, h, 16)
    ctx.fill()
    
    // 边框
    let borderColor
    if (isTop1) {
      borderColor = '#fbbf24'  // 金色
    } else if (rankNum === 2) {
      borderColor = '#94a3b8'  // 银色
    } else {
      borderColor = '#eab308'  // 铜色
    }
    
    ctx.strokeStyle = borderColor
    ctx.lineWidth = isTop1 ? 3 : 2
    ctx.stroke()
    
    // 排名标签（增加顶部间距）
    ctx.font = isTop1 ? 'bold 12px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.gray300
    ctx.textAlign = 'center'
    const rankText = isTop1 ? '🏆 第 1 名' : `第${rank}名`
    ctx.fillText(rankText, x + w / 2, y + 20)
    
    // 头像（增加间距，避免与排名重叠）
    const avatarSize = isTop1 ? 52 : 44
    const avatarX = x + w / 2
    const avatarY = y + 55  // 向下移动
    
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, isTop1)
    
    // 昵称（增加与头像的间距）
    ctx.font = isTop1 ? 'bold 11px sans-serif' : '10px sans-serif'
    ctx.fillStyle = isTop1 ? '#fbbf24' : Colors.white
    ctx.textAlign = 'center'
    const displayNickname = nickname.length > 6 ? nickname.substring(0, 5) + '...' : nickname
    ctx.fillText(displayNickname, x + w / 2, y + 95)  // 向下移动
    
    // 分数/关卡（增加与昵称的间距）
    ctx.font = isTop1 ? 'bold 18px sans-serif' : 'bold 14px sans-serif'
    ctx.fillStyle = '#a5b4fc'  // indigo-300
    ctx.fillText(value.toString(), x + w / 2, y + 120)  // 向下移动
    
    ctx.restore()
  }

  // 绘制排行榜列表项
  drawLeaderboardListItem(x, y, w, h, rank, nickname, avatarUrl, value, isHighlight, isUser) {
    const ctx = this.ctx
    
    ctx.save()
    
    // 背景
    if (isHighlight) {
      ctx.fillStyle = isUser ? 'rgba(99, 102, 241, 0.3)' : 'rgba(0, 0, 0, 0.2)'
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    }
    
    drawRoundRect(ctx, x, y, w, h, 12)
    ctx.fill()
    
    // 边框（自己的排名高亮）
    if (isUser) {
      ctx.strokeStyle = '#6366f1'  // indigo-400
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    // 排名
    ctx.font = isHighlight ? 'bold 12px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.gray400
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const rankText = typeof rank === 'number' ? `${rank}.` : rank  // 支持 "100+"
    ctx.fillText(rankText, x + 12, y + h / 2)
    
    // 头像（增加与排名的间距）
    const avatarSize = 32
    const avatarX = x + 50  // 增加间距：35 → 50
    const avatarY = y + h / 2
    this.drawAvatar(avatarX, avatarY, avatarSize, avatarUrl, false)
    
    // 昵称
    ctx.font = isHighlight ? 'bold 11px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isHighlight ? '#fbbf24' : Colors.white
    ctx.textAlign = 'left'
    const displayNickname = nickname.length > 10 ? nickname.substring(0, 9) + '...' : nickname
    ctx.fillText(displayNickname, avatarX + avatarSize + 8, y + h / 2)
    
    // 分数/关卡
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#a5b4fc'  // indigo-300
    ctx.textAlign = 'right'
    ctx.fillText(value.toString(), x + w - 10, y + h / 2)
    
    ctx.restore()
  }

  // 绘制头像（支持图片头像和文字头像）
  drawAvatar(x, y, size, avatarUrl, isTop1) {
    const ctx = this.ctx
    
    ctx.save()
    ctx.translate(x, y)
    
    const radius = size / 2
    
    // 检查是否有真实头像 URL
    if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('wx'))) {
      // 使用图片头像
      this.drawImageAvatar(ctx, 0, 0, size, avatarUrl, isTop1)
    } else {
      // 使用文字头像
      this.drawTextAvatar(ctx, 0, 0, size, avatarUrl, isTop1)
    }
    
    ctx.restore()
  }

  // 绘制图片头像
  drawImageAvatar(ctx, x, y, size, url, isTop1) {
    const radius = size / 2
    
    // 创建圆形裁剪区域
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    
    // 绘制金色边框（第 1 名）
    if (isTop1) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    
    // 加载并绘制图片
    const img = wx.createImage()
    img.src = url
    img.onload = () => {
      // 图片加载完成后重绘（需要在游戏循环中触发）
      ctx.drawImage(img, x - radius, y - radius, size, size)
    }
    img.onerror = () => {
      // 图片加载失败，降级到文字头像
      console.error('头像图片加载失败，使用文字头像')
      this.drawTextAvatar(ctx, x, y, size, '', isTop1)
    }
    
    ctx.restore()
  }

  // 绘制文字头像（使用 Canvas 绘制美观的默认头像）
  drawTextAvatar(ctx, x, y, size, text, isTop1) {
    const radius = size / 2
    
    // 背景渐变（使用更丰富的渐变色）
    const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius)
    if (isTop1) {
      // 第 1 名：金色渐变
      gradient.addColorStop(0, '#fde68a')  // amber-200
      gradient.addColorStop(0.5, '#fbbf24')  // amber-400
      gradient.addColorStop(1, '#d97706')  // amber-600
    } else {
      // 根据文字生成固定颜色（相同文字相同颜色）
      const hue = this.getHueFromText(text || 'default')
      gradient.addColorStop(0, this.getHslColor(hue, 65))
      gradient.addColorStop(1, this.getHslColor(hue, 45))
    }
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = isTop1 ? '#fef3c7' : 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 绘制装饰性图案（圆圈和点）
    this.drawAvatarPattern(ctx, x, y, radius, text || 'default')
    
    // 文字（使用 openid 前 3 位）
    const displayText = text ? text.substring(0, 3).toUpperCase() : 'U'
    ctx.font = `bold ${size * 0.35}px sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 2
    ctx.shadowOffsetY = 1
    ctx.fillText(displayText, x, y + 1)
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  // 根据文字生成固定色相值（保证相同文字相同颜色）
  getHueFromText(text) {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash)
    }
    return Math.abs(hash % 360)
  }

  // HSL 转 RGB 辅助函数（微信小游戏不支持 HSL）
  hslToRgb(h, s, l) {
    const sNorm = s / 100
    const lNorm = l / 100
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
    const x = c * (1 - Math.abs((h / 60) % 2 - 1))
    const m = lNorm - c / 2
    
    let r, g, b
    if (h < 60) {
      r = c; g = x; b = 0
    } else if (h < 120) {
      r = x; g = c; b = 0
    } else if (h < 180) {
      r = 0; g = c; b = x
    } else if (h < 240) {
      r = 0; g = x; b = c
    } else if (h < 300) {
      r = x; g = 0; b = c
    } else {
      r = c; g = 0; b = x
    }
    
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    }
  }

  // 根据色相获取 RGB 颜色字符串
  getHslColor(hue, lightness) {
    const rgb = this.hslToRgb(hue, 70, lightness)
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  }

  // 绘制头像装饰图案
  drawAvatarPattern(ctx, x, y, radius, text) {
    const hue = this.getHueFromText(text)
    const rgb = this.hslToRgb(hue, 70, 80)
    const color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`
    
    ctx.fillStyle = color
    
    // 绘制几个装饰性小圆点
    const patterns = [
      { offsetX: -0.4, offsetY: -0.4, size: 0.15 },
      { offsetX: 0.5, offsetY: -0.3, size: 0.1 },
      { offsetX: -0.3, offsetY: 0.5, size: 0.12 },
      { offsetX: 0.4, offsetY: 0.4, size: 0.08 }
    ]
    
    patterns.forEach(pattern => {
      ctx.beginPath()
      ctx.arc(
        x + pattern.offsetX * radius,
        y + pattern.offsetY * radius,
        radius * pattern.size,
        0,
        Math.PI * 2
      )
      ctx.fill()
    })
  }

  // 绘制暂停弹窗
  drawPauseModal(gameState) {
    const ctx = this.ctx
    const modalW = 320
    const modalH = 280
    const modalX = (this.width - modalW) / 2
    const modalY = (this.height - modalH) / 2
    
    // 清空按钮数组
    this.buttons = []
    
    ctx.save()
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
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
    
    // 标题
    const titleY = modalY + 25
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.white
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.fillText('游戏暂停', this.width / 2, titleY + 22)
    ctx.shadowBlur = 0
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 35)
    ctx.lineTo(modalX + modalW - 20, titleY + 35)
    ctx.stroke()
    
    // 信息卡片（一排三个，居中展示）
    const infoY = titleY + 75
    const cardW = (modalW - 80) / 3
    const cardH = 60
    const cardGap = 10
    const cardsTotalWidth = cardW * 3 + cardGap * 2
    const cardsStartX = modalX + (modalW - cardsTotalWidth) / 2
    
    // 当前关卡
    this.drawPauseInfoCard(
      cardsStartX, infoY, cardW, cardH,
      '当前关卡', `第 ${gameState.wave} 关`,
      Colors.yellow300
    )
    
    // 当前得分
    this.drawPauseInfoCard(
      cardsStartX + cardW + cardGap, infoY, cardW, cardH,
      '当前积分', gameState.score.toString(),
      Colors.white
    )
    
    // 本局金币
    this.drawPauseInfoCard(
      cardsStartX + (cardW + cardGap) * 2, infoY, cardW, cardH,
      '本局金币', gameState.sessionCoins.toString(),
      Colors.yellow300
    )
    
    // 按钮区域
    const btnY = infoY + cardH + 25
    const btnW = (modalW - 60) / 2
    const btnH = 42
    
    // 退出游戏按钮
    ctx.fillStyle = Colors.gray700
    drawRoundRect(ctx, modalX + 20, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = Colors.gray500
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('退出游戏', modalX + 20 + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'home',
      x: modalX + 20,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    // 继续游戏按钮
    const continueBtnGradient = ctx.createLinearGradient(modalX + 40 + btnW, btnY, modalX + 40 + btnW + btnW, btnY + btnH)
    continueBtnGradient.addColorStop(0, '#22c55e')
    continueBtnGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = continueBtnGradient
    drawRoundRect(ctx, modalX + 40 + btnW, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = Colors.white
    ctx.textAlign = 'center'
    ctx.fillText('继续游戏', modalX + 40 + btnW + btnW / 2, btnY + btnH / 2)
    
    this.buttons.push({
      id: 'resume',
      x: modalX + 40 + btnW,
      y: btnY,
      w: btnW,
      h: btnH
    })
    
    ctx.restore()
  }

  // 绘制暂停信息卡片
  drawPauseInfoCard(x, y, w, h, label, value, valueColor) {
    const ctx = this.ctx
    
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, x, y, w, h, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 标签
    ctx.font = '10px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + 18)
    
    // 数值
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = valueColor
    ctx.fillText(value, x + w / 2, y + 42)
    
    ctx.restore()
  }

  // 绘制顶部信息栏（只显示金币）
  drawTopBar(gameState) {
    const ctx = this.ctx
    const barY = 44 // 状态栏下方
    const barHeight = 28
    const paddingX = 20
    const rightPadding = 20 // 右侧固定边距
    
    ctx.save()
    
    // 金币图标和数值
    const coinIconSize = 16
    const coinIconX = paddingX + 8
    const coinIconY = barY + barHeight / 2
    const coinTextStartX = coinIconX + coinIconSize + 10
    
    // 测量金币文字宽度
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const coinsText = `${gameState.coins}`
    const textMetrics = ctx.measureText(coinsText)
    const textWidth = textMetrics.width
    
    // 计算容器宽度（金币图标 + 间距 + 文字 + 右侧固定边距）
    const containerW = coinIconX + coinIconSize + 10 + textWidth + rightPadding - paddingX
    const containerX = paddingX
    const containerY = barY
    const containerH = barHeight
    const containerRadius = 14
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    drawRoundRect(ctx, containerX, containerY, containerW, containerH, containerRadius)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 金币图标
    drawCoinIcon(ctx, coinIconX + 8, coinIconY, coinIconSize, '#facc15')
    
    // 金币数值
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(coinsText, coinTextStartX, coinIconY)
    
    ctx.restore()
  }

  // 绘制 LOGO - 精确还原 index.html 中的 SVG POPIT LOGO
  drawLogo() {
    const ctx = this.ctx
    const logoX = this.width / 2
    const logoY = this.height * 0.18
    const logoWidth = 250
    const logoHeight = 100
    
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
      
      ctx.font = 'bold 45px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 白色描边
      ctx.strokeStyle = Colors.white
      ctx.lineWidth = 5
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
    
    // 最高关卡：标签白色，数值黄色
    ctx.fillStyle = Colors.white
    ctx.fillText(`最高关卡：`, this.width / 2 - 75, y)
    ctx.fillStyle = Colors.yellow400
    ctx.fillText(`${gameState.bestWave}`, this.width / 2 - 30, y)
    
    // 最高分：标签白色，数值黄色
    ctx.fillStyle = Colors.white
    ctx.fillText(`最高分：`, this.width / 2 + 45, y)
    ctx.fillStyle = Colors.yellow400
    ctx.fillText(`${gameState.highScore}`, this.width / 2 + 90, y)
    
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
    
    // 判断是否可以签到（不能签到就不显示小红点）
    const canCheckin = gameState.canCheckin()
    
    const buttons = [
      { id: 'leaderboard', icon: 'barChart', label: '排行榜', color1: '#6366f1', color2: '#a855f7', borderColor: '#a5b4fc' },
      { id: 'sound', icon: 'speaker', label: '声音', color1: '#0ea5e9', color2: '#3b82f6', borderColor: '#7dd3fc' },
      { id: 'checkin', icon: 'calendar', label: '签到', color1: '#10b981', color2: '#16a34a', borderColor: '#6ee7b7', hasBadge: canCheckin },
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

  // 绘制阶段指示器
  drawPhaseIndicator(gameState) {
    const ctx = this.ctx
    const y = this.height * 0.26
    
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
    
    // 根据弹窗类型显示不同标题
    const titleText = this.winModalType === 'record' ? '破纪录' : '胜利！'
    ctx.fillText(titleText, this.width / 2, titleY + 22)
    
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
    
    // 奖励物品 - 只显示金币（居中）
    const rewardY = starY + 90
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + 20, rewardY, modalW - 40, 80, 12)
    ctx.fill()
    
    // 金币图标（居中）
    const coinX = this.width / 2
    const coinY = rewardY + 25
    drawCoinIcon(ctx, coinX, coinY, 32, '#facc15')
    
    // 金币数字（居中，图标下方）
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(`+${gameState.sessionCoins}`, coinX, coinY + 35)
    
    // 最高分
    const scoreY = rewardY + 105    
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
    const modalH = 450
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
    
    // 本局得分
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(`本局得分：${gameState.score}`, this.width / 2, titleY + 135)
    
    // 分隔线 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(modalX + 20, titleY + 155)
    ctx.lineTo(modalX + modalW - 20, titleY + 155)
    ctx.stroke()
    
    // 获得奖励 - 只显示金币（居中）
    const rewardY = titleY + 170
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    drawRoundRect(ctx, modalX + 20, rewardY, modalW - 40, 80, 12)
    ctx.fill()
    
    // 金币图标（居中）
    const coinX = this.width / 2
    const coinY = rewardY + 25
    drawCoinIcon(ctx, coinX, coinY, 32, '#facc15')
    
    // 金币数字（居中，图标下方）
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = Colors.yellow300
    ctx.fillText(`+${gameState.sessionCoins}`, coinX, coinY + 35)
    
    // 购买生命区域
    const purchaseY = rewardY + 95
    const canPurchase = gameState.canPurchaseLife()
    const purchasePrice = gameState.getPurchasePrice()
    const hasPurchaseLeft = gameState.purchaseCount < 3
    
    // 购买生命背景
    ctx.fillStyle = canPurchase ? 'rgba(34, 197, 94, 0.15)' : 'rgba(75, 85, 99, 0.2)'
    drawRoundRect(ctx, modalX + 20, purchaseY, modalW - 40, 50, 12)
    ctx.fill()
    ctx.strokeStyle = canPurchase ? Colors.emerald500 : Colors.gray600
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 当前金币（居中展示）
    ctx.font = '11px sans-serif'
    ctx.fillStyle = Colors.gray400
    ctx.textAlign = 'center'
    ctx.fillText(`当前金币：${gameState.coins}`, modalX + modalW / 2, purchaseY + 28)
    
    // 按钮区域
    const btnY = purchaseY + 70
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
    
    // 右侧按钮：继续或重新开始
    const continueBtnX = modalX + 40 + btnW
    const continueBtnGradient = ctx.createLinearGradient(continueBtnX, btnY, continueBtnX, btnY + btnH)
    continueBtnGradient.addColorStop(0, '#22c55e')
    continueBtnGradient.addColorStop(1, '#16a34a')
    
    ctx.fillStyle = continueBtnGradient
    drawRoundRect(ctx, continueBtnX, btnY, btnW, btnH, 12)
    ctx.fill()
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 2
    ctx.stroke()
    
    if (hasPurchaseLeft) {
      // 还有继续机会：显示金币图标和价格
      const coinIconX = continueBtnX + btnW / 2 - 35
      const coinIconY = btnY + btnH / 2
      drawCoinIcon(ctx, coinIconX, coinIconY, 16, '#facc15')
      
      // 继续文字和价格
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = Colors.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`继续 (${purchasePrice})`, continueBtnX + btnW / 2 + 12, btnY + btnH / 2)
      
      this.buttons.push({
        id: 'purchase',
        x: continueBtnX,
        y: btnY,
        w: btnW,
        h: btnH
      })
    } else {
      // 没有继续机会了：显示重新开始按钮
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

  // 绘制Toast提示
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
