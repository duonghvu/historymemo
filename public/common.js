// Shared by the father's page and the admin page.

export async function api(action, payload = {}, k) {
  const r = await fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ k, action, ...payload }),
  });
  const out = await r.json().catch(() => ({ error: 'Máy chủ không trả lời' }));
  if (!r.ok || out.error) throw new Error(out.error || r.statusText);
  return out;
}

/** Pick a recording format the browser supports (iPhone Safari → mp4). */
export function pickMime(kind) {
  const list = kind === 'video'
    ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const m of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export function extFor(mime) {
  if (mime.includes('mp4') || mime.includes('aac')) return kindOf(mime) === 'video' ? 'mp4' : 'm4a';
  return 'webm';
}
const kindOf = m => (m.startsWith('video') ? 'video' : 'audio');

/** Simple recorder wrapper. */
export class Recorder {
  constructor(kind) { this.kind = kind; this.chunks = []; }

  /** Camera/mic on (this is when the phone asks for permission) + live preview. Recording starts with begin(). */
  async open(previewEl) {
    const constraints = this.kind === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true },
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } }
      : { audio: { echoCancellation: true, noiseSuppression: true } };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (previewEl && this.kind === 'video') {
      previewEl.srcObject = this.stream;
      previewEl.muted = true;
      await previewEl.play().catch(() => {});
    }
  }

  begin() {
    this.mime = pickMime(this.kind);
    const opts = { audioBitsPerSecond: 64000 };
    if (this.kind === 'video') opts.videoBitsPerSecond = 900000;
    if (this.mime) opts.mimeType = this.mime;
    this.rec = new MediaRecorder(this.stream, opts);
    this.rec.ondataavailable = e => e.data && e.data.size && this.chunks.push(e.data);
    this.startedAt = Date.now();
    this.rec.start(1000);
  }

  async start(previewEl) { await this.open(previewEl); this.begin(); }

  stop() {
    return new Promise(resolve => {
      this.rec.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        const type = this.rec.mimeType || this.mime || (this.kind === 'video' ? 'video/mp4' : 'audio/mp4');
        this.seconds = (Date.now() - this.startedAt) / 1000;
        this.blob = new Blob(this.chunks, { type: type.split(';')[0] });
        resolve(this.blob);
      };
      this.rec.stop();
    });
  }

  cancel() {
    try { this.rec && this.rec.state !== 'inactive' && this.rec.stop(); } catch {}
    this.stream && this.stream.getTracks().forEach(t => t.stop());
  }
}

/**
 * Upload a blob straight to Google Drive with a resumable upload, in chunks, so it can continue where it stopped.
 *   opts.session   a session URL saved from an earlier try → ask Drive how many bytes it has, send only the rest
 *   opts.onSession called with the new session URL as soon as it exists (the app saves it on the phone)
 * The session URL itself is the permission (no token needed to resume) and Drive keeps it for about a week.
 * Resolves with the Drive file id.
 */
const CHUNK = 4 * 1024 * 1024;                     // multiple of 256 KB, as Drive requires
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export async function uploadToDrive(blob, ticket, onProgress = () => {}, opts = {}) {
  let session = opts.session, offset = 0;
  if (session) {
    const st = await put(session, null, `bytes */${blob.size}`).catch(() => null);
    if (st && st.done) { onProgress(1); return st.id; }
    if (st && st.next !== undefined) offset = st.next; else session = null;   // expired or unknown → start again
  }
  if (!session) {
    session = await startSession(blob, ticket);
    if (!session) return uploadMultipart(blob, ticket, onProgress);      // very old browsers / mock without sessions
    if (opts.onSession) await opts.onSession(session);
  }
  for (;;) {
    const end = Math.min(offset + CHUNK, blob.size);
    const st = await put(session, blob.slice(offset, end), `bytes ${offset}-${end - 1}/${blob.size}`,
                         f => onProgress((offset + f * (end - offset)) / blob.size));
    if (st.done) { onProgress(1); return st.id; }
    offset = st.next !== undefined ? st.next : end;
    onProgress(offset / blob.size);
  }
}

async function startSession(blob, ticket) {
  const meta = { name: ticket.name, parents: [ticket.folderId], mimeType: blob.type };
  const init = await fetch((ticket.uploadUrl || DRIVE_UPLOAD) + '?uploadType=resumable&supportsAllDrives=true&fields=id,size', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ticket.token}`, 'Content-Type': 'application/json; charset=UTF-8',
               'X-Upload-Content-Type': blob.type, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(meta),
  });
  return init.ok ? init.headers.get('Location') : null;
}

/** One PUT to a session. → {done, id} when Drive has the whole file, {next} = bytes Drive has (308 "resume incomplete"). */
function put(session, body, range, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', session);
    xhr.setRequestHeader('Content-Range', range);
    if (onProgress) xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        let id = ''; try { id = JSON.parse(xhr.responseText).id; } catch {}
        return resolve({ done: true, id });
      }
      if (xhr.status === 308) {
        const r = xhr.getResponseHeader('Range');                          // "bytes=0-1048575"
        return resolve({ next: r ? Number(r.split('-')[1]) + 1 : (body ? undefined : 0) });
      }
      reject(Object.assign(new Error('Tải lên lỗi ' + xhr.status), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Mất kết nối mạng'));
    xhr.send(body);
  });
}

function uploadMultipart(blob, ticket, onProgress) {
  const meta = { name: ticket.name, parents: [ticket.folderId], mimeType: blob.type };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', (ticket.uploadUrl || DRIVE_UPLOAD) + '?uploadType=multipart&supportsAllDrives=true&fields=id');
    xhr.setRequestHeader('Authorization', `Bearer ${ticket.token}`);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).id)
                                         : reject(new Error('Tải lên lỗi ' + xhr.status)));
    xhr.onerror = () => reject(new Error('Mất kết nối mạng'));
    xhr.send(form);
  });
}

/**
 * Recordings waiting to be sent, kept on the phone (IndexedDB) until Drive has them.
 * A story is saved here BEFORE uploading and deleted only after the server confirms, so a weak connection,
 * a closed app or a dead battery doesn't lose it. iOS can't upload while the app is closed: it resumes on next open.
 * Item: { id, blob, kind, seconds, qid, stage, at, ticket?, session?, fileId? }  (ticket/session/fileId = how far it got)
 */
const DB = 'historymemo', STORE = 'pending';
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}
export const pending = {
  save: item => tx('readwrite', s => s.put(item)).then(() => true).catch(err => { console.warn('not saved on phone', err); return false; }),
  list: () => tx('readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => a.at - b.at)).catch(() => []),
  remove: id => tx('readwrite', s => s.delete(id)).catch(() => {}),
};

export function b64ToUrl(data) {
  if (!data) return null;
  const bin = atob(data.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: data.mime }));
}

export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
