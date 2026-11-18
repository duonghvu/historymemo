// Admin analytics: visits, where people came from, sign-ups, trial users and why people leave (exit survey).
// Uses the admin key saved by admin.html (localStorage "a").
import { api } from '/common.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let a = null; try { a = localStorage.getItem('a'); } catch {}
let days = 30;

const REASON = { cost: '💰 Costs too much', trust: '🔒 Trust / privacy', noneed: '🤷 Don’t need it', later: '⏰ Not now, later', other: '✏️ Something else' };
const PAGE = { story: 'Story page', join: 'Join form', print: 'How to print', book: 'Sample book', home: 'Home', other: 'Other' };
const LANG = { en: 'English', ja: '日本語', vi: 'Tiếng Việt' };

/** Horizontal bars for a {label: count} map, biggest first (top 8, rest folded into "Other"). */
function bars(map, names = {}, max = 8, keepOrder = false) {
  const list = Object.entries(map || {});
  if (!keepOrder) list.sort((x, y) => y[1] - x[1]);
  if (!list.length) return '<p class="muted">Nothing yet.</p>';
  const top = list.slice(0, max);
  const rest = list.slice(max).reduce((s, [, n]) => s + n, 0);
  if (rest) top.push(['Other', rest]);
  const big = Math.max(1, ...top.map(([, n]) => n));
  return `<div class="hb">${top.map(([k, n]) => `<span class="l" title="${esc(names[k] || k)}">${esc(names[k] || k)}</span>
    <span class="t"><i style="width:${Math.max(2, (n / big) * 100)}%"></i></span><span class="n">${n}</span>`).join('')}</div>`;
}

