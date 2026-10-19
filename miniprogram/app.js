const content = require('./utils/content');
const study = require('./utils/study');
App({
  onLaunch() { content.get(); wx.onNetworkStatusChange(status=>{if(status.isConnected)void this.refresh();}); },
  onShow() { void this.refresh(); },
  async refresh() { try { await content.refresh(); await study.refresh(); } catch(error) { this.globalData.refreshError=error.message; } },
  useDevelopmentServer(origin) {
    if(wx.getAccountInfoSync().miniProgram.envVersion!=='develop'||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw new Error('Development server is unavailable');
    require('./config').apiBase=origin;
  },
  globalData:{refreshError:''},
});
