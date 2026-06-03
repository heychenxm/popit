/**
 * 更新游戏数据云函数
 * 功能：更新最高关卡、最高分、金币等数据，采用"最大值优先"原则
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    const { 
      highestWave, 
      highestScore, 
      coins, 
      gems,
      addCoins,    // 增加金币（相对值）
      addGems      // 增加宝石（相对值）
    } = event
    
    // 使用事务保证原子性
    const transaction = await db.startTransaction()
    
    try {
      // 查询用户数据
      const result = await transaction.collection('user_profile')
        .where({ openid })
        .get()
      
      if (result.data.length === 0) {
        // 创建新用户
        await transaction.collection('user_profile').add({
          data: {
            openid,
            highestWave: highestWave || 0,
            highestScore: highestScore || 0,
            coins: (coins || 0) + (addCoins || 0),
            gems: (gems || 0) + (addGems || 0),
            lastUpdateTime: Date.now()
          }
        })
      } else {
        const userData = result.data[0]
        
        // 采用"最大值优先"原则
        const updateData = {
          lastUpdateTime: Date.now()
        }
        
        // 最高关卡取最大值
        if (highestWave !== undefined) {
          updateData.highestWave = Math.max(userData.highestWave, highestWave)
        }
        
        // 最高分取最大值
        if (highestScore !== undefined) {
          updateData.highestScore = Math.max(userData.highestScore, highestScore)
        }
        
        // 金币取最大值或累加
        if (coins !== undefined) {
          updateData.coins = Math.max(userData.coins, coins)
        }
        if (addCoins !== undefined) {
          updateData.coins = _.inc(addCoins)
        }
        
        // 宝石取最大值或累加
        if (gems !== undefined) {
          updateData.gems = Math.max(userData.gems, gems)
        }
        if (addGems !== undefined) {
          updateData.gems = _.inc(addGems)
        }
        
        // 更新数据
        await transaction.collection('user_profile')
          .where({ openid })
          .update({ data: updateData })
      }
      
      // 提交事务
      await transaction.commit()
      
      // 返回最新数据
      const finalResult = await db.collection('user_profile')
        .where({ openid })
        .get()
      
      return {
        success: true,
        message: '更新成功',
        data: finalResult.data[0],
        cloudAvailable: true
      }
      
    } catch (err) {
      // 事务回滚
      await transaction.abort()
      throw err
    }
    
  } catch (err) {
    console.error('更新游戏数据失败:', err)
    return {
      success: false,
      message: '更新失败：' + err.message,
      cloudAvailable: false
    }
  }
}
