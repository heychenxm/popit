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
  const indices = []
  while (indices.length < count) {
    const idx = randomInt(0, total)
    if (!indices.includes(idx)) {
      indices.push(idx)
    }
  }
  return indices
}

// 根据索引获取泡泡颜色类别
// 颜色分配规则：基于索引的确定性分配，确保相同索引始终返回相同颜色
export function getColorClass(index) {
  // 特殊索引固定颜色
  if (index === 1) return 'pink'
  if (index === 10) return 'blue'
  
  // 其他索引按循环分配
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

// 云函数调用记录管理
const CLOUD_CALL_LOG_KEY = 'cloudCallLog'
const CLOUD_CALL_STATS_KEY = 'cloudCallStats'
const MAX_LOG_COUNT = 100  // 最多保存 100 条记录

/**
 * 记录云函数调用
 * @param {string} functionName - 云函数名称
 * @param {Object} data - 调用参数
 * @param {boolean} success - 是否成功
 * @param {number} duration - 调用耗时（毫秒）
 * @param {string} errorMsg - 错误信息（如果有）
 */
export function recordCloudCall(functionName, data, success, duration, errorMsg = '') {
  try {
    const logs = getStorage(CLOUD_CALL_LOG_KEY, [])
    
    const logEntry = {
      functionName,
      timestamp: Date.now(),
      date: getTodayString(),
      success,
      duration,
      errorMsg,
      // 只记录参数 key，不记录完整数据（节省空间）
      paramKeys: data ? Object.keys(data) : []
    }
    
    logs.push(logEntry)
    
    // 只保留最近的记录
    if (logs.length > MAX_LOG_COUNT) {
      logs.splice(0, logs.length - MAX_LOG_COUNT)
    }
    
    setStorage(CLOUD_CALL_LOG_KEY, logs)
    
    // 更新总数统计
    updateCloudCallStats(functionName, success, duration)
    
    console.log(`[云函数调用记录] ${functionName} - ${success ? '成功' : '失败'} (${duration}ms)`)
  } catch (e) {
    console.error('记录云函数调用失败:', e)
  }
}

/**
 * 更新云函数调用总数统计
 */
function updateCloudCallStats(functionName, success, duration) {
  try {
    const today = getTodayString()
    let stats = getStorage(CLOUD_CALL_STATS_KEY, {
      total: 0,
      success: 0,
      fail: 0,
      totalDuration: 0,
      byFunction: {},
      byDate: {}
    })
    
    // 更新总计数
    stats.total++
    if (success) {
      stats.success++
    } else {
      stats.fail++
    }
    stats.totalDuration += duration
    
    // 按云函数统计
    if (!stats.byFunction[functionName]) {
      stats.byFunction[functionName] = {
        total: 0,
        success: 0,
        fail: 0,
        totalDuration: 0
      }
    }
    stats.byFunction[functionName].total++
    if (success) {
      stats.byFunction[functionName].success++
    } else {
      stats.byFunction[functionName].fail++
    }
    stats.byFunction[functionName].totalDuration += duration
    
    // 按日期统计
    if (!stats.byDate[today]) {
      stats.byDate[today] = {
        total: 0,
        success: 0,
        fail: 0,
        totalDuration: 0
      }
    }
    stats.byDate[today].total++
    if (success) {
      stats.byDate[today].success++
    } else {
      stats.byDate[today].fail++
    }
    stats.byDate[today].totalDuration += duration
    
    setStorage(CLOUD_CALL_STATS_KEY, stats)
  } catch (e) {
    console.error('更新云函数调用统计失败:', e)
  }
}

/**
 * 获取云函数调用记录
 * @param {string} functionName - 可选，按云函数名称筛选
 * @param {string} date - 可选，按日期筛选（YYYY-MM-DD）
 * @returns {Array} 调用记录列表
 */
export function getCloudCallLogs(functionName = null, date = null) {
  try {
    const logs = getStorage(CLOUD_CALL_LOG_KEY, [])
    
    let filtered = logs
    
    if (functionName) {
      filtered = filtered.filter(log => log.functionName === functionName)
    }
    
    if (date) {
      filtered = filtered.filter(log => log.date === date)
    }
    
    return filtered
  } catch (e) {
    console.error('获取云函数调用记录失败:', e)
    return []
  }
}

/**
 * 获取云函数调用统计
 * @param {string} date - 可选，按日期筛选
 * @returns {Object} 统计信息
 */
export function getCloudCallStats(date = null) {
  try {
    const logs = date ? getCloudCallLogs(null, date) : getCloudCallLogs()
    
    const stats = {
      total: logs.length,
      success: 0,
      fail: 0,
      totalDuration: 0,
      byFunction: {}
    }
    
    logs.forEach(log => {
      if (log.success) {
        stats.success++
      } else {
        stats.fail++
      }
      stats.totalDuration += log.duration || 0
      
      if (!stats.byFunction[log.functionName]) {
        stats.byFunction[log.functionName] = {
          total: 0,
          success: 0,
          fail: 0,
          totalDuration: 0
        }
      }
      
      stats.byFunction[log.functionName].total++
      if (log.success) {
        stats.byFunction[log.functionName].success++
      } else {
        stats.byFunction[log.functionName].fail++
      }
      stats.byFunction[log.functionName].totalDuration += log.duration || 0
    })
    
    // 计算平均耗时
    stats.avgDuration = stats.total > 0 ? Math.round(stats.totalDuration / stats.total) : 0
    
    Object.keys(stats.byFunction).forEach(name => {
      const func = stats.byFunction[name]
      func.avgDuration = func.total > 0 ? Math.round(func.totalDuration / func.total) : 0
    })
    
    return stats
  } catch (e) {
    console.error('获取云函数调用统计失败:', e)
    return { total: 0, success: 0, fail: 0, totalDuration: 0, byFunction: {}, avgDuration: 0 }
  }
}

/**
 * 获取云函数调用总数统计（从独立 storage 读取）
 * @returns {Object} 总数统计信息
 */
export function getCloudCallTotalStats() {
  try {
    const stats = getStorage(CLOUD_CALL_STATS_KEY, {
      total: 0,
      success: 0,
      fail: 0,
      totalDuration: 0,
      byFunction: {},
      byDate: {}
    })
    
    // 计算平均耗时
    stats.avgDuration = stats.total > 0 ? Math.round(stats.totalDuration / stats.total) : 0
    
    // 为每个云函数计算平均耗时
    Object.keys(stats.byFunction).forEach(name => {
      const func = stats.byFunction[name]
      func.avgDuration = func.total > 0 ? Math.round(func.totalDuration / func.total) : 0
    })
    
    // 为每个日期计算平均耗时
    Object.keys(stats.byDate).forEach(date => {
      const dayStats = stats.byDate[date]
      dayStats.avgDuration = dayStats.total > 0 ? Math.round(dayStats.totalDuration / dayStats.total) : 0
    })
    
    return stats
  } catch (e) {
    console.error('获取云函数调用总数统计失败:', e)
    return { 
      total: 0, 
      success: 0, 
      fail: 0, 
      totalDuration: 0, 
      avgDuration: 0,
      byFunction: {},
      byDate: {}
    }
  }
}

/**
 * 清空云函数调用记录
 */
export function clearCloudCallLogs() {
  try {
    setStorage(CLOUD_CALL_LOG_KEY, [])
    setStorage(CLOUD_CALL_STATS_KEY, {
      total: 0,
      success: 0,
      fail: 0,
      totalDuration: 0,
      byFunction: {},
      byDate: {}
    })
    console.log('[云函数调用记录] 已清空')
  } catch (e) {
    console.error('清空云函数调用记录失败:', e)
  }
}

/**
 * 封装的云函数调用（自动记录调用信息）
 * @param {string} name - 云函数名称
 * @param {Object} data - 调用参数
 * @returns {Promise} 云函数调用结果
 */
export async function callCloudFunction(name, data = {}) {
  const startTime = Date.now()
  
  try {
    const result = await wx.cloud.callFunction({
      name,
      data
    })
    
    const duration = Date.now() - startTime
    const success = result && result.result && result.result.success !== false
    
    recordCloudCall(name, data, success, duration, success ? '' : (result.result?.message || '未知错误'))
    
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    recordCloudCall(name, data, false, duration, error.message || '调用异常')
    throw error
  }
}

// 游戏界面布局（对齐 index_v1.0.3.html）
export function getGameHudBottom() {
  return 160 // topPadding(60) + 波次行(50) + 分数卡片(50)
}

export function getGameScreenLayout(width, height) {
  const hudBottom = getGameHudBottom()
  const countdownTop = height * 0.85 - 36

  const phaseMarginTop = 12 // my-3
  const phaseBlockHeight = 70 // min-h-[70px]
  const phaseTop = hudBottom + phaseMarginTop
  const phaseCenterY = phaseTop + phaseBlockHeight / 2

  // 两行文字在提示区内垂直居中（对应 HTML justify-center）
  const textLineGap = 26 // 标题(24px) + 间距(8px) + 副标题(12px) 的中心距
  const titleY = phaseCenterY - textLineGap / 2
  const descY = phaseCenterY + textLineGap / 2

  // 网格在提示区下方剩余空间中垂直居中（对应 HTML my-auto）
  const gridAreaTop = phaseTop + phaseBlockHeight + 12
  const gridAreaBottom = countdownTop - 8
  const maxWidth = width * 0.9
  const maxHeight = gridAreaBottom - gridAreaTop - 16
  const gridSize = Math.max(120, Math.min(maxWidth, maxHeight))

  const gridContainerHeight = gridSize + 16
  const gridAreaHeight = gridAreaBottom - gridAreaTop
  const gridY = gridAreaTop + Math.max(0, (gridAreaHeight - gridContainerHeight) / 2)

  return { titleY, descY, gridY, gridSize }
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
