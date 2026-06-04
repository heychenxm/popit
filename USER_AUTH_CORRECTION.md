# 用户信息授权流程修正说明

## 修正内容

**之前的错误实现**：
- ❌ 在点击排行榜时才弹出授权提示对话框
- ❌ 使用自定义对话框二次确认
- ❌ 不符合"首次打开小游戏时获取"的需求

**修正后的正确实现**：
- ✅ 用户**首次点击屏幕任意位置**时，直接弹出微信官方授权窗口
- ✅ 无需二次确认，直接获取头像昵称
- ✅ 符合微信规范（用户主动触发）
- ✅ 只弹出一次，拒绝后不再打扰

---

## 实现原理

### 微信规范限制
`wx.getUserProfile` **不能在游戏启动时自动弹出**，必须由用户**主动触发**（触摸屏幕）。

### 解决方案
在用户**第一次触摸屏幕**时（点击任意位置）立即调用 `wx.getUserProfile`，这样：
- ✅ 符合微信"主动触发"的要求
- ✅ 用户体验：刚打开游戏点一下就弹出授权
- ✅ 只触发一次，后续不再弹出

---

## 代码修改

### 1. 新增 `tryInitUserInfo()` 方法

**位置**: `src/Main.js`

```javascript
async tryInitUserInfo() {
  // 如果已经授权过，不再弹出
  if (this.gameState.userInfo.authorized) {
    return
  }
  
  // 标记已尝试，避免重复弹出
  if (this.hasTriedInitUserInfo) {
    return
  }
  this.hasTriedInitUserInfo = true
  
  try {
    // 尝试获取用户信息
    const userInfo = await this.gameState.getUserProfile()
    console.log('获取用户信息成功:', userInfo)
    
    // 保存到云端
    const result = await this.gameState.saveUserProfileToCloud(
      userInfo.nickName,
      userInfo.avatarUrl
    )
    
    if (result.success) {
      console.log('用户资料保存成功')
    }
  } catch (err) {
    // 用户拒绝授权，使用默认头像
    console.log('用户拒绝授权，使用默认头像')
    const defaultNickname = `玩家${wx.getSystemInfoSync().SDKVersion || 'default'}`
    await this.gameState.saveUserProfileToCloud(defaultNickname, '')
  }
}
```

### 2. 在 `handleTouchStart()` 中调用

```javascript
handleTouchStart(x, y) {
  // 首次点击时触发用户信息授权（符合微信规范）
  this.tryInitUserInfo()
  
  // ... 其他处理逻辑
}
```

### 3. 删除不必要的对话框

- ❌ 删除 `showUserInfoAuthDialog()` 方法
- ❌ 删除 `showLeaderboard()` 中的授权检查

---

## 执行流程

### 首次打开游戏

```
游戏启动
  ↓
用户点击屏幕任意位置（开始游戏/排行榜/签到等）
  ↓
触发 handleTouchStart()
  ↓
调用 tryInitUserInfo()
  ↓
检查：未授权 + 未尝试过
  ↓
直接弹出微信官方授权窗口 ✅
  ↓
用户同意 → 获取真实头像昵称 → 保存到云端
  ↓
用户拒绝 → 使用默认头像 → 保存到云端
```

### 再次打开游戏

```
游戏启动
  ↓
用户点击屏幕
  ↓
检查：已授权 → 直接返回 ✅
  ↓
不再弹出授权窗口
```

### 拒绝授权后

```
游戏启动
  ↓
用户点击屏幕
  ↓
弹出微信授权窗口
  ↓
用户拒绝
  ↓
使用默认头像
  ↓
标记已尝试，不再弹出 ✅
```

---

## 测试步骤

### 步骤 1: 清除本地数据
微信开发者工具：
```
工具 → 清除数据 → 清除全部
```

### 步骤 2: 启动游戏
- 游戏启动，**不会**自动弹出授权 ✅

### 步骤 3: 点击屏幕任意位置
- 点击"开始游戏"或任何按钮
- **立即弹出微信官方授权窗口** ✅
- 显示用户头像和昵称预览 ✅

### 步骤 4: 点击"允许"
- 获取真实头像昵称 ✅
- 保存到云端 ✅
- 排行榜显示真实信息 ✅

### 步骤 5: 重新打开游戏
- 点击屏幕，**不会**再次弹出授权 ✅
- 直接使用已授权的信息 ✅

---

## 关键特性

### 1. 只弹出一次
```javascript
if (this.hasTriedInitUserInfo) {
  return  // 已经尝试过，不再弹出
}
this.hasTriedInitUserInfo = true  // 标记已尝试
```

### 2. 已授权不再弹出
```javascript
if (this.gameState.userInfo.authorized) {
  return  // 已授权，不再弹出
}
```

### 3. 拒绝后不再打扰
```javascript
catch (err) {
  // 用户拒绝，使用默认头像
  // 但已标记 hasTriedInitUserInfo = true
  // 下次不会再弹出
}
```

### 4. 任意点击触发
```javascript
handleTouchStart(x, y) {
  this.tryInitUserInfo()  // 任何触摸都触发
  // ... 其他逻辑
}
```

---

## 优势

### 1. 符合微信规范 ✅
- 用户主动触发（触摸屏幕）
- 不是自动弹出
- 不会被微信拒绝

### 2. 用户体验好 ✅
- 首次点击就弹出，符合"首次打开"的感觉
- 无需二次确认，直接获取
- 拒绝后不再打扰

### 3. 简单直接 ✅
- 没有自定义对话框
- 直接显示微信官方窗口
- 代码简洁清晰

### 4. 智能判断 ✅
- 已授权：不再弹出
- 已尝试：不再弹出
- 只触发一次

---

## 注意事项

### 1. 触发时机
- ✅ 第一次触摸屏幕时
- ❌ 游戏启动时（不会弹出）
- ❌ 点击特定按钮时（太晚了）

### 2. 授权说明
微信官方窗口会显示：
```
申请获取以下权限
· 你的昵称、头像、性别
```

### 3. 拒绝处理
- 用户拒绝后，使用默认头像
- 不会再次弹出授权窗口
- 游戏功能不受影响

---

## 相关文件

- `src/Main.js` - 主要逻辑修改
  - `tryInitUserInfo()` - 新增方法
  - `handleTouchStart()` - 添加调用
- `src/GameState.js` - 用户信息管理
- `src/UIManager.js` - 头像绘制

---

## 常见问题

### Q: 为什么不在游戏启动时弹出？
A: 微信规定必须由用户主动触发，自动弹出会被拒绝。

### Q: 用户拒绝后如何重新授权？
A: 当前版本拒绝后不再弹出。后续可以添加"我的"页面，提供手动授权按钮。

### Q: 为什么点击后才弹出，不是打开游戏就弹出？
A: 这是微信的限制，必须用户主动触发。但体验上非常接近"打开游戏就弹出"。

---

**修正完成时间**: 2026-06-04  
**版本**: v1.0.2
