const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 按中国时区 UTC+8 计算当前赛季 ID
 */
function getCurrentSeasonId() {
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const day = chinaNow.getUTCDay()
  let daysToNextMon = (1 - day + 7) % 7
  if (daysToNextMon === 0) daysToNextMon = 7

  const seasonStart = new Date(Date.UTC(
    chinaNow.getUTCFullYear(),
    chinaNow.getUTCMonth(),
    chinaNow.getUTCDate() + daysToNextMon - 7
  ))
  const year = seasonStart.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1))
  const weekNum = Math.ceil(
    ((seasonStart - startOfYear) / 86400000 + startOfYear.getUTCDay() + 1) / 7
  )
  return `${year}-S${String(weekNum).padStart(2, '0')}`
}

/**
 * 获取赛季排行榜
 * 主数据源：seasonRecords
 * 兜底：当前用户 gameData 赛季分（防止只写了 gameData 未写 seasonRecords）
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const type = event.type || 'score'
  const field = type === 'wave' ? 'bestWave' : 'highScore'
  const gameField = type === 'wave' ? 'seasonWave' : 'seasonScore'
  const limit = Math.min(event.limit || 50, 100)
  const seasonId = getCurrentSeasonId()

  try {
    let topList = []
    try {
      const res = await db.collection('seasonRecords')
        .where({
          seasonId: seasonId,
          [field]: _.gt(0)
        })
        .orderBy(field, 'desc')
        .orderBy('_openid', 'asc')
        .limit(limit)
        .field({
          _openid: true,
          nickname: true,
          avatarUrl: true,
          highScore: true,
          bestWave: true,
          totalGames: true,
          totalClears: true,
          bestStreak: true
        })
        .get()
      topList = res.data || []
    } catch (queryErr) {
      console.error('seasonRecords 查询失败（可能缺索引）:', queryErr)
      // 降级：不带 orderBy 次级排序
      const res = await db.collection('seasonRecords')
        .where({
          seasonId: seasonId,
          [field]: _.gt(0)
        })
        .orderBy(field, 'desc')
        .limit(limit)
        .get()
      topList = res.data || []
    }

    // 当前用户：若 seasonRecords 缺失/偏低，用 gameData 兜底并尝试补写
    let userRank = 0
    let userValue = 0
    let userStats = { totalGames: 0, totalClears: 0, bestStreak: 0 }
    let userProfile = { nickname: '', avatarUrl: '' }

    if (openid) {
      const { data: userRecords } = await db.collection('seasonRecords')
        .where({ _openid: openid, seasonId })
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
        userProfile = {
          nickname: record.nickname || '',
          avatarUrl: record.avatarUrl || ''
        }
      }

      const { data: gameDataList } = await db.collection('gameData')
        .where({ _openid: openid })
        .limit(1)
        .field({
          seasonId: true,
          seasonScore: true,
          seasonWave: true,
          totalGames: true,
          totalClears: true,
          bestStreak: true,
          nickname: true,
          avatarUrl: true
        })
        .get()

      if (gameDataList.length > 0) {
        const gd = gameDataList[0]
        userProfile.nickname = gd.nickname || userProfile.nickname
        userProfile.avatarUrl = gd.avatarUrl || userProfile.avatarUrl

        if (gd.seasonId === seasonId) {
          const gdValue = gd[gameField] || 0
          if (gdValue > userValue) {
            userValue = gdValue
            userStats = {
              totalGames: Math.max(userStats.totalGames, gd.totalGames || 0),
              totalClears: Math.max(userStats.totalClears, gd.totalClears || 0),
              bestStreak: Math.max(userStats.bestStreak, gd.bestStreak || 0)
            }

            // 补写 seasonRecords，修复「gameData 有分、排行榜没有」
            try {
              const healData = {
                nickname: userProfile.nickname,
                avatarUrl: userProfile.avatarUrl,
                highScore: gd.seasonScore || 0,
                bestWave: gd.seasonWave || 0,
                totalGames: gd.totalGames || 0,
                totalClears: gd.totalClears || 0,
                bestStreak: gd.bestStreak || 0,
                updatedAt: db.serverDate()
              }
              if (userRecords.length > 0) {
                await db.collection('seasonRecords')
                  .where({ _openid: openid, seasonId })
                  .update({
                    data: {
                      highScore: Math.max(userRecords[0].highScore || 0, healData.highScore),
                      bestWave: Math.max(userRecords[0].bestWave || 0, healData.bestWave),
                      totalGames: Math.max(userRecords[0].totalGames || 0, healData.totalGames),
                      totalClears: Math.max(userRecords[0].totalClears || 0, healData.totalClears),
                      bestStreak: Math.max(userRecords[0].bestStreak || 0, healData.bestStreak),
                      nickname: healData.nickname,
                      avatarUrl: healData.avatarUrl,
                      updatedAt: healData.updatedAt
                    }
                  })
              } else {
                await db.collection('seasonRecords').add({
                  data: {
                    _openid: openid,
                    seasonId,
                    ...healData
                  }
                })
              }

              // 补进 topList（若尚未在列表）
              const exists = topList.some(item => item._openid === openid)
              if (!exists && userValue > 0) {
                topList.push({
                  _openid: openid,
                  nickname: userProfile.nickname,
                  avatarUrl: userProfile.avatarUrl,
                  highScore: gd.seasonScore || 0,
                  bestWave: gd.seasonWave || 0,
                  totalGames: gd.totalGames || 0,
                  totalClears: gd.totalClears || 0,
                  bestStreak: gd.bestStreak || 0
                })
                topList.sort((a, b) => (b[field] || 0) - (a[field] || 0))
                if (topList.length > limit) topList = topList.slice(0, limit)
              } else if (exists) {
                const idx = topList.findIndex(item => item._openid === openid)
                if (idx >= 0) {
                  topList[idx][field] = Math.max(topList[idx][field] || 0, userValue)
                  topList.sort((a, b) => (b[field] || 0) - (a[field] || 0))
                }
              }
            } catch (healErr) {
              console.warn('补写 seasonRecords 失败:', healErr)
            }
          }
        }
      }

      if (userValue > 0) {
        const { total } = await db.collection('seasonRecords')
          .where({ seasonId: seasonId, [field]: _.gt(userValue) })
          .count()
        userRank = total + 1
      }
    }

    const openids = topList.map(item => item._openid).filter(Boolean)
    let userProfileMap = {}

    if (openids.length > 0) {
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
    }

    const leaderboard = []
    let currentRank = 1
    let lastValue = -1

    for (let index = 0; index < topList.length; index++) {
      const item = topList[index]
      const profile = userProfileMap[item._openid] || {}
      const value = item[field] || 0

      if (value !== lastValue) {
        currentRank = index + 1
        lastValue = value
      }

      leaderboard.push({
        rank: currentRank,
        nickname: profile.nickname || item.nickname || '',
        avatarUrl: profile.avatarUrl || item.avatarUrl || '',
        value,
        isUser: item._openid === openid
      })
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
