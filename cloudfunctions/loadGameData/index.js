const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 加载用户游戏数据
 * 返回云端保存的完整游戏数据
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '无法获取用户标识' }
  }

  try {
    const { data } = await db.collection('gameData')
      .where({ _openid: openid })
      .limit(1)
      .field({ 
        coins: true, highScore: true, bestWave: true,
        lastCheckinDate: true, checkinStreak: true, lastCheckinType: true,
        lastShareDate: true, todayShareCount: true, lastShareGiftDate: true,
        seasonId: true, seasonScore: true, seasonWave: true,
        totalGames: true, totalClears: true, bestStreak: true,
        nickname: true, avatarUrl: true,
        lastSeasonReward: true, lastSeasonId: true,
        lastSeasonScoreRank: true, lastSeasonWaveRank: true,
        lastSeasonRewardDetail: true
      })
      .get()

    if (data.length > 0) {
      const record = data[0]
      // 移除不需要的字段
      delete record._id
      delete record._openid
      return { success: true, data: record }
    }

    // 新用户，主动创建初始数据（方案 2：云函数兜底）
    console.log('检测到新用户，创建初始游戏数据')
    const initialData = {
      _openid: openid,
      coins: 1000,
      highScore: 0,
      bestWave: 0,
      lastCheckinDate: '',
      checkinStreak: 0,
      lastCheckinType: '',
      lastShareDate: '',
      todayShareCount: 0,
      lastShareGiftDate: '',
      nickname: '',
      avatarUrl: '',
      updatedAt: db.serverDate()
    }

    try {
      await db.collection('gameData').add({ data: initialData })
      console.log('新用户初始数据创建成功')
      // 移除内部字段后返回
      delete initialData._openid
      delete initialData.updatedAt
      return { success: true, data: initialData }
    } catch (err) {
      console.error('创建新用户数据失败:', err)
      // 如果创建失败（如并发冲突），降级返回 null
      return { success: true, data: null }
    }
  } catch (err) {
    console.error('loadGameData error:', err)
    return { success: false, error: err.message }
  }
}
