const content=require('../../utils/content');
const storage=require('../../utils/storage');
const study=require('../../utils/study');
const ui=require('../../utils/ui');
const theory=require('../../utils/theory-view');
const {correct}=require('../../utils/exam');
Page({
  onShareAppMessage:require('../../utils/share').question,
  data:{current:0,total:0,question:null,selected:[],revealed:false,favorite:false,empty:false,restored:false,answerRight:false,groupLabel:'理论练习'},
  onLoad(options){this.filter=options;this.user=storage.owner();this.load();},
  onShow(){this.shareMenu=require('../../utils/share').enable();if(this.user!==storage.owner()){this.user=storage.owner();this.load();}},
  load(){
    const bank=content.get(), state=study.read();this.bank=bank;
    this.questions=bank.questions.filter(q=>(!this.filter.type||q.type===this.filter.type)&&(!this.filter.category||q.category===this.filter.category)&&(!this.filter.mode||this.filter.mode==='wrong'&&state.progress[q.id]?.correct===false||this.filter.mode==='favorite'&&state.favorites[q.id]));
    const index=theory.position(this.questions,this.filter,this.user);
    this.setData({total:this.questions.length,empty:!this.questions.length,groupLabel:this.filter.mode==='wrong'?'错题订正':this.filter.mode==='favorite'?'我的收藏':({judge:'判断题',single:'单选题',multi:'多选题'}[this.filter.type]||'理论练习')});this.show(index);
  },
  show(index){
    const question=this.questions[index];if(!question)return;
    const state=study.read(),record=state.progress[question.id];
    const selected=Array.isArray(record?.answer)?record.answer.slice():[];
    this.setData({current:index,question,selected,revealed:selected.length>0,restored:selected.length>0,answerRight:correct(question,selected),favorite:!!state.favorites[question.id]});
    try{storage.set(storage.key(theory.resumeKey(this.filter),this.user),{questionId:question.id,contentId:this.bank.contentId});}catch(error){ui.error(error);}
    wx.pageScrollTo({scrollTop:0,duration:0});
  },
  choose(e){
    if(this.data.revealed||this.submitting)return;
    this.setData({selected:ui.choose(this.data.question,this.data.selected,e.detail.value)});
    if(this.data.question.type!=='multi')this.submit();
  },
  submit(){
    if(!this.data.selected.length||this.data.revealed||this.submitting)return;
    this.submitting=true;
    try{study.record(this.data.question,this.data.selected,this.bank.contentId);this.setData({revealed:true,restored:false,answerRight:correct(this.data.question,this.data.selected)});}
    catch(error){ui.error(error);}finally{this.submitting=false;}
  },
  retry(){if(!this.data.revealed)return;this.setData({selected:[],revealed:false,restored:false});wx.pageScrollTo({scrollTop:0,duration:0});},
  next(){if(this.data.current+1<this.questions.length)this.show(this.data.current+1);else wx.showToast({title:'这一组已练完',icon:'success'});},
  previous(){if(this.data.current>0)this.show(this.data.current-1);},
  favorite(){try{this.setData({favorite:study.favorite(this.data.question.id)});}catch(error){ui.error(error);}},
});
