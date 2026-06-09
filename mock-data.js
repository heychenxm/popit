/**
 * POPIT 记忆泡泡爆破 - Mock 数据
 * 用于测试和开发环境的数据模拟
 */

// ==================== 普通排行榜数据 ====================
const mockLeaderboard = {
  score: {
    success: true,
    data: {
      type: 'score',
      leaderboard: [
        {
          rank: 1,
          openid: 'user_001',
          nickname: '记忆大师',
          avatarUrl: 'https://example.com/avatar1.png',
          value: 9999,
          isUser: false
        },
        {
          rank: 2,
          openid: 'user_002',
          nickname: '泡泡达人',
          avatarUrl: 'https://example.com/avatar2.png',
          value: 8500,
          isUser: false
        },
        {
          rank: 3,
          openid: 'user_003',
          nickname: '挑战者',
          avatarUrl: 'https://example.com/avatar3.png',
          value: 7200,
          isUser: false
        },
        {
          rank: 4,
          openid: 'user_004',
          nickname: '游戏高手',
          avatarUrl: 'https://example.com/avatar4.png',
          value: 6800,
          isUser: false
        },
        {
          rank: 5,
          openid: 'user_005',
          nickname: '记忆新手',
          avatarUrl: 'https://example.com/avatar5.png',
          value: 5500,
          isUser: false
        },
        {
          rank: 6,
          openid: 'user_006',
          nickname: '泡泡玩家',
          avatarUrl: 'https://example.com/avatar6.png',
          value: 4200,
          isUser: false
        },
        {
          rank: 7,
          openid: 'user_007',
          nickname: '挑战者7',
          avatarUrl: 'https://example.com/avatar7.png',
          value: 3800,
          isUser: false
        },
        {
          rank: 8,
          openid: 'user_008',
          nickname: '游戏达人',
          avatarUrl: 'https://example.com/avatar8.png',
          value: 3200,
          isUser: false
        },
        {
          rank: 9,
          openid: 'user_009',
          nickname: '记忆玩家',
          avatarUrl: 'https://example.com/avatar9.png',
          value: 2800,
          isUser: false
        },
        {
          rank: 10,
          openid: 'user_010',
          nickname: '泡泡新手',
          avatarUrl: 'https://example.com/avatar10.png',
          value: 2100,
          isUser: false
        }
      ],
      userRank: 3,
      userValue: 7200
    },
    fromCache: false
  },
  wave: {
    success: true,
    data: {
      type: 'wave',
      leaderboard: [
        {
          rank: 1,
          openid: 'user_001',
          nickname: '记忆大师',
          avatarUrl: 'https://example.com/avatar1.png',
          value: 150,
          isUser: false
        },
        {
          rank: 2,
          openid: 'user_002',
          nickname: '泡泡达人',
          avatarUrl: 'https://example.com/avatar2.png',
          value: 120,
          isUser: false
        },
        {
          rank: 3,
          openid: 'user_003',
          nickname: '挑战者',
          avatarUrl: 'https://example.com/avatar3.png',
          value: 95,
          isUser: false
        },
        {
          rank: 4,
          openid: 'user_004',
          nickname: '游戏高手',
          avatarUrl: 'https://example.com/avatar4.png',
          value: 80,
          isUser: false
        },
        {
          rank: 5,
          openid: 'user_005',
          nickname: '记忆新手',
          avatarUrl: 'https://example.com/avatar5.png',
          value: 65,
          isUser: false
        },
        {
          rank: 6,
          openid: 'user_006',
          nickname: '泡泡玩家',
          avatarUrl: 'https://example.com/avatar6.png',
          value: 50,
          isUser: false
        },
        {
          rank: 7,
          openid: 'user_007',
          nickname: '挑战者7',
          avatarUrl: 'https://example.com/avatar7.png',
          value: 42,
          isUser: false
        },
        {
          rank: 8,
          openid: 'user_008',
          nickname: '游戏达人',
          avatarUrl: 'https://example.com/avatar8.png',
          value: 35,
          isUser: false
        },
        {
          rank: 9,
          openid: 'user_009',
          nickname: '记忆玩家',
          avatarUrl: 'https://example.com/avatar9.png',
          value: 28,
          isUser: false
        },
        {
          rank: 10,
          openid: 'user_010',
          nickname: '泡泡新手',
          avatarUrl: 'https://example.com/avatar10.png',
          value: 20,
          isUser: false
        }
      ],
      userRank: 5,
      userValue: 65
    },
    fromCache: false
  }
}

