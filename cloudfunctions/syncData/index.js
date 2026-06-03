/**
 * 数据同步云函数
 * 功能：本地与云端数据同步，采用"最大值优先"原则
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 获取本地数据
    const { highestWave, highestScore, coins, gems } = event
    
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
      userData = userResult.data[0]
      
      // 采用"最大值优先"原则同步数据
      const updateData = {
        highestWave: Math.max(userData.highestWave, highestWave || 0),
        highestScore: Math.max(userData.highestScore, highestScore || 0),
        coins: Math.max(userData.coins, coins || 0),
        gems: Math.max(userData.gems, gems || 0),
        lastUpdateTime: Date.now()
      }
      
      // 更新云端数据
      await db.collection('user_profile')
        .where({ openid })
        .update({ data: updateData })
      
      userData = { ...userData, ...updateData }
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
      message: '同步失败：' + err.message,
      error: err
    }
  }
}
