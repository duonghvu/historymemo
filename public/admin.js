import { api, Recorder, uploadToDrive, b64ToUrl, extFor, esc } from '/common.js';
import { LANG_NATIVE } from '/i18n.js';

const root = document.querySelector('#admin');
const LANGS = ['vi', 'teo', 'en', 'ja'];
const LABEL = { en: 'English', vi: 'Vietnamese', ja: 'Japanese', teo: 'Teochew' };
const STAGE_OPTS = [['roots', 'Family roots'], ['early', 'Born'], ['child', 'Childhood'], ['youth', 'Growing up'], ['young', 'Age 20–35'],
  ['middle', 'Age 35–60'], ['later', 'Later years'], ['now', 'Today'], ['legacy', 'For the grandchildren']]
  .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
let a = new URLSearchParams(location.search).get('a');
try { if (a) localStorage.setItem('a', a); else a = localStorage.getItem('a'); } catch {}
let config = {};
let promptLang = 'teo';
let promptFor = '';     // storyteller id → also list their AI-generated timeline questions
let flags = {};

init();

async function init() {
  config = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (!a) return login();
  try { await load(); } catch (err) { if (/unauthorized/i.test(err.message)) { a = null; login(); } else alert(err.message); }
}

// ───────── sign in ─────────
function login() {
  root.innerHTML = `
    <h1>HistoryMemo Admin</h1>
    <div class="panel">
      <h2>Sign in</h2>
      <p class="muted">Use a Google account listed in <code>ADMIN_EMAILS</code>, or the <code>ADMIN_KEY</code>.</p>
      <div id="gsi"></div>
      <div class="row"><input id="key" type="password" placeholder="ADMIN_KEY" style="flex:1"><button class="primary sm" id="go">Sign in</button></div>
    </div>`;
  root.querySelector('#go').onclick = () => { a = root.querySelector('#key').value.trim(); save(); init(); };
  if (config.googleClientId) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => {
      google.accounts.id.initialize({ client_id: config.googleClientId, callback: onGoogle });
      google.accounts.id.renderButton(root.querySelector('#gsi'), { theme: 'outline', size: 'large' });
    };
    document.head.append(s);
  }
}

async function onGoogle({ credential }) {
  const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
  const out = await r.json();
  if (!out.adminToken) return alert(`${out.email || 'This account'} is not in ADMIN_EMAILS.`);
  a = out.adminToken; save(); init();
}
function save() { try { localStorage.setItem('a', a); } catch {} }

