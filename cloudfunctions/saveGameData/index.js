const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { checkRateLimit } = require('./rateLimit')

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

  // 速率限制：同一用户 3 秒内不允许重复保存
  const blocked = await checkRateLimit(db, openid, 'save', 3000)
  if (blocked) {
    return { success: false, error: '操作过于频繁，请稍后再试' }
  }

  // 只允许保存白名单字段，防止客户端注入
  const allowedFields = [
    'coins', 'highScore', 'bestWave',
    'lastCheckinDate', 'checkinStreak', 'lastCheckinType',
    'lastShareDate', 'todayShareCount', 'lastShareGiftDate',
    'seasonId', 'seasonScore', 'seasonWave',
    'totalGames', 'totalClears', 'bestStreak',
    'nickname', 'avatarUrl'
  ]

  const updateData = {}
  for (const key of allowedFields) {
    if (event[key] !== undefined) {
      updateData[key] = event[key]
    }
  }

  // 数值范围校验，防止客户端传入不合理数据
  const numericLimits = {
    coins: [0, 999999],
    highScore: [0, 9999999],
    bestWave: [0, 999],
    checkinStreak: [0, 365],
    todayShareCount: [0, 100],
    seasonScore: [0, 9999999],
    seasonWave: [0, 999]
  }
  for (const [key, [min, max]] of Object.entries(numericLimits)) {
    if (updateData[key] !== undefined) {
      const val = updateData[key]
      if (typeof val !== 'number' || !Number.isFinite(val) || val < min || val > max) {
        console.warn(`字段 ${key} 值异常: ${val}，已忽略`)
        delete updateData[key]
      }
    }
  }

  // 字符串长度校验
  const stringLimits = {
    nickname: 50,
    avatarUrl: 500,
    lastCheckinDate: 10,
    lastShareDate: 10,
    lastShareGiftDate: 10,
    seasonId: 20
  }
  for (const [key, maxLen] of Object.entries(stringLimits)) {
    if (updateData[key] !== undefined) {
      const val = updateData[key]
      if (typeof val !== 'string' || val.length > maxLen) {
        console.warn(`字段 ${key} 值异常，已忽略`)
        delete updateData[key]
      }
    }
  }

  console.log('过滤后的数据:', JSON.stringify(updateData))

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: '没有可保存的数据' }
  }

  updateData.updatedAt = db.serverDate()

  try {
    // ✅ 优化：并行执行 gameData 和 seasonRecords 的更新（减少等待时间）
    const savePromises = []
    
    // 1. 保存 gameData（优化：直接更新，失败时再创建）
    savePromises.push(
      (async () => {
        try {
          // 尝试直接更新
          await db.collection('gameData')
            .where({ _openid: openid })
            .update({ data: updateData })
          console.log('更新 gameData 成功')
        } catch (err) {
          // 如果更新失败（记录不存在），则创建新记录
          console.log('gameData 不存在，创建新记录')
          updateData._openid = openid
          await db.collection('gameData').add({ data: updateData })
          console.log('创建 gameData 成功')
        }
      })()
    )
    
    // 2. 保存 seasonRecords（如果有赛季数据）
    if (updateData.seasonId) {
      const seasonId = updateData.seasonId
      console.log('更新赛季记录，seasonId:', seasonId)
      
      savePromises.push(
        (async () => {
          try {
            // 查询现有赛季记录
            const { data: seasonRecords } = await db.collection('seasonRecords')
              .where({ _openid: openid, seasonId: seasonId })
              .limit(1)
              .get()
            
            const seasonUpdate = {
              updatedAt: db.serverDate()
            }
            
            // 修复：每次保存都同步更新用户信息（昵称和头像），确保 seasonRecords 中的用户信息始终是最新的
            if (updateData.nickname !== undefined) seasonUpdate.nickname = updateData.nickname
            if (updateData.avatarUrl !== undefined) seasonUpdate.avatarUrl = updateData.avatarUrl
            
            // 赛季数据取较大值（修复：使用 Math.max 替代 _.max）
            if (updateData.seasonScore !== undefined) {
              const existingScore = seasonRecords.length > 0 ? (seasonRecords[0].highScore || 0) : 0
              seasonUpdate.highScore = Math.max(existingScore, updateData.seasonScore)
            }
            if (updateData.seasonWave !== undefined) {
              const existingWave = seasonRecords.length > 0 ? (seasonRecords[0].bestWave || 0) : 0
              seasonUpdate.bestWave = Math.max(existingWave, updateData.seasonWave)
            }
            
            // 修复：传递其他赛季统计字段（取较大值而非直接覆盖）
            if (updateData.totalGames !== undefined) {
              const existingGames = seasonRecords.length > 0 ? (seasonRecords[0].totalGames || 0) : 0
              seasonUpdate.totalGames = Math.max(existingGames, updateData.totalGames)
            }
            if (updateData.totalClears !== undefined) {
              const existingClears = seasonRecords.length > 0 ? (seasonRecords[0].totalClears || 0) : 0
              seasonUpdate.totalClears = Math.max(existingClears, updateData.totalClears)
            }
            if (updateData.bestStreak !== undefined) {
              const existingStreak = seasonRecords.length > 0 ? (seasonRecords[0].bestStreak || 0) : 0
              seasonUpdate.bestStreak = Math.max(existingStreak, updateData.bestStreak)
            }
            
            console.log('赛季更新数据:', JSON.stringify(seasonUpdate))
            
            if (seasonRecords.length > 0) {
              console.log('更新已有赛季记录')
              await db.collection('seasonRecords')
                .where({ _openid: openid, seasonId: seasonId })
                .update({ data: seasonUpdate })
            } else {
              console.log('创建新赛季记录')
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
          } catch (seasonErr) {
            console.error('赛季记录保存失败:', seasonErr)
            // 赛季记录保存失败不影响主流程
          }
        })()
      )
    } else {
      console.log('没有赛季数据，跳过赛季记录更新')
    }
    
    // ✅ 优化：并行执行所有保存操作
    await Promise.all(savePromises)
    
    console.log('保存成功')
    return { success: true, data: updateData }
  } catch (err) {
    console.error('saveGameData error:', err)
    return { success: false, error: err.message }
  }
}
