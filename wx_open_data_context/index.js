/**
 * 开放数据域入口文件
 * 用于处理好友排行榜等需要访问微信开放数据的操作
 *
 * 注意：wx.getFriendCloudStorage / wx.getUserCloudStorage 只能在此环境中调用
 */

wx.onMessage(function(data) {
  if (data && data.command === 'fetchFriendLeaderboard') {
    wx.getFriendCloudStorage({
      keyList: data.keyList || ['score'],
      success: function(res) {
        wx.postMessage({
          command: 'fetchFriendLeaderboard',
          success: true,
          data: res.data || []
        })
      },
      fail: function(err) {
        wx.postMessage({
          command: 'fetchFriendLeaderboard',
          success: false,
          error: err
        })
      }
    })
  }
})
