const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 查询历史赛季归档数据
 * @param {string} seasonId - 赛季编号，如 '2025-S24'
 * @param {string} type - 'score' 或 'wave'，默认返回全部
 */
exports.main = async (event, context) => {
  const { seasonId, type } = event

  if (!seasonId) {
    return { success: false, error: '缺少 seasonId 参数' }
  }

  try {
    const { data } = await db.collection('seasonArchive')
      .where({ seasonId })
      .limit(1)
      .get()

    if (data.length === 0) {
      return { success: true, data: null, message: '该赛季暂无归档数据' }
    }

    const archive = data[0]
    const result = {
      seasonId: archive.seasonId,
      totalParticipants: archive.totalParticipants,
      settledAt: archive.settledAt
    }

    if (type === 'score') {
      result.leaderboard = archive.topByScore || []
    } else if (type === 'wave') {
      result.leaderboard = archive.topByWave || []
    } else {
      result.topByScore = archive.topByScore || []
      result.topByWave = archive.topByWave || []
    }

    return { success: true, data: result }
  } catch (err) {
    console.error('getSeasonArchive error:', err)
    return { success: false, error: err.message }
  }
}
