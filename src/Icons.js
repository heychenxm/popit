/**
 * 图标绘制工具 - 精确还原 index.html 中的 SVG 图标
 * 所有图标基于 24x24 viewBox 设计，坐标范围 0-24，确保居中显示
 */

import { FONT_FAMILY } from './utils.js'

// 通用图标上下文设置（减少重复代码）
function setupIconContext(ctx, x, y, size) {
  const scale = size / 24
  const offsetX = x - (24 * scale) / 2
  const offsetY = y - (24 * scale) / 2
  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  return scale
}

// 绘制柱状图图标（排行榜）
export function drawBarChartIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 三条柱状线
  ctx.beginPath()
  ctx.moveTo(18, 18)
  ctx.lineTo(18, 8)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(12, 18)
  ctx.lineTo(12, 4)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(6, 18)
  ctx.lineTo(6, 12)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制扬声器图标（声音）
export function drawSpeakerIcon(ctx, x, y, size, color = '#ffffff', isMuted = false) {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 扬声器主体
  ctx.beginPath()
  ctx.moveTo(11, 5)
  ctx.lineTo(6, 9)
  ctx.lineTo(2, 9)
  ctx.lineTo(2, 15)
  ctx.lineTo(6, 15)
  ctx.lineTo(11, 19)
  ctx.closePath()
  ctx.stroke()
  
  if (isMuted) {
    // 静音模式：画一个 X 标记
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(14, 8)
    ctx.lineTo(20, 14)
    ctx.stroke()
    
    ctx.beginPath()
    ctx.moveTo(20, 8)
    ctx.lineTo(14, 14)
    ctx.stroke()
  } else {
    // 正常模式：画声波弧线
    ctx.beginPath()
    ctx.arc(11, 12, 5, -0.6, 0.6, false)
    ctx.stroke()
    
    ctx.beginPath()
    ctx.arc(11, 12, 9, -0.5, 0.5, false)
    ctx.stroke()
  }
  
  ctx.restore()
}

// 绘制日历图标（签到）
export function drawCalendarIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 日历外框
  ctx.beginPath()
  ctx.rect(3, 5, 18, 16)
  ctx.stroke()
  
  // 顶部挂环
  ctx.beginPath()
  ctx.moveTo(8, 3)
  ctx.lineTo(8, 7)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(16, 3)
  ctx.lineTo(16, 7)
  ctx.stroke()
  
  // 中间横线
  ctx.beginPath()
  ctx.moveTo(3, 10)
  ctx.lineTo(21, 10)
  ctx.stroke()
  
  // 对勾
  ctx.beginPath()
  ctx.moveTo(8, 15)
  ctx.lineTo(11, 18)
  ctx.lineTo(17, 12)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制分享图标（三点连线）
export function drawShareIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 三个节点圆
  ctx.beginPath()
  ctx.arc(16, 5, 3, 0, Math.PI * 2)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.arc(5, 12, 3, 0, Math.PI * 2)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.arc(16, 19, 3, 0, Math.PI * 2)
  ctx.stroke()
  
  // 连接线
  ctx.beginPath()
  ctx.moveTo(7.5, 13.5)
  ctx.lineTo(13.5, 17.5)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(13.5, 6.5)
  ctx.lineTo(7.5, 10.5)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制分享导出图标（方框 + 向上箭头，参考 iOS 分享样式）
export function drawShareExportIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 方框（顶部开口，加宽加方）
  ctx.beginPath()
  ctx.moveTo(5, 11)
  ctx.lineTo(5, 20)
  ctx.lineTo(19, 20)
  ctx.lineTo(19, 11)
  ctx.stroke()

  // 向上箭头
  ctx.beginPath()
  ctx.moveTo(12, 17)
  ctx.lineTo(12, 4)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(8.5, 7.5)
  ctx.lineTo(12, 4)
  ctx.lineTo(15.5, 7.5)
  ctx.stroke()

  ctx.restore()
}

// 绘制奖杯图标（赛季）
export function drawTrophyIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 奖杯主体
  ctx.beginPath()
  ctx.moveTo(7, 4)
  ctx.lineTo(7, 10)
  ctx.arc(12, 10, 5, Math.PI, 0, false)
  ctx.lineTo(17, 4)
  ctx.stroke()
  
  // 奖杯底座
  ctx.beginPath()
  ctx.moveTo(9, 17)
  ctx.lineTo(15, 17)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(12, 14)
  ctx.lineTo(12, 17)
  ctx.stroke()
  
  // 奖杯把手
  ctx.beginPath()
  ctx.arc(7, 8, 3, 0.5, 2.6, false)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.arc(17, 8, 3, 0.5, -2.6, true)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制皇冠图标（新赛季 - 精确匹配 index.html 中的 SVG）
export function drawCrownIcon(ctx, x, y, size, color = '#ffffff') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 皇冠路径（精确匹配 index.html 中的 SVG path）
  ctx.beginPath()
  ctx.moveTo(12, 2)
  ctx.lineTo(15.09, 8.26)
  ctx.lineTo(22, 9.27)
  ctx.lineTo(17, 14.14)
  ctx.lineTo(18.18, 21.02)
  ctx.lineTo(12, 17.77)
  ctx.lineTo(5.82, 21.02)
  ctx.lineTo(7, 14.14)
  ctx.lineTo(2, 9.27)
  ctx.lineTo(8.91, 8.26)
  ctx.lineTo(12, 2)
  ctx.closePath()
  ctx.stroke()
  
  ctx.restore()
}

