/**
 * 微信API封装 - 排行榜、分享等社交功能
 */
export class WechatAPI {
  constructor() {
    this.userCloudStorage = null
    this.friendCloudStorage = null
    this.relation = null
  }

  // 初始化微信API
  init() {
    // 检查是否在微信环境中
    if (typeof wx === 'undefined') {
      console.log('Not in WeChat environment')
      return false
    }
    return true
  }

  // 获取登录凭证
  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          resolve(res.code)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // 分享 - 分享到聊天
  shareToChat(options = {}) {
    return new Promise((resolve, reject) => {
      wx.shareAppMessage({
        title: options.title || '来挑战泡泡大师！',
        imageUrl: options.imageUrl || '',
        query: options.query || '',
        success: (res) => {
          resolve(res)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // 分享 - 分享到朋友圈
  shareToTimeline(options = {}) {
    return new Promise((resolve, reject) => {
      wx.shareTimeline({
        title: options.title || '来挑战泡泡大师！',
        query: options.query || '',
        success: (res) => {
          resolve(res)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // 获取排行榜数据 - 好友排行榜
  getFriendRankData(key) {
    return new Promise((resolve, reject) => {
      wx.getUserCloudStorage({
        keyList: [key],
        success: (res) => {
          resolve(res.KVDataList)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // 上传分数到云端
  uploadScore(key, value) {
    return new Promise((resolve, reject) => {
      wx.setUserCloudStorage({
        KVDataList: [
          { key: key, value: value }
        ],
        success: (res) => {
          resolve(res)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  // 获取排行榜（使用开放数据域）
  getOpenDataContext() {
    return wx.getOpenDataContext()
  }

  // 发送排行榜数据到开放数据域
  postRankData(score) {
    const openDataContext = wx.getOpenDataContext()
    openDataContext.postMessage({
      type: 'updateRank',
      score: score
    })
  }

  // 显示分享菜单
  showShareMenu() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  }

  // 隐藏分享菜单
  hideShareMenu() {
    wx.hideShareMenu()
  }

  // 显示加载提示
  showLoading(title) {
    wx.showLoading({
      title: title,
      mask: true
    })
  }

  // 隐藏加载提示
  hideLoading() {
    wx.hideLoading()
  }

  // 显示提示消息
  showToast(options) {
    wx.showToast({
      title: options.title || '操作成功',
      icon: options.icon || 'success',
      duration: options.duration || 2000
    })
  }

  // 振动反馈
  vibrateShort() {
    wx.vibrateShort({
      type: 'light'
    })
  }

  vibrateLong() {
    wx.vibrateLong()
  }

  // 获取系统信息
  getSystemInfo() {
    return wx.getSystemInfoSync()
  }

  // 获取窗口信息
  getWindowInfo() {
    return wx.getWindowInfo()
  }

  // 设置屏幕常亮
  keepScreenOn(keep) {
    wx.setKeepScreenOn({
      keepScreenOn: keep
    })
  }

  // ========== 云开发相关 ==========

  // 检查云开发是否可用
  isCloudAvailable() {
    return typeof wx !== 'undefined' && !!wx.cloud
  }

  // 调用云函数的通用封装
  callCloud(name, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isCloudAvailable()) {
        reject(new Error('云开发不可用'))
        return
      }
      wx.cloud.callFunction({
        name,
        data,
        success: (res) => resolve(res.result),
        fail: (err) => reject(err)
      })
    })
  }

  // 保存游戏数据到云端
  saveGameData(data) {
    return this.callCloud('saveGameData', data)
  }

  // 从云端加载游戏数据
  loadGameData() {
    return this.callCloud('loadGameData')
  }

  // 云端签到
  cloudCheckin() {
    return this.callCloud('checkin')
  }

  // 获取总排行榜
  getLeaderboard(type) {
    return this.callCloud('getLeaderboard', { type })
  }

  // 获取赛季排行榜
  getSeasonLeaderboard(type) {
    return this.callCloud('getSeasonLeaderboard', { type })
  }
}

// 导出单例
export const wechatAPI = new WechatAPI()
