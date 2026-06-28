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
    maxShareReviveCount: 3,    // 每局最多分享复活次数
    maxAdReviveCount: 3,       // 每局最多广告复活次数
    rewardedVideoAdUnitId: 'adunit-dc90cd7a5f209d6a',  // 激励视频广告单元 ID
  },
  
  // 签到配置
  checkin: {
    rewards: {
      1: { base: 300, bonus: 0 },
      2: { base: 500, bonus: 0 },
    },
    defaultBase: 500,         // 默认基础奖励
    bonusDay: 7,               //  bonus 天数（7 的倍数）
    bonusAmount: 1000,         // bonus 额外奖励
    rewardedVideoAdUnitId: 'adunit-19a83e377405ddb5',  // 签到激励视频广告单元 ID
  },
  
  // 奖励配置
  rewards: {
    waveClear: 5,           // 基础通关奖励（1-19关）
    waveClearTier2: 15,      // 20-39关奖励
    waveClearTier3: 30,      // 40-59关奖励
    waveClearTier4: 50,      // 60关+奖励
    share: 50,                 // 分享奖励
    shareGift: 500,           // 分享礼包奖励
    consecutiveWin: 5,         // 连续胜利恢复生命的间隔
  },
  
  // 游戏圈配置
  gameClub: {
    openlink: '-SSEykJvFV3pORt5kTNpSwf9v-nO8w-RltZQZE2rBIVXb7phpwakvShxowg8mzrNcJYcdNO5WDO26mdXbRWneklavyMsSHiDXTw6t9McAzz8JBJXjxWYMGOC2WQZOcGebAorBfoC4LgNfVgedG1Ptl1V6jnazLovHcaN7sIiMVrrKYKs0VLdIBsm7dWz8EDLgCcbTNgBWeIGR2TkS_w8NJ8At-pVdIXCxBJhrrhgq8Ax5R3aCuaf2vIKkljucoZ-M7q-z355b3iIf_sPFXk7SV2QjWoSTR-EIK4d9NOmT1DMdm0IUBAbITMhPsX1FIjN-uKX5j0qzWgvIlXhnXAFvA',
    enabled: true
  }
}
