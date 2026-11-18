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

/** Only one setup step: the language. Pace, rotation and video/voice come from the family's admin page. */
function next() {
  const p = S.profile;
  if (p.langs && p.langs.length && !p.uiLang) return setLang(p.langs[0]);   // family chose: go straight in
  if (!p.uiLang || !p.langs || !p.langs.length) return pickUi();
  home();
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
      <p class="hint small"><a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="/terms.html" target="_blank" rel="noopener">Terms</a> · <a href="/disclaimer.html" target="_blank" rel="noopener">Disclaimer</a></p>
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

// ─────────────────────────── language: the only setup step ───────────────────────────

const LANG_ORDER = ['vi', 'teo', 'en', 'ja'];

function pickUi() {
  render(`
    <h1 class="tri">Chọn ngôn ngữ<br>Choose your language<br>言語を選んでください</h1>
    <div class="options">${LANG_ORDER.map(l =>
      `<button class="option big-text" data-a="setLang" data-v="${l}">${LANG_NATIVE[l]}</button>`).join('')}</div>`, 'pickUi');
}

async function setLang(lang) {
  const ui = lang === 'teo' ? 'vi' : lang;                 // Teochew has no written UI: Vietnamese screens
  const cur = S.profile.langs || [];
  const langs = cur.length > 1 && cur.includes(lang) ? cur : [lang];   // keep a rotation the family set up
  render(`<div class="center"><div class="spinner"></div></div>`, 'loading');
  try { take(await api('saveProfile', { profile: { uiLang: ui, langs, tz: phoneTz() } }, k)); }
  catch (err) { return fail(err, () => setLang(lang)); }
  home();
}

// Reminders are offered after the first story is sent, never as a screen before the first question.
function needsNotify() {
  return standalone && 'Notification' in window && 'PushManager' in window &&
         Notification.permission === 'default' && !flag('skipNotify') && !!S.config.vapidPublicKey;
}

async function enableNotify() {
  const b = document.querySelector('[data-a="enableNotify"]');
  try {
    const perm = await Notification.requestPermission();   // must run inside the tap
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(S.config.vapidPublicKey) });
      await api('subscribe', { sub: sub.toJSON() }, k);
      if (b) b.textContent = tr('notifyOn');
    } else if (b) b.remove();
  } catch (err) { console.warn(err); if (b) b.remove(); }
  setFlag('skipNotify');
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
  if (p && p.trialDone) {          // Mini trial: all 12 stories told
    render(`
      <div class="center">
        <p class="big">🎉</p>
        <h1>${tr('trialDoneTitle')}</h1>
        <p class="lead">${tr('trialDoneLead')}</p>
        <a class="primary" href="/join.html?lang=${L()}&s=trial-done" style="text-decoration:none;text-align:center">${tr('trialDoneMore')}</a>
      </div>`, 'trialDone');
    return;
  }
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
  const langs = (S.profile.langs || []).length ? S.profile.langs : [L()];
  const big = p.spoken || p.display;
  // The question in the storyteller's other languages (and the app language), smaller, under the big one.
  const others = [...new Set(langs.concat([L()]))]
    .filter(l => l !== p.lang && p.text && p.text[l] && p.text[l] !== big)
    .map(l => `<p class="translation" lang="${l}">${esc(p.text[l])}</p>`).join('');
  const canHear = l => (l === p.lang && !!p.audio) || (!!TTS[l] && !!(p.text && p.text[l]));
  const hearOther = langs.filter(l => l !== p.lang && canHear(l))
    .map(l => `<button class="listen-btn alt" data-a="play" data-v="${l}">🔊 ${LANG_NATIVE[l]}</button>`).join('');
  const tip = isIOS && !standalone ? `<p class="hint small center-text">${tr('homeTip')}</p>` : '';
  render(`
    <header class="top">
      <p class="meta">${where}</p>
      <button class="link" data-a="settings">${tr('settings')}</button>
    </header>
    ${context}
    ${langs.length > 1 ? `<p class="answer-in"><span>🗣</span> ${tr('answerIn', { lang: `<b>${LANG_NATIVE[p.lang]}</b>` })}</p>` : ''}
    <h1 class="question" lang="${p.spoken ? p.lang : L()}">${esc(big)}</h1>
    ${others}
    <div class="listen">
      ${canHear(p.lang) ? `<button class="listen-btn" id="hear" data-a="play" data-v="${p.lang}">${tr('listenAgain')}</button>` : ''}
      ${hearOther}
    </div>
    <button class="primary huge" data-a="record" data-v="${kind}">
      <span class="emoji">${kind === 'video' ? '🎥' : '🎙️'}</span><span>${tr(kind === 'video' ? 'recordVideo' : 'recordAudio')}</span>
    </button>
    <p class="links center-text">
      <button class="link" data-a="record" data-v="${other}">${tr(other === 'video' ? 'orVideo' : 'orAudio')}</button> ·
      <button class="link" data-a="skip">${tr('skip')}</button>
    </p>
    ${tip}`, 'home');
  // Read the question aloud once when it appears; "Hear again" repeats it.
  if (S.spokenFor !== p.id && canHear(p.lang)) { S.spokenFor = p.id; setTimeout(() => autoSpeak(p.lang), 400); }
}

