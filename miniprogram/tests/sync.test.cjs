const {test}=require('node:test');
const assert=require('node:assert/strict');
const cache=new Map();let handle;
global.wx={
 getStorageSync:key=>cache.has(key)?structuredClone(cache.get(key)):'',
 setStorageSync:(key,value)=>cache.set(key,structuredClone(value)),
 removeStorageSync:key=>cache.delete(key),
 request:options=>handle(options),
};
const storage=require('../utils/storage');const study=require('../utils/study');const bank=require('../data/bundled');
const session={email:'sync@example.test',cookie:'x'.repeat(43)};
function setup(){cache.clear();storage.set('session',session);storage.set('capabilities',{idempotentSubmissions:true});}
const ok=(o,data={saved:1})=>o.success({statusCode:200,data});

test('conflicting old records remain inspectable and do not block valid new answers',async()=>{
 setup();const q=bank.questions[0];const seen=[];
 handle=o=>{seen.push(o.data.contentId);o.data.contentId==='old'?o.success({statusCode:409,data:{error:'题库已更新'}}):ok(o);};
 storage.set(storage.key('study'),{progress:{},favorites:{},exams:[],outbox:[
  {id:'old-record',type:'answer',contentId:'old',questionId:q.id,answer:q.answer},
  {id:'new-record',type:'answer',contentId:bank.contentId,questionId:q.id,answer:q.answer},
 ],batch:null});
 await study.flush();assert.deepEqual(seen,['old',bank.contentId]);
 const state=study.read();assert.equal(state.outbox.length,0);assert.equal(state.quarantined[0].rows[0].id,'old-record');
 assert.equal(state.quarantined[0].reason,'题库已更新');assert.equal(state.batch,null);
});

test('lost responses retain the exact submission ID and contents on retry',async()=>{
 setup();const requests=[];handle=o=>{requests.push(structuredClone(o.data));o.fail({});};
 study.record(bank.questions[0],bank.questions[0].answer,bank.contentId);await study.flush();
 assert.equal(study.read().outbox.length,1);
 handle=o=>{requests.push(structuredClone(o.data));ok(o);};await study.flush();
 assert.deepEqual(requests[1],requests[0]);assert.equal(study.read().outbox.length,0);
});

test('account changes during an in-flight answer never write into the new account',async()=>{
 setup();let pending;handle=o=>{pending=o;};
 study.record(bank.questions[0],bank.questions[0].answer,bank.contentId);
 const running=study.flush();storage.set('session',{email:'different@example.test',cookie:'y'.repeat(43)});
 ok(pending);await running;assert.equal(study.read().outbox.length,0);assert.deepEqual(study.read().progress,{});
 assert.equal(study.read(session.email).outbox.length,0);assert.ok(study.read(session.email).progress[bank.questions[0].id]);
});

test('expired sessions pause replay and preserve queued records',async()=>{
 setup();let calls=0;handle=o=>{calls++;o.success({statusCode:401,data:{error:'登录已失效'}});};
 study.record(bank.questions[0],bank.questions[0].answer,bank.contentId);await study.flush();await study.flush();
 assert.equal(calls,1);assert.equal(storage.get('session').expired,true);assert.equal(study.read().outbox.length,1);
});

test('storage quota errors are visible and leave the last saved draft intact',()=>{
 cache.clear();storage.set('draft',{answer:'saved'});const original=wx.setStorageSync;
 wx.setStorageSync=()=>{throw new Error('quota');};
 assert.throws(()=>storage.set('draft',{answer:'new'}),/尚未保存/);wx.setStorageSync=original;
 assert.deepEqual(storage.get('draft'),{answer:'saved'});
});
