# 泡泡大师 - 代码优化分析报告

> 生成时间：2026-06-12
> 原则：**不破坏现有交互逻辑，仅做性能优化、代码质量提升和隐患修复**

---

## 分级说明

| 级别 | 含义 | 建议 |
|------|------|------|
| **P0 - 严重** | 存在 Bug 或严重影响性能 | 必须修复 |
| **P1 - 重要** | 明显性能问题或代码质量隐患 | 强烈建议修复 |
| **P2 - 一般** | 轻微性能浪费或代码重复 | 建议修复 |
| **P3 - 建议** | 代码风格/可维护性改善 | 可选修复 |

---

## 一、P0 - 严重问题（必须修复）

### 1.1 `getUniqueRandomIndices()` 存在死循环风险
- **文件**：`src/utils.js` 第 51-59 行
- **问题**：当 `count > total` 时，`while (result.length < count)` 永远无法满足条件，导致死循环卡死
- **影响**：如果关卡配置出错（如目标数 > 泡泡总数），游戏直接卡死
- **修复方案**：添加 `count = Math.min(count, total)` 保护

### 1.2 `saveToCloud` 只在破纪录时保存，正常数据不同步
- **文件**：`src/GameState.js` 第 790-804 行
- **问题**：`saveToCloud(false)` 仅在 `isNewHighScore() || wave > bestWave` 时执行保存。用户正常积累金币、签到、分享等数据**永远不会同步到云端**
- **影响**：云端数据严重滞后，排行榜数据不准确
- **修复方案**：增加更多保存触发条件（如金币变化、签到状态变化等），或在返回首页时始终保存

### 1.3 `doLocalCheckin` 签到奖励 off-by-one Bug
- **文件**：`src/GameState.js` 第 285-299 行
- **问题**：`checkinStreak` 先递增，然后调用 `getTodayReward()` 时默认使用 `checkinStreak + 1` 计算奖励。例如连续第 2 天签到，streak 变成 3，但实际发放的是第 4 天的奖励
- **影响**：签到奖励与预期不一致
- **修复方案**：在递增前先保存旧值，或在 `getTodayReward()` 中传入正确的天数

### 1.4 `lastShareGiftDate` 未从 Storage 初始化
- **文件**：`src/GameState.js` 构造函数
- **问题**：`updateShareGiftStatus()` 在构造函数中被调用，引用了 `this.lastShareGiftDate`，但该属性从未在构造函数中从 Storage 读取初始化
- **影响**：每次重启游戏，分享礼包状态可能重置，导致重复领取或状态不一致
- **修复方案**：在构造函数中从 Storage 读取 `lastShareGiftDate`

### 1.5 `bubble.scale` 计算与使用不一致
- **文件**：`src/BubbleGrid.js`
- **问题**：`update()` 方法计算了 `bubble.scale`，但 `drawActiveBubble()` 中通过 `Math.sin(this.glowPhase)` 重新计算 scale，**完全没有读取 `bubble.scale`**。而 `getBubbleIndexAtPoint()` 的点击区域计算使用的是 `bubble.scale`
- **影响**：点击判定区域与视觉显示不一致，可能导致"看起来点到了但没反应"或"看起来没点到但触发了"
- **修复方案**：统一 scale 的计算来源，让 draw 和 hit-test 使用同一个值

---

## 二、P1 - 重要问题（强烈建议修复）

### 2.1 构造函数 8+ 次同步 Storage 读取阻塞启动
- **文件**：`src/GameState.js` 第 14-88 行
- **问题**：构造函数中进行了 8+ 次 `wx.getStorageSync` 调用，每次都是阻塞 IO
- **影响**：拖慢游戏启动速度
- **修复方案**：合并为一次 JSON 对象读取，或批量加载

### 2.2 频繁独立 Storage 写入无批量化
- **文件**：`src/GameState.js` 多处
- **问题**：`addCoins()`、`purchaseLife()`、`recordShare()` 等方法每次修改数据都立即写 Storage。`loadCloudData()` 合并数据时可能触发 12+ 次独立写入
- **影响**：大量不必要的同步 IO 操作
- **修复方案**：采用 debounce 批量写入策略，收集变更后再统一保存

