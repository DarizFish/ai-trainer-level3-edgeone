const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const bank=require('../data/bundled');
const cache=new Map();
global.wx={getStorageSync:k=>cache.has(k)?structuredClone(cache.get(k)):'',setStorageSync:(k,v)=>cache.set(k,structuredClone(v)),removeStorageSync:k=>cache.delete(k),pageScrollTo(){},showToast(){},showShareMenu(options){options.success?.();}};
const storage=require('../utils/storage');
function loadPage(name,overrides={}){
  const filename=path.resolve(__dirname,`../pages/${name}/${name}.js`);
  const localRequire=createRequire(filename);let definition;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>overrides[id]||localRequire(id),Page:d=>{definition=d;},wx:global.wx},{filename});
  const page={...definition,data:structuredClone(definition.data),setData(update){
    for(const [key,value] of Object.entries(update)){
      const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;
      for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=structuredClone(value);
    }
  }};
  return page;
}

test('single and judge answers submit once on selection; multi stays editable until confirmation',()=>{
  for(const type of ['single','judge','multi']){
    cache.clear();const submissions=[];
    const page=loadPage('practice',{'../../utils/study':{read:()=>({progress:{},favorites:{}}),record:(q,a)=>submissions.push([...a])}});
    page.onLoad({type});
    const answer=page.data.question.answer;
    page.choose({detail:{value:answer[0]}});
    assert.equal(page.data.revealed,type!=='multi');
    assert.equal(submissions.length,type==='multi'?0:1);
    if(type==='multi'){
      page.choose({detail:{value:answer[0]}});assert.equal(page.data.selected.length,0);
      for(const value of answer)page.choose({detail:{value}});
      page.submit();assert.equal(page.data.revealed,true);
    }
    page.submit();page.choose({detail:{value:answer[0]}});
    assert.equal(submissions.length,1);
    assert.deepEqual(submissions[0],answer);
  }
});

test('each theory type restores its own question, selection and explanation after leaving',()=>{
  cache.clear();const saved=[];
  for(const [index,type] of ['judge','single','multi'].entries()){
    const page=loadPage('practice');page.onLoad({type});
    for(let n=0;n<=index;n++)page.next();
    const question=page.data.question;
    for(const value of question.answer)page.choose({detail:{value}});
    if(type==='multi')page.submit();
    saved.push({type,index:index+1,question});
  }
  const before=structuredClone([...cache]);
  for(const {type,index,question} of saved){
    const restored=loadPage('practice');restored.onLoad({type});
    assert.equal(restored.data.current,index);assert.equal(restored.data.question.id,question.id);
    assert.deepEqual(restored.data.selected,question.answer);assert.equal(restored.data.revealed,true);assert.equal(restored.data.restored,true);
    restored.previous();assert.equal(restored.data.revealed,false);
    restored.next();assert.deepEqual(restored.data.selected,question.answer);assert.equal(restored.data.revealed,true);
  }
  assert.deepEqual([...cache],before,'Reading history must not create submissions or alter progress');
});

test('retry keeps the saved answer until a new answer is submitted and viewing never queues a submission',()=>{
  cache.clear();storage.set('session',{email:'learner@example.test',expired:true});
  const study=require('../utils/study'),page=loadPage('practice');page.onLoad({type:'multi'});
  const question=page.data.question,wrong=question.answer.slice(0,1);
  page.choose({detail:{value:wrong[0]}});page.submit();
  assert.equal(study.read().progress[question.id].correct,false);
  const before=study.read();
  const restored=loadPage('practice');restored.onLoad({type:'multi'});
  assert.equal(restored.data.answerRight,false);assert.equal(restored.data.restored,true);
  restored.retry();assert.equal(restored.data.revealed,false);assert.equal(restored.data.selected.length,0);
  assert.deepEqual(study.read(),before,'Retry is a local editing state, not deletion or a submission');
  const abandoned=loadPage('practice');abandoned.onLoad({type:'multi'});
  assert.deepEqual(abandoned.data.selected,wrong);assert.equal(abandoned.data.revealed,true);
  for(const value of question.answer)restored.choose({detail:{value}});
  restored.submit();assert.equal(restored.data.restored,false);assert.equal(restored.data.answerRight,true);
  assert.equal(study.read().outbox.length,before.outbox.length+1);
  assert.deepEqual(study.read().progress[question.id].answer,question.answer);
});

