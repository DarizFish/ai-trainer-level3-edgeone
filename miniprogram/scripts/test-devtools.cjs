const automator=require('miniprogram-automator');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');

const bank=require('../data/bundled');
const base='http://127.0.0.1:3210';
const prefix='aitrainer:v1:';
const results=[];
const deadline=setTimeout(()=>{console.error('DevTools acceptance exceeded 15 minutes');process.exit(1);},15*60*1000);
async function until(label,read,check=Boolean,ms=15000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){last=await read();if(check(last))return last;await new Promise(resolve=>setTimeout(resolve,150));}
 throw new Error(`${label}: condition failed; last value ${JSON.stringify(last)}`);
}
(async()=>{
 assert.equal((await fetch(base+'/api/content/manifest')).status,200,'Start scripts/start-local-api.mjs first');
 const mini=await until('DevTools app runtime ready',async()=>{
  let client,timer;
  try{
   client=await automator.connect({wsEndpoint:'ws://127.0.0.1:'+(process.env.WECHAT_AUTOMATION_PORT||9420)});
   // The CLI can return before it replaces the old automation runtime. Check
   // the app on this connection, and reconnect if that runtime is retiring.
   const ready=await Promise.race([
    (async()=>{const stack=await client.pageStack();return stack.length>0&&await client.evaluate(()=>!!getApp());})(),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('runtime not ready')),5000);}),
   ]);
   if(ready){console.log('DevTools app runtime ready');return client;}
  }catch(error){console.log('Waiting for runtime:',error.message.split('\n')[0]);}
  finally{clearTimeout(timer);}
  client?.disconnect();return null;
 },Boolean,45000);
 const send=mini.connection.send.bind(mini.connection);
 mini.connection.send=(method,params)=>send(method,params).catch(error=>{throw new Error(method+': '+error.message);});
 const errors=[];mini.on('exception',error=>{errors.push(error);console.error('Runtime exception',error);});
 let backup,modalMocked=false,requestMocked=false;
 // Writing screenshots beneath the project can trigger DevTools recompilation
 // and destroy the app between actions, even when that folder is not packaged.
 const output=path.join(require('node:os').tmpdir(),'aitrainer-miniprogram-acceptance');await fs.mkdir(output,{recursive:true});
 const captureFailures=[];
 const snapshot=async name=>{
  if(process.env.CAPTURE_DEVTOOLS!=='1')return;
  try{await mini.screenshot({path:path.join(output,name+'.png')});}
  catch(error){captureFailures.push(name);console.warn('Screenshot unavailable:',name,error.message);}
 };
 const pass=name=>{results.push(name);console.log('PASS '+name);};
 async function pageAt(route){return until('route '+route,()=>mini.currentPage(),p=>p?.path===route);}
 async function route(url,method='redirectTo'){
  return mini[method](url).catch(e=>{throw new Error('navigation '+url+': '+e.message);});
 }
 async function tap(page,selector){const element=await until(selector,()=>page.$(selector));await element.tap();await mini.evaluate(()=>new Promise(resolve=>wx.nextTick(()=>resolve(true))));}
 async function choose(page,values){
  if(page.path==='pages/practice/practice' && await page.data('revealed')){
   await tap(page,'button[data-action="retry"]');await until('ready to retry',()=>page.data('revealed'),v=>v===false);
  }
  const component=await until('question component',()=>page.$('#question'));
  for(const value of values)await tap(component,`.option[data-value="${value}"]`);
 }
 async function readState(email){return mini.callWxMethod('getStorageSync',prefix+'study:'+encodeURIComponent(email||'guest'));}
 try {
  console.log('Saving existing simulator storage');
  backup=await mini.evaluate(()=>Object.fromEntries(wx.getStorageInfoSync().keys.filter(k=>k.startsWith('aitrainer:v1:')).map(k=>[k,wx.getStorageSync(k)])));
  await mini.evaluate(origin=>{
   getApp().useDevelopmentServer(origin);
   for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);
   return true;
  },base);

  console.log('Opening homepage');
  let page=await mini.currentPage();
  if(page.path!=='pages/index/index')page=await route('/pages/index/index','switchTab');
  await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].onShow();return true;});
  console.log('Homepage route ready');
  assert.equal(await page.data('total').catch(e=>{throw new Error('home data: '+e.message);}),900);
  await snapshot('home').catch(e=>{throw new Error('home screenshot: '+e.message);});pass('homepage / 900 questions');
  await mini.evaluate(()=>{void getApp().refresh();return true;});
  await until('content capabilities',()=>mini.evaluate(()=>wx.getStorageSync('aitrainer:v1:capabilities')||null),v=>v?.idempotentSubmissions,30000).catch(async error=>{
   console.error('Refresh diagnostic',await mini.evaluate(()=>getApp().globalData));throw error;
  });
  console.log('Local content downloaded and validated');
  for(const type of ['judge','single','multi']){
   page=await route('/pages/practice/practice?type='+type,'navigateTo');
   const q=await until('question '+type,()=>page.data('question'));
   await choose(page,q.answer);if(q.type==='multi')await tap(page,'button[data-action="submit"]');
   await until('answer reveal',()=>page.data('revealed'));
   assert.deepEqual((await readState()).progress[q.id].answer,q.answer);
   await tap(page,'button[data-action="favorite"]');await until('favorite saved',()=>readState(),state=>state.favorites[q.id]===true);
   if(type==='multi')await snapshot('theory-multi');
   page=await route('/pages/index/index','switchTab');
  }
  page=await route('/pages/practice/practice?type=judge','navigateTo');
  const q=await page.data('question');await choose(page,[q.answer[0]==='√'?'×':'√']);
  await until('wrong answer saved',()=>readState(),s=>s.progress[q.id]?.correct===false);
  page=await route('/pages/practice/practice?mode=wrong');assert.equal(await page.data('question.id'),q.id);
  await choose(page,q.answer);if(q.type==='multi')await tap(page,'button[data-action="submit"]');
  page=await route('/pages/practice/practice?mode=wrong');assert.equal(await page.data('empty'),true);
  page=await route('/pages/practice/practice?mode=favorite');assert.equal(await page.data('total'),3);
  pass('theory types / wrong correction / favorites / guest persistence');

  if(process.env.DEVTOOLS_SKIP_PRACTICAL!=='1'){
  page=await route('/pages/practical/practical','switchTab');
  assert.equal((await page.data('tasks')).length,0);
  assert.equal((await page.data('sections')).flatMap(s=>s.modules).length,8);
  await snapshot('practical-directory');
  await tap(page,'button[data-group="2.1"]');
  await until('selected module shows five tasks',()=>page.data('tasks'),v=>v.length===5);
  await snapshot('practical-module');
  await tap(page,'button[data-action="back"]');await until('directory restored',()=>page.data('group'),v=>v==='');
  await (await page.$('input')).input('4.1.1');await until('practical search',()=>page.data('tasks'),v=>v.length===1);
  await tap(page,'view[data-code="4.1.1"]');page=await pageAt('pages/task/task');
  const stopEditing=async()=>{
    if(await page.data('revealed'))await page.callMethod('closeReference');
    if(await page.data('panel')){await page.callMethod('closePanel');await until('panel closed',()=>page.data('panel'),v=>v==='');}
    if(await page.data('editing')){await page.callMethod('done');await until('reading mode',()=>page.data('editing'),v=>!v);}
  };
  const editText=async(index,value)=>{
    await stopEditing();
    if(await page.data('document.template'))await tap(page,`.inline-answer[data-index="${index}"]`);
    else {const field=await until('field '+index,()=>page.$(`.answer-field[data-index="${index}"]`));await tap(field,'.answer-preview');}
    await until('text editor open',()=>page.data('editing'));
    const textarea=await until('text input',()=>page.$('textarea'));
    await textarea.input(value);await until('text input saved',()=>page.data(),d=>d.current===index && d.answer===value);return page;
  };
  await editText(0,'本机恢复验收');
  await tap(page,'button[data-action="reveal"]');await until('reference revealed',()=>page.data('revealed'),v=>!!v);
  await mini.mockWxMethod('showActionSheet',{tapIndex:1});await page.callMethod('assessField',{currentTarget:{dataset:{index:0}}});await mini.restoreWxMethod('showActionSheet');await until('self assessment saved',()=>page.data('checked'),v=>v===true);
  await editText(1,'第二项恢复验收');
  page=await route('/pages/task/task?code=4.1.1');
  await until('second answer restored',()=>page.data('answer'),v=>v==='第二项恢复验收');
  assert.equal((await page.data('answers'))['doc-1-blank-1'],'本机恢复验收');
  await snapshot('practical-training');
  for(const task of bank.tasks){
   page=await route('/pages/task/task?code='+task.code);
   await until('task '+task.code,()=>page.data('task.code'),v=>v===task.code);
   assert.equal(await page.data('task.total'),task.fields.length);
   const first=task.fields[0];
   if(first.kind==='code'){
    assert.equal(await page.data('codeAvailable'),true);
    await tap(page,'.code-blank[data-index="0"]');await until('code editor open',()=>page.data('editing'));
    await (await page.$('.code-answer')).input('验收 '+task.code);await until('code input saved',()=>page.data('answer'),v=>v==='验收 '+task.code);
    await tap(page,'button[data-action="reveal"]');await until('code reference',()=>page.data('revealed'),v=>!!v);
    assert.equal(await page.data('field.answer'),first.answer);
    await page.callMethod('closeReference');await until('reference closed',()=>page.data('revealed'),v=>!v);
    const cells=await page.data('codeCells');
    await tap(page,'.code-blank[data-index="1"]');await until('inline blank selected',()=>page.data('current'),v=>v===1);
    await (await page.$('.code-answer')).input('第二空');await until('second input saved',()=>page.data('answer'),v=>v==='第二空');
    await tap(page,'button[data-step="-1"]');await until('first blank restored',()=>page.data('answer'),v=>v==='验收 '+task.code);
    assert.equal((await page.data('codeCells')).length,cells.length);
    if(task.fields.some(f=>f.kind==='text')){
     await stopEditing();await tap(page,'button[data-mode="document"]');await until('document tab',()=>page.data('mode'),v=>v==='document');
     await editText(task.fields.findIndex(f=>f.kind==='text'),'配套报告验收');
     await stopEditing();await tap(page,'button[data-mode="code"]');await until('code tab',()=>page.data('mode'),v=>v==='code');
     assert.equal(await page.data('answer'),'验收 '+task.code);
    }
   }else{
    await editText(0,'验收 '+task.code);
    await tap(page,'button[data-action="reveal"]');await until('written reference',()=>page.data('revealed'),v=>!!v);
    assert.equal(await page.data('field.answer'),first.answer);
    await stopEditing();
    const selector=await page.data('document.template')?'.inline-answer':'.answer-field';
    assert.equal((await page.$$(selector)).length,task.fields.length);
   }
   if(['2.1.1','1.2.1','3.1.1','4.2.1'].includes(task.code))await snapshot('practical-'+task.code);
  }
  const t=bank.tasks.find(t=>t.code==='4.1.1');
  await mini.evaluate(({key,version})=>{const draft=wx.getStorageSync(key);draft.versions['previous-version']=draft.versions[version];delete draft.versions[version];wx.setStorageSync(key,draft);return true;},{key:prefix+'task:4.1.1:guest',version:t.exerciseVersion});
  page=await route('/pages/task/task?code=4.1.1');assert.equal(await page.data('answer'),'');assert.equal((await page.data('older')).length,1);
  await tap(page,'button[data-panel="info"]');await until('task details open',()=>page.data('panel'),v=>v==='info');await tap(page,'view[data-action="older"]');await until('older draft visible',()=>page.data('showOlder'));
  pass('8-module navigation / all 40 exercises / full code / complete documents / local recovery / old versions');
  }

  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});modalMocked=true;
  page=await route('/pages/mock/mock','switchTab');await tap(page,'button[data-mode="official"]');page=await pageAt('pages/exam/exam');
  const examQ=await until('exam question',()=>page.data('question'));
  await choose(page,examQ.answer);await until('exam answer saved',()=>page.data('answered'),v=>v===1);
  const before=await mini.callWxMethod('getStorageSync',prefix+'exam:guest');
  assert.equal(before.questions.length,190);
  await tap(page,'text[data-action="toggleSheet"]');await until('answer sheet rendered',()=>page.$$('.answer-cell'),v=>v.length===190);
  await tap(page,'.answer-cell[data-index="189"]');await until('last question selected',()=>page.data('exam.current'),v=>v===189);
  page=await route('/pages/mock/mock','switchTab');await tap(page,'button[data-action="resume"]');page=await pageAt('pages/exam/exam');
  assert.equal(await page.data('exam.current'),189);
  const after=await mini.callWxMethod('getStorageSync',prefix+'exam:guest');assert.equal(after.deadlineAt,before.deadlineAt);assert.deepEqual(after.answers,before.answers);
  await tap(page,'button[data-action="submit"]');await until('exam complete',()=>page.data('exam.phase'),v=>v==='finished');
  assert.equal(await page.data('exam.result.score'),examQ.points);await snapshot('exam-result');
  page=await route('/pages/mock/mock','switchTab');const examId=(await page.data('history'))[0].id;
  await tap(page,`view[data-id="${examId}"]`);page=await pageAt('pages/exam/exam');assert.equal(await page.data('exam.phase'),'finished');
  page=await route('/pages/mock/mock','switchTab');await tap(page,'button[data-mode="random"]');page=await pageAt('pages/exam/exam');
  await until('random paper',()=>page.data('question'));
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.exam.deadlineAt=Date.now()-1;p.persist();p.onHide();p.onShow();return true;});
  await until('deadline auto submit',()=>page.data('exam.phase'),v=>v==='finished');assert.equal(await page.data('exam.result.score'),0);
  pass('official and random exams / 190-cell answer sheet / resume / deadline / score / review');

  const stamp=Date.now();const account={email:`ui-${stamp}@example.test`,password:'LocalAcceptance3210',displayName:'验收用户'};
  page=await route('/pages/account/account?mode=register');
  await (await page.$('input[data-name="email"]')).input(account.email);
  await (await page.$('input[data-name="password"]')).input(account.password);
  await (await page.$('input[data-name="displayName"]')).input(account.displayName);
  await (await page.$('checkbox-group')).trigger('change',{value:['yes']});
  await until('registration consent',()=>page.data('accepted'));
  await tap(page,'button[data-action="submit"]');page=await pageAt('pages/me/me');
  await until('registered account shown',()=>page.data('session.email'),v=>v===account.email);assert.equal((await page.data('stats')).every(s=>s.answered===0),true);
  const session=await mini.callWxMethod('getStorageSync',prefix+'session');assert.equal(session.cookie.length,43);
  const serverState=async()=>{const r=await fetch(base+'/api/theory/state',{headers:{Cookie:'ai_trainer_session='+session.cookie}});return r.json();};
  page=await route('/pages/practice/practice?type=single','navigateTo');const aq=await page.data('question');
  await choose(page,aq.answer);await tap(page,'button[data-action="favorite"]');
  await until('cloud answer',serverState,v=>v.progress?.some(p=>p.questionId===aq.id),30000);
  await until('cloud favorite',serverState,v=>v.favoriteIds?.includes(aq.id),30000);
  pass('native registration / cookie session / website data sync');

  await mini.mockWxMethod('request',function(options){options.fail({errMsg:'offline acceptance'});});requestMocked=true;
  page=await route('/pages/practice/practice?type=multi');const oq=await page.data('question');await choose(page,oq.answer);await tap(page,'button[data-action="submit"]');
  await until('offline queue',()=>readState(account.email),v=>v.outbox.length>0);
  await mini.restoreWxMethod('request');requestMocked=false;page=await route('/pages/me/me','switchTab');await tap(page,'button[data-action="sync"]');
  await until('queue drained',()=>readState(account.email),v=>v.outbox.length===0,30000);
  assert.equal((await serverState()).progress.some(p=>p.questionId===oq.id),true);
  await snapshot('account-sync');pass('offline persistence / successful retry');

  page=await route('/pages/mock/mock','switchTab');await tap(page,'button[data-mode="official"]');page=await pageAt('pages/exam/exam');
  await until('account exam',()=>page.data('question'));await tap(page,'button[data-action="submit"]');
  await until('account score saved',()=>readState(account.email),v=>v.exams.length===1&&v.outbox.length===0,30000);
  page=await route('/pages/me/me','switchTab');await tap(page,'button[data-action="sync"]');await until('cloud score',()=>page.data('history'),v=>v.length===1,30000);
  await tap(page,'button[data-action="logout"]');
  await until('session removed',()=>mini.evaluate(()=>!!wx.getStorageSync('aitrainer:v1:session')),v=>v===false);
  await until('logout shown',()=>page.data('session'),v=>v==null);
  assert.equal((await fetch(base+'/api/theory/state',{headers:{Cookie:'ai_trainer_session='+session.cookie}})).status,401);
  assert.ok((await readState()).progress[q.id]);
  page=await route('/pages/account/account','navigateTo');
  await (await page.$('input[data-name="email"]')).input(account.email);
  await (await page.$('input[data-name="password"]')).input(account.password);
  await (await page.$('checkbox-group')).trigger('change',{value:['yes']});await tap(page,'button[data-action="submit"]');
  page=await pageAt('pages/me/me');await until('account restored',()=>page.data('session.email'),v=>v===account.email);
  page=await route('/pages/task/task?code=2.1.1','navigateTo');assert.equal(await page.data('answer'),'');
  page=await route('/pages/privacy/privacy');assert.ok((await (await page.$('.page')).text()).includes('contact@aitrainer3.xyz'));await snapshot('privacy');
  pass('cloud score / logout revocation / login restoration / account and guest isolation / privacy');
  assert.equal(errors.length,0,'No runtime exceptions');
  await fs.writeFile(path.join(output,'devtools-report.json'),JSON.stringify({passed:process.env.DEVTOOLS_SKIP_PRACTICAL!=='1',workflowPassed:true,skippedPractical:process.env.DEVTOOLS_SKIP_PRACTICAL==='1',at:new Date().toISOString(),tests:results,captureFailures,system:await mini.systemInfo()},null,2));
 } catch(error){await snapshot('failure').catch(()=>{});throw error;}
 finally {
  if(requestMocked)await mini.restoreWxMethod('request').catch(()=>{});
  if(modalMocked)await mini.restoreWxMethod('showModal').catch(()=>{});
  if(backup)await mini.evaluate(saved=>{for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);for(const [key,value] of Object.entries(saved))wx.setStorageSync(key,value);return true;},backup).catch(()=>{});
  mini.disconnect();clearTimeout(deadline);
 }
})().catch(error=>{console.error(error);clearTimeout(deadline);process.exitCode=1;});
