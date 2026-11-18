// Public pages (story, join, print, sample book): one anonymous visit count, and a short "before you go" survey.
// Survey: shown once per visit — when the mouse leaves the window (computer), or on a phone when they come back to the
// tab after switching away, or after a while on the page. Never after they signed up (window.hmExit.done()).
const P = new URLSearchParams(location.search);
const page = (location.pathname.replace(/^\/|\.html$/g, '') || 'home').slice(0, 20);
const src = (P.get('s') || '').slice(0, 40);
const lang = () => (['en', 'ja', 'vi'].includes(document.documentElement.lang) ? document.documentElement.lang : 'en');
const skip = page === 'book' && !P.has('sample');   // a family's real book is private: never counted

function post(data, beacon) {
  const body = JSON.stringify(data);
  if (beacon && navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))) return Promise.resolve();
  return fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
}

const S = {
  en: { title: 'Before you go…', lead: 'What is holding you back? One tap helps us a lot.',
        r: { cost: '💰 It costs too much', trust: '🔒 I’m not sure I can trust it with our stories', noneed: '🤷 I don’t need it',
             later: '⏰ Not now, maybe later', other: '✏️ Something else' },
        other: 'Tell us in your words (optional)', mail: 'Email me one reminder later (optional)', email: 'Your email',
        when: 'Remind me in', d7: '1 week', d30: '1 month',
        consent: 'Yes, email me once about HistoryMemo. You can ask us to delete your email at any time (<a href="/privacy.html" target="_blank">Privacy</a>).',
        send: 'Send', close: 'No thanks', thanks: 'Thank you! This really helps.', remind: d => `We’ll email you once on ${d}.`,
        tell: 'Not for you? Tell us why' },
  ja: { title: 'お帰りの前に…', lead: 'ご利用をためらう理由を教えてください。ワンタップで大きな助けになります。',
        r: { cost: '💰 料金が高い', trust: '🔒 家族の話を預けるのが不安', noneed: '🤷 必要ない',
             later: '⏰ 今ではない・またいつか', other: '✏️ その他' },
        other: 'ご自由にお書きください（任意）', mail: '後日、リマインダーを1回メールで受け取る（任意）', email: 'メールアドレス',
        when: 'お知らせの時期', d7: '1週間後', d30: '1か月後',
        consent: 'DENKI（伝記）について1回だけメールを受け取ることに同意します。いつでも削除を依頼できます（<a href="/privacy.html" target="_blank">プライバシー</a>）。',
        send: '送信', close: '閉じる', thanks: 'ありがとうございます。大変参考になります。', remind: d => `${d} に1回だけお知らせします。`,
        tell: '合わない理由を教えてください' },
  vi: { title: 'Trước khi bạn đi…', lead: 'Điều gì khiến bạn còn chần chừ? Chỉ một chạm thôi cũng giúp chúng tôi rất nhiều.',
        r: { cost: '💰 Giá cao quá', trust: '🔒 Chưa yên tâm giao câu chuyện gia đình', noneed: '🤷 Tôi không cần',
             later: '⏰ Chưa phải lúc, để sau', other: '✏️ Lý do khác' },
        other: 'Bạn muốn nói thêm (không bắt buộc)', mail: 'Gửi email nhắc tôi một lần sau (không bắt buộc)', email: 'Email của bạn',
        when: 'Nhắc tôi sau', d7: '1 tuần', d30: '1 tháng',
        consent: 'Đồng ý nhận một email về HistoryMemo. Bạn có thể yêu cầu xoá email bất cứ lúc nào (<a href="/privacy.html" target="_blank">Quyền riêng tư</a>).',
        send: 'Gửi', close: 'Không, cảm ơn', thanks: 'Cảm ơn bạn! Điều này rất có ích.', remind: d => `Chúng tôi sẽ email bạn một lần vào ${d}.`,
        tell: 'Không hợp với bạn? Cho chúng tôi biết lý do' },
};

