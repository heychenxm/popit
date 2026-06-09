/**
 * 游戏配置文件
 */

export const config = {
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