// ───────── main ─────────
async function load() {
  const [{ list, ai, stt }, q] = await Promise.all([api('storytellers', {}, a), api('questions', { lang: promptLang, id: promptFor }, a)]);
  flags = { ai, stt };
  root.innerHTML = `
    <div class="row" style="justify-content:space-between"><h1>HistoryMemo Admin</h1>
      <button class="ghost sm" id="out">Sign out</button></div>

    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:center"><span>📝 Flyer sign-ups: <b id="su">…</b></span>
        <span class="row"><a class="secondary sm" href="/stats.html">📊 Analytics</a>
        <a class="secondary sm" id="su-open" target="_blank" rel="noopener" hidden>Open sign-up sheet ↗</a></span></div>
    </div>

    <div class="panel">
      <h2>Storytellers</h2>
      <p class="muted">Each storyteller gets a private link (no email needed) and their own folder in Google Drive.
        People who sign in with Google get an account automatically.
        Journey: <b>56 life questions</b> → <b>life timeline</b> (AI questions from birth to today) → <b>diary</b>.</p>
      <p class="row">
        <span class="pill ${ai ? 'ok' : ''}">${ai ? '✓' : '✗'} AI questions & chapters (ANTHROPIC_API_KEY)</span>
        <span class="pill ${stt ? 'ok' : ''}">${stt ? '✓' : '✗'} Transcripts en/vi/ja (OPENAI_API_KEY)</span>
      </p>
      <div id="sts">${list.map(card).join('') || '<p class="muted">No storytellers yet.</p>'}</div>
      <details><summary><b>＋ Add storyteller</b></summary>${form({ uiLang: 'vi', langs: ['vi'], mode: 'daily', perDay: 1, defaultKind: 'video',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, 'new')}</details>
    </div>

    <div class="panel">
      <h2>Question voices</h2>
      <p class="muted">No phone or Google voice speaks Teochew, so a family member reads each question aloud.
        English, Vietnamese and Japanese are read by the phone automatically; record them only if you want a family voice.</p>
      <div class="row">Language:
        ${LANGS.map(l => `<label class="inline"><input type="radio" name="pl" value="${l}" ${l === promptLang ? 'checked' : ''}> ${LABEL[l]}</label>`).join('')}
        <span class="pill">${q.list.filter(x => x.recorded).length}/${q.list.length} recorded</span></div>
      <div class="row">Also show AI timeline questions for:
        <select id="pfor"><option value="">(none)</option>${list.map(st => `<option value="${st.id}" ${st.id === promptFor ? 'selected' : ''}>${esc(st.name)} (${st.timeline})</option>`).join('')}</select></div>
      <div id="qs">${questions(q.list)}</div>
    </div>
    <p class="muted">Lina &amp; Daichi LLC · <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> ·
      <a href="/data-protection.html" target="_blank" rel="noopener">Data protection (GDPR)</a> ·
      <a href="/terms.html" target="_blank" rel="noopener">Terms</a> · <a href="/disclaimer.html" target="_blank" rel="noopener">Disclaimer</a> · <a href="/tokushoho.html" target="_blank" rel="noopener">特定商取引法</a> ·
      dvu@linadaichiagency.com</p>`;

  root.querySelector('#out').onclick = () => { try { localStorage.removeItem('a'); } catch {} a = null; login(); };
  api('signups', {}, a).then(out => {
    root.querySelector('#su').textContent = out.count;
    const l = root.querySelector('#su-open'); l.href = out.url; l.hidden = false;
  }).catch(() => { root.querySelector('#su').textContent = 'needs the new Apps Script version'; });
  root.querySelectorAll('[name=pl]').forEach(r => (r.onchange = () => { promptLang = r.value; load(); }));
  root.querySelector('#pfor').onchange = e => { promptFor = e.target.value; load(); };
  root.querySelectorAll('[data-do]').forEach(b => (b.onclick = () => doAction(b)));
  root.querySelectorAll('form.edit').forEach(f => (f.onsubmit = e => { e.preventDefault(); submit(f); }));
  root.querySelectorAll('form.ask').forEach(f => (f.onsubmit = e => { e.preventDefault(); ask(f); }));
  root.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => del(b)));
  root.querySelectorAll('[data-copy]').forEach(b => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => (b.textContent = 'Copied ✓'))));
  root.querySelectorAll('[data-test]').forEach(b => (b.onclick = () => testPush(b)));
  root.querySelectorAll('[data-qr]').forEach(el => {
    if (!window.qrcode) return;
    const qr = window.qrcode(0, 'M'); qr.addData(el.dataset.qr); qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
  });
  root.querySelectorAll('[data-rec]').forEach(b => (b.onclick = () => toggleRecord(b)));
  root.querySelectorAll('[data-play]').forEach(b => (b.onclick = () => playPrompt(b.dataset.play)));
}