// 绘制宝箱图标（分享礼包）
export function drawChestIcon(ctx, x, y, size, color = '#d946ef') {
  setupIconContext(ctx, x, y, size)
  
  // 宝箱主体
  ctx.fillStyle = color
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 底部矩形
  ctx.beginPath()
  ctx.rect(3, 10, 18, 11)
  ctx.fill()
  ctx.stroke()
  
  // 盖子（弧形）- 使用稍深的同色系
  ctx.fillStyle = darkenColor(color, 0.3)
  ctx.beginPath()
  ctx.moveTo(2, 10)
  ctx.lineTo(2, 7)
  ctx.quadraticCurveTo(2, 4, 4, 4)
  ctx.lineTo(20, 4)
  ctx.quadraticCurveTo(22, 4, 22, 7)
  ctx.lineTo(22, 10)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  
  // 中间竖条
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(10, 4, 4, 17)
  
  // 锁孔（圆形）
  ctx.fillStyle = '#fef08a'
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(12, 13, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  
  ctx.restore()
}

// 辅助函数：加深颜色
function darkenColor(hex, amount) {
  // 将 hex 转换为 RGB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  // 加深
  const newR = Math.max(0, Math.floor(r * (1 - amount)))
  const newG = Math.max(0, Math.floor(g * (1 - amount)))
  const newB = Math.max(0, Math.floor(b * (1 - amount)))
  
  // 转回 hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

// 绘制心形图标（生命值）
export function drawHeartIcon(ctx, x, y, size, color = '#f43f5e') {
  setupIconContext(ctx, x, y, size)
  
  ctx.fillStyle = color
  
  // 心形路径（更丰满的设计）
  ctx.beginPath()
  ctx.moveTo(12, 20)
  ctx.bezierCurveTo(12, 20, 4, 14, 4, 8.5)
  ctx.bezierCurveTo(4, 4.5, 6.5, 2, 9.5, 2)
  ctx.bezierCurveTo(10.5, 2, 11.5, 2.5, 12, 3.2)
  ctx.bezierCurveTo(12.5, 2.5, 13.5, 2, 14.5, 2)
  ctx.bezierCurveTo(17.5, 2, 20, 4.5, 20, 8.5)
  ctx.bezierCurveTo(20, 14, 12, 20, 12, 20)
  ctx.closePath()
  ctx.fill()
  
  ctx.restore()
}

// 绘制金币图标
export function drawCoinIcon(ctx, x, y, size, color = '#facc15') {
  setupIconContext(ctx, x, y, size)
  
  // 外圆
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(12, 12, 9, 0, Math.PI * 2)
  ctx.fill()
  
  // 内圆边框
  ctx.strokeStyle = '#92400e'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(12, 12, 7, 0, Math.PI * 2)
  ctx.stroke()
  
  // 中间符号（$）
  ctx.fillStyle = '#92400e'
  ctx.font = `bold 10px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$', 12, 12)
  
  ctx.restore()
}

// 绘制宝石图标
export function drawGemIcon(ctx, x, y, size, color = '#c084fc') {
  setupIconContext(ctx, x, y, size)
  
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 宝石形状（六边形）
  ctx.beginPath()
  ctx.moveTo(12, 3)
  ctx.lineTo(19, 8)
  ctx.lineTo(19, 16)
  ctx.lineTo(12, 21)
  ctx.lineTo(5, 16)
  ctx.lineTo(5, 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  
  // 内部切面
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(12, 3)
  ctx.lineTo(12, 21)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(5, 8)
  ctx.lineTo(19, 8)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制骷髅图标
export function drawSkullIcon(ctx, x, y, size, color = '#9ca3af') {
  setupIconContext(ctx, x, y, size)
  
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 头部（圆形）
  ctx.beginPath()
  ctx.arc(12, 10, 7, 0, Math.PI * 2)
  ctx.fill()
  
  // 下巴
  ctx.fillRect(9, 15, 6, 5)
  
  // 眼睛（两个圆形）
  ctx.fillStyle = '#03040c'
  ctx.beginPath()
  ctx.arc(9.5, 9, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(14.5, 9, 2, 0, Math.PI * 2)
  ctx.fill()
  
  // 鼻子（小三角形）
  ctx.beginPath()
  ctx.moveTo(12, 11)
  ctx.lineTo(10.5, 13)
  ctx.lineTo(13.5, 13)
  ctx.closePath()
  ctx.fill()
  
  // 嘴巴（线条）
  ctx.strokeStyle = '#03040c'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(9, 17)
  ctx.lineTo(15, 17)
  ctx.stroke()
  
  // 牙齿（小竖线）
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(10 + i * 2, 16.5)
    ctx.lineTo(10 + i * 2, 17.5)
    ctx.stroke()
  }
  
  ctx.restore()
}

// 绘制时钟图标
export function drawClockIcon(ctx, x, y, size, color = '#facc15') {
  setupIconContext(ctx, x, y, size)
  
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // 圆形外框
  ctx.beginPath()
  ctx.arc(12, 12, 9, 0, Math.PI * 2)
  ctx.stroke()
  
  // 时针
  ctx.beginPath()
  ctx.moveTo(12, 12)
  ctx.lineTo(12, 7)
  ctx.stroke()
  
  // 分针
  ctx.beginPath()
  ctx.moveTo(12, 12)
  ctx.lineTo(16, 12)
  ctx.stroke()
  
  ctx.restore()
}

// 绘制星星
export function drawStar(ctx, x, y, size, color = '#facc15') {
  const spikes = 5
  const outerRadius = size / 2
  const innerRadius = size / 4
  
  ctx.save()
  ctx.fillStyle = color
  ctx.translate(x, y)
  
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
