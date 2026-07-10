/**
 * 开放数据域入口文件
 * 用于处理好友排行榜等需要访问微信开放数据的操作
 *
 * 注意：
 * 1. wx.getFriendCloudStorage / wx.getUserCloudStorage 只能在此环境中调用
 * 2. 开放数据域不能向主域发送消息（wx.postMessage 不存在）
 * 3. 数据通过 sharedCanvas 渲染，主域通过 drawImage 显示
 * 4. 高清渲染：所有坐标手动乘以 dpr，不使用 ctx.scale
 */

const sharedCanvas = wx.getSharedCanvas()
const ctx = sharedCanvas.getContext('2d')

// 高清渲染：所有坐标手动乘以 dpr（画布尺寸由主域按 DPR 设置）
const systemInfo = wx.getSystemInfoSync()
const dpr = systemInfo.pixelRatio || 2

// 逻辑坐标尺寸（宽度固定，高度根据数据量动态计算）
const LOGICAL_W = 340
const BASE_LOGICAL_H = 440  // 基础高度（无数据时的最小高度）

let cachedData = []
let myNickname = ''
let renderNeeded = true
let currentLogicalH = BASE_LOGICAL_H  // 当前实际高度

// 头像缓存
const avatarCache = new Map()

// 加载头像
function loadAvatar(url, callback) {
  if (!url) {
    callback(null)
    return
  }
  
  // 检查缓存
  if (avatarCache.has(url)) {
    callback(avatarCache.get(url))
    return
  }
  
  const img = wx.createImage()
  img.onload = function() {
    avatarCache.set(url, img)
    callback(img)
  }
  img.onerror = function() {
    console.warn('头像加载失败:', url)
    callback(null)
  }
  img.src = url
}