function card(st) {
  const link = `${location.origin}/?k=${encodeURIComponent(st.key)}`;
  return `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <span class="name">${esc(st.name)}</span>
        <span class="row">
          ${st.langs.map(l => `<span class="pill">${LABEL[l]}</span>`).join('') || '<span class="pill">setup not finished</span>'}
          ${st.langs.length > 1 ? `<span class="pill">${st.mode === 'each' ? 'switch every question' : 'one language per day'}</span>` : ''}
          <span class="pill">${st.perDay}/day · ${st.hours.slice(0, st.perDay).map(h => h + ':00').join(', ')}</span>
          <span class="pill">${st.defaultKind === 'audio' ? '🎙️ voice' : '🎥 video'}</span>
          <span class="pill ${st.subscribed ? 'ok' : ''}">${st.subscribed ? '🔔 reminders on' : '🔕 reminders off'}</span>
        </span>
      </div>
      <div class="row" style="align-items:flex-start">
        <div class="qr" data-qr="${esc(link)}"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:220px">
          <code>${esc(link)}</code>
          <div class="row">
            <button class="secondary sm" data-copy="${esc(link)}">Copy link</button>
            <button class="secondary sm" data-test="${st.id}">Send test notification</button>
            <a class="sm" href="${esc(st.folderUrl)}" target="_blank" rel="noopener">Open Drive folder ↗</a>
          </div>
          <span class="muted">${st.email ? `Google: ${esc(st.email)} · ` : ''}🕗 ${esc(st.tz)} ${st.tzSource === 'phone' ? '(from their phone)' : '(set here; their phone updates it when they open the app)'} · started ${esc(st.start)}</span>
          <div class="progress"><div style="width:${Math.min(100, st.progress / 56 * 100)}%"></div></div>
          <span class="muted"><b>${st.stories}</b> stories ·
            ${st.phase === 'life' ? `life questions ${Math.min(st.progress, 56)}/56`
              : st.phase === 'timeline' ? `life timeline (${st.timeline} AI questions)` : 'diary'}
            ${st.timeline && st.phase === 'life' ? ` · ${st.timeline} AI questions ready` : ''}</span>
          <div class="row">
            <button class="primary sm" data-do="buildBook" data-id="${st.id}">📖 Make book</button>
            <a class="secondary sm button" href="/book.html?id=${encodeURIComponent(st.id)}${st.uiLang ? '&lang=' + st.uiLang : ''}" target="_blank" rel="noopener">🖨️ Print-ready book</a>
            ${flags.ai ? `<button class="secondary sm" data-do="buildBookAI" data-id="${st.id}">✍️ Book with AI-written chapters</button>
              ${st.timelineDone ? '' : `<button class="secondary sm" data-do="generateNow" data-id="${st.id}">⚡ Generate next AI questions</button>`}` : ''}
            ${flags.stt ? `<button class="secondary sm" data-do="transcribeNow" data-id="${st.id}">📝 Transcribe now</button>` : ''}
            ${st.bookUrl ? `<a class="sm" href="${esc(st.bookUrl)}" target="_blank" rel="noopener">Open book ↗</a>` : ''}
            <span class="muted" data-msg="${st.id}"></span>
          </div>
          <form class="ask row" data-id="${st.id}">
            <input name="text" required placeholder="Ask ${esc(st.name)} a question (any language: it is translated)" style="flex:3 1 260px">
            <input name="by" placeholder="Your name" style="flex:1 1 110px">
            <select name="stage" title="Life stage (optional)"><option value="">Life stage: auto</option>${STAGE_OPTS}</select>
            <button class="primary sm" type="submit">＋ Ask</button>
          </form>
          <div class="row">
            ${st.sheetUrl ? `<a class="sm" href="${esc(st.sheetUrl)}" target="_blank" rel="noopener">📊 Question Sheet ↗</a>` : ''}
            <button class="secondary sm" data-do="syncSheet" data-id="${st.id}">🔄 ${st.sheetUrl ? 'Sync Sheet now' : 'Create question Sheet'}</button>
            <span class="pill">${st.queued} waiting (family & follow-ups)</span>
            <span class="pill">${st.skipped} skipped</span>
            <span class="pill ${st.followUps ? 'ok' : ''}">${st.followUps ? (st.followPause ? `💬 follow-ups paused until ${esc(st.followPause)}` : '💬 AI follow-ups on') : 'AI follow-ups off'}</span>
          </div>
        </div>
      </div>
      <details><summary>Edit</summary>${form(st, st.id)}</details>
    </div>`;
}

