// GET /api/manifest?k=...  → web app manifest whose start_url keeps the storyteller's key.
// iPhone home-screen apps get their own storage (separate from Safari), so the key travels in start_url.
export default function handler(req, res) {
  const k = String((req.query && req.query.k) || '').replace(/[^\w-]/g, '');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify({
    name: 'HistoryMemo',
    short_name: 'HistoryMemo',
    start_url: k ? `/?k=${k}` : '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf6ee',
    theme_color: '#b3261e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }));
}
