// Print-ready book (A5). book.html?sample=en|vi|ja shows a fictional sample;
// book.html?id=<storyteller>&lang=vi renders a real family's book (admin only), then "Save as PDF" → any print shop.
import { api } from '/common.js';
import { sampleBook } from '/book-sample.js';

const L = {
  en: { contents: 'Contents', stories: n => `${n} ${n === 1 ? 'story' : 'stories'}`, scan: 'Scan to hear and watch', chapter: 'Chapter',
        aiChapter: 'Written with AI from the recordings below. Their own words follow.', sample: 'SAMPLE · fictional family',
        print: '🖨️ Save as PDF / Print', how: 'How to print', made: 'Made with HistoryMemo',
        howNote: 'Scan any QR code in this book to hear the story in their own voice.', sampleQr: 'In your book, this plays the real recording.',
        login: 'Open this page from the admin page (📖 Print-ready book).' },
  vi: { contents: 'Mục lục', stories: n => `${n} câu chuyện`, scan: 'Quét để nghe và xem', chapter: 'Chương',
        aiChapter: 'Viết bằng AI từ các đoạn ghi bên dưới. Tiếp theo là lời kể nguyên văn.', sample: 'SÁCH MẪU · gia đình hư cấu',
        print: '🖨️ Lưu PDF / In', how: 'Cách in sách', made: 'Thực hiện bằng HistoryMemo',
        howNote: 'Quét mã QR bất kỳ trong sách để nghe lại câu chuyện bằng chính giọng nói.', sampleQr: 'Trong sách thật, mã này mở đoạn ghi thật.',
        login: 'Hãy mở trang này từ trang quản lý (📖 Sách để in).' },
  ja: { contents: '目次', stories: n => `${n}話`, scan: '読み取って聞く・見る', chapter: '第',
        aiChapter: '以下の録音から AI が書いた章です。続いてご本人の言葉をそのまま載せています。', sample: '見本・架空のご家族です',
        print: '🖨️ PDF 保存・印刷', how: '本の印刷方法', made: 'HistoryMemo で作成',
        howNote: '本の中の QR コードを読み取ると、ご本人の声でお話が流れます。', sampleQr: '実際の本では、ここから本人の録音が再生されます。',
        login: '管理ページ（📖 印刷用の本）から開いてください。' },
};
const ORDINAL_JA = n => `第${n}章`;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const paras = text => String(text).split(/\n{2,}|\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
function qr(url) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M'); q.addData(url); q.make();
  return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

const params = new URLSearchParams(location.search);
const sample = params.get('sample');
const root = document.getElementById('book');
const bar = document.getElementById('bar');

async function load() {
  if (sample !== null) return sampleBook(['en', 'vi', 'ja'].includes(sample) ? sample : 'en');
  const id = params.get('id');
  let a = null; try { a = localStorage.getItem('a'); } catch {}
  if (!id || !a) throw new Error(L[params.get('lang')]?.login || L.en.login);
  return api('bookData', { id, lang: params.get('lang') || undefined }, a);
}

function render(b) {
  const t = L[b.ui] || L.en;
  document.documentElement.lang = b.ui;
  document.title = `${b.title} · HistoryMemo`;
  const chapterLabel = i => b.ui === 'ja' ? ORDINAL_JA(i + 1) : `${t.chapter} ${i + 1}`;
  let n = 0;
  const count = id => b.stories.filter(s => s.stage === id).length;

  const cover = `<section class="page cover">
      ${b.sample ? `<span class="ribbon">${esc(t.sample)}</span>` : ''}
      <h1>${esc(b.title)}</h1><div class="rule"></div><p>${esc(b.sub)}</p>
      <p class="brand">HISTORYMEMO</p></section>`;

  const toc = `<section class="page"><h2 class="toc">${esc(t.contents)}</h2><ol class="toc">
      ${b.stages.map((g, i) => `<li><span class="n">${i + 1}</span><span>${esc(g.name)}</span><span class="c sans">${esc(t.stories(count(g.id)))}</span></li>`).join('')}
    </ol>
    <div class="how">${qr('https://historymemo.vercel.app/print.html')}<span>${esc(t.howNote)}</span></div></section>`;

  const chapters = b.stages.map((g, i) => `<section class="page">
      <p class="chapter-no">${esc(chapterLabel(i))}</p><h2 class="chapter">${esc(g.name)}</h2>
      ${g.chapter ? `<div class="intro">${paras(g.chapter)}</div><p class="intro-note">${esc(t.aiChapter)}</p>` : ''}
      ${b.stories.filter(s => s.stage === g.id).map(s => { n++; return `<article id="story-${n}" class="${s.sub ? 'sub' : ''}">
          <h3>${esc(s.question)}</h3>
          ${s.original ? `<p class="orig">${esc(s.original)}</p>` : ''}
          <p class="meta">${esc(s.meta)}</p>
          ${s.url ? `<div class="qr">${qr(s.url)}${esc(b.sample ? t.sampleQr : t.scan)}</div>` : ''}
          ${s.transcript ? `<blockquote>${paras(s.transcript)}</blockquote>` : ''}
        </article>`; }).join('')}
    </section>`).join('');

  const end = `<section class="page end"><p class="brand">HISTORYMEMO</p><p class="sans">${esc(t.made)} · historymemo.vercel.app</p>
      <p class="note">${esc(b.aiNote)}</p></section>`;

  root.innerHTML = cover + toc + chapters + end;

  const langs = b.sample ? ['en', 'vi', 'ja'].map(l => `<a href="?sample=${l}" class="${l === b.ui ? 'on' : ''}">${{ en: 'English', vi: 'Tiếng Việt', ja: '日本語' }[l]}</a>`).join('') : '';
  bar.innerHTML = `${langs}<button class="primary" id="print">${esc(t.print)}</button><a href="/print.html#${b.ui}">${esc(t.how)}</a>`;
  bar.hidden = false;
  document.getElementById('print').onclick = () => window.print();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

load().then(b => document.fonts.ready.then(() => render(b)))
  .catch(err => { root.innerHTML = `<p class="msg">${esc(err.message)}</p>`; });
