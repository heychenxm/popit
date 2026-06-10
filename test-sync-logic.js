/**
 * 泡泡大师 - 返回首页数据同步测试
 * 使用 mock 数据模拟游戏返回首页时的数据同步逻辑
 */

import { mockData } from './mock-data.js'

// ==================== 模拟本地存储 ====================
class MockStorage {
  constructor() {
    this.storage = new Map()
  }
  
  setItem(key, value) {
    this.storage.set(key, value)
    console.log(`[Storage] 保存: ${key} = ${value}`)
  }
  
  getItem(key, defaultValue = null) {
    const value = this.storage.get(key)
    const result = value !== undefined ? value : defaultValue
    console.log(`[Storage] 读取: ${key} = ${result}`)
    return result
  }
  
  clear() {
    this.storage.clear()
    console.log('[Storage] 清空所有数据')
  }
  
  getAll() {
    return Object.fromEntries(this.storage)
  }
}

// ==================== 模拟游戏状态 ====================
class MockGameState {
  constructor(storage) {
    this.storage = storage
    this.reset()
  }
  
  reset() {
    // 从本地存储读取数据
    this.highScore = Number(this.storage.getItem('highScore', 0)) || 0
    this.bestWave = Number(this.storage.getItem('bestWave', 0)) || 0
    this.coins = Number(this.storage.getItem('coins', 1000)) || 1000
    
    // 运行时数据
    this.score = 0
    this.wave = 1
    this.lives = 3
    this.phase = 'MENU'
    this.waveScore = 0
    this.consecutiveWins = 0
    this.purchaseCount = 0
    this.sessionCoins = 0
    this.isNewScoreRecord = false
    this.sessionStartHighScore = this.highScore
    
    // 赛季数据
    this.seasonData = {
      seasonScore: 0,
      seasonWave: 0,
      totalClears: 0,
      bestStreak: 0
    }
    
    console.log('[GameState] 初始化完成')
    console.log(`  - highScore: ${this.highScore}`)
    console.log(`  - bestWave: ${this.bestWave}`)
    console.log(`  - coins: ${this.coins}`)
  }
  
  // 保存最高分和最高关卡
  async saveHighScore() {
    let hasUpdate = false
    
    // 更新最高分
    if (Number(this.score) > Number(this.highScore)) {
      this.highScore = Number(this.score)
      this.storage.setItem('highScore', this.highScore)
      hasUpdate = true
      console.log('[GameState] 更新最高分:', this.highScore)
    }
    
    // 更新最高关卡（只有成功通过的关卡才算）
    if (this.phase === 'WIN' && this.wave > this.bestWave) {
      this.bestWave = this.wave
      this.storage.setItem('bestWave', this.bestWave)
      hasUpdate = true
      console.log('[GameState] 更新最高关卡:', this.bestWave)
    }
    
    return hasUpdate
  }
  
  // 增加金币
  addCoins(amount) {
    const delta = Number(amount) || 0
    this.coins = Number(this.coins) + delta
    this.storage.setItem('coins', this.coins)
    console.log(`[GameState] 增加金币: +${delta}, 当前: ${this.coins}`)
  }
  
  // 更新赛季数据
  updateSeasonDataLocal(score, wave, clears, streak) {
    this.seasonData.seasonScore = Math.max(this.seasonData.seasonScore, score)
    this.seasonData.seasonWave = Math.max(this.seasonData.seasonWave, wave)
    this.seasonData.totalClears = (this.seasonData.totalClears || 0) + (clears || 0)
    this.seasonData.bestStreak = Math.max(this.seasonData.bestStreak, streak || 0)
    console.log('[GameState] 更新赛季数据:', this.seasonData)
  }
  
  // 增加连续胜利计数
  addConsecutiveWin() {
    this.consecutiveWins++
    if (this.consecutiveWins % 5 === 0 && this.lives < 5) {
      this.lives++
      console.log(`[GameState] 连续 ${this.consecutiveWins} 胜！恢复 1 生命`)
      return true
    }
    return false
  }
  