test('wrong and favorite lists keep their own position without changing type practice',()=>{
  cache.clear();const study=require('../utils/study');
  const page=loadPage('practice');page.onLoad({type:'judge'});page.show(4);
  const state=study.read();
  for(const q of page.questions.slice(0,3)){
    state.progress[q.id]={answer:[q.answer[0]==='√'?'×':'√'],correct:false};state.favorites[q.id]=true;
  }
  storage.set(storage.key('study'),state);
  for(const mode of ['wrong','favorite']){
    const review=loadPage('practice');review.onLoad({mode});review.show(mode==='wrong'?1:2);
    assert.equal(review.data.revealed,true);assert.equal(review.data.restored,true);
  }
  const normal=loadPage('practice');normal.onLoad({type:'judge'});assert.equal(normal.data.current,4);
  for(const mode of ['wrong','favorite']){
    const review=loadPage('practice');review.onLoad({mode});assert.equal(review.data.current,mode==='wrong'?1:2);
  }
});

test('legacy theory position is reused only for matching questions and yields to a new saved position',()=>{
  cache.clear();const questions=bank.questions.filter(q=>q.type==='single');
  storage.set(storage.key('resume'),{questionId:questions[7].id});
  const single=loadPage('practice');single.onLoad({type:'single'});assert.equal(single.data.current,7);single.next();
  const judge=loadPage('practice');judge.onLoad({type:'judge'});assert.equal(judge.data.current,0);
  const restored=loadPage('practice');restored.onLoad({type:'single'});assert.equal(restored.data.current,8);
  const explicit=loadPage('practice');explicit.onLoad({type:'single',question:questions[2].id});assert.equal(explicit.data.current,2);
});

test('theory answers and positions are isolated between visitors and accounts',()=>{
  cache.clear();const study=require('../utils/study');
  const users=['guest','first@example.test','second@example.test'];
  users.forEach((user,index)=>{
    if(user==='guest')storage.remove('session');else storage.set('session',{email:user,expired:true});
    const page=loadPage('practice');page.onLoad({type:'judge'});assert.equal(page.data.current,0);assert.equal(page.data.revealed,false);
    page.show(index+2);page.choose({detail:{value:page.data.question.answer[0]}});
    assert.equal(Object.keys(study.read().progress).length,1);
  });
  users.forEach((user,index)=>{
    if(user==='guest')storage.remove('session');else storage.set('session',{email:user,expired:true});
    const page=loadPage('practice');page.onLoad({type:'judge'});
    assert.equal(page.data.current,index+2);assert.equal(page.data.revealed,true);
    assert.deepEqual(page.data.selected,page.data.question.answer);
  });
});

test('theory home reports answered and correct counts per type using current question IDs',()=>{
  cache.clear();const state={progress:{unknown:{answer:['A'],correct:false}},favorites:{unknown:true}};
  for(const type of ['judge','single','multi']){
    const questions=bank.questions.filter(q=>q.type===type);
    state.progress[questions[0].id]={answer:questions[0].answer,correct:true};
    state.progress[questions[1].id]={answer:[],correct:false};state.favorites[questions[1].id]=true;
  }
  storage.set(storage.key('study'),state);
  const page=loadPage('index');page.onShow();
  assert.equal(page.data.types.length,3);assert.equal(page.data.wrong,3);assert.equal(page.data.favorites,3);
  for(const type of page.data.types){
    assert.equal(type.count,bank.questions.filter(q=>q.type===type.type).length);
    assert.equal(type.answered,2);assert.equal(type.right,1);assert.equal(type.wrong,1);assert.equal(type.started,true);
  }
});

test('existing practical drafts retain answers, self-assessment and old versions across the new code/report views',()=>{
  cache.clear();
  const task=bank.tasks.find(t=>t.code==='2.1.1');const code=task.fields[0],text=task.fields.find(f=>f.kind==='text');
  const current=task.fields.indexOf(text);
  const draft={answers:{[code.id]:'pd.read_csv("old.csv")',[text.id]:'原有报告'},checks:{[code.id]:true,[text.id]:false},current,labels:{[code.id]:code.label}};
  storage.set('session',{email:'one@example.test'});
  const key=storage.key('task:'+task.code);
  storage.set(key,{versions:{[task.exerciseVersion]:draft,old:{answers:{old:'历史填写'},checks:{}}}});
  const page=loadPage('task');page.onLoad({code:task.code});
  assert.equal(page.data.mode,'document');assert.equal(page.data.answer,'原有报告');assert.equal(page.data.checked,false);assert.equal(page.data.older.length,1);
  page.switchMode({currentTarget:{dataset:{mode:'code'}}});
  assert.equal(page.data.answer,'pd.read_csv("old.csv")');assert.equal(page.data.checked,true);
  page.input({detail:{value:'pd.read_csv("new.csv")'}});
  const restored=storage.get(key).versions;
  assert.equal(restored[task.exerciseVersion].answers[code.id],'pd.read_csv("new.csv")');
  assert.equal(restored[task.exerciseVersion].answers[text.id],'原有报告');
  assert.equal(restored[task.exerciseVersion].checks[code.id],undefined);
  assert.equal(restored.old.answers.old,'历史填写');
  storage.set('session',{email:'two@example.test'});
  const other=loadPage('task');other.onLoad({code:task.code});assert.equal(other.data.answer,'');
});

