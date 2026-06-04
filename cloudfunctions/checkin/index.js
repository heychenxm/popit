/**
 * 签到云函数
 * 功能：处理签到逻辑，严格验证，云端不可用时禁止签到
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 签到奖励配置（新规则：纯金币模式）
// 第 1 天：300，第 2 天：500，第 3-6 天：1000，第 7 天：3000（1000+2000 额外）
// 第 8 天起：每天 1000，7 的倍数天：3000（1000+2000）
function getDayReward(day) {
  // 基础奖励
  let baseReward = 1000  // 第 3 天起基础奖励 1000
  if (day === 1) {
    baseReward = 300
  } else if (day === 2) {
    baseReward = 500
  }
  
  // 7 的倍数天额外奖励 2000
  const bonusReward = (day % 7 === 0) ? 2000 : 0
  
  return {
    type: 'coin',
    amount: baseReward + bonusReward,
    baseReward: baseReward,
    bonusReward: bonusReward,
    isBonusDay: bonusReward > 0
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    if (event.action === 'getStatus') {
      return await getCheckinStatus(openid)
    } else if (event.action === 'checkin') {
      return await doCheckin(openid)
    } else {
      return {
        success: false,
        message: '未知操作'
      }
    }
  } catch (err) {
    console.error('签到处理失败:', err)
    return {
      success: false,
      message: '服务器错误：' + err.message,
      cloudAvailable: false
    }
  }
}

/**
 * 获取签到状态
 */
async function getCheckinStatus(openid) {
  const today = new Date().toDateString()
  
  const result = await db.collection('user_signin')
    .where({ openid })
    .get()
  
  if (result.data.length === 0) {
    // 新用户
    return {
      success: true,
      message: '获取成功',
      data: {
        isTodayChecked: false,
        checkinStreak: 0,
        todayReward: getDayReward(1),
        cloudAvailable: true
      }
    }
  }
  
  const userData = result.data[0]
  const isTodayChecked = userData.lastCheckinDate === today
  
  return {
    success: true,
    message: '获取成功',
    data: {
      isTodayChecked,
      lastCheckinDate: userData.lastCheckinDate,
      checkinStreak: userData.checkinStreak,
      todayReward: getDayReward(userData.checkinStreak + 1),
      cloudAvailable: true
    }
  }
}

/**
 * 执行签到
 */
async function doCheckin(openid) {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  
  // 使用事务保证原子性
  const transaction = await db.startTransaction()
  
  try {
    // 查询用户签到数据
    const result = await transaction.collection('user_signin')
      .where({ openid })
      .get()
    
    let newStreak
    let reward
    
    if (result.data.length === 0) {
      // 新用户签到
      newStreak = 1
      reward = getDayReward(newStreak)
      
      await transaction.collection('user_signin').add({
        data: {
          openid,
          lastCheckinDate: today,
          checkinStreak: newStreak,
          totalCheckinDays: 1,
          lastUpdateTime: Date.now()
        }
      })
    } else {
      const userData = result.data[0]
      
      // 检查今天是否已签到
      if (userData.lastCheckinDate === today) {
        await transaction.abort()
        return {
          success: false,
          message: '今天已经签到过了',
          data: {
            isTodayChecked: true,
            lastCheckinDate: today,
            checkinStreak: userData.checkinStreak
          },
          cloudAvailable: true
        }
      }
      
      // 计算连续签到天数
      if (userData.lastCheckinDate === yesterday) {
        newStreak = userData.checkinStreak + 1
      } else {
        newStreak = 1 // 中断后重新计算
      }
      
      reward = getDayReward(newStreak)
      
      // 更新签到数据
      await transaction.collection('user_signin')
        .where({ openid })
        .update({
          data: {
            lastCheckinDate: today,
            checkinStreak: newStreak,
            totalCheckinDays: _.inc(1),
            lastUpdateTime: Date.now()
          }
        })
    }
    
    // 发放奖励（更新用户金币/宝石）
    await addReward(transaction, openid, reward)
    
    // 提交事务
    await transaction.commit()
    
    return {
      success: true,
      message: '签到成功',
      data: {
        reward,
        checkinStreak: newStreak,
        isTodayChecked: true
      },
      cloudAvailable: true
    }
    
  } catch (err) {
    // 事务回滚
    await transaction.abort()
    throw err
  }
}

/**
 * 发放奖励（事务内调用，纯金币模式）
 */
async function addReward(transaction, openid, reward) {
  const userResult = await transaction.collection('user_profile')
    .where({ openid })
    .get()
  
  if (userResult.data.length === 0) {
    // 创建新用户
    await transaction.collection('user_profile').add({
      data: {
        openid,
        highestWave: 0,
        highestScore: 0,
        coins: reward.amount,
        gems: 0,
        lastUpdateTime: Date.now()
      }
    })
  } else {
    // 更新现有用户
    const updateData = {
      coins: _.inc(reward.amount)
    }
    
    await transaction.collection('user_profile')
      .where({ openid })
      .update({ data: updateData })
  }
}
