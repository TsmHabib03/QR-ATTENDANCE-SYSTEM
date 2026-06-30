# QR Attendance Management System — Standard Edition

A lightweight, commercial-ready QR attendance system with a **static frontend**
(deploys free to GitHub Pages or Vercel) and a **Google Apps Script + Google
Sheets** backend. Runs in **demo mode out of the box** — no backend required to
preview.

- ⚡ **Zero build step** — vanilla HTML/CSS/JS + CDN libraries
- 🆓 **Free hosting** — GitHub Pages / Vercel (frontend) + Apps Script/Sheets/Drive (backend)
- 🎨 **Design-system driven** — tokens, dark mode, motion, accessibility
- 🔐 **Token auth** + salted password hashing
- 📷 Camera QR scanning, member CRUD, schedules, analytics, reports, audit logs, email

---

## 1. Quick preview (demo mode, 30 seconds)

```bash
# Any static server works. From the project folder:
python -m http.server 5173
# then open http://localhost:5173
```

Or just **double-click `index.html`** (classic scripts work from `file://`).
Sign in with **any username/password** — demo data is generated in memory.

> Camera scanning needs HTTPS or `localhost`. On the deployed site it works
> automatically. In demo mode use the **"Simulate scan"** button.

---

## 2. Go live (connect the real backend)

### 2a. Create the backend (Google Apps Script + Sheets)

1. Create a new **Google Sheet**.
2. **Extensions → Apps Script**. Delete `Code.gs`, then add all files from this
   repo's `scripts/` folder (or use **clasp**, below).
3. Run the **`setup()`** function once (authorize when prompted). This creates
   every tab and a default admin: **`admin` / `admin123`** — change it after first login.
   `setup()` is **idempotent and non-destructive**: re-running it only ensures the
   header rows and seeds, so it doubles as a **schema migration**. If you are
   upgrading an existing sheet, re-run `setup()` to add the expanded **Schedule**
   columns and the new **`Members.ScheduleID`** column (existing data is preserved;
   `ScheduleID` is appended at the end and starts blank).
4. **Deploy → New deployment → Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Copy the **Web app URL** (ends in `/exec`).
6. *(Optional)* run **`installTriggers()`** for daily/monthly summary emails.

#### Using clasp (version-controlled backend)

```bash
npm i -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # paste your scriptId
clasp push                           # uploads scripts/ to Apps Script
```

### 2b. Point the frontend at it

Edit **`assets/js/config.js`**:

```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXX/exec", // <- your /exec URL
  ORG_NAME: "Client Name",
  THEME: "light",
  TIMEZONE: "Asia/Manila"
};
```

A non-empty `API_URL` automatically switches off demo mode.

---

## 3. Deploy the frontend (free)

### Option A — GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages →** Source: **GitHub Actions** (the included
   `.github/workflows/deploy.yml` builds & deploys on every push to `main`),
   or simply "Deploy from branch" → `main` / root.
3. Visit `https://<user>.github.io/<repo>/`.

Routing uses the URL **hash** (`#/dashboard`), so deep links never 404 on Pages.

