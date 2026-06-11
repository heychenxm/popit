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
      .limit(limit)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

    const leaderboard = topList.map((item, index) => ({
      rank: index + 1,
      nickname: item.nickname || '',
      avatarUrl: item.avatarUrl || '',
      value: item[field] || 0,
      isUser: item._openid === openid
    }))

    // 查询当前用户赛季数据和排名
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
          const { total } = await db.collection('seasonRecords')
            .where({ seasonId: seasonId, [field]: _.gt(userValue) })
            .count()
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