function form(st, id) {
  return `
    <form class="edit" data-id="${id}">
      <div class="row">
        <label>Name (folder name)<input name="name" value="${esc(st.name || '')}" required placeholder="Ba"></label>
        <label>Vietnamese call name<input name="callName" value="${esc(st.callName || '')}" placeholder="Ba, Mẹ, Ông, Bà…"></label>
        <label>Google email (optional)<input name="email" value="${esc(st.email || '')}" placeholder="name@gmail.com"></label>
      </div>
      <div class="row">
        <label>App language<select name="uiLang">${['', 'en', 'vi', 'ja'].map(l =>
          `<option value="${l}" ${st.uiLang === l ? 'selected' : ''}>${l ? LANG_NATIVE[l] : 'Same as first story language'}</option>`).join('')}</select></label>
        <label>Language rotation<select name="mode">
          <option value="daily" ${st.mode !== 'each' ? 'selected' : ''}>One language per day</option>
          <option value="each" ${st.mode === 'each' ? 'selected' : ''}>Switch with every question</option></select></label>
        <label>Questions per day<select name="perDay">${[1, 2, 3, 5].map(n => `<option ${st.perDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Record by default<select name="defaultKind">
          <option value="video" ${st.defaultKind !== 'audio' ? 'selected' : ''}>Video</option>
          <option value="audio" ${st.defaultKind === 'audio' ? 'selected' : ''}>Voice only</option></select></label>
      </div>
      <div class="row">Story languages:
        ${LANGS.map(l => `<label class="inline"><input type="checkbox" name="langs" value="${l}" ${(st.langs || []).includes(l) ? 'checked' : ''}> ${LABEL[l]}</label>`).join('')}
      </div>
      <div class="row">
        <label>Reminder hours (local)<input name="hours" value="${esc((st.hours || []).join(', '))}" placeholder="8, 19"></label>
        <label>Time zone (their phone sets it automatically; this is only used until then)<input name="tz" list="tzs" value="${esc(st.tz || '')}" placeholder="Asia/Ho_Chi_Minh"
          pattern="(UTC|GMT|[A-Za-z]+(/[A-Za-z0-9_+\-]+)+)" title="A time zone like America/Chicago or Asia/Ho_Chi_Minh"></label>
        <label>Family emails (get each story)<input name="family" value="${esc((st.family || []).join(', '))}" placeholder="me@gmail.com, sister@gmail.com"></label>
      </div>
      <div class="row">
        <input type="hidden" name="followUps" value="off">
        <label class="inline"><input type="checkbox" name="followUps" value="on" ${st.followUps !== false ? 'checked' : ''}>
          AI follow-up questions (gentle "tell me more", at most 1 a day, pauses when they skip)</label>
      </div>
      <div class="row">
        ${st.consentAt ? `<span class="pill ok">✓ Privacy consent ${esc(st.consentAt)}</span>`
          : `<label class="inline"><input type="checkbox" name="consentFamily" value="on">
          We explained the <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a> and they agreed (the phone then skips the consent screen)</label>`}
      </div>
      <div class="row"><button class="primary sm" type="submit">${id === 'new' ? 'Create storyteller' : 'Save'}</button>
        ${id === 'new' ? '<span class="muted">Creating takes about 20 seconds (folder, story index, question Sheet).</span>'
          : `<button class="secondary sm" type="button" data-del="${esc(id)}" data-name="${esc(st.name)}">🗑 Delete storyteller</button>`}</div>
    </form>`;
}

async function submit(f) {
  const btn = f.querySelector('[type=submit]');
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = f.dataset.id === 'new' ? 'Creating… (about 20 s)' : 'Saving…';
  const d = new FormData(f);
  const fields = Object.fromEntries([...d.entries()].filter(([k2]) => k2 !== 'langs'));
  fields.langs = d.getAll('langs');
  fields.perDay = Number(fields.perDay);
  try {
    if (f.dataset.id === 'new') await api('createStoryteller', { fields }, a);
    else await api('updateStoryteller', { id: f.dataset.id, fields }, a);
    await load();
  } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = label; }
}

async function del(b) {
  const name = b.dataset.name;
  if (!confirm(`Delete storyteller "${name}"?\n\nTheir private link stops working.`)) return;
  const trash = confirm(`Also move "${name}"'s Drive folder (recordings, Sheet, book) to the trash?\n\nOK = move to trash (restorable for ~30 days)\nCancel = keep the folder`);
  b.disabled = true; b.textContent = 'Deleting…';
  try { await api('deleteStoryteller', { id: b.dataset.del, trash }, a); await load(); }
  catch (err) { alert(err.message); b.disabled = false; b.textContent = '🗑 Delete storyteller'; }
}

async function ask(f) {
  const d = Object.fromEntries(new FormData(f).entries());
  const msg = root.querySelector(`[data-msg="${f.dataset.id}"]`);
  const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Translating…';
  try {
    const out = await api('addQuestion', { id: f.dataset.id, ...d }, a);
    await load();
    root.querySelector(`[data-msg="${f.dataset.id}"]`).textContent = `Question: ${out.status}`;
  } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = '＋ Ask'; }
}

