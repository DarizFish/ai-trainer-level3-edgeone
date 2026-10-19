const storage=require('../../utils/storage');
const study=require('../../utils/study');
Page({
  data:{active:false,history:[]},
  onShow(){this.setData({active:storage.get(storage.key('exam'),null)?.phase==='active',history:study.read().exams.map(e=>({id:e.id,score:e.result.score,mode:e.mode==='official'?'标准卷':'随机卷',date:new Date(e.completedAt).toLocaleDateString()}))});},
  start(e){wx.navigateTo({url:`/pages/exam/exam?mode=${e.currentTarget.dataset.mode}`});},
  resume(){wx.navigateTo({url:'/pages/exam/exam?resume=1'});},
  review(e){wx.navigateTo({url:`/pages/exam/exam?review=${e.currentTarget.dataset.id}`});},
});
