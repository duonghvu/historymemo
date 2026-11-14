#!/usr/bin/env node
// Video biography: joins every recorded story into one movie, in life order
// (family roots → born → childhood → … → today → messages for the grandchildren),
// with a title card for each chapter and each question.
//
//   brew install ffmpeg                       (once)
//   npm run video-book -- --folder "<storyteller folder>" [--lang vi] [--out film.mp4] [--font path.ttf]
//
// <storyteller folder> = the person's folder in Google Drive, synced to your Mac with Google Drive for desktop
// (e.g. ~/Library/CloudStorage/GoogleDrive-you@gmail.com/My Drive/HistoryMemo/Ba (s1a2b3c4)),
// or locally: local-data/drive/Shared drive/HistoryMemo/<name> (<id>) after `npm run dev:mock`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const folder = arg('folder');
if (!folder || !fs.existsSync(path.join(folder, 'stories.json'))) {
  console.error('Usage: npm run video-book -- --folder "<storyteller folder containing stories.json>" [--lang vi|en|ja]');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg not found. Install it: brew install ffmpeg'); process.exit(1); }

// Reuse the stage names and the book order (sortStories_) from the Apps Script code, so book and film match.
const Q = {};
vm.runInNewContext(['Questions.gs', 'Code.gs'].map(f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')).join('\n') +
  ';Object.assign(out,{STAGES,STAGE_NAME,sortStories_});', { out: Q });

const stories = JSON.parse(fs.readFileSync(path.join(folder, 'stories.json'), 'utf8'));
const lang = arg('lang', 'vi');
const name = arg('name', path.basename(folder).replace(/\s*\(s[0-9a-f]+\)$/, ''));
const out = arg('out', path.join(folder, `video-book-${lang}.mp4`));
const TITLE = { en: `The Life of ${name}`, vi: `Chuyện đời ${name}`, ja: `${name}の物語` }[lang];
const LANG_LABEL = { en: 'English', vi: 'Tiếng Việt', ja: '日本語', teo: 'Tiếng Tiều' };

const sorted = Q.sortStories_(stories);

const font = arg('font') || [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',   // macOS: Vietnamese + Japanese
  '/Library/Fonts/Arial Unicode.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].find(f => fs.existsSync(f));
if (!font) { console.error('No font with Vietnamese/Japanese found. Pass --font /path/to/font.ttf'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'videobook-'));
const W = 1280, H = 720, FPS = 30;
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS),
             '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k'];
const q = s => `'${String(s).replace(/\\/g, '/').replace(/'/g, "'\\\\''")}'`;

function run(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'ffmpeg failed');
}

function wrap(text, max) {
  const cjk = /[　-鿿＀-￯]/.test(text);
  if (cjk) { const lines = []; for (let i = 0; i < text.length; i += Math.round(max * 0.6)) lines.push(text.slice(i, i + Math.round(max * 0.6))); return lines.join('\n'); }
  const lines = []; let line = '';
  for (const w of text.split(/\s+/)) { if ((line + ' ' + w).trim().length > max) { lines.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  if (line) lines.push(line);
  return lines.join('\n');
}

function textFilter(text, size, y, color = '0x2a211b') {
  const f = path.join(tmp, `t${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(f, text);
  return `drawtext=fontfile=${q(font)}:textfile=${q(f)}:fontsize=${size}:fontcolor=${color}:line_spacing=${Math.round(size * 0.35)}:x=(w-text_w)/2:y=${y}`;
}

let seg = 0;
const segments = [];
function card(lines, seconds, bg = '0xfbf6ee', audio) {
  const file = path.join(tmp, `s${String(seg++).padStart(4, '0')}.mp4`);
  const filters = lines.map(([text, size, y, color]) => textFilter(text, size, y, color)).join(',');
  const inputs = ['-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${seconds}:r=${FPS}`];
  if (audio) inputs.push('-i', audio); else inputs.push('-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo');
  run([...inputs, '-vf', filters, '-map', '0:v', '-map', '1:a', '-t', String(seconds), ...ENC, file]);
  segments.push(file);
}

function clip(src) {
  const file = path.join(tmp, `s${String(seg++).padStart(4, '0')}.mp4`);
  run(['-i', src, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS}`,
       '-af', 'aresample=48000', ...ENC, file]);
  segments.push(file);
}

function duration(src) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  return Math.max(1, Math.ceil(Number(r.stdout.trim()) || 1));
}

console.log(`🎬 ${TITLE}: ${sorted.length} stories → ${out}`);
card([[TITLE, 76, '(h/2)-90'], ['HistoryMemo', 34, '(h/2)+40', '0xb3261e']], 4);
let stage = '';
for (const s of sorted) {
  const src = path.join(folder, s.path);
  if (!fs.existsSync(src)) { console.warn('  skip (file not synced yet):', s.path); continue; }
  if (s.stage !== stage) {
    stage = s.stage;
    card([[Q.STAGE_NAME[stage][lang] || stage, 72, '(h-text_h)/2', '0xfbf6ee']], 3, '0xb3261e');
  }
  const question = s.question[lang] || s.question.en;
  const meta = `${s.date.slice(0, 10)} · ${LANG_LABEL[s.lang] || s.lang}`;
  if (s.kind === 'video') {
    card([[wrap(question, 34), 50, '(h-text_h)/2-30'], [meta, 28, 'h-120', '0x7a6a5d']], 4);
    clip(src);
  } else {
    // Voice story: show the question on screen while the recording plays.
    card([[wrap(question, 34), 50, '(h-text_h)/2-40'], [`♪  ${meta}`, 28, 'h-120', '0x7a6a5d']], duration(src), '0xfbf6ee', src);
  }
  console.log('  ✓', s.date, question.slice(0, 50));
}

const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, segments.map(f => `file ${q(f)}`).join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✅ Done: ${out}`);