async function testPush(b) {
  b.textContent = 'Sending…';
  try {
    const out = await api('testPush', { id: b.dataset.test }, a);
    b.textContent = out.ok ? `Sent to ${out.sent} device(s) ✓` : (out.error || 'Failed');
  } catch (err) { b.textContent = err.message; }
}

// ───────── question voices ─────────
function questions(list) {
  let group = '';
  return list.map((q, i) => {
    const head = q.group !== group ? `<div class="theme">${esc((group = q.group))}</div>` : '';
    return `${head}<div class="q">
      <div><div class="t">${esc(q[promptLang === 'teo' ? 'vi' : promptLang])}</div>
        <div class="m">${esc(q.en)}</div></div>
      <div class="row">
        <span class="pill ${q.recorded ? 'ok' : ''}">${q.recorded ? '✓' : '—'}</span>
        <button class="secondary sm" data-rec="${esc(q.id)}">🎙️ Record</button>
        ${q.recorded ? `<button class="secondary sm" data-play="${esc(q.id)}">▶</button>` : ''}
      </div></div>`;
  }).join('');
}

async function doAction(b) {
  const msg = root.querySelector(`[data-msg="${b.dataset.id}"]`);
  const label = b.textContent;
  b.disabled = true; b.textContent = 'Working…';
  try {
    const act = b.dataset.do === 'buildBookAI' ? 'buildBook' : b.dataset.do;
    const out = await api(act, { id: b.dataset.id, write: b.dataset.do === 'buildBookAI' }, a);
    if (act === 'buildBook') { msg.innerHTML = `Book ready: ${out.stories} stories${out.chapters ? `, ${out.chapters} AI chapters` : ''} · <a href="${esc(out.url)}" target="_blank" rel="noopener">open ↗</a>`; }
    else if (act === 'generateNow') { await load(); return; }
    else if (act === 'syncSheet') { await load(); root.querySelector(`[data-msg="${b.dataset.id}"]`).innerHTML =
      `Sheet synced: ${out.added} new, ${out.again} ask-again, ${out.typed} transcripts typed · <a href="${esc(out.sheetUrl)}" target="_blank" rel="noopener">open ↗</a>`; return; }
    else msg.textContent = `Transcribed ${out.done}`;
  } catch (err) { msg.textContent = err.message; }
  b.disabled = false; b.textContent = label;
}

let active = null;
async function toggleRecord(btn) {
  if (active && active.btn !== btn) return;
  if (!active) {
    const rec = new Recorder('audio');
    try { await rec.start(); } catch (err) { return alert('Microphone: ' + err.message); }
    active = { rec, btn };
    btn.classList.add('rec'); btn.textContent = '⏹ Stop';
    return;
  }
  const { rec } = active;
  active = null;
  btn.textContent = 'Saving…';
  try {
    const blob = await rec.stop();
    const qid = btn.dataset.rec;
    const ticket = await api('promptTicket', { qid, lang: promptLang, ext: extFor(blob.type) }, a);
    const fileId = await uploadToDrive(blob, ticket);
    await api('promptDone', { qid, lang: promptLang, fileId }, a);
    await load();
  } catch (err) { alert('Save failed: ' + err.message); btn.classList.remove('rec'); btn.textContent = '🎙️ Record'; }
}

async function playPrompt(qid) {
  const { data } = await api('prompt', { qid, lang: promptLang }, a);
  const url = b64ToUrl(data);
  if (url) new Audio(url).play();
}
