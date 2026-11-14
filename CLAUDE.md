# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product
Remento-style life-story app for elderly storytellers. Questions asked in English (`en`), Vietnamese (`vi`),
Japanese (`ja`) or Teochew (`teo`); answer by video (default) or voice; 1/2/3/5 per day + "one more now".
Journey: 56 fixed life questions → Claude-generated life-timeline questions (birth → today, 4 per stage) → diary.
Jumping ahead of that sequence: family questions (from a per-user Google Sheet or the admin page) and AI follow-ups.
Output: biography Google Doc ordered by life stage (roots → … → now → legacy) and an ffmpeg video book.
Stories are stored in Google Drive organised by user. Users are seniors: big type, ≥60px tap targets, one obvious action per screen.

## Run
- Node comes from nvm (`~/.nvm/versions/node/v24.18.0/bin`) and is not on PATH in non-interactive shells: export it first.
- `npm test`: backend tests (real `.gs` code, simulated Google + Claude + STT + Sheets).
  Single test: `node --test --test-name-pattern "follow-ups" tests/backend.test.mjs`. `tests/upload.test.mjs` tests the
  phone's chunked/resumable Drive upload against a fake XHR.
  CI also runs `node --check` on `public/*.js api/*.js dev/*.mjs`.
- `npm run video-book -- --folder <user folder>`: video biography (needs ffmpeg).
- `npm run dev:mock`: no accounts; runs the real `apps-script/*.gs` in Node with simulated Google services
  (`dev/mock-google.mjs`), files under `local-data/`. Demo login button, admin key `local-admin`.
- `npm run dev`: real Apps Script/Drive using `.env.local`.
- Deploy: push to GitHub → Vercel builds automatically (no build step). Apps Script is deployed separately (README §3).

## Architecture
- `public/` (static, ES modules, no framework/build)
  - `app.js`: storyteller app, kept deliberately minimal for seniors. Flow: `pickUi` (one tap: language; skipped if the
    admin already set it) → `home` (question, Listen, big Record, small "voice only" / "skip") → `record` (camera opens
    = permission prompt, then 3-2-1 countdown, then `Recorder.begin()`) → `stop` (review: Send / Retake) → `send` →
    `thanks` (offers 🔔 reminders once). Pace, language rotation and video/voice are set on the admin page, not here.
    Camera problems go to `mediaHelp` (in-app browser / denied / busy / no camera). Clicks route via `data-a` → `actions`.
  - `i18n.js`: UI strings `STR.en|vi|ja`, `t(lang, key, vars)`. Teochew has no written UI.
  - `common.js`: `api()`, `Recorder` (`open()` = getUserMedia + preview, `begin()` = MediaRecorder; iOS → mp4), `uploadToDrive()` (Drive v3 resumable; `ticket.uploadUrl` overrides for mock).
  - `admin.html/js`: storytellers CRUD, private link + QR, test push, record question voices per language.
  - `sw.js`: push notifications.
- `api/` (Vercel functions; `_lib.js` not routed)
  - `gas.js`: proxy. Admin actions need `ADMIN_KEY` or signed admin session; storyteller actions forward `k` as `key` (validated in Apps Script).
  - `auth.js`: verifies Google ID token (tokeninfo, `aud == GOOGLE_CLIENT_ID`), returns storyteller `key` (auto-creates account) + `adminToken` if email ∈ `ADMIN_EMAILS`.
  - `push.js`: called by Apps Script with `GAS_SECRET`; sends web push via VAPID, returns `gone` endpoints.
  - `manifest.js`: dynamic manifest; `start_url` carries `?k=` because iOS home-screen apps have separate storage.
