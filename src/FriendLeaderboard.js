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
   * @returns {Promise<Object>} - { success, data, error, message }
   */
  async fetchLeaderboard() {
    console.log("wx.getFriendCloudStorage ---->", wx.getFriendCloudStorage)
    // 检查 wx 是否存在
    if (typeof wx === 'undefined') {
      console.warn('wx 未定义，当前不是微信小游戏环境')
      return {
        success: false,
        error: 'not_wechat',
        message: '请在微信小游戏中运行'
      }
    }

    // 检查是否有 getFriendCloudStorage 或 getUserCloudStorage
    const hasGetFriendCloudStorage = typeof wx.getFriendCloudStorage === 'function'
    const hasGetUserCloudStorage = typeof wx.getUserCloudStorage === 'function'
    
    console.log('wx.getFriendCloudStorage 可用:', hasGetFriendCloudStorage)
    console.log('wx.getUserCloudStorage 可用:', hasGetUserCloudStorage)
    
    if (!hasGetFriendCloudStorage && !hasGetUserCloudStorage) {
      console.warn('微信好友排行榜 API 不可用，将使用降级方案')
      // 返回空数据但不报错，显示无数据提示
      return {
        success: true,
        data: { leaderboard: [] }
      }
    }

    this.isLoading = true
    this.error = null

    return new Promise((resolve) => {
      // 优先使用 getFriendCloudStorage，如果不可用则使用 getUserCloudStorage
      const apiMethod = hasGetFriendCloudStorage ? wx.getFriendCloudStorage : wx.getUserCloudStorage
      
      apiMethod({
        keyList: ['score'],
        success: (res) => {
          console.log('获取好友排行榜成功:', res)
          this.isLoading = false
          this.lastFetchTime = Date.now()

          // 处理数据
          const leaderboard = this.processLeaderboardData(res.data || [])
          
          this.data = { leaderboard }
          resolve({
            success: true,
            data: this.data
          })
        },
        fail: (err) => {
          this.isLoading = false
          console.error('获取好友排行榜失败:', err)
          
          // 判断是否是授权问题（多种错误格式）
          const errorMsg = err.errMsg || err.message || ''
          console.log('错误信息:', errorMsg)
          
          // 检查是否是好友互动授权问题
          if (errorMsg.includes('auth') || 
              errorMsg.includes('deny') || 
              errorMsg.includes('authorize') ||
              errorMsg.includes('授权') ||
              errorMsg.includes('WxFriendInteraction')) {
            this.error = 'auth_deny'
            resolve({
              success: false,
              error: 'auth_deny',
              message: '需要授权才能查看好友排行榜'
            })
          } else {
            this.error = 'unknown'
            resolve({
              success: false,
              error: 'unknown',
              message: '获取好友排行榜失败，请稍后再试'
            })
          }
        }
      })
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
      
      // 获取分数：从 data 对象中获取
      let score = 0
      if (user.data && typeof user.data === 'object') {
        // wx.getFriendCloudStorage 返回的格式：user.data.score
        score = parseInt(user.data.score || '0')
      } else if (user.KVDataList && Array.isArray(user.KVDataList)) {
        // wx.getUserCloudStorage 返回的格式：user.KVDataList[0].value
        score = parseInt(user.KVDataList[0]?.value || '0')
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
