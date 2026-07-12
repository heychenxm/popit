/**
 * 赛季工具函数
 * 赛季周期：周一 00:00 ~ 下周一 00:00（每周一凌晨结算）
 * 赛季命名：YYYY-Sww（如 2025-S24）
 */

// 缓存当前赛季周期（同一事件循环内复用）
let _cachedCycle = null
let _cachedCycleTime = 0
const CACHE_DURATION = 1000 // 1 秒缓存

/**
 * 获取当前赛季周期信息（带缓存）
 * @param {Date} [now] - 当前时间（可选，不传则使用缓存或当前时间）
 * @returns {Object} { seasonId, seasonStart, seasonEnd }
 */
export function getSeasonCycle(now) {
  const currentTime = Date.now()
  
  // 如果没有传入 now，使用缓存
  if (!now && _cachedCycle && (currentTime - _cachedCycleTime) < CACHE_DURATION) {
    return _cachedCycle
  }
  
  const date = now || new Date()
  const day = date.getDay() // 0=周日, 1=周一, ..., 6=周六
  
  // 距离下周一 00:00 的天数；若今天已是周一，则结束于下周一（7 天后）
  let daysToNextMon = (1 - day + 7) % 7
  if (daysToNextMon === 0) daysToNextMon = 7
  
  // 赛季结束时间：下周一 00:00（结算时刻）
  const seasonEnd = new Date(date)
  seasonEnd.setDate(seasonEnd.getDate() + daysToNextMon)
  seasonEnd.setHours(0, 0, 0, 0)
  
  // 赛季开始时间：本周一 00:00
  const seasonStart = new Date(seasonEnd)
  seasonStart.setDate(seasonStart.getDate() - 7)
  
  // 生成赛季编号（基于赛季开始日期计算第几周）
  const year = seasonStart.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const weekNum = Math.ceil(((seasonStart - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
  const seasonId = `${year}-S${String(weekNum).padStart(2, '0')}`
  
  const result = { seasonId, seasonStart, seasonEnd }
  
  // 缓存结果（仅当未传入 now 时）
  if (!now) {
    _cachedCycle = result
    _cachedCycleTime = currentTime
  }
  
  return result
}

/**
 * 获取距离赛季结束的剩余时间（毫秒）
 * @returns {number} 剩余时间（毫秒）
 */
export function getSeasonTimeRemaining() {
  const { seasonEnd } = getSeasonCycle()
  return Math.max(0, seasonEnd.getTime() - Date.now())
}

/**
 * 格式化赛季倒计时显示
 * @returns {string} 格式化后的倒计时字符串
 */
export function formatSeasonCountdown() {
  const ms = getSeasonTimeRemaining()
  if (ms <= 0) return '赛季结算中...'
  
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  
  return `赛季剩余 ${days}天${hours}时${minutes}分`
}

/**
 * 获取赛季开始时间戳
 * @returns {number} 赛季开始时间戳（毫秒）
 */
export function getSeasonStartTime() {
  return getSeasonCycle().seasonStart.getTime()
}

/**
 * 获取赛季结束时间戳
 * @returns {number} 赛季结束时间戳（毫秒）
 */
export function getSeasonEndTime() {
  return getSeasonCycle().seasonEnd.getTime()
}

/**
 * 获取当前赛季编号
 * @returns {string} 赛季编号（如 2025-S24）
 */
export function getCurrentSeasonId() {
  return getSeasonCycle().seasonId
}
