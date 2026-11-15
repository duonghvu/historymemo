// npm test: runs the real Apps Script code against simulated Google services (and simulated Claude/STT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockGoogle } from '../dev/mock-google.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.MOCK_TRIGGERS = '0';           // tests call afterStory() / hourly() themselves
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'historymemo-'));
const g = createMockGoogle(ROOT, dir);
const call = (action, o = {}) => g.call(JSON.stringify({ secret: g.secret(), action, ...o }));
const plan0 = { stageIdx: 0, timeline: [] };

// Record a story (fake upload) and return storyDone's answer
function record(key, extra = {}) {
  const t = call('ticket', { key, kind: 'audio', ext: 'm4a', qid: extra.qid });
  const fid = g.addItem('file', t.name, t.folderId, 'audio/mp4');
  fs.writeFileSync(g.pathOf(fid), 'x');
  return call('storyDone', { key, fileId: fid, kind: 'audio', seconds: 42, ...extra });
}

test('Apps Script load order: Code.gs runs first, so it must not use Questions.gs names at load time', async () => {
  const vm = await import('node:vm');
  const ctx = vm.createContext({});
  for (const f of ['Code.gs', 'Questions.gs']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), ctx);
  assert.equal(vm.runInContext('LIFE_TOTAL', ctx), 56);
});

test('rejects wrong secret and wrong storyteller key', () => {
  assert.equal(JSON.parse(g.ctx.doPost({ postData: { contents: '{"secret":"x","action":"storytellers"}' } }).getContent()).error, 'unauthorized');
  assert.equal(call('me', { key: 'nope' }).error, 'unauthorized');
});

test('question bank: 56 life questions + diary, en/vi/ja, every question has a life stage', () => {
  const list = call('questions', { lang: 'teo' }).list;
  assert.equal(list.length, 56 + 14);
  for (const q of list) for (const l of ['en', 'vi', 'ja']) assert.ok(q[l] && q[l].length > 5, `${q.id} ${l}`);
  assert.equal(g.ctx.promptAt_({ id: 'a', uiLang: 'en', langs: ['en'] }, 0, plan0).stage, 'early');
  assert.equal(g.ctx.promptAt_({ id: 'a', uiLang: 'en', langs: ['en'] }, 7, plan0).stage, 'roots');
});

test('languages: one per day, or switching every question', () => {
  const st = { id: 'a', uiLang: 'vi', callName: 'Ba', langs: ['teo', 'vi'], mode: 'each', start: '' };
  assert.deepEqual([0, 1, 2, 3].map(n => g.ctx.promptAt_(st, n, plan0).lang), ['teo', 'vi', 'teo', 'vi']);
  st.mode = 'daily';
  assert.deepEqual([0, 1, 2].map(n => g.ctx.promptAt_(st, n, plan0).lang), ['teo', 'teo', 'teo']); // same day
});

test('journey: 56 life questions → AI life timeline (birth → today) → diary', () => {
  const st = { id: 'a', uiLang: 'en', langs: ['en'] };
  assert.equal(g.ctx.promptAt_(st, 55, plan0).phase, 'life');
  assert.equal(g.ctx.promptAt_(st, 56, plan0).phase, 'diary');           // no AI questions yet → diary
  const plan = { stageIdx: 2, timeline: [{ stage: 'early', en: 'A', vi: 'B', ja: 'C' }, { stage: 'child', en: 'D', vi: 'E', ja: 'F' }] };
  assert.deepEqual([56, 57, 58].map(n => g.ctx.promptAt_(st, n, plan).phase), ['timeline', 'timeline', 'diary']);
  assert.equal(g.ctx.promptAt_(st, 57, plan).spoken, 'D');
});

