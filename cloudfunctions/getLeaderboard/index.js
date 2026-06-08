/**
 * 排行榜云函数（优化版）
 * 功能：获取全服排行榜数据（最高分/最高关卡）
 * 优化：使用聚合管道减少数据库查询次数
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_RANK_DISPLAY = 100  // 超过 100 名显示 "100+"
const TOP_COUNT = 6  // 展示前几名
const FETCH_COUNT = 100  // 获取前 100 名用于计算排名

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    const { type = 'score' } = event  // 'score' 或 'wave'
    
    // 根据类型获取排行榜字段
    const rankField = type === 'wave' ? 'highestWave' : 'highestScore'
    
    // 优化：一次性获取前 100 名排序数据
    const sortedResult = await db.collection('user_profile')
      .orderBy(rankField, 'desc')
      .orderBy('lastUpdateTime', 'desc')
      .limit(FETCH_COUNT)
      .field({
        openid: true,
        nickname: true,
        avatarUrl: true,
        [rankField]: true
      })
      .get()
    
    const allUsers = sortedResult.data || []
    
    // 在内存中构建排行榜列表
    let leaderboardList = []
    let currentUserIndex = -1
    
    // 找到当前用户在排序列表中的位置
    for (let i = 0; i < allUsers.length; i++) {
      if (allUsers[i].openid === openid) {
        currentUserIndex = i
        break
      }
    }
    
    // 构建前 N 名排行榜
    const topUsers = allUsers.slice(0, TOP_COUNT)
    leaderboardList = topUsers.map((user, index) => ({
      rank: index + 1,
      openid: user.openid,
      nickname: user.nickname || `玩家${user.openid.substring(0, 6)}`,
      avatarUrl: user.avatarUrl || (user._id ? user._id.substring(0, 3) : user.openid.substring(0, 3)),
      value: user[rankField] || 0,
      isUser: user.openid === openid
    }))
    
    // 获取用户数据和排名
    let userData = null
    let userRank = null
    let userValue = 0
    
    if (currentUserIndex >= 0) {
      // 用户在前 100 名内
      userData = allUsers[currentUserIndex]
      userRank = currentUserIndex + 1
      userValue = userData[rankField] || 0
      
      // 检查用户是否已在前 N 名中
      const isInTop = currentUserIndex < TOP_COUNT
      if (!isInTop) {
        const displayRank = userRank > MAX_RANK_DISPLAY ? `${MAX_RANK_DISPLAY}+` : userRank
        leaderboardList.push({
          rank: displayRank,
          actualRank: userRank,
          openid: userData.openid,
          nickname: userData.nickname || `玩家${userData.openid.substring(0, 6)}`,
          avatarUrl: userData.avatarUrl || (userData._id ? userData._id.substring(0, 3) : userData.openid.substring(0, 3)),
          value: userValue,
          isUser: true
        })
      }
    } else {
      // 用户不在前 100 名，需要单独查询用户数据
      const userResult = await db.collection('user_profile')
        .where({ openid })
        .field({
          openid: true,
          nickname: true,
          avatarUrl: true,
          [rankField]: true
        })
        .get()
      
      if (userResult.data.length > 0) {
        userData = userResult.data[0]
        userValue = userData[rankField] || 0
        
        // 计算排名：查询比当前用户分数高的人数
        const rankResult = await db.collection('user_profile')
          .where({
            [rankField]: _.gt(userValue)
          })
          .count()
        
        userRank = rankResult.total + 1
        
        const displayRank = userRank > MAX_RANK_DISPLAY ? `${MAX_RANK_DISPLAY}+` : userRank
        leaderboardList.push({
          rank: displayRank,
          actualRank: userRank,
          openid: userData.openid,
          nickname: userData.nickname || `玩家${userData.openid.substring(0, 6)}`,
          avatarUrl: userData.avatarUrl || (userData._id ? userData._id.substring(0, 3) : userData.openid.substring(0, 3)),
          value: userValue,
          isUser: true
        })
      } else {
        // 新用户
        userData = {
          openid,
          highestWave: 0,
          highestScore: 0,
          nickname: `玩家${openid.substring(0, 6)}`,
          avatarUrl: openid.substring(0, 3)
        }
        userRank = 999
        userValue = 0
      }
    }
    
    return {
      success: true,
      data: {
        type,
        leaderboard: leaderboardList,
        userRank: userRank,
        userValue: userValue
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
