/**
 * 音效管理器 - 基于 index.html 的 Web Audio API 合成方式
 * 适配微信小游戏环境
 */
export class AudioManager {
  constructor() {
    this.enabled = true
    this.ctx = null
    this.isWechat = false
    this.wechatAudioContext = null
    
    this._detectEnvironment()
    this._initAudioContext()
  }

  // 检测运行环境
  _detectEnvironment() {
    try {
      if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
        this.isWechat = true
      }
    } catch (e) {
      this.isWechat = false
    }
  }

  // 初始化音频上下文
  _initAudioContext() {
    if (this.isWechat) {
      // 微信小游戏环境：尝试使用 wx.createWebAudioContext()
      try {
        if (typeof wx.createWebAudioContext === 'function') {
          this.wechatAudioContext = wx.createWebAudioContext()
          this.ctx = this.wechatAudioContext
          console.log('使用微信 WebAudioContext')
          return
        }
      } catch (e) {
        console.log('微信 WebAudioContext 不可用')
      }
    }

    // 浏览器环境：使用标准 Web Audio API
    if (!this.ctx) {
      try {
        if (typeof window !== 'undefined') {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)()
          console.log('使用浏览器 Web Audio API')
        }
      } catch (e) {
        console.log('Web Audio API 不可用')
      }
    }
  }

  // 确保音频上下文已初始化
  _ensureContext() {
    if (!this.ctx) {
      this._initAudioContext()
    }
    
    // 微信环境中，如果 WebAudioContext 不可用，使用 InnerAudioContext 回退
    if (!this.ctx && this.isWechat) {
      return false
    }
    
    // 浏览器环境中，恢复被暂停的 AudioContext
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    
    return !!this.ctx
  }

  // ==================== 音效合成方法（与 index.html 保持一致）====================

  // 泡泡爆破音 - 正弦波，频率从 400Hz 快速上升到 1200Hz
  _playPop() {
    if (!this._ensureContext()) return
    
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(400, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.12)
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)
    
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  // 错误音 - 锯齿波，频率从 180Hz 下降到 100Hz
  _playWrong() {
    if (!this._ensureContext()) return
    
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, this.ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.4)
    
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.4)
    
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.45)
  }

  // 成功音 - 三角波，C5-E5-G5-C6 上升音阶
  _playSuccess() {
    if (!this._ensureContext()) return
    
    const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
    const now = this.ctx.currentTime
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.08)
      
      gain.gain.setValueAtTime(0.2, now + idx * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25)
      
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(now + idx * 0.08)
      osc.stop(now + idx * 0.08 + 0.3)
    })
  }

  // 点击音 - 正弦波，频率从 600Hz 快速下降到 300Hz
  _playClick() {
    if (!this._ensureContext()) return
    
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, this.ctx.currentTime)
    osc.frequency.setValueAtTime(300, this.ctx.currentTime + 0.03)
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05)
    
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.06)
  }

  // ==================== 统一播放接口 ====================

  /**
   * 播放音效
   * @param {string} type - 音效类型: 'pop' | 'wrong' | 'success' | 'click'
   */
  play(type) {
    if (!this.enabled) return

    switch (type) {
      case 'pop':
        this._playPop()
        break
      case 'wrong':
        this._playWrong()
        break
      case 'success':
        this._playSuccess()
        break
      case 'click':
        this._playClick()
        break
      default:
        console.warn(`Unknown sound type: ${type}`)
    }
  }

  // 切换声音开关
  toggle() {
    this.enabled = !this.enabled
    return this.enabled
  }
}
