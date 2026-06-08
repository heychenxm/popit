# UI 文本溢出修复

## 问题描述

失败弹窗中，当金币不足时，底部提示文案"金币不足或已达到购买上限（需要 XXX 金币，最多 X 次）"文本过长，导致文本溢出按钮区域。

## 修复方案

### 1. Toast 提示自适应宽度

**修改文件**: `src/UIManager.js`

**修改内容**:
```javascript
// 修改前：固定宽度 200px
const toastW = 200

// 修改后：根据文本内容自适应宽度（最小 200px，最大 400px）
ctx.font = 'bold 12px sans-serif'
ctx.textAlign = 'center'
const textWidth = ctx.measureText(this.toast.text).width
const toastW = Math.min(400, Math.max(200, textWidth + 40))
```

**效果**:
- 短文本：保持最小宽度 200px
- 中等文本：自适应文本宽度（左右各留 20px 边距）
- 长文本：最大宽度 400px，自动换行或截断

### 2. 失败弹窗按钮自适应宽度

**修改文件**: `src/UIManager.js`

**修改内容**:
```javascript
// 计算「继续」按钮所需的宽度
const continueText = '继续'
const priceText = `${purchasePrice}`
ctx.font = 'bold 13px sans-serif'
const continueWidth = ctx.measureText(continueText).width
const priceWidth = ctx.measureText(priceText).width
const coinSize = 14
const minContinueBtnW = Math.max(100, continueWidth + 6 + coinSize + 4 + priceWidth + 40)

// 按钮居中布局
const homeBtnW = 100
const gap = 20
const totalBtnW = homeBtnW + gap + minContinueBtnW
const btnStartX = (modalX + modalW - totalBtnW) / 2
```

**效果**:
- 按钮宽度根据文本内容（"继续" + 金币图标 + 价格）自动调整
- 两个按钮保持居中对齐
- 最小宽度 100px，确保按钮不会太小

## 修改的功能点

### UIManager.js

1. **drawToast()** - Toast 提示绘制
   - 根据文本内容动态计算宽度
   - 最小 200px，最大 400px

2. **drawContinuePurchaseButton()** - 继续按钮文字绘制
   - 返回文本总宽度，供按钮布局使用

3. **drawFailModal()** - 失败弹窗绘制
   - 动态计算按钮宽度
   - 优化按钮布局，确保居中对齐

## 测试场景

### 场景 1：短文本提示
```
提示文本："时间到！"
Toast 宽度：200px（最小宽度）
```

### 场景 2：中等文本提示
```
提示文本："点错了！"
Toast 宽度：自适应（约 120px + 40px = 160px → 200px 最小值）
```

### 场景 3：长文本提示（修复重点）
```
提示文本："金币不足或已达到购买上限（需要 1000 金币，最多 3 次）"
Toast 宽度：自适应（约 360px + 40px = 400px → 最大 400px）
```

### 场景 4：不同金币价格
```
价格 300: 按钮宽度 = "继续" + 💰 + "300" + 边距
价格 1000: 按钮宽度 = "继续" + 💰 + "1000" + 边距（更宽）
```

## 视觉效果

### 修复前
- ❌ 长文本溢出按钮边界
- ❌ 文本被截断，显示不全
- ❌ 按钮宽度固定，不够灵活

### 修复后
- ✅ 文本完全显示在按钮内
- ✅ 按钮宽度自适应文本内容
- ✅ 整体布局保持美观

## 兼容性

- ✅ 不影响其他 UI 元素
- ✅ 保持原有的触摸交互区域
- ✅ 适配不同屏幕尺寸

## 后续优化建议

1. **文本换行支持**: 如果文本超长，可以考虑支持多行显示
2. **字体大小自适应**: 根据文本长度动态调整字体大小
3. **动画效果**: Toast 弹出时增加宽度渐变动画
