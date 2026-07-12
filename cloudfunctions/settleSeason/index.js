const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 按中国时区计算赛季 ID（与 seasonUtils / getSeasonLeaderboard 对齐）
 */
function getSeasonIdAtOffsetWeeks(weekOffset) {
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const day = chinaNow.getUTCDay()
  let daysToNextMon = (1 - day + 7) % 7
  if (daysToNextMon === 0) daysToNextMon = 7

  const seasonStart = new Date(Date.UTC(
    chinaNow.getUTCFullYear(),
    chinaNow.getUTCMonth(),
    chinaNow.getUTCDate() + daysToNextMon - 7 + weekOffset * 7
  ))
  const year = seasonStart.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1))
  const weekNum = Math.ceil(
    ((seasonStart - startOfYear) / 86400000 + startOfYear.getUTCDay() + 1) / 7
  )
  return `${year}-S${String(weekNum).padStart(2, '0')}`
}

function getCurrentSeasonId() {
  return getSeasonIdAtOffsetWeeks(0)
}

function getPreviousSeasonId() {
  return getSeasonIdAtOffsetWeeks(-1)
}

/**
 * 同分同名次（与 getSeasonLeaderboard 一致）
 */
function assignRanks(list, field) {
  let currentRank = 1
  let lastValue = null
  return list.map((item, index) => {
    const value = item[field] || 0
    if (lastValue === null || value !== lastValue) {
      currentRank = index + 1
      lastValue = value
    }
    return { ...item, rank: currentRank }
  })
}

/**
 * 赛季结算 - 将指定赛季的排行榜数据归档到 seasonArchive
 * 幂等设计：已结算过的赛季不会重复结算
 * 仅允许结算「已结束」的赛季（默认上一赛季），禁止结算当前进行中赛季
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const source = wxContext.SOURCE || ''
  const seasonId = event.seasonId || getPreviousSeasonId()
  const currentSeasonId = getCurrentSeasonId()

  if (!seasonId) {
    return { success: false, error: '缺少 seasonId 参数' }
  }

  // 禁止结算进行中的赛季
  if (seasonId === currentSeasonId) {
    return { success: false, error: '不能结算进行中的赛季' }
  }

  // 客户端调用仅允许结算上一赛季；定时触发器可结算指定历史赛季
  const isTrigger = source === 'wx_trigger' || source === 'wx_devops'
  if (!isTrigger && seasonId !== getPreviousSeasonId()) {
    return { success: false, error: '仅允许结算上一赛季' }
  }

  try {
    // 幂等检查：是否已归档
    const { data: existing } = await db.collection('seasonArchive')
      .where({ seasonId })
      .limit(1)
      .get()

    if (existing.length > 0) {
      // 若已归档但未发奖，尝试补发
      if (!existing[0].rewardsDistributed) {
        try {
          await cloud.callFunction({
            name: 'distributeSeasonReward',
            data: { seasonId, _internal: true }
          })
        } catch (e) {
          console.warn('补发奖励失败:', e)
        }
      }
      return { success: true, data: { alreadySettled: true, seasonId } }
    }

    const { total: totalParticipants } = await db.collection('seasonRecords')
      .where({ seasonId })
      .count()

    if (totalParticipants === 0) {
      try {
        await db.collection('seasonArchive').add({
          data: {
            seasonId,
            totalParticipants: 0,
            topByScore: [],
            topByWave: [],
            rewardsDistributed: true,
            settledBy: openid || source || 'system',
            settledAt: db.serverDate()
          }
        })
      } catch (addErr) {
        // 并发下可能已有人写入
        return { success: true, data: { alreadySettled: true, seasonId } }
      }
      return { success: true, data: { alreadySettled: false, seasonId, totalParticipants: 0 } }
    }

    const { data: topByScoreRaw } = await db.collection('seasonRecords')
      .where({ seasonId, highScore: _.gt(0) })
      .orderBy('highScore', 'desc')
      .orderBy('_openid', 'asc')
      .limit(100)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

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

    const topByScoreUnranked = topByScoreRaw.map((item) => {
      const userProfile = scoreUserProfileMap[item._openid] || {}
      return {
        openid: item._openid,
        nickname: userProfile.nickname || item.nickname || '',
        avatarUrl: userProfile.avatarUrl || item.avatarUrl || '',
        highScore: item.highScore || 0,
        bestWave: item.bestWave || 0,
        totalGames: item.totalGames || 0,
        totalClears: item.totalClears || 0,
        bestStreak: item.bestStreak || 0
      }
    })
    const topByScore = assignRanks(topByScoreUnranked, 'highScore')

    const { data: topByWaveRaw } = await db.collection('seasonRecords')
      .where({ seasonId, bestWave: _.gt(0) })
      .orderBy('bestWave', 'desc')
      .orderBy('_openid', 'asc')
      .limit(100)
      .field({ _openid: true, nickname: true, avatarUrl: true, highScore: true, bestWave: true, totalGames: true, totalClears: true, bestStreak: true })
      .get()

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

    const topByWaveUnranked = topByWaveRaw.map((item) => {
      const userProfile = waveUserProfileMap[item._openid] || {}
      return {
        openid: item._openid,
        nickname: userProfile.nickname || item.nickname || '',
        avatarUrl: userProfile.avatarUrl || item.avatarUrl || '',
        highScore: item.highScore || 0,
        bestWave: item.bestWave || 0,
        totalGames: item.totalGames || 0,
        totalClears: item.totalClears || 0,
        bestStreak: item.bestStreak || 0
      }
    })
    const topByWave = assignRanks(topByWaveUnranked, 'bestWave')

    try {
      await db.collection('seasonArchive').add({
        data: {
          seasonId,
          totalParticipants,
          topByScore,
          topByWave,
          rewardsDistributed: false,
          settledBy: openid || source || 'system',
          settledAt: db.serverDate()
        }
      })
    } catch (addErr) {
      console.warn('归档写入冲突，可能已结算:', addErr)
      return { success: true, data: { alreadySettled: true, seasonId } }
    }

    console.log(`赛季 ${seasonId} 结算完成，参与人数: ${totalParticipants}`)

    try {
      const rewardResult = await cloud.callFunction({
        name: 'distributeSeasonReward',
        data: { seasonId, _internal: true }
      })
      if (rewardResult.result && rewardResult.result.success) {
        console.log(`赛季 ${seasonId} 奖励发放成功:`, rewardResult.result.data)
      } else {
        console.warn(`赛季 ${seasonId} 奖励发放失败:`, rewardResult.result)
      }
    } catch (rewardErr) {
      console.error(`赛季 ${seasonId} 奖励发放异常（不影响结算）:`, rewardErr)
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
