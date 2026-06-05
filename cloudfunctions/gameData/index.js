/**
 * 游戏数据云函数（合并版）
 * 功能：处理游戏数据的同步和更新，减少云函数数量
 * 
 * 支持的操作：
 * - sync: 同步数据（游戏启动时）
 * - update: 更新数据（通关、分享等）
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