### 2.3 `setTimer` 忽略 `duration` 参数
- **文件**：`src/GameState.js` 第 157-160 行
- **问题**：`setTimer(callback, duration)` 中 `duration` 参数完全未使用，`setInterval` 硬编码 30ms
- **影响**：接口契约违反，30ms 轮询对倒计时场景过于频繁（每秒 33 次）
- **修复方案**：要么使用 `duration` 参数，要么移除该参数；考虑将间隔提升到 100ms+

### 2.4 离屏 Canvas 仅在微信环境生效，浏览器完全无缓存
- **文件**：`src/BubbleGrid.js` 第 161、175、190 行
- **问题**：`bgCanvas`、`glassCellCache`、`glassGridCache` 三个离屏 Canvas 只在 `typeof wx !== 'undefined'` 时创建
- **影响**：浏览器开发调试时每帧全量重绘，7×7 网格 = 49 个格子 × 3 次路径操作/格 = 147 次路径操作/帧
- **修复方案**：支持浏览器环境的 OffscreenCanvas 降级

### 2.5 泡泡绘制未按状态分组，样式切换频繁
- **文件**：`src/BubbleGrid.js` 第 698-743 行
- **问题**：`drawBubbles` 按数组顺序逐个绘制，每个泡泡根据状态调用不同方法，导致 fillStyle/strokeStyle/shadow 频繁切换
- **影响**：每帧多余的状态切换开销（49 个泡泡 × 至少 3 次样式切换）
- **修复方案**：按状态分组绘制——先画所有 normal，再画 active，最后画 error

### 2.6 `drawGlassCell` 与 `drawGlassCellToCache` 完全重复
- **文件**：`src/BubbleGrid.js` 第 203-242 行 vs 第 554-590 行
- **问题**：两段代码逻辑完全一致，唯一区别是操作的 ctx 不同
- **影响**：维护成本高，修改一处容易忘记另一处
- **修复方案**：抽取为一个接受 ctx 参数的通用方法

### 2.7 UIManager 离屏 Canvas 重创建时未释放旧资源
- **文件**：`src/UIManager.js` 第 95-113 行
- **问题**：`createMenuCache()` 在已有缓存时直接标记 `menuNeedsUpdate = true` 并返回，但如果后续逻辑改为重新创建，旧的离屏 Canvas 没有被设为 `null` 释放
- **影响**：微信环境离屏 Canvas 是原生重资源，可能内存泄漏
- **修复方案**：重建前先释放旧引用

### 2.8 渐变对象跨 ctx 使用风险
- **文件**：`src/BubbleGrid.js` 第 137-145 行
- **问题**：`glassGradient` 和 `glassHighlightGradient` 基于主 Canvas ctx 创建，但被赋值给离屏 Canvas ctx 使用。CanvasGradient 对象与创建它的 Canvas 上下文绑定
- **影响**：在微信小程序中可能导致渲染异常或性能下降
- **修复方案**：确保渐变对象在同一个 ctx 上创建和使用

### 2.9 `clearLeaderboardCache` 实际无效
- **文件**：`src/GameState.js` 第 518-524 行
- **问题**：只重置了内存中的 `this.leaderboardCache`，但实际缓存使用的是 `wx.getStorageSync`。内存对象在整个文件中从未被用于缓存读写
- **影响**：调用此方法不会真正清除缓存
- **修复方案**：清除 Storage 中的缓存 key，或移除这个误导性的方法

---

## 三、P2 - 一般问题（建议修复）

### 3.1 死代码清理

| 文件 | 位置 | 死代码 | 说明 |
|------|------|--------|------|
| `GameState.js` | 第 64-73 行 | `leaderboardCache`、`seasonLeaderboardCache` | 从未被实际读写 |
| `GameState.js` | 第 92-96 行 | `checkinStatusCache`、`checkinCacheDuration` | 从未被引用 |
| `WechatAPI.js` | 第 6-8 行 | `userCloudStorage`、`friendCloudStorage`、`relation` | 构造函数中初始化但从未使用 |
| `BubbleGrid.js` | 第 1 行 | `drawRoundRect` 导入 | 已导入但从未使用（使用的是自己的 `drawRoundedRect`） |
| `BubbleGrid.js` | 第 43-51 行 | `extraBubbleColors` 33 个配色 | 无论网格大小都生成，4×4 网格完全用不到 |

