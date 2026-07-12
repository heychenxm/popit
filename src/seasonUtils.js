/**
 * 赛季工具函数
 * 赛季周期：周一 00:00 ~ 下周一 00:00（每周一凌晨结算，中国时区 UTC+8）
 * 赛季命名：YYYY-Sww（如 2025-S24）
 */

let _cachedCycle = null
let _cachedCycleTime = 0
const CACHE_DURATION = 1000
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * 将任意时刻转为「中国墙上时间」的 Date（用 UTC getters 读取年月日时分秒）
 */
function toChinaWallTime(date) {
  return new Date(date.getTime() + CHINA_OFFSET_MS)
}

/**
 * 获取当前赛季周期信息（带缓存，统一按 UTC+8 计算）
 * @param {Date} [now] - 当前时间（可选）
 * @returns {Object} { seasonId, seasonStart, seasonEnd }
 */
export function getSeasonCycle(now) {
  const currentTime = Date.now()

  if (!now && _cachedCycle && (currentTime - _cachedCycleTime) < CACHE_DURATION) {
    return _cachedCycle
  }

  const date = now || new Date()
  const china = toChinaWallTime(date)
  const day = china.getUTCDay()

  let daysToNextMon = (1 - day + 7) % 7
  if (daysToNextMon === 0) daysToNextMon = 7

  // 中国时区下周一 00:00 对应的真实 UTC 时间戳
  const endUtcMs = Date.UTC(
    china.getUTCFullYear(),
    china.getUTCMonth(),
    china.getUTCDate() + daysToNextMon,
    0, 0, 0, 0
  ) - CHINA_OFFSET_MS

  const seasonEnd = new Date(endUtcMs)
  const seasonStart = new Date(endUtcMs - 7 * 24 * 60 * 60 * 1000)

  const startChina = toChinaWallTime(seasonStart)
  const year = startChina.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1))
  const weekNum = Math.ceil(
    ((Date.UTC(startChina.getUTCFullYear(), startChina.getUTCMonth(), startChina.getUTCDate()) - startOfYear) / 86400000
      + startOfYear.getUTCDay() + 1) / 7
  )
  const seasonId = `${year}-S${String(weekNum).padStart(2, '0')}`

  const result = { seasonId, seasonStart, seasonEnd }

  if (!now) {
    _cachedCycle = result
    _cachedCycleTime = currentTime
  }

  return result
}

export function getSeasonTimeRemaining() {
  const { seasonEnd } = getSeasonCycle()
  return Math.max(0, seasonEnd.getTime() - Date.now())
}

export function formatSeasonCountdown() {
  const ms = getSeasonTimeRemaining()
  if (ms <= 0) return '赛季结算中...'

  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  return `赛季剩余 ${days}天${hours}时${minutes}分`
}

export function getSeasonStartTime() {
  return getSeasonCycle().seasonStart.getTime()
}

export function getSeasonEndTime() {
  return getSeasonCycle().seasonEnd.getTime()
}

export function getCurrentSeasonId() {
  return getSeasonCycle().seasonId
}
