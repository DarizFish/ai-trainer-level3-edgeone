const {test}=require('node:test');
const assert=require('node:assert/strict');
const bank=require('../data/bundled');
const contexts=require('../data/practical-context');
const view=require('../utils/practical-view');

test('all 20 code exercises retain every original line and map all 331 blanks exactly once',()=>{
  let blanks=0,exercises=0;
  for(const task of bank.tasks){
    const fields=task.fields.filter(f=>f.kind==='code');if(!fields.length)continue;
    exercises++;
    const cells=view.notebook(task);
    assert.equal(cells.length,contexts[task.code].cells.filter(c=>c.source.trim()).length);
    const found=[];
    for(const cell of cells){
      const original=contexts[task.code].cells.find(c=>c.id===cell.id).source.split('\n');
      assert.equal(cell.lines.length,original.length);
      for(const [index,line] of cell.lines.entries()){
        for(const token of line.tokens.filter(t=>!t.blank))assert.equal(token.parts.map(p=>p.text).join(''),token.text,'Syntax coloring preserves every source character');
        const placeholders=[...original[index].matchAll(/_{5,}/g)].map(m=>m[0]);
        let slot=0;
        const rebuilt=line.tokens.map(t=>{
          if(!t.blank)return t.text;
          found.push(t.id);blanks++;
          const field=task.fields[t.index];
          assert.equal(field.source.cellId,cell.id);assert.equal(field.source.line,index+1);assert.equal(field.source.slot,slot+1);
          return placeholders[slot++];
        }).join('');
        assert.equal(rebuilt,original[index],`${task.code}/${cell.id}/${index+1}`);
        assert.equal(slot,placeholders.length);
      }
    }
    assert.deepEqual(found,fields.map(f=>f.id));
    const field=fields[0],answer='some_call("变量", 1)';
    const filled=view.notebook(task,{[field.id]:answer}).flatMap(c=>c.lines.flatMap(l=>l.tokens)).find(t=>t.id===field.id);
    assert.equal(filled.text,answer);assert.equal(filled.filled,true);
  }
  assert.equal(exercises,20);assert.equal(blanks,331);
});

test('notebook colors preserve strings and multiline context instead of highlighting their contents as code',()=>{
  const {pythonLines}=require('../utils/python-colors');
  const source='def analyze(df):\n    """if # text\nreturn documentation"""\n    value = "# for x" # note\n    return len(df) + 10';
  const lines=pythonLines(source);
  assert.equal(lines.map(line=>line.map(p=>p.text).join('')).join('\n'),source);
  assert.equal(lines[0].find(p=>p.text==='def').syntax,'keyword');
  assert.equal(lines[0].find(p=>p.text==='analyze').syntax,'definition');
  assert.equal(lines[2].find(p=>p.text.startsWith('return')).syntax,'string');
  assert.equal(lines[3].find(p=>p.text==='"# for x"').syntax,'string');
  assert.equal(lines[3].find(p=>p.text==='# note').syntax,'comment');
  assert.equal(lines[4].find(p=>p.text==='10').syntax,'number');
});

test('every text field remains editable in its full document and the 10 templates preserve the original paragraphs',()=>{
  for(const task of bank.tasks){
    const doc=view.documents(task);
    const fields=doc.template?doc.blocks.filter(b=>b.field).map(b=>b.field):doc.sections.flatMap(s=>s.fields);
    assert.deepEqual(fields.map(f=>f.id),task.fields.filter(f=>f.kind!=='code').map(f=>f.id),task.code);
    if(doc.template){
      const original=task.materials.flatMap(m=>m.preview||[]);
      assert.equal(doc.blocks.length,original.length);
      assert.equal(fields.length,5);
      assert.deepEqual(doc.blocks.map(b=>b.text),original.map(b=>b.text.replace(/_{5,}/g,'【待填写】')));
    }
  }
});

test('outdated full-code context is never paired with a newer exercise',()=>{
  const task=bank.tasks.find(t=>t.fields.some(f=>f.kind==='code'));
  assert.equal(view.contextFor({...task,exerciseVersion:'changed'}),null);
  assert.deepEqual(view.notebook({...task,exerciseVersion:'changed'}),[]);
});
