const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 加载用户游戏数据
 * 返回云端保存的完整游戏数据
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '无法获取用户标识' }
  }

  try {
    const { data } = await db.collection('gameData')
      .where({ _openid: openid })
      .limit(1)
      .get()

    if (data.length > 0) {
      const record = data[0]
      // 移除不需要的字段
      delete record._id
      delete record._openid
      return { success: true, data: record }
    }

    // 新用户，无云端数据
    return { success: true, data: null }
  } catch (err) {
    console.error('loadGameData error:', err)
    return { success: false, error: err.message }
  }
}
