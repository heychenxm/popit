/**
 * 开放数据域入口文件
 * 用于处理好友排行榜等需要访问微信开放数据的操作
 *
 * 注意：
 * 1. wx.getFriendCloudStorage / wx.getUserCloudStorage 只能在此环境中调用
 * 2. 开放数据域不能向主域发送消息（wx.postMessage 不存在）
 * 3. 数据通过 sharedCanvas 渲染，主域通过 drawImage 显示
 */

const sharedCanvas = wx.getSharedCanvas()
const ctx = sharedCanvas.getContext('2d')

let cachedData = []
let renderNeeded = true

// 主域发送消息时触发数据获取
wx.onMessage(function(data) {
  if (data && data.command === 'fetchFriendLeaderboard') {
    wx.getFriendCloudStorage({
      keyList: data.keyList || ['score'],
      success: function(res) {
        cachedData = res.data || []
        renderNeeded = true
        console.log('开放数据域: 获取好友数据成功, 数量:', cachedData.length)
      },
      fail: function(err) {
        console.warn('开放数据域: 获取好友数据失败:', err)
        cachedData = []
        renderNeeded = true
      }
    })
  }
})

// 持续渲染循环（因为头像加载是异步的，需要多次渲染）
function render() {
  if (renderNeeded || cachedData.length > 0) {
    drawLeaderboard(cachedData)
  }
  requestAnimationFrame(render)
}

function drawLeaderboard(data) {
  const w = sharedCanvas.width
  const h = sharedCanvas.height

  // 清空画布
  ctx.clearRect(0, 0, w, h)

  if (!data || data.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无好友数据', w / 2, h / 2)
    return
  }

  // 绘制排行榜列表
  const itemHeight = 50
  const itemGap = 8
  const padding = 15
  const startY = 10

  data.forEach(function(user, index) {
    const y = startY + index * (itemHeight + itemGap)
    if (y + itemHeight > h) return

    // 背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    roundRect(ctx, padding, y, w - padding * 2, itemHeight, 8)
    ctx.fill()

    // 排名
    ctx.fillStyle = index < 3 ? '#fbbf24' : 'rgba(255, 255, 255, 0.7)'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('#' + (index + 1), padding + 10, y + itemHeight / 2)

    // 昵称
    const nickname = user.nickName || '微信用户'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '14px sans-serif'
    ctx.fillText(nickname, padding + 50, y + itemHeight / 2 - 8)

    // 分数
    let score = 0
    if (user.KVDataList && Array.isArray(user.KVDataList)) {
      var scoreItem = user.KVDataList.find(function(item) { return item.key === 'score' })
      if (scoreItem) score = parseInt(scoreItem.value || '0')
    }
    ctx.fillStyle = '#a5b4fc'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(score.toString(), w - padding - 10, y + itemHeight / 2)
  })

  renderNeeded = false
}

function roundRect(ctx, x, y, w, h, r) {
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

// 启动渲染循环
render()
