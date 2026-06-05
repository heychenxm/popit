/**
 * 保存用户资料云函数
 * 功能：保存或更新用户的头像和昵称
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 输入验证常量
const MAX_NICKNAME_LENGTH = 32
const MAX_AVATAR_URL_LENGTH = 500

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  console.log('saveUserProfile 被调用:', {
    openid,
    nickname: event.nickname,
    avatarUrl: event.avatarUrl
  })
  
  try {
    let { nickname, avatarUrl } = event
    
    // 输入验证
    if (nickname !== undefined && nickname !== null) {
      nickname = String(nickname).trim()
      if (nickname.length > MAX_NICKNAME_LENGTH) {
        return {
          success: false,
          message: '昵称长度超出限制'
        }
      }
      // 过滤非法字符（只允许中文、英文、数字、常见符号）
      if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_.]+$/.test(nickname)) {
        return {
          success: false,
          message: '昵称包含非法字符'
        }
      }
    }
    
    if (avatarUrl !== undefined && avatarUrl !== null) {
      avatarUrl = String(avatarUrl).trim()
      if (avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
        return {
          success: false,
          message: '头像 URL 长度超出限制'
        }
      }
    }
    
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
      message: '保存失败，请稍后重试'
    }
  }
}
