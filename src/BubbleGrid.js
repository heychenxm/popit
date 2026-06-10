import { Colors, isPointInCircle, drawRoundRect, getBubbleGridTop, getBubbleGridMaxSize } from './utils.js'

/**
 * 泡泡网格渲染器 - 支持 4x4 到 7x7 动态网格
 */
export class BubbleGrid {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.pixelRatio = options.pixelRatio || 1
    
    // 网格配置（支持动态调整）
    this.cols = options.cols || 4
    this.rows = options.rows || 4
    this.totalBubbles = this.cols * this.rows
    
    // 16 个泡泡的专属配色（完全匹配 index_v1.0.1.html）
    this.bubbleColors = [
      // 第一行
      { center: 'rgba(132, 107, 143, 0.35)', edge: 'rgba(27, 20, 33, 0.9)', dark: 'rgba(10, 5, 15, 1)' },
      { center: 'rgba(236, 72, 153, 0.25)', edge: 'rgba(76, 29, 149, 0.85)', dark: 'rgba(15, 5, 30, 1)' },
      { center: 'rgba(90, 110, 95, 0.4)', edge: 'rgba(25, 35, 28, 0.95)', dark: 'rgba(8, 15, 10, 1)' },
      { center: 'rgba(100, 115, 140, 0.35)', edge: 'rgba(25, 32, 45, 0.95)', dark: 'rgba(8, 10, 18, 1)' },
      // 第二行
      { center: 'rgba(60, 110, 170, 0.35)', edge: 'rgba(18, 30, 55, 0.95)', dark: 'rgba(5, 8, 20, 1)' },
      { center: 'rgba(95, 115, 100, 0.35)', edge: 'rgba(25, 33, 27, 0.95)', dark: 'rgba(8, 12, 10, 1)' },
      { center: 'rgba(110, 115, 125, 0.3)', edge: 'rgba(30, 32, 35, 0.95)', dark: 'rgba(10, 10, 12, 1)' },
      { center: 'rgba(168, 85, 247, 0.25)', edge: 'rgba(59, 15, 100, 0.9)', dark: 'rgba(12, 4, 25, 1)' },
      // 第三行
      { center: 'rgba(135, 95, 115, 0.3)', edge: 'rgba(38, 22, 30, 0.95)', dark: 'rgba(15, 5, 10, 1)' },
      { center: 'rgba(95, 105, 130, 0.3)', edge: 'rgba(24, 28, 40, 0.95)', dark: 'rgba(8, 10, 15, 1)' },
      { center: 'rgba(59, 130, 246, 0.35)', edge: 'rgba(20, 40, 95, 0.9)', dark: 'rgba(5, 10, 30, 1)' },
      { center: 'rgba(130, 110, 95, 0.3)', edge: 'rgba(35, 28, 22, 0.95)', dark: 'rgba(15, 10, 8, 1)' },
      // 第四行
      { center: 'rgba(90, 110, 90, 0.35)', edge: 'rgba(25, 33, 25, 0.95)', dark: 'rgba(8, 12, 8, 1)' },
      { center: 'rgba(125, 105, 95, 0.3)', edge: 'rgba(33, 25, 20, 0.95)', dark: 'rgba(12, 8, 6, 1)' },
      { center: 'rgba(115, 95, 130, 0.3)', edge: 'rgba(28, 20, 33, 0.95)', dark: 'rgba(10, 5, 15, 1)' },
      { center: 'rgba(95, 110, 125, 0.3)', edge: 'rgba(24, 30, 36, 0.95)', dark: 'rgba(8, 10, 12, 1)' }
    ]
    
    // 扩展到 25 个（5x5）、36 个（6x6）、49 个（7x7）的配色
    this.extraBubbleColors = []
    for (let i = 16; i < 49; i++) {
      // 生成额外的配色方案（使用类似的色调）
      const hue = (i * 23) % 360
      this.extraBubbleColors.push({
        center: `rgba(${hue}, ${100 + (i % 50)}, ${100 + (i % 40)}, 0.35)`,
        edge: `rgba(${hue % 30}, ${20 + (i % 30)}, ${30 + (i % 30)}, 0.95)`,
        dark: `rgba(${5 + (i % 10)}, ${5 + (i % 10)}, ${10 + (i % 15)}, 1)`
      })
    }
    
