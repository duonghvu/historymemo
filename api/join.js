// POST /api/join  — trial sign-up from public/join.html (flyer QR). Public: no key.
// Validates, drops bots (honeypot field "website"), limits repeats per IP, then appends a row in Apps Script.
import { gas, readBody } from './_lib.js';

const hits = new Map();   // best effort, per server instance

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let b;
  try { b = readBody(req); } catch { return res.status(400).json({ error: 'bad json' }); }
  if (b.website) return res.status(200).json({ ok: true });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 5) return res.status(429).json({ error: 'too many' });
  hits.set(ip, [...recent, now]);

  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const email = s(b.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email' });
  if (b.consent !== true) return res.status(400).json({ error: 'consent' });

  try {
    const out = await gas('joinInterest', {
      email, consent: true, name: s(b.name, 80), phone: s(b.phone, 40), lang: s(b.lang, 5), who: s(b.who, 40),
      langs: s(b.langs, 80), country: s(b.country, 60), buy: s(b.buy, 20), src: s(b.src, 40), note: s(b.note, 500),
    });
    res.setHeader('Cache-Control', 'no-store');
    return out.error ? res.status(400).json({ error: out.error }) : res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
