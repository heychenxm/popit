/**
 * 开放数据域入口文件
 * 用于处理好友排行榜等需要访问微信开放数据的操作
 *
 * 注意：
 * 1. wx.getFriendCloudStorage / wx.getUserCloudStorage 只能在此环境中调用
 * 2. 开放数据域不能向主域发送消息（wx.postMessage 不存在）
 * 3. 数据通过 sharedCanvas 渲染，主域通过 drawImage 显示
 * 4. sharedCanvas 宽高只能由主域设置（固定视口），滚动由本域根据 scrollY 裁剪绘制
 * 5. 高清渲染：所有坐标手动乘以 dpr，不使用 ctx.scale
 */

const sharedCanvas = wx.getSharedCanvas()
const ctx = sharedCanvas.getContext('2d')

const systemInfo = wx.getSystemInfoSync()
const dpr = systemInfo.pixelRatio || 2

// 与主域保持一致的固定视口布局（逻辑像素）
const LOGICAL_W = 340
const TOP_PADDING = 10
const LIST_VIEW_H = 300
const SEPARATOR_GAP = 20
const SELF_RANK_H = 60
const BOTTOM_PADDING = 20
const ITEM_H = 60
const ITEM_GAP = 8
const ITEM_STRIDE = ITEM_H + ITEM_GAP

let cachedData = []
let myNickname = ''
let scrollY = 0
let renderNeeded = true

const avatarCache = new Map()

function loadAvatar(url, callback) {
  if (!url) {
    callback(null)
    return
  }

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

function getContentHeight(count) {
  if (count <= 0) return 0
  return count * ITEM_H + Math.max(0, count - 1) * ITEM_GAP
}

function getMaxScroll() {
  return Math.max(0, getContentHeight(cachedData.length) - LIST_VIEW_H)
}

function clampScroll(y) {
  const maxScroll = getMaxScroll()
  return Math.max(0, Math.min(y, maxScroll))
}

wx.onMessage(function(data) {
  if (!data || !data.command) return

  if (data.command === 'fetchFriendLeaderboard') {
    myNickname = data.myNickname || ''
    scrollY = 0
    renderNeeded = true

    wx.getFriendCloudStorage({
      keyList: data.keyList || ['score'],
      success: function(res) {
        var rawData = res.data || []
        cachedData = rawData.sort(function(a, b) {
          return getScore(b) - getScore(a)
        })
        scrollY = clampScroll(scrollY)
        renderNeeded = true
        console.log('开放数据域: 获取好友数据成功, 数量:', cachedData.length)
      },
      fail: function(err) {
        console.warn('开放数据域: 获取好友数据失败:', err)
        cachedData = []
        scrollY = 0
        renderNeeded = true
      }
    })
    return
  }

  if (data.command === 'friendLeaderboardScroll') {
    if (typeof data.deltaY === 'number') {
      scrollY = clampScroll(scrollY + data.deltaY)
    } else if (typeof data.scrollY === 'number') {
      scrollY = clampScroll(data.scrollY)
    }
    renderNeeded = true
    return
  }

  if (data.command === 'friendLeaderboardResetScroll') {
    scrollY = 0
    renderNeeded = true
  }
})

function render() {
  if (renderNeeded) {
    drawLeaderboard(cachedData)
  }
  requestAnimationFrame(render)
}

function drawLeaderboard(data) {
  const w = sharedCanvas.width
  const h = sharedCanvas.height

  ctx.fillStyle = '#312e81'
  ctx.fillRect(0, 0, w, h)

  if (!data || data.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = (14 * dpr) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无好友数据', w / 2, h / 2)
    renderNeeded = false
    return
  }

  const itemHeight = ITEM_H * dpr
  const itemGap = ITEM_GAP * dpr
  const padding = 24 * dpr
  const listTop = TOP_PADDING * dpr
  const listViewH = LIST_VIEW_H * dpr
  const avatarSize = 36 * dpr
  const avatarRadius = 18 * dpr
  const rankFontSize = 16 * dpr
  const nicknameFontSize = 14 * dpr
  const scoreFontSize = 14 * dpr
  const appliedScroll = clampScroll(scrollY) * dpr

  // 列表可视区裁剪绘制
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, listTop, w, listViewH)
  ctx.clip()

  for (var index = 0; index < data.length; index++) {
    var contentY = index * (itemHeight + itemGap) - appliedScroll
    var y = listTop + contentY

    // 超出可视区则跳过
    if (y + itemHeight < listTop || y > listTop + listViewH) {
      continue
    }

    var rank = getRank(data, index)
    drawRankItem(ctx, data[index], rank, y, itemHeight, padding, w, avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, false)
  }
  ctx.restore()

  // 分隔线（固定在列表下方）
  var separatorY = (TOP_PADDING + LIST_VIEW_H + SEPARATOR_GAP / 2) * dpr
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fillRect(padding, separatorY, w - padding * 2, 1 * dpr)

  // 自己的排名（吸底固定）
  var selfRankY = (TOP_PADDING + LIST_VIEW_H + SEPARATOR_GAP) * dpr
  var selfInfo = findSelf(data)

  if (selfInfo.selfUser && selfInfo.selfRank > 0) {
    ctx.fillStyle = 'rgba(99, 102, 241, 0.25)'
    roundRect(ctx, padding, selfRankY, w - padding * 2, itemHeight, 8 * dpr)
    ctx.fill()

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)'
    ctx.lineWidth = 1.5 * dpr
    roundRect(ctx, padding, selfRankY, w - padding * 2, itemHeight, 8 * dpr)
    ctx.stroke()

    drawRankItem(
      ctx, selfInfo.selfUser, selfInfo.selfRank, selfRankY, itemHeight, padding, w,
      avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, true
    )
  }

  renderNeeded = false
}

