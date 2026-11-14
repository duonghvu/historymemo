// Local development server: serves public/ and runs api/*.js like Vercel does.
//
//   npm run dev:mock   → no accounts needed. Real Apps Script code, simulated Google services,
//                        recordings saved under ./local-data/drive/Shared drive/HistoryMemo/<user>/...
//   npm run dev        → uses your real Apps Script + Google Drive (values from .env.local)
//
// Open http://localhost:3000  (storyteller app)  and  http://localhost:3000/admin.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = process.argv.includes('--mock');
const PORT = Number(process.env.PORT || 3000);

// .env.local → process.env
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

let mock = null;
if (MOCK) {
  const { createMockGoogle } = await import('./mock-google.mjs');
  mock = createMockGoogle(ROOT, path.join(ROOT, 'local-data'));
  Object.assign(process.env, {
    MOCK: '1',
    GAS_URL: `http://localhost:${PORT}/__mock-gas`,
    GAS_SECRET: mock.secret(),
    ADMIN_KEY: process.env.ADMIN_KEY || 'local-admin',
  });
  delete process.env.GOOGLE_CLIENT_ID; // Google sign-in needs real credentials; mock uses "Local demo"
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4', '.m4a': 'audio/mp4',
  '.webm': 'video/webm', '.svg': 'image/svg+xml' };
const sessions = new Map();

async function readRaw(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); }

function vercelRes(res) {
  return {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { res.setHeader(k, v); return this; },
    json(o) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); },
    send(s) { res.statusCode = this.statusCode; res.end(s); },
    end(s) { res.statusCode = this.statusCode; res.end(s); },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  try {
    // ── simulated Apps Script web app ──
    if (mock && p === '/__mock-gas') {
      const body = (await readRaw(req)).toString();
      const out = mock.call(body);
      const action = JSON.parse(body).action;
      if ((action === 'ticket' || action === 'promptTicket') && out.token) out.uploadUrl = '/__mock-drive/upload';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    // ── simulated Google Drive resumable upload (chunks, "how much do you have?", resume) ──
    if (mock && p === '/__mock-drive/upload' && req.method === 'POST') {
      const meta = JSON.parse((await readRaw(req)).toString() || '{}');
      const sid = Math.random().toString(36).slice(2);
      sessions.set(sid, { meta, parts: [], received: 0, id: null });
      res.writeHead(200, { Location: `/__mock-drive/session/${sid}` });
      return res.end();
    }
    if (mock && p.startsWith('/__mock-drive/session/') && req.method === 'PUT') {
      const sess = sessions.get(p.split('/').pop());
      const data = await readRaw(req);
      if (!sess) { res.writeHead(404); return res.end(); }
      const done = () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: sess.id })); };
      const incomplete = () => {
        res.writeHead(308, sess.received ? { Range: `bytes=0-${sess.received - 1}` } : {});
        res.end();
      };
      if (sess.id) return done();
      const m = String(req.headers['content-range'] || '').match(/bytes (\*|(\d+)-(\d+))\/(\d+)/);
      const total = m ? Number(m[4]) : data.length;
      if (m && m[1] !== '*') {
        if (Number(m[2]) !== sess.received) return incomplete();           // out of order: tell the phone where we are
        sess.parts.push(data); sess.received += data.length;
      } else if (!m) { sess.parts.push(data); sess.received += data.length; }
      if (sess.received < total) return incomplete();
      const id = mock.addItem('file', sess.meta.name, sess.meta.parents[0], sess.meta.mimeType);
      fs.writeFileSync(mock.pathOf(id), Buffer.concat(sess.parts));
      sess.id = id;
      console.log(`  [mock] saved ${path.relative(ROOT, mock.pathOf(id))} (${Math.round(sess.received / 1024)} KB)`);
      return done();
    }
    // ── browse the simulated Drive ──
    if (mock && p.startsWith('/__drive')) return browse(p.split('/')[2], res);

    // ── API functions ──
    if (mock && p === '/api/dev-login') {
      const { gas } = await import(pathToFileURL(path.join(ROOT, 'api/_lib.js')));
      const out = await gas('loginGoogle', { email: 'demo@local.test', name: 'Demo' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...out, adminToken: process.env.ADMIN_KEY }));
    }
    if (p.startsWith('/api/')) {
      const file = path.join(ROOT, p + '.js');
      if (!fs.existsSync(file) || path.basename(file).startsWith('_')) { res.statusCode = 404; return res.end('not found'); }
      const raw = await readRaw(req);
      const vreq = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams),
                     body: raw.length ? JSON.parse(raw.toString()) : {} };
      const mod = await import(pathToFileURL(file) + `?t=${fs.statSync(file).mtimeMs}`);
      return mod.default(vreq, vercelRes(res));
    }

    // ── static files ──
    let f = path.join(ROOT, 'public', p === '/' ? 'index.html' : p);
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.statusCode = 404; return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

function browse(id, res) {
  const reg = mock.reg;
  if (id && reg[id] && reg[id].kind === 'sheet') {           // mock Google Sheet → HTML tables
    const tabs = JSON.parse(fs.readFileSync(mock.pathOf(id), 'utf8'));
    const cell = v => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<meta name="viewport" content="width=device-width"><body style="font:14px system-ui;padding:16px">
      <h2>📊 ${cell(reg[id].name)}</h2><p><a href="/__drive/${reg[id].parent || ''}">⬆ up</a> · Local mock: add questions
      from the admin page (on real Google Sheets the family types them in the "Add questions" tab).</p>
      ${Object.entries(tabs).map(([name, rows]) => `<h3>${cell(name)}</h3><div style="overflow:auto"><table border="1" cellpadding="4"
        style="border-collapse:collapse">${rows.map((r, i) => `<tr>${r.map(v => `<${i ? 'td' : 'th'}>${cell(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`).join('')}`);
  }
  if (id && reg[id] && reg[id].kind !== 'folder') {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(reg[id].name)] || reg[id].mime || 'application/octet-stream' });
    return fs.createReadStream(mock.pathOf(id)).pipe(res);
  }
  const kids = Object.entries(reg).filter(([, v]) => v.parent === (id || null));
  const up = id && reg[id] ? `<p><a href="/__drive/${reg[id].parent || ''}">⬆ up</a></p>` : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:16px">
    <h2>📁 ${id && reg[id] ? reg[id].name : 'Local Drive'}</h2>${up}<ul>${kids.map(([k, v]) =>
    `<li><a href="/__drive/${k}">${v.kind === 'folder' ? '📁' : v.kind === 'sheet' ? '📊' : '📄'} ${v.name}</a></li>`).join('') || '<li>(empty)</li>'}</ul>`);
}

server.listen(PORT, () => {
  console.log(`\n  HistoryMemo ${MOCK ? '(LOCAL MOCK, no Google needed)' : '(real Google backend)'}`);
  console.log(`  ▸ App:    http://localhost:${PORT}`);
  console.log(`  ▸ Admin:  http://localhost:${PORT}/admin.html?a=${MOCK ? process.env.ADMIN_KEY : '<ADMIN_KEY>'}`);
  if (MOCK) console.log(`  ▸ Files:  http://localhost:${PORT}/__drive   (also on disk: local-data/drive/)\n`);
});
