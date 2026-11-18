// POST /api/track — public, anonymous. Two kinds:
//   { t: 'visit', page, src, lang, ref }                      one page view (public/exit.js, sent with sendBeacon)
//   { t: 'exit', page, src, lang, reason, other, email, consent, remindDays }   "before you go" survey
// No cookies and no IP address are stored. The visitor code is a hash of IP + browser + today's date + a server secret:
// it counts unique visitors per day and cannot be turned back into an IP, and it changes every day.
import crypto from 'node:crypto';
import { gas, readBody } from './_lib.js';

const hits = new Map();   // best effort, per server instance
const PAGES = new Set(['story', 'join', 'print', 'book', 'home']);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python|node-fetch/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let b;
  try { b = readBody(req); } catch { return res.status(400).json({ error: 'bad json' }); }
  const ua = String(req.headers['user-agent'] || '');
  if (BOT.test(ua)) return res.status(204).end();

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const kind = b.t === 'exit' ? 'exit' : 'visit';
  const key = kind + ip;
  const recent = (hits.get(key) || []).filter(t => now - t < 3600e3);
  if (recent.length >= (kind === 'exit' ? 5 : 120)) return res.status(429).json({ error: 'too many' });
  hits.set(key, [...recent, now]);

  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const page = PAGES.has(s(b.page, 20)) ? s(b.page, 20) : 'other';
  const lang = ['en', 'ja', 'vi'].includes(b.lang) ? b.lang : '';
  const country = s(req.headers['x-vercel-ip-country'], 4);
  const day = new Date().toISOString().slice(0, 10);
  const common = { page, src: s(b.src, 40).replace(/[^\w.-]/g, ''), lang, country };

  try {
    if (kind === 'visit') {
      const secret = process.env.GAS_SECRET || 'dev';
      const visitor = crypto.createHash('sha256').update(`${ip}|${ua}|${day}|${secret}`).digest('hex').slice(0, 12);
      const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
      let ref = '';
      try { ref = b.ref ? new URL('https://' + String(b.ref).replace(/^https?:\/\//, '')).hostname : ''; } catch {}
      if (ref === String(req.headers.host || '')) ref = '';
      await gas('visit', { ...common, day, visitor, device, ref: ref.slice(0, 60) });
      return res.status(204).end();
    }
    const out = await gas('exitSurvey', { ...common, reason: s(b.reason, 10), other: s(b.other, 300),
      email: s(b.email, 120), consent: b.consent === true, remindDays: Number(b.remindDays) || 7 });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(out.error ? 400 : 200).json(out.error ? { error: out.error } : { ok: true, remind: out.remind || '' });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
