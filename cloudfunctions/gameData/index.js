/**
 * 游戏数据云函数（合并版）
 * 功能：处理游戏数据的同步、更新、签到等，减少云函数数量
 * 
 * 支持的操作：
 * - sync: 同步数据（游戏启动时）
 * - update: 更新数据（通关、分享等）
 * - checkinStatus: 获取签到状态
 * - doCheckin: 执行签到
 * - checkinAndReward: 签到并领取奖励（合并操作，减少调用次数）
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 签到奖励配置（新规则：纯金币模式）
// 第 1 天：300，第 2 天：500，第 3-6 天：1000，第 7 天：3000（1000+2000 额外）
// 第 8 天起：每天 1000，7 的倍数天：3000（1000+2000）
function getDayReward(day) {
  let baseReward = 1000
  if (day === 1) {
    baseReward = 300
  } else if (day === 2) {
    baseReward = 500
  }
  
  const bonusReward = (day % 7 === 0) ? 2000 : 0
  
  return {
    type: 'coin',
    amount: baseReward + bonusReward,
    baseReward: baseReward,
    bonusReward: bonusReward,
    isBonusDay: bonusReward > 0
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    const { action = 'sync' } = event
    
    switch (action) {
      case 'sync':
        return await handleSync(openid, event)
      case 'update':
        return await handleUpdate(openid, event)
      case 'checkinStatus':
        return await handleCheckinStatus(openid)
      case 'doCheckin':
        return await handleDoCheckin(openid)
      case 'checkinAndReward':
        return await handleCheckinAndReward(openid)
      case 'updateSeasonData':
        return await handleUpdateSeasonData(openid, event)
      default:
        return {
          success: false,
          message: '未知操作'
        }
    }
  } catch (err) {
    console.error('游戏数据处理失败:', err)
    return {
      success: false,
      message: '服务器错误：' + err.message,
      cloudAvailable: false
    }
  }
}

/**
 * 处理同步操作（游戏启动时）
 */
async function handleSync(openid, event) {
  const { highestWave, highestScore, coins, gems } = event
  
  try {
    // 获取云端数据
    const userResult = await db.collection('user_profile')
      .where({ openid })
      .get()
    
    let userData
    if (userResult.data.length === 0) {
      // 云端无数据，创建新记录
      userData = {
        openid,
        highestWave: highestWave || 0,
        highestScore: highestScore || 0,
        coins: coins || 0,
        gems: gems || 0,
        lastUpdateTime: Date.now()
      }
      await db.collection('user_profile').add({ data: userData })
    } else {
      const oldData = userResult.data[0]
      
      // 只同步最高分和最高关卡
      const updateData = {
        highestWave: Math.max(oldData.highestWave, highestWave || 0),
        highestScore: Math.max(oldData.highestScore, highestScore || 0),
        lastUpdateTime: Date.now()
      }
      
      await db.collection('user_profile')
        .where({ openid })
        .update({ data: updateData })
      
      userData = { ...oldData, ...updateData }
    }
    
    // 获取签到数据
    const signinResult = await db.collection('user_signin')
      .where({ openid })
      .get()
    
    let signinData = null
    if (signinResult.data.length > 0) {
      signinData = signinResult.data[0]
    }
    
    return {
      success: true,
      message: '同步成功',
      data: {
        profile: userData,
        signin: signinData
      }
    }
    
  } catch (err) {
    console.error('同步数据失败:', err)
    return {
      success: false,
      message: '同步失败：' + err.message
    }
  }
}

/**
 * 处理更新操作（通关、分享等）
 */
