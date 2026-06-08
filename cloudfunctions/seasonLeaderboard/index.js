/**
 * 赛季排行榜云函数
 * 功能：获取当前赛季排行榜数据（最高分/最高关卡）
 * 赛季周期：周六 00:00 ~ 次周五 24:00
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_RANK_DISPLAY = 100  // 超过 100 名显示 "100+"
const TOP_COUNT = 6  // 展示前几名

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
    
    // 获取当前赛季前 N 名
    const topResult = await db.collection('season_data')
      .where({ seasonId: seasonId })
      .orderBy(rankField, 'desc')
      .orderBy('lastUpdateTime', 'desc')
      .limit(TOP_COUNT)
      .get()
    
    // 获取当前用户赛季数据
    const userResult = await db.collection('season_data')
      .where({ 
        openid,
        seasonId: seasonId
      })
      .get()
    
    let userData = null
    let userRank = null
    
    if (userResult.data.length > 0) {
      userData = userResult.data[0]
      
      // 计算用户排名
      const rankResult = await db.collection('season_data')
        .where({ 
          seasonId: seasonId,
          [rankField]: _.gt(userData[rankField])
        })
        .count()
      
      userRank = rankResult.total + 1
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
    if (!isInTop && userRank !== null && userRank <= MAX_RANK_DISPLAY) {
      leaderboardList.push({
        rank: userRank,
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
        seasonId: seasonId,
        seasonStartTime: seasonStart.getTime(),
        seasonEndTime: seasonEnd.getTime(),
        leaderboard: leaderboardList,
        userRank: userRank,
        userValue: userData[rankField] || 0,
        userStats: {
          totalGames: userData.totalGames || 0,
          totalClears: userData.totalClears || 0,
          bestStreak: userData.bestStreak || 0
        }
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
