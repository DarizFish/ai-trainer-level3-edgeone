const storage=require('../../utils/storage');
const content=require('../../utils/content');
const exams=require('../../utils/exam');
const study=require('../../utils/study');
const ui=require('../../utils/ui');
Page({
  onShareAppMessage:require('../../utils/share').mock,
  data:{exam:null,question:null,selected:[],clock:'90:00',sheet:false,numbers:[]},
  async onLoad(options){
    this.user=storage.owner();this.key=storage.key('exam',this.user);
    try{
      if(options.review){this.review=true;this.exam=study.read().exams.find(e=>e.id===options.review);}
      else {
        const active=storage.get(this.key,null);
        if(options.resume)this.exam=active;
        else {
          if(active?.phase==='active'&&!await ui.confirm('重新开始考试？','本机已有未交卷试卷。重新开始会替换它。')){wx.navigateBack();return;}
          this.exam=exams.create(content.get(),options.mode==='random'?'random':'official');this.persist();
        }
      }
      if(!this.exam)throw new Error('没有找到这份试卷');
      this.render();this.startTimer();
    }catch(error){ui.error(error);}
  },
  onShow(){if(this.exam)this.startTimer();},
  onHide(){clearInterval(this.timer);},onUnload(){clearInterval(this.timer);},
  startTimer(){clearInterval(this.timer);this.tick();if(this.exam.phase==='active')this.timer=setInterval(()=>this.tick(),1000);},
  tick(){if(!this.exam)return;const n=exams.remaining(this.exam);this.setData({clock:`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`});if(n===0&&this.exam.phase==='active')void this.finish();},
  persist(){if(!this.review)storage.set(this.key,this.exam);},
  render(){
    const q=this.exam.questions[this.exam.current];
    this.setData({exam:{phase:this.exam.phase,current:this.exam.current,result:this.exam.result},question:q,selected:this.exam.answers[q.id]||[],answered:Object.keys(this.exam.answers).length,numbers:this.exam.questions.map((q,i)=>({index:i,answered:!!this.exam.answers[q.id]?.length,wrong:this.exam.phase==='finished'&&!exams.correct(q,this.exam.answers[q.id])}))});
  },
  choose(e){if(this.exam.phase!=='active')return;if(exams.remaining(this.exam)===0){void this.finish();return;}try{const answer=ui.choose(this.data.question,this.data.selected,e.detail.value);if(answer.length)this.exam.answers[this.data.question.id]=answer;else delete this.exam.answers[this.data.question.id];this.persist();this.render();}catch(error){ui.error(error);}},
  move(e){const index=e.currentTarget.dataset.index===undefined?this.exam.current+Number(e.currentTarget.dataset.step):Number(e.currentTarget.dataset.index);if(index<0||index>=190)return;this.exam.current=index;try{this.persist();}catch(error){ui.error(error);}this.setData({sheet:false});this.render();wx.pageScrollTo({scrollTop:0,duration:0});},
  toggleSheet(){this.setData({sheet:!this.data.sheet});},
  async submit(){if(await ui.confirm('确认交卷？',`已完成 ${Object.keys(this.exam.answers).length} / 190 题。交卷后可查看解析。`))await this.finish();},
  async finish(){
    if(this.exam.phase!=='active'||this.finishing)return;this.finishing=true;
    try{
      if(storage.owner()!==this.user)throw new Error('账号已切换，请回到原账号后提交');
      this.exam.result=exams.score(this.exam.questions,this.exam.answers);this.exam.phase='finished';this.exam.completedAt=Date.now();
      study.finishExam(this.exam);this.persist();clearInterval(this.timer);this.render();
    }catch(error){this.exam.phase='active';ui.error(error);}finally{this.finishing=false;}
  },
});
