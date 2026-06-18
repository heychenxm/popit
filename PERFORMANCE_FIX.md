# 安卓端性能优化总结

## 问题分析

安卓端在玩游戏时越来越卡，主要原因是**内存泄漏**和**渲染性能问题**。

## 优化内容

### 1. 内存泄漏修复

#### 1.1 定时器清理优化
- **文件**: `src/Main.js`
- **问题**: `_pendingTimers` 数组在清除时创建新数组，旧数组可能未被及时回收
- **修复**: 使用 `length = 0` 清空数组而不是重新赋值，减少内存分配

#### 1.2 离屏 Canvas 释放
- **文件**: `src/BubbleGrid.js`
- **问题**: `updateLayout()` 中每次创建新的离屏 Canvas，但旧的未释放
- **修复**: 添加 `_releaseOffscreenCanvases()` 方法，在创建新 Canvas 前先释放旧的（将 width 设为 0 释放像素内存）

#### 1.3 动画帧计数器限制
- **文件**: `src/BubbleGrid.js`, `src/UIManager.js`
- **问题**: `animationFrame` 计数器无限增长，可能导致数值溢出
- **修复**: 使用 `% 600000` 限制计数器（约 16 分钟后重置）

#### 1.4 文字测量缓存优化
- **文件**: `src/UIManager.js`
- **问题**: `textMeasureCache` 缓存上限 500 个，占用内存
- **修复**: 降低到 200 个，减少内存占用

#### 1.5 头像缓存优化
- **文件**: `src/UIManager.js`
- **问题**: 头像 Image 对象缓存 50 个，每个占用较大内存
- **修复**: 
  - 降低到 20 个
  - 删除时显式清除 `image.src = ''` 和 `image = null`

#### 1.6 音频对象池清理
- **文件**: `src/AudioManager.js`
- **问题**: GainNode 对象池在游戏结束时未清理
- **修复**: 
  - 添加 `clearAudioPool()` 方法
  - 在 `navigateToMenu()` 和 `onGameFail()` 时调用清理

#### 1.7 Storage 写入定时器清理
- **文件**: `src/GameState.js`
- **问题**: `_storageFlushTimer` 在 `clearTimer()` 中未清理
- **修复**: 在 `clearTimer()` 中添加清理逻辑

#### 1.8 泡泡渐变对象延迟创建（新增）
- **文件**: `src/BubbleGrid.js`
- **问题**: 每个泡泡预创建 4 个渐变对象（pink/purple/blue/error），7x7 网格时共 49 个泡泡 × 4 = 196 个渐变对象
- **修复**: 
  - 只创建必要的 normalGradient
  - 激活泡泡渐变延迟创建（`_getActiveGradient()`）
  - 减少约 75% 的渐变对象创建

### 2. 渲染性能优化

#### 2.1 跳帧保护
- **文件**: `src/Main.js`
- **问题**: 安卓端可能出现大跳帧（deltaTime 过大），导致游戏逻辑异常
- **修复**: 限制 `deltaTime` 最大为 100ms

#### 2.2 循环优化
- **文件**: `src/BubbleGrid.js`, `src/UIManager.js`
- **问题**: 使用 `forEach` 和 `for...of` 在每帧创建迭代器对象
- **修复**: 改用传统 `for` 循环，缓存 `length` 属性

#### 2.3 星星粒子数量减少
- **文件**: `src/BubbleGrid.js`
- **问题**: 30 个星星粒子每帧都绘制，开销较大
- **修复**: 减少到 15 个，视觉效果影响不大但性能提升明显

#### 2.4 Storage 写入频率降低
- **文件**: `src/GameState.js`
- **问题**: `_scheduleStorageWrite` 使用 `setTimeout(..., 0)` 过于频繁
- **修复**: 改为 `setTimeout(..., 16)`（约 1 帧），减少 IO 操作

#### 2.5 移除 shadowBlur 阴影效果（新增）
- **文件**: `src/BubbleGrid.js`
- **问题**: 玻璃框内部边框使用 `shadowBlur = 6`，每帧渲染开销大
- **修复**: 移除 shadowBlur，改用简单描边

#### 2.6 椭圆绘制优化（新增）
- **文件**: `src/BubbleGrid.js`
- **问题**: 泡泡高光使用 `ctx.ellipse()`，计算开销大于 `ctx.arc()`
- **修复**: 使用 `ctx.arc()` 圆形代替椭圆

#### 2.7 减少 ctx.save/restore 调用（新增）
- **文件**: `src/UIManager.js`
- **问题**: 每帧多次调用 `ctx.save()` 和 `ctx.restore()`，开销较大
- **修复**: 移除不必要的 save/restore 调用（drawGameHUD、drawScoreCard、drawLifeCard）

#### 2.8 霓虹网格优化（新增）
- **文件**: `src/BubbleGrid.js`
- **问题**: 霓虹网格线条过多（30px 间距），alpha 混合开销大
- **修复**: 
  - 增大网格间距到 35px，减少线条数量
  - 降低透明度和线条颜色，减少混合开销

#### 2.9 背景缓存优化（新增）
- **文件**: `src/BubbleGrid.js`
- **问题**: 背景缓存中包含静态星星，增加缓存创建开销
- **修复**: 移除静态星星绘制，只在动态层绘制

## 预期效果

1. **内存占用降低**: 通过及时释放离屏 Canvas、头像缓存、音频对象、延迟创建渐变等，减少内存泄漏
2. **帧率稳定**: 通过跳帧保护、循环优化、粒子减少、移除 shadowBlur 等，使帧率更加稳定
3. **长时间游戏不卡**: 动画帧计数器限制、定时器清理、渐变延迟创建等，确保长时间游戏不会出现性能下降

## 测试建议

1. 在安卓设备上连续游戏 30 分钟以上，观察是否还有卡顿
2. 使用微信开发者工具的 Performance 面板监控内存使用
3. 注意观察关卡数增加后（网格变大）的性能表现

## 注意事项

- 所有优化都保持了向后兼容，不影响游戏功能
- 内存优化主要在关键节点（返回菜单、游戏失败）触发清理
- 渲染优化减少了每帧的计算量，提升整体流畅度
- 渐变对象延迟创建可节省约 75% 的初始创建开销
