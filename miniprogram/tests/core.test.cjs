const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cache=new Map();
global.wx={getStorageSync:key=>cache.get(key)||'',setStorageSync:(key,value)=>cache.set(key,structuredClone(value)),removeStorageSync:key=>cache.delete(key)};
const bank=require('../data/bundled');
const exam=require('../utils/exam');
const storage=require('../utils/storage');
const content=require('../utils/content');
const study=require('../utils/study');

test('UTF-8 content hashes agree with the server',()=>{
 const sha=require('../utils/sha256');
 for(const text of ['', 'abc', '人工智能训练师🙂', JSON.stringify(bank)])assert.equal(sha(text),crypto.createHash('sha256').update(text).digest('hex'));
});
test('all 900 questions and 40 exercises have valid content and unique field identities',()=>{
 assert.equal(content.validate(bank),bank);assert.equal(bank.questions.length,900);assert.equal(bank.tasks.length,40);
 for(const t of bank.tasks){assert.ok(t.fields.length);assert.equal(new Set(t.fields.map(f=>f.id)).size,t.fields.length);for(const f of t.fields){assert.ok(f.answer.trim(),`${t.code}/${f.id}`);assert.ok(f.source);assert.ok(!/_{5,}/.test(f.answer));}}
 assert.equal(bank.tasks.filter(t=>['4.1','4.2'].includes(t.group)).every(t=>t.fields.length===5),true);
 assert.throws(()=>content.validate({...bank,officialQuestionIds:['missing']}));
});
test('official and random papers have exact distribution, scoring and independent answers',()=>{
 for(const mode of ['official','random']){
  const paper=exam.create(bank,mode,1000,()=>.31);
  assert.equal(new Set(paper.questions.map(q=>q.id)).size,190);
  assert.deepEqual(['judge','single','multi'].map(type=>paper.questions.filter(q=>q.type===type).length),[40,140,10]);
  const answers=Object.fromEntries(paper.questions.map(q=>[q.id,q.answer]));assert.equal(exam.score(paper.questions,answers).score,100);
  assert.equal(exam.score(paper.questions,{}).score,0);assert.equal(exam.remaining(paper,1000),5400);assert.equal(exam.remaining(paper,1000+5400000),0);
  const restored=JSON.parse(JSON.stringify(paper));assert.equal(exam.remaining(restored,61000),5340);
 }
 const multi=bank.questions.find(q=>q.type==='multi'&&q.answer.length>1);assert.equal(exam.correct(multi,multi.answer.slice(0,1)),false);assert.equal(exam.correct(multi,multi.answer.slice().reverse()),true);
});
test('retries retain an immutable batch and account storage is isolated',()=>{
 cache.clear();storage.set('session',{email:'a@example.test',cookie:'a'.repeat(43)});
 const q=bank.questions[0];study.record(q,q.answer,bank.contentId);
 const state=study.read();const batch=study.makeBatch(state);state.batch=batch;
 assert.deepEqual(study.makeBatch({...state,outbox:state.outbox.concat({id:'new',type:'answer',questionId:q.id,answer:[],contentId:bank.contentId})}),batch);
 storage.set('session',{email:'b@example.test',cookie:'b'.repeat(43)});assert.equal(study.read().outbox.length,0);
 storage.remove('session');assert.equal(study.read().outbox.length,0);
 assert.equal(study.read('a@example.test').outbox.length,1);
});
test('login cookie parsing accepts wx cookies and rejects invalid values',()=>{
 const parse=require('../utils/request').sessionCookie;const value='a'.repeat(43);
 assert.equal(parse({cookies:[`ai_trainer_session=${value}; Path=/; HttpOnly; Secure`]}),value);
 assert.equal(parse({header:{'Set-Cookie':`ai_trainer_session=${value}; Path=/`}}),value);
 assert.equal(parse({cookies:['ai_trainer_session=bad;']}),null);
});
test('all registered pages exist, JS parses and WXML tags balance',()=>{
 const root=path.resolve(__dirname,'..');const config=require('../app.json');
 const files=[];for(const dir of ['pages','components','utils']){
  function walk(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,entry.name);if(entry.isDirectory())walk(full);else files.push(full);}}
  walk(path.join(root,dir));
 }
 for(const page of config.pages)for(const extension of ['js','json','wxml'])assert.ok(fs.existsSync(path.join(root,page+'.'+extension)));
 for(const file of files){const text=fs.readFileSync(file,'utf8');if(file.endsWith('.js'))new vm.Script(text,{filename:file});
  if(file.endsWith('.wxml')){
   const stack=[];const sanitized=text.replace(/{{[\s\S]*?}}/g,'expression');
   for(const match of sanitized.matchAll(/<\/?([\w-]+)\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/g)){
    if(match[0].startsWith('</'))assert.equal(stack.pop(),match[1],file);else if(!match[0].endsWith('/>'))stack.push(match[1]);
   }assert.deepEqual(stack,[],file);
  }
 }
});