// ==================== 赛季排行榜数据 ====================
const mockSeasonLeaderboard = {
  score: {
    success: true,
    data: {
      type: 'score',
      seasonId: '2026-S24',
      seasonStartTime: new Date('2026-06-06T00:00:00').getTime(),
      seasonEndTime: new Date('2026-06-12T24:00:00').getTime(),
      leaderboard: [
        {
          rank: 1,
          openid: 'user_001',
          nickname: '记忆大师',
          avatarUrl: 'https://example.com/avatar1.png',
          value: 8500,
          isUser: false
        },
        {
          rank: 2,
          openid: 'user_002',
          nickname: '泡泡达人',
          avatarUrl: 'https://example.com/avatar2.png',
          value: 7200,
          isUser: false
        },
        {
          rank: 3,
          openid: 'user_003',
          nickname: '挑战者',
          avatarUrl: 'https://example.com/avatar3.png',
          value: 6800,
          isUser: false
        },
        {
          rank: 4,
          openid: 'user_004',
          nickname: '游戏高手',
          avatarUrl: 'https://example.com/avatar4.png',
          value: 5500,
          isUser: false
        },
        {
          rank: 5,
          openid: 'user_005',
          nickname: '记忆新手',
          avatarUrl: 'https://example.com/avatar5.png',
          value: 4200,
          isUser: false
        },
        {
          rank: 6,
          openid: 'user_006',
          nickname: '泡泡玩家',
          avatarUrl: 'https://example.com/avatar6.png',
          value: 3800,
          isUser: false
        }
      ],
      userRank: 3,
      userValue: 6800,
      userStats: {
        totalGames: 45,
        totalClears: 38,
        bestStreak: 12
      }
    },
    fromCache: false
  },
  wave: {
    success: true,
    data: {
      type: 'wave',
      seasonId: '2026-S24',
      seasonStartTime: new Date('2026-06-06T00:00:00').getTime(),
      seasonEndTime: new Date('2026-06-12T24:00:00').getTime(),
      leaderboard: [
        {
          rank: 1,
          openid: 'user_001',
          nickname: '记忆大师',
          avatarUrl: 'https://example.com/avatar1.png',
          value: 120,
          isUser: false
        },
        {
          rank: 2,
          openid: 'user_002',
          nickname: '泡泡达人',
          avatarUrl: 'https://example.com/avatar2.png',
          value: 95,
          isUser: false
        },
        {
          rank: 3,
          openid: 'user_003',
          nickname: '挑战者',
          avatarUrl: 'https://example.com/avatar3.png',
          value: 80,
          isUser: false
        },
        {
          rank: 4,
          openid: 'user_004',
          nickname: '游戏高手',
          avatarUrl: 'https://example.com/avatar4.png',
          value: 65,
          isUser: false
        },
        {
          rank: 5,
          openid: 'user_005',
          nickname: '记忆新手',
          avatarUrl: 'https://example.com/avatar5.png',
          value: 50,
          isUser: false
        },
        {
          rank: 6,
          openid: 'user_006',
          nickname: '泡泡玩家',
          avatarUrl: 'https://example.com/avatar6.png',
          value: 42,
          isUser: false
        }
      ],
      userRank: 5,
      userValue: 50,
      userStats: {
        totalGames: 45,
        totalClears: 38,
        bestStreak: 12
      }
    },
    fromCache: false
  }
}

// ==================== 每日签到数据 ====================
const mockCheckinData = {
  canCheckin: true,
  streak: 3,
  todayReward: {
    type: 'coin',
    amount: 1000,
    baseReward: 1000,
    bonusReward: 0,
    isBonusDay: false
  },
  cloudAvailable: false,
  // 签到记录（7 天）
  checkinRecords: [
    { day: 1, base: 300, bonus: 0, total: 300, isSigned: true },
    { day: 2, base: 500, bonus: 0, total: 500, isSigned: true },
    { day: 3, base: 1000, bonus: 0, total: 1000, isSigned: true },
    { day: 4, base: 1000, bonus: 0, total: 1000, isSigned: false },
    { day: 5, base: 1000, bonus: 0, total: 1000, isSigned: false },
    { day: 6, base: 1000, bonus: 0, total: 1000, isSigned: false },
    { day: 7, base: 1000, bonus: 2000, total: 3000, isSigned: false }
  ],
  // 7 天连签奖励
  bonusReward: {
    amount: 2000,
    isSigned: false
  }
}

