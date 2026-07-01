const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 赛季奖励发放云函数
 * 根据赛季排行榜前 6 名发放金币奖励
 * 幂等设计：已发放的赛季不会重复发放
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { seasonId, scoreLeaderboard, waveLeaderboard } = event

  if (!seasonId) {
    return { success: false, error: '缺少 seasonId 参数' }
  }

  // 奖励档位配置
  const rewardConfig = {
    1: 3000,  // 第 1 名：3000 金币
    2: 2000,  // 第 2 名：2000 金币
    3: 1500,  // 第 3 名：1500 金币
    4: 1000,  // 第 4~6 名：1000 金币
    5: 1000,
    6: 1000
  }

  try {
    // 幂等检查：检查该赛季是否已发放过奖励
    // 通过查询任意玩家的 lastSeasonId 判断
    const { data: checkData } = await db.collection('gameData')
      .where({ lastSeasonId: seasonId })
      .limit(1)
      .get()

    if (checkData.length > 0) {
      console.log(`赛季 ${seasonId} 奖励已发放，跳过`)
      return { success: true, data: { alreadyDistributed: true, seasonId } }
    }

    console.log(`开始发放赛季 ${seasonId} 奖励`)

    // 收集所有获奖玩家及其奖励
    const rewardMap = {}  // openid -> { totalReward, scoreRank, waveRank, scoreReward, waveReward }

    // 处理分数榜前 6 名
    if (scoreLeaderboard && scoreLeaderboard.length > 0) {
      for (const player of scoreLeaderboard) {
        if (player.rank <= 6 && rewardConfig[player.rank]) {
          const reward = rewardConfig[player.rank]
          if (!rewardMap[player.openid]) {
            rewardMap[player.openid] = {
              totalReward: 0,
              scoreRank: 0,
              waveRank: 0,
              scoreReward: 0,
              waveReward: 0
            }
          }
          rewardMap[player.openid].totalReward += reward
          rewardMap[player.openid].scoreRank = player.rank
          rewardMap[player.openid].scoreReward = reward
        }
      }
    }

    // 处理关卡榜前 6 名
    if (waveLeaderboard && waveLeaderboard.length > 0) {
      for (const player of waveLeaderboard) {
        if (player.rank <= 6 && rewardConfig[player.rank]) {
          const reward = rewardConfig[player.rank]
          if (!rewardMap[player.openid]) {
            rewardMap[player.openid] = {
              totalReward: 0,
              scoreRank: 0,
              waveRank: 0,
              scoreReward: 0,
              waveReward: 0
            }
          }
          rewardMap[player.openid].totalReward += reward
          rewardMap[player.openid].waveRank = player.rank
          rewardMap[player.openid].waveReward = reward
        }
      }
    }

    console.log(`获奖玩家数量: ${Object.keys(rewardMap).length}`)

    // 批量发放奖励
    const distributePromises = []
    let totalDistributed = 0

    for (const [playerOpenid, rewardData] of Object.entries(rewardMap)) {
      const promise = (async () => {
        try {
          // 更新 gameData：增加金币 + 记录奖励信息
          await db.collection('gameData')
            .where({ _openid: playerOpenid })
            .update({
              data: {
                coins: _.inc(rewardData.totalReward),
                lastSeasonId: seasonId,
                lastSeasonReward: rewardData.totalReward,
                lastSeasonScoreRank: rewardData.scoreRank,
                lastSeasonWaveRank: rewardData.waveRank,
                lastSeasonRewardDetail: {
                  scoreRank: rewardData.scoreRank,
                  scoreReward: rewardData.scoreReward,
                  waveRank: rewardData.waveRank,
                  waveReward: rewardData.waveReward,
                  totalReward: rewardData.totalReward
                },
                updatedAt: db.serverDate()
              }
            })
          
          totalDistributed += rewardData.totalReward
          console.log(`玩家 ${playerOpenid} 获得 ${rewardData.totalReward} 金币（分数榜第${rewardData.scoreRank}名 +${rewardData.scoreReward}，关卡榜第${rewardData.waveRank}名 +${rewardData.waveReward}）`)
        } catch (err) {
          console.error(`发放玩家 ${playerOpenid} 奖励失败:`, err)
          // 发放失败不影响其他玩家，继续处理
        }
      })()
      distributePromises.push(promise)
    }

    // 并行发放所有奖励
    await Promise.all(distributePromises)

    console.log(`赛季 ${seasonId} 奖励发放完成，总发放: ${totalDistributed} 金币`)

    return {
      success: true,
      data: {
        alreadyDistributed: false,
        seasonId,
        totalDistributed,
        playerCount: Object.keys(rewardMap).length,
        rewardDetails: rewardMap
      }
    }
  } catch (err) {
    console.error('distributeSeasonReward error:', err)
    return { success: false, error: err.message }
  }
}
