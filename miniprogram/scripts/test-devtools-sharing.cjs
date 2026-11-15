const automator=require('miniprogram-automator');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const deadline=setTimeout(()=>{console.error('Share menu acceptance exceeded three minutes');process.exit(1);},180000);
async function bounded(label,operation,ms=10000){let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
async function until(label,read,check,ms=45000){const end=Date.now()+ms;let last;while(Date.now()<end){last=await bounded(label,read());if(check(last))return last;await new Promise(resolve=>setTimeout(resolve,150));}throw new Error(label+': '+JSON.stringify(last));}
(async()=>{
 let mini;
 try{
  mini=await until('share runtime',async()=>{let client;try{client=await automator.connect({wsEndpoint:'ws://127.0.0.1:'+process.env.WECHAT_AUTOMATION_PORT});if(await bounded('source snapshot',client.evaluate(expected=>getApp().globalData.acceptanceSnapshot===expected,process.env.WECHAT_ACCEPTANCE_SNAPSHOT),5000))return client;}catch(_){}client?.disconnect();return null;},Boolean);
  // Read the real bridge callback state from the page; no wx method is mocked.
  await bounded('use isolated API',mini.evaluate(()=>{getApp().useDevelopmentServer('http://127.0.0.1:9');return true;}));
  const menu=()=>mini.evaluate(()=>{const page=getCurrentPages().slice(-1)[0];return {route:page.route,...page.shareMenu};});
  const results=[];
  for(const route of require('../app.json').pages){
   const query=route==='pages/task/task'?'?code=2.1.1':route==='pages/practice/practice'?'?type=single':'';
   await bounded('open '+route,mini.reLaunch('/'+route+query));
   const opened=await until('native menu enabled on '+route,menu,entry=>entry.route===route&&entry.state&&entry.state!=='pending',15000);
   assert.equal(opened.state,'enabled',JSON.stringify(opened));
   await bounded('remember menu request',mini.evaluate(()=>{getApp().globalData.previousShareMenu=getCurrentPages().slice(-1)[0].shareMenu;return true;}));
   await bounded('hide menu',mini.callWxMethod('hideShareMenu',{menus:['shareAppMessage']}));
   await bounded('leave '+route,mini.navigateTo('/pages/privacy/privacy'));
   await bounded('return '+route,mini.navigateBack());
   const returned=await until('native menu restored on '+route,menu,entry=>entry.route===route&&entry.state&&entry.state!=='pending',15000);
   assert.equal(returned.state,'enabled',JSON.stringify(returned));
   assert.equal(await bounded('new request after return',mini.evaluate(()=>getCurrentPages().slice(-1)[0].shareMenu!==getApp().globalData.previousShareMenu)),true);
   const share=await bounded('share callback '+route,mini.evaluate(()=>getCurrentPages().slice(-1)[0].onShareAppMessage({from:'menu'})));
   assert.ok(share.title);assert.ok(require('../app.json').pages.includes(share.path.split('?')[0].replace(/^\//,'')));
   results.push({route,share,menuEnabled:true,menuRestored:true});console.log('PASS native share menu and return:',route);
  }
  const output=path.join(require('node:os').tmpdir(),'aitrainer-miniprogram-acceptance','sharing');await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({pages:results},null,2));
  console.log('Share menu acceptance passed. Actual phone sending and release behavior require WeChat verification.');
 }finally{mini?.disconnect();clearTimeout(deadline);}
})().catch(error=>{console.error(error);process.exitCode=1;});
