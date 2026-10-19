const bundled = require('../data/bundled');
const storage = require('./storage');
const { request } = require('./request');
const sha256 = require('./sha256');
let current;
let pending;
function validate(bank) {
  if (bank?.schemaVersion !== 1 || !Array.isArray(bank.questions) || !Array.isArray(bank.tasks)
    || !bank.questions.length || !bank.tasks.length || !bank.contentId) throw new Error('题库格式不兼容');
  const ids = new Set(bank.questions.map(q => q.id));
  if (ids.size !== bank.questions.length || !Array.isArray(bank.officialQuestionIds)
    || bank.officialQuestionIds.length !== 190 || bank.officialQuestionIds.some(id => !ids.has(id))) throw new Error('题库校验失败');
  for (const q of bank.questions) {
    if (!['judge','single','multi'].includes(q.type) || typeof q.stem !== 'string' || !Array.isArray(q.answer) || !Array.isArray(q.options)) throw new Error('题目格式错误');
  }
  for (const task of bank.tasks) {
    if (!task.code || !task.exerciseVersion || !task.fields?.length || task.fields.some(f => !f.id || typeof f.answer !== 'string')) throw new Error('实操格式错误');
  }
  return bank;
}
function get() {
  if (!current) {
    try { current = validate(storage.get('content', bundled)); }
    catch (_) { current = validate(bundled); }
  }
  return current;
}
async function download() {
  const origin = require('../config').apiBase;
  const manifest = await request('/api/content/manifest', { anonymous: true });
  if (manifest.schemaVersion !== 1) throw new Error('请更新小程序后获取新版题库');
  if (!/^[a-f0-9]{64}$/.test(manifest.contentId || '')) throw new Error('题库清单无效');
  const identity = JSON.stringify([manifest.contentId,manifest.theory,manifest.practical]);
  if (origin !== require('../config').apiBase) return get();
  if (get().manifestIdentity === identity) {
    storage.set('capabilities', manifest.capabilities || {});
    return get();
  }
  const load = async asset => {
    if (!/^\/content\/[\w.-]+\.json$/.test(asset?.path || '') || !/^[a-f0-9]{16}$/.test(asset.sha256Prefix || '')) throw new Error('题库地址无效');
    // Preserve the raw JSON for byte-equivalent digest verification.
    const result = await new Promise((resolve,reject)=>wx.request({
      url: origin + asset.path, dataType: 'text', responseType: 'text', timeout:15000,
      success:r=>r.statusCode===200?resolve(r.data):reject(new Error('题库下载失败')),
      fail:()=>reject(new Error('网络不可用，继续使用已下载题库')),
    }));
    if (typeof result !== 'string' || !sha256(result).startsWith(asset.sha256Prefix)) throw new Error('下载校验失败，保留原题库');
    return JSON.parse(result);
  };
  const [theory, practical] = await Promise.all([load(manifest.theory), load(manifest.practical)]);
  const next = validate({schemaVersion:1,version:manifest.version,contentId:manifest.contentId,manifestIdentity:identity,questions:theory.questions,officialQuestionIds:theory.officialQuestionIds,tasks:practical.tasks});
  if (theory.version !== manifest.version || practical.version !== manifest.version) throw new Error('题库版本不一致');
  if (origin !== require('../config').apiBase) return get();
  storage.set('content', next);
  storage.set('capabilities', manifest.capabilities || {});
  current = next;
  return next;
}
function refresh() {
  const origin = require('../config').apiBase;
  if (pending?.origin === origin) return pending.promise;
  const promise=download().finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={origin,promise};return promise;
}
module.exports = { get, refresh, validate };