### 3.2 `getLeaderboard` 与 `getSeasonData` 高度重复
- **文件**：`src/GameState.js` 第 458-513 行 vs 第 580-643 行
- **问题**：缓存读取 → 云端获取 → 写缓存 → fallback 空数据的流程几乎完全一致
- **修复方案**：抽取通用的 `fetchWithCache(cacheKey, fetchFn, fallbackData)` 方法

### 3.3 `WechatAPI.js` 大量重复的 Promise 封装模式
- **文件**：`src/WechatAPI.js`
- **问题**：`login()`, `shareToChat()`, `shareToTimeline()`, `getFriendRankData()`, `uploadScore()`, `callCloud()` 都使用完全相同的 `new Promise((resolve, reject) => { wx.xxx({ success, fail }) })` 模式
- **修复方案**：抽取 `promisifyWxApi(method, options)` 工具函数

### 3.4 Icons.js 大量重复的坐标变换样板代码
- **文件**：`src/Icons.js`
- **问题**：每个图标函数都有完全相同的 6 行 `save → scale → translate → set style` 代码
- **修复方案**：抽取 `setupIconContext(ctx, x, y, size)` 辅助函数

### 3.5 `drawRoundedRect` 与 `utils.js` 的 `drawRoundRect` 功能重复
- **文件**：`src/BubbleGrid.js` 第 593-605 行
- **问题**：文件头部已导入 `drawRoundRect` 但未使用，自己又实现了一份 `drawRoundedRect`
- **修复方案**：统一使用 `utils.js` 的 `drawRoundRect`，删除重复方法

### 3.6 `drawNeonGridToCtx` / `drawStarsToCtx` 无意义间接层
- **文件**：`src/BubbleGrid.js` 第 483、516 行
- **问题**：`drawNeonGridToCtx(ctx)` 只是调用 `drawNeonGrid(ctx)`，`drawStarsToCtx(ctx, animate)` 只是调用 `drawStars(ctx, animate)`，没有任何附加逻辑
- **修复方案**：直接调用底层方法，移除包装方法

### 3.7 每个泡泡预创建 5 个渐变对象，内存占用大
- **文件**：`src/BubbleGrid.js` 第 313-368 行
- **问题**：49 个泡泡 × 5 个渐变 = 245 个 CanvasGradient 对象常驻内存，且渐变坐标绑定绝对位置
- **修复方案**：考虑使用相对坐标渐变或延迟创建

### 3.8 `activeBubbles` 使用 `Array.includes()` 查找
- **文件**：`src/BubbleGrid.js` 第 393、409、414 行
- **问题**：O(n) 线性查找，虽然当前最多 49 个泡泡影响不大，但不是好的实践
- **修复方案**：使用 `Set` 替代，或给泡泡添加 `isActive` 标记

### 3.9 `getUniqueRandomIndices()` 使用 `Array.includes()` 做去重
- **文件**：`src/utils.js` 第 51-59 行
- **问题**：`Array.includes()` 去重 O(n²)，虽然当前数据量小，但应使用 `Set`
- **修复方案**：改用 `Set` 做去重

### 3.10 `loadCloudData` 中逐字段 `setStorage`
- **文件**：`src/GameState.js` 第 706-768 行
- **问题**：合并云端数据时最多触发 12+ 次独立 `setStorage` 调用
- **修复方案**：收集所有变更，最后一次性写入

### 3.11 冗余 `Number()` 转换
- **文件**：`src/GameState.js` 多处
- **问题**：大量 `Number(this.score)`、`Number(this.highScore)` 等转换。数据入口应统一类型，而非在每个使用处防御
- **修复方案**：确保 `getStorage` 返回正确类型，移除冗余转换

### 3.12 `drawGridContainer` 静态内容每帧重绘
- **文件**：`src/BubbleGrid.js` 第 521-551 行
- **问题**：网格容器外框（圆角矩形 + fill + stroke）是静态内容，但每帧重绘
- **修复方案**：合并到玻璃框网格缓存中

---

## 四、P3 - 建议改善

