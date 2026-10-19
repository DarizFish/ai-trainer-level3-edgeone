const config = require('../config');
const storage = require('./storage');
class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}
function sessionCookie(response) {
  const headers = response.header || {};
  const raw = response.cookies || headers['Set-Cookie'] || headers['set-cookie'] || [];
  const value = (Array.isArray(raw) ? raw : [raw]).join('; ');
  return /(?:^|[;,]\s*)ai_trainer_session=([A-Za-z0-9_-]{43})(?:;|,|$)/.exec(value)?.[1] || null;
}
function request(path, options) {
  const opts = options || {};
  if (!path.startsWith('/') || path.startsWith('//')) return Promise.reject(new Error('请求地址无效'));
  const session = opts.anonymous ? null : storage.get('session', null);
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.apiBase + path, method: opts.method || 'GET', data: opts.data,
      timeout: 15000,
      header: Object.assign({ 'content-type': 'application/json', Accept: 'application/json' },
        session?.cookie ? { Cookie: `ai_trainer_session=${session.cookie}` } : {}),
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (response.statusCode === 401 && session && storage.get('session', null)?.cookie === session.cookie) {
            storage.set('session', Object.assign({}, session, { expired: true }));
          }
          reject(new ApiError(response.data?.error || '服务暂时不可用，请稍后重试', response.statusCode, response.data));
          return;
        }
        resolve(opts.raw ? response : response.data);
      },
      fail() { reject(new ApiError('网络连接失败，内容仍保存在本机', 0)); },
    });
  });
}
async function signIn(mode, fields) {
  const response = await request(`/api/auth/${mode}`, { method: 'POST', data: fields, anonymous: true, raw: true });
  const cookie = sessionCookie(response);
  if (!cookie || !response.data?.user?.email) throw new Error('没有收到有效登录凭证，请重试');
  storage.set('session', Object.assign({}, response.data.user, { cookie, expired: false }));
  return response.data.user;
}
async function signOut() {
  await request('/api/auth/logout', { method: 'POST', data: {} });
  storage.remove('session');
}
module.exports = { request, signIn, signOut, sessionCookie, ApiError };
