# 用户信息保存问题排查指南

## 问题现象
用户授权后，数据库中没有保存头像和昵称

---

## 排查步骤

### 步骤 1: 检查云函数是否已部署

在微信开发者工具中：
1. 右键点击 `cloudfunctions/saveUserProfile` 目录
2. 选择 **"上传并部署：云端安装依赖"**
3. 等待部署完成

**验证**:
- 查看云函数列表，确认 `saveUserProfile` 存在
- 查看部署时间，确认是最新版本

---

### 步骤 2: 检查云环境 ID 配置

打开 `project.config.json`，检查：
```json
{
  "setting": {
    "cloudfunctionRoot": "cloudfunctions/"
  },
  "cloudfunctionRoot": "cloudfunctions/",
  "appid": "你的小程序 AppID"
}
```

打开 `src/Main.js`，检查云初始化：
```javascript
wx.cloud.init({
  env: 'cloud1-d2gbhgc8abb1ab532',  // 确保是你的云环境 ID
  traceUser: true
})
```

**如何获取云环境 ID**:
1. 微信开发者工具 → 云开发
2. 点击"设置"
3. 复制环境 ID（格式类似 `cloud1-xxx`）

---

### 步骤 3: 检查数据库权限

在微信开发者工具中：
1. 云开发 → 数据库
2. 找到 `user_profile` 集合
3. 点击"数据权限"

**正确的权限设置**:
```
所有用户可读
仅创建者可写
```

或者使用自定义规则：
```javascript
{
  "read": "auth.openid == doc.openid",
  "write": "auth.openid == doc.openid"
}
```

---

### 步骤 4: 查看云函数日志

在微信开发者工具中：
1. 云开发 → 云函数
2. 点击 `saveUserProfile`
3. 点击"日志"
4. 查看最新的调用日志

**期望看到的日志**:
```
saveUserProfile 被调用：{ openid: "xxx", nickname: "xxx", avatarUrl: "xxx" }
查询结果：0  (或 1)
创建成功，ID: xxx (或 更新成功，影响行数：1)
```

**如果看不到日志**:
- 云函数未部署 ✅ 重新部署
- 云函数调用失败 ✅ 检查网络权限
- 云环境 ID 错误 ✅ 检查配置

---

### 步骤 5: 查看小程序控制台日志

在微信开发者工具中：
1. 控制台 → 查看日志
2. 筛选 `console.log` 和 `console.error`

**期望看到的日志**:
```
获取用户信息成功：{ nickName: "xxx", avatarUrl: "xxx" }
用户资料保存成功
```

**如果看到错误**:
```
保存用户资料失败：xxx
```
根据错误信息排查。

---

### 步骤 6: 测试云函数

在微信开发者工具控制台中执行：
```javascript
wx.cloud.callFunction({
  name: 'saveUserProfile',
  data: {
    nickname: '测试用户',
    avatarUrl: 'https://example.com/test.jpg'
  }
}).then(res => {
  console.log('测试成功:', res)
}).catch(err => {
  console.error('测试失败:', err)
})
```

**成功响应**:
```javascript
{
  result: {
    success: true,
    message: "用户资料创建成功",
    data: { nickname: "测试用户", avatarUrl: "..." }
  }
}
```

**失败响应**:
```javascript
{
  errMsg: "cloud.callFunction:fail ..."
}
```

---

## 常见问题

### Q1: 云函数调用失败，提示 "Environment not found"
**原因**: 云环境 ID 配置错误

**解决**:
1. 检查 `project.config.json` 中的环境 ID
2. 检查 `wx.cloud.init()` 中的环境 ID
3. 确保云环境已创建并激活

---

### Q2: 云函数调用成功，但数据库没有数据
**原因**: 数据库权限不足

**解决**:
1. 云开发 → 数据库 → user_profile
2. 修改数据权限为 "所有用户可读，仅创建者可写"
3. 重新测试

---

### Q3: 提示 "用户拒绝授权"
**原因**: 用户点击了拒绝按钮

**解决**:
1. 清除本地数据（工具 → 清除数据）
2. 重新打开游戏
3. 这次点击"允许"

---

### Q4: 头像 URL 为空字符串
**原因**: 微信返回的 `avatarUrl` 可能为空

**检查**:
```javascript
console.log('获取用户信息成功:', userInfo)
// 检查 userInfo.avatarUrl 是否有值
```

**解决**:
- 这是正常现象，某些情况下微信不返回头像
- 使用默认头像即可

---

### Q5: 重复调用导致数据覆盖
**原因**: 多次调用 `saveUserProfile`

**检查日志**:
```
saveUserProfile 被调用：{ ... }  // 多次出现
```

**解决**:
代码中已有防重复机制：
```javascript
if (this.hasTriedInitUserInfo) {
  return  // 只调用一次
}
```

---

## 完整测试流程

### 1. 清除所有数据
```
工具 → 清除数据 → 清除全部
```

### 2. 重新部署云函数
```
右键 cloudfunctions/saveUserProfile → 
上传并部署：云端安装依赖
```

### 3. 启动游戏
- 游戏启动

### 4. 点击任意按钮
- 弹出微信授权窗口
- 点击"允许"

### 5. 查看日志
**小程序日志**:
```
获取用户信息成功：{ nickName: "xxx", avatarUrl: "xxx" }
用户资料保存成功
```

**云函数日志**:
```
saveUserProfile 被调用：{ openid: "xxx", ... }
查询结果：0
创建成功，ID: xxx
```

### 6. 验证数据库
```
云开发 → 数据库 → user_profile
```
应该能看到新记录：
```json
{
  "_id": "xxx",
  "openid": "xxx",
  "nickname": "测试用户",
  "avatarUrl": "https://...",
  "highestWave": 0,
  "highestScore": 0,
  "coins": 1000
}
```

---

## 调试代码（临时添加）

如果需要更详细的调试，可以在 `Main.js` 中添加：

```javascript
async tryInitUserInfo() {
  if (this.gameState.userInfo.authorized) {
    console.log('已授权，跳过')
    return
  }
  
  if (this.hasTriedInitUserInfo) {
    console.log('已尝试过，跳过')
    return
  }
  this.hasTriedInitUserInfo = true
  
  console.log('开始获取用户信息...')
  
  try {
    const userInfo = await this.gameState.getUserProfile()
    console.log('获取成功:', userInfo)
    
    console.log('开始保存到云端...')
    const result = await this.gameState.saveUserProfileToCloud(
      userInfo.nickName,
      userInfo.avatarUrl
    )
    
    console.log('保存结果:', result)
  } catch (err) {
    console.error('获取失败:', err)
    // ...
  }
}
```

---

## 联系支持

如果以上步骤都无法解决问题：

1. **提供云函数日志**（完整内容）
2. **提供小程序控制台日志**
3. **提供数据库权限截图**
4. **提供云环境 ID 配置**

---

**文档版本**: v1.0.0  
**更新时间**: 2026-06-04