test('progress follows answers; pace per day; one more is allowed', () => {
  const { key } = call('loginGoogle', { email: 'ba@example.org', name: 'Ba' });
  call('saveProfile', { key, profile: { uiLang: 'vi', langs: ['vi', 'teo'], mode: 'each', perDay: 2, defaultKind: 'audio' } });
  let me = call('me', { key });
  assert.equal(me.next.n, 0);
  assert.equal(me.profile.defaultKind, 'audio');
  assert.equal(me.next.spoken, 'Ba sinh ra ở đâu? Căn nhà đầu tiên ba nhớ trông như thế nào?');
  let out = record(key);
  assert.equal(out.doneToday, 1);
  assert.equal(out.next.n, 1);
  assert.equal(out.next.lang, 'teo');
  out = record(key, { stage: 'roots' });
  out = record(key);                                                     // a 3rd one today ("one more")
  assert.equal(out.doneToday, 3);
  assert.equal(out.next.n, 3);
  const stories = g.ctx.readJson_(g.ctx.findByKey_(key), 'stories.json', []);
  assert.equal(stories.length, 3);
  assert.equal(stories[1].stage, 'roots');                               // storyteller's "when did this happen" wins
  assert.match(stories[0].path, /^Tuần 01 – Tuổi thơ\//);
});

test('AI timeline is generated automatically near question 56, then diary', () => {
  const { key, profile } = call('loginGoogle', { email: 'mom@example.org', name: 'Mẹ' });
  call('saveProfile', { key, profile: { uiLang: 'en', langs: ['en'], perDay: 5 } });
  const props = JSON.parse(fs.readFileSync(path.join(dir, 'props.json')));
  const st = JSON.parse(props['ST_' + profile.id]); st.progress = 54; g.ctx.saveSt_(st);
  let out = record(key);                                                  // → 55: triggers first stage
  assert.equal(out.next.phase, 'life');
  out = record(key);                                                      // → 56
  assert.equal(out.next.phase, 'timeline');
  assert.equal(out.next.stage, 'early');
  assert.match(out.next.spoken, /AI sample/);
  const adm = call('storytellers').list.find(s => s.id === profile.id);
  assert.ok(adm.timeline >= 4);
  for (let i = 0; i < 6; i++) call('generateNow', { id: profile.id });   // all 7 stages
  const plan = g.ctx.readJson_(g.ctx.getSt_(profile.id), 'plan.json', null);
  assert.deepEqual([...new Set(plan.timeline.map(q => q.stage))], ['early', 'child', 'youth', 'young', 'middle', 'later', 'now']);
  assert.equal(g.ctx.promptAt_(g.ctx.getSt_(profile.id), 56 + plan.timeline.length, plan).phase, 'diary');
});

test('book: transcripts + chronological order from roots/birth to today', () => {
  const { profile } = call('loginGoogle', { email: 'ba@example.org' });
  assert.equal(call('transcribeNow', { id: profile.id }).done, 2);       // 3rd story is Teochew → no speech-to-text
  const book = call('buildBook', { id: profile.id, write: true });
  assert.equal(book.stories, 3);
  assert.ok(book.chapters >= 1);
  const md = fs.readFileSync(g.pathOf(g.ctx.getSt_(profile.id).bookDocId), 'utf8');
  const order = ['Cội nguồn', 'Ra đời', 'Tuổi thơ'].map(h => md.indexOf('## ' + h));
  assert.match(md, /HistoryMemo là dịch vụ độc lập/);                         // AI disclaimer at the end of the book
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], md);
  const data = call('bookData', { id: profile.id, lang: 'vi' });                // print-ready book: same order + chapters
  assert.deepEqual(data.stages.map(x => x.id), ['roots', 'early', 'child']);
  assert.equal(data.stories.length, 3);
  assert.ok(data.stages.some(x => x.chapter), 'AI chapters are kept for the print book');
  assert.ok(data.stories.every(x => x.url && x.meta), JSON.stringify(data.stories[0]));
  assert.match(data.aiNote, /độc lập/);
  const sorted = g.ctx.sortStories_([
    { stage: 'now', phase: 'diary', seq: 0, date: '2027-01-02' },
    { stage: 'child', phase: 'timeline', seq: 3, date: '2026-12-01' },
    { stage: 'child', phase: 'life', seq: 20, date: '2026-11-20' },
    { stage: 'roots', phase: 'life', seq: 7, date: '2026-11-25' },
  ]).map(s => `${s.stage}/${s.phase}`);
  assert.deepEqual(sorted, ['roots/life', 'child/life', 'child/timeline', 'now/diary']);
});

