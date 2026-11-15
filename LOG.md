# HistoryMemo: project log

No secrets in this file. Keys and passwords live only in Vercel env vars and Apps Script Script properties.

## Live setup (as of 2026-11-14)

| Piece | Where | Notes |
|---|---|---|
| Code | https://github.com/duonghvu/historymemo (private), branch `main` | Push to `main` → Vercel deploys automatically (~30 s) |
| Web app + API | https://historymemo.vercel.app | `GET /api/config?check=1` shows which settings are present (admin key only as a fingerprint) |
| Backend | Google Apps Script project **HistoryMemo**, owner `dvu@linadaichiagency.com` (Google Workspace) | Web app: Execute as Me, access Anyone. URL is Vercel's `GAS_URL` |
| Storage | Shared Drive `0ALVZ7V3tp2XCUk9PVA` → `HistoryMemo/<name> (<id>)/` | Set in `CONFIG.SHARED_DRIVE_ID` |
| AI | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` in Apps Script Script properties | `storytellers` reports `ai: true, stt: true` |
| Vercel env | `GAS_URL`, `GAS_SECRET`, `ADMIN_KEY`, `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Not set: `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS` (Google sign-in off; private links + ADMIN_KEY) |
| Storytellers | Hoang Vu (`s99dc116b`), vi + teo, 2/day at 8:00 and 19:00, America/Chicago, 1 family member | Phone sets the time zone on first open |

## How to update
- **Web / API:** commit + push to `main`. Run `npm test` first (CI is paused, see `ci/README.md`).
- **Apps Script:** paste `apps-script/Code.gs` (and `Questions.gs` / `appsscript.json` if changed) → ⌘S →
  **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
  Never "New deployment": it makes a new URL, and Vercel's `GAS_URL` must then be changed and redeployed
  (this happened once on 2026-11-14).
- **VAPID keys:** never regenerate. Phones that already subscribed would stop getting reminders.

## Timeline
- **v0.3** (zip): 56 life questions → AI life timeline → diary; Google Doc book; ffmpeg video book.
- **v0.4** `a0dd647`: question Sheet per storyteller (family adds questions in any language → translated,
  repeat-checked, asked next; "Ask again"; typed transcripts); AI follow-ups (Chris Voss style; 1/day, 2 deep,
  pause after 2 skips); Skip / "Enough for today"; recordings saved on the phone first; chunked resumable Drive
  uploads; server tracks uploads (recovered / lost / missing → re-ask); Shared Drive storage.
- `dc29038`: Apps Script loads `Code.gs` before `Questions.gs` → `LIFE_TOTAL` moved to `Questions.gs` (setup crashed with `THEMES is not defined`).
- `e750d6f`: `/api/config?check=1` settings check.
- `b5a4791`: trim env values (ADMIN_KEY had been pasted with a trailing newline → every admin call 401).
- `1584994`: delete storyteller; Create button can't double-submit (~20 s create made duplicates);
  time zones validated ("Central US" silently became GMT); `tryLock` → JSON "busy" instead of HTML crash page;
  read-only admin calls skip the lock.
- `bc7faf5`: reminders follow the phone's time zone (sent on every app open).
- Cleanup: deleted duplicate Hoang Vu `se80d4e82` and test storyteller `s1c47b896` (folders in Shared Drive trash).
- VAPID keys added to Vercel → reminders possible once the iPhone turns them on.

### 2026-11-15
- `7c1a8df` camera/mic help screen (in-app browser / denied / busy / no camera) instead of one error line.
- `a00dbe2` simpler storyteller flow: language (one tap, skipped if admin set it) → question → Record →
  camera opens → 3-2-1 → recording → Send / Retake. Pace, rotation, video/voice now only on the admin page;
  "when did this happen" chips removed; reminders offered after the first story.
- `81c15b7` Android Chrome + app permission steps; grey diagnostic line on the help screen; recordings stopped
  within ~1 s are empty → "too short, try again".
- `e8115d7` languages chosen on the admin page load directly (server and phone); question shown in each of the
  storyteller's languages; read aloud automatically, big "Hear again" (pulses if the phone blocked sound).
- `d23e4b2` one-time "tap Allow" screen before the phone's camera pop-up; already blocked → straight to the fix.
- Checked live in headless Chrome (test storytellers created and deleted): countdown + recording work
  (5 s ≈ 276 KB), denied permission shows the help screen, admin languages skip the picker.
- Both test phones (iPhone + Android, opened from the Home Screen icon) said "blocked" without asking:
  a saved "Don't allow" on the phone. Fix is in phone settings (steps on the help screen). Not yet confirmed fixed.
- Trial posters (US Letter, cream/red app colours, sample app screens, privacy/GDPR footer, contact
  dvu@linadaichiagency.com): https://claude.ai/artifact/G3orczVQJTPaMtdz9crLZr (private until shared).
  Trilingual, English, Vietnamese published; Japanese written but NOT yet published.
- Optional: Apps Script `Code.gs` has the server-side "app language from story languages" change; paste + New version
  when convenient (the phone already handles it).

### 2026-11-15 (later)
- Japanese poster published; one-page flyers EN, VI (Letter) and JA (A4, tax-incl. yen prices: digital ¥9,800,
  book set ¥19,800, extra copy ¥5,500, premium ¥39,800, mini ¥4,980, continue ¥980/mo; monitor price ¥12,800).
- `043a387` privacy consent: ONE screen before the first recording (merged with the camera "tap Allow" hint), or none
  if the family ticks consent on the admin page; `public/privacy.html` (en/vi/ja). Checked live in headless Chrome.
  Apps Script needs the new `Code.gs` (+ New version) to store consent server-side; until then the phone keeps it.
- Payments: Lemon Squeezy prohibits physical goods (printed book) → use Stripe (Payment Links) instead.

## Paused here (2026-11-15), to do next
1. Publish the Japanese poster (`Poster-JA.dc.html`, already written in the session scratchpad; rewrite if gone).
2. DONE: consent + legal pages (privacy, data-protection/GDPR, terms, disclaimer) for **Lina & Daichi LLC**, contact
   dvu@linadaichiagency.com, modelled on catchdiff.com. Still to do: paste Code.gs into Apps Script (New version);
   特定商取引法 page before selling in Japan (needs address + phone); lawyer review before public launch.
3. Confirm camera works on both test phones after resetting the permission.
4. Fill poster placeholders ([NUMBER] families, QR) before printing.

## Not yet verified live
- iPhone: recording, saving on the phone, resumable upload to Drive (can Safari read Drive's `Range` header?).
- Real Google Sheet sync, folder/Sheet sharing to the family member inside the Shared Drive (needs external sharing allowed).
- Transcripts + AI follow-up on a real story; push notification on the iPhone.

## Next ideas
- Cloudflare R2 upload → auto-move to Drive (removes the owner token from phones).
- YouTube-style interview film (titles, subtitles from transcripts, chapters).
- Batch the hourly job past ~60 storytellers (6-minute execution limit).
- Re-enable CI (`ci/check.yml`) with a token that has the `workflow` scope.