test('resuming a later code blank also restores its surrounding code instead of leaving the viewport at the top',()=>{
  cache.clear();const task=bank.tasks.find(t=>t.code==='2.2.3');
  const current=task.fields.findLastIndex(f=>f.kind==='code');const field=task.fields[current];
  storage.set(storage.key('task:'+task.code),{versions:{[task.exerciseVersion]:{answers:{[field.id]:'draft'},checks:{},current}}});
  const page=loadPage('task');page.onLoad({code:task.code});page.onReady();
  assert.equal(page.data.answer,'draft');
  assert.equal(page.data.codeTarget,`code-${field.source.cellId}-${field.source.line-2}`);
  assert.equal(page.data.field.id,field.id);
});

test('reading starts without an editor; short fills keep context and long reports open a writing surface',()=>{
  cache.clear();
  for(const code of ['2.1.1','4.1.1','4.2.1','1.2.1','3.1.1']){
    const page=loadPage('task');page.onLoad({code});
    assert.equal(page.data.editing,false);assert.equal(page.data.writing,false);assert.equal(page.data.panel,'');
    page.start();assert.equal(page.data.editing,true);
    assert.equal(page.data.writing,['1.2.1','3.1.1'].includes(code));
    page.input({detail:{value:'自己的答案'}});page.reveal();assert.equal(page.data.panel,'');assert.ok(page.data.revealed);
    page.closeReference();assert.equal(page.data.answer,'自己的答案');
    page.done();assert.equal(page.data.editing,false);assert.equal(page.data.writing,false);
    assert.equal(page.data.answers[page.data.field.id],'自己的答案');
  }
});

test('keyboard resizing is applied once in either event order and reading height is restored',()=>{
  cache.clear();
  for(const resizeFirst of [true,false]){
    const page=loadPage('task');page.onLoad({code:'2.1.1'});page.start();
    const original=page.data.viewportHeight;
    if(resizeFirst)page.onResize({size:{windowHeight:original-280}});
    page.keyboard({detail:{height:280}});
    if(!resizeFirst)page.onResize({size:{windowHeight:original-280}});
    assert.equal(page.data.viewportHeight,original-280);
    page.done();assert.equal(page.data.viewportHeight,original);assert.equal(page.data.keyboardHeight,0);
  }
});

test('inline input events stay with their blank when the user switches fields',()=>{
  cache.clear();const page=loadPage('task');page.onLoad({code:'2.1.1'});
  page.selectField({currentTarget:{dataset:{index:0}}});
  assert.equal(page.data.editing,true);assert.equal(page.data.inputFocus,true);
  assert.equal(page.data.codeTarget,'','Tapping a visible blank does not jump the reader');
  page.input({currentTarget:{dataset:{index:0}},detail:{value:'first()'}});
  page.selectField({currentTarget:{dataset:{index:1}}});
  page.input({currentTarget:{dataset:{index:0}},detail:{value:'first(final)'}});
  assert.equal(page.data.current,1);assert.equal(page.data.answer,'');
  assert.equal(page.data.answers[page.task.fields[0].id],'first(final)');
  page.input({currentTarget:{dataset:{index:1}},detail:{value:'second()'}});
  page.done();
  const restored=loadPage('task');restored.onLoad({code:'2.1.1'});
  assert.equal(restored.data.answer,'second()');
  assert.equal(restored.data.answers[page.task.fields[0].id],'first(final)');
});

test('one action expands every reference and collapses them without filling drafts',()=>{
  cache.clear();
  for(const task of bank.tasks){
    const page=loadPage('task');page.onLoad({code:task.code});const before=structuredClone(page.draft);page.reveal();
    assert.equal(page.data.panel,'');assert.equal(page.data.current,0);assert.equal(page.data.editing,false);
    assert.equal(Object.keys(page.data.comparisons).length,task.fields.length);
    for(const field of task.fields){const ref=page.data.comparisons[field.id];assert.equal(ref.comparison.state,'empty');assert.equal(ref.comparison.answerParts.map(p=>p.text).join(''),field.answer);}
    assert.deepEqual(structuredClone(page.draft),before);page.reveal();assert.equal(page.data.revealed,false);assert.equal(Object.keys(page.data.comparisons).length,0);
  }
});