  // 重置连续胜利计数
  resetConsecutiveWins() {
    this.consecutiveWins = 0
    console.log('[GameState] 重置连续胜利计数')
  }
  
  // 返回首页（模拟 navigateToMenu）
  async navigateToMenu() {
    console.log('\n========== 返回首页 ==========\n')
    
    // 1. 保存最高分和最高关卡
    await this.saveHighScore()
    
    // 2. 更新赛季数据
    this.updateSeasonDataLocal(
      this.score,
      this.wave,
      this.phase === 'WIN' ? 1 : 0,
      this.consecutiveWins
    )
    
    // 3. 重置游戏状态
    this.isNewScoreRecord = false
    this.phase = 'MENU'
    
    console.log('\n========== 返回首页完成 ==========\n')
    console.log('最终数据状态:')
    console.log(`  - highScore: ${this.highScore}`)
    console.log(`  - bestWave: ${this.bestWave}`)
    console.log(`  - coins: ${this.coins}`)
    console.log(`  - seasonData:`, this.seasonData)
    console.log(`  - 本地存储:`, this.storage.getAll())
  }
}

// ==================== 测试场景 ====================
async function runTests() {
  console.log('========================================')
  console.log('  泡泡大师 - 返回首页数据同步测试')
  console.log('========================================\n')
  
  // 测试场景 1：正常通关返回首页
  await testScenario1()
  
  // 测试场景 2：破纪录返回首页
  await testScenario2()
  
  // 测试场景 3：失败返回首页
  await testScenario3()
  
  // 测试场景 4：连续胜利返回首页
  await testScenario4()
  
  console.log('\n========================================')
  console.log('  所有测试完成！')
  console.log('========================================')
}

// 测试场景 1：正常通关返回首页
async function testScenario1() {
  console.log('\n========== 测试场景 1：正常通关返回首页 ==========\n')
  
  const storage = new MockStorage()
  const gameState = new MockGameState(storage)
  
  // 模拟游戏过程
  gameState.score = 350
  gameState.wave = 42
  gameState.phase = 'WIN'
  gameState.consecutiveWins = 3
  
  console.log('游戏结束数据:')
  console.log(`  - 得分: ${gameState.score}`)
  console.log(`  - 关卡: ${gameState.wave}`)
  console.log(`  - 阶段: ${gameState.phase}`)
  console.log(`  - 连续胜利: ${gameState.consecutiveWins}`)
  
  // 发放通关奖励
  gameState.addCoins(30)
  
  // 返回首页
  await gameState.navigateToMenu()
}

// 测试场景 2：破纪录返回首页
async function testScenario2() {
  console.log('\n========== 测试场景 2：破纪录返回首页 ==========\n')
  
  const storage = new MockStorage()
  const gameState = new MockGameState(storage)
  
  // 模拟破纪录
  gameState.score = 8000  // 超过 mock 数据中的 7200
  gameState.wave = 70     // 超过 mock 数据中的 65
  gameState.phase = 'WIN'
  gameState.consecutiveWins = 5
  
  console.log('游戏结束数据:')
  console.log(`  - 得分: ${gameState.score} (破纪录！)`)
  console.log(`  - 关卡: ${gameState.wave} (破纪录！)`)
  console.log(`  - 阶段: ${gameState.phase}`)
  console.log(`  - 连续胜利: ${gameState.consecutiveWins}`)
  
  // 发放通关奖励
  gameState.addCoins(30)
  
  // 返回首页
  await gameState.navigateToMenu()
}

