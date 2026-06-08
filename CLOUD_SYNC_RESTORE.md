# 云端同步功能恢复

## 问题描述

**症状**：用户删除小游戏后重新扫码进入，游戏数据全部丢失。

**根本原因**：
1. 云端同步功能被完全禁用
2. 数据只保存在本地 Storage
3. 删除小游戏时，微信自动清除本地数据
4. 云端没有备份，导致数据永久丢失

## 修复方案

### 1. 恢复启动时同步

**文件**: `src/Main.js`

**修改内容**:
```javascript
async init() {
  // ... 其他初始化
  
  // 启动时同步云端数据（本地数据优先，云端作为备份）
  await this.syncCloudData()
  
  // 开始游戏循环
  this.start()
}
```

**syncCloudData() 方法**:
```javascript
async syncCloudData() {
  // 检查是否有本地数据
  const hasLocalData = this.gameState.bestWave > 0 || 
                       this.gameState.highScore > 0 || 
                       this.gameState.coins > 0
  
  if (!hasLocalData) {
    // 本地无数据，从云端同步
    const result = await this.gameState.syncCloudData()
    if (result && result.success) {
      console.log('云端数据同步成功')
    }
  } else {
    console.log('本地有数据，跳过启动同步')
  }
}
```

### 2. 恢复游戏生命周期同步

**文件**: `src/Main.js`

**修改内容**:
```javascript
bindLifecycleEvents() {
  // 游戏隐藏（切换到后台）时同步数据到云端
  wx.onHide(() => {
    this.flushCloudData()
  })
  
  // 游戏显示（回到前台）时同步云端数据
  wx.onShow(() => {
    this.syncCloudData()
  })
}
```

**flushCloudData() 方法**:
```javascript
async flushCloudData() {
  const pendingUpdates = this.gameState.getPendingCloudUpdates()
  if (pendingUpdates && Object.keys(pendingUpdates).length > 0) {
    const result = await this.gameState.flushCloudData()
    if (result && result.success) {
      console.log('云端数据刷新成功')
    }
  }
}
```

### 3. 添加 GameState 辅助方法

**文件**: `src/GameState.js`

**新增方法**:
```javascript
// 获取待同步数据
getPendingCloudUpdates() {
  return cloudDataManager.getPendingUpdates()
}

// 刷新待同步数据到云端
async flushCloudData() {
  const pendingUpdates = cloudDataManager.getPendingUpdates()
  if (Object.keys(pendingUpdates).length === 0) {
    return { success: true, message: '无待同步数据' }
  }
  
  const result = await cloudDataManager.flush()
  return result
}
```

## 数据同步策略

### 本地优先原则

```
启动时：
  本地有数据 → 使用本地数据（跳过同步）
  本地无数据 → 从云端拉取数据

游戏过程中：
  所有数据变更 → 同时保存到本地 + 加入待同步队列

游戏隐藏时（wx.onHide）：
  有待同步数据 → 刷新到云端
  无待同步数据 → 跳过

回到前台时（wx.onShow）：
  本地无数据 → 从云端同步
  本地有数据 → 跳过
```

### 同步时机

| 时机 | 操作 | 说明 |
|------|------|------|
| 游戏启动 | `syncCloudData()` | 本地无数据时从云端拉取 |
| 游戏隐藏 | `flushCloudData()` | 将待同步数据刷新到云端 |
| 回到前台 | `syncCloudData()` | 本地无数据时从云端拉取 |
| 打开排行榜 | `syncToCloud()` | 手动同步（已有功能） |

## 数据流

```
用户玩游戏
    │
    ├─ 通关/签到/分享
    │     │
    │     ├─ 保存到本地 Storage ✅
    │     │
    │     └─ 加入待同步队列 ⏳
    │
    ├─ 游戏隐藏（切到后台）
    │     │
    │     └─ flushCloudData() → 同步到云端 ✅
    │
    ├─ 删除小游戏
    │     │
    │     └─ 本地 Storage 清空 ❌
    │
    └─ 重新进入
          │
          └─ syncCloudData() → 从云端拉取 ✅
```

## 修改的文件

1. **src/Main.js**
   - `init()` - 添加启动同步
   - `bindLifecycleEvents()` - 恢复生命周期同步
   - `syncCloudData()` - 新增启动同步方法
   - `flushCloudData()` - 新增刷新同步方法

2. **src/GameState.js**
   - `getPendingCloudUpdates()` - 新增获取待同步数据
   - `flushCloudData()` - 新增刷新待同步数据

## 测试场景

### 场景 1：新用户首次进入
```
1. 扫码进入小游戏
2. 本地无数据 → 从云端同步（云端也无数据）
3. 开始新游戏
```

### 场景 2：老用户重新进入
```
1. 玩到第 10 关，得分 500
2. 删除小游戏
3. 重新扫码进入
4. 本地无数据 → 从云端同步 ✅
5. 恢复最高分 500，金币等数据 ✅
```

### 场景 3：网络异常
```
1. 离线状态下玩游戏
2. 数据保存到本地 ✅
3. 待同步数据加入队列 ⏳
4. 网络恢复后，游戏隐藏时自动同步 ✅
```

## 注意事项

1. **5 分钟同步间隔限制**：CloudDataManager 有 5 分钟最小同步间隔，避免频繁调用云函数
2. **本地数据优先**：始终优先使用本地数据，云端仅作为备份
3. **失败降级**：云端同步失败不影响游戏运行，使用本地数据即可
4. **用户隐私**：同步用户信息前需要获得授权

## 预期效果

- ✅ 用户删除小游戏后重新进入，数据可以恢复
- ✅ 多设备登录时，数据可以同步
- ✅ 网络异常时，游戏正常运行
- ✅ 不会频繁调用云函数（有 5 分钟间隔限制）
