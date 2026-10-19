const storage = require('./storage');
const counts = { judge:40, single:140, multi:10 };
function correct(q, answer) {
  const a = [...new Set(answer || [])].sort();
  const b = [...new Set(q.answer)].sort();
  return a.length === b.length && a.every((value,i)=>value === b[i]);
}
function score(questions, answers) {
  const byType = Object.keys(counts).map(type=>{
    const group = questions.filter(q=>q.type===type);
    const right = group.filter(q=>correct(q,answers[q.id]));
    return {type,label:{judge:'判断题',single:'单选题',multi:'多选题'}[type],correct:right.length,total:group.length,score:right.reduce((n,q)=>n+q.points,0),maxScore:group.reduce((n,q)=>n+q.points,0)};
  });
  const total = byType.reduce((n,t)=>n+t.score,0);
  return {score:total,maxScore:100,passed:total>=60,byType,wrongQuestionIds:questions.filter(q=>answers[q.id]?.length&&!correct(q,answers[q.id])).map(q=>q.id),unansweredQuestionIds:questions.filter(q=>!answers[q.id]?.length).map(q=>q.id)};
}
function shuffle(items, random) {
  const list = items.slice();
  for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
  return list;
}
function create(bank, mode, now, random) {
  const questions = mode === 'official'
    ? bank.officialQuestionIds.map(id=>bank.questions.find(q=>q.id===id))
    : Object.keys(counts).flatMap(type=>shuffle(bank.questions.filter(q=>q.type===type),random||Math.random).slice(0,counts[type]));
  if(questions.length!==190||Object.keys(counts).some(type=>questions.filter(q=>q?.type===type).length!==counts[type]))throw new Error('组卷失败：题型数量不符');
  return {id:storage.id(),phase:'active',mode,contentId:bank.contentId,questions,answers:{},current:0,deadlineAt:(now||Date.now())+90*60000};
}
function remaining(exam, now){return Math.max(0,Math.ceil((exam.deadlineAt-(now===undefined?Date.now():now))/1000));}
module.exports={correct,score,create,remaining};
