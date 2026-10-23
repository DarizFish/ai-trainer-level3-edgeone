const content=require('../../utils/content');
const storage=require('../../utils/storage');
const study=require('../../utils/study');
const theory=require('../../utils/theory-view');
Page({
 onShareAppMessage:require('../../utils/share').theory,
 data:{types:[],wrong:0,favorites:0},
 onShow(){const bank=content.get(),state=study.read();this.setData({total:bank.questions.length,wrong:bank.questions.filter(q=>state.progress[q.id]?.correct===false).length,favorites:bank.questions.filter(q=>state.favorites[q.id]).length,types:theory.types(bank,state),guest:storage.owner()==='guest'});},
 practice(e){const d=e.currentTarget.dataset;const query=Object.keys(d).map(key=>encodeURIComponent(key)+'='+encodeURIComponent(d[key])).join('&');wx.navigateTo({url:'/pages/practice/practice?'+query});},
});
