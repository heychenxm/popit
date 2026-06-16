/**
 * 工具函数集合
 */

// 颜色常量 - 保持与 index.html 一致的霓虹风格
export const Colors = {
  themeDark: '#090a21',
  themePurple: '#1e1145',
  themeNeonBlue: '#3b82f6',
  themeNeonPink: '#ec4899',
  bgDark: '#03040c',
  bgGradient1: '#0d0926',
  bgGradient2: '#17113a',
  bgGradient3: '#2b185d',
  white: '#ffffff',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  rose500: '#f43f5e',
  pink500: '#ec4899',
  purple500: '#a855f7',
  purple900: '#581c87',
  indigo500: '#6366f1',
  blue500: '#3b82f6',
  sky500: '#0ea5e9',
  cyan500: '#06b6d4',
  emerald500: '#10b981',
  green500: '#22c55e',
  green600: '#16a34a',
  yellow300: '#fde047',
  yellow400: '#facc15',
  yellow500: '#eab308',
  amber500: '#f59e0b',
  orange500: '#f97316',
  red500: '#ef4444',
  red600: '#dc2626',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',
}

// 获取随机整数 [min, max)
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

// 获取唯一随机索引数组
export function getUniqueRandomIndices(total, count) {
  // 防止 count > total 导致死循环
  count = Math.min(count, total)
  const indexSet = new Set()
  while (indexSet.size < count) {
    indexSet.add(randomInt(0, total))
  }
  return Array.from(indexSet)
}

// 根据索引获取泡泡颜色类别
// 颜色分配规则：基于索引的确定性分配，确保相同索引始终返回相同颜色
export function getColorClass(index) {
  // 特殊索引固定颜色（设计意图：确保特定位置的泡泡颜色醒目）
  // index === 1: 强制粉色，避免 % 3 计算得到 purple
  if (index === 1) return 'pink'
  // index === 10: 强制蓝色，避免 % 3 计算得到 purple
  if (index === 10) return 'blue'
  
  // 其他索引按循环分配（pink/purple/blue 循环）
  const cycle = index % 3
  const colors = ['pink', 'purple', 'blue']
  return colors[cycle]
}

// 线性插值
export function lerp(start, end, t) {
  return start + (end - start) * t
}

// 限制值在范围内
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// 格式化数字显示
export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// 创建径向渐变
export function createRadialGradient(ctx, x, y, radius, colors) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  colors.forEach(([offset, color]) => {
    gradient.addColorStop(offset, color)
  })
  return gradient
}

// 创建线性渐变
export function createLinearGradient(ctx, x1, y1, x2, y2, colors) {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
  colors.forEach(([offset, color]) => {
    gradient.addColorStop(offset, color)
  })
  return gradient
}

// 绘制圆角矩形
export function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// 绘制文本（自动处理对齐）
export function drawText(ctx, text, x, y, options = {}) {
  const {
    fontSize = 20,
    color = Colors.white,
    align = 'center',
    baseline = 'middle',
    bold = false,
    font = 'sans-serif'
  } = options

  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
}

// 绘制带阴影的文本
export function drawTextWithShadow(ctx, text, x, y, options = {}) {
  const {
    shadowColor = 'rgba(0,0,0,0.5)',
    shadowBlur = 4,
    shadowOffsetX = 0,
    shadowOffsetY = 2,
    ...textOptions
  } = options

  ctx.shadowColor = shadowColor
  ctx.shadowBlur = shadowBlur
  ctx.shadowOffsetX = shadowOffsetX
  ctx.shadowOffsetY = shadowOffsetY
  drawText(ctx, text, x, y, textOptions)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

// 触摸点是否在区域内
export function isPointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w &&
         py >= rect.y && py <= rect.y + rect.h
}

// 触摸点是否在圆内
export function isPointInCircle(px, py, cx, cy, radius) {
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= radius * radius
}

// 存储本地数据
export function setStorage(key, value) {
  try {
    wx.setStorageSync(key, typeof value === 'object' ? JSON.stringify(value) : value)
  } catch (e) {
    console.error('setStorage error:', e)
  }
}

// 读取本地数据
export function getStorage(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key)
    if (value === '') return defaultValue
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  } catch (e) {
    console.error('getStorage error:', e)
    return defaultValue
  }
}

// 获取当前日期字符串（YYYY-MM-DD 格式，使用本地时间）
export function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取昨天的日期字符串（YYYY-MM-DD 格式）
export function getYesterdayString() {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  const year = yesterday.getFullYear()
  const month = String(yesterday.getMonth() + 1).padStart(2, '0')
  const day = String(yesterday.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 安全的 requestAnimationFrame（兼容微信小游戏环境）
export function safeRequestAnimationFrame(callback) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  // 降级方案：使用 setTimeout
  return setTimeout(callback, 1000 / 60)
}

// 安全的 cancelAnimationFrame
export function safeCancelAnimationFrame(id) {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id)
  } else if (typeof clearTimeout === 'function') {
    clearTimeout(id)
  }
}

// 游戏界面布局（对齐 index_v1.0.3.html）
export function getGameHudBottom() {
  return 160 // topPadding(60) + 波次行(50) + 分数卡片(50)
}

// 布局缓存（按尺寸缓存，避免同帧重复计算）
let _layoutCache = null
let _layoutCacheKey = ''

export function getGameScreenLayout(width, height) {
  const key = `${width}x${height}`
  if (_layoutCache && _layoutCacheKey === key) {
    return _layoutCache
  }
  
  const hudBottom = getGameHudBottom()
  const countdownTop = height * 0.85 - 36

  const phaseMarginTop = 12 // my-3
  const phaseBlockHeight = 70 // min-h-[70px]
  const phaseTop = hudBottom + phaseMarginTop
  const phaseCenterY = phaseTop + phaseBlockHeight / 2

  // 两行文字在提示区内垂直居中（对应 HTML justify-center）
  const textLineGap = 26 // 标题(24px) + 间距(8px) + 副标题(12px) 的中心距
  const titleY = phaseCenterY - textLineGap / 2 + 12
  const descY = phaseCenterY + textLineGap / 2 + 12

  // 网格在提示区下方剩余空间中垂直居中（对应 HTML my-auto）
  const gridAreaTop = phaseTop + phaseBlockHeight + 12
  const gridAreaBottom = countdownTop - 8
  const maxWidth = width * 0.9
  const maxHeight = gridAreaBottom - gridAreaTop - 16
  const gridSize = Math.max(120, Math.min(maxWidth, maxHeight))

  const gridContainerHeight = gridSize + 16
  const gridAreaHeight = gridAreaBottom - gridAreaTop
  const gridY = gridAreaTop + Math.max(0, (gridAreaHeight - gridContainerHeight) / 2)

  _layoutCache = { titleY, descY, gridY, gridSize }
  _layoutCacheKey = key
  return _layoutCache
}

export function getPhaseIndicatorLayout(width, height) {
  const { titleY, descY } = getGameScreenLayout(width, height)
  return { titleY, descY }
}

export function getBubbleGridTop(width, height) {
  return getGameScreenLayout(width, height).gridY
}

export function getBubbleGridMaxSize(width, height) {
  return getGameScreenLayout(width, height).gridSize
}
