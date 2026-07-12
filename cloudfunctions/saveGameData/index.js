const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { checkRateLimit } = require('./rateLimit')

/**
 * 按中国时区 UTC+8 计算当前赛季 ID（与客户端 seasonUtils 对齐）
 * 周期：周一 00:00 ~ 下周一 00:00
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
 * 保存用户游戏数据（upsert）
 * - 分数类字段服务端 Math.max 合并
 * - seasonId 由服务端计算
 * - 同步写入 seasonRecords，供赛季排行榜查询
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '无法获取用户标识' }
  }

  const blocked = await checkRateLimit(db, openid, 'save', 3000)
  if (blocked) {
    return { success: false, error: '操作过于频繁，请稍后再试' }
  }

  const allowedFields = [
    'coins', 'highScore', 'bestWave',
    'seasonScore', 'seasonWave',
    'totalGames', 'totalClears', 'bestStreak',
    'nickname', 'avatarUrl',
    'lastSeasonReward', 'lastSeasonId', 'lastSeasonScoreRank', 'lastSeasonWaveRank', 'lastSeasonRewardDetail'
  ]

  const raw = {}
  for (const key of allowedFields) {
    if (event[key] !== undefined) {
      raw[key] = event[key]
    }
  }

  const numericLimits = {
    coins: [0, 999999],
    highScore: [0, 9999999],
    bestWave: [0, 999],
    seasonScore: [0, 9999999],
    seasonWave: [0, 999],
    totalGames: [0, 999999],
    totalClears: [0, 999999],
    bestStreak: [0, 9999],
    lastSeasonReward: [0, 999999],
    lastSeasonScoreRank: [0, 9999],
    lastSeasonWaveRank: [0, 9999]
  }
  for (const [key, [min, max]] of Object.entries(numericLimits)) {
    if (raw[key] !== undefined) {
      const val = raw[key]
      if (typeof val !== 'number' || !Number.isFinite(val) || val < min || val > max) {
        console.warn(`字段 ${key} 值异常: ${val}，已忽略`)
        delete raw[key]
      }
    }
  }

  const stringLimits = {
    nickname: 50,
    avatarUrl: 500,
    lastSeasonId: 20
  }
  for (const [key, maxLen] of Object.entries(stringLimits)) {
    if (raw[key] !== undefined) {
      const val = raw[key]
      if (typeof val !== 'string' || val.length > maxLen) {
        console.warn(`字段 ${key} 值异常，已忽略`)
        delete raw[key]
      }
    }
  }

  if (raw.lastSeasonRewardDetail !== undefined) {
    if (raw.lastSeasonRewardDetail !== null && typeof raw.lastSeasonRewardDetail !== 'object') {
      delete raw.lastSeasonRewardDetail
    }
  }

  if (Object.keys(raw).length === 0) {
    return { success: false, error: '没有可保存的数据' }
  }

  const currentSeasonId = getCurrentSeasonId()

  try {
    const { data: existingList } = await db.collection('gameData')
      .where({ _openid: openid })
      .limit(1)
      .get()

    const existing = existingList[0] || null
    const updateData = {}

    const maxMergeFields = ['highScore', 'bestWave', 'totalGames', 'totalClears', 'bestStreak']
    for (const key of maxMergeFields) {
      if (raw[key] !== undefined) {
        const prev = existing ? (existing[key] || 0) : 0
        updateData[key] = Math.max(prev, raw[key])
      }
    }

    if (raw.coins !== undefined) {
      const prevCoins = existing ? (existing.coins || 0) : 1000
      const MAX_COIN_INCREASE = 5000
      if (raw.coins <= prevCoins) {
        updateData.coins = raw.coins
      } else {
        updateData.coins = Math.min(raw.coins, prevCoins + MAX_COIN_INCREASE)
      }
    }

    // 只要带了赛季相关字段，就绑定当前赛季并写入
    const hasSeasonPayload =
      raw.seasonScore !== undefined ||
      raw.seasonWave !== undefined ||
      raw.totalGames !== undefined ||
      raw.totalClears !== undefined ||
      raw.bestStreak !== undefined

    if (hasSeasonPayload) {
      updateData.seasonId = currentSeasonId
      const sameSeason = existing && existing.seasonId === currentSeasonId

      if (raw.seasonScore !== undefined) {
        const prev = sameSeason ? (existing.seasonScore || 0) : 0
        updateData.seasonScore = Math.max(prev, raw.seasonScore)
      } else if (sameSeason && typeof existing.seasonScore === 'number') {
        // 未传分数时保留已有赛季分，避免 seasonRecords 被写成 0
        updateData.seasonScore = existing.seasonScore
      }

      if (raw.seasonWave !== undefined) {
        const prev = sameSeason ? (existing.seasonWave || 0) : 0
        updateData.seasonWave = Math.max(prev, raw.seasonWave)
      } else if (sameSeason && typeof existing.seasonWave === 'number') {
        updateData.seasonWave = existing.seasonWave
      }
    }

    if (raw.nickname !== undefined) updateData.nickname = raw.nickname
    if (raw.avatarUrl !== undefined) updateData.avatarUrl = raw.avatarUrl
    if (raw.lastSeasonReward !== undefined) updateData.lastSeasonReward = raw.lastSeasonReward
    if (raw.lastSeasonId !== undefined) updateData.lastSeasonId = raw.lastSeasonId
    if (raw.lastSeasonScoreRank !== undefined) updateData.lastSeasonScoreRank = raw.lastSeasonScoreRank
    if (raw.lastSeasonWaveRank !== undefined) updateData.lastSeasonWaveRank = raw.lastSeasonWaveRank
    if (raw.lastSeasonRewardDetail !== undefined) updateData.lastSeasonRewardDetail = raw.lastSeasonRewardDetail

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: '没有可保存的数据' }
    }

    updateData.updatedAt = db.serverDate()

    if (existing) {
      const res = await db.collection('gameData')
        .where({ _openid: openid })
        .update({ data: updateData })
      if (!res.stats || res.stats.updated === 0) {
        updateData._openid = openid
        await db.collection('gameData').add({ data: updateData })
      }
    } else {
      updateData._openid = openid
      if (updateData.coins === undefined) updateData.coins = 1000
      await db.collection('gameData').add({ data: updateData })
    }

    let seasonRecordOk = true
    let seasonRecordError = null

    if (updateData.seasonId) {
      const seasonId = updateData.seasonId
      try {
        const { data: seasonRecords } = await db.collection('seasonRecords')
          .where({ _openid: openid, seasonId })
          .limit(1)
          .get()

        const seasonUpdate = { updatedAt: db.serverDate() }
        const nickname = updateData.nickname || (existing && existing.nickname) || ''
        const avatarUrl = updateData.avatarUrl || (existing && existing.avatarUrl) || ''

        if (nickname) seasonUpdate.nickname = nickname
        if (avatarUrl) seasonUpdate.avatarUrl = avatarUrl

        const nextScore = updateData.seasonScore !== undefined
          ? updateData.seasonScore
          : (seasonRecords[0] && seasonRecords[0].highScore) || 0
        const nextWave = updateData.seasonWave !== undefined
          ? updateData.seasonWave
          : (seasonRecords[0] && seasonRecords[0].bestWave) || 0
        const nextGames = raw.totalGames !== undefined
          ? raw.totalGames
          : (seasonRecords[0] && seasonRecords[0].totalGames) || 0
        const nextClears = raw.totalClears !== undefined
          ? raw.totalClears
          : (seasonRecords[0] && seasonRecords[0].totalClears) || 0
        const nextStreak = raw.bestStreak !== undefined
          ? raw.bestStreak
          : (seasonRecords[0] && seasonRecords[0].bestStreak) || 0

        if (seasonRecords.length > 0) {
          seasonUpdate.highScore = Math.max(seasonRecords[0].highScore || 0, nextScore || 0)
          seasonUpdate.bestWave = Math.max(seasonRecords[0].bestWave || 0, nextWave || 0)
          seasonUpdate.totalGames = Math.max(seasonRecords[0].totalGames || 0, nextGames || 0)
          seasonUpdate.totalClears = Math.max(seasonRecords[0].totalClears || 0, nextClears || 0)
          seasonUpdate.bestStreak = Math.max(seasonRecords[0].bestStreak || 0, nextStreak || 0)

          await db.collection('seasonRecords')
            .where({ _openid: openid, seasonId })
            .update({ data: seasonUpdate })
        } else {
          await db.collection('seasonRecords').add({
            data: {
              _openid: openid,
              seasonId,
              nickname,
              avatarUrl,
              highScore: nextScore || 0,
              bestWave: nextWave || 0,
              totalGames: nextGames || 0,
              totalClears: nextClears || 0,
              bestStreak: nextStreak || 0,
              updatedAt: db.serverDate()
            }
          })
        }
      } catch (seasonErr) {
        seasonRecordOk = false
        seasonRecordError = seasonErr.message || String(seasonErr)
        console.error('赛季记录保存失败:', seasonErr)
      }
    }

    return {
      success: true,
      data: {
        ...updateData,
        seasonId: updateData.seasonId || currentSeasonId,
        seasonRecordOk,
        seasonRecordError
      }
    }
  } catch (err) {
    console.error('saveGameData error:', err)
    return { success: false, error: err.message }
  }
}
