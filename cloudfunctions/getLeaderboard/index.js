const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取总排行榜
 * @param {string} type - 'score' 或 'wave'
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const type = event.type || 'score'
  const field = type === 'wave' ? 'bestWave' : 'highScore'
  const limit = Math.min(event.limit || 50, 100)

  try {
    // 查询 Top N，按对应字段降序
    const { data: topList } = await db.collection('gameData')
      .where({ [field]: _.gt(0) })
      .orderBy(field, 'desc')
      .limit(limit)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true })
      .get()

    // 构造排行榜列表
    const leaderboard = topList.map((item, index) => ({
      rank: index + 1,
      nickname: item.nickname || '匿名玩家',
      avatarUrl: item.avatarUrl || '',
      value: item[field] || 0,
      isUser: item._openid === openid
    }))

    // 查询当前用户排名
    let userRank = 0
    let userValue = 0
    if (openid) {
      const { data: userRecords } = await db.collection('gameData')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (userRecords.length > 0) {
        userValue = userRecords[0][field] || 0
        if (userValue > 0) {
          // 统计有多少人的该字段值大于当前用户
          const { total } = await db.collection('gameData')
            .where({ [field]: _.gt(userValue) })
            .count()
          userRank = total + 1
        }
      }
    }

    return {
      success: true,
      data: {
        type,
        leaderboard,
        userRank,
        userValue
      }
    }
  } catch (err) {
    console.error('getLeaderboard error:', err)
    return { success: false, error: err.message }
  }
}
