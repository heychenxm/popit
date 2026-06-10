# 泡泡大师 - 数据说明文档

## 📋 目录

1. [数据概述](#数据概述)
2. [本地存储数据](#本地存储数据)
3. [游戏运行时数据](#游戏运行时数据)
4. [排行榜数据](#排行榜数据)
5. [赛季数据](#赛季数据)
6. [签到数据](#签到数据)
7. [分享数据](#分享数据)
8. [用户数据](#用户数据)
9. [数据流转图](#数据流转图)

---

## 数据概述

本项目采用**纯本地存储**架构，所有数据均使用微信小游戏的 `wx.setStorageSync` / `wx.getStorageSync` API 存储在本地。

**数据分类**：
- **持久化数据**：使用 `wx.setStorageSync` 存储，游戏关闭后保留
- **运行时数据**：仅在内存中维护，游戏重启后重置
- **缓存数据**：排行榜/赛季数据的本地缓存（30 分钟有效期）

---

## 本地存储数据

### 1. 玩家核心数据

| 键名 | 类型 | 默认值 | 说明 | 更新时机 |
|------|------|--------|------|---------|
| `highScore` | Number | 0 | 历史最高分 | 游戏结束时更新 |
| `bestWave` | Number | 0 | 历史最高通关关卡 | 通关时更新 |
| `coins` | Number | 1000 | 当前金币数量 | 获得/消耗金币时更新 |

**存储位置**：`GameState` 构造函数初始化时读取

```javascript
this.highScore = Number(getStorage('highScore', 0)) || 0
this.bestWave = Number(getStorage('bestWave', 0)) || 0
this.coins = Number(getStorage('coins', config.game.initialCoins)) || config.game.initialCoins
```

---

### 2. 签到数据

| 键名 | 类型 | 默认值 | 说明 | 更新时机 |
|------|------|--------|------|---------|
| `lastCheckinDate` | String | '' | 上次签到日期（格式：'YYYY-MM-DD'） | 签到时更新 |
| `checkinStreak` | Number | 0 | 连续签到天数 | 签到时更新 |

**存储位置**：`GameState.doLocalCheckin()` 方法中更新

```javascript
// 签到时更新
setStorage('lastCheckinDate', today)
setStorage('checkinStreak', this.checkinStreak)
```

**日期格式示例**：`'2026-06-09'`

---

### 3. 分享数据

| 键名 | 类型 | 默认值 | 说明 | 更新时机 |
|------|------|--------|------|---------|
| `lastShareDate` | String | '' | 上次分享日期（格式：'YYYY-MM-DD'） | 分享时更新 |
| `todayShareCount` | Number | 0 | 今日分享次数（每日上限 10 次） | 分享时更新 |
| `lastShareGiftDate` | String | '' | 上次领取分享礼包日期（格式：'YYYY-MM-DD'） | 领取礼包时更新 |

**存储位置**：`GameState` 的分享相关方法中更新

```javascript
// 更新分享次数
setStorage('lastShareDate', today)
setStorage('todayShareCount', this.todayShareCount)

// 领取分享礼包
setStorage('lastShareGiftDate', today)
```

---

### 4. 用户信息

| 键名 | 类型 | 默认值 | 说明 | 更新时机 |
|------|------|--------|------|---------|
| `nickname` | String | '' | 用户昵称 | 用户授权时更新 |
| `avatarUrl` | String | '' | 用户头像 URL | 用户授权时更新 |
| `userInfoAuthorized` | Boolean | false | 用户是否已授权 | 用户授权时更新 |

**存储位置**：`GameState.saveUserProfileLocally()` 方法中更新

```javascript
setStorage('nickname', nickname)
setStorage('avatarUrl', avatarUrl)
setStorage('userInfoAuthorized', true)
```

---

## 游戏运行时数据

以下数据仅在内存中维护，不存储到本地，游戏重启后重置。

### 1. 游戏状态数据

| 属性名 | 类型 | 默认值 | 说明 | 重置时机 |
|--------|------|--------|------|---------|
| `score` | Number | 0 | 当前对局得分 | 新游戏开始时 |
| `wave` | Number | 1 | 当前关卡数 | 新游戏开始时 |
| `lives` | Number | 3 | 当前生命数量 | 新游戏开始时 |
| `targets` | Array | [] | 目标泡泡索引数组 | 新关卡开始时 |
| `playerClicks` | Array | [] | 玩家已点击的索引数组 | 新关卡开始时 |
| `phase` | String | 'MENU' | 游戏阶段 | 阶段切换时 |
| `waveScore` | Number | 0 | 当前关卡得分 | 新关卡开始时 |
| `consecutiveWins` | Number | 0 | 连续胜利关卡数 | 游戏失败时 |
| `purchaseCount` | Number | 0 | 本局购买生命次数（最多 3 次） | 新游戏开始时 |
| `sessionCoins` | Number | 0 | 本局获得的金币（不含初始 1000） | 新游戏开始时 |
| `hasShownRecordBreakModal` | Boolean | false | 本局是否已显示破纪录弹窗 | 新游戏开始时 |
| `isNewScoreRecord` | Boolean | false | 本次结算是否破了最高分纪录 | 新游戏开始时 |
| `sessionStartHighScore` | Number | highScore | 本局开始时的历史最高分 | 新游戏开始时 |
| `isPaused` | Boolean | false | 是否暂停 | 恢复游戏时 |
| `pausedPhase` | String | null | 暂停时的阶段 | 恢复游戏时 |
| `pausedTimerRemaining` | Number | 0 | 暂停时的剩余时间 | 恢复游戏时 |

### 2. 计时器数据

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `observeDuration` | Number | 1500 | 观察阶段时长（毫秒） |
| `playDuration` | Number | 4000 | 游戏阶段时长（毫秒） |
| `timerInterval` | Object | null | 计时器实例 |
| `timerType` | String | null | 计时器类型：'raf' / 'interval' |
| `timerRemaining` | Number | 0 | 剩余时间（毫秒） |
| `activeWaveCompleted` | Boolean | false | 当前关卡是否已完成 |

---

## 排行榜数据

### 1. 排行榜数据结构

```javascript
// 排行榜缓存结构
leaderboardCache: {
  score: {
    data: null,        // 排行榜数据
    timestamp: 0,      // 缓存时间戳
    expire: 1800000    // 过期时间（30 分钟）
  },
  wave: {
    data: null,
    timestamp: 0,
    expire: 1800000
  }
}
```

### 2. 排行榜数据内容

```javascript
// 排行榜返回数据结构
{
  success: true,
  data: {
    type: 'score',           // 排行榜类型：'score' / 'wave'
    leaderboard: [],         // 排行榜列表（当前为空，本地版本）
    userRank: 0,             // 当前用户排名
    userValue: 0             // 当前用户数值
  },
  fromCache: false           // 是否来自缓存
}
```

### 3. 排行榜类型

| 类型 | 说明 | 排序依据 |
|------|------|---------|
| `score` | 最高分排行榜 | 按最高分降序 |
| `wave` | 最高关卡排行榜 | 按最高关卡降序 |

### 4. 排行榜展示

- **前三名**：卡片式展示，第 1 名居中突出
- **4-6 名**：列表式展示
- **加载状态**：骨架屏动画

---

## 赛季数据

### 1. 赛季信息

```javascript
// 赛季信息结构
seasonInfo: {
  currentSeasonId: '',     // 当前赛季编号（如 '2026-S24'）
  seasonStartTime: 0,      // 赛季开始时间（时间戳）
  seasonEndTime: 0,        // 赛季结束时间（时间戳）
  timeRemaining: 0         // 剩余时间（毫秒）
}
```

### 2. 赛季数据

```javascript
// 赛季数据结构
seasonData: {
  seasonId: '',            // 赛季编号
  seasonScore: 0,          // 赛季最高分
  seasonWave: 0,           // 赛季最高关卡
  totalGames: 0,           // 总局数
  totalClears: 0,          // 通关次数
  bestStreak: 0,           // 最佳连胜
  userRank: 0,             // 排名
  rewardCoins: 0,          // 奖励金币
  settled: false           // 是否已结算
}
```

### 3. 赛季周期

- **周期**：每周六 00:00 至次周五 24:00
- **编号格式**：`YYYY-Sww`（如 `2026-S24`）
- **计算方式**：基于赛季开始日期计算第几周

### 4. 赛季排名缓存

```javascript
// 赛季排名缓存结构
seasonLeaderboardCache: {
  score: {
    data: null,
    timestamp: 0,
    expire: 1800000    // 30 分钟缓存
  },
  wave: {
    data: null,
    timestamp: 0,
    expire: 1800000
  }
}
```

### 5. 赛季排名数据

```javascript
// 赛季排名返回数据结构
{
  success: true,
  data: {
    type: 'score',               // 排行榜类型
    seasonId: '2026-S24',        // 赛季编号
    seasonStartTime: 0,          // 赛季开始时间
    seasonEndTime: 0,            // 赛季结束时间
    leaderboard: [],             // 排行榜列表（当前为空，本地版本）
    userRank: 0,                 // 当前用户排名
    userValue: 0,                // 当前用户数值
    userStats: {                 // 用户赛季统计
      totalGames: 0,             // 总局数
      totalClears: 0,            // 通关次数
      bestStreak: 0              // 最佳连胜
    }
  },
  fromCache: false
}
```

---

## 签到数据

### 1. 签到配置

```javascript
// 签到配置（config.js）
checkin: {
  rewards: {
    1: { base: 300, bonus: 0 },    // 第 1 天：300 金币
    2: { base: 500, bonus: 0 },    // 第 2 天：500 金币
  },
  defaultBase: 1000,               // 默认基础奖励（第 3-6 天）
  bonusDay: 7,                     // bonus 天数（7 的倍数）
  bonusAmount: 2000                // bonus 额外奖励
}
```

### 2. 签到奖励规则

| 签到天数 | 基础奖励 | 额外奖励 | 总奖励 | 说明 |
|---------|---------|---------|-------|------|
| 第 1 天 | 300 | 0 | 300 | 首次签到 |
| 第 2 天 | 500 | 0 | 500 | 连续签到 |
| 第 3 天 | 1000 | 0 | 1000 | 默认奖励 |
| 第 4 天 | 1000 | 0 | 1000 | 默认奖励 |
| 第 5 天 | 1000 | 0 | 1000 | 默认奖励 |
| 第 6 天 | 1000 | 0 | 1000 | 默认奖励 |
| 第 7 天 | 1000 | 2000 | 3000 | 7 天连签 bonus |
| 第 8 天 | 1000 | 0 | 1000 | 重新开始 |
| 第 14 天 | 1000 | 2000 | 3000 | 14 天连签 bonus |

### 3. 签到状态

```javascript
// 签到状态结构
{
  canCheckin: true,        // 是否可以签到
  streak: 0,               // 连续签到天数
  todayReward: {           // 今日奖励
    type: 'coin',          // 奖励类型
    amount: 1000,          // 奖励数量
    baseReward: 1000,      // 基础奖励
    bonusReward: 0,        // 额外奖励
    isBonusDay: false      // 是否为 bonus 天
  },
  cloudAvailable: false    // 云端是否可用（当前为 false）
}
```

### 4. 签到逻辑

```javascript
// 签到判断逻辑
doLocalCheckin() {
  const today = getTodayString()
  const yesterday = getYesterdayString()
  
  // 检查今天是否已签到
  if (this.lastCheckinDate === today) {
    return null // 今天已签到
  }
  
  if (this.lastCheckinDate === yesterday) {
    // 连续签到
    this.checkinStreak++
  } else if (this.lastCheckinDate !== today) {
    // 中断后重新签到或首次签到
    this.checkinStreak = 1
  }
  
  this.lastCheckinDate = today
  setStorage('lastCheckinDate', today)
  setStorage('checkinStreak', this.checkinStreak)
  
  // 获取奖励
  const reward = this.getTodayReward()
  this.addCoins(reward.amount)
  return { type: 'coin', amount: reward.amount }
}
```

---

## 分享数据

### 1. 分享类型

| 类型 | 触发方式 | 奖励 | 限制 |
|------|---------|------|------|
| 快速分享 | 底部分享按钮 | +50 金币 | 每日上限 10 次 |
| 分享礼包 | 右上角宝箱图标 | +1000 金币 | 每日 1 次 |

### 2. 分享数据

```javascript
// 分享数据（内存中）
pendingShare: {
  type: 'quick',           // 分享类型：'quick' / 'gift'
  startedAt: 0,            // 分享开始时间
  hiddenAt: null,          // 游戏隐藏时间
  sawHide: false,          // 是否看到游戏隐藏
  armed: false,            // 是否已武装（分享面板弹出后）
  granted: false           // 是否已发奖
}
```

### 3. 分享奖励发放逻辑

```javascript
// 快速分享奖励
applyShareReward('quick') {
  if (this.gameState.getTodayShareCount() >= config.game.maxShareCountPerDay) {
    this.uiManager.showToast('今日分享次数已达上限')
    return
  }
  this.gameState.recordShare()  // 记录分享并发放奖励
  this.uiManager.showToast(`分享成功！金币 +${config.rewards.share}`)
}

// 分享礼包奖励
applyShareReward('gift') {
  if (!this.gameState.canShareGift()) {
    this.uiManager.showToast('今日分享礼包已领取')
    return
  }
  this.gameState.claimShareGift()  // 领取分享礼包
  this.uiManager.showToast(`分享成功！金币 +${config.rewards.shareGift}`)
}
```

### 4. 分享配置

```javascript
// 分享配置（config.js）
game: {
  maxShareCountPerDay: 10    // 每日最大分享次数
}

rewards: {
  share: 50,                 // 分享奖励
  shareGift: 1000            // 分享礼包奖励
}
```

---

## 用户数据

### 1. 用户信息结构

```javascript
// 用户信息结构
userInfo: {
  nickname: '',              // 用户昵称
  avatarUrl: '',             // 用户头像 URL
  authorized: false          // 是否已授权
}
```

### 2. 用户授权流程

```
首次点击屏幕
  ↓
检查是否已授权 (userInfo.authorized)
  ↓
未授权 → 调用 wx.getUserProfile()
  ↓
用户同意 → 保存昵称和头像到本地
  ↓
用户拒绝 → 使用默认昵称（"玩家" + SDK 版本）
```

### 3. 默认昵称生成

```javascript
// 默认昵称生成逻辑
const defaultNickname = `玩家${wx.getSystemInfoSync().SDKVersion || 'default'}`
```

---

## 数据流转图

```
┌─────────────────────────────────────────────────────────────┐
│                        游戏启动                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  读取本地存储数据       │
              │  - highScore          │
              │  - bestWave           │
              │  - coins              │
              │  - lastCheckinDate    │
              │  - checkinStreak      │
              │  - lastShareDate      │
              │  - todayShareCount    │
              │  - lastShareGiftDate  │
              │  - nickname           │
              │  - avatarUrl          │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  初始化游戏状态        │
              └───────────┬───────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     游戏进行中                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  更新运行时数据        │
              │  - score              │
              │  - wave               │
              │  - lives              │
              │  - targets            │
              │  - playerClicks       │
              │  - phase              │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  更新本地存储数据       │
              │  - highScore          │
              │  - bestWave           │
              │  - coins              │
              └───────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     签到流程                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  检查今天是否已签到     │
              │  (lastCheckinDate)    │
              └───────────┬───────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      ┌───────────────┐      ┌───────────────┐
      │ 未签到         │      │ 已签到         │
      │ 更新本地数据    │      │ 提示已签到     │
      │ - lastCheckinDate│     └───────────────┘
      │ - checkinStreak │
      │ 发放奖励金币     │
      └───────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     分享流程                                 │
└─────────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      ┌───────────────┐      ┌───────────────┐
      │ 快速分享       │      │ 分享礼包       │
      │ 检查次数限制    │      │ 检查是否已领取  │
      │ (todayShareCount│     │ (lastShareGiftDate)│
      └───────┬───────┘      └───────┬───────┘
              │                       │
              ▼                       ▼
      ┌───────────────┐      ┌───────────────┐
      │ 发起分享       │      │ 发起分享       │
      │ +50 金币       │      │ +1000 金币     │
      │ 更新分享次数    │      │ 更新礼包日期    │
      └───────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     赛季数据                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  计算赛季周期          │
              │  (seasonUtils.js)     │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  更新赛季数据          │
              │  - seasonScore        │
              │  - seasonWave         │
              │  - totalClears        │
              │  - bestStreak         │
              └───────────────────────┘
```

---

## 数据更新时机总结

| 数据项 | 更新时机 | 存储方式 |
|--------|---------|---------|
| `highScore` | 游戏结束时（破纪录时） | 本地存储 |
| `bestWave` | 通关时（破纪录时） | 本地存储 |
| `coins` | 获得/消耗金币时 | 本地存储 |
| `lastCheckinDate` | 签到时 | 本地存储 |
| `checkinStreak` | 签到时 | 本地存储 |
| `lastShareDate` | 分享时 | 本地存储 |
| `todayShareCount` | 分享时 | 本地存储 |
| `lastShareGiftDate` | 领取分享礼包时 | 本地存储 |
| `nickname` | 用户授权时 | 本地存储 |
| `avatarUrl` | 用户授权时 | 本地存储 |
| `userInfoAuthorized` | 用户授权时 | 本地存储 |
| 赛季数据 | 通关时 | 内存（不持久化） |
| 排行榜数据 | 打开排行榜时 | 缓存（30 分钟） |

---

*文档生成时间：2026-06-09*