test('expanded comparisons stay visible across fields and modes and update when a blank is edited',()=>{
  cache.clear();const page=loadPage('task');page.onLoad({code:'2.1.1'});page.select(2);page.input({detail:{value:'my_answer'}});page.reveal();
  page.closeReference();assert.equal(page.data.current,2);assert.equal(page.data.answer,'my_answer');assert.equal(page.data.inputFocus,true);
  page.reveal();page.select(3);assert.equal(page.data.revealed,true);page.input({detail:{value:page.task.fields[3].answer}});
  assert.equal(page.data.comparisons[page.task.fields[3].id].comparison.state,'exact');assert.equal(page.data.comparisons[page.task.fields[2].id].comparison.state,'different');
  page.switchMode({currentTarget:{dataset:{mode:'document'}}});assert.equal(page.data.revealed,true);
  page.switchMode({currentTarget:{dataset:{mode:'code'}}});assert.equal(page.data.revealed,true);assert.equal(page.data.current,3);
  page.closeReference();assert.equal(page.data.current,3);assert.equal(page.data.editing,false);
  const restored=loadPage('task');restored.onLoad({code:'2.1.1'});assert.equal(restored.data.current,3);assert.equal(restored.data.answers[page.task.fields[2].id],'my_answer');
});

test('code/report switches and reentry preserve their own answer and scroll positions',()=>{
  cache.clear();const page=loadPage('task');page.onLoad({code:'2.1.1'});page.select(7);page.input({detail:{value:'code_7'}});page.done();
  page.readerScroll({currentTarget:{dataset:{mode:'code'}},detail:{scrollTop:425,scrollLeft:12}});
  page.switchMode({currentTarget:{dataset:{mode:'document'}}});
  const report=page.data.textFields[1].index;page.select(report);page.input({detail:{value:'report_2'}});page.done();
  page.readerScroll({currentTarget:{dataset:{mode:'document'}},detail:{scrollTop:175,scrollLeft:0}});
  page.switchMode({currentTarget:{dataset:{mode:'code'}}});
  assert.equal(page.data.current,7);assert.equal(page.data.answer,'code_7');assert.equal(page.data.codeScroll,425);assert.equal(page.data.codeLeft,12);
  const restored=loadPage('task');restored.onLoad({code:'2.1.1'});restored.onReady();
  assert.equal(restored.data.current,7);assert.equal(restored.data.codeScroll,425);
  restored.switchMode({currentTarget:{dataset:{mode:'document'}}});
  assert.equal(restored.data.current,report);assert.equal(restored.data.answer,'report_2');assert.equal(restored.data.documentScroll,175);
});

test('report writing can reopen all comparisons when they were already expanded',()=>{
  cache.clear();const page=loadPage('task');page.onLoad({code:'1.2.1'});page.reveal();page.select(1);page.input({detail:{value:'my report'}});
  assert.equal(page.data.writing,true);page.reveal();assert.equal(page.data.revealed,true);assert.equal(page.data.writing,false);
  assert.equal(Object.keys(page.data.comparisons).length,page.task.fields.length);page.reveal();
  assert.equal(page.data.writing,true);assert.equal(page.data.current,1);assert.equal(page.data.answer,'my report');
});

test('unfinished and review filters identify the right items without changing answers',()=>{
  cache.clear();const page=loadPage('task');page.onLoad({code:'4.2.1'});page.select(0);page.input({detail:{value:'draft'}});global.wx.showActionSheet=options=>options.success({tapIndex:0});page.assessField({currentTarget:{dataset:{index:0}}});delete global.wx.showActionSheet;page.done();
  page.openRemaining();assert.equal(page.data.remaining,4);assert.equal(page.data.visibleDirectory.length,4);assert.ok(page.data.visibleDirectory.every(f=>f.index!==0));
  page.changeDirectoryFilter({currentTarget:{dataset:{filter:'review'}}});assert.equal(page.data.visibleDirectory.length,1);assert.equal(page.data.visibleDirectory[0].index,0);
  page.changeDirectoryFilter({currentTarget:{dataset:{filter:'all'}}});assert.equal(page.data.visibleDirectory.length,5);
});