// 主域发送消息时触发数据获取
wx.onMessage(function(data) {
  if (data && data.command === 'fetchFriendLeaderboard') {
    myNickname = data.myNickname || ''
    wx.getFriendCloudStorage({
      keyList: data.keyList || ['score'],
      success: function(res) {
        var rawData = res.data || []
        // 按分数降序排序（微信 API 不保证返回顺序）
        cachedData = rawData.sort(function(a, b) {
          var scoreA = 0, scoreB = 0
          if (a.KVDataList && Array.isArray(a.KVDataList)) {
            var itemA = a.KVDataList.find(function(item) { return item.key === 'score' })
            if (itemA) scoreA = parseInt(itemA.value || '0')
          }
          if (b.KVDataList && Array.isArray(b.KVDataList)) {
            var itemB = b.KVDataList.find(function(item) { return item.key === 'score' })
            if (itemB) scoreB = parseInt(itemB.value || '0')
          }
          return scoreB - scoreA
        })
        // 更新画布尺寸
        updateCanvasSize()
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

/**
 * 根据数据量计算所需的画布逻辑高度
 */
function calculateLogicalHeight(data) {
  const itemHeight = 60
  const itemGap = 8
  const startY = 10
  const separatorGap = 10
  const selfGap = 12
  const selfHeight = 60
  const bottomPadding = 20
  
  const dataCount = data ? data.length : 0
  const friendListHeight = dataCount * itemHeight + Math.max(0, dataCount - 1) * itemGap
  const totalHeight = startY + friendListHeight + separatorGap + selfGap + selfHeight + bottomPadding
  
  return Math.max(BASE_LOGICAL_H, totalHeight)
}

/**
 * 更新画布尺寸（物理像素）
 */
function updateCanvasSize() {
  const newLogicalH = calculateLogicalHeight(cachedData)
  if (newLogicalH !== currentLogicalH) {
    currentLogicalH = newLogicalH
    sharedCanvas.width = LOGICAL_W * dpr
    sharedCanvas.height = currentLogicalH * dpr
    console.log('开放数据域: 画布尺寸更新为', LOGICAL_W, 'x', currentLogicalH, '(物理:', sharedCanvas.width, 'x', sharedCanvas.height, ')')
  }
}

function drawLeaderboard(data) {
  // 物理像素尺寸
  const w = LOGICAL_W * dpr
  const h = currentLogicalH * dpr

  // 清空画布
  ctx.clearRect(0, 0, w, h)

  if (!data || data.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = (14 * dpr) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无好友数据', w / 2, h / 2)
    return
  }

  // 绘制参数（所有坐标乘以 dpr）
  const itemHeight = 60 * dpr
  const itemGap = 8 * dpr
  const padding = 24 * dpr
  const startY = 10 * dpr
  const avatarSize = 36 * dpr
  const avatarRadius = 18 * dpr
  const rankFontSize = 16 * dpr
  const nicknameFontSize = 14 * dpr
  const scoreFontSize = 14 * dpr

  // 好友列表区域（渲染所有数据，不限制条数）
  const friendListHeight = data.length * itemHeight + Math.max(0, data.length - 1) * itemGap

  // 分隔线位置
  const separatorY = startY + friendListHeight + 10 * dpr

  // 自己排名区域
  const selfY = separatorY + 12 * dpr

  // 绘制好友列表（全部渲染）
  data.forEach(function(user, index) {
    const y = startY + index * (itemHeight + itemGap)

    const rank = getRank(data, index)
    drawRankItem(ctx, user, rank, y, itemHeight, padding, w, avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, false)
  })

  // 绘制分隔线
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fillRect(padding, separatorY, w - padding * 2, 1 * dpr)

  // 查找自己的排名（同分同名次）
  let selfRank = -1
  let selfUser = null
  if (myNickname) {
    for (let i = 0; i < data.length; i++) {
      const u = data[i]
      const name = u.nickName || u.nickname || u.NickName || ''
      if (name === myNickname) {
        selfRank = getRank(data, i)
        selfUser = u
        break
      }
    }
  }

  // 绘制自己的排名（底部高亮）
  if (selfUser && selfRank > 0) {
    // 高亮背景
    ctx.fillStyle = 'rgba(99, 102, 241, 0.25)'
    roundRect(ctx, padding, selfY, w - padding * 2, itemHeight, 8 * dpr)
    ctx.fill()

    // 高亮边框
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)'
    ctx.lineWidth = 1.5 * dpr
    roundRect(ctx, padding, selfY, w - padding * 2, itemHeight, 8 * dpr)
    ctx.stroke()

    drawRankItem(ctx, selfUser, selfRank, selfY, itemHeight, padding, w, avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, true)
  }

  renderNeeded = false
}

/**
 * 计算排名（同分同名次）
 * 例如分数 [2025, 35, 35, 20] → 排名 [1, 2, 2, 4]
 */
function getRank(data, index) {
  if (index === 0) return 1
  var currentScore = getScore(data[index])
  var prevScore = getScore(data[index - 1])
  if (currentScore === prevScore) {
    // 同分，往前找到第一个不同分的位置
    for (var i = index - 1; i >= 0; i--) {
      if (getScore(data[i]) !== currentScore) {
        return i + 2
      }
    }
    return 1
  }
  return index + 1
}

function getScore(user) {
  if (user.KVDataList && Array.isArray(user.KVDataList)) {
    var item = user.KVDataList.find(function(item) { return item.key === 'score' })
    if (item) return parseInt(item.value || '0')
  }
  return 0
}

/**
 * 绘制单个排名项（头像 + 排名 + 昵称 + 分数）
 * @param {boolean} isSelf - 是否为自己的排名（影响昵称颜色）
 */
function drawRankItem(ctx, user, rank, y, itemHeight, padding, w, avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, isSelf) {
  // 排名
  ctx.fillStyle = rank <= 3 ? '#fbbf24' : 'rgba(255, 255, 255, 0.7)'
  ctx.font = 'bold ' + rankFontSize + 'px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(rank.toString(), padding + 10 * dpr, y + itemHeight / 2)

  // 绘制头像（圆形，左侧）
  const avatarX = padding + 55 * dpr
  const avatarY = y + itemHeight / 2
  
  if (user.avatarUrl) {
    loadAvatar(user.avatarUrl, function(img) {
      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, avatarX - avatarRadius, avatarY - avatarRadius, avatarSize, avatarSize)
        ctx.restore()
        
        // 头像边框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
        ctx.stroke()
      }
      renderNeeded = true
    })
  } else {
    // 没有头像时绘制默认头像
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.beginPath()
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1 * dpr
    ctx.stroke()
  }

  // 昵称（超长截断）
  const nickname = user.nickName || user.nickname || user.NickName || '微信用户'
  const maxNicknameLen = 6
  const displayNickname = nickname.length > maxNicknameLen ? nickname.substring(0, maxNicknameLen - 1) + '...' : nickname
  ctx.fillStyle = isSelf ? '#fff' : 'rgba(255, 255, 255, 0.9)'
  ctx.font = (isSelf ? 'bold ' : '') + nicknameFontSize + 'px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayNickname, avatarX + avatarRadius + 8 * dpr, y + itemHeight / 2)

  // 分数
  var score = getScore(user)
  ctx.fillStyle = isSelf ? '#fff' : '#a5b4fc'
  ctx.font = 'bold ' + scoreFontSize + 'px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(score.toString(), w - padding - 10 * dpr, y + itemHeight / 2)
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
