const storage=require('../../utils/storage');
const content=require('../../utils/content');
const study=require('../../utils/study');
const api=require('../../utils/request');
const ui=require('../../utils/ui');
Page({
  onShareAppMessage:require('../../utils/share').home,
  data:{session:null,stats:[],pending:0,error:'',busy:false,history:[],version:'',held:[],showHeld:false},
  onShow(){this.render();},
  held(){this.setData({showHeld:!this.data.showHeld});},
  render(){
    const state=study.read(),bank=content.get(),session=storage.get('session',null);
    this.setData({
      session:session?{email:session.email,displayName:session.displayName,expired:session.expired}:null,
      pending:state.outbox.length,error:storage.get(storage.key('syncError'),''),version:bank.version,
      held:state.quarantined.map((entry,i)=>({id:i,reason:entry.reason,summary:entry.rows.map(row=>row.type==='answer'?`${row.questionId}：${row.answer.join('、')}`:row.type==='exam'?`模考 ${row.id}（试卷见本机复盘）`:`收藏 ${row.questionId}`).join('\n')})),
      stats:['judge','single','multi'].map((type,i)=>{const group=bank.questions.filter(q=>q.type===type);return {type,label:['判断题','单选题','多选题'][i],total:group.length,answered:group.filter(q=>state.progress[q.id]).length};}),
      history:(state.cloudExams||[]).map(e=>({id:e.id,score:e.score,mode:e.mode==='official'?'标准卷':'随机卷',date:new Date(e.createdAt).toLocaleDateString()})),
    });
  },
  login(){wx.navigateTo({url:'/pages/account/account'});},
  async logout(){if(!await ui.confirm('退出当前账号？','本机草稿会按账号保留，重新登录该账号后可继续。'))return;try{await api.signOut();this.render();}catch(error){ui.error(error);}},
  async sync(){this.setData({busy:true});try{await content.refresh();await study.refresh();this.render();wx.showToast({title:this.data.pending?'仍有记录待同步':this.data.held.length?'已刷新，旧记录留存本机':'刷新完成',icon:this.data.pending||this.data.held.length?'none':'success'});}catch(error){this.render();this.setData({error:error.message});}finally{this.setData({busy:false});}},
  privacy(){wx.navigateTo({url:'/pages/privacy/privacy'});},
});
