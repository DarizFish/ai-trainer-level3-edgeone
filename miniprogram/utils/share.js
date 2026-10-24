const title='人工智能训练师三级备考';
const homePath='/pages/index/index';
function entry(path=homePath,label=title){return {title:label,path};}
function home(){return entry();}
function theory(){return entry(homePath,'理论练习 · '+title);}
function mock(){return entry('/pages/mock/mock','190 题限时模考 · '+title);}
function practical(){return entry('/pages/practical/practical','实操题库 · '+title);}
function privacy(){return entry('/pages/privacy/privacy','隐私与使用条款 · '+title);}
function question(){
  const q=this.data.question;
  if(!q?.id)return theory();
  return entry('/pages/practice/practice?type='+encodeURIComponent(q.type)+'&question='+encodeURIComponent(q.id),'一起练这道理论题 · '+title);
}
function task(){
  const t=this.data.task;
  return t?.code?entry('/pages/task/task?code='+encodeURIComponent(t.code),t.code+' · '+t.title):practical();
}
module.exports={home,theory,mock,practical,privacy,question,task};
