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
    this.gridX = 0
    this.gridY = 0
    this.gridSize = 0
    this.cellSize = 0
    this.gap = 12
    
    // 动画状态
    this.animationFrame = 0
    this.glowPhase = 0
    
    this.updateLayout()
    this.initBubbles()
  }

  // 设置网格大小
  setGridSize(cols, rows) {
    this.cols = cols
    this.rows = rows
    this.totalBubbles = this.cols * this.rows
    this.updateLayout()
    this.initBubbles()
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
  }

  // 初始化泡泡
  initBubbles() {
    this.bubbles = []
    for (let i = 0; i < this.totalBubbles; i++) {
      const col = i % this.cols
      const row = Math.floor(i / this.cols)
      
      const x = this.gridX + this.gap + col * this.cellSize + this.cellSize / 2
      const y = this.gridY + this.gap + row * this.cellSize + this.cellSize / 2
      
      this.bubbles.push({
        index: i,
        x: x,
        y: y,
        radius: (this.cellSize - 16) / 2,
        state: 'normal',
        scale: 1,
        activeColor: null,
        clicked: false  // 添加 clicked 标记，用于区分观察阶段和点击后
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
  }

  // 设置泡泡状态（观察阶段专用 - 会闪动）
  setBubbleStateForObserving(index, color = 'purple') {
    if (index >= 0 && index < this.bubbles.length) {
      this.bubbles[index].state = color
      this.bubbles[index].activeColor = color
      this.bubbles[index].clicked = false  // 观察阶段，不标记为已点击，保持闪动
    }
  }
  
  // 设置泡泡状态
  setBubbleState(index, state, color = 'purple') {
    if (index >= 0 && index < this.bubbles.length) {
      this.bubbles[index].state = state
      this.bubbles[index].activeColor = color
      // 如果是点击后的激活状态，标记为已点击（停止闪动）
      if (state === 'pink' || state === 'purple' || state === 'blue') {
        this.bubbles[index].clicked = true
      }
    }
  }

  // 绘制背景
  drawBackground() {
    const ctx = this.ctx
    
    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height)
    gradient.addColorStop(0, '#0d0926')
    gradient.addColorStop(0.6, '#17113a')
    gradient.addColorStop(1, '#2b185d')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 霓虹网格背景
    this.drawNeonGrid()
    
    // 星星粒子
    this.drawStars()
  }

  // 绘制霓虹网格
  drawNeonGrid() {
    const ctx = this.ctx
    const gridHeight = this.height * 0.3
    const gridY = this.height - gridHeight
    
    ctx.save()
    ctx.globalAlpha = 0.15
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)'
    ctx.lineWidth = 1
    
    const gridSize = 30
    const cols = Math.ceil(this.width / gridSize)
    const rows = Math.ceil(gridHeight / gridSize)
    
    for (let i = 0; i <= cols; i++) {
      const x = i * gridSize
      ctx.beginPath()
      ctx.moveTo(x, gridY)
      ctx.lineTo(x, this.height)
      ctx.stroke()
    }
    
    for (let i = 0; i <= rows; i++) {
      const y = gridY + i * gridSize
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
      ctx.stroke()
    }
    
    ctx.restore()
  }

  // 绘制星星粒子
  drawStars() {
    const ctx = this.ctx
    ctx.save()
    
    for (let i = 0; i < 30; i++) {
      const seed = i * 1337
      const x = ((seed * 7) % this.width)
      const y = ((seed * 13) % (this.height * 0.7))
      const size = ((seed * 3) % 2) + 1
      const twinkle = Math.sin(this.animationFrame * 0.02 + i) * 0.4 + 0.6
      ctx.globalAlpha = twinkle * 0.8
      ctx.fillStyle = Colors.white
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
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
    const x = this.gridX - 8
    const y = this.gridY - 8
    const w = this.gridSize + 16
    const h = this.gridSize + 16
    
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
    const frameSize = halfSize - 2
    
    ctx.save()
    ctx.translate(x, y)
    
    // 玻璃框背景
    const gradient = ctx.createLinearGradient(-halfSize, -halfSize, halfSize, halfSize)
    gradient.addColorStop(0, 'rgba(25, 27, 44, 0.6)')
    gradient.addColorStop(1, 'rgba(14, 15, 28, 0.8)')
    
    ctx.fillStyle = gradient
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.lineWidth = 1.5
    
    // 绘制圆角矩形
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    ctx.stroke()
    
    // 玻璃高光
    const highlightGradient = ctx.createLinearGradient(-frameSize, -frameSize, frameSize, frameSize)
    highlightGradient.addColorStop(0, 'rgba(25, 25, 255, 0.14)')
    highlightGradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)')
    highlightGradient.addColorStop(0.5, 'transparent')
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.04)')
    
    ctx.fillStyle = highlightGradient
    this.drawRoundedRect(ctx, -frameSize, -frameSize, frameSize * 2, frameSize * 2, cellRadius)
    ctx.fill()
    
    // 内圈轮廓
    const innerFrame = frameSize - 3
    const innerRadius = cellRadius - 3
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
  drawNormalBubble(ctx, x, y, radius, index) {
    // 支持更多颜色的泡泡
    let colors
    if (index < this.bubbleColors.length) {
      colors = this.bubbleColors[index]
    } else if (index < this.bubbleColors.length + this.extraBubbleColors.length) {
      colors = this.extraBubbleColors[index - this.bubbleColors.length]
    } else {
      // 如果超出范围，使用第一个颜色作为默认
      colors = this.bubbleColors[0]
    }
    
    if (!colors) return
    
    // 径向渐变
    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, radius * 0.1,
      x, y, radius
    )
    gradient.addColorStop(0, colors.center)
    gradient.addColorStop(0.7, colors.edge)
    gradient.addColorStop(1, colors.dark)
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 顶部月牙形高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x - radius * 0.25, y - radius * 0.3, radius * 0.3, radius * 0.2, -0.4, 0, Math.PI * 2)
    ctx.fill()
    
    // 右下角弱反光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.beginPath()
    ctx.arc(x + radius * 0.3, y + radius * 0.3, radius * 0.22, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制激活泡泡（发光状态）
  drawActiveBubble(ctx, x, y, radius, color, isObserving = false) {
    const colors = this.activeColors[color]
    if (!colors) colors = this.activeColors.purple
    
    // 观察阶段：闪动效果（亮度和缩放变化）
    // 点击后：保持高亮状态，不闪动
    const brightness = isObserving ? 0.7 + Math.sin(this.glowPhase) * 0.3 : 1
    const scale = isObserving ? 1 + Math.sin(this.glowPhase) * 0.04 : 1.04
    
    // 发光效果（观察阶段更强）
    ctx.shadowColor = colors.glow
    ctx.shadowBlur = isObserving ? (20 + Math.sin(this.glowPhase) * 10) : 25
    
    // 径向渐变
    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, radius * 0.1,
      x, y, radius
    )
    gradient.addColorStop(0, colors.center)
    gradient.addColorStop(0.45, colors.mid)
    gradient.addColorStop(1, colors.edge)
    
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
  drawErrorBubble(ctx, x, y, radius) {
    ctx.shadowColor = Colors.red500
    ctx.shadowBlur = 15
    
    const gradient = ctx.createRadialGradient(
      x, y, radius * 0.1,
      x, y, radius
    )
    gradient.addColorStop(0, '#f87171')
    gradient.addColorStop(1, '#dc2626')
    
    ctx.fillStyle = gradient
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
    
    // 绘制每个单元格和泡泡
    this.bubbles.forEach(bubble => {
      // 绘制玻璃框
      this.drawGlassCell(bubble.x, bubble.y, this.cellSize)
      
      // 绘制泡泡
      if (bubble.state === 'normal') {
        this.drawNormalBubble(ctx, bubble.x, bubble.y, bubble.radius, bubble.index)
      } else if (bubble.state === 'red') {
        this.drawErrorBubble(ctx, bubble.x, bubble.y, bubble.radius)
      } else if (bubble.state === 'pink' || bubble.state === 'purple' || bubble.state === 'blue') {
        // 判断是否在观察阶段（通过检查是否有 clicked 标记）
        const isObserving = !bubble.clicked
        this.drawActiveBubble(ctx, bubble.x, bubble.y, bubble.radius, bubble.activeColor || bubble.state, isObserving)
      }
    })
  }

  // 更新动画
  update(deltaTime) {
    this.animationFrame++
    this.glowPhase += deltaTime * 0.005
    
    // 更新激活泡泡的缩放
    this.bubbles.forEach(bubble => {
      if (bubble.state === 'pink' || bubble.state === 'purple' || bubble.state === 'blue') {
        const pulse = Math.sin(this.glowPhase) * 0.04 + 1
        bubble.scale = pulse
      } else {
        bubble.scale = 1
      }
    })
  }

  // 渲染
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.drawBackground()
    this.drawBubbles()
  }

  // 根据触摸位置获取泡泡索引
  getBubbleIndexAtPoint(x, y) {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i]
      if (isPointInCircle(x, y, bubble.x, bubble.y, bubble.radius * bubble.scale)) {
        return i
      }
    }
    return -1
  }
}
