// Shared helpers for the API functions (Vercel in production, dev/server.mjs locally).
import crypto from 'node:crypto';

// Values pasted into Vercel often carry a stray space or line break: ignore them.
for (const k of ['GAS_URL', 'GAS_SECRET', 'ADMIN_KEY', 'SESSION_SECRET', 'ADMIN_EMAILS', 'GOOGLE_CLIENT_ID',
                 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
  if (typeof process.env[k] === 'string') process.env[k] = process.env[k].trim();
}

export const ADMIN_ACTIONS = new Set([
  'storytellers', 'createStoryteller', 'updateStoryteller',
  'questions', 'prompt', 'promptTicket', 'promptDone', 'testPush',
  'generateNow', 'transcribeNow', 'buildBook', 'bookData', 'addQuestion', 'syncSheet', 'deleteStoryteller',
]);
export const STORYTELLER_ACTIONS = new Set(['me', 'saveProfile', 'ticket', 'storyDone', 'subscribe', 'skip', 'rest', 'consent']);

/** Call the Google Apps Script backend server-to-server. GAS_SECRET never reaches a browser. */
export async function gas(action, payload = {}) {
  const url = process.env.GAS_URL;
  if (!url || !process.env.GAS_SECRET) throw new Error('GAS_URL / GAS_SECRET are not set');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action, secret: process.env.GAS_SECRET }),
    redirect: 'follow',
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Apps Script did not return JSON (deployment access must be "Anyone"): ' + text.slice(0, 200)); }
}

// ── admin sessions: HMAC-signed token { email, exp } after "Sign in with Google" ──

const secret = () => process.env.SESSION_SECRET || process.env.GAS_SECRET || 'dev-only-secret';
const b64u = s => Buffer.from(s).toString('base64url');

export function signAdmin(email, days = 30) {
  const body = b64u(JSON.stringify({ email, role: 'admin', exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `adm.${body}.${sig}`;
}

function verifyAdminToken(t) {
  const [prefix, body, sig] = String(t).split('.');
  if (prefix !== 'adm' || !body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

export function isAdmin(k) {
  if (!k) return false;
  if (process.env.ADMIN_KEY && k === process.env.ADMIN_KEY) return true;
  const data = verifyAdminToken(k);
  return !!data && adminEmails().includes(data.email);
}

export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);

/** Verify a "Sign in with Google" ID token (JWT) with Google. */
export async function verifyGoogle(credential) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) throw new Error('Google sign-in failed');
  const t = await r.json();
  if (t.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Google sign-in: wrong client id');
  if (t.email_verified !== 'true' && t.email_verified !== true) throw new Error('Google email not verified');
  return { email: String(t.email).toLowerCase(), name: t.name || t.given_name || '' };
}

export function readBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}
