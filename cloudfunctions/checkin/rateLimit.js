/**
 * 简易速率限制工具
 * 使用数据库集合 rateLimits 记录用户操作时间戳
 *
 * 使用方式：
 *   const { checkRateLimit } = require('./rateLimit')
 *   const blocked = await checkRateLimit(db, openid, 'save', 3000)
 *   if (blocked) return { success: false, error: '操作过于频繁' }
 */

/**
 * 检查是否在冷却期内
 * @param {object} db - 数据库实例
 * @param {string} openid - 用户 openid
 * @param {string} action - 操作标识（如 'save', 'checkin'）
 * @param {number} cooldownMs - 冷却时间（毫秒）
 * @returns {boolean} true = 被限制，false = 允许
 */
async function checkRateLimit(db, openid, action, cooldownMs) {
  try {
    const { data } = await db.collection('rateLimits')
      .where({ _openid: openid, action })
      .limit(1)
      .get()

    if (data.length > 0) {
      const elapsed = Date.now() - (data[0].lastCall || 0)
      if (elapsed < cooldownMs) {
        return true
      }
    }

    // 更新或创建记录
    await db.collection('rateLimits')
      .where({ _openid: openid, action })
      .update({ data: { lastCall: Date.now() } })

    // update 在记录不存在时不会创建，需要用 add 兜底
    if (data.length === 0) {
      await db.collection('rateLimits').add({
        data: { _openid: openid, action, lastCall: Date.now() }
      })
    }

    return false
  } catch (err) {
    // 集合不存在时自动创建（首次部署）
    if (err.errCode === -502005) {
      console.warn(`rateLimits 集合不存在，跳过速率限制`)
    } else {
      console.warn('速率限制检查失败:', err.message)
    }
    return false // 降级：不阻塞用户
  }
}

module.exports = { checkRateLimit }
