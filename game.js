/**
 * 泡泡大师 - 微信小游戏
 * 主入口文件
 */

// 先导入兼容性补丁（确保 setTimeout 等可用）
import './src/polyfill.js'
import { Main } from './src/Main.js'

// 初始化云开发（仅在微信环境中）
if (typeof wx !== 'undefined' && wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d2gbhgc8abb1ab532',
    traceUser: true
  })
  console.log('云开发初始化完成')
}

// 全局错误处理（仅在微信环境中）
if (typeof wx !== 'undefined') {
  wx.onError((error) => {
    console.error('Game Error:', error)
  })

  // 未处理的Promise拒绝
  wx.onUnhandledRejection((error) => {
    console.error('Unhandled Rejection:', error)
  })
}

// 隐私政策处理：确保用户同意隐私政策后再启动游戏
function startGameWithPrivacy() {
  // 检查是否需要隐私授权（使用平台组件模式）
  if (typeof wx !== 'undefined' && wx.requirePrivacyAuthorize) {
    wx.requirePrivacyAuthorize({
      success: () => {
        // 用户已同意隐私政策，启动游戏
        launchGame()
      },
      fail: () => {
        // 用户拒绝隐私政策，仍然启动游戏（但某些功能可能受限）
        console.log('用户拒绝隐私政策，部分功能可能受限')
        launchGame()
      }
    })
  } else {
    // 旧版本基础库或非微信环境，直接启动
    launchGame()
  }
}

// 启动游戏
function launchGame() {
  let game = null
  
  try {
    game = new Main()
    console.log('泡泡大师 - 游戏启动成功！')
  } catch (error) {
    console.error('游戏启动失败:', error)
  }
  
  // 导出game实例供调试使用（仅在实例非空时）
  if (game) {
    if (typeof globalThis !== 'undefined') {
      globalThis.game = game
    } else if (typeof global !== 'undefined') {
      global.game = game
    } else if (typeof wx !== 'undefined') {
      wx.game = game
    }
  }
}

// 启动游戏（带隐私政策检查）
startGameWithPrivacy()
