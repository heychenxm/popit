/**
 * 云数据管理器 - 手动控制同步
 * 
 * 优化策略：
 * 1. 完全本地优先，不自动同步
 * 2. 只在需要时手动触发同步（如打开排行榜）
 * 3. 批量更新：将多个更新操作合并为一次调用
 * 4. 频率限制：控制同步频率，避免频繁调用
 */

import { callCloudFunction } from './utils.js'

export class CloudDataManager {
  constructor() {
    // 待同步的数据缓存
    this.pendingUpdates = {}
    
    // 是否正在同步
    this.isSyncing = false
    
    // 同步失败次数
    this.failCount = 0
    
    // 最大失败次数（超过后停止自动同步）
    this.maxFailCount = 3
    
    // 上次同步时间
    this.lastSyncTime = 0
    
    // 最小同步间隔（毫秒）- 5 分钟内不重复同步
    this.minSyncInterval = 300000
  }
  
  /**
   * 添加待同步的数据（不自动同步，需要手动调用 flush）
   * @param {Object} data - 要同步的数据
   */
  addUpdate(data) {
    // 合并数据（后面的覆盖前面的）
    this.pendingUpdates = { ...this.pendingUpdates, ...data }
  }
  
  /**
   * 手动触发同步（需要外部主动调用）
   */
  async flush() {
    // 如果没有待同步的数据，直接返回
    if (Object.keys(this.pendingUpdates).length === 0) {
      return { success: true, message: '无待同步数据' }
    }
    
    // 如果正在同步，等待同步完成
    if (this.isSyncing) {
      return { success: false, message: '正在同步中' }
    }
    
    // 检查最小同步间隔
    const now = Date.now()
    if (now - this.lastSyncTime < this.minSyncInterval) {
      const waitTime = Math.ceil((this.minSyncInterval - (now - this.lastSyncTime)) / 60000)
      return { 
        success: false, 
        message: `同步过于频繁，请${waitTime}分钟后再试`,
        waitTime: waitTime
      }
    }
    
    // 检查失败次数
    if (this.failCount >= this.maxFailCount) {
      return { success: false, message: '同步失败次数过多，已禁用' }
    }
    
    this.isSyncing = true
    this.lastSyncTime = Date.now()
    
    // 获取待同步的数据并清空缓存
    const updates = { ...this.pendingUpdates }
    this.pendingUpdates = {}
    
    try {
      const result = await callCloudFunction('gameData', updates)
      
      if (result.result.success) {
        this.failCount = 0  // 重置失败计数
        this.isSyncing = false
        return { success: true, message: '同步成功' }
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      this.failCount++
      
      // 将未同步的数据重新加入缓存
      this.pendingUpdates = { ...this.pendingUpdates, ...updates }
      this.isSyncing = false
      
      return { 
        success: false, 
        message: '同步失败：' + err.message 
      }
    }
  }
  
  /**
   * 获取待同步数据
   */
  getPendingUpdates() {
    return this.pendingUpdates
  }
  
  /**
   * 获取上次同步时间
   */
  getLastSyncTime() {
    return this.lastSyncTime
  }
  
  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      pendingUpdates: this.pendingUpdates,
      isSyncing: this.isSyncing,
      failCount: this.failCount,
      lastSyncTime: this.lastSyncTime,
      canSync: (now - this.lastSyncTime) >= this.minSyncInterval
    }
  }
  
  /**
   * 重置失败计数
   */
  resetFailCount() {
    this.failCount = 0
  }
  
  /**
   * 销毁管理器
   */
  destroy() {
    this.pendingUpdates = {}
    this.isSyncing = false
  }
}

// 导出单例
export const cloudDataManager = new CloudDataManager()
