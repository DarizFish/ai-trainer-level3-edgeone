const automator=require('miniprogram-automator');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const output=path.join(require('node:os').tmpdir(),'aitrainer-miniprogram-acceptance');
const prefix='aitrainer:v1:';
const {spawnSync}=require('node:child_process');
const project=process.env.WECHAT_ACCEPTANCE_PROJECT;
const cli=process.env.WECHAT_DEVTOOLS_CLI||'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
async function until(label,read,check=Boolean){const end=Date.now()+45000;while(Date.now()<end){const value=await read();if(check(value))return value;await new Promise(r=>setTimeout(r,200));}throw new Error(label+' timed out');}
async function connect(){
 let mini;
 await until('DevTools restart',async()=>{
  let candidate,timer;
  try{candidate=await automator.connect({wsEndpoint:'ws://127.0.0.1:'+(process.env.WECHAT_AUTOMATION_PORT||9421)});
   const ready=await Promise.race([candidate.evaluate(()=>!!getApp()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('startup')),5000);})]);
   if(ready){mini=candidate;return true;}
  }catch(_){}finally{clearTimeout(timer);}candidate?.disconnect();return false;
 });
 return mini;
}
(async()=>{
 assert.ok(project&&path.basename(project).startsWith('aitrainer-acceptance-project-'),'Use the isolated runner');
 let mini=await connect();let backup;
 try{
  backup=await mini.evaluate(()=>Object.fromEntries(wx.getStorageInfoSync().keys.filter(k=>k.startsWith('aitrainer:v1:')).map(k=>[k,wx.getStorageSync(k)])));
  await mini.evaluate(()=>{for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);return true;});
  await mini.evaluate(()=>{getApp().useDevelopmentServer('http://127.0.0.1:3210');return true;});
   let page=await mini.navigateTo('/pages/task/task?code=4.1.1');
   await (await page.$('textarea')).input('关闭开发者工具后的填写恢复');
   await until('draft saved',()=>page.data('answer'),v=>v==='关闭开发者工具后的填写恢复');
   await mini.switchTab('/pages/mock/mock');
   page=await mini.navigateTo('/pages/exam/exam?mode=official');
   const q=await page.data('question');const component=await page.$('#question');
   await (await component.$(`.option[data-value="${q.answer[0]}"]`)).tap();
   await until('exam saved',()=>page.data('answered'),v=>v===1);
   const prepared=await mini.callWxMethod('getStorageSync',prefix+'exam:guest');
   await fs.mkdir(output,{recursive:true});
   const expected={id:prepared.id,deadlineAt:prepared.deadlineAt,answers:prepared.answers,questionIds:prepared.questions.map(q=>q.id)};
   await mini.callWxMethod('setStorageSync',prefix+'restart-probe','generic-storage-probe');
   assert.equal(await mini.callWxMethod('getStorageSync',prefix+'restart-probe'),'generic-storage-probe');
   console.log('PASS restart fixture persisted through native inputs');
   mini.disconnect();mini=null;
   for(const command of [`close --project ${quote(project)}`,`auto --project ${quote(project)} --auto-port ${process.env.WECHAT_AUTOMATION_PORT||9421} --trust-project`]){
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',`& ${quote(cli)} ${command}`],{stdio:'inherit',windowsHide:true});assert.equal(result.status,0);
   }
   mini=await connect();
   const probe=await mini.evaluate(()=>({marker:wx.getStorageSync('aitrainer:v1:restart-probe')||null,keys:wx.getStorageInfoSync().keys.filter(k=>k.startsWith('aitrainer:v1:'))}));
   if(probe.marker!=='generic-storage-probe'){
    await fs.writeFile(path.join(output,'restart-report.json'),JSON.stringify({passed:false,status:'inconclusive',at:new Date().toISOString(),limitation:'The DevTools auto session did not preserve even a generic wx storage marker after close/reopen.',keys:probe.keys},null,2));
    const error=new Error('DevTools restart cleared generic storage; this run cannot measure app draft persistence');
    error.exitCode=2;throw error;
   }
   await mini.evaluate(()=>{getApp().useDevelopmentServer('http://127.0.0.1:3210');return true;});
   page=await mini.navigateTo('/pages/task/task?code=4.1.1');
   assert.equal(await page.data('answer'),'关闭开发者工具后的填写恢复');
   await mini.switchTab('/pages/mock/mock');page=await mini.navigateTo('/pages/exam/exam?resume=1');
   const exam=await mini.callWxMethod('getStorageSync',prefix+'exam:guest');
   assert.deepEqual({id:exam.id,deadlineAt:exam.deadlineAt,answers:exam.answers,questionIds:exam.questions.map(q=>q.id)},expected);
   assert.equal(await page.data('answered'),1);
   const clock=await page.data('clock');const [minutes,seconds]=clock.split(':').map(Number);
   assert.ok(Math.abs(minutes*60+seconds-Math.ceil((exam.deadlineAt-Date.now())/1000))<=2);
   await fs.writeFile(path.join(output,'restart-report.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks:['practical draft after project close/reopen','same exam order and answers','unchanged absolute deadline'],clock},null,2));
   console.log('PASS actual project close/reopen: draft, exam answers, order and deadline restored');
 }finally{
  if(backup&&mini)await mini.evaluate(saved=>{for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('aitrainer:v1:'))wx.removeStorageSync(key);for(const [key,value] of Object.entries(saved))wx.setStorageSync(key,value);return true;},backup).catch(()=>{});
  mini?.disconnect();
 }
})().catch(error=>{console.error(error);process.exitCode=error.exitCode||1;});
