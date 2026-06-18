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
      .orderBy('_openid', 'asc')  // 添加次级排序，确保相同分数时顺序一致
      .limit(limit)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true })
      .get()

    // 构造排行榜列表（处理相同分数的情况）
    const leaderboard = []
    let currentRank = 1
    let lastValue = -1
    
    for (let index = 0; index < topList.length; index++) {
      const item = topList[index]
      const value = item[field] || 0
      
      // 如果分数与上一个不同，更新排名为当前位置 +1
      if (value !== lastValue) {
        currentRank = index + 1
        lastValue = value
      }
      
      leaderboard.push({
        rank: currentRank,
        nickname: item.nickname || '',
        avatarUrl: item.avatarUrl || '',
        value: value,
        isUser: item._openid === openid
      })
    }

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
