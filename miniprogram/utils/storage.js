const PREFIX = 'aitrainer:v1:';
function get(key, fallback) {
  const value = wx.getStorageSync(PREFIX + key);
  return value === '' || value === undefined || value === null ? fallback : value;
}
function set(key, value) {
  try { wx.setStorageSync(PREFIX + key, value); }
  catch (_) { throw new Error('本机存储空间不足，请先整理空间；本次内容尚未保存。'); }
  return value;
}
function remove(key) { wx.removeStorageSync(PREFIX + key); }
function owner() { return (get('session', null) || {}).email || 'guest'; }
function key(name, user) { return `${name}:${encodeURIComponent(user || owner())}`; }
function id() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }
module.exports = { get, set, remove, owner, key, id };
