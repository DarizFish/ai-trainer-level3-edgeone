const content=require('../../utils/content');
const storage=require('../../utils/storage');
const ui=require('../../utils/ui');
const view=require('../../utils/practical-view');
const afterRender=fn=>wx.nextTick?wx.nextTick(fn):fn();
Page({
  data:{task:null,field:null,current:0,answer:'',revealed:false,checked:null,filled:0,older:[],showOlder:false,
    mode:'code',codeCells:[],codeFields:[],codePosition:0,codeTarget:'',documentTarget:'',answers:{},checks:{},
    document:{template:false,blocks:[],sections:[]},textFields:[],codeAvailable:false,saveError:'',
    editing:false,writing:false,inputFocus:false,panel:'',wrapCode:true,keyboardHeight:0,viewportHeight:667,safeBottom:0,
    position:0,fieldCount:0,positionLabel:'',directory:[],savedLabel:'',criteria:[],inlineWidth:120,referenceTarget:'',
    reference:null,referenceContextOpen:false,referenceCriteriaOpen:false,promptOpen:false,
    codeScroll:0,codeLeft:0,documentScroll:0,directoryFilter:'all',visibleDirectory:[],remaining:0,needsReview:0,codeFilled:0,textFilled:0},
  onLoad(options){
    this.user=storage.owner();this.task=content.get().tasks.find(t=>t.code===options.code);
    if(!this.task){ui.error(new Error('题目不存在'));return;}
    const info=wx.getWindowInfo?wx.getWindowInfo():{windowHeight:667};
    this.baseHeight=info.windowHeight;this.windowWidth=info.windowWidth||375;this.inset=Math.max(0,(info.screenHeight||0)-(info.safeArea?.bottom||info.screenHeight||0));
    this.setData({viewportHeight:this.baseHeight,safeBottom:this.inset});
    wx.setNavigationBarTitle?.({title:this.task.code+' · 实操'});
    this.keyboardListener=e=>this.keyboard(e);wx.onKeyboardHeightChange?.(this.keyboardListener);
    this.key=storage.key('task:'+this.task.code,this.user);
    this.saved=storage.get(this.key,{versions:{}});
    this.draft=this.saved.versions[this.task.exerciseVersion]||{answers:{},checks:{},current:0,labels:Object.fromEntries(this.task.fields.map(f=>[f.id,f.label]))};
    this.draft.positions=this.draft.positions||{};this.draft.scroll=this.draft.scroll||{};
    const codeFields=this.task.fields.map((f,index)=>({...f,index})).filter(f=>f.kind==='code');
    const textFields=this.task.fields.map((f,index)=>({...f,index})).filter(f=>f.kind!=='code');
    const codeCells=view.notebook(this.task,this.draft.answers);
    this.tokenPaths={};
    codeCells.forEach((cell,c)=>cell.lines.forEach((line,l)=>line.tokens.forEach((token,t)=>{if(token.blank)this.tokenPaths[token.id]=`codeCells[${c}].lines[${l}].tokens[${t}]`;})));
    const document=view.documents(this.task);
    document.blocks=document.blocks.map(block=>{
      const [before,...rest]=block.text.split('【待填写】');
      return {...block,before,after:rest.join('【待填写】')};
    });
    const current=Math.max(0,Math.min(this.draft.current||0,this.task.fields.length-1));
    this.setData({task:{code:this.task.code,title:this.task.title,description:this.task.description,rubric:this.task.rubric,materials:this.task.materials,total:this.task.fields.length,group:this.task.group},
      codeFields,textFields,codeCells,codeAvailable:codeCells.length>0,document,answers:this.draft.answers,
      checks:Object.fromEntries(Object.entries(this.draft.checks).map(([id,value])=>[id,value?'yes':'no'])),
      mode:this.task.fields[current].kind==='code'?'code':'document',
      older:Object.entries(this.saved.versions).filter(([version])=>version!==this.task.exerciseVersion).map(([version,draft])=>({version,answers:Object.entries(draft.answers).filter(([,v])=>v.trim()).map(([id,answer])=>({id,label:draft.labels?.[id]||id,answer}))})),
    });
    this.show(current);this.refreshDirectory();
    try{storage.set(storage.key('task:last',this.user),this.task.code);}catch(error){ui.error(error);}
  },
  onReady(){this.measureViewport();if(this.task)this.restoreReader();},
  measureViewport(){
    if(!wx.createSelectorQuery||this.data.keyboardHeight)return;
    wx.createSelectorQuery().select('.workspace').boundingClientRect(rect=>{if(rect?.height && !this.data.keyboardHeight){this.baseHeight=rect.height;this.setData({viewportHeight:rect.height});}}).exec();
  },
  onHide(){if(this.task && storage.owner()===this.user)this.save();},
  onUnload(){wx.offKeyboardHeightChange?.(this.keyboardListener);if(this.task && storage.owner()===this.user)this.save();},
  onResize(e){
    if(e.size.windowWidth)this.windowWidth=e.size.windowWidth;
    const height=e.size.windowHeight;
    if(this.data.editing && this.data.inputFocus && !this.data.keyboardHeight && height<this.baseHeight)return;
    if(!this.data.keyboardHeight)this.baseHeight=height;
    this.setData({viewportHeight:this.data.keyboardHeight?Math.min(height,this.baseHeight-this.data.keyboardHeight):height});
    if(!this.data.keyboardHeight)afterRender(()=>this.measureViewport());
  },
  keyboard(e){
    const height=Math.max(0,e.detail?.height??e.height??0);
    this.setData({keyboardHeight:height,viewportHeight:height?Math.max(0,this.baseHeight-height):this.baseHeight,safeBottom:height?0:this.inset});
    if(height && this.data.editing && !this.data.writing)afterRender(()=>this.locate());
  },
  show(index){
    const field=this.task.fields[index];if(!field)return;
    this.draft.current=index;
    this.draft.positions[field.kind==='code'?'code':'document']=index;
    const fields=field.kind==='code'?this.data.codeFields:this.data.textFields;
    const position=fields.findIndex(f=>f.index===index);
    this.setData({current:index,field,answer:this.draft.answers[field.id]||'',checked:this.draft.checks[field.id]===undefined?null:this.draft.checks[field.id],
      filled:this.task.fields.filter(f=>this.draft.answers[f.id]?.trim()).length,codePosition:Math.max(0,this.data.codeFields.findIndex(f=>f.index===index)),
      codeFilled:this.data.codeFields.filter(f=>this.draft.answers[f.id]?.trim()).length,textFilled:this.data.textFields.filter(f=>this.draft.answers[f.id]?.trim()).length,
      position,fieldCount:fields.length,positionLabel:field.kind==='code'?`第 ${position+1} 空 · 第 ${field.source.line} 行`:field.label,
      criteria:this.task.rubric.filter(r=>field.rubricIds.includes(r.id)),writing:this.data.editing && field.kind!=='code' && !this.data.document.template,
      inlineWidth:this.inputWidth(field,this.draft.answers[field.id]||'')});
  },
  persist(){
    if(storage.owner()!==this.user)throw new Error('账号已切换，请返回后重新打开本题');
    this.saved.versions[this.task.exerciseVersion]=this.draft;storage.set(this.key,this.saved);this.setData({saveError:'',savedLabel:'已保存'});
  },
  save(){try{this.persist();}catch(error){this.setData({saveError:error.message,savedLabel:'未保存'});ui.error(error);}},
  inputWidth(field,value){
    const code=field.kind==='code',unit=code?8.5:8;
    const columns=Math.max(0,...value.split('\n').map(line=>Array.from(line).reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0)));
    return Math.min(this.windowWidth-(code?54:76),Math.max(code?112:152,Math.ceil(columns*unit)+32));
  },
  input(e){this.edit(Number(e.currentTarget?.dataset?.index??this.data.current),e.detail.value);},
  edit(index,value){
    const field=this.task.fields[index];if(!field)return;this.draft.answers[field.id]=value;delete this.draft.checks[field.id];
    const changes={answers:this.draft.answers,checks:{...this.data.checks,[field.id]:''}};
    const token=this.tokenPaths[field.id];if(token){changes[token+'.text']=value;changes[token+'.filled']=!!value.trim();}
    this.setData(changes);this.show(this.data.current);this.save();
  },
  locate(){
    const field=this.task.fields[this.data.current];
    const key=field.kind==='code'?'codeTarget':'documentTarget';
    const target=field.kind==='code'?`code-${field.source.cellId}-${Math.max(1,field.source.line-2)}`:`section-${this.data.current}`;
    this.setData({[key]:''});afterRender(()=>this.setData({[key]:target}));
  },
  readerScroll(e){
    const mode=e.currentTarget.dataset.mode;
    if(this.data.writing || mode!==this.data.mode)return;
    this.draft.scroll[mode]={top:e.detail.scrollTop,left:e.detail.scrollLeft||0};
  },
  restoreReader(){
    const mode=this.data.mode,saved=this.draft.scroll[mode];
    this.setData({codeTarget:'',documentTarget:''});
    if(saved)this.setData({[mode==='code'?'codeScroll':'documentScroll']:saved.top,...(mode==='code'?{codeLeft:saved.left}:{})});
    else if(this.data.current>0)this.locate();
  },
  selectField(e){const index=Number(e.currentTarget.dataset.index??e.detail?.index);if(Number.isInteger(index))this.select(index,!!e.currentTarget.dataset.locate);},
  select(index,locate=true){
    const field=this.task.fields[index];if(!field)return;
    this.setData({mode:field.kind==='code'?'code':'document',panel:'',revealed:false,editing:true,inputFocus:false,promptOpen:false});
    this.show(index);this.save();
    afterRender(()=>{if(locate)this.locate();this.setData({inputFocus:true});});
  },
  start(){if(this.data.mode==='code'&&!this.data.codeAvailable)return;this.select(this.data.current);},
  done(){
    const writing=this.data.writing;
    this.setData({editing:false,writing:false,inputFocus:false});wx.hideKeyboard?.();
    this.keyboard({height:0});this.refreshDirectory();if(writing)afterRender(()=>this.restoreReader());
  },
  move(e){
    const fields=this.data.mode==='code'?this.data.codeFields:this.data.textFields;
    const next=fields[this.data.position+Number(e.currentTarget.dataset.step)];if(next)this.select(next.index);
  },
  switchMode(e){
    const mode=e.currentTarget.dataset.mode;if(mode===this.data.mode)return;
    this.setData({editing:false,writing:false,inputFocus:false,mode});wx.hideKeyboard?.();this.keyboard({height:0});
    const fields=mode==='code'?this.data.codeFields:this.data.textFields;
    const remembered=fields.find(f=>f.index===this.draft.positions[mode])||fields[0];
    if(remembered)this.show(remembered.index);this.save();afterRender(()=>this.restoreReader());
  },
  openPanel(e){if(e.currentTarget.dataset.panel==='directory')this.setData({directoryFilter:'all'});this.setPanel(e.currentTarget.dataset.panel);},
  openRemaining(){this.setData({directoryFilter:this.data.filled<this.task.fields.length?'missing':'all'});this.setPanel('directory');},
  togglePrompt(){this.setData({promptOpen:!this.data.promptOpen});},
  setPanel(panel){
    this.returnToEditing=this.data.editing;
    this.setData({panel,inputFocus:false,revealed:panel==='reference'});wx.hideKeyboard?.();this.keyboard({height:0});
    if(panel==='directory')this.refreshDirectory();
  },
  closePanel(){
    this.setData({panel:'',revealed:false});
    if(this.returnToEditing)afterRender(()=>this.setData({inputFocus:true}));
  },
  showReference(index){
    const field=this.task.fields[index],fields=field.kind==='code'?this.data.codeFields:this.data.textFields;
    const position=fields.findIndex(f=>f.index===index);
    this.setData({reference:{index,position,count:fields.length,kind:field.kind,
      label:field.kind==='code'?`第 ${field.source.line} 行${field.source.slot>1?' · 本行第 '+field.source.slot+' 处':''}`:field.label,
      context:view.fieldContext(this.task,field),contextExpandable:field.kind!=='code'&&!this.data.document.template,
      answer:field.answer,mine:this.draft.answers[field.id]||'',checked:this.draft.checks[field.id]??null,
      criteria:this.task.rubric.filter(r=>field.rubricIds.includes(r.id))},referenceContextOpen:false,referenceCriteriaOpen:false,referenceTarget:''});
    afterRender(()=>this.setData({referenceTarget:'reference-current'}));
  },
  reveal(){this.showReference(this.data.current);this.setPanel('reference');},
  moveReference(e){
    const ref=this.data.reference,fields=ref.kind==='code'?this.data.codeFields:this.data.textFields;
    const next=fields[ref.position+Number(e.currentTarget.dataset.step)];if(next)this.showReference(next.index);
  },
  toggleReferenceContext(){this.setData({referenceContextOpen:!this.data.referenceContextOpen});},
  toggleCriteria(){this.setData({referenceCriteriaOpen:!this.data.referenceCriteriaOpen});},
  fillReference(){this.select(this.data.reference.index);},
  check(e){const value=e.currentTarget.dataset.value,index=this.data.reference.index,id=this.task.fields[index].id;this.draft.checks[id]=value==='yes';this.setData({checks:{...this.data.checks,[id]:value},'reference.checked':value==='yes'});this.show(this.data.current);this.save();},
  refreshDirectory(){
    const directory=this.task.fields.map((f,index)=>({index,id:f.id,kind:f.kind,label:f.kind==='code'?`第 ${f.source.line} 行 · 第 ${f.source.slot} 处`:f.label,filled:!!this.draft.answers[f.id]?.trim(),checked:this.draft.checks[f.id]===true,needsReview:this.draft.checks[f.id]===false}));
    this.setData({directory,remaining:directory.filter(f=>!f.filled).length,needsReview:directory.filter(f=>f.needsReview).length});this.filterDirectory();
  },
  changeDirectoryFilter(e){this.setData({directoryFilter:e.currentTarget.dataset.filter});this.filterDirectory();},
  filterDirectory(){this.setData({visibleDirectory:this.data.directory.filter(f=>this.data.directoryFilter==='missing'?!f.filled:this.data.directoryFilter==='review'?f.needsReview:true)});},
  toggleWrap(){this.setData({wrapCode:!this.data.wrapCode});},
  older(){this.setData({showOlder:!this.data.showOlder});},
  swallow(){},
});
