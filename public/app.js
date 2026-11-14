import { api, Recorder, uploadToDrive, b64ToUrl, extFor, fmt, esc, pending } from '/common.js';
import { STR, LANG_NATIVE, TTS, t } from '/i18n.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const qs = new URLSearchParams(location.search);

let k = qs.get('k');
try { if (k) localStorage.setItem('k', k); else k = localStorage.getItem('k'); } catch {}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const guessLang = () => (/^vi/i.test(navigator.language) ? 'vi' : /^ja/i.test(navigator.language) ? 'ja' : 'en');

const S = {
  config: {}, profile: null, next: null, doneToday: 0, maxSeconds: 180, extra: false,
  kind: 'video', stage: null, rec: null, blob: null, timer: null,
  draft: null, settingsMode: false, retry: null, rest: false, waiting: 0,
};
const STAGE_CHIPS = ['roots', 'child', 'youth', 'young', 'middle', 'later', 'now'];
const take = out => {
  S.profile = out.profile || S.profile; S.next = out.next; S.doneToday = out.doneToday || 0;
  if (out.rest !== undefined) S.rest = out.rest;
};
const L = () => (S.profile && S.profile.uiLang) || (S.draft && S.draft.uiLang) || guessLang();
const tr = (key, vars) => t(L(), key, vars);
const langName = code => STR[L()].langName[code];
const flag = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
const setFlag = key => { try { sessionStorage.setItem(key, '1'); } catch {} };

function render(html, name) {
  app.innerHTML = `<section class="screen" data-screen="${name}">${html}</section>`;
  document.documentElement.lang = L();
  window.scrollTo(0, 0);
}

function fail(err, retry) {
  console.error(err);
  const m = String((err && err.message) || err);
  const msg = err && err.plain ? m
            : /NotAllowed|Permission/i.test(m) ? tr('errPerm')
            : /unauthorized/i.test(m) ? tr('errKey')
            : /network|fetch|mạng/i.test(m) ? tr('errNet') : m;
  S.retry = retry || null;
  render(`
    <div class="center">
      <p class="big">😕</p>
      <h1>${tr('errTitle')}</h1>
      <p class="hint">${esc(msg)}</p>
      <button class="primary" data-a="retry">${tr('retry')}</button>
      <button class="ghost" data-a="home">${tr('home')}</button>
    </div>`, 'error');
}

// ─────────────────────────── start ───────────────────────────

async function boot() {
  render(`<div class="center"><div class="spinner"></div></div>`, 'loading');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  S.config = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (!k) return welcome();
  try {
    const me = await api('me', { tz: phoneTz() }, k);   // reminders follow the phone's time zone
    take(me); S.maxSeconds = me.maxSeconds || 180;
    S.waiting = (await pending.list()).length;
    if (S.waiting && navigator.onLine !== false) return sendWaiting();   // finish earlier stories first, by itself
  } catch (err) {
    if (/unauthorized/i.test(err.message)) { forget(); return welcome(); }
    return fail(err, boot);
  }
  next();
}

/** Decide which screen comes next during first-time setup. */
function next() {
  const p = S.profile;
  if (!p.uiLang) return pickUi();
  if (isIOS && !standalone && !flag('skipInstall')) return install();
  if (!p.langs || !p.langs.length) return startSetup();
  if (needsNotify()) return notify();
  home();
}

function needsNotify() {
  return standalone && 'Notification' in window && 'PushManager' in window &&
         Notification.permission === 'default' && !flag('skipNotify');
}

function phoneTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }

function forget() { k = null; try { localStorage.removeItem('k'); } catch {} }

// ─────────────────────────── sign in ───────────────────────────

function welcome() {
  render(`
    <div class="center welcome">
      <img src="/icon-192.png" alt="" class="logo" width="96" height="96">
      <h1>${tr('welcomeTitle')}</h1>
      <p class="lead">${tr('welcomeLead')}</p>
      <div class="lang-chips">${['en', 'vi', 'ja'].map(l =>
        `<button class="chip ${l === L() ? 'on' : ''}" data-a="welcomeLang" data-v="${l}">${LANG_NATIVE[l]}</button>`).join('')}</div>
      <p class="hint">${tr('signInHint')}</p>
      <div id="gsi"></div>
      ${S.config.mock ? `<button class="primary" data-a="demoLogin">▶ Local demo</button>` : ''}
      <p class="hint small">${tr('linkHint')}</p>
    </div>`, 'welcome');
  if (S.config.googleClientId) loadGoogle();
}