    // 激活状态配色
    this.activeColors = {
      pink: { center: '#ffd1eb', mid: '#ec4899', edge: '#9d174d', glow: 'rgba(236, 72, 153, 0.95)', border: '#ffd1eb' },
      purple: { center: '#f5d0fe', mid: '#c084fc', edge: '#6b21a8', glow: 'rgba(192, 132, 252, 0.95)', border: '#f5d0fe' },
      blue: { center: '#e0f2fe', mid: '#3b82f6', edge: '#1d4ed8', glow: 'rgba(59, 130, 246, 0.95)', border: '#e0f2fe' }
    }
    
    // 泡泡状态
    this.bubbles = []
    this.activeBubbles = []  // 优化：只包含激活状态的泡泡，减少 update 遍历
    this.gridX = 0
    this.gridY = 0
    this.gridSize = 0
    this.cellSize = 0
    this.gap = 8  // 减小网格间距：从 12 改为 8
    
    // 动画状态
    this.animationFrame = 0
    this.glowPhase = 0
    
    // 预创建背景渐变（优化：避免每帧创建）
    this.bgGradient = null
    
    // 预创建玻璃框渐变（优化：避免每帧创建）
    this.glassGradient = null
    this.glassHighlightGradient = null
    
    // 离屏 Canvas 缓存背景（优化：避免每帧重绘静态背景）
    this.bgCanvas = null
    this.bgCtx = null
    this.bgNeedsUpdate = true
    
    // 离屏 Canvas 缓存玻璃框（优化：避免每帧重绘玻璃框）
    this.glassCellCache = null
    this.glassCellNeedsUpdate = true
    
    // 离屏 Canvas 缓存整个玻璃框网格（优化：批量绘制，减少 draw call）
    this.glassGridCache = null
    this.glassGridNeedsUpdate = true
    
