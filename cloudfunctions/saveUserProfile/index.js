/**
 * 保存用户资料云函数
 * 功能：保存或更新用户的头像和昵称
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  console.log('saveUserProfile 被调用:', {
    openid,
    nickname: event.nickname,
    avatarUrl: event.avatarUrl
  })
  
  try {
    const { nickname, avatarUrl } = event
    
    // 查询用户是否已存在
    const result = await db.collection('user_profile')
      .where({ openid })
      .get()
    
    console.log('查询结果:', result.data.length)
    
    if (result.data.length === 0) {
      // 新用户，创建记录
      const addResult = await db.collection('user_profile').add({
        data: {
          openid,
          nickname: nickname || `玩家${openid.substring(0, 6)}`,
          avatarUrl: avatarUrl || '',
          highestWave: 0,
          highestScore: 0,
          coins: 1000,
          gems: 0,
          lastUpdateTime: Date.now()
        }
      })
      
      console.log('创建成功，ID:', addResult._id)
      
      return {
        success: true,
        message: '用户资料创建成功',
        data: {
          nickname,
          avatarUrl
        }
      }
    } else {
      // 现有用户，更新资料
      const updateResult = await db.collection('user_profile')
        .where({ openid })
        .update({
          data: {
            nickname: nickname || `玩家${openid.substring(0, 6)}`,
            avatarUrl: avatarUrl || '',
            lastUpdateTime: Date.now()
          }
        })
      
      console.log('更新成功，影响行数:', updateResult.stats.updated)
      
      return {
        success: true,
        message: '用户资料更新成功',
        data: {
          nickname,
          avatarUrl
        }
      }
    }
  } catch (err) {
    console.error('保存用户资料失败:', err)
    return {
      success: false,
      message: '服务器错误：' + err.message
    }
  }
}
