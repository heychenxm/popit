const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 查询历史赛季归档数据
 * @param {string} seasonId - 赛季编号，如 '2025-S24'
 * @param {string} type - 'score' 或 'wave'，默认返回全部
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
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

    // 修复：使用 gameData 的最新用户信息更新归档数据
    const updateLeaderboardWithLatestUserInfo = async (leaderboard) => {
      if (!leaderboard || leaderboard.length === 0) return leaderboard
      
      // 收集所有 openid
      const openids = leaderboard.map(item => item.openid).filter(Boolean)
      let userProfileMap = {}
      
      if (openids.length > 0) {
        try {
          const { data: gameDataList } = await db.collection('gameData')
            .where({ _openid: _.in(openids) })
            .field({ _openid: true, nickname: true, avatarUrl: true })
            .limit(100)
            .get()
          
          gameDataList.forEach(item => {
            userProfileMap[item._openid] = {
              nickname: item.nickname || '',
              avatarUrl: item.avatarUrl || ''
            }
          })
        } catch (err) {
          console.warn('获取用户信息失败，使用归档数据:', err)
        }
      }
      
      // 更新排行榜数据，使用最新的用户信息
      return leaderboard.map(item => ({
        ...item,
        nickname: userProfileMap[item.openid]?.nickname || item.nickname || '',
        avatarUrl: userProfileMap[item.openid]?.avatarUrl || item.avatarUrl || '',
        isUser: item.openid === openid
      }))
    }

    if (type === 'score') {
      result.leaderboard = await updateLeaderboardWithLatestUserInfo(archive.topByScore || [])
    } else if (type === 'wave') {
      result.leaderboard = await updateLeaderboardWithLatestUserInfo(archive.topByWave || [])
    } else {
      result.topByScore = await updateLeaderboardWithLatestUserInfo(archive.topByScore || [])
      result.topByWave = await updateLeaderboardWithLatestUserInfo(archive.topByWave || [])
    }

    return { success: true, data: result }
  } catch (err) {
    console.error('getSeasonArchive error:', err)
    return { success: false, error: err.message }
  }
}
