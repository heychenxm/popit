const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取赛季排行榜
 * @param {string} type - 'score' 或 'wave'
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const type = event.type || 'score'
  const field = type === 'wave' ? 'bestWave' : 'highScore'
  const limit = Math.min(event.limit || 50, 100)

  // 计算当前赛季 ID（与客户端 seasonUtils.js 保持一致）
  // 赛季周期：周六 00:00 ~ 次周五 24:00，编号 YYYY-Sww
  const now = new Date()
  const day = now.getDay() // 0=周日, 6=周六
  let daysToNextSat = 6 - day
  if (daysToNextSat <= 0) daysToNextSat += 7
  const seasonEnd = new Date(now)
  seasonEnd.setDate(seasonEnd.getDate() + daysToNextSat)
  seasonEnd.setHours(0, 0, 0, 0)
  const seasonStart = new Date(seasonEnd)
  seasonStart.setDate(seasonStart.getDate() - 7)
  const year = seasonStart.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const weekNum = Math.ceil(((seasonStart - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
  const seasonId = `${year}-S${String(weekNum).padStart(2, '0')}`

  try {
    // 查询当前赛季 Top N
    const { data: topList } = await db.collection('seasonRecords')
      .where({
        seasonId: seasonId,
        [field]: _.gt(0)
      })
      .orderBy(field, 'desc')
      .orderBy('_openid', 'asc')  // 添加次级排序，确保相同分数时顺序一致
      .limit(limit)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

    // 收集所有 openid，批量从 gameData 获取最新用户信息
    const openids = topList.map(item => item._openid).filter(Boolean)
    let userProfileMap = {}
    
    if (openids.length > 0) {
      const { data: gameDataList } = await db.collection('gameData')
        .where({ _openid: _.in(openids) })
        .field({ _openid: true, nickname: true, avatarUrl: true })
        .limit(100)
        .get()
      
      // 构建 openid -> 用户信息 的映射
      gameDataList.forEach(item => {
        userProfileMap[item._openid] = {
          nickname: item.nickname || '',
          avatarUrl: item.avatarUrl || ''
        }
      })
    }

    // 构造排行榜列表（处理相同分数的情况）
    // 修复：完全使用 gameData 的最新用户信息，确保昵称/头像始终最新
    const leaderboard = []
    let currentRank = 1
    let lastValue = -1
    
    for (let index = 0; index < topList.length; index++) {
      const item = topList[index]
      const userProfile = userProfileMap[item._openid] || {}
      const value = item[field] || 0
      
      // 如果分数与上一个不同，更新排名为当前位置 +1
      if (value !== lastValue) {
        currentRank = index + 1
        lastValue = value
      }
      
      leaderboard.push({
        rank: currentRank,
        // 优先使用 gameData 的最新用户信息
        nickname: userProfile.nickname || item.nickname || '',
        avatarUrl: userProfile.avatarUrl || item.avatarUrl || '',
        value: value,
        isUser: item._openid === openid
      })
    }

    // 查询当前用户赛季数据和排名
    // 修复：使用与 Top N 相同的排名计算逻辑，确保一致性
    let userRank = 0
    let userValue = 0
    let userStats = { totalGames: 0, totalClears: 0, bestStreak: 0 }

    if (openid) {
      const { data: userRecords } = await db.collection('seasonRecords')
        .where({ _openid: openid, seasonId: seasonId })
        .limit(1)
        .get()

      if (userRecords.length > 0) {
        const record = userRecords[0]
        userValue = record[field] || 0
        userStats = {
          totalGames: record.totalGames || 0,
          totalClears: record.totalClears || 0,
          bestStreak: record.bestStreak || 0
        }
        if (userValue > 0) {
          // 修复：使用与 Top N 相同的逻辑，统计严格大于用户分数的人数
          const { total } = await db.collection('seasonRecords')
            .where({ seasonId: seasonId, [field]: _.gt(userValue) })
            .count()
          // 排名 = 严格大于的人数 + 1（与 Top N 列表的排名逻辑一致）
          userRank = total + 1
        }
      }
    }

    return {
      success: true,
      data: {
        type,
        seasonId,
        leaderboard,
        userRank,
        userValue,
        userStats
      }
    }
  } catch (err) {
    console.error('getSeasonLeaderboard error:', err)
    return { success: false, error: err.message }
  }
}