### Option B — Vercel
1. Import the GitHub repo at [vercel.com](https://vercel.com) → Framework: **Other**.
2. `vercel.json` (included) adds security headers and a camera permission policy.
3. Every push to `main` auto-deploys; pull requests get preview URLs.

> **Optional Vercel proxy:** add `api/proxy.js` to forward requests to the GAS
> URL — this hides the URL and lets you use clean `application/json`. Not needed
> for the default text/plain contract.

---

## 4. Per-client setup checklist (≈ 15 min/sale)

- [ ] New Google Sheet → add `scripts/` → run `setup()` → deploy Web App
- [ ] Paste `/exec` URL + client name into `assets/js/config.js`
- [ ] Deploy frontend (fork the repo or new Vercel project)
- [ ] Log in, change the admin password, set Settings (org, timezone, grace period)
- [ ] Add members, print QR codes

---

## 5. Project structure

```
index.html                 app shell (hash-routed)
assets/
  css/  tokens.css          design tokens (colors, spacing, motion)
        app.css             components & layout
  js/   config.js           ← per-client settings (API_URL, branding)
        api.js              CORS-safe fetch wrapper (+ read cache, progress, demo routing)
        mock.js             in-memory demo backend (mirrors every action)
        bus.js              tiny pub/sub (live dashboard refresh on new attendance)
        ui.js               DOM/toast/table/modal + debounce/busy/progress helpers
        auth.js             token storage + login/logout
        router.js           hash router
        app.js              bootstrap (theme, topbar, auth gate)
        pages/*.js          dashboard, members, schedule, scanner, attendance, analytics, reports, audit, settings
scripts/                    Google Apps Script backend (deploy separately)
  Code.gs                   doPost/doGet router + setup()/installTriggers()
  auth · members · attendance · schedule · analytics · reports · email · audit · settings · utils
  appsscript.json
vercel.json · .github/workflows/deploy.yml · .clasp.json.example
```

---

## 5b. Schedules drive attendance validation

Attendance status is **never** computed from a hardcoded time. Each scan resolves
the member's schedule and classifies the record from it:

- **Resolution priority:** the member's directly assigned schedule → `Employee` →
  `Position` → `Section` → `Department` → `Default` scope. If nothing matches, the
  scan is still recorded as **Present** with a *"No schedule assigned"* note — it is
  **never auto-marked Absent**.
- **Rules per schedule:** `Late` after *Late after* (or *Start + Grace*), `Half Day`
  after *Half-day after*, `Holiday` on non-working days, with *Earliest time in* /
  *Latest time out* bounding the worked-hours calculation.

Create and assign schedules on the **Schedules** page; assign one to a member via the
**Assigned schedule** dropdown on the Members form. The scan write path is serialized
with `LockService` so rapid or duplicate scans can't create double records.

---

## 6. How requests work (the CORS-safe contract)

A static site calling Apps Script is **cross-origin**, and GAS **doesn't answer
CORS preflight**. So the frontend sends only "simple" requests:

- `POST` with `Content-Type: text/plain;charset=utf-8` (no preflight)
- **no** custom headers — the session token rides **inside the JSON body**
- body = `JSON.stringify({ action, token, payload })`; server reads `e.postData.contents`

This is implemented once in `assets/js/api.js` and `scripts/Code.gs`. Don't switch
to `application/json` or add an `Authorization` header, or browsers will block it.

---

## 7. Security notes

- Passwords: per-user salt + iterated SHA-256. Change the default admin password.
- Sessions: opaque tokens in the `Sessions` sheet, 12h sliding expiry, deleted on logout.
- QR codes encode an **opaque member code** (the Member ID, or a regenerated token) — never personal data.
- User input is sanitized before writing to Sheets (formula-injection guard).
- Deploy the Web App as **Anyone**, but every non-login action requires a valid token.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| "Bad response from server" | Web App not deployed for **Anyone**, or wrong `/exec` URL. Re-deploy. |
| Login works in demo but not live | Confirm `API_URL` is set and `setup()` was run. |
| CORS error in console | You changed the Content-Type or added headers — keep the text/plain contract. |
| Camera won't start | Needs HTTPS or `localhost` + camera permission. |
| Changes to backend not reflected | Create a **new deployment version** (or `clasp deploy`). |

---

## 9. Upgrade path (Enterprise edition)

The UI talks to a single `App.api.call(action, payload)` boundary. To scale
beyond Apps Script quotas, replace the backend with a real API (Node/Cloud
Functions + Postgres) that honors the same action contract — **no frontend
changes required.**

---

## 10. Optional add-ons (documented, not required)

- **Bootstrap 5 / DataTables** — the blueprint lists these; this build ships a
  lighter token-driven UI + custom table for cohesion. Layer them in if a client requires it.
- **Vite build** — add bundling/minification for very large deployments.
- **Vercel API proxy** — hide the GAS URL and add server-side rate limiting.
