const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 赛季结算 - 将指定赛季的排行榜数据归档到 seasonArchive
 * 幂等设计：已结算过的赛季不会重复结算
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const seasonId = event.seasonId

  if (!seasonId) {
    return { success: false, error: '缺少 seasonId 参数' }
  }

  try {
    // 幂等检查：是否已归档
    const { data: existing } = await db.collection('seasonArchive')
      .where({ seasonId })
      .limit(1)
      .get()

    if (existing.length > 0) {
      return { success: true, data: { alreadySettled: true, seasonId } }
    }

    // 统计参与人数
    const { total: totalParticipants } = await db.collection('seasonRecords')
      .where({ seasonId })
      .count()

    if (totalParticipants === 0) {
      // 无人参与，写一条空归档
      await db.collection('seasonArchive').add({
        data: {
          seasonId,
          totalParticipants: 0,
          topByScore: [],
          topByWave: [],
          settledBy: openid || 'system',
          settledAt: db.serverDate()
        }
      })
      return { success: true, data: { alreadySettled: false, seasonId, totalParticipants: 0 } }
    }

    // 按分数排名 Top 100
    const { data: topByScoreRaw } = await db.collection('seasonRecords')
      .where({ seasonId, highScore: _.gt(0) })
      .orderBy('highScore', 'desc')
      .limit(100)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

    const topByScore = topByScoreRaw.map((item, index) => ({
      rank: index + 1,
      openid: item._openid,
      nickname: item.nickname || '',
      avatarUrl: item.avatarUrl || '',
      highScore: item.highScore || 0,
      bestWave: item.bestWave || 0,
      totalGames: item.totalGames || 0,
      totalClears: item.totalClears || 0,
      bestStreak: item.bestStreak || 0
    }))

    // 按关卡排名 Top 100
    const { data: topByWaveRaw } = await db.collection('seasonRecords')
      .where({ seasonId, bestWave: _.gt(0) })
      .orderBy('bestWave', 'desc')
      .limit(100)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

    const topByWave = topByWaveRaw.map((item, index) => ({
      rank: index + 1,
      openid: item._openid,
      nickname: item.nickname || '',
      avatarUrl: item.avatarUrl || '',
      highScore: item.highScore || 0,
      bestWave: item.bestWave || 0,
      totalGames: item.totalGames || 0,
      totalClears: item.totalClears || 0,
      bestStreak: item.bestStreak || 0
    }))

    // 写入归档
    await db.collection('seasonArchive').add({
      data: {
        seasonId,
        totalParticipants,
        topByScore,
        topByWave,
        settledBy: openid || 'system',
        settledAt: db.serverDate()
      }
    })

    console.log(`赛季 ${seasonId} 结算完成，参与人数: ${totalParticipants}`)

    return {
      success: true,
      data: {
        alreadySettled: false,
        seasonId,
        totalParticipants,
        topByScoreCount: topByScore.length,
        topByWaveCount: topByWave.length
      }
    }
  } catch (err) {
    console.error('settleSeason error:', err)
    return { success: false, error: err.message }
  }
}
