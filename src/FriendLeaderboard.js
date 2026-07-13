/**
 * 好友排行榜数据管理
 * 基于微信开放数据域 + sharedCanvas 实现好友排行榜功能
 *
 * 架构说明：
 * - 主域设置固定尺寸 sharedCanvas，并通过 postMessage 通知开放数据域
 * - 开放数据域调用 wx.getFriendCloudStorage 获取数据，按 scrollY 裁剪绘制
 * - 主域触摸滚动时只转发 deltaY，滚动钳制在开放数据域内完成
 * - 主域通过 drawImage(sharedCanvas) 将排行榜整块显示到主屏
 * - 分数 KV key 带赛季 ID，避免跨赛季残留
 */

export const FRIEND_RANK_LAYOUT = {
  width: 340,
  height: 410,
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

  init() {
    if (typeof wx !== 'undefined' && typeof wx.getOpenDataContext === 'function') {
      this.openDataContext = wx.getOpenDataContext()
    }
  }

  /**
   * 当前赛季好友榜分数存储 key
   */
  getScoreStorageKey() {
    const seasonId = (this.gameState.seasonInfo && this.gameState.seasonInfo.currentSeasonId) || ''
    return seasonId ? `seasonScore_${seasonId}` : 'score'
  }

  /**
   * 同步赛季最高分到微信好友排行榜
   * @param {number} score
   * @returns {Promise<boolean>}
   */
  async syncScore(score) {
    if (typeof wx === 'undefined' || !wx.setUserCloudStorage) {
      console.warn('当前环境不支持微信排行榜')
      return false
    }

    const key = this.getScoreStorageKey()
    const value = String(Math.max(0, Math.floor(Number(score) || 0)))

    try {
      await wx.setUserCloudStorage({
        KVDataList: [{ key, value }]
      })
      console.log('好友排行榜赛季最高分上报成功:', key, value)
      this._notifyOpenDataFetch()
      return true
    } catch (err) {
      console.error('好友排行榜分数上报失败:', err)
      return false
    }
  }

  async fetchLeaderboard() {
    if (typeof wx === 'undefined') {
      return {
        success: false,
        error: 'not_wechat',
        message: '请在微信小游戏中运行'
      }
    }

    if (!this.openDataContext) this.init()
    if (!this.openDataContext) {
      return {
        success: false,
        error: 'no_open_data_context',
        message: '开放数据域未配置'
      }
    }

    this.isLoading = true
    this.error = null
    this._notifyOpenDataFetch()
    await new Promise(resolve => setTimeout(resolve, 500))
    this.isLoading = false
    this.lastFetchTime = Date.now()

    return {
      success: true,
      data: { useSharedCanvas: true }
    }
  }

  _notifyOpenDataFetch() {
    if (!this.openDataContext) return
    const scoreKey = this.getScoreStorageKey()
    this.openDataContext.postMessage({
      command: 'fetchFriendLeaderboard',
      keyList: [scoreKey],
      scoreKey,
      myNickname: this.gameState.userInfo.nickname || ''
    })
  }

  postScrollDelta(deltaY) {
    if (!this.openDataContext) this.init()
    if (!this.openDataContext || !deltaY) return

    this._pendingScrollDelta = (this._pendingScrollDelta || 0) + deltaY
    if (this._scrollFlushTimer) return

    this._scrollFlushTimer = setTimeout(() => {
      const delta = this._pendingScrollDelta || 0
      this._pendingScrollDelta = 0
      this._scrollFlushTimer = null
      if (!delta || !this.openDataContext) return
      this.openDataContext.postMessage({
        command: 'friendLeaderboardScroll',
        deltaY: delta
      })
    }, 32)
  }

  resetScroll() {
    if (!this.openDataContext) this.init()
    if (!this.openDataContext) return
    this.openDataContext.postMessage({
      command: 'friendLeaderboardResetScroll'
    })
  }

  setRenderActive(active) {
    if (!this.openDataContext) this.init()
    if (!this.openDataContext) return
    this.openDataContext.postMessage({
      command: 'setRenderActive',
      active: !!active
    })
  }

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

  clearData() {
    this.error = null
    this.lastFetchTime = 0
  }
}