/** Daily column chart (one series), with a hover label on every day. */
function columns(daily, key, since, cls = '') {
  const map = Object.fromEntries(daily.map(d => [d.day, d[key]]));
  const list = [];
  for (let t = Date.parse(since + 'T00:00:00Z'); t <= Date.now(); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    list.push([d, map[d] || 0]);
  }
  const W = 600, H = 150, pad = 22, n = list.length;
  const big = Math.max(1, ...list.map(([, v]) => v));
  const step = (W - pad) / n, bw = Math.max(2, Math.min(18, step - 2));
  const y = v => H - 18 - (v / big) * (H - 30);
  const ticks = [0, Math.ceil(big / 2), big].filter((v, i, s) => s.indexOf(v) === i);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(key)} per day">
    ${ticks.map(v => `<line class="grid-line" x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${v}</text>`).join('')}
    ${list.map(([d, v], i) => {
      const x = pad + i * step + (step - bw) / 2;
      const h = Math.max(0, H - 18 - y(v));
      return `<g data-tip="${d.slice(5)}: ${v}"><rect class="hit" x="${pad + i * step}" y="0" width="${step}" height="${H - 18}"/>
        ${v ? `<rect class="col ${cls}" x="${x}" y="${y(v)}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 2)}"/>` : ''}</g>`;
    }).join('')}
    <text x="${pad}" y="${H - 2}">${list[0][0].slice(5)}</text>
    <text x="${W}" y="${H - 2}" text-anchor="end">${list[n - 1][0].slice(5)}</text>
  </svg><div class="tip"></div></div>`;
}

function tips(root) {
  root.querySelectorAll('.chart').forEach(c => {
    const tip = c.querySelector('.tip');
    c.querySelectorAll('[data-tip]').forEach(g => {
      g.onmouseenter = g.ontouchstart = () => {
        const r = g.getBoundingClientRect(), b = c.getBoundingClientRect();
        tip.textContent = g.dataset.tip; tip.style.display = 'block';
        tip.style.left = `${r.left - b.left + r.width / 2}px`; tip.style.top = `${r.top - b.top + 20}px`;
      };
      g.onmouseleave = () => (tip.style.display = 'none');
    });
  });
}

function render(d) {
  const f = d.funnel;
  const funnel = { 'Visited the story page': f.storyVisitors, 'Opened the join form': f.joinVisitors, 'Signed up': f.signups,
                   'Recorded a first story': f.trialsStarted, 'Finished all 12': f.trialsDone };
  app.innerHTML = `
    <div class="top"><h1>📊 Analytics</h1>
      <div class="range">${[7, 30, 90].map(n => `<button data-d="${n}" class="${n === days ? 'on' : ''}">${n} days</button>`).join('')}</div></div>
    <p class="muted">Since ${esc(d.since)} · public pages only (story, join, print, sample book) · anonymous: no cookies, no IP addresses ·
      <a href="/admin.html">← Admin</a> · <a href="${esc(d.sheetUrl)}" target="_blank" rel="noopener">Open the sheet ↗</a></p>

    <div class="tiles">
      <div class="tile"><b>${d.visitors}</b><span>visitors (counted per day)</span></div>
      <div class="tile"><b>${d.views}</b><span>page views</span></div>
      <div class="tile"><b>${d.signups.count}</b><span>sign-ups</span></div>
      <div class="tile"><b>${d.trials.length}<small style="font-size:16px;color:var(--muted)">/${d.trialMax}</small></b><span>Mini trials (all time)</span></div>
      <div class="tile"><b>${f.trialsDone}</b><span>finished 12 stories</span></div>
      <div class="tile"><b>${d.exit.count}</b><span>exit answers · ${d.exit.emails} want a reminder</span></div>
    </div>

    <div class="panel"><h2>Visitors per day</h2>${columns(d.daily, 'visitors', d.since)}</div>
    <div class="panel"><h2>Sign-ups per day</h2>${columns(d.daily, 'signups', d.since, 'sec')}</div>

    <div class="grid">
      <div class="panel funnel"><h2>From visit to finished trial</h2>${bars(funnel, {}, 9, true)}
        <p class="muted">Visitors are counted per day and per page; a person who comes back tomorrow counts again.</p></div>
      <div class="panel"><h2>Why people leave</h2>${bars(d.exit.reasons, REASON)}
        ${d.exit.words.length ? `<details><summary>In their words (${d.exit.words.length})</summary>
          ${d.exit.words.map(w => `<blockquote>${esc(w.text)}<br><span class="muted">${esc(w.day)} · ${esc(REASON[w.reason] || w.reason)}</span></blockquote>`).join('')}</details>` : ''}</div>
      <div class="panel"><h2>Where they came from (QR / link)</h2>${bars(d.sources)}
        <p class="muted">"flyer" = One flyer QR, "flyer-ja" = DENKI flyer, "(none)" = typed or shared link.</p></div>
      <div class="panel"><h2>Pages</h2>${bars(d.pages, PAGE)}</div>
      <div class="panel"><h2>Countries</h2>${bars(d.countries)}</div>
      <div class="panel"><h2>Devices</h2>${bars(d.devices)}</div>
      <div class="panel"><h2>Page language</h2>${bars(d.languages, LANG)}</div>
      <div class="panel"><h2>Other websites that sent people</h2>${bars(d.referrers)}</div>
      <div class="panel"><h2>Sign-ups: would they buy?</h2>${bars(d.signups.wouldBuy)}</div>
      <div class="panel"><h2>Sign-ups by source</h2>${bars(d.signups.sources)}</div>
    </div>

    <div class="panel"><h2>Trial users</h2>
      ${d.trials.length ? `<div class="wrap"><table><tr><th>Name</th><th>Signed up</th><th>Language</th><th>Stories</th><th>Last story</th><th></th></tr>
        ${d.trials.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.since)}</td><td>${esc(LANG[t.lang] || t.lang)}</td>
          <td class="num">${t.stories}/${t.of}</td><td>${esc(t.last || '–')}</td>
          <td>${t.done ? '<span class="pill ok">finished</span>' : t.stories ? '<span class="pill">recording</span>' : '<span class="pill">not started</span>'}</td></tr>`).join('')}
      </table></div>` : '<p class="muted">No trial users yet.</p>'}</div>

    <details class="panel"><summary>Visits per day as a table</summary><div class="wrap"><table>
      <tr><th>Day</th><th>Visitors</th><th>Page views</th><th>Sign-ups</th></tr>
      ${d.daily.slice().reverse().map(x => `<tr><td>${x.day}</td><td class="num">${x.visitors}</td><td class="num">${x.views}</td><td class="num">${x.signups}</td></tr>`).join('')}
    </table></div></details>`;
  app.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => { days = Number(b.dataset.d); load(); }));
  tips(app);
}

async function load() {
  if (!a) { app.innerHTML = '<h1>📊 Analytics</h1><p>Please <a href="/admin.html">log in on the admin page</a> first, then come back.</p>'; return; }
  try { render(await api('analytics', { days }, a)); }
  catch (err) { app.innerHTML = `<h1>📊 Analytics</h1><p class="err">${esc(err.message)}</p><p><a href="/admin.html">← Admin</a></p>`; }
}
load();