async function handleUpdate(openid, event) {
  const { 
    highestWave, 
    highestScore, 
    coins, 
    gems,
    addCoins,
    addGems,
    nickname,
    avatarUrl
  } = event
  
  // 参数校验
  const maxWave = 999
  const maxScore = 999999
  const maxCoins = 999999
  const maxAddCoins = 10000
  const maxGems = 99999
  const maxAddGems = 10000
  
  if (highestWave !== undefined && (highestWave < 0 || highestWave > maxWave)) {
    return { success: false, message: '参数错误：关卡数超出合理范围' }
  }
  if (highestScore !== undefined && (highestScore < 0 || highestScore > maxScore)) {
    return { success: false, message: '参数错误：分数超出合理范围' }
  }
  if (coins !== undefined && (coins < 0 || coins > maxCoins)) {
    return { success: false, message: '参数错误：金币数超出合理范围' }
  }
  if (addCoins !== undefined && (addCoins <= 0 || addCoins > maxAddCoins)) {
    return { success: false, message: '参数错误：增加的金币数超出合理范围' }
  }
  
  try {
    // 使用事务保证原子性
    const transaction = await db.startTransaction()
    
    try {
      // 查询用户数据
      const result = await transaction.collection('user_profile')
        .where({ openid })
        .get()
      
      if (result.data.length === 0) {
        // 创建新用户
        await transaction.collection('user_profile').add({
          data: {
            openid,
            nickname: nickname || `玩家${openid.substring(0, 6)}`,
            avatarUrl: avatarUrl || '',
            highestWave: highestWave || 0,
            highestScore: highestScore || 0,
            coins: (coins || 0) + (addCoins || 0),
            gems: (gems || 0) + (addGems || 0),
            lastUpdateTime: Date.now()
          }
        })
      } else {
        const userData = result.data[0]
        
        const updateData = {
          lastUpdateTime: Date.now()
        }
        
        // 最高关卡取最大值
        if (highestWave !== undefined) {
          updateData.highestWave = Math.max(userData.highestWave, highestWave)
        }
        
        // 最高分取最大值
        if (highestScore !== undefined) {
          updateData.highestScore = Math.max(userData.highestScore, highestScore)
        }
        
        // 金币处理
        if (coins !== undefined) {
          updateData.coins = Math.max(userData.coins, coins)
        }
        if (addCoins !== undefined) {
          updateData.coins = (updateData.coins || userData.coins) + addCoins
        }
        
        // 宝石处理
        if (gems !== undefined) {
          updateData.gems = Math.max(userData.gems, gems)
        }
        if (addGems !== undefined) {
          updateData.gems = (updateData.gems || userData.gems) + addGems
        }
        
        // 更新用户信息
        if (nickname !== undefined) {
          updateData.nickname = nickname
        }
        if (avatarUrl !== undefined) {
          updateData.avatarUrl = avatarUrl
        }
        
        await transaction.collection('user_profile')
          .where({ openid })
          .update({ data: updateData })
      }
      
      // 提交事务
      await transaction.commit()
      
      // 返回最新数据
      const finalResult = await db.collection('user_profile')
        .where({ openid })
        .get()
      
      return {
        success: true,
        message: '更新成功',
        data: finalResult.data[0],
        cloudAvailable: true
      }
      
    } catch (err) {
      await transaction.abort()
      throw err
    }
    
  } catch (err) {
    console.error('更新游戏数据失败:', err)
    return {
      success: false,
      message: '更新失败：' + err.message,
      cloudAvailable: false
    }
  }
}

/**
 * 获取签到状态
 */
async function handleCheckinStatus(openid) {
  const today = getTodayString()
  
  const result = await db.collection('user_signin')
    .where({ openid })
    .get()
  
  if (result.data.length === 0) {
    return {
      success: true,
      message: '获取成功',
      data: {
        isTodayChecked: false,
        checkinStreak: 0,
        todayReward: getDayReward(1),
        cloudAvailable: true
      }
    }
  }
  
  const userData = result.data[0]
  const isTodayChecked = userData.lastCheckinDate === today
  
  return {
    success: true,
    message: '获取成功',
    data: {
      isTodayChecked,
      lastCheckinDate: userData.lastCheckinDate,
      checkinStreak: userData.checkinStreak,
      todayReward: getDayReward(userData.checkinStreak + 1),
      cloudAvailable: true
    }
  }
}

/**
 * 执行签到
 */
