# 用户信息获取功能实现说明

## 功能概述

实现了微信用户头像和昵称的获取功能，用于在排行榜中展示真实用户信息。

---

## 已实现的功能

### 1. 云函数 `saveUserProfile`
**位置**: `cloudfunctions/saveUserProfile/index.js`

**功能**:
- 保存或更新用户的头像和昵称到云端
- 新用户自动创建记录
- 现有用户更新资料
- 同时初始化游戏数据（最高分、最高关卡、金币等）

**数据结构**:
```javascript
{
  _id: "自动生成",
  openid: "用户 openid",
  nickname: "用户昵称",
  avatarUrl: "头像 URL",
  highestWave: 0,
  highestScore: 0,
  coins: 1000,
  gems: 0,
  lastUpdateTime: 1234567890
}
```

---

### 2. GameState 扩展
**位置**: `src/GameState.js`

**新增属性**:
```javascript
this.userInfo = {
  nickname: getStorage('nickname', ''),
  avatarUrl: getStorage('avatarUrl', ''),
  authorized: getStorage('userInfoAuthorized', false)
}
```

**新增方法**:

1. **`async getUserProfile()`**
   - 调用微信 `wx.getUserProfile` API
   - 返回 Promise
   - 用户授权后获取真实头像昵称

2. **`async saveUserProfileToCloud(nickname, avatarUrl)`**
   - 保存用户信息到云端
   - 同时保存到本地存储
   - 标记为已授权

3. **`async updateCloudGameData(updateData)`** (已修改)
   - 添加昵称和头像到更新数据
   - 确保排行榜显示真实信息

---

### 3. Main 扩展
**位置**: `src/Main.js`

**新增方法**:

1. **`async initUserInfo()`**
   - 游戏启动时调用（异步，不阻塞）
   - 检查是否已授权
   - 未授权则弹出授权窗口
   - 拒绝则生成默认信息

**执行流程**:
```
游戏启动
  ↓
检查是否已授权
  ↓
已授权 → 使用本地数据
  ↓
未授权 → 弹出授权窗口
  ↓
用户同意 → 获取信息 → 保存到云端
  ↓
用户拒绝 → 生成默认信息 → 保存到云端
```

---

### 4. UIManager 扩展
**位置**: `src/UIManager.js`

**新增/修改方法**:

1. **`drawAvatar(...)`** (已修改)
   - 判断使用图片头像还是文字头像
   - 智能降级处理

2. **`drawImageAvatar(...)`** (新增)
   - 加载并绘制微信头像图片
   - 圆形裁剪
   - 第 1 名金色边框
   - 加载失败降级到文字头像

3. **`drawTextAvatar(...)`** (已优化)
   - 使用 Canvas 绘制美观的默认头像
   - 渐变背景
   - 装饰性图案
   - 文字阴影

4. **`getHueFromText(text)`** (新增)
   - 根据文字生成固定色相值
   - 保证相同 openid 显示相同颜色

5. **`drawAvatarPattern(...)`** (新增)
   - 绘制装饰性小圆点
   - 增加视觉美感

---

## 默认头像设计

### 特点
1. **渐变背景**: 径向渐变，立体感强
2. **固定颜色**: 相同 openid 显示相同颜色（基于 hash 算法）
3. **装饰图案**: 4 个装饰性小圆点，增加美感
4. **文字阴影**: 增强可读性
5. **第 1 名特殊**: 金色渐变 + 金色边框

### 颜色生成算法
```javascript
getHueFromText(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash % 360)
}
```

---

## 使用流程

### 首次启动
1. 游戏启动 → 检查授权状态
2. 未授权 → 弹出微信授权窗口
3. 用户同意 → 获取真实头像昵称 → 保存到云端
4. 用户拒绝 → 生成默认头像 → 保存到云端

### 再次启动
1. 游戏启动 → 检查授权状态
2. 已授权 → 使用本地数据 → 直接使用
3. 无需重复授权

### 排行榜显示
1. 打开排行榜 → 加载数据
2. 检查 avatarUrl 字段
3. 有 URL → 加载图片头像
4. 无 URL → 绘制文字头像

---

## 技术亮点

### 1. **智能降级**
```
真实头像图片
  ↓ 加载失败
文字头像（Canvas 绘制）
  ↓ 优雅降级
```

### 2. **性能优化**
- ✅ 只授权一次，永久使用
- ✅ 本地缓存，无需重复获取
- ✅ 异步处理，不阻塞游戏启动
- ✅ 图片加载失败自动降级

### 3. **用户体验**
- ✅ 授权说明清晰（"用于完善用户资料，在排行榜中展示"）
- ✅ 拒绝授权也能正常使用
- ✅ 默认头像美观，不简陋
- ✅ 相同用户相同头像（基于 hash）

### 4. **视觉设计**
- ✅ 渐变背景，立体感强
- ✅ 装饰图案，增加美感
- ✅ 文字阴影，增强可读性
- ✅ 第 1 名特殊处理（金色）

---

## 云函数部署

### 1. 上传云函数
在微信开发者工具中：
```
右键 cloudfunctions/saveUserProfile → 
上传并部署：云端安装依赖
```

### 2. 测试云函数
```javascript
wx.cloud.callFunction({
  name: 'saveUserProfile',
  data: {
    nickname: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg'
  }
}).then(res => {
  console.log(res)
})
```

---

## 数据库权限

确保 `user_profile` 集合权限设置：
```
读：所有用户可读
写：仅创建者可写，云函数可读写
```

---

## 待完善功能

### 1. 图片头像缓存
当前每次都会重新加载图片，可以：
- 缓存已加载的图片
- 使用 Image 对象池
- 预加载排行榜头像

### 2. 头像刷新机制
如果用户更换了微信头像：
- 添加"刷新头像"按钮
- 定期重新获取用户信息
- 检测到 URL 变化自动更新

### 3. 其他场景使用
- 个人中心
- 游戏内聊天
- 好友系统

---

## 相关文件清单

```
popit/
├── cloudfunctions/
│   └── saveUserProfile/
│       ├── index.js          # 云函数主逻辑
│       └── package.json      # 依赖配置
├── src/
│   ├── GameState.js          # 用户信息管理
│   ├── UIManager.js          # 头像绘制优化
│   └── Main.js               # 初始化用户信息
└── USER_INFO_IMPLEMENTATION.md  # 本文档
```

---

## 注意事项

### 1. 微信 API 限制
- `wx.getUserProfile` 只能在用户主动触发后调用
- 不能在游戏启动时立即调用（会被拒绝）
- 需要用户点击按钮或完成某个操作后调用

### 2. 头像 URL 有效期
- 微信头像 URL 可能有有效期
- 建议定期重新获取
- 或者下载到本地使用

### 3. 隐私保护
- 只在排行榜显示用户信息
- 不用于其他商业用途
- 符合微信隐私规范

---

## 常见问题

### Q: 授权窗口不弹出？
A: 检查是否在用户主动触发后调用，不能在游戏启动时立即调用

### Q: 头像图片加载失败？
A: 会自动降级到文字头像，不影响使用

### Q: 用户更换微信头像后如何更新？
A: 可以添加"刷新头像"功能，或者定期重新获取

### Q: 默认头像颜色单一？
A: 使用 hash 算法保证相同用户相同颜色，不同用户不同颜色

---

**实现完成时间**: 2026-06-04  
**版本**: v1.0.0
