const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 保存用户游戏数据（upsert）
 * 客户端传入需要保存的字段，服务端合并更新
 * 同时更新赛季记录
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '无法获取用户标识' }
  }

  // 只允许保存白名单字段，防止客户端注入
  const allowedFields = [
    'coins', 'highScore', 'bestWave',
    'lastCheckinDate', 'checkinStreak',
    'lastShareDate', 'todayShareCount', 'lastShareGiftDate',
    'seasonId', 'seasonScore', 'seasonWave'
  ]

  const updateData = {}
  for (const key of allowedFields) {
    if (event[key] !== undefined) {
      updateData[key] = event[key]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: '没有可保存的数据' }
  }

  updateData.updatedAt = db.serverDate()

  try {
    // 查找是否已有记录
    const { data } = await db.collection('gameData')
      .where({ _openid: openid })
      .limit(1)
      .get()

    if (data.length > 0) {
      // 已有记录，更新
      await db.collection('gameData')
        .where({ _openid: openid })
        .update({ data: updateData })
    } else {
      // 新建记录
      updateData._openid = openid
      await db.collection('gameData').add({ data: updateData })
    }

    // 同时更新赛季记录（如果有赛季数据）
    if (updateData.seasonId) {
      const seasonId = updateData.seasonId
      const { data: seasonRecords } = await db.collection('seasonRecords')
        .where({ _openid: openid, seasonId: seasonId })
        .limit(1)
        .get()

      const seasonUpdate = {
        updatedAt: db.serverDate()
      }

      // 赛季数据取较大值
      if (updateData.seasonScore !== undefined) {
        seasonUpdate.highScore = _.max(updateData.seasonScore)
      }
      if (updateData.seasonWave !== undefined) {
        seasonUpdate.bestWave = _.max(updateData.seasonWave)
      }

      // 传递其他赛季统计字段
      if (event.totalGames !== undefined) seasonUpdate.totalGames = event.totalGames
      if (event.totalClears !== undefined) seasonUpdate.totalClears = event.totalClears
      if (event.bestStreak !== undefined) seasonUpdate.bestStreak = _.max(event.bestStreak)

      if (seasonRecords.length > 0) {
        await db.collection('seasonRecords')
          .where({ _openid: openid, seasonId: seasonId })
          .update({ data: seasonUpdate })
      } else {
        seasonUpdate._openid = openid
        seasonUpdate.seasonId = seasonId
        seasonUpdate.nickname = updateData.nickname || ''
        seasonUpdate.avatarUrl = updateData.avatarUrl || ''
        seasonUpdate.highScore = updateData.seasonScore || 0
        seasonUpdate.bestWave = updateData.seasonWave || 0
        seasonUpdate.totalGames = event.totalGames || 0
        seasonUpdate.totalClears = event.totalClears || 0
        seasonUpdate.bestStreak = event.bestStreak || 0
        await db.collection('seasonRecords').add({ data: seasonUpdate })
      }
    }

    return { success: true, data: updateData }
  } catch (err) {
    console.error('saveGameData error:', err)
    return { success: false, error: err.message }
  }
}
