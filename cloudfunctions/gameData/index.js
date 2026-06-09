// cloudfunctions/gameData/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { action } = event
  
  switch (action) {
    case 'sync':
      return await handleSync(openid, event)
    case 'get':
      return await handleGet(openid, event)
    default:
      return { success: false, message: '未知操作' }
  }
}

/**
 * 同步数据到云端
 */
async function handleSync(openid, event) {
  try {
    const { 
      coins, 
      highScore, 
      bestWave, 
      lastCheckinDate, 
      checkinStreak, 
      achievedCheckin,
      lastShareGiftDate,
      totalShareGifts,
      nickname,
      avatarUrl
    } = event
    
    // 检查是否已存在记录
    const result = await db.collection('user_profile')
      .where({ openid })
      .get()
    
    const updateData = {
      coins: coins || 0,
      highScore: highScore || 0,
      bestWave: bestWave || 0,
      lastCheckinDate: lastCheckinDate || '',
      checkinStreak: checkinStreak || 0,
      achievedCheckin: achievedCheckin || 0,
      lastShareGiftDate: lastShareGiftDate || '',
      totalShareGifts: totalShareGifts || 0,
      nickname: nickname || '',
      avatarUrl: avatarUrl || '',
      lastUpdateTime: Date.now()
    }
    
    if (result.data.length > 0) {
      // 更新记录
      await db.collection('user_profile')
        .where({ openid })
        .update({
          data: updateData
        })
    } else {
      // 创建记录
      await db.collection('user_profile').add({
        data: {
          openid,
          ...updateData
        }
      })
    }
    
    return { 
      success: true, 
      message: '同步成功',
      data: updateData
    }
  } catch (err) {
    console.error('同步数据失败:', err)
    return { success: false, message: err.message }
  }
}

/**
 * 从云端获取数据
 */
async function handleGet(openid, event) {
  try {
    const result = await db.collection('user_profile')
      .where({ openid })
      .get()
    
    if (result.data.length > 0) {
      const userData = result.data[0]
      return {
        success: true,
        data: {
          coins: userData.coins || 0,
          highScore: userData.highScore || 0,
          bestWave: userData.bestWave || 0,
          lastCheckinDate: userData.lastCheckinDate || '',
          checkinStreak: userData.checkinStreak || 0,
          achievedCheckin: userData.achievedCheckin || 0,
          lastShareGiftDate: userData.lastShareGiftDate || '',
          totalShareGifts: userData.totalShareGifts || 0,
          nickname: userData.nickname || '',
          avatarUrl: userData.avatarUrl || ''
        }
      }
    } else {
      return {
        success: true,
        data: null
      }
    }
  } catch (err) {
    console.error('获取数据失败:', err)
    return { success: false, message: err.message }
  }
}
