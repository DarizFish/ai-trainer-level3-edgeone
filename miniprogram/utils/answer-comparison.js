function normalized(value,kind){
  const text=String(value||'').replace(/\r\n?/g,'\n').trim();
  if(kind!=='code'||text.includes('\n'))return text;
  // Token boundaries and quoted whitespace remain significant. Do not execute code.
  const tokens=text.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\*\*=|\/\/=|<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\*\*|\/\/|==|!=|<=|>=|:=|<<|>>|->|\s+|./g)||[];
  return JSON.stringify(tokens.filter(token=>!/^[\s]+$/.test(token)).map(token=>{
    if((token[0]==='"'||token[0]==="'")&&!token.includes('\\'))return ['string',token.slice(1,-1)];
    return ['token',token];
  }));
}
function parts(value,prefix,suffix){
  const chars=Array.from(value),end=chars.length-suffix;
  return [{key:0,text:chars.slice(0,prefix).join(''),changed:false},{key:1,text:chars.slice(prefix,end).join(''),changed:true},{key:2,text:chars.slice(end).join(''),changed:false}].filter(part=>part.text);
}
function compare(mine,answer,kind){
  mine=String(mine||'');answer=String(answer||'');
  const state=!mine.trim()?'empty':normalized(mine,kind)===normalized(answer,kind)?'exact':'different';
  let prefix=0,suffix=0;
  if(state==='different'){
    const a=Array.from(mine),b=Array.from(answer);
    while(prefix<Math.min(a.length,b.length)&&a[prefix]===b[prefix])prefix++;
    while(suffix<Math.min(a.length,b.length)-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  }
  const labels={exact:'与参考一致',different:'与参考有差异',empty:'尚未填写'};
  return {state,label:labels[state],mark:{exact:'✓',different:'≠',empty:'·'}[state],expandable:answer.length>60||answer.includes('\n'),
    mineParts:state==='different'?parts(mine,prefix,suffix):[{key:0,text:mine||'还没有填写这一项',changed:false}],
    answerParts:state==='different'?parts(answer,prefix,suffix):[{key:0,text:answer,changed:false}],
    note:kind==='code'?'文字核对仅供参考，代码效果请到网页端运行验证。':'表达不同不代表答错，请结合参考思路与评分要点自评。'};
}
module.exports={compare,normalized};
