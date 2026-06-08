/**
 * 赛季工具函数
 * 赛季周期：周六 00:00 ~ 次周五 24:00（即下周六 00:00）
 * 赛季命名：YYYY-Sww（如 2025-S24）
 */

/**
 * 获取当前赛季周期信息
 * @param {Date} now - 当前时间
 * @returns {Object} { seasonId, seasonStart, seasonEnd }
 */
export function getSeasonCycle(now = new Date()) {
  const day = now.getDay(); // 0=周日, 1=周一, ..., 5=周五, 6=周六
  
  // 计算距离下周六 00:00 的天数
  let daysToNextSat = 6 - day;
  if (daysToNextSat <= 0) daysToNextSat += 7;
  
  // 赛季结束时间：下周六 00:00
  const seasonEnd = new Date(now);
  seasonEnd.setDate(seasonEnd.getDate() + daysToNextSat);
  seasonEnd.setHours(0, 0, 0, 0);
  
  // 赛季开始时间：本周五 24:00（即上周六 00:00）
  const seasonStart = new Date(seasonEnd);
  seasonStart.setDate(seasonStart.getDate() - 7);
  
  // 生成赛季编号（基于赛季开始日期计算第几周）
  const year = seasonStart.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((seasonStart - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  const seasonId = `${year}-S${String(weekNum).padStart(2, '0')}`;
  
  return { seasonId, seasonStart, seasonEnd };
}

/**
 * 获取距离赛季结束的剩余时间（毫秒）
 * @returns {number} 剩余时间（毫秒）
 */
export function getSeasonTimeRemaining() {
  const { seasonEnd } = getSeasonCycle(new Date());
  return Math.max(0, seasonEnd.getTime() - Date.now());
}

/**
 * 格式化赛季倒计时显示
 * @returns {string} 格式化后的倒计时字符串
 */
export function formatSeasonCountdown() {
  const ms = getSeasonTimeRemaining();
  if (ms <= 0) return '赛季结算中...';
  
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  return `赛季剩余 ${days}天${hours}时${minutes}分`;
}

/**
 * 获取赛季开始时间戳
 * @returns {number} 赛季开始时间戳（毫秒）
 */
export function getSeasonStartTime() {
  return getSeasonCycle(new Date()).seasonStart.getTime();
}

/**
 * 获取赛季结束时间戳
 * @returns {number} 赛季结束时间戳（毫秒）
 */
export function getSeasonEndTime() {
  return getSeasonCycle(new Date()).seasonEnd.getTime();
}

/**
 * 获取当前赛季编号
 * @returns {string} 赛季编号（如 2025-S24）
 */
export function getCurrentSeasonId() {
  return getSeasonCycle(new Date()).seasonId;
}
