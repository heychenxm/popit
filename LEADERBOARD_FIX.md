# 排行榜重复排名修复

## 问题描述

排行榜中出现同一用户有两个不同排名的情况（例如第 5 名和第 6 名都是"小名"，分数都是 2185）。

## 问题原因

在云函数查询排行榜时，当多个用户分数相同时，数据库查询会返回多条记录，但排名计算逻辑只是简单地使用 `index + 1`，导致：

1. **相同分数的用户被分配了不同的排名**（例如第 5 名和第 6 名）
2. **正确的排名逻辑应该是**：相同分数的用户应该共享同一个排名

## 修复方案

### 1. 总排行榜修复（getLeaderboard）

**文件**: `cloudfunctions/getLeaderboard/index.js`

**修改内容**:
```javascript
// 修复前
const leaderboard = topList.map((item, index) => ({
  rank: index + 1,
  nickname: item.nickname || '',
  avatarUrl: item.avatarUrl || '',
  value: item[field] || 0,
  isUser: item._openid === openid
}))

// 修复后
const leaderboard = []
let currentRank = 1
let lastValue = -1

for (let index = 0; index < topList.length; index++) {
  const item = topList[index]
  const value = item[field] || 0
  
  // 如果分数与上一个不同，更新排名为当前位置 +1
  if (value !== lastValue) {
    currentRank = index + 1
    lastValue = value
  }
  
  leaderboard.push({
    rank: currentRank,
    nickname: item.nickname || '',
    avatarUrl: item.avatarUrl || '',
    value: value,
    isUser: item._openid === openid
  })
}
```

**关键改进**:
1. 添加次级排序 `.orderBy('_openid', 'asc')`，确保相同分数时顺序一致
2. 使用 `currentRank` 和 `lastValue` 追踪排名，相同分数共享同一排名

### 2. 赛季排行榜修复（getSeasonLeaderboard）

**文件**: `cloudfunctions/getSeasonLeaderboard/index.js`

**修改内容**: 与总排行榜相同，添加次级排序和排名追踪逻辑。

## 排名逻辑说明

### 修复前（错误）
```
排名 | 用户 | 分数
-----|------|-----
1    | A    | 3835
2    | B    | 3110
3    | C    | 2975
4    | D    | 2800
5    | E    | 2185  ← 相同分数不同排名
6    | E    | 2185  ← 重复
```

### 修复后（正确）
```
排名 | 用户 | 分数
-----|------|-----
1    | A    | 3835
2    | B    | 3110
3    | C    | 2975
4    | D    | 2800
5    | E    | 2185  ← 相同分数相同排名
5    | E    | 2185  ← 正确
7    | F    | 2100  ← 跳过第 6 名
```

## 测试建议

1. **相同分数测试**: 创建多个相同分数的测试账号，验证排名是否正确
2. **边界测试**: 测试第 1 名相同分数的情况
3. **赛季排行榜**: 验证赛季排行榜是否也修复成功

## 注意事项

- 需要重新部署云函数才能生效
- 修复后，相同分数的用户将显示相同的排名
- 下一个不同分数的排名会跳过相应的名次数（例如两个第 5 名后，下一个是第 7 名）
