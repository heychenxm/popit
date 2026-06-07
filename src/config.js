/**
 * 游戏配置文件
 * 根据环境自动选择对应的云环境 ID
 */

// 检测当前环境
function getEnv() {
  try {
    // 微信小游戏环境
    if (typeof wx !== 'undefined' && wx.getAccountInfoSync) {
      const accountInfo = wx.getAccountInfoSync()
      // miniProgram.envVersion: 'develop' | 'trial' | 'release'
      return accountInfo.miniProgram?.envVersion || 'develop'
    }
  } catch (e) {
    // 获取失败，默认为开发环境
  }
  return 'develop'
}

// 云环境配置
const CLOUD_ENV_CONFIG = {
  develop: 'cloud1-d2gbhgc8abb1ab532',  // 开发环境（替换为你的开发环境 ID）
  trial: 'cloud1-d2gbhgc8abb1ab532',    // 体验环境（替换为你的体验环境 ID）
  release: 'cloud1-d2gbhgc8abb1ab532'   // 正式环境（替换为你的正式环境 ID）
}

const env = getEnv()

export const config = {
  // 当前环境
  env: env,
  
  // 云环境 ID
  cloudEnv: CLOUD_ENV_CONFIG[env] || CLOUD_ENV_CONFIG.develop,
  
  // 游戏配置
  game: {
    initialCoins: 1000,        // 初始金币
    maxLives: 5,               // 最大生命
    initialLives: 3,           // 初始生命
    maxPurchaseCount: 3,       // 最大购买次数
    purchasePrices: [300, 500, 1000],  // 购买价格
    maxShareCountPerDay: 10,   // 每日最大分享次数
  },
  
  // 签到配置
  checkin: {
    rewards: {
      1: { base: 300, bonus: 0 },
      2: { base: 500, bonus: 0 },
    },
    defaultBase: 1000,         // 默认基础奖励
    bonusDay: 7,               //  bonus 天数（7 的倍数）
    bonusAmount: 2000,         // bonus 额外奖励
  },
  
  // 奖励配置
  rewards: {
    waveClear: 30,             // 通关奖励
    share: 50,                 // 分享奖励
    shareGift: 1000,           // 分享礼包奖励
    consecutiveWin: 5,         // 连续胜利恢复生命的间隔
  }
}
