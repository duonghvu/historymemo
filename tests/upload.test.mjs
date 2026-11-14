// The phone's Drive upload (public/common.js) against a fake Drive: chunks, a dropped connection, resume.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const CHUNK = 4 * 1024 * 1024;
const drive = { sessions: {}, files: {}, failNext: 0, puts: 0 };

globalThis.fetch = async (url, o) => {
  const sid = 's' + Object.keys(drive.sessions).length;
  drive.sessions[sid] = { got: [], size: Number(o.headers['X-Upload-Content-Length']), name: JSON.parse(o.body).name };
  return { ok: true, headers: { get: h => (h === 'Location' ? `drive://${sid}` : null) } };
};
globalThis.XMLHttpRequest = class {
  constructor() { this.upload = {}; this.h = {}; }
  open(m, url) { this.url = url; }
  setRequestHeader(k, v) { this.h[k] = v; }
  getResponseHeader(k) { return (this.rh || {})[k] || null; }
  async send(body) {
    drive.puts++;
    const sess = drive.sessions[this.url.replace('drive://', '')];
    const buf = body ? Buffer.from(await body.arrayBuffer()) : null;
    if (buf && drive.failNext > 0) { drive.failNext--; return this.onerror(); }        // Wi-Fi drops mid-chunk
    const have = sess.got.reduce((n, b) => n + b.length, 0);
    if (buf) {
      const [, a] = this.h['Content-Range'].match(/bytes (\d+)-/);
      if (Number(a) === have) sess.got.push(buf);
    }
    const now = sess.got.reduce((n, b) => n + b.length, 0);
    if (now >= sess.size) { drive.files[sess.name] = Buffer.concat(sess.got); this.status = 200; this.responseText = JSON.stringify({ id: 'file-' + sess.name }); }
    else { this.status = 308; this.rh = now ? { Range: `bytes=0-${now - 1}` } : {}; }
    this.onload();
  }
};
const { uploadToDrive } = await import('../public/common.js');

test('uploads in chunks, survives a dropped connection, resumes from the last byte Drive has', async () => {
  const bytes = new Uint8Array(CHUNK * 2 + 1000).map((_, i) => i % 251);
  const blob = new Blob([bytes], { type: 'video/mp4' });
  const ticket = { token: 't', folderId: 'f', name: 'story.mp4' };
  let saved = null;
  drive.failNext = 0;
  // first try: second chunk fails
  const first = uploadToDrive(blob, ticket, () => {}, { onSession: s => { saved = s; } });
  drive.failNext = 0;
  const realSend = XMLHttpRequest.prototype.send;
  let n = 0;
  XMLHttpRequest.prototype.send = function (b) { if (++n === 2) { return this.onerror(); } return realSend.call(this, b); };
  await assert.rejects(first, /mạng/);
  XMLHttpRequest.prototype.send = realSend;
  assert.ok(saved);
  // next time the app opens: same session, asks Drive what it has, sends only the rest
  const before = drive.puts;
  const id = await uploadToDrive(blob, { ...ticket, token: 'expired' }, () => {}, { session: saved });
  assert.equal(id, 'file-story.mp4');
  assert.equal(drive.puts - before, 3);                     // status check + 2 remaining chunks, not the whole file
  assert.deepEqual(new Uint8Array(drive.files['story.mp4']), bytes);
});

test('a finished upload is not sent twice', async () => {
  const blob = new Blob([new Uint8Array(10)], { type: 'audio/mp4' });
  let saved;
  await uploadToDrive(blob, { token: 't', folderId: 'f', name: 'a.m4a' }, () => {}, { onSession: s => { saved = s; } });
  const before = drive.puts;
  assert.equal(await uploadToDrive(blob, { token: 't' }, () => {}, { session: saved }), 'file-a.m4a');
  assert.equal(drive.puts - before, 1);
});
