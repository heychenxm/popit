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

    // 收集所有 openid，批量从 gameData 获取最新用户信息
    const scoreOpenids = topByScoreRaw.map(item => item._openid).filter(Boolean)
    let scoreUserProfileMap = {}
    
    if (scoreOpenids.length > 0) {
      const { data: gameDataList } = await db.collection('gameData')
        .where({ _openid: _.in(scoreOpenids) })
        .field({ _openid: true, nickname: true, avatarUrl: true })
        .limit(100)
        .get()
      
      gameDataList.forEach(item => {
        scoreUserProfileMap[item._openid] = {
          nickname: item.nickname || '',
          avatarUrl: item.avatarUrl || ''
        }
      })
    }

    const topByScore = topByScoreRaw.map((item, index) => {
      const userProfile = scoreUserProfileMap[item._openid] || {}
      return {
        rank: index + 1,
        openid: item._openid,
        // 优先使用 gameData 的最新用户信息
        nickname: userProfile.nickname || item.nickname || '',
        avatarUrl: userProfile.avatarUrl || item.avatarUrl || '',
        highScore: item.highScore || 0,
        bestWave: item.bestWave || 0,
        totalGames: item.totalGames || 0,
        totalClears: item.totalClears || 0,
        bestStreak: item.bestStreak || 0
      }
    })

    // 按关卡排名 Top 100
    const { data: topByWaveRaw } = await db.collection('seasonRecords')
      .where({ seasonId, bestWave: _.gt(0) })
      .orderBy('bestWave', 'desc')
      .limit(100)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

    // 收集所有 openid，批量从 gameData 获取最新用户信息
    const waveOpenids = topByWaveRaw.map(item => item._openid).filter(Boolean)
    let waveUserProfileMap = {}
    
    if (waveOpenids.length > 0) {
      const { data: gameDataList } = await db.collection('gameData')
        .where({ _openid: _.in(waveOpenids) })
        .field({ _openid: true, nickname: true, avatarUrl: true })
        .limit(100)
        .get()
      
      gameDataList.forEach(item => {
        waveUserProfileMap[item._openid] = {
          nickname: item.nickname || '',
          avatarUrl: item.avatarUrl || ''
        }
      })
    }

    const topByWave = topByWaveRaw.map((item, index) => {
      const userProfile = waveUserProfileMap[item._openid] || {}
      return {
        rank: index + 1,
        openid: item._openid,
        // 优先使用 gameData 的最新用户信息
        nickname: userProfile.nickname || item.nickname || '',
        avatarUrl: userProfile.avatarUrl || item.avatarUrl || '',
        highScore: item.highScore || 0,
        bestWave: item.bestWave || 0,
        totalGames: item.totalGames || 0,
        totalClears: item.totalClears || 0,
        bestStreak: item.bestStreak || 0
      }
    })

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

    // 新增：结算完成后，调用奖励发放云函数
    try {
      console.log(`开始发放赛季 ${seasonId} 奖励`)
      const rewardResult = await cloud.callFunction({
        name: 'distributeSeasonReward',
        data: {
          seasonId,
          scoreLeaderboard: topByScore,
          waveLeaderboard: topByWave
        }
      })
      
      if (rewardResult.result && rewardResult.result.success) {
        console.log(`赛季 ${seasonId} 奖励发放成功:`, rewardResult.result.data)
      } else {
        console.warn(`赛季 ${seasonId} 奖励发放失败:`, rewardResult.result)
      }
    } catch (rewardErr) {
      console.error(`赛季 ${seasonId} 奖励发放异常（不影响结算）:`, rewardErr)
      // 奖励发放失败不影响结算流程
    }

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
