/**
 * 兼容性补丁
 * 解决 iOS 微信小游戏中 setTimeout 等未暴露到模块作用域的问题
 * 
 * 注意：在 ES6 module 中，iOS JavaScriptCore 可能不会自动将全局变量
 * 注入到模块作用域，需要显式从 globalThis 获取
 */

// 强制从 globalThis 获取定时器函数（兼容 iOS 模块作用域）
const _global = typeof globalThis !== 'undefined' ? globalThis : 
                typeof global !== 'undefined' ? global : 
                typeof window !== 'undefined' ? window : {};

// 挂载定时器函数到全局（确保所有模块都能访问）
if (typeof globalThis.setTimeout === 'undefined' && _global.setTimeout) {
  globalThis.setTimeout = _global.setTimeout
  globalThis.clearTimeout = _global.clearTimeout
  globalThis.setInterval = _global.setInterval
  globalThis.clearInterval = _global.clearInterval
  console.log('定时器 polyfill 已加载（从 global 恢复）')
}

// 如果当前模块作用域没有 setTimeout，从 globalThis 挂载
if (typeof setTimeout === 'undefined') {
  if (typeof wx !== 'undefined' && wx.setTimeout) {
    // 微信环境备用方案
    globalThis.setTimeout = wx.setTimeout
    globalThis.clearTimeout = wx.clearTimeout
    globalThis.setInterval = wx.setInterval
    globalThis.clearInterval = wx.clearInterval
    console.log('定时器 polyfill 已加载（从 wx 恢复）')
  } else if (_global.setTimeout) {
    // 从缓存的全局对象恢复
    globalThis.setTimeout = _global.setTimeout
    globalThis.clearTimeout = _global.clearTimeout
    globalThis.setInterval = _global.setInterval
    globalThis.clearInterval = _global.clearInterval
    console.log('定时器 polyfill 已加载（从缓存恢复）')
  }
}

// 独立检查 requestAnimationFrame
if (typeof requestAnimationFrame === 'undefined') {
  if (typeof wx !== 'undefined' && wx.requestAnimationFrame) {
    globalThis.requestAnimationFrame = wx.requestAnimationFrame
    globalThis.cancelAnimationFrame = wx.cancelAnimationFrame
  } else if (typeof globalThis.setTimeout !== 'undefined') {
    // 降级方案：使用 setTimeout 模拟 60fps
    globalThis.requestAnimationFrame = function(callback) {
      return globalThis.setTimeout(callback, 1000 / 60)
    }
    globalThis.cancelAnimationFrame = globalThis.clearTimeout
  }
  if (typeof requestAnimationFrame === 'undefined' && typeof globalThis.requestAnimationFrame !== 'undefined') {
    // 同步到当前模块作用域
    requestAnimationFrame = globalThis.requestAnimationFrame
    cancelAnimationFrame = globalThis.cancelAnimationFrame
  }
  if (typeof globalThis.requestAnimationFrame !== 'undefined') {
    console.log('requestAnimationFrame polyfill 已加载')
  }
}

// 导出标记，确保 polyfill 已被执行
globalThis.__POLYFILL_LOADED__ = true

// 生产环境禁用 console.log（保留 warn/error 用于问题排查）
if (typeof console !== 'undefined') {
  console.log = function() {}
}