// ───────── v0.4: question Sheet, family questions, follow-ups, skip ─────────
const sheetOf = id => JSON.parse(fs.readFileSync(g.pathOf(g.ctx.getSt_(id).sheetId), 'utf8'));
const storiesOf = id => g.ctx.readJson_(g.ctx.getSt_(id), 'stories.json', []);

test('sheet: family question in any language → translated, queued first, asked once, tracked', () => {
  const { key, profile } = call('loginGoogle', { email: 'grandpa@example.org', name: 'Ông' });
  call('saveProfile', { key, profile: { uiLang: 'vi', langs: ['vi'], perDay: 3 } });
  call('updateStoryteller', { id: profile.id, fields: { followUps: 'off' } });
  const add = call('addQuestion', { id: profile.id, text: 'Ông có nhớ con tàu đưa ông vào Sài Gòn không?', by: 'Lan' });
  assert.match(add.status, /^(Queued|Next)/);
  const tabs = sheetOf(profile.id);
  assert.deepEqual(Object.keys(tabs), ['Add questions', 'All questions']);
  let me = call('me', { key });
  assert.equal(me.next.src, 'family');
  assert.equal(me.next.id, add.id);
  assert.match(me.next.text.en, /^\[en\]/);                                    // translated
  assert.equal(me.next.by, 'Lan');
  record(key, { qid: me.next.id });
  me = call('me', { key });
  assert.equal(me.next.src, undefined);                                         // back to the fixed sequence
  assert.equal(me.next.n, 0);                                                   // fixed sequence did not move
  call('syncSheet', { id: profile.id });
  const addTab = sheetOf(profile.id)['Add questions'];
  assert.match(addTab[1][3], /^Answered /);
  const all = sheetOf(profile.id)['All questions'];
  const row = all.find(r => r[1] === 'Answered');
  assert.equal(row[2], 'Family: Lan');
  assert.ok(all.some(r => r[1] === 'Next' && r[0] === '0'));
  assert.equal(all.filter(r => r[1] === 'Not asked yet').length, 55);
  const s = storiesOf(profile.id)[0];
  assert.match(s.path, /^Con cháu hỏi\//);
});

test('sheet: repeats are caught; "Ask again" re-asks; family can type a transcript (e.g. Teochew)', () => {
  const { key, profile } = call('loginGoogle', { email: 'grandpa@example.org' });
  const dup = call('addQuestion', { id: profile.id, text: 'What was your favorite game as a child?' });
  assert.match(dup.status, /^Already planned/);
  assert.equal(call('me', { key }).next.src, undefined);                        // not queued
  // family edits the "All questions" tab
  const file = g.pathOf(g.ctx.getSt_(profile.id).sheetId);
  const tabs = JSON.parse(fs.readFileSync(file, 'utf8'));
  const row = tabs['All questions'].find(r => r[1] === 'Answered');
  row[1] = 'Ask again'; row[10] = 'Typed by the family: the boat was called Hải Âu.';
  fs.writeFileSync(file, JSON.stringify(tabs));
  const out = call('syncSheet', { id: profile.id });
  assert.equal(out.again, 1); assert.equal(out.typed, 1);
  assert.equal(storiesOf(profile.id)[0].transcript, 'Typed by the family: the boat was called Hải Âu.');
  assert.equal(call('syncSheet', { id: profile.id }).again, 0);                 // only once
  const me = call('me', { key });
  assert.equal(me.next.src, 'family');
  assert.match(me.next.text.en, /boat|\[en\]/);
});

test('skip: never asked again, recorded in the Sheet; "enough for today" stops questions', () => {
  const { key, profile } = call('loginGoogle', { email: 'grandpa@example.org' });
  let me = call('me', { key });
  const out = call('skip', { key, qid: me.next.id });                           // skip the "ask again" question
  assert.equal(out.next.src, undefined);
  const base = out.next.id;
  const out2 = call('skip', { key, qid: base });                                // skip a fixed question
  assert.notEqual(out2.next.id, base);
  call('syncSheet', { id: profile.id });
  assert.equal(sheetOf(profile.id)['All questions'].filter(r => r[1] === 'Skipped').length, 2);
  assert.equal(call('rest', { key }).rest, true);
  assert.equal(call('me', { key }).rest, true);
});

test('follow-ups: Chris Voss-style, same language, right after its story, limited, stop when skipped', () => {
  const { key, profile } = call('loginGoogle', { email: 'nana@example.org', name: 'Nana' });
  call('saveProfile', { key, profile: { uiLang: 'en', langs: ['en', 'ja'], mode: 'each', perDay: 5 } });
  record(key);                                                                   // story 1 (en)
  g.ctx.afterStory();                                                            // transcribe + decide
  let me = call('me', { key });
  assert.equal(me.next.src, 'followup');
  assert.equal(me.next.lang, 'en');                                              // same language as the answer
  assert.match(me.next.about, /Where were you born/);
  assert.match(me.next.text.en, /It sounds like/);
  record(key, { qid: me.next.id });
  g.ctx.afterStory();
  me = call('me', { key });
  assert.notEqual(me.next.src, 'followup');                                     // 1 per day: no second one today
  const st = storiesOf(profile.id);
  assert.equal(st[1].sub, 1); assert.equal(st[1].root, st[0].root);
  assert.equal(st[1].path.split('/')[0], st[0].path.split('/')[0]);           // same folder as the story it continues
  const order = g.ctx.sortStories_([st[1], { ...st[0], stage: st[1].stage }]).map(s => s.sub);
  assert.deepEqual(order, [0, 1]);                                               // book: follow-up right after its story

  // A new day: a closed answer gets no follow-up; two skips pause follow-ups.
  const fresh = g.ctx.getSt_(profile.id);
  const plan = g.ctx.readPlan_(fresh); plan.fuDay = {}; g.ctx.writeJson_(fresh, 'plan.json', plan);
  const prev = g.ctx.UrlFetchApp;
  g.ctx.UrlFetchApp = { fetch: (url, o) => (url.includes('openai')
    ? { getContentText: () => JSON.stringify({ text: "I don't want to talk about that time, it was hard for us." }) }
    : prev.fetch(url, o)) };
  me = call('me', { key }); record(key, { qid: me.next.id });
  g.ctx.afterStory();
  g.ctx.UrlFetchApp = prev;
  assert.notEqual(call('me', { key }).next.src, 'followup');
  assert.match(storiesOf(profile.id).pop().followDone, /not needed/);
  me = call('me', { key }); call('skip', { key, qid: me.next.id });
  me = call('me', { key }); call('skip', { key, qid: me.next.id });
  assert.ok(g.ctx.getSt_(profile.id).followPause > g.ctx.localDate_(fresh));
  me = call('me', { key }); record(key, { qid: me.next.id });
  g.ctx.afterStory();
  assert.notEqual(call('me', { key }).next.src, 'followup');                    // paused
});

test('hourly: syncs the Sheet before reminding', () => {
  const { profile } = call('loginGoogle', { email: 'grandpa@example.org' });
  const file = g.pathOf(g.ctx.getSt_(profile.id).sheetId);
  const tabs = JSON.parse(fs.readFileSync(file, 'utf8'));
  tabs['Add questions'].push(['¿Cuál era tu canción favorita?', 'youth', 'Minh']);  // any language
  fs.writeFileSync(file, JSON.stringify(tabs));
  g.hourly();
  const row = sheetOf(profile.id)['Add questions'].pop();
  assert.match(row[3], /^(Queued|Next)/);
  assert.equal(g.ctx.readPlan_(g.ctx.getSt_(profile.id)).queue.find(q => q.id === row[4]).stage, 'youth');
});

// ───────── upload safety: resume, repeat-safe, recovered, lost, missing ─────────
function ticketOnly(key, uid, qid) { return call('ticket', { key, kind: 'video', ext: 'mp4', uid, qid, size: 3 }); }
function driveFile(t, bytes = 'abc') { const id = g.addItem('file', t.name, t.folderId, 'video/mp4'); fs.writeFileSync(g.pathOf(id), bytes); return id; }

test('storyDone: safe to repeat; refuses a file smaller than recorded', () => {
  const { key, profile } = call('loginGoogle', { email: 'up@example.org', name: 'Up' });
  call('saveProfile', { key, profile: { uiLang: 'en', langs: ['en'], perDay: 5 } });
  call('updateStoryteller', { id: profile.id, fields: { followUps: 'off' } });
  const q0 = call('me', { key }).next;
  const t = ticketOnly(key, 'phone-1', q0.id);
  const small = driveFile(t, 'a');
  const bad = call('storyDone', { key, fileId: small, uid: 'phone-1', qid: q0.id, size: 3 });
  assert.match(bad.error, /incomplete upload/);
  const fid = driveFile(t);
  const ok = call('storyDone', { key, fileId: fid, uid: 'phone-1', qid: q0.id, size: 3, kind: 'video', seconds: 9 });
  assert.equal(ok.next.n, 1);
  const again = call('storyDone', { key, fileId: fid, uid: 'phone-1', qid: q0.id, size: 3 });   // phone missed the answer, retries
  assert.equal(again.duplicate, true);
  assert.equal(storiesOf(profile.id).length, 1);
  assert.equal(call('me', { key }).next.n, 1);
});

test('recovered: file reached Drive but the phone never reported back → story logged by hourly', () => {
  const { key, profile } = call('loginGoogle', { email: 'up@example.org' });
  const q = call('me', { key }).next;
  const t = ticketOnly(key, 'phone-2', q.id);
  driveFile(t);
  const st = g.ctx.getSt_(profile.id);
  const plan = g.ctx.readPlan_(st); plan.uploads['phone2'].at -= 2 * 3600 * 1000; g.ctx.writeJson_(st, 'plan.json', plan);
  assert.equal(g.ctx.checkUploads_(st), 1);
  const s = storiesOf(profile.id).pop();
  assert.equal(s.recovered, true); assert.equal(s.id, q.id);
  assert.equal(call('me', { key }).next.n, q.n + 1);
  // the phone comes back later with the same recording: nothing doubles
  const late = call('storyDone', { key, fileId: s.fileId, uid: 'phone-2', qid: q.id, size: 3 });
  assert.equal(late.duplicate, true);
  assert.equal(Object.keys(g.ctx.readPlan_(g.ctx.getSt_(profile.id)).uploads).length, 0);
});

test('lost: never arrived → marked lost, the same question is asked again; tracked in the Sheet', () => {
  const { key, profile } = call('loginGoogle', { email: 'up@example.org' });
  const q = call('me', { key }).next;
  ticketOnly(key, 'phone-3', q.id);
  const st = g.ctx.getSt_(profile.id);
  let plan = g.ctx.readPlan_(st); assert.equal(plan.uploads['phone3'].pr.id, q.id);
  plan.uploads['phone3'].at -= 8 * 24 * 3600 * 1000; g.ctx.writeJson_(st, 'plan.json', plan);
  assert.equal(g.ctx.checkUploads_(st), 0);
  plan = g.ctx.readPlan_(g.ctx.getSt_(profile.id));
  assert.ok(plan.uploads['phone3'].lost);
  assert.equal(call('me', { key }).next.id, q.id);                              // still the next question
  call('syncSheet', { id: profile.id });
  assert.ok(sheetOf(profile.id)['All questions'].some(r => r[0] === 'phone3' && r[1] === 'Lost on the phone'));
});

test('missing: a recording that disappeared from Drive → its question is asked again', () => {
  const { key, profile } = call('loginGoogle', { email: 'up@example.org' });
  const s = storiesOf(profile.id)[0];
  g.ctx.DriveApp.getFileById(s.fileId).setTrashed(true);
  assert.equal(g.ctx.checkFiles_(g.ctx.getSt_(profile.id)), 1);
  assert.equal(g.ctx.checkFiles_(g.ctx.getSt_(profile.id)), 0);                 // only once
  const me = call('me', { key });
  assert.equal(me.next.reason, 'missing');
  assert.equal(me.next.text.en, s.question.en);
  call('buildBook', { id: profile.id });                                         // book skips the missing one
});

test('admin: delete a storyteller (and optionally trash the folder); bad time zones are ignored', () => {
  const made = call('createStoryteller', { fields: { name: 'Dup', tz: 'Central US' } });
  assert.ok(made.ok, JSON.stringify(made));
  const st = g.ctx.getSt_(made.id);
  assert.notEqual(st.tz, 'Central US');
  call('updateStoryteller', { id: made.id, fields: { tz: 'America/Chicago' } });
  assert.equal(g.ctx.getSt_(made.id).tz, 'America/Chicago');
  const folder = g.pathOf(st.folderId);
  assert.ok(fs.existsSync(folder));
  assert.equal(call('deleteStoryteller', { id: made.id, trash: true }).trashed, true);
  assert.equal(g.ctx.getSt_(made.id), null);
  assert.ok(!call('storytellers').list.some(s => s.id === made.id));
  assert.ok(!fs.existsSync(folder));
});

test('reminders follow the phone time zone: the phone sends it on every open, local hours are used', () => {
  const made = call('createStoryteller', { fields: { name: 'Tz', tz: 'Asia/Ho_Chi_Minh', perDay: 2, langs: ['en'] } });
  const key = g.ctx.getSt_(made.id).key;
  assert.equal(call('me', { key, tz: 'Central US' }).profile.tz, 'Asia/Ho_Chi_Minh');   // junk ignored
  const me = call('me', { key, tz: 'America/Chicago' });
  assert.equal(me.profile.tz, 'America/Chicago');
  assert.equal(me.profile.tzSource, 'phone');
  // the hourly job sends at the storyteller's local hours (8:00 and 19:00 in Chicago)
  const st = g.ctx.getSt_(made.id);
  st.subs = [{ endpoint: 'https://push.example/1', keys: {} }]; g.ctx.saveSt_(st);
  const hourNow = Number(g.ctx.Utilities.formatDate(new Date(), 'America/Chicago', 'H'));
  let pushed = 0;
  const realPush = g.ctx.pushTo_;
  g.ctx.pushTo_ = () => { pushed++; return { ok: true }; };
  const s2 = g.ctx.getSt_(made.id); s2.hours = [hourNow, (hourNow + 12) % 24]; g.ctx.saveSt_(s2);
  g.hourly();
  assert.equal(pushed, 1);
  g.hourly();                                                                        // same hour: not twice
  assert.equal(pushed, 1);
  const s3 = g.ctx.getSt_(made.id); s3.hours = [(hourNow + 3) % 24, (hourNow + 12) % 24]; s3.sent = {}; g.ctx.saveSt_(s3);
  g.hourly();
  assert.equal(pushed, 1);                                                           // not this local hour
  g.ctx.pushTo_ = realPush;
  call('deleteStoryteller', { id: made.id, trash: true });
});

test('family picks the languages → app language is set too, so the phone skips the language screen', () => {
  const a = call('createStoryteller', { fields: { name: 'EnVi', langs: ['en', 'vi'] } });
  assert.equal(g.ctx.getSt_(a.id).uiLang, 'en');
  const b = call('createStoryteller', { fields: { name: 'Teo', langs: ['teo'] } });
  assert.equal(g.ctx.getSt_(b.id).uiLang, 'vi');                                   // Teochew → Vietnamese screens
  const c = call('createStoryteller', { fields: { name: 'Pick' } });
  assert.equal(g.ctx.getSt_(c.id).uiLang, '');                                      // nothing chosen → they pick
  for (const x of [a, b, c]) call('deleteStoryteller', { id: x.id, trash: true });
});

test('privacy consent: given on the phone or by the family; recorded with version; current version only', () => {
  const a = call('createStoryteller', { fields: { name: 'C1', langs: ['vi'] } });
  const key = g.ctx.getSt_(a.id).key;
  assert.equal(call('me', { key }).profile.consent, false);
  assert.equal(call('consent', { key, lang: 'vi' }).ok, true);
  const st = g.ctx.getSt_(a.id);
  assert.equal(st.consent.by, 'storyteller'); assert.equal(st.consent.lang, 'vi');
  assert.equal(call('me', { key }).profile.consent, true);
  const b = call('createStoryteller', { fields: { name: 'C2', langs: ['en'], consentFamily: 'on' } });
  assert.equal(g.ctx.getSt_(b.id).consent.by, 'family');
  assert.match(call('storytellers').list.find(s => s.id === b.id).consentAt, /\(family\)$/);
  const old = g.ctx.getSt_(b.id); old.consent.v = '2000-01-01'; g.ctx.saveSt_(old);          // notice changed → ask again
  assert.equal(call('me', { key: old.key }).profile.consent, false);
  for (const x of [a, b]) call('deleteStoryteller', { id: x.id, trash: true });
});
