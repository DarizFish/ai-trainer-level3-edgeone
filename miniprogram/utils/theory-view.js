const storage=require('./storage');

function resumeKey(filter={}) {
  return ['resume',filter.type||'all',filter.mode||'practice',filter.category||'all'].join(':');
}

function position(questions,filter={},user) {
  const saved=storage.get(storage.key(resumeKey(filter),user),null);
  const legacy=storage.get(storage.key('resume',user),null);
  for(const id of [filter.question,saved?.questionId,legacy?.questionId]) {
    const index=questions.findIndex(q=>q.id===id);
    if(index>=0)return index;
  }
  return 0;
}

function types(bank,state,user) {
  return ['judge','single','multi'].map((type,index)=>{
    const questions=bank.questions.filter(q=>q.type===type);
    const answered=questions.filter(q=>state.progress[q.id]).length;
    const right=questions.filter(q=>state.progress[q.id]?.correct===true).length;
    const current=position(questions,{type},user);
    const visited=!!storage.get(storage.key(resumeKey({type}),user),null);
    return {type,label:['判断题','单选题','多选题'][index],count:questions.length,answered,right,wrong:answered-right,current:current+1,started:visited||answered>0};
  });
}

module.exports={resumeKey,position,types};
