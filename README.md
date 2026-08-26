# 🌿 VyapaarSetu

> **Offline-first, bilingual (Marathi + English) vegetable-market vendor management for APMC commission agents, traders, and wholesalers.**

VyapaarSetu is a **Windows desktop app**. It runs entirely on one shop PC — no cloud
account, no internet required for daily use. It packages a local web app (React + an
embedded SQLite database) inside a single installable program: its own window, its own
icon, a Start-Menu entry. No terminal, no browser tab.

---

## 📥 Install (for shopkeepers)

1. Get the installer — **`VyapaarSetu Setup <version>.exe`**.
2. Double-click it and follow the prompts. You can choose the install folder; shortcuts are
   added to the Desktop and Start Menu.
3. Launch **VyapaarSetu** from the Start Menu.

> **First launch & Windows SmartScreen:** the app isn't code-signed yet, so Windows may show
> a blue *"Windows protected your PC"* dialog. Click **More info → Run anyway**. This is
> expected for now (see [Known limitations](#-known-limitations)).

### Where your data lives

Everything you enter is stored in one per-user folder — safe to copy for a manual backup:

```
%APPDATA%\VyapaarSetu\
├─ data\vyapaarsetu.db      ← your customers, bills, ledger (SQLite)
├─ backups\                 ← local timestamped snapshots
└─ drive_tokens.json        ← Google Drive login (only if you connect Drive)
```

Paste `%APPDATA%\VyapaarSetu` into the Windows Explorer address bar to open it. Uninstalling
the app leaves this folder in place, so your ledger survives a reinstall or upgrade.

---

## ✨ What it does

- **Dashboard** — today's sales, commission, active customers, database health, and a
  live ledger-reconciliation check that flags any customer whose balance drifts from their
  passbook.
- **Customers** — profiles with unique mobile numbers, credit (udhar) ledgers, phonetic
  Marathi name entry.
- **Vegetables** — rate master with units (kg, piece, bundle, dozen) and phonetic search.
- **Billing** — invoices with discounts, commission, cash/UPI/credit, amount-in-words.
- **Udhar / Credit ledger** — additions, manual adjustments, payments, per-customer history.
- **Reports** — daily / date-range sales, customer sheets, vegetable weight logs, commission.
- **WhatsApp sharing** — send a bill straight to a customer via WhatsApp.
- **Backup & restore** — local snapshots with fail-safe transactional restore, plus optional
  Google Drive sync.

All money is stored on disk as whole **paise** (integers), so balances and their ledgers
reconcile exactly — no floating-point drift.

---

## 🛠️ For developers

### Prerequisites

| Tool    | Version            |
|---------|--------------------|
| Node.js | ≥ 18 (20 / 22 recommended) |
| npm     | ≥ 9                |
| OS for building the installer | Windows |

### Repository layout

```
VyapaarSetu/
├─ electron/       Electron main process (wraps the backend + opens the window)
├─ backend/        Express API + SQLite (better-sqlite3), business logic, tests
├─ frontend/       React 19 + Vite SPA
├─ build/          App icon + icon generator
└─ package.json    The Electron app + electron-builder config
```

### Run in development

The backend and frontend run as two dev servers (hot reload), the same as any web app:

```bash
cd backend
npm install
npm run dev          # Express on http://localhost:5000
```

```bash
cd frontend
npm install
npm run dev          # Vite on http://localhost:5173
```

Open http://localhost:5173. In dev, `frontend/.env` points the SPA at `http://localhost:5000`.

### Run the desktop shell in development

To run the packaged experience (Electron window serving the built SPA) without building an
installer:

```bash
npm install              # at the repo root — installs Electron + prod deps
npm run build:frontend   # produces frontend/dist (same-origin build)
npm start                # opens the VyapaarSetu window
```

### Tests

```bash
cd backend
npm test                 # vitest — schema, migrations, money, reconciliation
```

### Build the Windows installer

```bash
npm install              # at the repo root
npm run dist             # → release\VyapaarSetu Setup <version>.exe
```

`npm run dist` builds the frontend and runs electron-builder (NSIS). The bundled
`better-sqlite3` ships as a portable **N-API prebuild**, so no native rebuild or C++
toolchain is needed on the build machine (`npmRebuild: false`).

The app icon (`build/icon.png`) is committed. Regenerate it from the SVG favicon only if the
art changes:

```bash
npm run make-icon        # favicon.svg → build/icon.png (needs the sharp devDependency)
```

---

## ☁️ Google Drive backup (optional)

Drive sync is inert unless OAuth credentials are provided via environment variables
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`). To enable it, create an
OAuth Client in the [Google Cloud Console](https://console.cloud.google.com):

1. Create a project, enable the **Google Drive API**.
2. On the **OAuth consent screen**, add the scope `https://www.googleapis.com/auth/drive.file`
   and add your Google account as a test user.
3. Create an **OAuth client ID** (Web application) with redirect URI
   `http://localhost:5000/api/drive/oauth-callback`.
4. Supply the Client ID/Secret to the app via the environment. Local backups work without any
   of this.

---

## 🚧 Known limitations

- **Not code-signed** — Windows SmartScreen warns on first run (*More info → Run anyway*).
- **Google Drive** needs OAuth env vars to activate; otherwise only local backups run.
- **Fonts** are loaded from Google Fonts; offline, the app falls back to system fonts.
- **Single-PC, localhost only** — designed for one shop machine, not multi-device sync.
- **No auto-update** — install a newer build over the old one; your data folder is preserved.

---

## 🩺 Troubleshooting

**The app won't start / "failed to start its local server."**
Your data folder may not be writable, or another VyapaarSetu instance is running. It stores
data in `%APPDATA%\VyapaarSetu`; ensure that path is writable.

**Deleted customers/vegetables still appear on old bills.**
By design — VyapaarSetu soft-deletes, hiding records from pickers while keeping them so
historical invoices still render. Customers with an outstanding balance can't be deleted.

**Dashboard shows a ledger mismatch.**
The reconciliation check found a customer whose stored balance differs from the sum of their
passbook. Open that customer to review their entries.

---

*Built with ❤️ for the local vegetable-market community.*
