const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {compare}=require('../utils/answer-comparison');
const {destination}=require('../utils/website');
const bank=require('../data/bundled');
const cache=new Map();
global.wx={getStorageSync:k=>cache.has(k)?structuredClone(cache.get(k)):'',setStorageSync:(k,v)=>cache.set(k,structuredClone(v)),removeStorageSync:k=>cache.delete(k),pageScrollTo(){},showToast(){},showShareMenu(options){options.success?.();}};
function pageAt(route){
  const file=path.resolve(__dirname,'..',route+'.js');let definition;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:page=>{definition=page;},wx:global.wx},{filename:file});
  return {...definition,data:structuredClone(definition.data||{}),setData(update){for(const [key,value] of Object.entries(update)){const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;for(const part of keys.slice(0,-1))target=target[part];target[keys.at(-1)]=structuredClone(value);}}};
}
test('every registered page enables friend sharing and private screens share public entry points',()=>{
  const pages=require('../app.json').pages;
  for(const route of pages){
    const page=pageAt(route);assert.equal(typeof page.onShareAppMessage,'function',route);
    page.data.session={email:'private@example.test'};page.data.exam={id:'private-exam'};page.data.answers={secret:'private-answer'};
    const share=page.onShareAppMessage();
    assert.ok(share.title);assert.ok(pages.includes(share.path.split('?')[0].replace(/^\//,'')));
    assert.doesNotMatch(JSON.stringify(share),/private@|private-exam|private-answer|cookie|password/);
    if(/\/(me|account)\//.test(route))assert.equal(share.path,'/pages/index/index');
    if(route==='pages/exam/exam')assert.equal(share.path,'/pages/mock/mock');
  }
});
test('sharing from wrong answers or favorites opens the exact public question for a fresh visitor',()=>{
  for(const type of ['judge','single','multi']){
    cache.clear();const question=bank.questions.find(q=>q.type===type);
    const sender=pageAt('pages/practice/practice');sender.filter={mode:'favorite',type};sender.data.question=question;
    const shared=sender.onShareAppMessage();const url=new URL(shared.path,'https://example.test');
    assert.equal(url.searchParams.get('question'),question.id);assert.equal(url.searchParams.has('mode'),false);
    const receiver=pageAt('pages/practice/practice');receiver.onLoad(Object.fromEntries(url.searchParams));
    assert.equal(receiver.data.question.id,question.id);assert.equal(receiver.data.empty,false);assert.equal(receiver.data.revealed,false);
  }
});
test('entering and returning to every page enables friend sharing while keeping page lifecycle work',()=>{
  cache.clear();const calls=[],original=global.wx.showShareMenu;global.wx.showShareMenu=options=>{calls.push(options);options.success();};
  try{
    for(const route of require('../app.json').pages){
      const page=pageAt(route);let timerStarts=0;
      if(route==='pages/practice/practice')page.onLoad({type:'single'});
      if(route==='pages/exam/exam'){page.exam={phase:'active'};page.startTimer=()=>timerStarts++;}
      const start=calls.length;page.onShow();page.onShow();
      assert.equal(calls.length-start,2,route);
      assert.equal(page.shareMenu.state,'enabled',route);
      for(const call of calls.slice(start))assert.deepEqual(call.menus,['shareAppMessage']);
      if(route==='pages/index/index')assert.equal(page.data.types.length,3);
      if(route==='pages/me/me')assert.equal(page.data.stats.length,3);
      if(route==='pages/exam/exam')assert.equal(timerStarts,2);
      if(route==='pages/practice/practice')assert.equal(page.data.question.type,'single');
    }
  }finally{global.wx.showShareMenu=original;}
});
test('a rejected share menu request stays diagnosable and does not stop the study page rendering',t=>{
  const warnings=[],original=global.wx.showShareMenu;t.mock.method(console,'warn',(...args)=>warnings.push(args));
  try{
    for(const throws of [false,true]){
      global.wx.showShareMenu=options=>{if(throws)throw new Error('bridge unavailable');options.fail({errMsg:'showShareMenu:fail denied'});};
      const page=pageAt('pages/index/index');page.onShow();
      assert.equal(page.data.types.length,3);
      assert.equal(page.shareMenu.state,'failed');
      assert.match(page.shareMenu.error,throws?/bridge unavailable/:/showShareMenu:fail denied/);
    }
    assert.equal(warnings.length,2);
    assert.match(warnings[0].join(' '),/showShareMenu:fail denied/);
    assert.match(warnings[1].join(' '),/bridge unavailable/);
  }finally{global.wx.showShareMenu=original;}
});
test('practical sharing retains the current task and omits local drafts',()=>{
  for(const task of bank.tasks){
    const page=pageAt('pages/task/task');page.data.task=task;page.data.answers={private:'secret'};
    const shared=page.onShareAppMessage();assert.equal(shared.path,'/pages/task/task?code='+task.code);assert.doesNotMatch(shared.path,/answer|secret/);
  }
});
test('code comparison accepts harmless single-line spacing and quotes while preserving meaningful differences',()=>{
  assert.equal(compare(" pd.read_csv( 'auto-mpg.csv' ) ",'pd.read_csv("auto-mpg.csv")','code').state,'exact');
  for(const [left,right] of [["df['a b']","df['ab']"],['x == y','x = y'],['x += 1','x + = 1'],['a is not b','a isnot b'],['1e-3','1e - 3'],['.5','. 5'],['if x:\n  y()','if x:\ny()']])assert.equal(compare(left,right,'code').state,'different',left);
  assert.equal(compare(' \n ','x()','code').state,'empty');
  assert.equal(compare('first\r\n  second','first\n  second','code').state,'exact');
});
test('text comparison is lossless, highlights changed content, and does not turn a difference into a correctness verdict',()=>{
  const mine='先检查🙂数据，再复核字段。',answer='先检查🙂数据，再删除字段。';
  const result=compare(mine,answer,'text');assert.equal(result.state,'different');
  assert.equal(result.mineParts.map(p=>p.text).join(''),mine);assert.equal(result.answerParts.map(p=>p.text).join(''),answer);
  assert.equal(result.mineParts.find(p=>p.changed).text,'复核');assert.equal(result.answerParts.find(p=>p.changed).text,'删除');
  assert.match(result.note,/不代表答错/);assert.equal(result.correct,undefined);
  assert.equal(compare(' 数据 质量 ','数据质量','text').state,'different');
  assert.equal(compare(' '+answer+' ',answer,'text').state,'exact');
  const large=compare('甲'.repeat(10000),'甲'.repeat(9999)+'乙','text');assert.equal(large.mineParts.map(p=>p.text).join('').length,10000);
});
test('comparison and website guidance preserve answers, self-assessment, and the original reading position',()=>{
  for(const code of ['2.1.1','4.2.1','1.2.1']){
    cache.clear();const page=pageAt('pages/task/task');page.onLoad({code});page.start();page.input({detail:{value:'自己的草稿'}});page.done();
    const mode=page.data.mode;page.readerScroll({currentTarget:{dataset:{mode}},detail:{scrollTop:180,scrollLeft:0}});
    const before=structuredClone(page.draft);page.reveal();assert.equal(page.data.comparisons[page.data.field.id].comparison.state,'different');assert.equal(page.data.panel,'');
    page.readerScroll({currentTarget:{dataset:{mode}},detail:{scrollTop:500,scrollLeft:0}});assert.deepEqual(structuredClone(page.draft),before);
    page.closeReference();assert.deepEqual(structuredClone(page.draft),before);
    page.openWebsite();assert.equal(page.data.websiteOpen,true);assert.equal(page.data.keyboardHeight,0);page.closeWebsite();
    assert.deepEqual(structuredClone(page.draft),before);assert.equal(page.data.answer,'自己的草稿');
    page.reveal();assert.equal(page.draft.checks[page.data.field.id],undefined);
  }
});
test('website destinations point to the matching exercise and only code tasks enter a lab',()=>{
  assert.equal(destination('2.1.1',true),'https://www.aitrainer3.xyz/practical/2.1.1/lab');
  assert.equal(destination('4.2.1',false),'https://www.aitrainer3.xyz/practical/4.2.1');
  assert.equal(destination('',false),'https://www.aitrainer3.xyz/practical');
  assert.equal(destination('2.1.1?secret=1',true),'https://www.aitrainer3.xyz/practical');
});
test('website copy passes the matching public URL to the clipboard API and reports failures',()=>{
  const filename=path.resolve(__dirname,'../components/website-guide/website-guide.js');let component;
  const calls=[],toasts=[];const wx={setClipboardData:options=>calls.push(options),showToast:options=>toasts.push(options)};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:createRequire(filename),Component:definition=>{component=definition;},wx},{filename});
  component.methods.copy.call({data:{code:'2.1.1',executable:true}});
  assert.equal(calls[0].data,'https://www.aitrainer3.xyz/practical/2.1.1/lab');calls[0].success();assert.equal(toasts[0].title,'链接已复制');
  component.methods.copy.call({data:{code:'4.2.1',executable:false}});assert.equal(calls[1].data,'https://www.aitrainer3.xyz/practical/4.2.1');calls[1].fail();assert.match(toasts[1].title,/失败/);
});
