/**
 * 好友排行榜数据管理
 * 基于微信开放数据域 + sharedCanvas 实现好友排行榜功能
 *
 * 架构说明：
 * - 主域通过 postMessage 通知开放数据域获取数据
 * - 开放数据域调用 wx.getFriendCloudStorage 获取数据并渲染到 sharedCanvas
 * - 主域通过 drawImage(sharedCanvas) 将排行榜显示到主屏
 * - 开放数据域不能向主域发送消息，数据通过 sharedCanvas 共享
 */

export class FriendLeaderboard {
  constructor(gameState) {
    this.gameState = gameState
    this.isLoading = false
    this.error = null
    this.lastFetchTime = 0
    this.openDataContext = null
  }

  /**
   * 初始化开放数据域引用
   */
  init() {
    if (typeof wx !== 'undefined' && typeof wx.getOpenDataContext === 'function') {
      this.openDataContext = wx.getOpenDataContext()
    }
  }

  /**
   * 同步分数到微信排行榜（主域可直接调用）
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
          key: 'score',
          value: score.toString()
        }]
      })
      console.log('排行榜分数上报成功:', score)

      // 上报成功后通知开放数据域刷新
      this._notifyOpenDataFetch()

      return true
    } catch (err) {
      console.error('排行榜分数上报失败:', err)
      return false
    }
  }

  /**
   * 触发好友排行榜数据获取
   * 通知开放数据域调用 wx.getFriendCloudStorage，数据会渲染到 sharedCanvas
   * @returns {Promise<Object>} - { success, error, message }
   */
  async fetchLeaderboard() {
    if (typeof wx === 'undefined') {
      console.warn('wx 未定义，当前不是微信小游戏环境')
      return {
        success: false,
        error: 'not_wechat',
        message: '请在微信小游戏中运行'
      }
    }

    if (!this.openDataContext) {
      this.init()
    }

    if (!this.openDataContext) {
      console.warn('开放数据域不可用')
      return {
        success: false,
        error: 'no_open_data_context',
        message: '开放数据域未配置'
      }
    }

    this.isLoading = true
    this.error = null

    // 通知开放数据域获取数据（开放数据域会渲染到 sharedCanvas）
    this._notifyOpenDataFetch()

    // 等待一段时间让开放数据域完成渲染
    await new Promise(resolve => setTimeout(resolve, 500))

    this.isLoading = false
    this.lastFetchTime = Date.now()

    return {
      success: true,
      data: { useSharedCanvas: true }
    }
  }

  /**
   * 通知开放数据域获取好友数据
   */
  _notifyOpenDataFetch() {
    if (this.openDataContext) {
      this.openDataContext.postMessage({
        command: 'fetchFriendLeaderboard',
        keyList: ['score'],
        myNickname: this.gameState.userInfo.nickname || ''
      })
    }
  }

  /**
   * 获取排行榜数据（带缓存）
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Object>}
   */
  async getLeaderboard(forceRefresh = false) {
    if (!forceRefresh && this.lastFetchTime > 0 && Date.now() - this.lastFetchTime < 30000) {
      return {
        success: true,
        data: { useSharedCanvas: true },
        fromCache: true
      }
    }

    return await this.fetchLeaderboard()
  }

  /**
   * 清除缓存数据
   */
  clearData() {
    this.error = null
    this.lastFetchTime = 0
  }
}
