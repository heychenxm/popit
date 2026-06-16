import { config } from './config.js'

/**
 * 广告管理器 - 封装微信激励视频广告
 * 设计原则：用户主动触发，不影响游戏体验
 */
export class AdManager {
  constructor() {
    this.rewardedAds = {}
    this.callbacks = {}
    this.adReady = {}

    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) {
      console.log('当前环境不支持激励视频广告')
      return
    }

    // 创建广告实例（使用占位 adUnitId，后续替换为真实 ID）
    const adUnits = config.ads.adUnits
    for (const [key, adUnitId] of Object.entries(adUnits)) {
      try {
        const ad = wx.createRewardedVideoAd({ adUnitId })
        this.rewardedAds[key] = ad
        this.adReady[key] = false

        ad.onLoad(() => {
          this.adReady[key] = true
          console.log(`激励视频广告 [${key}] 加载成功`)
        })

        ad.onError((err) => {
          this.adReady[key] = false
          console.error(`激励视频广告 [${key}] 错误:`, err)
        })
      } catch (e) {
        console.error(`创建激励视频广告 [${key}] 失败:`, e)
      }
    }
  }

  /**
   * 显示激励视频广告
   * @param {string} type - 广告类型（对应 config.ads.adUnits 的 key）
   * @param {Object} callbacks - 回调函数
   * @param {Function} callbacks.onClose - 关闭回调，参数 isEnded 表示是否看完
   * @param {Function} callbacks.onError - 错误回调
   */
  showRewardedAd(type, callbacks = {}) {
    const ad = this.rewardedAds[type]
    if (!ad) {
      callbacks.onError && callbacks.onError('广告类型不存在')
      return
    }

    this.callbacks[type] = callbacks

    // 如果广告未就绪，先加载再展示
    if (!this.adReady[type]) {
      ad.load().then(() => {
        this.adReady[type] = true
        ad.show().catch(() => {
          callbacks.onError && callbacks.onError('广告展示失败')
        })
      }).catch(() => {
        callbacks.onError && callbacks.onError('广告加载失败')
      })
      return
    }

    ad.show().catch(() => {
      // show 失败时尝试重新加载再展示
      ad.load().then(() => {
        ad.show().catch(() => {
          callbacks.onError && callbacks.onError('广告展示失败')
        })
      }).catch(() => {
        callbacks.onError && callbacks.onError('广告加载失败')
      })
    })
  }

  /**
   * 绑定广告关闭事件（在 Main 初始化时调用一次）
   * @param {string} type - 广告类型
   * @param {Function} handler - 处理函数，参数 res.isEnded
   */
  bindCloseHandler(type, handler) {
    const ad = this.rewardedAds[type]
    if (!ad) return

    ad.onClose((res) => {
      const isEnded = res && res.isEnded !== false
      handler(isEnded)
    })
  }

  /**
   * 检查广告是否可用
   */
  isAdReady(type) {
    return !!this.adReady[type]
  }

  /**
   * 主动预加载广告（可在空闲时调用）
   */
  preloadAd(type) {
    const ad = this.rewardedAds[type]
    if (!ad || this.adReady[type]) return
    ad.load().catch(() => {})
  }
}
