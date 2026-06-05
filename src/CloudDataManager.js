/**
 * 云数据管理器 - 优化云函数调用次数
 * 
 * 优化策略：
 * 1. 批量更新：将多个更新操作合并为一次调用
 * 2. 防抖机制：延迟同步，合并多次更新为一次
 * 3. 本地优先：先更新本地，定期或达到条件再同步云端
 * 4. 关键节点同步：只在重要时刻同步数据
 */

import { setStorage, getStorage } from './utils.js'

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
    
    // 调用次数统计
    this.stats = {
      totalUpdateRequests: getStorage('cloudCallTotal', 0),  // 总更新请求次数
      todayUpdateRequests: getStorage('cloudCallToday', 0),  // 今日更新请求次数
      todayDate: getStorage('cloudCallDate', ''),            // 今日日期
      actualCloudCalls: getStorage('cloudCallActual', 0),    // 实际云函数调用次数
      mergedCount: getStorage('cloudCallMerged', 0),         // 合并次数
      lastFlushTime: 0                                       // 上次 flush 时间
    }
    
    // 检查是否需要重置今日计数
    this._checkDailyReset()
    
    console.log('CloudDataManager 初始化完成，当前统计:', this.stats)
  }
  
  /**
   * 检查并重置今日计数
   */
  _checkDailyReset() {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    if (this.stats.todayDate !== today) {
      this.stats.todayUpdateRequests = 0
      this.stats.todayDate = today
      setStorage('cloudCallToday', 0)
      setStorage('cloudCallDate', today)
      console.log('今日计数已重置')
    }
  }
  
  /**
   * 记录更新请求
   */
  _recordUpdateRequest() {
    this.stats.totalUpdateRequests++
    this.stats.todayUpdateRequests++
    
    setStorage('cloudCallTotal', this.stats.totalUpdateRequests)
    setStorage('cloudCallToday', this.stats.todayUpdateRequests)
    
    console.log(`记录更新请求 #${this.stats.totalUpdateRequests}`)
  }
  
  /**
   * 记录云函数调用
   */
  _recordCloudCall() {
    this.stats.actualCloudCalls++
    setStorage('cloudCallActual', this.stats.actualCloudCalls)
    
    console.log(`记录云函数调用 #${this.stats.actualCloudCalls}`)
  }
  
  /**
   * 记录合并
   */
  _recordMerge() {
    this.stats.mergedCount++
    setStorage('cloudCallMerged', this.stats.mergedCount)
    
    console.log(`记录合并 #${this.stats.mergedCount}`)
  }
  
  /**
   * 添加待同步的数据
   * @param {Object} data - 要同步的数据
   */
  addUpdate(data) {
    if (!this.autoSyncEnabled) {
      console.log('自动同步已禁用，跳过云同步')
      return
    }
    
    // 记录更新请求
    this._recordUpdateRequest()
    
    // 记录合并次数（如果有待同步的数据，说明这次被合并了）
    if (Object.keys(this.pendingUpdates).length > 0) {
      this._recordMerge()
    }
    
    // 合并数据（后面的覆盖前面的）
    this.pendingUpdates = { ...this.pendingUpdates, ...data }
    
    console.log('待同步数据:', this.pendingUpdates)
    
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
      console.log('没有待同步的数据，跳过 flush')
      return
    }
    
    // 如果正在同步，等待同步完成
    if (this.isSyncing) {
      console.log('云同步正在进行中，等待完成...')
      return
    }
    
    // 检查最小同步间隔
    const now = Date.now()
    if (now - this.lastSyncTime < this.minSyncInterval) {
      console.log('同步间隔过短，延迟同步')
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
      console.warn('云同步失败次数过多，已禁用自动同步')
      this.autoSyncEnabled = false
      return
    }
    
    this.isSyncing = true
    this.lastSyncTime = Date.now()
    
    // 获取待同步的数据并清空缓存
    const updates = { ...this.pendingUpdates }
    this.pendingUpdates = {}
    
    // 记录云函数调用
    this._recordCloudCall()
    
    try {
      console.log('开始云同步:', updates)
      
      const result = await wx.cloud.callFunction({
        name: 'gameData',
        data: updates
      })
      
      if (result.result.success) {
        console.log('云同步成功')
        this.failCount = 0  // 重置失败计数
      } else {
        throw new Error(result.result.message)
      }
    } catch (err) {
      console.error('云同步失败:', err)
      this.failCount++
      
      // 将未同步的数据重新加入缓存
      this.pendingUpdates = { ...this.pendingUpdates, ...updates }
      
      // 如果失败次数过多，禁用自动同步
      if (this.failCount >= this.maxFailCount) {
        console.warn('云同步失败次数过多，已禁用自动同步')
        this.autoSyncEnabled = false
      }
    } finally {
      this.isSyncing = false
      this.stats.lastFlushTime = Date.now()
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
    console.log('已启用自动同步')
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
    console.log('已禁用自动同步')
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
      lastSyncTime: this.lastSyncTime,
      stats: { ...this.stats }
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    const totalRequests = this.stats.totalUpdateRequests
    const actualCalls = this.stats.actualCloudCalls
    const mergedCount = this.stats.mergedCount
    
    // 计算合并率：(总请求 - 实际调用) / 总请求 * 100%
    const mergeRate = totalRequests > 0 
      ? (((totalRequests - actualCalls) / totalRequests) * 100).toFixed(1) 
      : 0
    
    return {
      totalUpdateRequests: totalRequests,
      todayUpdateRequests: this.stats.todayUpdateRequests,
      todayDate: this.stats.todayDate,
      actualCloudCalls: actualCalls,
      mergedCount: mergedCount,
      mergeRate: mergeRate,
      lastFlushTime: this.stats.lastFlushTime
    }
  }
  
  /**
   * 重置统计数据
   */
  resetStats() {
    this.stats = {
      totalUpdateRequests: 0,
      todayUpdateRequests: 0,
      todayDate: new Date().toISOString().split('T')[0],
      actualCloudCalls: 0,
      mergedCount: 0,
      lastFlushTime: 0
    }
    setStorage('cloudCallTotal', 0)
    setStorage('cloudCallToday', 0)
    setStorage('cloudCallDate', this.stats.todayDate)
    setStorage('cloudCallActual', 0)
    setStorage('cloudCallMerged', 0)
    console.log('统计数据已重置')
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
