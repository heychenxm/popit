const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { checkRateLimit } = require('./rateLimit')

// 签到奖励配置（与客户端 config.js 保持一致）
const CHECKIN_REWARDS = {
  1: 300,
  2: 500,
}
const DEFAULT_BASE = 500
const BONUS_DAY = 7
const BONUS_AMOUNT = 1000  // 与 config.checkin.bonusAmount 一致

/**
 * 服务端签到
 * 在服务端校验日期、计算连续天数、发放奖励，防止本地篡改
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '无法获取用户标识' }
  }

  // 速率限制：5 秒内不允许重复签到
  const blocked = await checkRateLimit(db, openid, 'checkin', 5000)
  if (blocked) {
    return { success: false, error: '操作过于频繁，请稍后再试' }
  }

  // 是否通过广告签到
  const isAd = event.isAd === true

  // 获取今天的日期字符串 YYYY-MM-DD（东八区）
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)

  try {
    // 读取用户数据
    const { data } = await db.collection('gameData')
      .where({ _openid: openid })
      .limit(1)
      .get()

    let userData = data.length > 0 ? data[0] : {}
    const lastCheckinDate = userData.lastCheckinDate || ''
    let checkinStreak = userData.checkinStreak || 0
    let coins = typeof userData.coins === 'number' ? userData.coins : 1000
    const lastCheckinType = userData.lastCheckinType || ''

    // 检查今天是否已签到
    if (lastCheckinDate === today) {
      // 今天已普通签到，允许广告签到（翻倍奖励）
      if (isAd && lastCheckinType !== 'ad') {
        const baseReward = CHECKIN_REWARDS[checkinStreak] || DEFAULT_BASE
        const bonusReward = (checkinStreak % BONUS_DAY === 0) ? BONUS_AMOUNT : 0
        const rewardAmount = baseReward + bonusReward

        coins += rewardAmount

        const updateData = {
          lastCheckinType: 'ad',
          coins: coins,
          updatedAt: db.serverDate()
        }

        await db.collection('gameData')
          .where({ _openid: openid })
          .update({ data: updateData })

        return {
          success: true,
          data: {
            coins: coins,
            checkinStreak: checkinStreak,
            lastCheckinDate: today,
            lastCheckinType: 'ad',
            reward: {
              amount: rewardAmount,
              baseReward: baseReward,
              bonusReward: bonusReward,
              isBonusDay: bonusReward > 0,
              isAdDouble: true
            }
          }
        }
      }
      return { success: false, error: '今天已签到' }
    }

    // 计算连续签到天数
    if (lastCheckinDate === yesterday) {
      checkinStreak++
    } else {
      checkinStreak = 1
    }

    // 计算签到奖励
    const baseReward = CHECKIN_REWARDS[checkinStreak] || DEFAULT_BASE
    const bonusReward = (checkinStreak % BONUS_DAY === 0) ? BONUS_AMOUNT : 0
    const rewardAmount = baseReward + bonusReward

    // 更新金币
    coins += rewardAmount

    // 写入数据库
    const updateData = {
      lastCheckinDate: today,
      checkinStreak: checkinStreak,
      coins: coins,
      lastCheckinType: isAd ? 'ad' : 'normal',
      updatedAt: db.serverDate()
    }

    if (data.length > 0) {
      await db.collection('gameData')
        .where({ _openid: openid })
        .update({ data: updateData })
    } else {
      updateData._openid = openid
      await db.collection('gameData').add({ data: updateData })
    }

    return {
      success: true,
      data: {
        coins: coins,
        checkinStreak: checkinStreak,
        lastCheckinDate: today,
        lastCheckinType: isAd ? 'ad' : 'normal',
        reward: {
          amount: rewardAmount,
          baseReward: baseReward,
          bonusReward: bonusReward,
          isBonusDay: bonusReward > 0,
          isAdDouble: false
        }
      }
    }
  } catch (err) {
    console.error('checkin error:', err)
    return { success: false, error: err.message }
  }
}
