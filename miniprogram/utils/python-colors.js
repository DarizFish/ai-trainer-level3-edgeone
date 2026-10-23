const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const builtins=new Set('abs all any bool dict enumerate filter float int len list map max min open print range round set sorted str sum tuple zip'.split(' '));

// Read-only coloring of source text. Scan the whole cell so multiline strings
// and comments keep their meaning; the displayed source is never rewritten.
function pythonLines(source){
  const lines=[[]];let definition=false;
  const pattern=/[rRuUbBfF]{0,2}(?:'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:[^'\\\n]|\\.)*(?:'|$)|"(?:[^"\\\n]|\\.)*(?:"|$))|#[^\n]*|\b(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b|\b[A-Za-z_]\w*\b|[+*/%=<>!&|^~:@-]+|\s+|./g;
  for(const match of source.matchAll(pattern)){
    const text=match[0];let syntax='plain';
    if(/^[rRuUbBfF]{0,2}['"]/.test(text))syntax='string';
    else if(text.startsWith('#'))syntax='comment';
    else if(keywords.has(text))syntax='keyword';
    else if(/^\d|^\.\d/.test(text))syntax='number';
    else if(/^[A-Za-z_]\w*$/.test(text))syntax=definition?'definition':builtins.has(text)?'builtin':'plain';
    else if(/^[+*/%=<>!&|^~:@-]+$/.test(text))syntax='operator';
    if(text.trim()&&!text.startsWith('#'))definition=text==='def'||text==='class';
    text.split('\n').forEach((part,index)=>{if(index)lines.push([]);if(part)lines.at(-1).push({text:part,syntax});});
  }
  return lines;
}
function sliceParts(parts,start,end){
  let offset=0;const result=[];
  for(const part of parts){const from=Math.max(0,start-offset),to=Math.min(part.text.length,end-offset);if(to>from)result.push({key:result.length,text:part.text.slice(from,to),syntax:part.syntax});offset+=part.text.length;if(offset>=end)break;}
  return result;
}
module.exports={pythonLines,sliceParts};
