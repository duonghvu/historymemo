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

## Not yet verified live
- iPhone: recording, saving on the phone, resumable upload to Drive (can Safari read Drive's `Range` header?).
- Real Google Sheet sync, folder/Sheet sharing to the family member inside the Shared Drive (needs external sharing allowed).
- Transcripts + AI follow-up on a real story; push notification on the iPhone.

## Next ideas
- Cloudflare R2 upload → auto-move to Drive (removes the owner token from phones).
- YouTube-style interview film (titles, subtitles from transcripts, chapters).
- Batch the hourly job past ~60 storytellers (6-minute execution limit).
- Re-enable CI (`ci/check.yml`) with a token that has the `workflow` scope.
