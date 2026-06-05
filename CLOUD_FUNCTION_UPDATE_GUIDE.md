# 云函数更新指南

## 本次更新内容

### 1. syncData - 数据同步云函数
**修改内容**:
- 修复了"最大值优先"策略的漏洞
- 金币不再同步（以云端为准），防止多设备刷金币
- 只同步最高分和最高关卡（玩家真实成就）

**文件**: `cloudfunctions/syncData/index.js`

---

### 2. updateGameData - 更新游戏数据云函数
**修改内容**:
- 添加参数校验（防止恶意调用）
  - 关卡数上限：999
  - 最高分上限：999,999
  - 金币上限：999,999
  - 单次增加金币上限：10,000
  - 宝石上限：99,999
  - 单次增加宝石上限：10,000
- 修复了 `coins` 和 `addCoins` 同时传入时的逻辑冲突
- 先取最大值比较，再累加 `addCoins`

**文件**: `cloudfunctions/updateGameData/index.js`

---

### 3. checkin - 签到云函数
**修改内容**:
- 使用 UTC+8 时间（中国标准时间）避免时区问题
- 服务器可能是 UTC 时区，统一转换为中国时间

**文件**: `cloudfunctions/checkin/index.js`

---

## 上传步骤

### 方法一：使用微信开发者工具（推荐）

1. **打开微信开发者工具**
   - 路径：`/Applications/微信开发者工具.app`

2. **打开项目**
   - 选择项目路径：`/Users/chenminghong/Desktop/work/popit`
   - 或使用 AppID：`wxbd18a37b0c266cd0`

3. **上传云函数**
   
   在左侧文件树中：
   
   a. 右键点击 `cloudfunctions/checkin` 目录
      - 选择"上传并部署：云端安装依赖"
      - 等待上传完成
   
   b. 右键点击 `cloudfunctions/syncData` 目录
      - 选择"上传并部署：云端安装依赖"
      - 等待上传完成
   
   c. 右键点击 `cloudfunctions/updateGameData` 目录
      - 选择"上传并部署：云端安装依赖"
      - 等待上传完成

4. **验证上传**
   - 点击顶部工具栏的"云开发"按钮
   - 进入云开发控制台
   - 选择"云函数"
   - 检查以下云函数的更新时间：
     - checkin
     - syncData
     - updateGameData

---

### 方法二：使用命令行工具

如果已安装微信开发者工具命令行工具：

```bash
# 进入项目目录
cd /Users/chenminghong/Desktop/work/popit

# 上传云函数（需要微信开发者工具命令行支持）
/Applications/微信开发者工具.app/Contents/MacOS/cli -u cloudfunctions/checkin
/Applications/微信开发者工具.app/Contents/MacOS/cli -u cloudfunctions/syncData
/Applications/微信开发者工具.app/Contents/MacOS/cli -u cloudfunctions/updateGameData
```

---

## 数据库权限设置

**重要**：上传云函数后，需要修改数据库权限：

1. 打开微信云开发控制台
2. 进入"数据库"页面
3. 选择集合 `user_profile`
4. 点击"权限设置"
5. 修改为：**仅创建者可写，所有人可读**
6. 同样设置 `user_signin` 集合

**警告**：不要设置为"所有用户可读写"，否则用户可以绕过云函数直接修改数据！

---

## 测试验证

### 1. 测试参数校验

```javascript
// 在微信开发者工具控制台中测试
wx.cloud.callFunction({
  name: 'updateGameData',
  data: {
    coins: -100  // 负数，应该被拒绝
  }
}).then(res => {
  console.log('测试负数金币:', res)
  // 预期返回：{ success: false, message: '参数错误：金币数超出合理范围' }
})

wx.cloud.callFunction({
  name: 'updateGameData',
  data: {
    addCoins: 999999  // 超大值，应该被拒绝
  }
}).then(res => {
  console.log('测试超大值:', res)
  // 预期返回：{ success: false, message: '参数错误：增加的金币数超出合理范围' }
})
```

### 2. 测试签到时区

```javascript
// 测试签到功能
wx.cloud.callFunction({
  name: 'checkin',
  data: { action: 'checkin' }
}).then(res => {
  console.log('签到结果:', res)
  // 检查返回的日期是否正确（中国时间）
})
```

### 3. 测试数据同步

```javascript
// 测试数据同步（金币不同步）
wx.cloud.callFunction({
  name: 'syncData',
  data: {
    highestWave: 50,
    highestScore: 10000,
    coins: 999999  // 这个值不会被同步到云端
  }
}).then(res => {
  console.log('同步结果:', res)
  // 检查返回的金币是否是云端的值，而不是传入的 999999
})
```

---

## 常见问题

### Q1: 云函数上传失败
**解决方法**:
1. 检查网络连接
2. 检查微信开发者工具是否为最新版本
3. 检查云环境 ID 是否正确
4. 查看微信开发者工具的错误日志

### Q2: 云函数调用超时
**解决方法**:
1. 检查云函数是否有死循环
2. 检查数据库查询是否有索引
3. 检查云函数依赖是否正确安装

### Q3: 参数校验不生效
**解决方法**:
1. 确认云函数已重新上传
2. 清除微信开发者工具的缓存
3. 在云开发控制台查看云函数日志

---

## 回滚方案

如果更新后出现问题，可以回滚到旧版本：

1. 在微信开发者工具中，右键点击云函数
2. 选择"回滚"
3. 选择之前的版本

或者使用本地备份的代码重新上传。

---

## 更新日志

**2026-06-05**:
- ✅ 修复 syncData 金币同步漏洞
- ✅ 添加 updateGameData 参数校验
- ✅ 修复 checkin 时区问题
- ✅ 修复 coins/addCoins 逻辑冲突

---

**更新完成后，请进行全面测试确保功能正常！**
