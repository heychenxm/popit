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
    console.log('定时器 polyfill 已加载')
  }
}

// 独立检查 requestAnimationFrame（某些微信版本有 setTimeout 但没有 rAF）
if (typeof requestAnimationFrame === 'undefined') {
  if (typeof wx !== 'undefined' && wx.requestAnimationFrame) {
    globalThis.requestAnimationFrame = wx.requestAnimationFrame
    globalThis.cancelAnimationFrame = wx.cancelAnimationFrame
  } else if (typeof setTimeout !== 'undefined') {
    // 降级方案：使用 setTimeout 模拟 60fps
    globalThis.requestAnimationFrame = function(callback) {
      return setTimeout(callback, 1000 / 60)
    }
    globalThis.cancelAnimationFrame = clearTimeout
  }
  if (typeof requestAnimationFrame !== 'undefined') {
    console.log('requestAnimationFrame polyfill 已加载')
  }
}
