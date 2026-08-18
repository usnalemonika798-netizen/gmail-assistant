/**
 * One-shot Telegram service check. Does not print secrets.
 * Run: node telegram_selfcheck.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const https = require('https');
const UserModel = require('./models/user.model');

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = require('http').request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getLocal(pathName, headers = {}) {
  return new Promise((resolve, reject) => {
    require('http')
      .get(
        { hostname: '127.0.0.1', port: 5000, path: pathName, headers },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        }
      )
      .on('error', reject);
  });
}

(async () => {
  const results = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your_telegram_bot_token') {
    results.push(['TOKEN', 'FAIL', 'TELEGRAM_BOT_TOKEN missing in backend/.env']);
  } else {
    results.push(['TOKEN', 'OK', 'present (hidden)']);
    try {
      const me = await getJson(`https://api.telegram.org/bot${token}/getMe`);
      if (me.body && me.body.ok) {
        results.push(['BOT getMe', 'OK', `@${me.body.result.username} id=${me.body.result.id}`]);
      } else {
        results.push(['BOT getMe', 'FAIL', JSON.stringify(me.body && me.body.description)]);
      }
    } catch (e) {
      results.push(['BOT getMe', 'FAIL', e.message]);
    }
  }

  try {
    const login = await postJson('http://127.0.0.1:5000/api/auth/login', {
      email: 'demo@college.com',
      password: 'demo123'
    });
    if (!login.body.token) {
      results.push(['LOGIN', 'FAIL', login.body.message || login.status]);
    } else {
      results.push(['LOGIN', 'OK', login.body.user.name]);
      const auth = { Authorization: `Bearer ${login.body.token}` };

      const status1 = await getLocal('/api/telegram/status', auth);
      results.push(['GET /api/telegram/status', status1.status === 200 ? 'OK' : 'FAIL', JSON.stringify(status1.body)]);

      const codeRes = await postJson('http://127.0.0.1:5000/api/telegram/link-code', {}, auth);
      if (codeRes.body && codeRes.body.code) {
        results.push(['POST /api/telegram/link-code', 'OK', `code=${codeRes.body.code}`]);
        try {
          const linked = await UserModel.linkTelegramChat(codeRes.body.code, '999001');
          results.push(['linkTelegramChat()', 'OK', `user=${linked.name} chat=999001`]);
        } catch (e) {
          results.push(['linkTelegramChat()', 'FAIL', e.message]);
        }
        const status2 = await getLocal('/api/telegram/status', auth);
        results.push([
          'status after link',
          status2.body.linked ? 'OK' : 'FAIL',
          `linked=${status2.body.linked}`
        ]);
      } else {
        results.push(['POST /api/telegram/link-code', 'FAIL', JSON.stringify(codeRes.body)]);
      }
    }
  } catch (e) {
    results.push(['API', 'FAIL', e.message]);
  }

  console.log('\n=== Telegram self-check ===');
  for (const [name, ok, detail] of results) {
    console.log(`${ok === 'OK' ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
  }
  const failed = results.filter((r) => r[1] !== 'OK').length;
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll Telegram checks passed');
  process.exit(failed ? 1 : 0);
})();