function findSelf(data) {
  var selfRank = -1
  var selfUser = null
  if (!myNickname) return { selfRank: selfRank, selfUser: selfUser }

  for (var i = 0; i < data.length; i++) {
    var u = data[i]
    var name = u.nickName || u.nickname || u.NickName || ''
    if (name === myNickname) {
      selfRank = getRank(data, i)
      selfUser = u
      break
    }
  }
  return { selfRank: selfRank, selfUser: selfUser }
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
    var item = user.KVDataList.find(function(entry) { return entry.key === 'score' })
    if (item) return parseInt(item.value || '0')
  }
  return 0
}

function drawRankItem(ctx, user, rank, y, itemHeight, padding, w, avatarSize, avatarRadius, rankFontSize, nicknameFontSize, scoreFontSize, dpr, isSelf) {
  ctx.fillStyle = rank <= 3 ? '#fbbf24' : 'rgba(255, 255, 255, 0.7)'
  ctx.font = 'bold ' + rankFontSize + 'px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(rank.toString(), padding + 10 * dpr, y + itemHeight / 2)

  const avatarX = padding + 55 * dpr
  const avatarY = y + itemHeight / 2

  if (user.avatarUrl) {
    loadAvatar(user.avatarUrl, function(img) {
      if (img) {
        renderNeeded = true
      }
    })

    const cached = avatarCache.get(user.avatarUrl)
    if (cached) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(cached, avatarX - avatarRadius, avatarY - avatarRadius, avatarSize, avatarSize)
      ctx.restore()

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarRadius, dpr)
    }
  } else {
    drawDefaultAvatar(ctx, avatarX, avatarY, avatarRadius, dpr)
  }

  const nickname = user.nickName || user.nickname || user.NickName || '微信用户'
  const maxNicknameLen = 6
  const displayNickname = nickname.length > maxNicknameLen ? nickname.substring(0, maxNicknameLen - 1) + '...' : nickname
  ctx.fillStyle = isSelf ? '#fff' : 'rgba(255, 255, 255, 0.9)'
  ctx.font = (isSelf ? 'bold ' : '') + nicknameFontSize + 'px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayNickname, avatarX + avatarRadius + 8 * dpr, y + itemHeight / 2)

  var score = getScore(user)
  ctx.fillStyle = isSelf ? '#fff' : '#a5b4fc'
  ctx.font = 'bold ' + scoreFontSize + 'px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(score.toString(), w - padding - 10 * dpr, y + itemHeight / 2)
}

function drawDefaultAvatar(ctx, avatarX, avatarY, avatarRadius, dpr) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.beginPath()
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1 * dpr
  ctx.stroke()
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

render()
