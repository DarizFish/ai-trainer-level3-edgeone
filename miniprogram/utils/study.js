const storage = require('./storage');
const { request } = require('./request');
const { correct } = require('./exam');
let running = null;
function read(user) { return Object.assign({ progress:{}, favorites:{}, outbox:[], batch:null, exams:[], quarantined:[] },storage.get(storage.key('study', user), {})); }
function save(state, user) { return storage.set(storage.key('study', user), state); }
function record(question, answer, contentId) {
  const user = storage.owner(), state = read(user);
  state.progress[question.id] = { answer, correct:correct(question,answer) };
  if(user !== 'guest')state.outbox.push({id:storage.id(),type:'answer',contentId,questionId:question.id,answer});
  save(state,user);void flush().catch(()=>{});return state.progress[question.id];
}
function favorite(questionId) {
  const user = storage.owner(), state = read(user), active = !state.favorites[questionId];
  state.favorites[questionId] = active;
  if(user !== 'guest')state.outbox.push({id:storage.id(),type:'favorite',questionId,active});
  save(state,user);void flush().catch(()=>{});return active;
}
function finishExam(exam) {
  const user = storage.owner(), state = read(user);
  if(!state.exams.some(item=>item.id===exam.id)) {
    state.exams.unshift(exam);
    // Full offline review is retained for the most recent 10 papers.
    // Cloud scores and queued submissions are independent of this limit.
    state.exams=state.exams.slice(0,10);
    if(user!=='guest')state.outbox.push({id:exam.id,type:'exam',contentId:exam.contentId,mode:exam.mode,questionIds:exam.questions.map(q=>q.id),answers:exam.answers});
    save(state,user);
  }
  void flush().catch(()=>{});
}
function makeBatch(state) {
  if(state.batch)return state.batch;
  const first = state.outbox[0];if(!first)return null;
  let rows = [first], path, data;
  if(first.type==='answer') {
    rows=[];
    for(const row of state.outbox){if(row.type!=='answer'||row.contentId!==first.contentId||rows.length>=50)break;rows.push(row);}
    const grouped={};
    for(const row of rows)grouped[row.questionId]={questionId:row.questionId,answer:row.answer,attempts:(grouped[row.questionId]?.attempts||0)+1};
    path='/api/theory/answer';data={attempts:Object.values(grouped),contentId:first.contentId,submissionId:storage.id()};
  } else if(first.type==='exam') {
    path='/api/theory/attempt';data={mode:first.mode,questionIds:first.questionIds,answers:first.answers,contentId:first.contentId,submissionId:first.id};
  } else {path='/api/favorites';data={itemType:'theory',itemId:first.questionId,active:first.active};}
  return {ids:rows.map(row=>row.id),path,data};
}
async function work() {
  const session=storage.get('session',null), user=storage.owner();
  if(!session||session.expired)return;
  if(!storage.get('capabilities',{}).idempotentSubmissions){storage.set(storage.key('syncError',user),'服务器同步服务尚未就绪，记录已保存在本机');return;}
  for(let n=0;n<30;n++) {
    if(storage.owner()!==user || storage.get('session',null)?.cookie!==session.cookie)return;
    const state=read(user), batch=makeBatch(state);
    if(!batch){storage.remove(storage.key('syncError',user));return;}
    state.batch=batch;save(state,user);
    try {
      await request(batch.path,{method:'POST',data:batch.data});
      const latest=read(user);latest.outbox=latest.outbox.filter(row=>!batch.ids.includes(row.id));latest.batch=null;
      save(latest,user);storage.remove(storage.key('syncError',user));
    } catch(error) {
      if([400,409].includes(error.status)) {
        const latest=read(user);
        latest.quarantined.push({batch,reason:error.message,createdAt:Date.now(),rows:latest.outbox.filter(row=>batch.ids.includes(row.id))});
        latest.outbox=latest.outbox.filter(row=>!batch.ids.includes(row.id));latest.batch=null;
        save(latest,user);
        continue;
      }
      storage.set(storage.key('syncError',user),error.message);return;
    }
  }
}
function flush() {if(running)return running;running=work().finally(()=>{running=null;});return running;}
async function refresh() {
  const user=storage.owner(), session=storage.get('session',null);if(user==='guest')return;
  await flush();
  if(storage.get('session',null)?.cookie!==session?.cookie)return;
  const [cloud,history]=await Promise.all([request('/api/theory/state'),request('/api/theory/attempt')]);
  if(storage.owner()!==user || storage.get('session',null)?.cookie!==session?.cookie)return;
  const local=read(user);
  const progress=Object.fromEntries((cloud.progress||[]).map(row=>[row.questionId,{answer:row.answer,correct:row.correct}]));
  const favorites=Object.fromEntries((cloud.favoriteIds||[]).map(id=>[id,true]));
  for(const row of local.outbox){if(row.type==='answer')progress[row.questionId]=local.progress[row.questionId];if(row.type==='favorite')favorites[row.questionId]=row.active;}
  local.progress=progress;local.favorites=favorites;local.cloudExams=history.attempts||[];save(local,user);
}
module.exports={read,record,favorite,finishExam,flush,refresh,makeBatch};
