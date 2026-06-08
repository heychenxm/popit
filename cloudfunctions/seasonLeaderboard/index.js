/**
 * 赛季排行榜云函数（优化版）
 * 功能：获取当前赛季排行榜数据（最高分/最高关卡）
 * 赛季周期：周六 00:00 ~ 次周五 24:00
 * 优化：使用聚合管道减少数据库查询次数
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_RANK_DISPLAY = 100  // 超过 100 名显示 "100+"
const TOP_COUNT = 6  // 展示前几名
const FETCH_COUNT = 100  // 获取前 100 名用于计算排名

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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    const { type = 'score' } = event  // 'score' 或 'wave'
    const rankField = type === 'wave' ? 'seasonWave' : 'seasonScore'
    
    // 获取当前赛季周期
    const { seasonId, seasonStart, seasonEnd } = getSeasonCycle(new Date())
    
    // 优化：一次性获取当前赛季前 100 名排序数据
    const sortedResult = await db.collection('season_data')
      .where({ seasonId: seasonId })
      .orderBy(rankField, 'desc')
      .orderBy('lastUpdateTime', 'desc')
      .limit(FETCH_COUNT)
      .field({
        openid: true,
        nickname: true,
        avatarUrl: true,
        [rankField]: true,
        totalGames: true,
        totalClears: true,
        bestStreak: true
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
    let userStats = {
      totalGames: 0,
      totalClears: 0,
      bestStreak: 0
    }
    
    if (currentUserIndex >= 0) {
      // 用户在前 100 名内
      userData = allUsers[currentUserIndex]
      userRank = currentUserIndex + 1
      userValue = userData[rankField] || 0
      userStats = {
        totalGames: userData.totalGames || 0,
        totalClears: userData.totalClears || 0,
        bestStreak: userData.bestStreak || 0
      }
      
      // 检查用户是否已在前 N 名中
      const isInTop = currentUserIndex < TOP_COUNT
      if (!isInTop && userRank <= MAX_RANK_DISPLAY) {
        leaderboardList.push({
          rank: userRank,
          openid: userData.openid,
          nickname: userData.nickname || `玩家${userData.openid.substring(0, 6)}`,
          avatarUrl: userData.avatarUrl || (userData._id ? userData._id.substring(0, 3) : userData.openid.substring(0, 3)),
          value: userValue,
          isUser: true
        })
      }
    } else {
      // 用户不在前 100 名，需要单独查询用户数据
      const userResult = await db.collection('season_data')
        .where({ 
          openid,
          seasonId: seasonId
        })
        .field({
          openid: true,
          nickname: true,
          avatarUrl: true,
          [rankField]: true,
          totalGames: true,
          totalClears: true,
          bestStreak: true
        })
        .get()
      
      if (userResult.data.length > 0) {
        userData = userResult.data[0]
        userValue = userData[rankField] || 0
        userStats = {
          totalGames: userData.totalGames || 0,
          totalClears: userData.totalClears || 0,
          bestStreak: userData.bestStreak || 0
        }
        
        // 计算排名：查询比当前用户分数高的人数
        const rankResult = await db.collection('season_data')
          .where({ 
            seasonId: seasonId,
            [rankField]: _.gt(userValue)
          })
          .count()
        
        userRank = rankResult.total + 1
        
        if (userRank <= MAX_RANK_DISPLAY) {
          leaderboardList.push({
            rank: userRank,
            openid: userData.openid,
            nickname: userData.nickname || `玩家${userData.openid.substring(0, 6)}`,
            avatarUrl: userData.avatarUrl || (userData._id ? userData._id.substring(0, 3) : userData.openid.substring(0, 3)),
            value: userValue,
            isUser: true
          })
        }
      } else {
        // 新用户，创建默认数据
        userData = {
          openid,
          seasonId: seasonId,
          seasonScore: 0,
          seasonWave: 0,
          totalGames: 0,
          totalClears: 0,
          bestStreak: 0,
          lastUpdateTime: Date.now(),
          settled: false,
          rank: 0,
          rewardCoins: 0
        }
        userRank = 999
        userValue = 0
      }
    }
    
    return {
      success: true,
      data: {
        type,
        seasonId: seasonId,
        seasonStartTime: seasonStart.getTime(),
        seasonEndTime: seasonEnd.getTime(),
        leaderboard: leaderboardList,
        userRank: userRank,
        userValue: userValue,
        userStats: userStats
      }
    }
    
  } catch (err) {
    console.error('获取赛季排行榜失败:', err)
    return {
      success: false,
      message: '获取赛季排行榜失败，请稍后重试'
    }
  }
}
