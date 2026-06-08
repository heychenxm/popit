# 赛季排名系统部署指南

## 📋 概述

本文档说明如何部署赛季排名系统，包括云函数部署、数据库集合创建和定时触发器配置。

---

## 🗂️ 已创建/修改的文件

### 新增文件
1. **`src/seasonUtils.js`** - 赛季工具函数（前端使用）
2. **`cloudfunctions/seasonLeaderboard/index.js`** - 赛季排行榜云函数
3. **`cloudfunctions/seasonSettlement/index.js`** - 赛季结算云函数

### 修改文件
1. **`cloudfunctions/gameData/index.js`** - 添加 `updateSeasonData` action
2. **`src/GameState.js`** - 添加赛季数据管理功能
3. **`src/Main.js`** - 集成赛季数据更新
4. **`src/UIManager.js`** - 显示赛季信息（倒计时、赛季编号）

---

## 🚀 部署步骤

### 步骤 1：创建数据库集合

在微信开发者工具中，打开云开发控制台，创建以下集合：

#### 1.1 创建 `season_data` 集合
- 集合名称：`season_data`
- 权限设置：所有用户可读，仅创建者可写

#### 1.2 创建 `season_config` 集合
- 集合名称：`season_config`
- 权限设置：仅管理员可写，所有用户可读

#### 1.3 初始化 `season_config` 数据
在 `season_config` 集合中添加一条文档：
```json
{
  "_id": "config",
  "currentSeasonId": "2025-S24",
  "seasonStartTime": 1719004800000,
  "seasonEndTime": 1719609600000,
  "version": 1
}
```

> 💡 提示：`seasonStartTime` 和 `seasonEndTime` 会在首次结算时自动更新，初始值可任意设置。

#### 1.4 更新 `user_profile` 集合
在 `user_profile` 集合中，为现有用户添加以下字段（可选）：
- `seasonReward`：赛季奖励金币累计
- `seasonTitle`：赛季称号

---

### 步骤 2：部署云函数

在微信开发者工具中，右键点击每个云函数目录，选择"上传并部署：云端安装依赖"。

#### 2.1 部署 `seasonLeaderboard` 云函数
- 路径：`cloudfunctions/seasonLeaderboard/`
- 功能：获取当前赛季排行榜数据

#### 2.2 部署 `seasonSettlement` 云函数
- 路径：`cloudfunctions/seasonSettlement/`
- 功能：每周自动结算赛季排名并发放奖励

#### 2.3 更新 `gameData` 云函数
- 路径：`cloudfunctions/gameData/`
- 新增 action：`updateSeasonData`

---

### 步骤 3：配置定时触发器

#### 3.1 创建定时触发器
在微信开发者工具中：
1. 打开云开发控制台
2. 进入"云函数"页面
3. 选择 `seasonSettlement` 云函数
4. 点击"触发器"标签页
5. 点击"添加触发器"
6. 配置如下：
   - 触发器名称：`seasonSettlement`
   - 触发周期：`自定义触发周期`
   - Cron 表达式：`0 5 * * 6`（每周六 00:05 触发）

#### 3.2 Cron 表达式说明
```
0 5 * * 6
│ │ │ │ │
│ │ │ │ └─ 星期几（0-7，0 和 7 都表示周日，6 表示周六）
│ │ │ └─── 月份（1-12）
│ │ └───── 日期（1-31）
│ └─────── 小时（0-23）
└───────── 分钟（0-59）
```

> 💡 说明：`0 5 * * 6` 表示每周六凌晨 00:05 执行，避开整点并发。

---

## 🧪 测试验证

### 4.1 测试赛季数据更新
1. 启动游戏
2. 完成一关
3. 检查云数据库 `season_data` 集合，确认数据已写入

### 4.2 测试赛季排行榜
1. 点击主菜单"排行榜"按钮
2. 确认显示当前赛季编号（如 `2025-S24`）
3. 确认显示赛季倒计时

### 4.3 测试赛季结算（手动触发）
在云开发控制台中，手动触发 `seasonSettlement` 云函数：
1. 进入云函数页面
2. 选择 `seasonSettlement`
3. 点击"测试"按钮
4. 检查日志输出，确认结算成功
5. 检查 `season_data` 集合，确认 `settled` 字段已更新
6. 检查 `user_profile` 集合，确认奖励金币已发放

---

## 📊 数据库结构

### `season_data` 集合
```javascript
{
  _id: "自动生成",
  openid: "用户 openid",
  seasonId: "2025-S24",           // 赛季编号
  seasonScore: 0,                  // 赛季最高分
  seasonWave: 0,                   // 赛季最高关卡
  totalGames: 0,                   // 本周游戏总局数
  totalClears: 0,                  // 本周通关总次数
  bestStreak: 0,                   // 本周最佳连胜
  lastUpdateTime: 1719000000000,   // 最后更新时间
  settled: false,                  // 是否已结算
  rank: 0,                         // 结算后的排名
  rewardCoins: 0                   // 结算奖励金币
}
```

### `season_config` 集合
```javascript
{
  _id: "config",
  currentSeasonId: "2025-S24",     // 当前赛季编号
  seasonStartTime: 1719004800000,  // 赛季开始时间戳
  seasonEndTime: 1719609600000,    // 赛季结束时间戳
  lastSettlementTime: 0,           // 上次结算时间
  lastSettlementSeason: "",        // 上次结算的赛季编号
  version: 1                       // 配置版本号
}
```

---

## 🎁 奖励配置

| 排名 | 奖励金币 | 称号 |
|------|---------|------|
| 第 1 名 | 5000 | 🥇 赛季冠军 |
| 第 2 名 | 3000 | 🥈 赛季亚军 |
| 第 3 名 | 2000 | 🥉 赛季季军 |
| 第 4-10 名 | 1000 | 💎 精英玩家 |
| 第 11-50 名 | 500 | ⭐ 优秀玩家 |
| 第 51-100 名 | 200 | 🎮 参与奖 |

---

## ⚠️ 注意事项

1. **数据安全**：赛季数据与历史数据分离，`user_profile` 中的最高分/最高关卡永久保留
2. **性能优化**：排行榜查询限制返回数量（前 6 名 + 当前用户）
3. **定时触发**：避开整点并发，建议设置为 00:05
4. **错误处理**：结算失败不会影响游戏运行，可手动重试

---

## 🔧 故障排查

### 问题 1：赛季数据未更新
- 检查云函数 `gameData` 是否已部署最新版本
- 检查 `season_data` 集合权限设置
- 查看云函数日志，确认是否有错误

### 问题 2：排行榜不显示
- 检查云函数 `seasonLeaderboard` 是否已部署
- 检查 `season_data` 集合是否有数据
- 查看前端控制台日志

### 问题 3：定时触发器未执行
- 检查 Cron 表达式是否正确：`0 5 * * 6`
- 检查云函数 `seasonSettlement` 是否已绑定触发器
- 手动触发测试，查看日志

---

## 📞 技术支持

如有问题，请检查：
1. 云函数日志（云开发控制台 → 云函数 → 日志）
2. 前端控制台日志（微信开发者工具 → 控制台）
3. 数据库数据（云开发控制台 → 数据库）

---

**部署完成后，赛季排名系统即可正常运行！** 🎉
