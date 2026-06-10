/**
 * 泡泡大师 - Mock 数据注入工具
 * 将 mock 数据写入本地 storage，用于开发和测试
 * 
 * 使用方法：
 * 1. 在微信开发者工具中打开
 * 2. 在控制台运行：require('./inject-mock-data.js').injectAll()
 * 3. 或选择性注入：require('./inject-mock-data.js').injectPlayerData()
 */

import { mockData } from './mock-data.js'

// ==================== 工具函数 ====================

/**
 * 写入数据到本地存储
 */
function setStorage(key, value) {
  try {
    const storageValue = typeof value === 'object' ? JSON.stringify(value) : value
    wx.setStorageSync(key, storageValue)
    console.log(`✅ [Storage] 写入: ${key} =`, value)
  } catch (e) {
    console.error(`❌ [Storage] 写入失败: ${key}`, e)
  }
}

/**
 * 清空所有本地存储
 */
function clearAllStorage() {
  try {
    wx.clearStorageSync()
    console.log('🗑️ [Storage] 已清空所有数据')
  } catch (e) {
    console.error('❌ [Storage] 清空失败', e)
  }
}

// ==================== 数据注入函数 ====================

/**
 * 注入玩家核心数据
 * - highScore: 历史最高分
 * - bestWave: 历史最高通关关卡
 * - coins: 当前金币数量
 */
function injectPlayerData() {
  console.log('\n📦 [注入] 玩家核心数据')
  setStorage('highScore', mockData.game.highScore)
  setStorage('bestWave', mockData.game.bestWave)
  setStorage('coins', mockData.game.coins)
}

/**
 * 注入签到数据
 * - lastCheckinDate: 上次签到日期
 * - checkinStreak: 连续签到天数
 */
function injectCheckinData() {
  console.log('\n📦 [注入] 签到数据')
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  setStorage('lastCheckinDate', today)
  setStorage('checkinStreak', mockData.checkin.streak)
}

/**
 * 注入分享数据
 * - lastShareDate: 上次分享日期
 * - todayShareCount: 今日分享次数
 * - lastShareGiftDate: 上次领取分享礼包日期
 */
function injectShareData() {
  console.log('\n📦 [注入] 分享数据')
  const today = new Date().toISOString().split('T')[0]
  setStorage('lastShareDate', today)
  setStorage('todayShareCount', mockData.quickShare.todayShareCount)
  setStorage('lastShareGiftDate', mockData.shareGift.lastShareGiftDate || today)
}

/**
 * 注入用户信息
 * - nickname: 用户昵称
 * - avatarUrl: 用户头像 URL
 * - userInfoAuthorized: 用户是否已授权
 */
function injectUserInfo() {
  console.log('\n📦 [注入] 用户信息')
  setStorage('nickname', mockData.game.userInfo.nickname)
  setStorage('avatarUrl', mockData.game.userInfo.avatarUrl)
  setStorage('userInfoAuthorized', mockData.game.userInfo.authorized)
}

/**
 * 注入排行榜数据到缓存
 * - leaderboardCache: 普通排行榜缓存（score 和 wave）
 */
function injectLeaderboardData() {
  console.log('\n📦 [注入] 排行榜缓存数据')
  const now = Date.now()
  const expire = 1800000 // 30 分钟
  
  // 分数排行榜缓存
  setStorage('leaderboard_score_cache', {
    data: mockData.leaderboard.score.data,
    timestamp: now,
    expire: expire
  })
  
  // 关卡排行榜缓存
  setStorage('leaderboard_wave_cache', {
    data: mockData.leaderboard.wave.data,
    timestamp: now,
    expire: expire
  })
}

/**
 * 注入赛季排行榜数据到缓存
 * - seasonLeaderboardCache: 赛季排行榜缓存（score 和 wave）
 */
function injectSeasonLeaderboardData() {
  console.log('\n📦 [注入] 赛季排行榜缓存数据')
  const now = Date.now()
  const expire = 1800000 // 30 分钟
  
  // 赛季分数排行榜缓存
  setStorage('season_leaderboard_score_cache', {
    data: mockData.seasonLeaderboard.score.data,
    timestamp: now,
    expire: expire
  })
  
  // 赛季关卡排行榜缓存
  setStorage('season_leaderboard_wave_cache', {
    data: mockData.seasonLeaderboard.wave.data,
    timestamp: now,
    expire: expire
  })
}

/**
 * 注入声音设置
 * - soundEnabled: 音效是否开启
 */
function injectSoundSettings() {
  console.log('\n📦 [注入] 声音设置')
  setStorage('soundEnabled', mockData.game.soundEnabled)
}

/**
 * 注入所有数据（快捷方式）
 */
function injectAll() {
  console.log('='.repeat(50))
  console.log('🚀 开始注入所有 Mock 数据')
  console.log('='.repeat(50))
  
  injectPlayerData()
  injectCheckinData()
  injectShareData()
  injectUserInfo()
  injectLeaderboardData()
  injectSeasonLeaderboardData()
  injectSoundSettings()
  
  console.log('\n' + '='.repeat(50))
  console.log('✅ Mock 数据注入完成！')
  console.log('='.repeat(50))
  console.log('\n📊 数据摘要:')
  console.log(`  - 最高分: ${mockData.game.highScore}`)
  console.log(`  - 最高关卡: ${mockData.game.bestWave}`)
  console.log(`  - 金币: ${mockData.game.coins}`)
  console.log(`  - 签到天数: ${mockData.checkin.streak}`)
  console.log(`  - 今日分享: ${mockData.quickShare.todayShareCount}/${mockData.quickShare.maxShareCountPerDay}`)
  console.log(`  - 用户: ${mockData.game.userInfo.nickname}`)
  console.log(`  - 排行榜: ${mockData.leaderboard.score.data.leaderboard.length} 条记录`)
  console.log(`  - 赛季排行榜: ${mockData.seasonLeaderboard.score.data.leaderboard.length} 条记录`)
  console.log('')
}

/**
 * 重置所有数据为初始值
 */
function resetAll() {
  console.log('='.repeat(50))
  console.log('🗑️ 重置所有数据')
  console.log('='.repeat(50))
  
  clearAllStorage()
  
  // 写入初始值
  setStorage('highScore', 0)
  setStorage('bestWave', 0)
  setStorage('coins', 1000)
  setStorage('checkinStreak', 0)
  setStorage('lastCheckinDate', '')
  setStorage('lastShareDate', '')
  setStorage('todayShareCount', 0)
  setStorage('lastShareGiftDate', '')
  setStorage('nickname', '')
  setStorage('avatarUrl', '')
  setStorage('userInfoAuthorized', false)
  setStorage('soundEnabled', true)
  
  console.log('\n✅ 数据已重置为初始值')
  console.log('')
}

// ==================== 导出 ====================
export const mockInjector = {
  injectAll,
  injectPlayerData,
  injectCheckinData,
  injectShareData,
  injectUserInfo,
  injectLeaderboardData,
  injectSeasonLeaderboardData,
  injectSoundSettings,
  resetAll,
  clearAllStorage
}

// 兼容直接调用
export { injectAll, injectPlayerData, injectCheckinData, injectShareData, injectUserInfo, injectLeaderboardData, injectSeasonLeaderboardData, injectSoundSettings, resetAll, clearAllStorage }
