# 云函数调用统计使用说明

## 查看统计信息

### 方法 1：在控制台查看

在微信开发者工具的控制台中输入：

```javascript
game.debugCloudStats()
```

会输出类似以下信息：
```
=== 云函数调用统计 ===
总更新请求次数：50
今日更新请求次数：50
实际云函数调用次数：15
合并次数：35
合并率：70.0%
=====================
```

### 方法 2：在代码中获取

```javascript
const stats = gameState.getCloudCallStats()
console.log(stats)
// 输出：
// {
//   totalUpdateRequests: 50,      // 总更新请求次数
//   todayUpdateRequests: 50,      // 今日更新请求次数
//   todayDate: "2026-06-05",      // 今日日期
//   actualCloudCalls: 15,         // 实际云函数调用次数
//   mergedCount: 35,              // 合并次数
//   mergeRate: "70.0",            // 合并率（%）
//   lastFlushTime: 1234567890     // 上次 flush 时间
// }
```

### 方法 3：查看 Storage 中的原始数据

在微信开发者工具的控制台中输入：

```javascript
wx.getStorageSync('cloudCallTotal')     // 总更新请求次数
wx.getStorageSync('cloudCallToday')     // 今日更新请求次数
wx.getStorageSync('cloudCallDate')      // 今日日期
wx.getStorageSync('cloudCallActual')    // 实际云函数调用次数
wx.getStorageSync('cloudCallMerged')    // 合并次数
```

## 重置统计数据

在控制台输入：

```javascript
game.gameState.resetCloudCallStats()
```

## 统计字段说明

| 字段 | 说明 |
|------|------|
| `totalUpdateRequests` | 总更新请求次数（累计，不会自动重置） |
| `todayUpdateRequests` | 今日更新请求次数（每天 0 点自动重置） |
| `todayDate` | 今日日期（YYYY-MM-DD 格式） |
| `actualCloudCalls` | 实际云函数调用次数 |
| `mergedCount` | 合并次数（被 CloudDataManager 合并的次数） |
| `mergeRate` | 合并率（%），越高说明优化效果越好 |
| `lastFlushTime` | 上次 flush 时间（时间戳） |

## 优化效果评估

### 优化前
- 每次通关：1 次调用
- 每次分享：1 次调用
- 每次签到：1 次调用
- 无缓存机制

### 优化后
- 多次通关：合并为 1-2 次调用
- 多次分享：合并为 1 次调用
- 排行榜：5 分钟缓存
- 合并率通常可达 70-80%

### 如何判断优化效果

1. **合并率 > 50%**：优化效果良好
2. **合并率 > 70%**：优化效果优秀
3. **实际调用次数 < 总请求次数的 30%**：说明缓存和合并机制工作正常

## 注意事项

1. **统计数据存储在本地**：清除缓存会导致统计数据丢失
2. **今日计数每天重置**：基于日期自动重置
3. **合并率计算**：`(总请求次数 - 实际调用次数) / 总请求次数 * 100%`

## 调试技巧

### 查看 CloudDataManager 状态

```javascript
game.gameState.cloudDataManager.getStatus()
```

### 强制同步

```javascript
game.gameState.forceSyncCloudData()
```

### 清除排行榜缓存

```javascript
game.gameState.clearLeaderboardCache()
```

### 禁用/启用自动同步

```javascript
// 禁用
game.gameState.cloudDataManager.disableAutoSync()

// 启用
game.gameState.cloudDataManager.enableAutoSync()
```

## 控制台日志

在测试过程中，你可以在控制台看到以下日志：

```
CloudDataManager 初始化完成，当前统计: {...}
记录更新请求 #1
待同步数据: {...}
记录更新请求 #2
记录合并 #1
待同步数据: {...}
开始云同步: {...}
记录云函数调用 #1
云同步成功
```

这些日志可以帮助你了解 CloudDataManager 的工作状态。
