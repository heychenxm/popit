# 云函数调用追踪系统

## 功能概述

每次调用云函数时，系统会自动在本地 storage 中记录以下信息：
- **云函数名称** (functionName)
- **调用时间戳** (timestamp)
- **调用日期** (date)
- **是否成功** (success)
- **调用耗时** (duration，毫秒)
- **错误信息** (errorMsg，失败时)
- **参数键名列表** (paramKeys，只记录参数名，不记录完整数据)

## API 使用

### 1. 自动记录（推荐）

使用 `callCloudFunction` 替代 `wx.cloud.callFunction`，会自动记录调用信息：

```javascript
import { callCloudFunction } from './utils.js'

// 调用云函数（自动记录）
const result = await callCloudFunction('gameData', {
  action: 'sync',
  highestWave: 10,
  highestScore: 100
})
```

### 2. 获取调用记录

```javascript
import { getCloudCallLogs } from './utils.js'

// 获取所有记录
const allLogs = getCloudCallLogs()

// 按云函数名称筛选
const gameDataLogs = getCloudCallLogs('gameData')

// 按日期筛选
const todayLogs = getCloudCallLogs(null, '2026-06-08')

// 按名称和日期筛选
const specificLogs = getCloudCallLogs('gameData', '2026-06-08')
```

### 3. 获取调用统计

```javascript
import { getCloudCallStats } from './utils.js'

// 获取所有统计
const allStats = getCloudCallStats()
// 返回：
// {
//   total: 100,          // 总调用次数
//   success: 95,         // 成功次数
//   fail: 5,             // 失败次数
//   totalDuration: 5000, // 总耗时（毫秒）
//   avgDuration: 50,     // 平均耗时（毫秒）
//   byFunction: {        // 按云函数分组统计
//     gameData: {
//       total: 60,
//       success: 58,
//       fail: 2,
//       totalDuration: 3000,
//       avgDuration: 50
//     },
//     getLeaderboard: {
//       total: 40,
//       success: 37,
//       fail: 3,
//       totalDuration: 2000,
//       avgDuration: 50
//     }
//   }
// }

// 获取今天的统计
const todayStats = getCloudCallStats('2026-06-08')
```

### 4. 清空记录

```javascript
import { clearCloudCallLogs } from './utils.js'

// 清空所有调用记录
clearCloudCallLogs()
```

### 5. 手动记录（特殊场景）

```javascript
import { recordCloudCall } from './utils.js'

// 手动记录一次调用
recordCloudCall('gameData', { action: 'sync' }, true, 120, '')
```

## Storage 存储

- **记录 Storage Key**: `cloudCallLog`
- **统计 Storage Key**: `cloudCallStats`（独立总数统计）
- **最大记录数**: 100 条（超出后自动删除最旧的记录）
- **数据格式**: JSON

### 独立统计数据结构

`cloudCallStats` 存储了完整的调用统计信息：

```json
{
  "total": 100,              // 总调用次数
  "success": 95,             // 总成功次数
  "fail": 5,                 // 总失败次数
  "totalDuration": 5000,     // 总耗时（毫秒）
  "avgDuration": 50,         // 平均耗时（毫秒）
  "byFunction": {            // 按云函数分组统计
    "gameData": {
      "total": 60,
      "success": 58,
      "fail": 2,
      "totalDuration": 3000,
      "avgDuration": 50
    },
    "getLeaderboard": {
      "total": 40,
      "success": 37,
      "fail": 3,
      "totalDuration": 2000,
      "avgDuration": 50
    }
  },
  "byDate": {                // 按日期分组统计
    "2026-06-08": {
      "total": 30,
      "success": 28,
      "fail": 2,
      "totalDuration": 1500,
      "avgDuration": 50
    },
    "2026-06-07": {
      "total": 25,
      "success": 25,
      "fail": 0,
      "totalDuration": 1200,
      "avgDuration": 48
    }
  }
}
```

## 已修改的文件

1. **src/utils.js** - 新增云函数调用记录功能
2. **src/GameState.js** - 所有云函数调用改为使用 `callCloudFunction`
3. **src/CloudDataManager.js** - 云函数调用改为使用 `callCloudFunction`

## 云函数调用点

当前项目中调用云函数的地方：

| 云函数名称 | 调用位置 | 用途 |
|-----------|---------|------|
| gameData | GameState.js, CloudDataManager.js | 数据同步、更新、赛季数据 |
| getLeaderboard | GameState.js | 获取排行榜 |
| saveUserProfile | GameState.js | 保存用户资料 |
| seasonLeaderboard | GameState.js | 获取赛季排行榜 |

## 调试

在微信开发者工具控制台中，每次云函数调用都会输出日志：

```
[云函数调用记录] gameData - 成功 (120ms)
[云函数调用记录] getLeaderboard - 失败 (5000ms)
```

## 注意事项

1. 只记录参数的键名，不记录完整参数值（节省存储空间）
2. 最多保存 100 条记录，超出后自动删除最旧的
3. 记录失败不会影响云函数调用的正常执行
4. 所有记录操作都有 try-catch 保护，不会导致游戏崩溃
