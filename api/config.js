// GET /api/config → public settings for the pages
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    mock: process.env.MOCK === '1',
  });
}