function loadGoogle() {
  const go = () => {
    window.google.accounts.id.initialize({ client_id: S.config.googleClientId, callback: onGoogle, ux_mode: 'popup' });
    window.google.accounts.id.renderButton($('#gsi'), { theme: 'filled_blue', size: 'large', shape: 'pill',
      text: 'continue_with', locale: L(), width: 300 });
  };
  if (window.google && window.google.accounts) return go();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true; s.onload = go;
  document.head.append(s);
}

async function onGoogle({ credential }) {
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ credential }) });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error);
    signedIn(out);
  } catch (err) { fail(err, welcome); }
}

async function demoLogin() {
  const r = await fetch('/api/dev-login', { method: 'POST' });
  signedIn(await r.json());
}

function signedIn(out) {
  k = out.key;
  try {
    localStorage.setItem('k', k);
    if (out.adminToken) localStorage.setItem('a', out.adminToken);
  } catch {}
  $('#manifest').href = '/api/manifest?k=' + encodeURIComponent(k);
  history.replaceState(null, '', '/?k=' + encodeURIComponent(k));
  boot();
}

// ─────────────────────────── setup steps ───────────────────────────

function pickUi() {
  render(`
    <h1 class="tri">Choose your language<br>Chọn ngôn ngữ<br>言語を選んでください</h1>
    <div class="options">${['en', 'vi', 'ja'].map(l =>
      `<button class="option big-text" data-a="setUi" data-v="${l}">${LANG_NATIVE[l]}</button>`).join('')}</div>`, 'pickUi');
}

async function setUi(lang) {
  S.profile.uiLang = lang;
  if (S.settingsMode) { S.draft.uiLang = lang; return pickLangs(); }
  try {
    const out = await api('saveProfile', { profile: { uiLang: lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }, k);
    take(out);
  } catch (err) { return fail(err, () => setUi(lang)); }
  next();
}

function install() {
  render(`
    <h1>${tr('installTitle')}</h1>
    <p class="lead">${tr('installLead')}</p>
    <ol class="steps">${tr('install').map(s => `<li>${s}</li>`).join('')}</ol>
    <button class="ghost" data-a="skipInstall">${tr('later2')}</button>`, 'install');
}

function startSetup(settings = false) {
  const p = S.profile;
  S.settingsMode = settings;
  S.draft = { uiLang: p.uiLang, langs: (p.langs || []).slice(), mode: p.mode || 'daily',
              perDay: p.perDay || 1, defaultKind: p.defaultKind || 'video' };
  if (settings) return pickUi();
  if (!S.draft.langs.length) S.draft.langs = [p.uiLang];
  pickLangs();
}

function pickLangs() {
  const d = S.draft;
  render(`
    <h1>${tr('langsTitle')}</h1>
    <p class="hint">${tr('langsHint')}</p>
    <div class="options">${['vi', 'teo', 'en', 'ja'].map(l => `
      <button class="option check ${d.langs.includes(l) ? 'on' : ''}" data-a="toggleLang" data-v="${l}" aria-pressed="${d.langs.includes(l)}">
        <span class="box"></span><span><b>${LANG_NATIVE[l]}</b>${l !== L() && l !== 'teo' ? `<small>${langName(l)}</small>` : ''}</span>
      </button>`).join('')}</div>
    <button class="primary" data-a="langsNext" ${d.langs.length ? '' : 'disabled'}>${tr('next')} →</button>`, 'langs');
}

function pickMode() {
  const [a, b] = S.draft.langs.map(langName);
  render(`
    <h1>${tr('modeTitle')}</h1>
    <div class="options">
      ${['daily', 'each'].map(m => `
        <button class="option ${S.draft.mode === m ? 'on' : ''}" data-a="setMode" data-v="${m}">
          <b>${tr(m === 'daily' ? 'modeDaily' : 'modeEach')}</b>
          <small>${tr(m === 'daily' ? 'modeDailyHint' : 'modeEachHint', { a, b })}</small>
        </button>`).join('')}
    </div>
    <p class="hint">💡 ${tr('modeWhy')}</p>`, 'mode');
}

function pickPerDay() {
  render(`
    <h1>${tr('perDayTitle')}</h1>
    <div class="options">${[1, 2, 3, 5].map((n, i) => `
      <button class="option ${S.draft.perDay === n ? 'on' : ''}" data-a="setPerDay" data-v="${n}">
        <b>${tr('perDay')[i]}</b><small>${tr('perDayHint')[i]}</small>
      </button>`).join('')}</div>
    <p class="hint">💡 ${tr('perDayMore')}</p>`, 'perDay');
}

function pickKind() {
  render(`
    <h1>${tr('kindTitle')}</h1>
    <div class="options">
      <button class="option ${S.draft.defaultKind === 'video' ? 'on' : ''}" data-a="setKind" data-v="video">
        <b>🎥 ${tr('kindVideo')}</b><small>${tr('kindVideoHint')}</small></button>
      <button class="option ${S.draft.defaultKind === 'audio' ? 'on' : ''}" data-a="setKind" data-v="audio">
        <b>🎙️ ${tr('kindAudio')}</b><small>${tr('kindAudioHint')}</small></button>
    </div>`, 'kind');
}

async function saveDraft() {
  render(`<div class="center"><div class="spinner"></div></div>`, 'loading');
  try {
    const out = await api('saveProfile', { profile: { ...S.draft, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }, k);
    take(out);
  } catch (err) { return fail(err, saveDraft); }
  const wasSettings = S.settingsMode;
  S.settingsMode = false;
  wasSettings ? home() : next();
}

function notify() {
  render(`
    <div class="center">
      <p class="big">🔔</p>
      <h1>${tr('notifyTitle')}</h1>
      <p class="lead">${tr('notifyLead')}</p>
      <button class="primary" data-a="enableNotify">${tr('notifyBtn')}</button>
      <p class="hint">${tr('notifyHint')}</p>
      <button class="ghost" data-a="skipNotify">${tr('later')}</button>
    </div>`, 'notify');
}

async function enableNotify() {
  try {
    const perm = await Notification.requestPermission();   // must run inside the tap
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(S.config.vapidPublicKey) });
      await api('subscribe', { sub: sub.toJSON() }, k);
    }
  } catch (err) { console.warn(err); }
  setFlag('skipNotify');
  home();
}

