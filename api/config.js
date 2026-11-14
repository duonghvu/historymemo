// GET /api/config → public settings for the pages
//   ?check=1 → which server settings are present (never the values; the admin key only as an 8-char SHA-256 fingerprint)
import crypto from 'node:crypto';
import './_lib.js'; // trims the settings

const fp = v => (v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 8) : null);

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const out = {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    mock: process.env.MOCK === '1',
  };
  if (req.query && req.query.check) {
    const e = process.env;
    out.check = {
      ADMIN_KEY: fp(e.ADMIN_KEY), ADMIN_KEY_length: (e.ADMIN_KEY || '').length,
      GAS_URL: !!e.GAS_URL, GAS_SECRET: !!e.GAS_SECRET, SESSION_SECRET: !!e.SESSION_SECRET,
      VAPID: !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY), env: e.VERCEL_ENV || 'local',
      deployed: e.VERCEL_GIT_COMMIT_SHA ? e.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    };
  }
  res.status(200).json(out);
}
