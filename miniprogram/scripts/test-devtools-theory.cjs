const automator=require('miniprogram-automator');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const output=path.join(require('node:os').tmpdir(),'aitrainer-miniprogram-acceptance');
const deadline=setTimeout(()=>{console.error('Theory acceptance exceeded 5 minutes');process.exit(1);},300000);
async function until(label,read,check=Boolean,ms=20000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){last=await read();if(check(last))return last;await new Promise(r=>setTimeout(r,150));}
 throw new Error(`${label}: ${JSON.stringify(last)}`);
}
(async()=>{
 const mini=await until('runtime',async()=>{
  let client,timer;
  try{
   client=await automator.connect({wsEndpoint:'ws://127.0.0.1:'+(process.env.WECHAT_AUTOMATION_PORT||9421)});
   await Promise.race([client.evaluate(()=>!!getApp()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('not ready')),3000);})]);
   if((await client.pageStack()).length)return client;
  }catch(_){}finally{clearTimeout(timer);}client?.disconnect();return null;
 },Boolean,45000);
 const checks=[],errors=[],geometry={};let backup;
 mini.on('exception',error=>errors.push(error));
 const capture=name=>mini.screenshot({path:path.join(output,name+'.png')});
 const tap=async(page,selector)=>{
  const el=await until(selector,()=>page.$(selector));await el.tap();
  await mini.evaluate(()=>new Promise(resolve=>wx.nextTick(()=>resolve(true))));
 };
 const state=()=>mini.callWxMethod('getStorageSync','aitrainer:v1:study:guest');
 const home=async()=>{
  const page=await mini.switchTab('/pages/index/index');await until('three types',()=>page.data('types'),v=>v?.length===3);return page;
 };
 const open=async type=>{
  await tap(await home(),`.type-card[data-type="${type}"]`);
  const page=await until('practice page',()=>mini.currentPage(),p=>p?.path==='pages/practice/practice');
  await until('question loaded',()=>page.data('question'),q=>q?.type===type);return page;
 };
 const choose=async(page,answer)=>{
  const component=await until('question component',()=>page.$('#question'));
  for(const value of answer){
   await tap(component,`.option[data-value="${value}"]`);await until('option selected',()=>page.data('selected'),v=>v.includes(value));
  }
  if((await page.data('question')).type==='multi')await tap(page,'button[data-action="submit"]');
  await until('answer shown',()=>page.data('revealed'));
 };
 const assertHistory=async(page,record)=>{
  await until('saved question',()=>page.data('question.id'),id=>id===record.question.id);
  assert.equal(await page.data('current'),record.index);
  assert.deepEqual(await page.data('selected'),record.answer);
  assert.equal(await page.data('revealed'),true);assert.equal(await page.data('restored'),true);
  const component=await page.$('#question');
  assert.ok(await component.$('.explanation'),'Explanation is rendered');
  assert.equal((await component.$$('.chosen')).length,record.answer.length,'Saved options are visibly marked');
  assert.match(await (await page.$('.history-row')).text(),/上次作答/);
 };
 try{
  await fs.mkdir(output,{recursive:true});
  backup=await mini.evaluate(()=>Object.fromEntries(wx.getStorageInfoSync().keys.filter(k=>k.startsWith('aitrainer:v1:')).map(k=>[k,wx.getStorageSync(k)])));
  await mini.evaluate(()=>{
   getApp().useDevelopmentServer('http://127.0.0.1:3210');
   for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);
   return true;
  });
  await mini.reLaunch('/pages/index/index');
  const saved=[];
  for(const [index,type] of ['judge','single','multi'].entries()){
   let page=await open(type);const first=await page.data('question');
   assert.equal(await page.data('revealed'),false);
   await choose(page,first.answer);
   if(type==='single')await tap(page,'button[data-action="favorite"]');
   for(let n=0;n<=index;n++){
    await tap(page,'button[data-action="next"]');await until('next question',()=>page.data('current'),v=>v===n+1);
   }
   const question=await page.data('question');
   const answer=type==='judge'?question.answer:type==='single'?[question.answer[0]==='A'?'B':'A']:question.answer.slice(0,1);
   await choose(page,answer);saved.push({type,index:index+1,question,answer});console.log('Answered '+type+' '+question.id);
  }
  const before=await state();
  for(const record of saved){
   const page=await open(record.type);await assertHistory(page,record);
   await capture('theory-restored-'+record.type);
   await tap(page,'button[data-action="previous"]');await until('previous question',()=>page.data('current'),v=>v===record.index-1);
   await tap(page,'button[data-action="next"]');await until('next question',()=>page.data('current'),v=>v===record.index);
   await assertHistory(page,record);
  }
  assert.deepEqual(await state(),before,'Viewing history does not write another answer');
  checks.push('all three types restore independent positions, saved options and explanations through native navigation');
  checks.push('previous/next restores answers and history viewing leaves the stored study state unchanged');

  let page=await home();const cards=await page.data('types');
  for(const record of saved){
   const card=cards.find(c=>c.type===record.type);
   assert.equal(card.answered,2);assert.equal(card.current,record.index+1);
   assert.equal(card.right,record.type==='judge'?2:1);assert.equal(card.wrong,record.type==='judge'?0:1);
  }
  geometry.home=await mini.evaluate(()=>new Promise(resolve=>wx.createSelectorQuery().selectViewport().boundingClientRect().selectAll('.type-card').boundingClientRect().exec(resolve)));
  assert.equal(geometry.home[1].length,3);
  assert.ok(geometry.home[1].every(r=>r.left>=0 && r.right<=geometry.home[0].width),'All type cards fit phone width');
  await capture('theory-types');checks.push('home shows per-type counts and positions, with three cards within the phone width');

  page=await open('multi');await tap(page,'button[data-action="retry"]');await until('editing again',()=>page.data('revealed'),v=>v===false);
  assert.equal(await page.data('revealed'),false);assert.deepEqual(await page.data('selected'),[]);
  assert.deepEqual(await state(),before,'Retry alone does not delete the previous answer');
  await capture('theory-retry');
  page=await open('multi');await assertHistory(page,saved[2]);
  await tap(page,'button[data-action="retry"]');await until('editing multi',()=>page.data('revealed'),v=>v===false);await choose(page,saved[2].question.answer);
  assert.equal(await page.data('restored'),false);assert.equal((await state()).progress[saved[2].question.id].correct,true);
  checks.push('retry can be abandoned without losing history; confirming a new answer replaces the saved answer');

  await tap(await home(),'view[data-mode="wrong"]');
  page=await until('wrong list',()=>mini.currentPage(),p=>p?.path==='pages/practice/practice');
  await until('wrong answer restored',()=>page.data('question.id'),id=>id===saved[1].question.id);
  assert.equal(await page.data('restored'),true);
  await tap(page,'button[data-action="retry"]');await until('editing wrong answer',()=>page.data('revealed'),v=>v===false);await choose(page,saved[1].question.answer);
  assert.equal((await state()).progress[saved[1].question.id].correct,true);
  let indexPage=await home();assert.equal(await indexPage.data('wrong'),0);
  await tap(indexPage,'view[data-mode="favorite"]');
  page=await until('favorite list',()=>mini.currentPage(),p=>p?.path==='pages/practice/practice');
  await until('favorite question restored',()=>page.data('revealed'));assert.equal(await page.data('restored'),true);
  page=await open('single');assert.equal(await page.data('question.id'),saved[1].question.id);
  assert.equal(await page.data('answerRight'),true);
  checks.push('wrong-answer correction updates progress and favorite review does not move the normal practice position');

  assert.equal(errors.length,0,'No runtime exceptions');
  const result={passed:true,at:new Date().toISOString(),sourceSnapshot:process.env.WECHAT_ACCEPTANCE_PROJECT,checks,geometry,errors,scope:'Guest theory UI in DevTools; accounts, API, practical tasks and real-device restart were not rerun.'};
  await fs.writeFile(path.join(output,'theory-report.json'),JSON.stringify(result,null,2));
  console.log('PASS '+checks.join(' / '));
 }catch(error){await capture('theory-failure').catch(()=>{});throw error;}
 finally{
  if(backup)await mini.evaluate(saved=>{
   for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);
   for(const [key,value]of Object.entries(saved))wx.setStorageSync(key,value);return true;
  },backup).catch(()=>{});
  mini.disconnect();clearTimeout(deadline);
 }
})().catch(error=>{console.error(error);clearTimeout(deadline);process.exitCode=1;});
