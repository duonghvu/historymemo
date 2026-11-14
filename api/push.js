// POST /api/push { secret, subs, payload }  ← called by Apps Script (hourly trigger / admin test)
// Sends iPhone/Android/desktop web push notifications. Returns endpoints that are gone so
// Apps Script can forget them.
import webpush from 'web-push';
import { readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { secret, subs = [], payload = {} } = readBody(req);
  if (!secret || secret !== process.env.GAS_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID keys not set' });
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let sent = 0;
  const gone = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'high' });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(sub.endpoint);
    }
  }
  return res.status(200).json({ ok: true, sent, gone });
}