### 4.1 `glowPhase` / `animationFrame` 无上限增长
- **文件**：`src/BubbleGrid.js` 第 747-748 行
- **问题**：`glowPhase += deltaTime * 0.005` 和 `animationFrame++` 会无限增长，长时间运行后浮点精度降低
- **修复方案**：定期取模 `this.glowPhase %= Math.PI * 2`

### 4.2 `polyfill.js` 对 `requestAnimationFrame` 未独立检查
- **文件**：`src/polyfill.js`
- **问题**：如果 `setTimeout` 已存在但 `requestAnimationFrame` 不存在，会跳过 rAF 的 polyfill
- **修复方案**：分开检查每个 API

### 4.3 `seasonUtils.js` 多个函数重复创建 `new Date()` 并计算
- **文件**：`src/seasonUtils.js`
- **问题**：`getSeasonTimeRemaining()`, `getSeasonStartTime()`, `getSeasonEndTime()`, `getCurrentSeasonId()` 都各自创建 `new Date()` 调用 `getSeasonCycle()`
- **修复方案**：暴露缓存机制或让调用方传入 `now`

### 4.4 `utils.js` 布局函数重复计算
- **文件**：`src/utils.js` 第 276-286 行
- **问题**：`getPhaseIndicatorLayout()` / `getBubbleGridTop()` / `getBubbleGridMaxSize()` 每次都重新计算 `getGameScreenLayout()`
- **修复方案**：按帧缓存计算结果

### 4.5 `drawChestIcon()` 硬编码颜色，与其他图标风格不一致
- **文件**：`src/Icons.js`
- **问题**：其他图标都有 `color` 参数，`drawChestIcon()` 硬编码了颜色值
- **修复方案**：添加可选的 `color` 参数

### 4.6 `AudioManager` 高频触发产生大量一次性节点
- **文件**：`src/AudioManager.js`
- **问题**：每次播放都创建新的 OscillatorNode + GainNode，快速连点时产生大量对象增加 GC 压力
- **修复方案**：考虑 GainNode 对象池复用

### 4.7 `game.js` 缺少 `wx` 环境检查
- **文件**：`game.js` 第 11、20-27 行
- **问题**：直接使用 `wx.cloud`、`wx.onError` 等无环境检查
- **修复方案**：添加 `typeof wx !== 'undefined'` 保护

### 4.8 `game.js` 导出 `null` 游戏实例
- **文件**：`game.js` 第 62-68 行
- **问题**：如果 `new Main()` 抛异常，`game` 为 `null` 仍被挂到 `globalThis`
- **修复方案**：仅在 `game` 非 `null` 时导出

### 4.9 `getColorClass()` 特殊处理缺乏注释
- **文件**：`src/utils.js` 第 64-73 行
- **问题**：`index === 1` 和 `index === 10` 有特殊返回值，与 `% 3` 的通用逻辑不一致，缺乏注释说明原因
- **修复方案**：添加注释说明设计意图

### 4.10 `drawActiveBubble` 中 shadow 状态管理
- **文件**：`src/BubbleGrid.js` 第 639-674 行
- **问题**：手动设置和重置 shadow，但如果中间代码抛异常，shadow 状态会泄漏
- **修复方案**：使用 `ctx.save()` / `ctx.restore()` 包裹

---

## 五、优化收益预估

| 级别 | 数量 | 主要收益 |
|------|------|---------|
| P0 | 5 项 | 修复死循环、数据不同步、签到奖励错误、点击判定不一致等核心 Bug |
| P1 | 9 项 | 减少启动阻塞 IO、降低帧绘制开销、消除代码重复、修复缓存失效 |
| P2 | 12 项 | 清理死代码、减少冗余计算、统一代码风格、降低维护成本 |
| P3 | 10 项 | 长期运行稳定性、代码可读性、开发体验改善 |

---

## 六、建议执行顺序

1. **第一批（P0）**：修复 5 个严重问题，消除核心 Bug
2. **第二批（P1）**：优化启动性能和帧渲染性能
3. **第三批（P2）**：清理死代码和重复代码
4. **第四批（P3）**：改善代码风格和长期可维护性

> 每一批修改完成后建议进行完整功能回归测试，确保不破坏现有交互逻辑。
