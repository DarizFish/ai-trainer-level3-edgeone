const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const bank=require('../data/bundled');
const cache=new Map();let manifest;let broken=false;const calls=[];
const theory=JSON.stringify({version:bank.version,questions:bank.questions,officialQuestionIds:bank.officialQuestionIds});
const practical=JSON.stringify({version:bank.version,tasks:bank.tasks});
function asset(name,body){const hash=crypto.createHash('sha256').update(body).digest('hex').slice(0,16);return {path:`/content/${name}.${hash}.json`,sha256Prefix:hash};}
global.wx={
 getStorageSync:key=>cache.has(key)?structuredClone(cache.get(key)):'',
 setStorageSync:(key,value)=>cache.set(key,structuredClone(value)),removeStorageSync:key=>cache.delete(key),
 request(options){
  const path=new URL(options.url).pathname;calls.push(path);
  const data=path==='/api/content/manifest'?manifest:path.includes('theory')?theory:broken?'corrupted download':practical;
  options.success({statusCode:200,data});
 },
};
const content=require('../utils/content');const storage=require('../utils/storage');

test('same content avoids downloads, refreshes capabilities and preserves the old bank on hash failure',async()=>{
 manifest={schemaVersion:1,version:bank.version,contentId:bank.contentId,theory:asset('theory',theory),practical:asset('practical',practical),capabilities:{idempotentSubmissions:true}};
 const first=await content.refresh();assert.equal(calls.length,3);assert.equal(first.tasks.length,40);
 manifest={...manifest,capabilities:{idempotentSubmissions:false}};calls.length=0;
 assert.equal(await content.refresh(),first);assert.deepEqual(calls,['/api/content/manifest']);
 assert.equal(storage.get('capabilities').idempotentSubmissions,false);
 broken=true;manifest={...manifest,practical:asset('practical-updated',practical+' ')};
 await assert.rejects(content.refresh(),/下载校验失败/);assert.equal(content.get(),first);
 assert.deepEqual(storage.get('content'),first);
});
