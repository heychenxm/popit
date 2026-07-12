const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 赛季奖励发放云函数
 * - 只从 seasonArchive 读取排行数据，不信任客户端传入榜单
 * - 仅允许内部调用（settleSeason）或定时触发器
 * - 幂等：seasonArchive.rewardsDistributed
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const source = wxContext.SOURCE || ''
  const { seasonId, _internal } = event

  if (!seasonId) {
    return { success: false, error: '缺少 seasonId 参数' }
  }

  const isTrigger = source === 'wx_trigger' || source === 'wx_devops'
  if (!_internal && !isTrigger) {
    return { success: false, error: '无权调用发奖接口' }
  }

  const rewardConfig = {
    1: 3000,
    2: 2000,
    3: 1500,
    4: 1000,
    5: 1000,
    6: 1000
  }

  try {
    const { data: archives } = await db.collection('seasonArchive')
      .where({ seasonId })
      .limit(1)
      .get()

    if (archives.length === 0) {
      return { success: false, error: '赛季尚未结算归档' }
    }

    const archive = archives[0]
    if (archive.rewardsDistributed) {
      return { success: true, data: { alreadyDistributed: true, seasonId } }
    }

    const scoreLeaderboard = archive.topByScore || []
    const waveLeaderboard = archive.topByWave || []

    console.log(`开始发放赛季 ${seasonId} 奖励`)

    const rewardMap = {}

    for (const player of scoreLeaderboard) {
      if (player.openid && player.rank <= 6 && rewardConfig[player.rank]) {
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

    for (const player of waveLeaderboard) {
      if (player.openid && player.rank <= 6 && rewardConfig[player.rank]) {
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

    // 先标记发奖中，降低并发重复发奖概率
    const markRes = await db.collection('seasonArchive')
      .where({ seasonId, rewardsDistributed: _.neq(true) })
      .update({
        data: {
          rewardsDistributed: true,
          rewardsDistributedAt: db.serverDate()
        }
      })

    if (!markRes.stats || markRes.stats.updated === 0) {
      return { success: true, data: { alreadyDistributed: true, seasonId } }
    }

    const distributePromises = []
    let totalDistributed = 0

    for (const [playerOpenid, rewardData] of Object.entries(rewardMap)) {
      const promise = (async () => {
        try {
          // 按人幂等：已有同赛季奖励记录则跳过
          const { data: existingReward } = await db.collection('gameData')
            .where({
              _openid: playerOpenid,
              lastSeasonId: seasonId,
              lastSeasonReward: _.gt(0)
            })
            .limit(1)
            .get()

          if (existingReward.length > 0) {
            console.log(`玩家 ${playerOpenid} 已领取赛季 ${seasonId} 奖励，跳过`)
            return
          }

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
          console.log(`玩家 ${playerOpenid} 获得 ${rewardData.totalReward} 金币`)
        } catch (err) {
          console.error(`发放玩家 ${playerOpenid} 奖励失败:`, err)
        }
      })()
      distributePromises.push(promise)
    }

    await Promise.all(distributePromises)

    console.log(`赛季 ${seasonId} 奖励发放完成，总发放: ${totalDistributed} 金币`)

    return {
      success: true,
      data: {
        alreadyDistributed: false,
        seasonId,
        totalDistributed,
        playerCount: Object.keys(rewardMap).length
      }
    }
  } catch (err) {
    console.error('distributeSeasonReward error:', err)
    return { success: false, error: err.message }
  }
}