function urlB64(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// ─────────────────────────── today's question ───────────────────────────

function home() {
  if (location.search) history.replaceState(null, '', '/');
  if (S.waiting && !S.waitLater) return waitingScreen();
  if (S.rest) {
    render(`
      <div class="center">
        <p class="big">🌙</p>
        <h1>${tr('restTitle')}</h1>
        <p class="lead">${tr('restLead')}</p>
        <button class="ghost" data-a="settings">${tr('settings')}</button>
      </div>`, 'rest');
    return;
  }
  const p = S.next;
  const per = S.profile.perDay || 1;
  const kind = S.profile.defaultKind || 'video';
  const other = kind === 'video' ? 'audio' : 'video';

  if (S.doneToday >= per && !S.extra) {
    render(`
      <div class="center">
        <p class="big">🌿</p>
        <h1>${tr('allDone')}</h1>
        <p class="lead">${tr('allDoneHint')}</p>
        <button class="primary" data-a="oneMore">${tr('oneMore')}</button>
        <button class="ghost" data-a="settings">${tr('settings')}</button>
      </div>`, 'allDone');
    return;
  }

  const where = p.src === 'followup' ? `💬 ${tr('followQ')}`
              : p.src === 'family' ? `💌 ${tr('familyQ')}`
              : p.phase === 'life' ? `${esc(p.theme)} · ${tr('lifeQ', { i: p.n + 1, n: p.lifeTotal })}`
              : p.phase === 'timeline' ? `${tr('timelineQ')} · ${esc(p.theme)}` : tr('diaryQ');
  // A follow-up reminds them which story it continues; a family question says who asks.
  const context = p.src === 'followup' && p.about ? `<p class="hint">${tr('aboutPrev', { q: esc(p.about) })}</p>`
                : p.src === 'family' && p.by && !p.reason ? `<p class="hint">${tr('askedBy', { by: esc(p.by) })}</p>` : '';
  const big = p.spoken || p.display;
  const sub = p.spoken && p.spoken !== p.display ? p.display : '';
  const canListen = !!p.audio || !!TTS[p.lang];
  render(`
    <header class="top">
      <p class="meta">${where}</p>
      <button class="link" data-a="settings">${tr('settings')}</button>
    </header>
    <div class="row-between">
      <p class="answer-in"><span>🗣</span> ${tr('answerIn', { lang: `<b>${langName(p.lang)}</b>` })}</p>
      <span class="today">${tr('todayCount', { d: Math.min(S.doneToday, per), n: per })}</span>
    </div>
    ${context}
    <h1 class="question" lang="${p.spoken ? p.lang : L()}">${esc(big)}</h1>
    ${sub ? `<p class="translation">${esc(sub)}</p>` : ''}
    <div class="listen">
      ${canListen ? `<button class="listen-btn" data-a="play" data-v="${p.lang}">${tr('listen')}</button>` : ''}
      ${p.lang !== L() ? `<button class="listen-btn alt" data-a="play" data-v="${L()}">${tr('listenIn', { lang: langName(L()) })}</button>` : ''}
    </div>
    <button class="primary huge" data-a="record" data-v="${kind}">
      <span class="emoji">${kind === 'video' ? '🎥' : '🎙️'}</span><span>${tr(kind === 'video' ? 'recordVideo' : 'recordAudio')}</span>
    </button>
    <button class="secondary" data-a="record" data-v="${other}">${other === 'video' ? '🎥' : '🎙️'} ${tr(other === 'video' ? 'orVideo' : 'orAudio')}</button>
    <p class="hint center-text">${tr('shortHint')}</p>
    <button class="ghost" data-a="skip">${tr('skip')}</button>`, 'home');
}

let player;
function play(lang) {
  const p = S.next;
  if (player) { player.pause(); player = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (lang === p.lang && p.audio) {
    p.audioUrl = p.audioUrl || b64ToUrl(p.audio);
    player = new Audio(p.audioUrl);
    return player.play().catch(console.warn);
  }
  const text = p.text && p.text[lang];
  if (!text || !TTS[lang] || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TTS[lang];
  u.rate = 0.85;
  const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ─────────────────────────── record ───────────────────────────

async function record(kind) {
  if (player) player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  S.kind = kind;
  S.stage = null;
  const p = S.next;
  render(`
    <div class="center">
      ${kind === 'video' ? '<video id="preview" playsinline muted autoplay></video>'
                         : `<div class="rec-indicator"><span class="dot"></span> ${tr('recording')}</div>`}
      <p class="timer" id="timer">0:00</p>
      <p class="hint">${esc(p.spoken || p.display)}</p>
      <button class="stop" data-a="stop" aria-label="${tr('stop')}">⏹<span>${tr('stop')}</span></button>
    </div>`, 'recording');
  if (inAppBrowser() || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return mediaHelp(kind, 'inApp');
  try {
    S.rec = new Recorder(kind);
    await S.rec.start($('#preview'));
  } catch (err) {
    console.warn(err);
    if (S.rec) S.rec.cancel();
    const n = (err && err.name) || '';
    if (/NotAllowed|Security|Permission/i.test(n + err.message)) return mediaHelp(kind, 'denied');
    if (/NotReadable|AbortError|TrackStart/i.test(n)) return mediaHelp(kind, 'busy');
    if (/NotFound|Overconstrained|DevicesNotFound/i.test(n)) return mediaHelp(kind, 'noCam');
    return fail(err, () => record(kind));
  }
  S.timer = setInterval(() => {
    const s = (Date.now() - S.rec.startedAt) / 1000;
    const el = $('#timer');
    if (el) el.textContent = fmt(s);
    if (s >= S.maxSeconds) stop();
  }, 250);
}

async function stop() {
  clearInterval(S.timer);
  if (!S.rec || S.rec.stopping) return;
  S.rec.stopping = true;
  S.blob = await S.rec.stop();
  const url = URL.createObjectURL(S.blob);
  render(`
    <div class="center">
      <h1>${tr('reviewTitle')}</h1>
      <div id="playback">${S.kind === 'video'
        ? `<video src="${url}" controls playsinline></video>`
        : `<audio src="${url}" controls></audio>`}</div>
      ${whenChips()}
      <button class="primary huge" data-a="send"><span class="emoji">✅</span><span>${tr('send')}</span></button>
      <button class="ghost" data-a="redo">${tr('redo')}</button>
    </div>`, 'review');
}

function whenChips() {
  const def = S.stage || ({ early: 'child', legacy: '' }[S.next.stage] ?? S.next.stage);
  return `
    <div class="when">
      <p class="when-title">${tr('whenTitle')}</p>
      <div class="chips">${STAGE_CHIPS.map(st => `
        <button class="chip ${st === def ? 'on' : ''}" data-a="setStage" data-v="${st}">${tr('stage')[st]}</button>`).join('')}</div>
      <p class="hint small">${tr('whenHint')}</p>
    </div>`;
}

async function send() {
  if (!S.blob || S.sending) return;
  // 1. Keep it on the phone first, so nothing is lost if the connection or the app drops.
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, blob: S.blob, kind: S.kind,
                 seconds: S.rec.seconds, qid: S.next.id, stage: S.stage || undefined, at: Date.now() };
  if (!(await pending.save(item))) S.unsaved = item;   // no phone storage (e.g. private mode): keep it in memory
  S.blob = null;
  // 2. Upload to Drive, then tell the server; only then forget the phone copy.
  S.sending = true;
  try { await upload(item); } catch (err) {
    console.warn(err);
    S.sending = false; S.failures = (S.failures || 0) + 1;
    S.waiting = (await waitingList()).length;
    return fail(safeErr(), sendWaiting);
  }
  S.sending = false;
  thanks();
}

/**
 * Send one recording, continuing where an earlier try stopped. Progress is saved on the phone after each step:
 *   item.session  Drive upload session (resume from the last byte Drive has)
 *   item.fileId   Drive has the whole file; only the "story done" call is left
 * The phone copy is deleted only after the server has logged the story (storyDone is safe to repeat).
 */
async function upload(item) {
  render(`
    <div class="center">
      <h1>${tr('sending')}</h1>
      <div class="bar"><div id="barFill"></div></div>
      <p class="hint">${tr('dontClose')}</p>
    </div>`, 'uploading');
  const bar = f => { const b = $('#barFill'); if (b) b.style.width = `${Math.max(3, f * 100)}%`; };
  const keep = () => (S.unsaved === item ? null : pending.save(item));
  item.tries = (item.tries || 0) + 1;
  if (!item.fileId) {
    const ticket = await api('ticket', { kind: item.kind, ext: extFor(item.blob.type), qid: item.qid, uid: item.id, size: item.blob.size }, k);
    item.fileId = await uploadToDrive(item.blob, ticket, bar, {
      session: item.session,
      onSession: async url => { item.session = url; await keep(); },
    });
    await keep();
  }
  let out;
  try {
    out = await api('storyDone', { fileId: item.fileId, kind: item.kind, seconds: item.seconds, stage: item.stage,
                                   qid: item.qid, uid: item.id, size: item.blob.size }, k);
  } catch (err) {
    if (/incomplete upload/i.test(err.message)) { item.fileId = null; item.session = null; await keep(); }  // send it all again
    throw err;
  }
  take(out);
  await pending.remove(item.id);
  if (S.unsaved === item) S.unsaved = null;
  S.waiting = Math.max(0, S.waiting - 1);
}

function thanks() {
  const more = S.doneToday < (S.profile.perDay || 1);
  render(`
    <div class="center">
      <p class="big">❤️</p>
      <h1>${tr('thanks', { name: esc(S.profile.callName || '') })}</h1>
      <p class="lead">${tr('saved')}</p>
      ${more ? `<button class="primary" data-a="home">${tr('nextQ')} →</button>`
             : `<p class="hint">${tr('allDone')}</p><button class="secondary" data-a="oneMore">${tr('oneMore')}</button>`}
      <button class="ghost" data-a="rest">${tr('enough')}</button>
    </div>`, 'done');
}

const waitingList = async () => {
  const list = await pending.list();
  return S.unsaved && !list.some(i => i.id === S.unsaved.id) ? list.concat([S.unsaved]) : list;
};
const safeErr = () => Object.assign(new Error(tr('safeOnPhone')), { plain: true });

/** Stories recorded earlier that are still only on this phone. */
function waitingScreen() {
  render(`
    <div class="center">
      <p class="big">📦</p>
      <h1>${S.waiting > 1 ? tr('pendingTitleN', { n: S.waiting }) : tr('pendingTitle')}</h1>
      <p class="lead">${tr('pendingLead')}</p>
      <button class="primary huge" data-a="sendWaiting"><span class="emoji">✅</span><span>${tr('sendNow')}</span></button>
      ${S.failures >= 2 ? `<button class="ghost" data-a="waitLater">${tr('later')}</button>` : ''}
    </div>`, 'waiting');
}

async function sendWaiting() {
  if (S.sending) return;
  S.sending = true;
  try {
    for (const item of await waitingList()) await upload(item);
  } catch (err) {
    console.warn(err);
    S.sending = false;
    S.failures = (S.failures || 0) + 1;
    S.waiting = (await waitingList()).length;
    return fail(safeErr(), sendWaiting);
  }
  S.sending = false; S.failures = 0; S.waiting = 0; S.waitLater = false;
  thanks();
}

// Back online (e.g. Wi-Fi again): finish sending without a tap, unless they are in the middle of something.
window.addEventListener('online', () => {
  const screen = (document.querySelector('[data-screen]') || {}).dataset || {};
  if (S.waiting && ['waiting', 'error', 'home'].includes(screen.screen)) sendWaiting();
});

async function skip() {
  if (player) player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  try { take(await api('skip', { qid: S.next.id }, k)); } catch (err) { return fail(err, skip); }
  render(`
    <div class="center">
      <p class="big">🙂</p>
      <h1>${tr('skippedTitle')}</h1>
      <p class="lead">${tr('skippedLead')}</p>
      <button class="primary" data-a="anotherQ">${tr('anotherQ')} →</button>
      <button class="ghost" data-a="rest">${tr('enough')}</button>
    </div>`, 'skipped');
}

async function rest() {
  try { take(await api('rest', {}, k)); } catch (err) { return fail(err, rest); }
  S.extra = false;
  home();
}

// ─────────────────────────── camera / microphone help ───────────────────────────

/** Built-in browsers of chat/social apps usually block the camera: ask to open in Safari instead. */
function inAppBrowser() {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|Zalo|MicroMessenger|TikTok|Snapchat|GSA\//i.test(navigator.userAgent);
}

function mediaHelp(kind, why) {
  const steps = why === 'inApp' ? tr('inAppSteps') : why === 'denied' ? tr(isIOS ? 'permIOS' : 'permAndroid') : [];
  const title = { inApp: 'inAppTitle', denied: 'permTitle', busy: 'busyTitle', noCam: 'noCamTitle' }[why];
  const lead = { inApp: 'inAppLead', denied: 'permLead', busy: 'busyLead', noCam: 'noCamLead' }[why];
  render(`
    <div class="center">
      <p class="big">${why === 'inApp' ? '🧭' : '📷'}</p>
      <h1>${tr(title)}</h1>
      <p class="lead">${tr(lead)}</p>
      ${steps.length ? `<ol class="steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      ${why === 'inApp' ? `<button class="primary" data-a="copyLink">${tr('copyLink')}</button>`
                        : why !== 'noCam' ? `<button class="primary" data-a="record" data-v="${kind}">${tr('tryAgain')}</button>` : ''}
      ${kind === 'video' && why !== 'inApp' ? `<button class="secondary" data-a="record" data-v="audio">${tr('voiceOnly')}</button>` : ''}
      <button class="ghost" data-a="home">${tr('home')}</button>
    </div>`, 'mediaHelp');
}

async function copyLink() {
  const link = `${location.origin}/?k=${encodeURIComponent(k || '')}`;
  try { await navigator.clipboard.writeText(link); } catch {
    const t = document.createElement('textarea'); t.value = link; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch {} t.remove();
  }
  const b = document.querySelector('[data-a="copyLink"]');
  if (b) b.textContent = tr('copied');
}

// ─────────────────────────── buttons ───────────────────────────

const actions = {
  retry: () => (S.retry || boot)(),
  home: () => (S.profile ? (S.extra = S.doneToday >= (S.profile.perDay || 1) ? S.extra : false, home()) : boot()),
  welcomeLang: v => { S.draft = { uiLang: v }; welcome(); },
  demoLogin,
  setUi,
  skipInstall: () => { setFlag('skipInstall'); next(); },
  toggleLang: v => {
    const l = S.draft.langs;
    l.includes(v) ? l.splice(l.indexOf(v), 1) : l.push(v);
    pickLangs();
  },
  langsNext: () => (S.draft.langs.length > 1 ? pickMode() : pickPerDay()),
  setMode: v => { S.draft.mode = v; pickPerDay(); },
  setPerDay: v => { S.draft.perDay = Number(v); pickKind(); },
  setKind: v => { S.draft.defaultKind = v; saveDraft(); },
  enableNotify,
  skipNotify: () => { setFlag('skipNotify'); home(); },
  settings: () => startSetup(true),
  play,
  record,
  stop,
  send,
  sendWaiting,
  copyLink,
  waitLater: () => { S.waitLater = true; home(); },   // keep it on the phone, carry on; it is sent next time
  skip,
  rest,
  anotherQ: () => { S.extra = true; home(); },
  redo: () => record(S.kind),
  oneMore: () => { S.extra = true; home(); },
  setStage: v => {
    S.stage = v;
    document.querySelectorAll('[data-a="setStage"]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  },
};

app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.a];
  if (fn) fn(b.dataset.v);
});

boot();
