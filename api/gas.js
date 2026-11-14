// POST /api/gas  { k, action, ...payload }
//   storyteller actions: k = the storyteller's private key (checked inside Apps Script)
//   admin actions:       k = ADMIN_KEY or an admin session from "Sign in with Google"
import { gas, isAdmin, readBody, ADMIN_ACTIONS, STORYTELLER_ACTIONS } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { k, action, ...payload } = readBody(req);

  let forward;
  if (ADMIN_ACTIONS.has(action)) {
    if (!isAdmin(k)) return res.status(401).json({ error: 'unauthorized' });
    forward = payload;
  } else if (STORYTELLER_ACTIONS.has(action)) {
    if (!k) return res.status(401).json({ error: 'unauthorized' });
    forward = { ...payload, key: k };
  } else {
    return res.status(400).json({ error: 'unknown action' });
  }

  try {
    const out = await gas(action, forward);
    res.setHeader('Cache-Control', 'no-store');
    const status = out.error === 'unauthorized' ? 401 : out.error ? 400 : 200;
    return res.status(status).json(out);
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