- `apps-script/`: backend + storage
  - `Questions.gs`: `THEMES` (8 × 7 questions, `[en, vi, ja]`; `{X}/{x}` = Vietnamese call name).
  - `Questions.gs` also has `STAGES`, `STAGE_NAME`, `QUESTION_STAGE` (default life stage per question), `DIARY`, `DIARY_STAGE`.
  - `Code.gs`: `FATHER` (storyteller) / `ADMIN` / `SERVER` action maps; storytellers in Script Properties `ST_<id>`
    (index `ST_INDEX`), prompt voices `P_<id>_<lang>`; per-user Drive files `stories.json` (story log) and
    `plan.json` (generated timeline). `hourly()` sends reminders at local `hours` and transcribes pending stories.
  - Sequence: `promptAt_(st, n, plan)` with n = `st.progress` (stories recorded): n<56 life; then `plan.timeline`;
    then `DIARY` cycling. Language = `langs[(mode==='each' ? n : day) mod L]`.
  - **Queue before sequence:** `currentPrompt_` = `plan.queue[0]` (via `queuePrompt_`) else `promptAt_`. Answering a queue
    item bumps `st.extraDone`, not `st.progress`, so the fixed sequence never shifts. The phone sends `qid` with
    `ticket`/`storyDone`/`skip`, and `resolvePrompt_` uses it so a background sync can't mislabel a story.
    Queue items carry `phase`/`seq`/`sub`/`root` (follow-ups copy their parent's), `folder` (follow-ups save next to the parent).
  - Skips go to `plan.skipped` and are never re-asked; "Ask again" in the Sheet re-queues. `rest` sets `st.restDay`.
  - **Follow-ups:** `followUps_` (Chris Voss-style prompt `FOLLOWUP_SYSTEM`) runs from `afterStory` (one-off trigger ~2 min
    after `storyDone`, via `soon_`) and from `hourly`. Limits in `CONFIG` (`FOLLOWUP_MAX_DEPTH`, `FOLLOWUPS_PER_DAY`,
    `PAUSE_AFTER_SKIPS`, `PAUSE_DAYS`); only the latest story; one follow-up waiting at a time; `st.followUps === false` disables.
  - **Question Sheet:** `openSheet_`/`syncSheet_`: tab `Add questions` (family input; HistoryMemo fills Status + ID) and
    `All questions` (fully rewritten each sync by `sheetRows_`; reads back edited Transcript and "Ask again" first, keyed by
    story `fileId` or skip `key`). `addFamilyQuestion_` → `translateQuestion_` (Claude: en/vi/ja + stage + `duplicateOf`;
    fallback `LanguageApp` + exact match). Synced hourly, on `addQuestion`/`syncSheet`, and on `createStoryteller`.
  - AI: `generateStage_` (Claude Messages API via UrlFetchApp, JSON array {en,vi,ja}), `writeChapter_`,
    `transcribePending_` (OpenAI audio transcriptions; Teochew unsupported). Keys in Script Properties.
  - Book: `ADMIN.buildBook` → Google Doc; order = `sortStories_` (stage, phase life→family→timeline→diary, seq, date, sub).
    `tools/video-book.mjs` loads `Code.gs` in a `vm` and calls the same `sortStories_`, so keep Code.gs free of top-level Google calls.
- Recordings: the phone saves each recording to IndexedDB (`pending` in `common.js`) before uploading and deletes it only
  after `storyDone`. `uploadToDrive` is chunked + resumable (saves `item.session`; resumes via `Content-Range: bytes */N`).
  `upload()` in `app.js` resumes on open and on the `online` event. If IndexedDB fails it is kept in memory (`S.unsaved`).
- Server-side upload safety: `ticket` with `uid` stores a snapshot in `plan.uploads[uid]` (the question it answers);
  `storyDone` is idempotent per `uid` and rejects files smaller than `size`; `logStory_` does the real logging and only
  advances `st.progress` if the snapshot's `n` is still current. `checkUploads_` (hourly) recovers files that reached
  Drive without a `storyDone`, and marks uploads lost after `CONFIG.LOST_AFTER_DAYS` (the question then stays current, so
  it is asked again). `checkFiles_` (local 3:00) re-queues questions whose recording vanished (`reason: 'missing'`).
- New Apps Script actions must also be added to `ADMIN_ACTIONS`/`STORYTELLER_ACTIONS` in `api/_lib.js` or the proxy rejects them.

## Conventions
- Plain JS/CSS, no build. Keep storyteller copy short and translated in all three `STR` languages.
- Any change to `apps-script/*.gs` must keep working in `dev/mock-google.mjs` (add mocks for new Google services there;
  it already fakes Drive, Docs as Markdown, Sheets as `*.sheet.json`, LanguageApp, one-off triggers, and Claude/OpenAI replies
  matched on the system prompt). New Google services also need their scope in `apps-script/appsscript.json`.
- Secrets only in env / Script Properties. Never commit `.env*` or `local-data/`.

## Known trade-offs (MVP)
1. `ticket` gives the phone the owner's short-lived OAuth token to upload straight to Drive. Next: create the
   resumable session in Apps Script and return only the session URI, or move uploads server-side (see ROADMAP).
2. Script Properties as DB (~500 KB total): fine for tens of users. Move to Postgres for SaaS.
3. Apps Script quotas (consumer: ~20k URL fetches/day, 6 min/execution, ~100 emails/day).