// ==================== 普通分享数据 ====================
const mockQuickShareData = {
  todayShareCount: 7,
  maxShareCountPerDay: 10,
  remainingCount: 3,
  rewardPerShare: 50,
  totalRewardToday: 350,
  canShare: true,
  shareHistory: [
    { date: '2026-06-09', time: '10:30:25', reward: 50 },
    { date: '2026-06-09', time: '11:15:42', reward: 50 },
    { date: '2026-06-09', time: '14:22:18', reward: 50 },
    { date: '2026-06-09', time: '15:45:33', reward: 50 },
    { date: '2026-06-09', time: '16:30:12', reward: 50 },
    { date: '2026-06-09', time: '17:20:45', reward: 50 },
    { date: '2026-06-09', time: '18:10:28', reward: 50 }
  ]
}

// ==================== 分享礼包数据 ====================
const mockShareGiftData = {
  lastShareGiftDate: '',
  hasSharedGiftToday: false,
  reward: 1000,
  canClaim: true,
  claimHistory: [
    { date: '2026-06-08', reward: 1000 },
    { date: '2026-06-07', reward: 1000 },
    { date: '2026-06-06', reward: 1000 },
    { date: '2026-06-05', reward: 1000 },
    { date: '2026-06-04', reward: 1000 }
  ],
  totalClaimed: 5000
}

// ==================== 游戏数据 ====================
const mockGameData = {
  // 玩家核心数据
  highScore: 7200,
  bestWave: 65,
  coins: 15800,
  
  // 当前游戏状态
  currentGame: {
    score: 350,
    wave: 42,
    lives: 4,
    maxLives: 5,
    phase: 'PLAY',
    waveScore: 350,
    consecutiveWins: 8,
    purchaseCount: 1,
    sessionCoins: 1200,
    targets: [3, 7, 12, 18, 22, 28, 33],
    playerClicks: [3, 7, 12, 18, 22],
    timerRemaining: 2500,
    observeDuration: 1500,
    playDuration: 3000,
    isPaused: false
  },
  
  // 关卡配置
  waveConfig: {
    gridSize: { cols: 6, rows: 6 },
    totalBubbles: 36,
    targetCount: 10,
    observeTime: 1500,
    playTime: 3000
  },
  
  // 赛季数据
  seasonData: {
    seasonId: '2026-S24',
    seasonScore: 6800,
    seasonWave: 80,
    totalGames: 45,
    totalClears: 38,
    bestStreak: 12,
    userRank: 3,
    rewardCoins: 5000,
    settled: false
  },
  
  // 赛季信息
  seasonInfo: {
    currentSeasonId: '2026-S24',
    seasonStartTime: new Date('2026-06-06T00:00:00').getTime(),
    seasonEndTime: new Date('2026-06-12T24:00:00').getTime(),
    timeRemaining: 3 * 24 * 60 * 60 * 1000  // 3 天
  },
  
  // 用户信息
  userInfo: {
    nickname: '挑战者',
    avatarUrl: 'https://example.com/avatar3.png',
    authorized: true
  },
  
  // 声音设置
  soundEnabled: true
}

// ==================== 导出所有 mock 数据 ====================
export const mockData = {
  leaderboard: mockLeaderboard,
  seasonLeaderboard: mockSeasonLeaderboard,
  checkin: mockCheckinData,
  quickShare: mockQuickShareData,
  shareGift: mockShareGiftData,
  game: mockGameData
}

// ==================== 使用方法 ====================
// import { mockData } from './mock-data.js'
// 
// // 获取普通排行榜数据
// const scoreLeaderboard = mockData.leaderboard.score
// const waveLeaderboard = mockData.leaderboard.wave
// 
// // 获取赛季排行榜数据
// const seasonScore = mockData.seasonLeaderboard.score
// const seasonWave = mockData.seasonLeaderboard.wave
// 
// // 获取签到数据
// const checkinData = mockData.checkin
// 
// // 获取分享数据
// const quickShare = mockData.quickShare
// const shareGift = mockData.shareGift
// 
// // 获取游戏数据
// const gameData = mockData.game
