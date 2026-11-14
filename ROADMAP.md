# HistoryMemo: Roadmap

## v0.2: MVP (this repo)
- Google Drive (My Drive or **Shared Drive**) owned by the family / company, **organised by user**.
- Sign in with Google, or private link for elders without email.
- Questions in en / vi / ja / teo with language rotation (per day or per question).
- Video default, voice optional; 1–3 questions a day; iPhone reminders.

## v0.3: Journey + book (this repo)
- 56 life questions → Claude-generated life timeline (birth → today) → diary; pace 1/2/3/5 a day + "one more".
- "When did this happen?" life stage per story; Google Doc biography in life order with optional AI chapters.
- Transcripts for en/vi/ja (OpenAI); video biography with ffmpeg.

## v0.4: Polish for first families (traction test)
- ✅ Question Sheet per storyteller: family adds questions in any language → translated, repeat-checked, asked next; tracker of every answer, skip and "Ask again"; family can type transcripts (Teochew).
- ✅ AI follow-up questions (Chris Voss-style tactical empathy), max 1/day, 2 deep, paused after skips; "Skip" and "Enough for today".
- ✅ Recordings kept on the phone (IndexedDB) until Drive confirms; resume on next open.
- Printable book with **QR codes** that play each recording (HTML → PDF, print-on-demand partner).
- Family can edit transcripts in the admin page (done in the Sheet; Teochew: typed by family; no speech recognition for Teochew yet).
- "Free story" button and choose an unanswered question.
- YouTube-style interview film: interviewer cards / lower thirds, subtitles from transcripts, chapter timestamps, 1080p.
- Family app: listen to stories, react with a heart, ask a follow-up question.
- Reminders through **Zalo** (Vietnam) and **LINE** (Japan) in addition to web push.

## v1.0: Storage choices per family

| Option | How | Who owns data | Notes |
|---|---|---|---|
| **A. Own Google Drive** (BYO) | Google OAuth with the `drive.file` scope (app can only see files it created); store refresh token encrypted | The family | Needs Google OAuth verification (app review); `drive.file` avoids the heavy "restricted scope" security assessment |
| **B. HistoryMemo shared Drive** (today's MVP) | Company Shared Drive in Google Workspace, one folder per family | Company (processor) | Easy start; Workspace storage pooled per licence; not ideal at scale |
| **C. HistoryMemo cloud storage** | Object storage (Google Cloud Storage / AWS S3 / Cloudflare R2) with region choice (EU, US, Japan), signed upload URLs, encryption at rest | Company (processor), family is controller | Default for users without space; paid plan |

Architecture change for v1: replace Apps Script with a real backend (e.g. Vercel/Cloud Run + Postgres),
a `StorageProvider` interface (`googleDrive`, `gcs`, `s3`), and server-issued **signed upload URLs** (no owner tokens on phones).

## Compliance track (before selling to families outside your own)

**GDPR (EU/UK users) and similar laws (Japan APPI, Vietnam Decree 13/2023 on personal data)**
- Voice/video of a person = personal data; may reveal health, religion or ethnicity → treat as sensitive.
- Clear **consent** from the storyteller (in their language), and from family members who view.
- Privacy policy, **Data Processing Agreement** with each storage/subprocessor (Google, Vercel, transcription vendor).
- Data residency option (EU region for EU users), export ("download all my stories") and **delete** (right to erasure).
- Record of processing, breach notification process (72 h for GDPR).

**SOC 2 (needed when selling to businesses, e.g. care homes, end-of-life planning companies, insurers)**
- Start with a compliance platform (Vanta / Drata / Secureframe) → **SOC 2 Type I**, then **Type II** after a 3–6-month observation window.
- Controls: SSO + MFA for staff, least-privilege access, audit logs, encrypted storage, backups, vendor reviews, incident response.
- Choose vendors that already have SOC 2 / ISO 27001 (Google Cloud, AWS, Vercel do).

Note: this is a product checklist, not legal advice. Have a privacy lawyer review before launch in each market.
