/**
 * 兼容性补丁
 * 解决某些微信版本中 setTimeout 等未暴露到全局的问题
 */

// 检查并挂载定时器函数到全局
if (typeof setTimeout === 'undefined') {
  if (typeof wx !== 'undefined' && wx.setTimeout) {
    globalThis.setTimeout = wx.setTimeout
    globalThis.clearTimeout = wx.clearTimeout
    globalThis.setInterval = wx.setInterval
    globalThis.clearInterval = wx.clearInterval
    globalThis.requestAnimationFrame = wx.requestAnimationFrame || function(callback) {
      return wx.setTimeout(callback, 1000 / 60)
    }
    globalThis.cancelAnimationFrame = wx.cancelAnimationFrame || wx.clearTimeout
    console.log('定时器 polyfill 已加载')
  }
}
