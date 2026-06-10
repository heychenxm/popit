# 泡泡大师 - 数据结构文档

## 📋 目录

1. [本地存储数据结构](#一本地存储数据结构)
2. [云数据库数据结构](#二云数据库数据结构)
3. [数据同步机制](#三数据同步机制)
4. [缓存策略](#四缓存策略)

---

## 一、本地存储数据结构

本地存储使用微信小游戏的 `wx.setStorageSync` / `wx.getStorageSync` API，数据以键值对形式存储。

### 1.1 玩家核心数据

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `highScore` | Number | 0 | 历史最高分 |
| `bestWave` | Number | 0 | 历史最高通关关卡 |
| `coins` | Number | 1000 | 当前金币数量（初始 1000） |

**存储位置**：`GameState` 构造函数初始化时读取

```javascript
this.highScore = Number(getStorage('highScore', 0)) || 0
this.bestWave = Number(getStorage('bestWave', 0)) || 0
this.coins = Number(getStorage('coins', config.game.initialCoins)) || config.game.initialCoins
```

---

### 1.2 签到数据

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `lastCheckinDate` | String | '' | 上次签到日期（格式：'YYYY-MM-DD'） |
| `checkinStreak` | Number | 0 | 连续签到天数 |

**存储位置**：`GameState.doLocalCheckin()` 方法中更新

```javascript
// 签到时更新
setStorage('lastCheckinDate', today)
setStorage('checkinStreak', this.checkinStreak)
```

**日期格式示例**：`'2026-06-09'`

---

### 1.3 分享数据

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `lastShareDate` | String | '' | 上次分享日期（格式：'YYYY-MM-DD'） |
| `todayShareCount` | Number | 0 | 今日分享次数（每日上限 10 次） |
| `lastShareGiftDate` | String | '' | 上次领取分享礼包日期（格式：'YYYY-MM-DD'） |

**存储位置**：`GameState` 的分享相关方法中更新

```javascript
// 更新分享次数
setStorage('lastShareDate', today)
setStorage('todayShareCount', this.todayShareCount)

// 领取分享礼包
setStorage('lastShareGiftDate', today)
```

---

### 1.4 用户信息

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `nickname` | String | '' | 用户昵称 |
| `avatarUrl` | String | '' | 用户头像 URL |
| `userInfoAuthorized` | Boolean | false | 用户是否已授权 |

**存储位置**：`GameState.saveUserProfileToCloud()` 方法中更新

```javascript
setStorage('nickname', nickname)
setStorage('avatarUrl', avatarUrl)
setStorage('userInfoAuthorized', true)
```

---

### 1.5 运行时状态（不持久化）

以下数据仅在内存中维护，不存储到本地：

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `score` | Number | 当前对局得分 |
| `wave` | Number | 当前关卡数 |
| `lives` | Number | 当前生命数量 |
| `targets` | Array | 目标泡泡索引数组 |
| `playerClicks` | Array | 玩家已点击的索引数组 |
| `phase` | String | 游戏阶段：'MENU' / 'OBSERVE' / 'PLAY' / 'WIN' / 'FAIL' |
| `waveScore` | Number | 当前关卡得分 |
| `consecutiveWins` | Number | 连续胜利关卡数 |
| `purchaseCount` | Number | 本局购买生命次数（最多 3 次） |
| `sessionCoins` | Number | 本局获得的金币（不含初始 1000） |
| `hasShownRecordBreakModal` | Boolean | 本局是否已显示破纪录弹窗 |
| `isNewScoreRecord` | Boolean | 本次结算是否破了最高分纪录 |
| `sessionStartHighScore` | Number | 本局开始时的历史最高分 |
| `isPaused` | Boolean | 是否暂停 |
| `pausedPhase` | String | 暂停时的阶段 |
| `pausedTimerRemaining` | Number | 暂停时的剩余时间 |

---

## 二、云数据库数据结构

云数据库使用微信云开发的 NoSQL 数据库，包含以下集合（Collection）。

### 2.1 user_profile 集合

**用途**：存储用户个人资料和游戏数据

**文档结构**：

```javascript
{
  _id: String,              // 自动生成，文档唯一 ID
  openid: String,           // 用户 OpenID，唯一标识
  nickname: String,         // 用户昵称
  avatarUrl: String,        // 用户头像 URL
  
  // 游戏数据
  highestScore: Number,     // 历史最高分
  highestWave: Number,      // 历史最高通关关卡
  coins: Number,            // 当前金币数量
  gems: Number,             // 宝石数量（预留字段）
  
  // 签到数据
  lastCheckinDate: String,  // 上次签到日期
  checkinStreak: Number,    // 连续签到天数
  achievedCheckin: Number,  // 已签到次数（预留）
  
  // 分享数据
  lastShareGiftDate: String, // 上次领取分享礼包日期
  totalShareGifts: Number,   // 累计领取分享礼包次数
  
  // 赛季奖励
  seasonReward: Number,      // 累计赛季奖励金币
  seasonTitle: String,       // 赛季称号
  
  // 时间戳
  lastUpdateTime: Number     // 最后更新时间（时间戳）
}
```

**索引建议**：
- `openid`：唯一索引
- `highestScore`：降序索引（用于排行榜）
- `highestWave`：降序索引（用于排行榜）
- `lastUpdateTime`：降序索引（用于排行榜次要排序）

---

### 2.2 season_data 集合

**用途**：存储每个赛季的玩家数据

**文档结构**：

```javascript
{
  _id: String,              // 自动生成，文档唯一 ID
  openid: String,           // 用户 OpenID
  seasonId: String,         // 赛季编号（格式：'2026-S24'）
  nickname: String,         // 用户昵称（赛季快照）
  avatarUrl: String,        // 用户头像 URL（赛季快照）
  
  // 赛季数据
  seasonScore: Number,      // 赛季最高分
  seasonWave: Number,       // 赛季最高关卡
  totalGames: Number,       // 赛季总局数
  totalClears: Number,      // 赛季通关次数
  bestStreak: Number,       // 赛季最佳连胜
  
  // 结算数据
  rank: Number,             // 赛季排名
  rewardCoins: Number,      // 赛季奖励金币
  settled: Boolean,         // 是否已结算
  settlementTime: Number,   // 结算时间（时间戳）
  
  // 时间戳
  lastUpdateTime: Number    // 最后更新时间（时间戳）
}
```

**索引建议**：
- `openid + seasonId`：复合唯一索引
- `seasonId + seasonScore`：复合降序索引（用于赛季排行榜）
- `seasonId + seasonWave`：复合降序索引（用于赛季排行榜）
- `seasonId + settled`：复合索引（用于赛季结算查询）

---

### 2.3 season_config 集合

**用途**：存储赛季配置信息（单文档）

**文档结构**：

```javascript
{
  _id: 'config',            // 固定为 'config'
  currentSeasonId: String,  // 当前赛季编号（格式：'2026-S24'）
  seasonStartTime: Number,  // 赛季开始时间（时间戳）
  seasonEndTime: Number,    // 赛季结束时间（时间戳）
  lastSettlementTime: Number, // 上次结算时间（时间戳）
  lastSettlementSeason: String, // 上次结算的赛季编号
  version: Number           // 配置版本号
}
```

---

## 三、数据同步机制

### 3.1 同步策略

**核心原则**：本地优先，云端作为备份

| 场景 | 策略 |
|------|------|
| 游戏启动 | 本地有数据则使用本地，本地无数据则从云端同步 |
| 游戏进行中 | 只更新本地，标记待同步数据 |
| 游戏结束 | 强制同步到云端 |
| 游戏隐藏（切后台） | 刷新待同步数据到云端 |
| 打开排行榜 | 先同步本地数据，再获取排行榜 |

### 3.2 同步数据字段

通过 `gameData` 云函数同步的数据：

```javascript
// 同步到云端的数据
{
  action: 'sync',
  coins: Number,              // 当前金币
  highScore: Number,          // 历史最高分
  bestWave: Number,           // 历史最高关卡
  lastCheckinDate: String,    // 上次签到日期
  checkinStreak: Number,      // 连续签到天数
  achievedCheckin: Number,    // 已签到次数
  lastShareGiftDate: String,  // 上次领取分享礼包日期
  totalShareGifts: Number,    // 累计领取分享礼包次数
  nickname: String,           // 用户昵称
  avatarUrl: String           // 用户头像 URL
}
```

### 3.3 云函数接口

#### 3.3.1 gameData 云函数

**接口**：`wx.cloud.callFunction({ name: 'gameData', data: {...} })`

**操作类型**：

| action | 说明 | 请求参数 | 返回数据 |
|--------|------|---------|---------|
| `sync` | 同步数据到云端 | 见上方同步数据字段 | `{ success: Boolean, message: String, data: Object }` |
| `get` | 从云端获取数据 | `{ action: 'get' }` | `{ success: Boolean, data: Object }` |

**返回数据结构**：

```javascript
// sync 操作返回
{
  success: true,
  message: '同步成功',
  data: {
    coins: Number,
    highScore: Number,
    bestWave: Number,
    // ... 其他字段
  }
}

// get 操作返回
{
  success: true,
  data: {
    coins: Number,
    highScore: Number,
    bestWave: Number,
    lastCheckinDate: String,
    checkinStreak: Number,
    achievedCheckin: Number,
    lastShareGiftDate: String,
    totalShareGifts: Number,
    nickname: String,
    avatarUrl: String
  }
}
```

#### 3.3.2 getLeaderboard 云函数

**接口**：`wx.cloud.callFunction({ name: 'getLeaderboard', data: { type } })`

**参数**：
- `type`: `'score'` | `'wave'`（排行榜类型）

**返回数据结构**：

```javascript
{
  success: true,
  data: {
    type: String,               // 排行榜类型
    leaderboard: Array,         // 排行榜列表
    userRank: Number,           // 当前用户排名
    userValue: Number           // 当前用户数值
  }
}

// leaderboard 数组元素结构
{
  rank: Number | String,        // 排名（超过 100 名显示 "100+"）
  openid: String,               // 用户 OpenID
  nickname: String,             // 用户昵称
  avatarUrl: String,            // 用户头像 URL
  value: Number,                // 排名数值（分数或关卡）
  isUser: Boolean               // 是否为当前用户
}
```

#### 3.3.3 seasonLeaderboard 云函数

**接口**：`wx.cloud.callFunction({ name: 'seasonLeaderboard', data: { type } })`

**参数**：
- `type`: `'score'` | `'wave'`（排行榜类型）

**返回数据结构**：

```javascript
{
  success: true,
  data: {
    type: String,               // 排行榜类型
    seasonId: String,           // 赛季编号
    seasonStartTime: Number,    // 赛季开始时间
    seasonEndTime: Number,      // 赛季结束时间
    leaderboard: Array,         // 排行榜列表
    userRank: Number,           // 当前用户排名
    userValue: Number,          // 当前用户数值
    userStats: Object           // 用户赛季统计
  }
}

// userStats 结构
{
  totalGames: Number,           // 总局数
  totalClears: Number,          // 通关次数
  bestStreak: Number            // 最佳连胜
}
```

#### 3.3.4 saveUserProfile 云函数

**接口**：`wx.cloud.callFunction({ name: 'saveUserProfile', data: { nickname, avatarUrl } })`

**参数**：
- `nickname`: String（用户昵称，最长 32 字符）
- `avatarUrl`: String（头像 URL，最长 500 字符）

**返回数据结构**：

```javascript
{
  success: true,
  message: String,
  data: {
    nickname: String,
    avatarUrl: String
  }
}
```

---

## 四、缓存策略

### 4.1 排行榜缓存

**缓存时长**：30 分钟（1800000 毫秒）

**缓存结构**：

```javascript
// GameState.leaderboardCache
{
  score: {
    data: Object | null,      // 排行榜数据
    timestamp: Number,        // 缓存时间戳
    expire: 1800000           // 过期时间（30 分钟）
  },
  wave: {
    data: Object | null,
    timestamp: Number,
    expire: 1800000
  }
}
```

**使用逻辑**：
1. 检查缓存是否有效（未过期）
2. 有效则直接返回缓存数据
3. 无效则调用云函数获取最新数据并更新缓存
4. 如果获取失败但缓存存在，返回过期缓存作为降级

### 4.2 赛季排名缓存

**缓存时长**：30 分钟（1800000 毫秒）

**缓存结构**：

```javascript
// GameState.seasonLeaderboardCache
{
  score: {
    data: Object | null,
    timestamp: Number,
    expire: 1800000
  },
  wave: {
    data: Object | null,
    timestamp: Number,
    expire: 1800000
  }
}
```

### 4.3 签到状态缓存

**缓存时长**：5 分钟（300000 毫秒）

**缓存结构**：

```javascript
// GameState.checkinStatusCache
{
  data: Object | null,
  timestamp: Number
}
```

> **注意**：当前签到功能完全使用本地数据，不使用云端缓存。

### 4.4 云数据管理器缓存

**同步间隔**：最小 5 分钟（300000 毫秒）

**缓存结构**：

```javascript
// CloudDataManager
{
  pendingUpdates: Object,     // 待同步的数据
  isSyncing: Boolean,         // 是否正在同步
  failCount: Number,          // 同步失败次数
  maxFailCount: 3,            // 最大失败次数
  lastSyncTime: Number        // 上次同步时间
}
```

**同步逻辑**：
1. 检查是否有待同步数据
2. 检查是否正在同步中
3. 检查最小同步间隔（5 分钟内不重复同步）
4. 检查失败次数（超过 3 次停止自动同步）
5. 执行同步，成功则重置失败计数，失败则重新加入缓存

---

## 五、数据流转图

```
┌─────────────────────────────────────────────────────────────┐
│                        游戏启动                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  检查本地数据是否完整  │
              └───────────┬───────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
    ┌───────────────┐          ┌───────────────┐
    │ 本地有数据     │          │ 本地无数据     │
    │ 使用本地数据   │          │ 从云端同步     │
    └───────┬───────┘          └───────┬───────┘
            │                           │
            └─────────────┬─────────────┘
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
              │  更新本地数据          │
              │  标记待同步数据        │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  不立即同步到云端      │
              │  等待同步时机          │
              └───────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     同步时机                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┬─────────────────┐
              │                       │                 │
              ▼                       ▼                 ▼
      ┌───────────────┐      ┌───────────────┐  ┌───────────────┐
      │ 游戏结束       │      │ 游戏隐藏       │  │ 打开排行榜     │
      │ 强制同步       │      │ 刷新同步       │  │ 先同步再获取   │
      └───────┬───────┘      └───────┬───────┘  └───────┬───────┘
              │                       │                 │
              └─────────────┬─────────┴─────────────────┘
                            ▼
              ┌───────────────────────┐
              │  调用 gameData 云函数  │
              │  同步到 user_profile   │
              └───────────────────────┘
```

---

## 六、数据一致性保障

### 6.1 本地优先策略

- 本地数据完整时（bestWave > 0 或 highScore > 0 或 coins > 1000），跳过云端同步
- 本地数据为空时，从云端同步作为备份

### 6.2 云端同步条件

- 只在本地数据为空或等于初始值时，才使用云端数据覆盖本地
- 同步时取云端和本地的最大值（如 highScore、bestWave）

### 6.3 失败处理

- 云函数调用失败不影响游戏进行
- 同步失败时数据保留在 `pendingUpdates` 中，等待下次同步
- 连续失败 3 次后停止自动同步

---

## 七、数据安全

### 7.1 用户隐私

- 仅获取用户昵称和头像（用于排行榜展示）
- 用户拒绝授权时使用默认昵称
- 不存储用户敏感信息

### 7.2 输入验证

- 昵称长度限制：32 字符
- 头像 URL 长度限制：500 字符
- 昵称字符过滤：只允许中文、英文、数字、常见符号

### 7.3 云数据库安全规则

建议配置以下安全规则：

```json
{
  "user_profile": {
    "read": "auth.openid == doc.openid",
    "write": "auth.openid == doc.openid"
  },
  "season_data": {
    "read": "auth.openid == doc.openid",
    "write": "auth.openid == doc.openid"
  },
  "season_config": {
    "read": true,
    "write": "false"
  }
}
```

---

*文档生成时间：2026-06-09*