const CSS = `
.hmx-back { position: fixed; inset: 0; background: rgba(40,25,15,.45); display: flex; align-items: flex-end; justify-content: center; z-index: 50; padding: 12px; }
@media (min-width: 640px) { .hmx-back { align-items: center; } }
.hmx { background: var(--card, #fffaf1); color: var(--ink, #2a211b); border-radius: 22px; padding: 20px 18px 16px; width: 100%; max-width: 460px;
  max-height: calc(100vh - 24px); overflow: auto; box-shadow: 0 12px 40px rgba(0,0,0,.25); font-size: 17px; display: flex; flex-direction: column; gap: 10px; }
.hmx h2 { margin: 0; font-size: 22px; color: var(--red, #b3261e); }
.hmx p { margin: 0; }
.hmx .opts { display: flex; flex-direction: column; gap: 8px; }
.hmx .opts button { text-align: left; min-height: 50px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line, #e6d6bd); background: #fff;
  color: inherit; font: inherit; font-size: 16px; font-weight: 600; box-shadow: none; width: 100%; }
.hmx .opts button.on { border-color: var(--red, #b3261e); background: #fbe9e6; }
.hmx input[type=email], .hmx textarea, .hmx select { font: inherit; font-size: 16px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line, #e6d6bd);
  background: #fff; color: inherit; width: 100%; box-sizing: border-box; }
.hmx textarea { min-height: 64px; }
.hmx label { display: flex; flex-direction: column; gap: 4px; font-size: 15px; font-weight: 600; }
.hmx label.c { flex-direction: row; align-items: flex-start; gap: 8px; font-weight: 400; font-size: 14px; }
.hmx label.c input { width: 20px; height: 20px; flex: none; margin-top: 2px; }
.hmx details summary { cursor: pointer; font-weight: 600; font-size: 15px; padding: 4px 0; }
.hmx details[open] { display: flex; flex-direction: column; gap: 8px; }
.hmx .row { display: flex; gap: 8px; }
.hmx .row button { flex: 1; min-height: 48px; border-radius: 14px; font: inherit; font-weight: 700; box-shadow: none; }
.hmx .send { background: var(--red, #b3261e); color: #fff; border: 0; }
.hmx .send:disabled { opacity: .45; }
.hmx .no { background: transparent; border: 1px solid var(--line, #e6d6bd); color: inherit; }
.hmx-tell { display: block; margin: 18px auto 8px; text-align: center; font-size: 14px; color: var(--muted, #7a6a5a); background: none; border: 0;
  text-decoration: underline; cursor: pointer; box-shadow: none; width: auto; min-height: 0; padding: 6px; font-weight: 400; }
@media print { .hmx-tell, .hmx-back { display: none !important; } }`;

let shown = false, done = false;
try { shown = sessionStorage.getItem('hmx') === '1'; } catch {}

function open(force) {
  if (done || (shown && !force) || document.querySelector('.hmx-back')) return;
  shown = true;
  try { sessionStorage.setItem('hmx', '1'); } catch {}
  const t = S[lang()];
  const back = document.createElement('div');
  back.className = 'hmx-back';
  back.innerHTML = `<div class="hmx" role="dialog" aria-modal="true" aria-labelledby="hmx-t">
    <h2 id="hmx-t">${t.title}</h2><p>${t.lead}</p>
    <div class="opts">${Object.keys(t.r).map(k => `<button type="button" data-r="${k}">${t.r[k]}</button>`).join('')}</div>
    <label hidden id="hmx-o">${t.other}<textarea maxlength="300"></textarea></label>
    <details><summary>✉️ ${t.mail}</summary>
      <label>${t.email}<input type="email" autocomplete="email" maxlength="120"></label>
      <label>${t.when}<select><option value="7">${t.d7}</option><option value="30">${t.d30}</option></select></label>
      <label class="c"><input type="checkbox"><span>${t.consent}</span></label>
    </details>
    <div class="row"><button type="button" class="no">${t.close}</button><button type="button" class="send" disabled>${t.send}</button></div>
  </div>`;
  document.body.appendChild(back);
  const q = sel => back.querySelector(sel);
  let reason = '';
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  q('.no').onclick = close;
  back.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => {
    reason = b.dataset.r;
    back.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b));
    q('#hmx-o').hidden = false;
    q('.send').disabled = false;
  }));
  q('.send').onclick = async () => {
    const email = q('input[type=email]').value.trim();
    const consent = q('input[type=checkbox]').checked;
    q('.send').disabled = true;
    let remind = '';
    try {
      const r = await post({ t: 'exit', page, src, lang: lang(), reason, other: q('textarea').value.trim(),
        email: consent ? email : '', consent: consent && !!email, remindDays: Number(q('select').value) });
      remind = (await r.json().catch(() => ({}))).remind || '';
    } catch {}
    done = true;
    q('.hmx').innerHTML = `<h2>${t.thanks}</h2>${remind ? `<p>${t.remind(remind)}</p>` : ''}
      <div class="row"><button type="button" class="no">OK</button></div>`;
    q('.no').onclick = close;
    setTimeout(close, 4000);
  };
}

if (!skip) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  setTimeout(() => post({ t: 'visit', page, src, lang: lang(), ref: document.referrer ? new URL(document.referrer).hostname : '' }, true), 300);

  const start = Date.now();
  const ready = () => Date.now() - start > 8000;     // not in their first seconds
  document.addEventListener('mouseout', e => { if (!e.relatedTarget && e.clientY <= 0 && ready()) open(); });
  if (matchMedia('(pointer: coarse)').matches) {
    let left = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) left = Date.now();
      else if (left && ready()) open();                // came back after switching apps or tabs
    });
    setTimeout(() => open(), 60000);
  }
  // A quiet link at the bottom, for anyone who wants to tell us without waiting for the pop-up.
  const tell = document.createElement('button');
  tell.type = 'button';
  tell.className = 'hmx-tell';
  const label = () => (tell.textContent = S[lang()].tell);
  label();
  tell.onclick = () => open(true);
  document.body.appendChild(tell);
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

window.hmExit = { done() { done = true; document.querySelector('.hmx-tell')?.remove(); }, open: () => open(true) };
