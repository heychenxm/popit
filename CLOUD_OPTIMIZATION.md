# 云函数调用优化方案

## 优化前的问题

1. **频繁调用 updateCloudGameData**：
   - 每次通关保存最高分时调用
   - 每次分享成功后调用
   - 每次签到后调用
   - 每次购买生命后调用

2. **没有批量更新机制**：每次只更新少量数据

3. **没有防抖/节流**：连续操作会触发多次调用

4. **云函数数量多**：5 个独立的云函数，维护成本高

## 优化方案

### 1. 创建 CloudDataManager（云数据管理器）

**文件**：`src/CloudDataManager.js`

**功能**：
- **批量更新**：将多个更新操作合并为一次调用
- **防抖机制**：延迟 5 秒同步，合并多次更新为一次
- **失败重试**：失败后自动重试，最多 3 次
- **自动禁用**：失败次数过多时自动禁用自动同步

**使用方式**：
```javascript
import { cloudDataManager } from './CloudDataManager.js'

// 添加待同步的数据（会自动合并和延迟同步）
cloudDataManager.addUpdate({
  highestScore: 1000,
  highestWave: 10,
  addCoins: 50
})

// 强制立即同步（用于游戏退出等关键场景）
await cloudDataManager.forceSync()
```

### 2. 修改 GameState.js

**修改内容**：
- `updateCloudGameData` 方法改为使用 `cloudDataManager.addUpdate()`
- 新增 `forceSyncCloudData()` 方法用于强制同步
- 新增 `syncPendingData()` 方法用于延迟同步通关数据

**优化效果**：
- 原来：每次操作都调用云函数
- 现在：多次操作合并为一次调用

### 3. 修改 Main.js

**新增功能**：
- 游戏隐藏（切换到后台）时强制同步数据
- 游戏显示（回到前台）时刷新数据

**代码**：
```javascript
bindLifecycleEvents() {
  // 游戏隐藏时强制同步
  wx.onHide(() => {
    this.gameState.syncPendingData()
    this.gameState.forceSyncCloudData()
  })
  
  // 游戏显示时刷新数据
  wx.onShow(() => {
    this.gameState.syncCloudData()
  })
}
```

### 4. 合并云函数

**优化前**：5 个独立的云函数
- `syncData` - 同步数据
- `updateGameData` - 更新数据
- `checkin` - 签到
- `getLeaderboard` - 排行榜
- `saveUserProfile` - 保存用户资料

**优化后**：4 个云函数
- `gameData` - 游戏数据（合并 syncData 和 updateGameData）
- `checkin` - 签到
- `getLeaderboard` - 排行榜
- `saveUserProfile` - 保存用户资料

**合并后的云函数**：`cloudfunctions/gameData/index.js`

支持的操作：
- `action: 'sync'` - 同步数据（游戏启动时）
- `action: 'update'` - 更新数据（通关、分享等）

### 5. 延迟通关同步

**优化前**：每次通关后立即同步

**优化后**：
- 通关时只标记 `pendingCloudSync = true`
- 游戏结束时（返回主菜单或退出）才同步

**代码**：
```javascript
// saveHighScore() - 只标记，不同步
async saveHighScore() {
  if (hasUpdate) {
    this.pendingCloudSync = true
  }
}

// resetToMenu() - 游戏结束时同步
resetToMenu() {
  this.syncPendingData()
}
```

## 优化效果对比

### 优化前
| 操作 | 云函数调用次数 |
|------|---------------|
| 通关 10 次 | 10 次 |
| 分享 5 次 | 5 次 |
| 签到 1 次 | 1 次 |
| **总计** | **16 次** |

### 优化后
| 操作 | 云函数调用次数 |
|------|---------------|
| 通关 10 次（合并为 1 次） | 1 次 |
| 分享 5 次（合并为 1 次） | 1 次 |
| 签到 1 次 | 1 次 |
| **总计** | **3 次** |

**优化比例**：约 **80%** 的调用次数减少

## 其他优化建议

### 1. 减少不必要的云函数调用

**建议**：
- 最高分和最高关卡只在游戏结束时同步，不在每次通关时同步
- 金币数据只在关键节点同步（如签到、分享、通关奖励）

### 2. 使用本地缓存

**建议**：
- 优先使用本地数据，减少云端查询
- 排行榜数据可以缓存 5 分钟，避免频繁查询

### 3. 使用数据库直连（高级）

**建议**：
- 对于简单的数据读写，可以使用数据库直连
- 减少云函数调用次数

## 注意事项

1. **数据一致性**：
   - 本地数据优先，云端数据作为备份
   - 游戏启动时同步云端数据

2. **失败处理**：
   - 云函数调用失败不影响游戏运行
   - 失败后自动重试，最多 3 次

3. **用户体验**：
   - 云同步不影响游戏性能
   - 游戏退出时确保数据已同步

## 监控建议

1. **监控云函数调用次数**：
   - 在微信云开发控制台查看调用次数
   - 设置调用次数告警

2. **监控同步成功率**：
   - 记录同步成功/失败次数
   - 分析失败原因

3. **性能监控**：
   - 监控云函数响应时间
   - 优化慢查询

## 后续优化方向

1. **实现数据版本控制**：
   - 避免多设备数据冲突
   - 实现数据合并策略

2. **实现离线支持**：
   - 离线时本地存储
   - 联网后自动同步

3. **实现数据压缩**：
   - 减少数据传输量
   - 提高同步效率
