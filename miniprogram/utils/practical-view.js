const contexts = require('../data/practical-context');
const {pythonLines,sliceParts}=require('./python-colors');

const modules = [
  ['1.1','业务数据处理','代码练习'], ['1.2','业务效果优化','分析报告'],
  ['2.1','数据清洗与标注','代码与规范'], ['2.2','模型开发与测试','代码与评估'],
  ['3.1','数据分析与优化','分析与方案'], ['3.2','人机交互流程','代码与流程'],
  ['4.1','培训大纲','文书填空'], ['4.2','业务指导方案','文书填空'],
].map(([id,title,kind])=>({id,title,kind}));

function contextFor(task) {
  const context = contexts[task.code];
  return context?.exerciseVersion === task.exerciseVersion ? context : null;
}

// Keep every original line, including imports, comments and lines without blanks.
function notebook(task, answers = {}) {
  const context = contextFor(task);
  if (!context?.cells) return [];
  return context.cells.filter(cell=>cell.source.trim()).map((cell, cellIndex)=>{
    const highlighted=pythonLines(cell.source);
    return {
    id:cell.id, title:`第 ${cellIndex + 1} 部分`,
    lines:cell.source.split('\n').map((source, lineIndex)=>{
      let cursor=0, slot=0;
      const tokens=[];
      for(const match of source.matchAll(/_{5,}/g)) {
        slot++;
        const index=task.fields.findIndex(f=>f.kind==='code' && f.source.cellId===cell.id && f.source.line===lineIndex+1 && f.source.slot===slot);
        if(index<0)continue;
        const field=task.fields[index];
        tokens.push({key:tokens.length,text:source.slice(cursor,match.index),parts:sliceParts(highlighted[lineIndex],cursor,match.index),blank:false});
        tokens.push({key:tokens.length,text:answers[field.id]||'',blank:true,index,id:field.id,filled:!!answers[field.id]?.trim()});
        cursor=match.index+match[0].length;
      }
      tokens.push({key:tokens.length,text:source.slice(cursor),parts:sliceParts(highlighted[lineIndex],cursor,source.length),blank:false});
      return {id:`code-${cell.id}-${lineIndex+1}`,number:lineIndex+1,tokens};
    }),
  };});
}

function documents(task) {
  const fields=task.fields.map((field,index)=>({...field,index})).filter(f=>f.kind!=='code');
  const template=task.group==='4.1'||task.group==='4.2';
  if(template) {
    const blocks=[];
    for(const material of task.materials) {
      const documentFields=fields.filter(f=>f.source.deliverable===material.name);
      if(!documentFields.length)continue;
      let position=0;
      for(const [index,block] of (material.preview||[]).entries()) {
        const isBlank=/_{5,}/.test(block.text)||/^学习目标[：:]\s*$/.test(block.text);
        const field=isBlank?documentFields[position++]:null;
        blocks.push({id:`${material.name}-${index}`,kind:block.kind,text:block.text.replace(/_{5,}/g,'【待填写】'),field:field||null});
      }
      // Future templates without a matching preview still expose all their fields.
      for(const field of documentFields.slice(position))blocks.push({id:field.id,kind:'field',text:'',field});
    }
    return {template:true,blocks,sections:[]};
  }
  const titles={analysis_report:'数据分析报告',optimization_plan:'优化方案',numbered_response:'操作规范',full_text:'分析与优化报告'};
  const context=contextFor(task);
  const sections=[];
  for(const field of fields) {
    const name=field.source.deliverable;
    let section=sections.find(s=>s.name===name);
    if(!section) {
      const mode=context?.documents?.find(d=>d.fileName===name)?.mode;
      section={name,title:titles[mode]||(task.group==='3.2'?'交互流程说明':task.group==='2.2'?'模型评估报告':'配套报告'),fields:[]};
      sections.push(section);
    }
    section.fields.push(field);
  }
  return {template:false,blocks:[],sections};
}

function fieldContext(task, field) {
  if(field.kind==='code') {
    const cell=contextFor(task)?.cells?.find(c=>c.id===field.source.cellId);
    if(!cell)return '';
    const lines=cell.source.split('\n'),index=field.source.line-1;
    let start=Math.max(0,index-1);
    for(let i=index-1;i>=Math.max(0,index-4);i--)if(lines[i].trim().startsWith('#')){start=i;break;}
    return lines.slice(start,index+2).map((line,i)=>`${start+i+1}  ${line}`).join('\n');
  }
  const block=documents(task).blocks.find(b=>b.field?.id===field.id);
  return block?block.text.replaceAll('【待填写】','______'):(field.context||task.description);
}

module.exports={modules,contextFor,notebook,documents,fieldContext};
