// POST /api/auth { credential }  ← "Sign in with Google" button (Google Identity Services)
// Verifies the Google ID token, then returns:
//   key        → this person's storyteller account (created on first sign-in, own Drive folder)
//   adminToken → only if the email is listed in ADMIN_EMAILS
import { gas, verifyGoogle, signAdmin, adminEmails, readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google sign-in is not configured' });
  try {
    const { credential } = readBody(req);
    const { email, name } = await verifyGoogle(credential);
    const out = { email };
    if (adminEmails().includes(email)) out.adminToken = signAdmin(email);
    const login = await gas('loginGoogle', { email, name });
    if (login.error) throw new Error(login.error);
    out.key = login.key;
    out.profile = login.profile;
    return res.status(200).json(out);
  } catch (err) {
    return res.status(401).json({ error: String(err.message || err) });
  }
}
