const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const postgres=require('postgres');
const port=Number(process.env.WECHAT_TEST_API_PORT||3210);
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'Use a valid local test port');
const base='http://127.0.0.1:'+port;
const sql=postgres('postgres://postgres:test@127.0.0.1:55432/postgres',{max:1,prepare:false});
after(()=>sql.end());
const stamp=Date.now();
async function call(route,body,cookie){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Accept:'application/json','content-type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
test('actual API: accounts, idempotent theory and exams, isolation, stale content, history and logout',async()=>{
 // This connection is hardcoded to the isolated loopback test database.
 await sql`delete from auth_throttle`;
 const manifest=await call('/api/content/manifest');assert.equal(manifest.status,200);
 const theory=await call(manifest.data.theory.path);assert.equal(theory.data.questions.length,900);
 const account={email:`api-a-${stamp}@example.test`,password:'LocalApiPassword3210',displayName:'验收 A'};
 const a=await call('/api/auth/register',account);assert.equal(a.status,201,JSON.stringify(a.data));assert.ok(a.cookie);
 const b=await call('/api/auth/register',{...account,email:`api-b-${stamp}@example.test`,displayName:'验收 B'});assert.equal(b.status,201);
 assert.equal((await call('/api/auth/me',null,a.cookie)).data.user.email,account.email);
 assert.equal((await call('/api/auth/login',{email:account.email,password:'incorrect'})).status,401);
 const login=await call('/api/auth/login',account);assert.equal(login.status,200);
 const q=theory.data.questions[0];const payload={contentId:manifest.data.contentId,submissionId:`answer-${stamp}-first`,attempts:[{questionId:q.id,answer:q.answer,attempts:2}]};
 assert.equal((await call('/api/theory/answer',payload)).status,401);
 assert.equal((await call('/api/theory/answer',{attempts:[null]},a.cookie)).status,400);
 assert.equal((await call('/api/theory/answer',{attempts:[{questionId:q.id,answer:[q.answer[0],q.answer[0]]}]},a.cookie)).status,400);
 const repeated=await Promise.all([1,2,3].map(()=>call('/api/theory/answer',payload,a.cookie)));
 for(const r of repeated)assert.equal(r.status,200,JSON.stringify(r.data));
 const [progress]=await sql`select attempts,correct from theory_progress where email=${account.email} and question_id=${q.id}`;assert.equal(progress.attempts,2);assert.equal(progress.correct,true);
 assert.equal((await call('/api/theory/answer',{...payload,attempts:[{questionId:q.id,answer:q.answer,attempts:3}]},a.cookie)).status,409);
 const stale={...payload,submissionId:`answer-${stamp}-stale`,contentId:'0'.repeat(64)};
 assert.equal((await call('/api/theory/answer',stale,a.cookie)).status,409);
 const [rollback]=await sql`select count(*)::int as count from api_submissions where submission_id=${stale.submissionId}`;assert.equal(rollback.count,0);
 assert.equal((await call('/api/theory/state',null,b.cookie)).data.answeredIds.length,0);
 assert.equal((await call('/api/theory/state',null,a.cookie)).data.answeredIds.includes(q.id),true);
 await call('/api/favorites',{itemType:'theory',itemId:q.id,active:true},a.cookie);
 assert.deepEqual((await call('/api/theory/state',null,a.cookie)).data.favoriteIds,[q.id]);
 assert.deepEqual((await call('/api/theory/state',null,b.cookie)).data.favoriteIds,[]);
 const ids=theory.data.officialQuestionIds;const answers=Object.fromEntries(ids.map(id=>[id,theory.data.questions.find(q=>q.id===id).answer]));
 const paper={contentId:manifest.data.contentId,submissionId:`exam-${stamp}-first`,mode:'official',questionIds:ids,answers};
 for(let i=0;i<2;i++){const result=await call('/api/theory/attempt',paper,a.cookie);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.score,100);}
 assert.equal((await call('/api/theory/attempt',null,a.cookie)).data.attempts.length,1);
 assert.equal((await call('/api/theory/attempt',null,b.cookie)).data.attempts.length,0);
 // Existing website requests without new metadata keep working.
 assert.equal((await call('/api/theory/answer',{questionId:q.id,answer:q.answer},login.cookie)).status,200);
 const logout=await call('/api/auth/logout',{},a.cookie);assert.equal(logout.status,200);
 assert.equal((await call('/api/theory/state',null,a.cookie)).status,401);
 assert.equal((await call('/api/auth/me',null,login.cookie)).data.user.email,account.email);
 console.log('Verified real SQL writes, retry count, rollback and independently revocable sessions.');
});
