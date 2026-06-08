/**
 * 赛季结算云函数
 * 功能：每周自动结算赛季排名并发放奖励
 * 触发方式：云函数定时触发器（每周六 00:05）
 * 赛季周期：周六 00:00 ~ 次周五 24:00
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
 * 计算下一个赛季编号
 */
function getNextSeasonId(currentSeasonId) {
  const match = currentSeasonId.match(/^(\d+)-S(\d+)$/);
  if (!match) return currentSeasonId;
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  const nextWeek = week + 1;
  
  if (nextWeek > 52) {
    return `${year + 1}-S01`;
  }
  return `${year}-S${String(nextWeek).padStart(2, '0')}`;
}

exports.main = async (event, context) => {
  try {
    // 获取当前赛季周期（此时已是周六，getSeasonCycle 会返回新赛季的信息）
    const newCycle = getSeasonCycle(new Date());
    const newSeasonId = newCycle.seasonId;
    
    // 计算上一赛季的结束时间（即当前赛季的开始时间）
    const oldSeasonEnd = newCycle.seasonStart;
    const oldSeasonStart = new Date(oldSeasonEnd);
    oldSeasonStart.setDate(oldSeasonStart.getDate() - 7);
    
    // 计算上一赛季的编号
    const year = oldSeasonStart.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const weekNum = Math.ceil(((oldSeasonStart - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    const oldSeasonId = `${year}-S${String(weekNum).padStart(2, '0')}`;
    
    console.log(`开始结算赛季 ${oldSeasonId}，创建新赛季 ${newSeasonId}`);
    
    // 获取上一赛季所有玩家数据
    const allPlayers = await db.collection('season_data')
      .where({ 
        seasonId: oldSeasonId,
        settled: false
      })
      .orderBy('seasonScore', 'desc')
      .orderBy('seasonWave', 'desc')
      .limit(1000)  // 最多处理 1000 名玩家
      .get()
    
    const players = allPlayers.data
    
    if (players.length === 0) {
      console.log(`赛季 ${oldSeasonId} 无待结算数据`);
      return {
        success: true,
        message: `赛季 ${oldSeasonId} 无待结算数据`,
        data: {
          settledSeason: oldSeasonId,
          newSeason: newSeasonId,
          totalPlayers: 0
        }
      };
    }
    
    // 奖励档位配置（只给前 6 名奖励）
    const rewardTiers = [
      { rankStart: 1, rankEnd: 1, reward: 5000, title: "🥇 赛季冠军" },
      { rankStart: 2, rankEnd: 2, reward: 3000, title: "🥈 赛季亚军" },
      { rankStart: 3, rankEnd: 3, reward: 2000, title: "🥉 赛季季军" },
      { rankStart: 4, rankEnd: 4, reward: 500, title: "💎 精英玩家" },
      { rankStart: 5, rankEnd: 5, reward: 500, title: "⭐ 优秀玩家" },
      { rankStart: 6, rankEnd: 6, reward: 500, title: "🎮 参与奖" }
    ];
    
    // 计算排名并发放奖励
    let settlementResults = [];
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const rank = i + 1;
      
      // 确定奖励档位
      let rewardCoins = 0;
      let title = '';
      
      for (const tier of rewardTiers) {
        if (rank >= tier.rankStart && rank <= tier.rankEnd) {
          rewardCoins = tier.reward;
          title = tier.title;
          break;
        }
      }
      
      // 更新赛季数据
      await db.collection('season_data')
        .doc(player._id)
        .update({
          data: {
            rank,
            rewardCoins,
            settled: true,
            settlementTime: Date.now()
          }
        });
      
      // 发放奖励金币到 user_profile
      if (rewardCoins > 0) {
        await db.collection('user_profile')
          .where({ openid: player.openid })
          .update({
            data: {
              coins: _.inc(rewardCoins),
              seasonReward: (player.seasonReward || 0) + rewardCoins,
              seasonTitle: title,
              lastUpdateTime: Date.now()
            }
          });
      }
      
      settlementResults.push({
        openid: player.openid,
        rank,
        rewardCoins,
        title
      });
    }
    
    console.log(`赛季 ${oldSeasonId} 结算完成，共 ${players.length} 名玩家参与`);
    
    // 创建新赛季配置（如果不存在）
    const configResult = await db.collection('season_config')
      .doc('config')
      .get();
    
    if (configResult.data) {
      // 更新配置
      await db.collection('season_config').doc('config').update({
        data: {
          currentSeasonId: newSeasonId,
          seasonStartTime: newCycle.seasonStart.getTime(),
          seasonEndTime: newCycle.seasonEnd.getTime(),
          lastSettlementTime: Date.now(),
          lastSettlementSeason: oldSeasonId,
          version: (configResult.data.version || 1) + 1
        }
      });
    } else {
      // 创建新配置
      await db.collection('season_config').add({
        data: {
          _id: 'config',
          currentSeasonId: newSeasonId,
          seasonStartTime: newCycle.seasonStart.getTime(),
          seasonEndTime: newCycle.seasonEnd.getTime(),
          lastSettlementTime: Date.now(),
          lastSettlementSeason: oldSeasonId,
          version: 1
        }
      });
    }
    
    return {
      success: true,
      message: `赛季 ${oldSeasonId} 结算完成`,
      data: {
        settledSeason: oldSeasonId,
        newSeason: newSeasonId,
        totalPlayers: players.length,
        settlementResults: settlementResults.slice(0, 10)  // 只返回前 10 名
      }
    };
    
  } catch (err) {
    console.error('赛季结算失败:', err);
    return {
      success: false,
      message: '赛季结算失败：' + err.message
    };
  }
};
