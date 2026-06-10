/**
 * 泡泡大师 - 微信小游戏
 * 主入口文件
 */

import { Main } from './src/Main.js'

// 初始化云开发
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d2gbhgc8abb1ab532',
    traceUser: true
  })
  console.log('云开发初始化完成')
}

// 全局错误处理
wx.onError((error) => {
  console.error('Game Error:', error)
})

// 未处理的Promise拒绝
wx.onUnhandledRejection((error) => {
  console.error('Unhandled Rejection:', error)
})

// 启动游戏
let game = null

try {
  game = new Main()
  console.log('泡泡大师 - 游戏启动成功！')
} catch (error) {
  console.error('游戏启动失败:', error)
}

// 导出game实例供调试使用
if (typeof globalThis !== 'undefined') {
  globalThis.game = game
} else if (typeof global !== 'undefined') {
  global.game = game
} else if (typeof wx !== 'undefined') {
  wx.game = game
}
