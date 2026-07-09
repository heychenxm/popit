/**
 * 好友排行榜数据管理
 * 基于微信云托管数据实现好友排行榜功能
 */

export class FriendLeaderboard {
  constructor(gameState) {
    this.gameState = gameState
    this.isLoading = false
    this.data = null
    this.error = null
    this.lastFetchTime = 0
  }

  /**
   * 同步分数到微信排行榜
   * @param {number} score - 要上报的分数
   * @returns {Promise<boolean>} - 是否上报成功
   */
  async syncScore(score) {
    if (typeof wx === 'undefined' || !wx.setUserCloudStorage) {
      console.warn('当前环境不支持微信排行榜')
      return false
    }

    try {
      await wx.setUserCloudStorage({
        KVDataList: [{
          key: 'score',  // 与 MP 后台配置一致
          value: score.toString()  // 必须是字符串
        }]
      })
      console.log('排行榜分数上报成功:', score)
      return true
    } catch (err) {
      console.error('排行榜分数上报失败:', err)
      return false
    }
  }

  /**
   * 获取好友排行榜数据
   * 通过开放数据域（open data context）调用 wx.getFriendCloudStorage
   * @returns {Promise<Object>} - { success, data, error, message }
   */
  async fetchLeaderboard() {
    // 检查 wx 是否存在
    if (typeof wx === 'undefined') {
      console.warn('wx 未定义，当前不是微信小游戏环境')
      return {
        success: false,
        error: 'not_wechat',
        message: '请在微信小游戏中运行'
      }
    }

    // 检查是否有 getOpenDataContext（开放数据域通信）
    if (typeof wx.getOpenDataContext !== 'function') {
      console.warn('开放数据域 API 不可用，将使用空数据')
      return {
        success: true,
        data: { leaderboard: [] }
      }
    }

    this.isLoading = true
    this.error = null

    try {
      const data = await this._requestFriendDataFromOpenData()
      this.isLoading = false
      this.lastFetchTime = Date.now()

      const leaderboard = this.processLeaderboardData(data)
      this.data = { leaderboard }
      return {
        success: true,
        data: this.data
      }
    } catch (err) {
      this.isLoading = false
      console.error('获取好友排行榜失败:', err)

      const errorMsg = (err.errMsg || err.message || '')
      if (errorMsg.includes('auth') ||
          errorMsg.includes('deny') ||
          errorMsg.includes('authorize') ||
          errorMsg.includes('授权') ||
          errorMsg.includes('WxFriendInteraction')) {
        this.error = 'auth_deny'
        return {
          success: false,
          error: 'auth_deny',
          message: '需要授权才能查看好友排行榜'
        }
      }
      this.error = 'unknown'
      return {
        success: false,
        error: 'unknown',
        message: '获取好友排行榜失败，请稍后再试'
      }
    }
  }

  /**
   * 通过 postMessage 向开放数据域请求好友数据
   * @returns {Promise<Array>} - 微信返回的原始 UserGameData 数组
   */
  _requestFriendDataFromOpenData() {
    return new Promise((resolve, reject) => {
      const openDataContext = wx.getOpenDataContext()

      // 监听开放数据域返回的消息
      const onMessageHandler = (res) => {
        if (res && res.command === 'fetchFriendLeaderboard') {
          wx.offMessage(onMessageHandler)
          if (res.success) {
            resolve(res.data || [])
          } else {
            reject(res.error || new Error('开放数据域返回失败'))
          }
        }
      }
      wx.onMessage(onMessageHandler)

      // 向开放数据域发送请求
      openDataContext.postMessage({
        command: 'fetchFriendLeaderboard',
        keyList: ['score']
      })

      // 超时处理（10秒）
      setTimeout(() => {
        wx.offMessage(onMessageHandler)
        reject(new Error('获取好友数据超时'))
      }, 10000)
    })
  }

  /**
   * 处理排行榜数据
   * @param {Array} data - 微信返回的原始数据
   * @returns {Array} - 处理后的排行榜数据
   */
  processLeaderboardData(data) {
    const currentUserNickname = this.gameState.userInfo.nickname
    
    console.log('原始数据:', data)
    
    // 微信已按 score 降序排列，我们只需要添加排名和标记当前用户
    const leaderboard = data.map((user, index) => {
      console.log('处理用户数据:', user)
      
      // 获取分数：从 KVDataList 中查找 key 为 'score' 的条目
      // wx.getFriendCloudStorage 返回格式：UserGameData.KVDataList = [{ key, value }]
      let score = 0
      if (user.KVDataList && Array.isArray(user.KVDataList)) {
        const scoreItem = user.KVDataList.find(item => item.key === 'score')
        if (scoreItem) {
          score = parseInt(scoreItem.value || '0')
        }
      }
      
      return {
        rank: index + 1,
        nickname: user.nickName || '微信用户',
        avatarUrl: user.avatarUrl,
        score: score,
        isUser: false  // 后续标记
      }
    })

    // 标记当前用户（通过昵称匹配）
    // 注意：微信返回的数据中，自己的数据也在里面
    if (currentUserNickname) {
      const currentUser = leaderboard.find(user => 
        user.nickname === currentUserNickname
      )
      if (currentUser) {
        currentUser.isUser = true
      }
    }

    console.log('处理后的排行榜数据:', leaderboard)
    return leaderboard
  }

  /**
   * 清除缓存数据
   */
  clearData() {
    this.data = null
    this.error = null
  }

  /**
   * 获取排行榜数据（带缓存）
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Object>}
   */
  async getLeaderboard(forceRefresh = false) {
    // 如果有缓存且不是强制刷新，直接返回
    if (this.data && !forceRefresh && Date.now() - this.lastFetchTime < 30000) {
      return {
        success: true,
        data: this.data,
        fromCache: true
      }
    }

    return await this.fetchLeaderboard()
  }
}