    this.updateLayout()
    this.initBubbles()
  }

  // 设置网格大小
  setGridSize(cols, rows) {
    const sizeChanged = (this.cols !== cols || this.rows !== rows)
    this.cols = cols
    this.rows = rows
    this.totalBubbles = this.cols * this.rows
    
    // 只在尺寸变化时更新布局和重建缓存
    if (sizeChanged) {
      this.updateLayout()
      this.initBubbles()
      // 标记所有缓存需要更新
      this.bgNeedsUpdate = true
      this.glassCellNeedsUpdate = true
      this.glassGridNeedsUpdate = true
    } else {
      // 尺寸未变化，只重置泡泡状态
      this.resetBubbles()
    }
  }

  // 更新布局
  updateLayout() {
    const canvas = this.canvas
    this.width = canvas.width / this.pixelRatio
    this.height = canvas.height / this.pixelRatio
    
    this.gridSize = getBubbleGridMaxSize(this.width, this.height)
    this.gridX = (this.width - this.gridSize) / 2
    this.gridY = getBubbleGridTop(this.width, this.height)
    this.cellSize = (this.gridSize - this.gap * 2) / this.cols
    
    // 重新创建背景渐变
    this.bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height)
    this.bgGradient.addColorStop(0, '#0d0926')
    this.bgGradient.addColorStop(0.6, '#17113a')
    this.bgGradient.addColorStop(1, '#2b185d')
    
    // 预创建玻璃框渐变（使用固定尺寸，因为所有玻璃框大小相同）
    const halfSize = this.cellSize / 2
    this.glassGradient = this.ctx.createLinearGradient(-halfSize, -halfSize, halfSize, halfSize)
    this.glassGradient.addColorStop(0, 'rgba(25, 27, 44, 0.6)')
    this.glassGradient.addColorStop(1, 'rgba(14, 15, 28, 0.8)')
    
    this.glassHighlightGradient = this.ctx.createLinearGradient(-halfSize, -halfSize, halfSize, halfSize)
    this.glassHighlightGradient.addColorStop(0, 'rgba(25, 25, 255, 0.14)')
    this.glassHighlightGradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)')
    this.glassHighlightGradient.addColorStop(0.5, 'transparent')
    this.glassHighlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.04)')
    
    // 创建离屏 Canvas
    this.createBgCache()
    this.createGlassCellCache()
    this.createGlassGridCache()
    
    // 标记背景需要更新
    this.bgNeedsUpdate = true
    this.glassCellNeedsUpdate = true
    this.glassGridNeedsUpdate = true
  }
  
  // 创建离屏 Canvas 缓存
  createBgCache() {
    try {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        this.bgCanvas = wx.createOffscreenCanvas(this.width, this.height)
        this.bgCtx = this.bgCanvas.getContext('2d')
      }
    } catch (e) {
      console.warn('离屏 Canvas 不可用，使用降级方案')
      this.bgCanvas = null
      this.bgCtx = null
    }
  }
  
  // 创建玻璃框单元格缓存
  createGlassCellCache() {
    try {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        // 创建单个玻璃框的缓存（所有玻璃框大小相同）
        this.glassCellCache = wx.createOffscreenCanvas(this.cellSize, this.cellSize)
        this.glassCellCtx = this.glassCellCache.getContext('2d')
      }
    } catch (e) {
      console.warn('离屏 Canvas 不可用，使用降级方案')
      this.glassCellCache = null
      this.glassCellCtx = null
    }
  }
  
  // 创建玻璃框网格缓存（批量绘制优化）
  createGlassGridCache() {
    try {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        // 创建整个网格的缓存（gridSize × gridSize）
        this.glassGridCache = wx.createOffscreenCanvas(this.gridSize, this.gridSize)
        this.glassGridCtx = this.glassGridCache.getContext('2d')
      }
    } catch (e) {
      console.warn('离屏 Canvas 不可用，使用降级方案')
      this.glassGridCache = null
      this.glassGridCtx = null
    }
  }
  
  // 绘制玻璃框到缓存
  drawGlassCellToCache() {
    if (!this.glassCellCtx) return
    
    const ctx = this.glassCellCtx
    const halfSize = this.cellSize / 2
    const cellRadius = 16
    const frameSize = halfSize - 1
    
    ctx.clearRect(0, 0, this.cellSize, this.cellSize)
    ctx.save()
    ctx.translate(halfSize, halfSize)
    
    // 使用预创建的玻璃框渐变
    ctx.fillStyle = this.glassGradient
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.lineWidth = 1.5
    
    // 绘制圆角矩形
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    ctx.stroke()
    
    // 使用预创建的高光渐变
    ctx.fillStyle = this.glassHighlightGradient
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    
    // 内圈轮廓
    const innerFrame = frameSize - 2
    const innerRadius = cellRadius - 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 6
    
    this.drawRoundedRect(ctx, -innerFrame, -innerFrame, innerFrame * 2, innerFrame * 2, innerRadius)
    ctx.stroke()
    
    ctx.restore()
  }
  
  // 绘制整个玻璃框网格到缓存（批量绘制优化）
  drawGlassGridToCache() {
    if (!this.glassGridCtx) return
    
    const ctx = this.glassGridCtx
    ctx.clearRect(0, 0, this.gridSize, this.gridSize)
    
    // 确保玻璃框单元格缓存已创建
    if (this.glassCellNeedsUpdate && this.glassCellCache) {
      this.drawGlassCellToCache()
      this.glassCellNeedsUpdate = false
    }
    
    // 批量绘制所有玻璃框
    for (let i = 0; i < this.totalBubbles; i++) {
      const col = i % this.cols
      const row = Math.floor(i / this.cols)
      const x = this.gap + col * this.cellSize + this.cellSize / 2
      const y = this.gap + row * this.cellSize + this.cellSize / 2
      
      // 从单元格缓存复制
      if (this.glassCellCache) {
        ctx.drawImage(
          this.glassCellCache,
          x - this.cellSize / 2,
          y - this.cellSize / 2
        )
      }
    }
  }
  
  // 绘制背景到离屏Canvas
  drawBackgroundToCache() {
    if (!this.bgCtx) return
    
    const ctx = this.bgCtx
    
    // 渐变背景
    ctx.fillStyle = this.bgGradient
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 霓虹网格背景
    this.drawNeonGridToCtx(ctx)
    
    // 星星粒子（静态位置，不闪烁）
    this.drawStarsToCtx(ctx, false)
  }

  // 初始化泡泡
  initBubbles() {
    this.bubbles = []
    for (let i = 0; i < this.totalBubbles; i++) {
      const col = i % this.cols
      const row = Math.floor(i / this.cols)
      
      const x = this.gridX + this.gap + col * this.cellSize + this.cellSize / 2
      const y = this.gridY + this.gap + row * this.cellSize + this.cellSize / 2
      const radius = (this.cellSize - 16) / 2
      
      // 预创建普通泡泡渐变
      let colors
      if (i < this.bubbleColors.length) {
        colors = this.bubbleColors[i]
      } else if (i < this.bubbleColors.length + this.extraBubbleColors.length) {
        colors = this.extraBubbleColors[i - this.bubbleColors.length]
      } else {
        colors = this.bubbleColors[0]
      }
      
      const normalGradient = this.ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      )
      normalGradient.addColorStop(0, colors.center)
      normalGradient.addColorStop(0.7, colors.edge)
      normalGradient.addColorStop(1, colors.dark)
      
      // 预创建激活泡泡渐变（pink/purple/blue）
      const pinkGradient = this.ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      )
      pinkGradient.addColorStop(0, this.activeColors.pink.center)
      pinkGradient.addColorStop(0.45, this.activeColors.pink.mid)
      pinkGradient.addColorStop(1, this.activeColors.pink.edge)
      
      const purpleGradient = this.ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      )
      purpleGradient.addColorStop(0, this.activeColors.purple.center)
      purpleGradient.addColorStop(0.45, this.activeColors.purple.mid)
      purpleGradient.addColorStop(1, this.activeColors.purple.edge)
      
      const blueGradient = this.ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      )
      blueGradient.addColorStop(0, this.activeColors.blue.center)
      blueGradient.addColorStop(0.45, this.activeColors.blue.mid)
      blueGradient.addColorStop(1, this.activeColors.blue.edge)
      
      // 预创建错误泡泡渐变
      const errorGradient = this.ctx.createRadialGradient(
        x, y, radius * 0.1,
        x, y, radius
      )
      errorGradient.addColorStop(0, '#f87171')
      errorGradient.addColorStop(1, '#dc2626')
      
      this.bubbles.push({
        index: i,
        x: x,
        y: y,
        radius: radius,
        state: 'normal',
        scale: 1,
        activeColor: null,
        clicked: false,
        // 预创建的渐变对象
        normalGradient: normalGradient,
        pinkGradient: pinkGradient,
        purpleGradient: purpleGradient,
        blueGradient: blueGradient,
        errorGradient: errorGradient
      })
    }
  }

  // 重置所有泡泡
  resetBubbles() {
    this.bubbles.forEach(bubble => {
      bubble.state = 'normal'
      bubble.scale = 1
      bubble.activeColor = null
      bubble.clicked = false
    })
    // 清空激活列表
    this.activeBubbles = []
  }

  // 设置泡泡状态（观察阶段专用 - 会闪动）
  setBubbleStateForObserving(index, color = 'purple') {
    if (index >= 0 && index < this.bubbles.length) {
      const bubble = this.bubbles[index]
      bubble.state = color
      bubble.activeColor = color
      bubble.clicked = false  // 观察阶段，不标记为已点击，保持闪动
      // 添加到激活列表
      if (!this.activeBubbles.includes(bubble)) {
        this.activeBubbles.push(bubble)
      }
    }
  }
  
  // 设置泡泡状态
  setBubbleState(index, state, color = 'purple') {
    if (index >= 0 && index < this.bubbles.length) {
      const bubble = this.bubbles[index]
      bubble.state = state
      bubble.activeColor = color
      // 如果是点击后的激活状态，标记为已点击（停止闪动）
      if (state === 'pink' || state === 'purple' || state === 'blue') {
        bubble.clicked = true
        // 添加到激活列表
        if (!this.activeBubbles.includes(bubble)) {
          this.activeBubbles.push(bubble)
        }
      } else {
        // 从激活列表移除
        const idx = this.activeBubbles.indexOf(bubble)
        if (idx >= 0) {
          this.activeBubbles.splice(idx, 1)
        }
      }
    }
  }

  // 绘制背景
  drawBackground() {
    const ctx = this.ctx
    
    // 使用离屏Canvas缓存（如果可用）
    if (this.bgCanvas && this.bgCtx) {
      // 标记需要更新
      if (this.bgNeedsUpdate) {
        this.drawBackgroundToCache()
        this.bgNeedsUpdate = false
      }
      // 直接复制缓存
      ctx.drawImage(this.bgCanvas, 0, 0)
      
      // 星星闪烁效果（动态层）
      this.drawStars(ctx, true)
    } else {
      // 降级方案：直接绘制
      ctx.fillStyle = this.bgGradient
      ctx.fillRect(0, 0, this.width, this.height)
      this.drawNeonGrid(ctx)
      this.drawStars(ctx, true)
    }
  }

  // 绘制霓虹网格（支持传入ctx）
  drawNeonGrid(ctx) {
    ctx = ctx || this.ctx
    const gridHeight = this.height * 0.3
    const gridY = this.height - gridHeight
    
    ctx.save()
    ctx.globalAlpha = 0.15
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)'
    ctx.lineWidth = 1
    
    const gridSize = 30
    const cols = Math.ceil(this.width / gridSize)
    const rows = Math.ceil(gridHeight / gridSize)
    
    // 优化：合并路径减少stroke调用
    ctx.beginPath()
    for (let i = 0; i <= cols; i++) {
      const x = i * gridSize
      ctx.moveTo(x, gridY)
      ctx.lineTo(x, this.height)
    }
    ctx.stroke()
    
    ctx.beginPath()
    for (let i = 0; i <= rows; i++) {
      const y = gridY + i * gridSize
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
    }
    ctx.stroke()
    
    ctx.restore()
  }
  
  // 绘制霓虹网格到指定ctx（用于缓存）
  drawNeonGridToCtx(ctx) {
    this.drawNeonGrid(ctx)
  }

  // 绘制星星粒子（支持传入ctx和是否闪烁）
  drawStars(ctx, animate) {
    ctx = ctx || this.ctx
    animate = animate !== undefined ? animate : true
    ctx.save()
    
    for (let i = 0; i < 30; i++) {
      const seed = i * 1337
      const x = ((seed * 7) % this.width)
      const y = ((seed * 13) % (this.height * 0.7))
      const size = ((seed * 3) % 2) + 1
      
      let alpha = 0.8
      if (animate) {
        const twinkle = Math.sin(this.animationFrame * 0.02 + i) * 0.4 + 0.6
        alpha = twinkle * 0.8
      }
      
      ctx.globalAlpha = alpha
      ctx.fillStyle = Colors.white
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    
    ctx.restore()
  }
  
  // 绘制星星到指定ctx（用于缓存）
  drawStarsToCtx(ctx, animate) {
    this.drawStars(ctx, animate)
  }

  // 绘制玻璃框网格容器
  drawGridContainer() {
    const ctx = this.ctx
    ctx.save()
    
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.fillStyle = 'rgba(88, 28, 135, 0.2)'
    
    const radius = 24
    const x = this.gridX
    const y = this.gridY
    const w = this.gridSize
    const h = this.gridSize
    
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + w - radius, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
    ctx.lineTo(x + w, y + h - radius)
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    ctx.lineTo(x + radius, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    
    ctx.restore()
  }

  // 绘制单个玻璃框单元格
  drawGlassCell(x, y, size) {
    const ctx = this.ctx
    const halfSize = size / 2
    const cellRadius = 16
    const frameSize = halfSize - 1  // 减小间距：从 -2 改为 -1
    
    ctx.save()
    ctx.translate(x, y)
    
    // 使用预创建的玻璃框渐变
    ctx.fillStyle = this.glassGradient
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.lineWidth = 1.5
    
    // 绘制圆角矩形
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    ctx.stroke()
    
    // 使用预创建的高光渐变
    ctx.fillStyle = this.glassHighlightGradient
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    
    // 内圈轮廓
    const innerFrame = frameSize - 2  // 从 -3 改为 -2，保持相对间距
    const innerRadius = cellRadius - 2  // 从 -3 改为 -2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 6
    
    this.drawRoundedRect(ctx, -innerFrame, -innerFrame, innerFrame * 2, innerFrame * 2, innerRadius)
    ctx.stroke()
    
    ctx.restore()
  }

  // 辅助方法：绘制圆角矩形
  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  // 绘制普通泡泡（暗色状态）
  drawNormalBubble(ctx, bubble) {
    const { x, y, radius, normalGradient } = bubble
    
    ctx.fillStyle = normalGradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 优化：合并高光和反光到同一路径
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x - radius * 0.25, y - radius * 0.3, radius * 0.3, radius * 0.2, -0.4, 0, Math.PI * 2)
    ctx.arc(x + radius * 0.3, y + radius * 0.3, radius * 0.22, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制激活泡泡（发光状态）
  drawActiveBubble(ctx, bubble, isObserving = false) {
    const { x, y, radius, activeColor, pinkGradient, purpleGradient, blueGradient } = bubble
    const colors = this.activeColors[activeColor] || this.activeColors.purple
    
    // 观察阶段：闪动效果（亮度和缩放变化）
    // 点击后：保持高亮状态，不闪动
    const scale = isObserving ? 1 + Math.sin(this.glowPhase) * 0.04 : 1.04
    
    // 发光效果（观察阶段动态，点击后固定值减少计算）
    ctx.shadowColor = colors.glow
    ctx.shadowBlur = isObserving ? (20 + Math.sin(this.glowPhase) * 10) : 25
    
    // 使用预创建的渐变
    let gradient
    if (activeColor === 'pink') {
      gradient = pinkGradient
    } else if (activeColor === 'blue') {
      gradient = blueGradient
    } else {
      gradient = purpleGradient
    }
    
    ctx.fillStyle = gradient
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    
    // 边框
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 顶部高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    ctx.ellipse(x - radius * 0.25, y - radius * 0.3, radius * 0.3, radius * 0.2, -0.4, 0, Math.PI * 2)
    ctx.fill()
    
    // 重置阴影
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  // 绘制错误泡泡（红色）
  drawErrorBubble(ctx, bubble) {
    const { x, y, radius, errorGradient } = bubble
    
    ctx.shadowColor = Colors.red500
    ctx.shadowBlur = 15
    
    ctx.fillStyle = errorGradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.strokeStyle = Colors.red500
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  // 绘制所有泡泡
  drawBubbles() {
    const ctx = this.ctx
    
    // 绘制玻璃框容器
    this.drawGridContainer()
    
    // 批量绘制玻璃框网格（优化：减少 draw call）
    if (this.glassGridCache && this.glassGridCtx) {
      // 首次或尺寸变化时重新绘制缓存
      if (this.glassGridNeedsUpdate) {
        this.drawGlassGridToCache()
        this.glassGridNeedsUpdate = false
      }
      // 一次性复制整个网格（1 次 draw call）
      ctx.drawImage(this.glassGridCache, this.gridX, this.gridY)
    } else {
      // 降级方案：逐个绘制玻璃框
      this.bubbles.forEach(bubble => {
        if (this.glassCellCache && this.glassCellCtx) {
          if (this.glassCellNeedsUpdate) {
            this.drawGlassCellToCache()
            this.glassCellNeedsUpdate = false
          }
          ctx.drawImage(
            this.glassCellCache,
            bubble.x - this.cellSize / 2,
            bubble.y - this.cellSize / 2
          )
        } else {
          this.drawGlassCell(bubble.x, bubble.y, this.cellSize)
        }
      })
    }
    
    // 绘制泡泡
    this.bubbles.forEach(bubble => {
      if (bubble.state === 'normal') {
        this.drawNormalBubble(ctx, bubble)
      } else if (bubble.state === 'red') {
        this.drawErrorBubble(ctx, bubble)
      } else if (bubble.state === 'pink' || bubble.state === 'purple' || bubble.state === 'blue') {
        const isObserving = !bubble.clicked
        this.drawActiveBubble(ctx, bubble, isObserving)
      }
    })
  }

  // 更新动画
  update(deltaTime) {
    this.animationFrame++
    this.glowPhase += deltaTime * 0.005
    
    // 优化：只更新激活泡泡的缩放（避免遍历所有泡泡）
    for (let i = 0; i < this.activeBubbles.length; i++) {
      const bubble = this.activeBubbles[i]
      bubble.scale = Math.sin(this.glowPhase) * 0.04 + 1
    }
  }

  // 渲染
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.drawBackground()
    this.drawBubbles()
  }

  // 根据触摸位置获取泡泡索引
  getBubbleIndexAtPoint(x, y) {
    // 优化：使用更大的点击区域（提升点击灵敏度）
    const clickRadiusBonus = 4  // 额外增加 4px 点击区域
    
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i]
      // 使用泡泡半径 + 额外区域，并考虑缩放
      const clickRadius = bubble.radius * bubble.scale + clickRadiusBonus
      if (isPointInCircle(x, y, bubble.x, bubble.y, clickRadius)) {
        return i
      }
    }
    return -1
  }
}
