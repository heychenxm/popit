/**
 * 好友排行榜数据管理
 * 基于微信开放数据域 + sharedCanvas 实现好友排行榜功能
 *
 * 架构说明：
 * - 主域设置固定尺寸 sharedCanvas，并通过 postMessage 通知开放数据域
 * - 开放数据域调用 wx.getFriendCloudStorage 获取数据，按 scrollY 裁剪绘制
 * - 主域触摸滚动时只转发 deltaY，滚动钳制在开放数据域内完成
 * - 主域通过 drawImage(sharedCanvas) 将排行榜整块显示到主屏
 */

// 与开放数据域保持一致的固定视口（逻辑像素）
export const FRIEND_RANK_LAYOUT = {
  width: 340,
  height: 410, // top10 + list300 + gap20 + self60 + bottom20
  listViewH: 300
}

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
   * 转发滚动增量到开放数据域（由开放数据域自行钳制）
   * @param {number} deltaY
   */
  postScrollDelta(deltaY) {
    if (!this.openDataContext) {
      this.init()
    }
    if (!this.openDataContext || !deltaY) return

    this.openDataContext.postMessage({
      command: 'friendLeaderboardScroll',
      deltaY
    })
  }

  /**
   * 重置开放数据域滚动位置
   */
  resetScroll() {
    if (!this.openDataContext) {
      this.init()
    }
    if (!this.openDataContext) return

    this.openDataContext.postMessage({
      command: 'friendLeaderboardResetScroll'
    })
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