async function handleDoCheckin(openid) {
  const today = getTodayString()
  const yesterday = getYesterdayString()
  
  const transaction = await db.startTransaction()
  
  try {
    const result = await transaction.collection('user_signin')
      .where({ openid })
      .get()
    
    let newStreak
    let reward
    
    if (result.data.length === 0) {
      newStreak = 1
      reward = getDayReward(newStreak)
      
      await transaction.collection('user_signin').add({
        data: {
          openid,
          lastCheckinDate: today,
          checkinStreak: newStreak,
          totalCheckinDays: 1,
          lastUpdateTime: Date.now()
        }
      })
    } else {
      const userData = result.data[0]
      
      if (userData.lastCheckinDate === today) {
        await transaction.abort()
        return {
          success: false,
          message: '今天已经签到过了',
          data: {
            isTodayChecked: true,
            lastCheckinDate: today,
            checkinStreak: userData.checkinStreak
          },
          cloudAvailable: true
        }
      }
      
      if (userData.lastCheckinDate === yesterday) {
        newStreak = userData.checkinStreak + 1
      } else {
        newStreak = 1
      }
      
      reward = getDayReward(newStreak)
      
      await transaction.collection('user_signin')
        .where({ openid })
        .update({
          data: {
            lastCheckinDate: today,
            checkinStreak: newStreak,
            totalCheckinDays: _.inc(1),
            lastUpdateTime: Date.now()
          }
        })
    }
    
    // 发放奖励
    await addReward(transaction, openid, reward)
    
    await transaction.commit()
    
    return {
      success: true,
      message: '签到成功',
      data: {
        reward,
        checkinStreak: newStreak,
        isTodayChecked: true
      },
      cloudAvailable: true
    }
    
  } catch (err) {
    await transaction.abort()
    throw err
  }
}

/**
 * 签到并领取奖励（合并操作，减少云函数调用次数）
 * 一次性完成：检查状态 + 执行签到 + 返回奖励
 */
async function handleCheckinAndReward(openid) {
  const today = getTodayString()
  const yesterday = getYesterdayString()
  
  const transaction = await db.startTransaction()
  
  try {
    // 查询签到数据
    const signinResult = await transaction.collection('user_signin')
      .where({ openid })
      .get()
    
    let newStreak
    let reward
    
    if (signinResult.data.length === 0) {
      // 首次签到
      newStreak = 1
      reward = getDayReward(newStreak)
      
      await transaction.collection('user_signin').add({
        data: {
          openid,
          lastCheckinDate: today,
          checkinStreak: newStreak,
          totalCheckinDays: 1,
          lastUpdateTime: Date.now()
        }
      })
    } else {
      const signinData = signinResult.data[0]
      
      // 今天已签到
      if (signinData.lastCheckinDate === today) {
        await transaction.abort()
        return {
          success: false,
          message: '今天已经签到过了',
          data: {
            isTodayChecked: true,
            lastCheckinDate: today,
            checkinStreak: signinData.checkinStreak,
            todayReward: getDayReward(signinData.checkinStreak + 1)
          },
          cloudAvailable: true
        }
      }
      
      // 计算连续签到天数
      if (signinData.lastCheckinDate === yesterday) {
        newStreak = signinData.checkinStreak + 1
      } else {
        newStreak = 1
      }
      
      reward = getDayReward(newStreak)
      
      // 更新签到数据
      await transaction.collection('user_signin')
        .where({ openid })
        .update({
          data: {
            lastCheckinDate: today,
            checkinStreak: newStreak,
            totalCheckinDays: _.inc(1),
            lastUpdateTime: Date.now()
          }
        })
    }
    
    // 发放奖励
    await addReward(transaction, openid, reward)
    
    await transaction.commit()
    
    return {
      success: true,
      message: '签到成功',
      data: {
        reward,
        checkinStreak: newStreak,
        isTodayChecked: true,
        cloudAvailable: true
      }
    }
    
  } catch (err) {
    await transaction.abort()
    throw err
  }
}

/**
 * 发放奖励（事务内调用）
 */
