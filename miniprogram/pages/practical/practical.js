const content=require('../../utils/content');
const storage=require('../../utils/storage');
const {modules}=require('../../utils/practical-view');
Page({
  onShareAppMessage:require('../../utils/share').practical,
  data:{sections:[],group:'',groupTitle:'',keyword:'',tasks:[],recent:null,total:40,websiteOpen:false},
  openWebsite(){this.setData({websiteOpen:true});},
  closeWebsite(){this.setData({websiteOpen:false});},
  onShow(){this.shareMenu=require('../../utils/share').enable();this.bank=content.get();this.render();},
  onPageScroll(e){this.scrollTop=e.scrollTop;},
  select(e){this.directoryScroll=this.scrollTop||0;const group=e.currentTarget.dataset.group;this.setData({group,keyword:'',groupTitle:modules.find(m=>m.id===group)?.title||group});this.render();wx.pageScrollTo({scrollTop:0,duration:0});},
  back(){this.setData({group:'',keyword:'',groupTitle:''});this.render();wx.pageScrollTo({scrollTop:this.directoryScroll||0,duration:0});},
  search(e){this.setData({keyword:e.detail.value,group:'',groupTitle:''});this.render();},
  clear(){this.setData({keyword:''});this.render();},
  render(){
    const tasks=this.bank.tasks.map(t=>{
      const saved=storage.get(storage.key('task:'+t.code),{versions:{}}).versions[t.exerciseVersion];
      const filled=t.fields.filter(f=>saved?.answers?.[f.id]?.trim()).length;
      return {code:t.code,title:t.title,category:t.category,group:t.group,fields:t.fields.length,filled};
    });
    const sections=[];
    for(const module of modules){
      const members=tasks.filter(t=>t.group===module.id);if(!members.length)continue;
      let section=sections.find(s=>s.title===members[0].category);
      if(!section){section={title:members[0].category,modules:[]};sections.push(section);}
      section.modules.push({...module,count:members.length,started:members.filter(t=>t.filled>0).length});
    }
    const keyword=this.data.keyword.trim().toLowerCase();
    const visible=keyword?tasks.filter(t=>`${t.code} ${t.title}`.toLowerCase().includes(keyword)):this.data.group?tasks.filter(t=>t.group===this.data.group):[];
    const recentCode=storage.get(storage.key('task:last'),null);
    this.setData({sections,tasks:visible,total:tasks.length,recent:tasks.find(t=>t.code===recentCode)||null});
  },
  open(e){wx.navigateTo({url:'/pages/task/task?code='+e.currentTarget.dataset.code});},
});