// 测试场景 3：失败返回首页
async function testScenario3() {
  console.log('\n========== 测试场景 3：失败返回首页 ==========\n')
  
  const storage = new MockStorage()
  const gameState = new MockGameState(storage)
  
  // 模拟失败
  gameState.score = 200
  gameState.wave = 30
  gameState.phase = 'FAIL'
  gameState.consecutiveWins = 2
  
  console.log('游戏结束数据:')
  console.log(`  - 得分: ${gameState.score}`)
  console.log(`  - 关卡: ${gameState.wave}`)
  console.log(`  - 阶段: ${gameState.phase}`)
  console.log(`  - 连续胜利: ${gameState.consecutiveWins}`)
  
  // 失败不发放奖励
  gameState.resetConsecutiveWins()
  
  // 返回首页
  await gameState.navigateToMenu()
}

// 测试场景 4：连续胜利返回首页
async function testScenario4() {
  console.log('\n========== 测试场景 4：连续胜利返回首页 ==========\n')
  
  const storage = new MockStorage()
  const gameState = new MockGameState(storage)
  
  // 模拟连续胜利
  gameState.score = 500
  gameState.wave = 50
  gameState.phase = 'WIN'
  gameState.consecutiveWins = 5  // 触发恢复生命
  gameState.lives = 4
  
  console.log('游戏结束数据:')
  console.log(`  - 得分: ${gameState.score}`)
  console.log(`  - 关卡: ${gameState.wave}`)
  console.log(`  - 阶段: ${gameState.phase}`)
  console.log(`  - 连续胜利: ${gameState.consecutiveWins}`)
  console.log(`  - 生命: ${gameState.lives}`)
  
  // 增加连续胜利计数（触发恢复生命）
  const lifeRecovered = gameState.addConsecutiveWin()
  if (lifeRecovered) {
    console.log('  - 恢复生命！')
  }
  
  // 发放通关奖励
  gameState.addCoins(30)
  
  // 返回首页
  await gameState.navigateToMenu()
}

// ==================== 使用 mock 数据测试 ====================
async function testWithMockData() {
  console.log('\n========================================')
  console.log('  使用 Mock 数据测试')
  console.log('========================================\n')
  
  const storage = new MockStorage()
  
  // 初始化 mock 数据到本地存储
  storage.setItem('highScore', mockData.game.highScore)
  storage.setItem('bestWave', mockData.game.bestWave)
  storage.setItem('coins', mockData.game.coins)
  
  const gameState = new MockGameState(storage)
  
  console.log('\n使用 mock 数据初始化游戏状态:')
  console.log(`  - highScore: ${gameState.highScore}`)
  console.log(`  - bestWave: ${gameState.bestWave}`)
  console.log(`  - coins: ${gameState.coins}`)
  
  // 模拟游戏过程
  console.log('\n模拟游戏过程...')
  gameState.score = mockData.game.currentGame.score
  gameState.wave = mockData.game.currentGame.wave
  gameState.phase = 'WIN'
  gameState.consecutiveWins = mockData.game.currentGame.consecutiveWins
  
  console.log('游戏结束数据:')
  console.log(`  - 得分: ${gameState.score}`)
  console.log(`  - 关卡: ${gameState.wave}`)
  console.log(`  - 阶段: ${gameState.phase}`)
  console.log(`  - 连续胜利: ${gameState.consecutiveWins}`)
  
  // 发放通关奖励
  gameState.addCoins(30)
  
  // 返回首页
  await gameState.navigateToMenu()
  
  // 验证数据
  console.log('\n验证数据同步:')
  console.log(`  - highScore 是否更新: ${gameState.highScore === mockData.game.highScore ? '否（未破纪录）' : '是'}`)
  console.log(`  - bestWave 是否更新: ${gameState.bestWave === mockData.game.bestWave ? '否（未破纪录）' : '是'}`)
  console.log(`  - coins 是否正确: ${gameState.coins === mockData.game.coins + 30 ? '是' : '否'}`)
}

// ==================== 运行测试 ====================
// 导出测试函数
export { runTests, testWithMockData }

// 自动运行测试
runTests().then(() => {
  return testWithMockData()
}).catch(err => {
  console.error('测试失败:', err)
})