async function addReward(transaction, openid, reward) {
  const userResult = await transaction.collection('user_profile')
    .where({ openid })
    .get()
  
  if (userResult.data.length === 0) {
    await transaction.collection('user_profile').add({
      data: {
        openid,
        highestWave: 0,
        highestScore: 0,
        coins: reward.amount,
        gems: 0,
        lastUpdateTime: Date.now()
      }
    })
  } else {
    await transaction.collection('user_profile')
      .where({ openid })
      .update({ data: { coins: _.inc(reward.amount) } })
  }
}

/**
 * 获取当前日期字符串（YYYY-MM-DD 格式）
 */
function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取昨天的日期字符串（YYYY-MM-DD 格式）
 */
function getYesterdayString() {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  const year = yesterday.getFullYear()
  const month = String(yesterday.getMonth() + 1).padStart(2, '0')
  const day = String(yesterday.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取当前赛季周期信息
 */
function getSeasonCycle(now = new Date()) {
  const day = now.getDay(); // 0=周日, 1=周一, ..., 5=周五, 6=周六
  
  // 计算距离下周六 00:00 的天数
  let daysToNextSat = 6 - day;
  if (daysToNextSat <= 0) daysToNextSat += 7;
  
  // 赛季结束时间：下周六 00:00
  const seasonEnd = new Date(now);
  seasonEnd.setDate(seasonEnd.getDate() + daysToNextSat);
  seasonEnd.setHours(0, 0, 0, 0);
  
  // 赛季开始时间：本周五 24:00（即上周六 00:00）
  const seasonStart = new Date(seasonEnd);
  seasonStart.setDate(seasonStart.getDate() - 7);
  
  // 生成赛季编号（基于赛季开始日期计算第几周）
  const year = seasonStart.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((seasonStart - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  const seasonId = `${year}-S${String(weekNum).padStart(2, '0')}`;
  
  return { seasonId, seasonStart, seasonEnd };
}

/**
 * 处理赛季数据更新
 */
async function handleUpdateSeasonData(openid, event) {
  const { seasonScore, seasonWave, totalClears, bestStreak } = event
  
  try {
    // 获取当前赛季周期
    const { seasonId } = getSeasonCycle(new Date())
    
    // 查询用户赛季数据
    const result = await db.collection('season_data')
      .where({ 
        openid,
        seasonId: seasonId
      })
      .get()
    
    if (result.data.length === 0) {
      // 创建新赛季数据
      await db.collection('season_data').add({
        data: {
          openid,
          seasonId: seasonId,
          seasonScore: seasonScore || 0,
          seasonWave: seasonWave || 0,
          totalGames: 1,
          totalClears: totalClears || 0,
          bestStreak: bestStreak || 0,
          lastUpdateTime: Date.now(),
          settled: false,
          rank: 0,
          rewardCoins: 0
        }
      })
    } else {
      const userData = result.data[0]
      
      // 更新赛季数据（取最大值）
      const updateData = {
        lastUpdateTime: Date.now(),
        totalGames: (userData.totalGames || 0) + 1
      }
      
      if (seasonScore !== undefined) {
        updateData.seasonScore = Math.max(userData.seasonScore, seasonScore)
      }
      if (seasonWave !== undefined) {
        updateData.seasonWave = Math.max(userData.seasonWave, seasonWave)
      }
      if (totalClears !== undefined) {
        updateData.totalClears = (userData.totalClears || 0) + totalClears
      }
      if (bestStreak !== undefined) {
        updateData.bestStreak = Math.max(userData.bestStreak, bestStreak)
      }
      
      await db.collection('season_data')
        .where({ 
          openid,
          seasonId: seasonId
        })
        .update({ data: updateData })
    }
    
    return {
      success: true,
      message: '赛季数据更新成功',
      seasonId: seasonId
    }
    
  } catch (err) {
    console.error('更新赛季数据失败:', err)
    return {
      success: false,
      message: '更新赛季数据失败：' + err.message
    }
  }
}
