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
    
    // 扩展到 25 个（5x5）、36 个（6x6）、49 个（7x7）的配色（按需生成）
    this.extraBubbleColors = null
    
    // 激活状态配色
    this.activeColors = {
      pink: { center: '#ffd1eb', mid: '#ec4899', edge: '#9d174d', glow: 'rgba(236, 72, 153, 0.95)', border: '#ffd1eb' },
      purple: { center: '#f5d0fe', mid: '#c084fc', edge: '#6b21a8', glow: 'rgba(192, 132, 252, 0.95)', border: '#f5d0fe' },
      blue: { center: '#e0f2fe', mid: '#3b82f6', edge: '#1d4ed8', glow: 'rgba(59, 130, 246, 0.95)', border: '#e0f2fe' }
    }
    
    // 泡泡状态
    this.bubbles = []
    this.activeBubbles = new Set()  // 优化：使用 Set 替代 Array，O(1) 查找
    this.gridX = 0
    this.gridY = 0
    this.gridSize = 0
    this.cellSize = 0
    this.gap = 8  // 减小网格间距：从 12 改为 8
    
    // 动画状态
    this.animationFrame = 0
    this.glowPhase = 0
    this.starsAnimate = true
    
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
    
    // 释放旧的离屏 Canvas（防止内存泄漏）
    this._releaseOffscreenCanvases()
    
    // 创建新的离屏 Canvas
    this.createBgCache()
    this.createGlassCellCache()
    this.createGlassGridCache()
    
    // 预创建玻璃框渐变（使用离屏 Canvas ctx，避免跨 ctx 使用渐变对象）
    // 渐变在 drawGlassCellToCache 中使用，因此应使用 glassCellCtx
    const glassCtx = this.glassCellCtx || this.ctx
    const halfSize = this.cellSize / 2
    this.glassGradient = glassCtx.createLinearGradient(-halfSize, -halfSize, halfSize, halfSize)
    this.glassGradient.addColorStop(0, 'rgba(25, 27, 44, 0.6)')
    this.glassGradient.addColorStop(1, 'rgba(14, 15, 28, 0.8)')
    
    this.glassHighlightGradient = glassCtx.createLinearGradient(-halfSize, -halfSize, halfSize, halfSize)
    this.glassHighlightGradient.addColorStop(0, 'rgba(25, 25, 255, 0.14)')
    this.glassHighlightGradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)')
    this.glassHighlightGradient.addColorStop(0.5, 'transparent')
    this.glassHighlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.04)')
    
    // 标记背景需要更新
    this.bgNeedsUpdate = true
    this.glassCellNeedsUpdate = true
    this.glassGridNeedsUpdate = true
  }
  
  // 释放离屏 Canvas（防止内存泄漏）
  _releaseOffscreenCanvases() {
    // 将引用置空，让 GC 回收
    if (this.bgCanvas) {
      this.bgCanvas.width = 0  // 先释放像素内存
      this.bgCanvas = null
      this.bgCtx = null
    }
    if (this.glassCellCache) {
      this.glassCellCache.width = 0
      this.glassCellCache = null
      this.glassCellCtx = null
    }
    if (this.glassGridCache) {
      this.glassGridCache.width = 0
      this.glassGridCache = null
      this.glassGridCtx = null
    }
  }
  
  // 创建离屏 Canvas 缓存（支持微信和浏览器环境）
  _createOffscreenCanvas(w, h) {
    try {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        return wx.createOffscreenCanvas({ type: '2d', width: Math.ceil(w), height: Math.ceil(h) })
      }
      if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(Math.ceil(w), Math.ceil(h))
      }
    } catch (e) {
      // 降级：返回 null
    }
    return null
  }

  // 创建离屏 Canvas 缓存
  createBgCache() {
    try {
      const offscreen = this._createOffscreenCanvas(this.width, this.height)
      if (offscreen) {
        this.bgCanvas = offscreen
        this.bgCtx = offscreen.getContext('2d')
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
      const offscreen = this._createOffscreenCanvas(this.cellSize, this.cellSize)
      if (offscreen) {
        this.glassCellCache = offscreen
        this.glassCellCtx = offscreen.getContext('2d')
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
      const offscreen = this._createOffscreenCanvas(this.gridSize, this.gridSize)
      if (offscreen) {
        this.glassGridCache = offscreen
        this.glassGridCtx = offscreen.getContext('2d')
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
    const halfSize = this.cellSize / 2
    this.glassCellCtx.clearRect(0, 0, this.cellSize, this.cellSize)
    this._drawGlassCellOnCtx(this.glassCellCtx, halfSize, halfSize, this.cellSize)
  }
  
  // 绘制整个玻璃框网格到缓存（批量绘制优化，包含容器背景）
  drawGlassGridToCache() {
    if (!this.glassGridCtx) return
    
    const ctx = this.glassGridCtx
    ctx.clearRect(0, 0, this.gridSize, this.gridSize)
    
    // 先绘制容器背景（静态内容，合并到缓存）
    ctx.save()
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.fillStyle = 'rgba(88, 28, 135, 0.2)'
    
    const radius = 24
    ctx.beginPath()
    ctx.moveTo(radius, 0)
    ctx.lineTo(this.gridSize - radius, 0)
    ctx.quadraticCurveTo(this.gridSize, 0, this.gridSize, radius)
    ctx.lineTo(this.gridSize, this.gridSize - radius)
    ctx.quadraticCurveTo(this.gridSize, this.gridSize, this.gridSize - radius, this.gridSize)
    ctx.lineTo(radius, this.gridSize)
    ctx.quadraticCurveTo(0, this.gridSize, 0, this.gridSize - radius)
    ctx.lineTo(0, radius)
    ctx.quadraticCurveTo(0, 0, radius, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    
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
    this.drawNeonGrid(ctx)
    
    // 星星粒子（静态位置，不闪烁）- 优化：不绘制星星到缓存，减少开销
    // this.drawStars(ctx, false)  // 移除静态星星，只在动态层绘制
  }

  // 初始化泡泡
  initBubbles() {
    // 释放旧的泡泡渐变对象（防止内存泄漏）
    this.bubbles = []
    
    for (let i = 0; i < this.totalBubbles; i++) {
      const col = i % this.cols
      const row = Math.floor(i / this.cols)
      
      const x = this.gridX + this.gap + col * this.cellSize + this.cellSize / 2
      const y = this.gridY + this.gap + row * this.cellSize + this.cellSize / 2
      const radius = (this.cellSize - 16) / 2
      
      // 获取泡泡颜色（按需生成额外颜色）
      let colors
      if (i < this.bubbleColors.length) {
        colors = this.bubbleColors[i]
      } else {
        // 延迟生成额外颜色（仅在需要时生成）
        if (!this.extraBubbleColors) {
          this.extraBubbleColors = []
          for (let j = 16; j < 49; j++) {
            const hue = (j * 23) % 360
            this.extraBubbleColors.push({
              center: `rgba(${hue}, ${100 + (j % 50)}, ${100 + (j % 40)}, 0.35)`,
              edge: `rgba(${hue % 30}, ${20 + (j % 30)}, ${30 + (j % 30)}, 0.95)`,
              dark: `rgba(${5 + (j % 10)}, ${5 + (j % 10)}, ${10 + (j % 15)}, 1)`
            })
          }
        }
        const extraIdx = i - this.bubbleColors.length
        colors = extraIdx < this.extraBubbleColors.length ? this.extraBubbleColors[extraIdx] : this.bubbleColors[0]
      }
      
      // 优化：减少渐变对象创建，只创建必要的渐变
      const normalGradient = this.ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      )
      normalGradient.addColorStop(0, colors.center)
      normalGradient.addColorStop(0.7, colors.edge)
      normalGradient.addColorStop(1, colors.dark)
      
      // 优化：延迟创建激活泡泡渐变（只在需要时创建）
      // 不再预创建所有渐变，而是在 drawActiveBubble 时动态创建
      this.bubbles.push({
        index: i,
        x: x,
        y: y,
        radius: radius,
        state: 'normal',
        scale: 1,
        activeColor: null,
        clicked: false,
        // 只保存必要的渐变
        normalGradient: normalGradient,
        // 延迟创建的渐变（按需创建）
        _pinkGradient: null,
        _purpleGradient: null,
        _blueGradient: null,
        _errorGradient: null
      })
    }
  }
  
  // 获取或创建激活泡泡渐变（延迟创建，节省内存）
  _getActiveGradient(bubble, color) {
    let gradient
    if (color === 'pink') {
      if (!bubble._pinkGradient) {
        const { x, y, radius } = bubble
        gradient = this.ctx.createRadialGradient(
          x - radius * 0.3, y - radius * 0.3, radius * 0.1,
          x, y, radius
        )
        gradient.addColorStop(0, this.activeColors.pink.center)
        gradient.addColorStop(0.45, this.activeColors.pink.mid)
        gradient.addColorStop(1, this.activeColors.pink.edge)
        bubble._pinkGradient = gradient
      }
      return bubble._pinkGradient
    } else if (color === 'blue') {
      if (!bubble._blueGradient) {
        const { x, y, radius } = bubble
        gradient = this.ctx.createRadialGradient(
          x - radius * 0.3, y - radius * 0.3, radius * 0.1,
          x, y, radius
        )
        gradient.addColorStop(0, this.activeColors.blue.center)
        gradient.addColorStop(0.45, this.activeColors.blue.mid)
        gradient.addColorStop(1, this.activeColors.blue.edge)
        bubble._blueGradient = gradient
      }
      return bubble._blueGradient
    } else {
      if (!bubble._purpleGradient) {
        const { x, y, radius } = bubble
        gradient = this.ctx.createRadialGradient(
          x - radius * 0.3, y - radius * 0.3, radius * 0.1,
          x, y, radius
        )
        gradient.addColorStop(0, this.activeColors.purple.center)
        gradient.addColorStop(0.45, this.activeColors.purple.mid)
        gradient.addColorStop(1, this.activeColors.purple.edge)
        bubble._purpleGradient = gradient
      }
      return bubble._purpleGradient
    }
  }

  // 重置所有泡泡
  resetBubbles() {
    const len = this.bubbles.length
    for (let i = 0; i < len; i++) {
      const bubble = this.bubbles[i]
      bubble.state = 'normal'
      bubble.scale = 1
      bubble.activeColor = null
      bubble.clicked = false
    }
    // 清空激活列表（使用 clear 而不是重新创建）
    this.activeBubbles.clear()
  }

  // 设置泡泡状态（观察阶段专用 - 会闪动）
  setBubbleStateForObserving(index, color = 'purple') {
    if (index >= 0 && index < this.bubbles.length) {
      const bubble = this.bubbles[index]
      bubble.state = color
      bubble.activeColor = color
      bubble.clicked = false  // 观察阶段，不标记为已点击，保持闪动
      // 添加到激活集合
      this.activeBubbles.add(bubble)
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
        // 添加到激活集合
        this.activeBubbles.add(bubble)
      } else {
        // 从激活集合移除
        this.activeBubbles.delete(bubble)
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
      
      // 星星闪烁效果（动态层；弹窗界面可关闭动画以省 CPU）
      this.drawStars(ctx, this.starsAnimate)
    } else {
      // 降级方案：直接绘制
      ctx.fillStyle = this.bgGradient
      ctx.fillRect(0, 0, this.width, this.height)
      this.drawNeonGrid(ctx)
      this.drawStars(ctx, this.starsAnimate)
    }
  }

  // 绘制霓虹网格（支持传入ctx）
  drawNeonGrid(ctx) {
    ctx = ctx || this.ctx
    const gridHeight = this.height * 0.3
    const gridY = this.height - gridHeight
    
    // 优化：减少 alpha 混合操作
    ctx.save()
    ctx.globalAlpha = 0.12  // 降低透明度，减少混合开销
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)'  // 降低线条透明度
    ctx.lineWidth = 1
    
    const gridSize = 35  // 增大网格尺寸，减少线条数量
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

  // 绘制星星粒子（支持传入 ctx 和是否闪烁）
  drawStars(ctx, animate) {
    ctx = ctx || this.ctx
    animate = animate !== undefined ? animate : true
    ctx.save()
    
    // 预计算星星位置（只在首次调用时计算）
    if (!this.starsCache) {
      this.starsCache = []
      // 减少星星数量：从 30 减少到 15，降低绘制开销
      for (let i = 0; i < 15; i++) {
        const seed = i * 1337
        this.starsCache.push({
          x: ((seed * 7) % this.width),
          y: ((seed * 13) % (this.height * 0.7)),
          size: ((seed * 3) % 2) + 1,
          phase: i  // 闪烁相位
        })
      }
    }
    
    // 使用缓存绘制
    const starsLen = this.starsCache.length
    for (let i = 0; i < starsLen; i++) {
      const star = this.starsCache[i]
      let alpha = 0.8
      if (animate) {
        const twinkle = Math.sin(this.animationFrame * 0.02 + star.phase) * 0.4 + 0.6
        alpha = twinkle * 0.8
      }
      
      ctx.globalAlpha = alpha
      ctx.fillStyle = Colors.white
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
      ctx.fill()
    }
    
    ctx.restore()
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

  // 绘制单个玻璃框单元格（降级方案，无缓存时直接绘制）
  drawGlassCell(x, y, size) {
    this._drawGlassCellOnCtx(this.ctx, x, y, size)
  }

  // 通用玻璃框绘制（接受 ctx 和中心坐标）
  _drawGlassCellOnCtx(ctx, cx, cy, size) {
    const halfSize = size / 2
    const cellRadius = 16
    const frameSize = halfSize - 1

    ctx.save()
    ctx.translate(cx, cy)

    ctx.fillStyle = this.glassGradient
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.lineWidth = 1.5

    drawRoundRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = this.glassHighlightGradient
    drawRoundRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()

    // 优化：移除内部阴影边框（shadowBlur 性能开销大）
    // 只在必要时绘制
    const innerFrame = frameSize - 2
    const innerRadius = cellRadius - 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    // 移除 shadowBlur，改用简单描边
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    drawRoundRect(ctx, -innerFrame, -innerFrame, innerFrame * 2, innerFrame * 2, innerRadius)
    ctx.stroke()

    ctx.restore()
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
    
    // 优化：合并高光和反光到同一路径，使用圆形代替椭圆
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.25, 0, Math.PI * 2)
    ctx.arc(x + radius * 0.3, y + radius * 0.3, radius * 0.22, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制激活泡泡（发光状态）
  drawActiveBubble(ctx, bubble, isObserving = false) {
    const { x, y, radius, activeColor } = bubble
    const colors = this.activeColors[activeColor] || this.activeColors.purple
    
    // 使用 bubble.scale（由 update() 统一计算，确保视觉与点击判定一致）
    const scale = bubble.scale || 1
    
    ctx.save()
    
    // 发光效果（固定强度，避免每帧 shadowBlur 动画带来的 GPU 开销）
    ctx.shadowColor = colors.glow
    ctx.shadowBlur = 25
    
    // 使用延迟创建的渐变（节省内存）
    const gradient = this._getActiveGradient(bubble, activeColor)
    
    ctx.fillStyle = gradient
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
    
    // 边框（无阴影）- 优化：合并到上面的路径中
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.stroke()
    
    // 顶部高光 - 优化：减少椭圆计算
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    // 使用更简单的高光形状（圆形代替椭圆）
    ctx.arc(x - radius * 0.2, y - radius * 0.25, radius * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制错误泡泡（红色）
  drawErrorBubble(ctx, bubble) {
    const { x, y, radius, errorGradient } = bubble
    
    ctx.save()
    ctx.shadowColor = Colors.red500
    ctx.shadowBlur = 15
    
    ctx.fillStyle = errorGradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
    
    ctx.strokeStyle = Colors.red500
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 绘制所有泡泡
  drawBubbles() {
    const ctx = this.ctx
    
    // 批量绘制玻璃框网格（优化：减少 draw call，容器背景已合并到缓存）
    if (this.glassGridCache && this.glassGridCtx) {
      // 首次或尺寸变化时重新绘制缓存
      if (this.glassGridNeedsUpdate) {
        this.drawGlassGridToCache()
        this.glassGridNeedsUpdate = false
      }
      // 一次性复制整个网格（1 次 draw call）
      ctx.drawImage(this.glassGridCache, this.gridX, this.gridY)
    } else {
      // 降级方案：先绘制容器，再逐个绘制玻璃框
      this.drawGridContainer()
      for (let i = 0; i < this.bubbles.length; i++) {
        const bubble = this.bubbles[i]
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
      }
    }
    
    // 按状态分组绘制泡泡（减少样式切换开销）
    // 第一遍：普通泡泡（共用样式）
    const bubblesLen = this.bubbles.length
    for (let i = 0; i < bubblesLen; i++) {
      const bubble = this.bubbles[i]
      if (bubble.state === 'normal') {
        this.drawNormalBubble(ctx, bubble)
      }
    }
    // 第二遍：激活泡泡（观察/点击状态）
    for (let i = 0; i < bubblesLen; i++) {
      const bubble = this.bubbles[i]
      if (bubble.state === 'pink' || bubble.state === 'purple' || bubble.state === 'blue') {
        this.drawActiveBubble(ctx, bubble, !bubble.clicked)
      }
    }
    // 第三遍：错误泡泡（红色）
    for (let i = 0; i < bubblesLen; i++) {
      const bubble = this.bubbles[i]
      if (bubble.state === 'red') {
        this.drawErrorBubble(ctx, bubble)
      }
    }
  }

  // 更新动画
  update(deltaTime) {
    // 限制动画帧计数器，防止数值溢出（约 16 分钟后重置）
    this.animationFrame = (this.animationFrame + 1) % 600000
    this.glowPhase = (this.glowPhase + deltaTime * 0.005) % (Math.PI * 2)
    
    // 更新激活泡泡的缩放（观察阶段闪动，点击后固定 1.04）
    for (const bubble of this.activeBubbles) {
      bubble.scale = bubble.clicked ? 1.04 : (Math.sin(this.glowPhase) * 0.04 + 1)
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