/**
 * Phones only allow sound after a tap. Right after a tap (Next question, Send, language) this plays;
 * on a cold open it may be blocked — then the "Hear again" button pulses so they know to tap it.
 */
function autoSpeak(lang) {
  if (!S.next || $('[data-screen]').dataset.screen !== 'home') return;
  const started = play(lang);
  const hint = () => { const b = $('#hear'); if (b) b.classList.add('pulse'); };
  if (started && started.catch) return started.catch(hint);
  setTimeout(() => {
    if ('speechSynthesis' in window && !speechSynthesis.speaking && !speechSynthesis.pending) hint();
  }, 1500);
}

let player;
function play(lang) {
  const p = S.next;
  if (player) { player.pause(); player = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (lang === p.lang && p.audio) {
    p.audioUrl = p.audioUrl || b64ToUrl(p.audio);
    player = new Audio(p.audioUrl);
    const b = $('#hear'); if (b) b.classList.remove('pulse');
    return player.play();
  }
  const text = p.text && p.text[lang];
  if (!text || !TTS[lang] || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TTS[lang];
  u.rate = 0.85;
  const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.onstart = () => { const b = $('#hear'); if (b) b.classList.remove('pulse'); };
  speechSynthesis.speak(u);
  return null;
}

// ─────────────────────────── record ───────────────────────────

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Record: camera on (permission asked here) → 3, 2, 1 → recording → Done. */
async function record(kind) {
  if (player) player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  clearInterval(S.timer);
  if (S.rec) S.rec.cancel();
  S.kind = kind;
  S.stage = null;
  const run = S.run = {};                                       // this attempt (Retake / Cancel start a new one)
  if (inAppBrowser() || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return mediaHelp(kind, 'inApp');
  // Before the phone's own pop-up: blocked already → straight to the fix; never asked → explain "tap Allow" once.
  const state = await permState(kind);
  if (S.run !== run) return;
  if (state === 'denied') { S.mediaErr = 'blocked before asking'; return mediaHelp(kind, 'denied'); }
  if (!consented()) return consentScreen(kind, state !== 'granted');   // once; also explains the camera pop-up
  if (state !== 'granted' && !primed()) return primer(kind);
  const p = S.next;
  render(`
    <div class="center">
      ${kind === 'video' ? '<video id="preview" playsinline muted autoplay></video>' : ''}
      <div class="rec-indicator" id="recInd">${kind === 'video' ? '' : '🎙️'}</div>
      <p class="countdown" id="count">${tr('getReady')}</p>
      <p class="timer" id="timer" hidden>0:00</p>
      <p class="hint">${esc(p.spoken || p.display)}</p>
      <button class="stop" data-a="stop" id="stopBtn" hidden aria-label="${tr('stop')}">⏹<span>${tr('stop')}</span></button>
      <button class="ghost" data-a="cancelRec" id="cancelBtn">${tr('cancel')}</button>
    </div>`, 'recording');
  try {
    S.rec = new Recorder(kind);
    await S.rec.open($('#preview'));
  } catch (err) {
    console.warn(err);
    if (S.rec) S.rec.cancel();
    if (S.run !== run) return;
    const n = (err && err.name) || '';
    S.mediaErr = `${n || 'Error'}: ${(err && err.message) || ''}`.slice(0, 120);
    if (/NotAllowed|Security|Permission/i.test(n + err.message)) return mediaHelp(kind, 'denied');
    if (/NotReadable|AbortError|TrackStart/i.test(n)) return mediaHelp(kind, 'busy');
    if (/NotFound|Overconstrained|DevicesNotFound/i.test(n)) return mediaHelp(kind, 'noCam');
    return fail(err, () => record(kind));
  }
  for (const n of [3, 2, 1]) {
    if (S.run !== run) return;
    $('#count').textContent = n;
    await wait(1000);
  }
  if (S.run !== run) return;
  try { S.rec.begin(); } catch (err) { S.rec.cancel(); return fail(err, () => record(kind)); }
  $('#count').hidden = true; $('#cancelBtn').hidden = true;
  $('#timer').hidden = false; $('#stopBtn').hidden = false;
  $('#recInd').innerHTML = `<span class="dot"></span> ${tr('recording')}`;
  S.timer = setInterval(() => {
    const s = (Date.now() - S.rec.startedAt) / 1000;
    const el = $('#timer');
    if (el) el.textContent = fmt(s);
    if (s >= S.maxSeconds) stop();
  }, 250);
}

/** 'granted' | 'denied' | 'prompt' | 'unknown' for what this recording needs (camera only matters for video). */
async function permState(kind) {
  try {
    const names = kind === 'video' ? ['camera', 'microphone'] : ['microphone'];
    const st = await Promise.all(names.map(n => navigator.permissions.query({ name: n }).then(r => r.state)));
    if (st.includes('denied')) return 'denied';
    return st.every(x => x === 'granted') ? 'granted' : 'prompt';
  } catch { return 'unknown'; }                                 // older iPhones can't tell: show the primer once
}
const primed = () => { try { return localStorage.getItem('camPrimed') === '1'; } catch { return false; } };

// ── privacy consent: ONE screen before the very first recording (or none, if the family agreed on the admin page) ──
const PRIVACY_V = '2026-11-15';                                 // = CONFIG.PRIVACY_VERSION in Code.gs
function consented() {
  if (S.profile && S.profile.consent) return true;
  try { return localStorage.getItem('consent') === PRIVACY_V; } catch { return false; }
}

function consentScreen(kind, explainPopup) {
  render(`
    <div class="center">
      <p class="big">🤝</p>
      <h1>${tr('consentTitle')}</h1>
      <ul class="consent">${tr('consentPoints').map(x => `<li>${x}</li>`).join('')}</ul>
      <a class="small-link" href="/privacy.html#${L()}" target="_blank" rel="noopener">${tr('consentMore')}</a>
      ${explainPopup ? `<p class="hint">${tr(kind === 'video' ? 'consentPopup' : 'consentPopupMic')}</p>
        <div class="fake-prompt">${tr('primerFake')}<div><span>${tr('primerDont')}</span><b>${tr('primerAllow')}</b></div></div>` : ''}
      <button class="primary huge" data-a="agree" data-v="${kind}"><span class="emoji">✅</span><span>${tr('consentAgree')}</span></button>
      <button class="ghost" data-a="home">${tr('home')}</button>
    </div>`, 'consent');
}

async function agree(kind) {
  const b = document.querySelector('[data-a="agree"]');
  if (b) b.disabled = true;
  try { await api('consent', { lang: L(), v: PRIVACY_V }, k); }
  catch (err) { console.warn('consent kept on this phone only', err); }   // never block the story over this
  if (S.profile) S.profile.consent = true;
  try { localStorage.setItem('consent', PRIVACY_V); localStorage.setItem('camPrimed', '1'); } catch {}
  record(kind);                                                 // the same tap opens the phone's camera pop-up
}

function primer(kind) {
  render(`
    <div class="center">
      <p class="big">${kind === 'video' ? '📷🎙️' : '🎙️'}</p>
      <h1>${tr(kind === 'video' ? 'primerTitle' : 'primerTitleMic')}</h1>
      <p class="lead">${tr('primerLead')}</p>
      <div class="fake-prompt">${tr('primerFake')}<div><span>${tr('primerDont')}</span><b>${tr('primerAllow')}</b></div></div>
      <button class="primary huge" data-a="primed" data-v="${kind}"><span>${tr('primerGo')}</span></button>
      <button class="ghost" data-a="home">${tr('home')}</button>
    </div>`, 'primer');
}

function cancelRec() {
  S.run = null;
  clearInterval(S.timer);
  if (S.rec) S.rec.cancel();
  S.rec = null;
  home();
}

async function stop() {
  clearInterval(S.timer);
  if (!S.rec || !S.rec.rec || S.rec.stopping) return;
  S.rec.stopping = true;
  S.blob = await S.rec.stop();
  if (!S.blob || !S.blob.size) {                        // stopped within a second: nothing was captured
    S.blob = null;
    render(`
      <div class="center">
        <p class="big">⏱</p>
        <h1>${tr('tooShort')}</h1>
        <button class="primary huge" data-a="redo"><span class="emoji">${S.kind === 'video' ? '🎥' : '🎙️'}</span><span>${tr('redo')}</span></button>
        <button class="ghost" data-a="home">${tr('home')}</button>
      </div>`, 'tooShort');
    return;
  }
  const url = URL.createObjectURL(S.blob);
  render(`
    <div class="center">
      <h1>${tr('reviewTitle')}</h1>
      <div id="playback">${S.kind === 'video'
        ? `<video src="${url}" controls playsinline></video>`
        : `<audio src="${url}" controls></audio>`}</div>
      <button class="primary huge" data-a="send"><span class="emoji">✅</span><span>${tr('send')}</span></button>
      <button class="secondary" data-a="redo">${tr('redo')}</button>
    </div>`, 'review');
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
      ${needsNotify() ? `<button class="secondary" data-a="enableNotify">🔔 ${tr('notifyBtn')}</button>` : ''}
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
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|Zalo|MicroMessenger|TikTok|Snapchat|GSA\/|; wv\)/i.test(navigator.userAgent);
}

/** One grey line for screenshots: what failed, where (iPhone/Android, Home Screen app or browser), permission state. */
async function mediaDiag(why) {
  let perm = '';
  try {
    const c = await navigator.permissions.query({ name: 'camera' });
    const m = await navigator.permissions.query({ name: 'microphone' });
    perm = ` · cam:${c.state} mic:${m.state}`;
  } catch {}
  const os = isIOS ? 'iOS ' + ((navigator.userAgent.match(/OS (\d+[_\d]*)/) || [])[1] || '').replace(/_/g, '.')
           : /Android ([\d.]+)/.test(navigator.userAgent) ? 'Android ' + navigator.userAgent.match(/Android ([\d.]+)/)[1] : 'other';
  const el = $('#diag');
  if (el) el.textContent = `${why} · ${os} · ${standalone ? 'home-screen app' : 'browser'}${perm}${S.mediaErr ? ' · ' + S.mediaErr : ''}`;
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
      <p class="hint small" id="diag" style="opacity:.6"></p>
    </div>`, 'mediaHelp');
  mediaDiag(why);
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
  setLang,
  enableNotify,
  settings: pickUi,
  play: v => { const r = play(v); if (r && r.catch) r.catch(console.warn); },
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
  cancelRec,
  agree,
  primed: v => { try { localStorage.setItem('camPrimed', '1'); } catch {} record(v); },   // this tap → the phone's pop-up
  oneMore: () => { S.extra = true; home(); },
};

app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.a];
  if (fn) fn(b.dataset.v);
});

boot();
