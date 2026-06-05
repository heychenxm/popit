/**
 * 云数据管理器 - 优化云函数调用次数
 * 
 * 优化策略：
 * 1. 批量更新：将多个更新操作合并为一次调用
 * 2. 防抖机制：延迟同步，合并多次更新为一次
 * 3. 本地优先：先更新本地，定期或达到条件再同步云端
 * 4. 关键节点同步：只在重要时刻同步数据
 */

export class CloudDataManager {
  constructor() {
    // 待同步的数据缓存
    this.pendingUpdates = {}
    
    // 防抖定时器
    this.debounceTimer = null
    
    // 同步间隔（毫秒）- 默认 5 秒
    this.syncInterval = 5000
    
    // 是否正在同步
    this.isSyncing = false
    
    // 同步失败次数
    this.failCount = 0
    
    // 最大失败次数（超过后停止自动同步）
    this.maxFailCount = 3
    
    // 是否启用自动同步
    this.autoSyncEnabled = true
    
    // 上次同步时间
    this.lastSyncTime = 0
    
    // 最小同步间隔（毫秒）- 避免频繁同步
    this.minSyncInterval = 3000
  }
  
  /**
   * 添加待同步的数据
   * @param {Object} data - 要同步的数据
   */
  addUpdate(data) {
    if (!this.autoSyncEnabled) {
      return
    }
    
    // 合并数据（后面的覆盖前面的）
    this.pendingUpdates = { ...this.pendingUpdates, ...data }
    
    // 清除之前的防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    
    // 设置新的防抖定时器
    this.debounceTimer = setTimeout(() => {
      this.flush()
    }, this.syncInterval)
  }
  
  /**
   * 立即同步（清除缓存并执行同步）
   */
  async flush() {
    // 如果没有待同步的数据，直接返回
    if (Object.keys(this.pendingUpdates).length === 0) {
      return
    }
    
    // 如果正在同步，等待同步完成
    if (this.isSyncing) {
      return
    }
    
    // 检查最小同步间隔
    const now = Date.now()
    if (now - this.lastSyncTime < this.minSyncInterval) {
      // 重新设置定时器
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }
      this.debounceTimer = setTimeout(() => {
        this.flush()
      }, this.minSyncInterval - (now - this.lastSyncTime))
      return
    }
    
    // 检查失败次数
    if (this.failCount >= this.maxFailCount) {
      this.autoSyncEnabled = false
      return
    }
    
    this.isSyncing = true
    this.lastSyncTime = Date.now()
    
    // 获取待同步的数据并清空缓存
    const updates = { ...this.pendingUpdates }
    this.pendingUpdates = {}
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: updates
      })
      
      if (result.result.success) {
        this.failCount = 0  // 重置失败计数
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      this.failCount++
      
      // 将未同步的数据重新加入缓存
      this.pendingUpdates = { ...this.pendingUpdates, ...updates }
      
      // 如果失败次数过多，禁用自动同步
      if (this.failCount >= this.maxFailCount) {
        this.autoSyncEnabled = false
      }
    } finally {
      this.isSyncing = false
    }
  }
  
  /**
   * 强制立即同步（不等待防抖）
   * 用于游戏退出等关键场景
   */
  async forceSync() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.flush()
  }
  
  /**
   * 启用自动同步
   */
  enableAutoSync() {
    this.autoSyncEnabled = true
    this.failCount = 0
  }
  
  /**
   * 禁用自动同步
   */
  disableAutoSync() {
    this.autoSyncEnabled = false
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
  
  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      pendingUpdates: this.pendingUpdates,
      isSyncing: this.isSyncing,
      failCount: this.failCount,
      autoSyncEnabled: this.autoSyncEnabled,
      lastSyncTime: this.lastSyncTime
    }
  }
  
  /**
   * 销毁管理器
   */
  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingUpdates = {}
    this.isSyncing = false
  }
}

// 导出单例
export const cloudDataManager = new CloudDataManager()
