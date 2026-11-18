# HistoryMemo / DENKI: To do

Order: **free trial first**, payments later. Don't start Lemon Squeezy until people have used the trial.

## Phase 1: Free Mini trial (now)

### 1. Turn on sign-ups (you, about 5 minutes)
- [x] (done 2026-11-18) Open the Apps Script project → replace `Code.gs` with `apps-script/Code.gs` from this repo → Save.
- [ ] Deploy → **Manage deployments** → ✏️ (edit) → Version: **New version** → Deploy.
      (Don't use "New deployment": that changes the URL.)
      Checked live 2026-11-18: a sign-up returns a private link; a second sign-up with the same email is refused.
- [ ] Delete the test storyteller "ZZ Test (delete me)" on the admin page (trash its folder) and its row in the sign-up sheet.
- [ ] Only if the URL changed (you made a New deployment by mistake): copy the new Web app URL (ends in `/exec`) →
      Vercel → historymemo → Settings → Environment Variables → `GAS_URL` → Edit → paste → Save →
      Deployments → ⋯ on the latest → **Redeploy**.
- [ ] Test it: open https://historymemo.vercel.app/join.html on your phone, sign up with your own email,
      and check that a private link and QR show up. Record one story.
- [ ] Check that the sheet "HistoryMemo – trial sign-ups" appeared in the HistoryMemo Drive folder with your row.
- [ ] Tell me when it's done. I'll check it live, then delete the test storyteller.

### 2. Phones
- [ ] On both test phones, allow the camera again (Settings → Safari/Chrome → Camera → Allow). Record one video story on each.

### 3. Print and share
- [ ] Print the flyers:
      - English/Japanese/Vietnamese: https://historymemo.vercel.app/flyers/historymemo-flyer.pdf (Letter)
      - Japanese DENKI: https://historymemo.vercel.app/flyers/denki-flyer-ja.pdf (A4)
- [ ] Before printing many, scan both QR codes on a printed copy to make sure they work.
- [ ] Write down where each batch goes (shop, church, community center, event) and the date.
- [ ] Share the story page too: https://historymemo.vercel.app/story.html (`?lang=ja` / `?lang=vi`).

### 4. Watch the results (2–4 weeks)
- [ ] Admin page → 📝 Flyer sign-ups: count per week.
- [ ] In the sheet, look at "Would you buy?", languages and country.
- [ ] Check how many trial users finish all 12 stories (admin shows their progress).
- [ ] Talk to 3–5 trial users: what did they like, would they pay ¥9,800 / US$65, and what's missing?
- [ ] Decide whether the demand is real. For example: at least 20 sign-ups, at least 5 finished 12 stories, and at least 3 say "I would buy".
      If yes, go to Phase 2.

### Before advertising widely (not urgent for a small flyer test)
- [ ] Trademark check for "DENKI / 伝記" on J-PlatPat (classes 41, 9, 42).
- [ ] Lawyer review of the legal pages (terms, privacy, 特定商取引法).
- [ ] Old Japanese flyer: keep Premium ¥39,800 only if you will really set up phones and have a person proofread.

## Phase 2: Lemon Squeezy (after the trial shows demand)

Lemon Squeezy is the seller of record: it charges the customer and handles sales tax, VAT and Japanese consumption tax (JCT).
You get paid out to the LLC.

### A. You: set up the store (about 1 hour + approval wait)
- [ ] Sign up at https://www.lemonsqueezy.com with the business email.
- [ ] Store details: Lina & Daichi LLC, Wyoming, USA. Store name: HistoryMemo (DENKI can be a product name later).
- [ ] **Identity / store activation:** submit the LLC details, EIN, ID and the website https://historymemo.vercel.app.
      Lemon Squeezy reviews new stores (usually a few days). They check that the site has:
      terms, privacy, refund policy and a clear product description. These are all already live.
- [ ] Payouts: add the LLC's US bank account (or PayPal).
- [ ] Tax: you don't register anywhere yourself. Lemon Squeezy collects and pays the tax.
      You may still need to send a W-9 for the LLC.

### B. You: create the products (prices include tax)
| Product | Type | Price |
|---|---|---|
| Digital book | One-time | US$65 · ¥9,800 · 1.600.000đ |
| Keep going | Subscription, monthly | US$6.50 · ¥980 |

- [ ] For each product: name, short description, and price.
      Turn on **tax-inclusive pricing** so ¥9,800 is exactly what the customer pays (needed for Japan).
- [ ] Set the currency per country (USD default; JPY and VND if Lemon Squeezy supports them in your store,
      or let it convert automatically).
- [ ] Refund policy: 30 days (same as /terms.html).
- [ ] Copy each product's **checkout link** and send them to me.
- [ ] Settings → Webhooks: I'll give you the URL (`https://historymemo.vercel.app/api/lemon`), and you send me the
      **signing secret**. Put it in Vercel → Settings → Environment Variables as `LEMON_WEBHOOK_SECRET`; don't paste it in chat.

### C. Me: connect it to the app
- [ ] "Buy the digital book" button on the trial-done screen, /story.html and the join thanks page
      (checkout link with the storyteller id passed as custom data, so the payment unlocks the right account).
- [ ] `api/lemon.js` webhook: verify the signature → Apps Script `SERVER.paid` → remove the Mini limit (`st.trial` → `'paid'`),
      record the order id, and email the family.
- [ ] Subscription cancelled → stop new questions after the paid period ends (stories stay).
- [ ] Admin page: show paid / trial status.
- [ ] Test mode: one test purchase end to end, then switch to live mode.
- [ ] Update the flyers and the 特定商取引法 page with the final prices, and confirm the "how to pay" text.
- [ ] Tests in `tests/backend.test.mjs` for the webhook (valid / bad signature / duplicate event).

## Later
- Full film of a whole life (video book from all stories, in order): `npm run video-book` works locally; a paid add-on later.
- Logo options that are easier to register as a trademark.
- Update the design canvas (it's shared publicly; it needs your OK).
