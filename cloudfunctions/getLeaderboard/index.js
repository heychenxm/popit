/**
 * 排行榜云函数
 * 功能：获取全服排行榜数据（最高分/最高关卡）
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_RANK_DISPLAY = 100  // 超过 100 名显示 "100+"
const TOP_COUNT = 6  // 展示前几名

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    const { type = 'score' } = event  // 'score' 或 'wave'
    
    // 根据类型获取排行榜字段
    const rankField = type === 'wave' ? 'highestWave' : 'highestScore'
    
    // 获取前 N 名
    const topResult = await db.collection('user_profile')
      .orderBy(rankField, 'desc')
      .orderBy('lastUpdateTime', 'desc')  // 分数相同时按时间排序
      .limit(TOP_COUNT)
      .get()
    
    // 获取当前用户的排名和数据
    const userResult = await db.collection('user_profile')
      .where({ openid })
      .get()
    
    let userData = null
    let userRank = null
    
    if (userResult.data.length > 0) {
      userData = userResult.data[0]
      
      // 计算用户排名（使用聚合查询优化）
      const rankResult = await db.collection('user_profile')
        .where({
          [rankField]: _.gt(userData[rankField])
        })
        .count()
      
      userRank = rankResult.total + 1  // 排名 = 比用户高分的人数 + 1
    } else {
      // 新用户，创建默认数据
      userData = {
        openid,
        highestWave: 0,
        highestScore: 0,
        nickname: `玩家${openid.substring(0, 6)}`,
        avatarUrl: openid.substring(0, 3)
      }
      userRank = 999  // 新用户排名靠后
    }
    
    // 检查用户是否在前 N 名内
    const isInTop = topResult.data.some(user => user.openid === openid)
    
    // 构建排行榜列表
    let leaderboardList = topResult.data.map((user, index) => ({
      rank: index + 1,
      openid: user.openid,
      nickname: user.nickname || `玩家${user.openid.substring(0, 6)}`,
      avatarUrl: user.avatarUrl || (user._id ? user._id.substring(0, 3) : user.openid.substring(0, 3)),
      value: user[rankField] || 0,
      isUser: user.openid === openid
    }))
    
    // 如果用户不在前 N 名，添加用户自己的排名
    if (!isInTop && userRank !== null) {
      const displayRank = userRank > MAX_RANK_DISPLAY ? `${MAX_RANK_DISPLAY}+` : userRank
      
      leaderboardList.push({
        rank: displayRank,
        actualRank: userRank,
        openid: userData.openid,
        nickname: userData.nickname || `玩家${userData.openid.substring(0, 6)}`,
        avatarUrl: userData.avatarUrl || (userData._id ? userData._id.substring(0, 3) : userData.openid.substring(0, 3)),
        value: userData[rankField] || 0,
        isUser: true
      })
    }
    
    return {
      success: true,
      data: {
        type,
        leaderboard: leaderboardList,
        userRank: userRank,
        userValue: userData[rankField] || 0
      }
    }
    
  } catch (err) {
    console.error('获取排行榜失败:', err)
    return {
      success: false,
      message: '获取排行榜失败，请稍后重试'
    }
  }
}
