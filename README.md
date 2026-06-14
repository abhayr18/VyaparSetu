# 🌿 VyapaarSetu — Vendor Management System

> **Offline-first, multilingual (Marathi + English) vegetable market vendor management system designed for APMC commission agents, traders, and wholesalers.**

---

## 📦 Completed Modules

1. **Dashboard & Metrics**: Visual analytics showing today's sales, commission totals, active customer counts, database health, network status, and recent transactions.
2. **Customer Management**: Profile registries with unique mobile numbers, credits ledgers, and phonetic Marathi name entries.
3. **Vegetable Catalog**: Vegetable master rates, package units (`kg`, `piece`, `bundle`, `dozen`), and phonetic search keywords.
4. **MarathiInput & Transliteration**: Real-time phonetic suggestions (typing English like `shevga` translates to `शेवगा`).
5. **Billing System**: Instant invoice generator supporting discounts, 8% standard commission rates, cash/UPI/credit payments, and Marathi amount-in-words parser.
6. **Udhar / Credit Ledger**: Customer credit accounts recording additions, manual adjustments, and payments.
7. **WhatsApp Bill Sharing**: Instant invoicing messages shared directly via WhatsApp Web API.
8. **Reports Module**: Generates daily/date-range sales reports, customer purchase sheets, vegetable sales weight logs, and agent commissions checklists.
9. **Backup & Restore**: Generates local timestamped database snapshots to `backups/` and performs transactional, fail-safe rollbacks if a restore fails.
10. **Bill Print / PDF Export**: Renders high-fidelity print receipts aligned to traditional APMC paper layouts.
11. **Google Drive Sync**: Securely uploads and downloads database snapshots from a private `MandaiMitra_Backups` folder in the vendor's Google Drive.

---

## ⚙️ Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |

---

## 🚀 Setup & Execution

### 1. Clone & Initialize Project

```bash
cd d:\VyapaarSetu
```

### 2. Configure Environment Variables

Create `.env` inside `backend/` (`backend/.env`):
```env
PORT=5000
NODE_ENV=development
DB_PATH=./database/vyapaarsetu.db
FRONTEND_URL=http://localhost:5173

# Google Cloud OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5000/api/drive/oauth-callback
```

Create `.env` inside `frontend/` (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000
```

### 3. Run Backend Server

```bash
cd backend
npm install
npm run dev        # Runs on http://localhost:5000
```

### 4. Run Frontend Client

```bash
cd ../frontend
npm install
npm run dev        # Runs on http://localhost:5173
```

---

## ☁️ Google Drive Credentials Setup

To enable Google Drive sync, configure an OAuth Client in the Google Cloud Console:
1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project named **VyapaarSetu**.
3. Go to **APIs & Services > Library** and search for **Google Drive API**. Click **Enable**.
4. Go to **APIs & Services > OAuth consent screen**:
   * Set User Type to **External**.
   * Fill out the app name and email fields.
   * Add the scope: `https://www.googleapis.com/auth/drive.file`.
   * Add your Google account under **Test users**.
5. Go to **APIs & Services > Credentials**:
   * Click **Create Credentials** and select **OAuth client ID**.
   * Select Application Type: **Web application**.
   * Under **Authorized redirect URIs**, add: `http://localhost:5000/api/drive/oauth-callback`.
6. Copy the generated **Client ID** and **Client Secret** into your `backend/.env` file.

---

## 🛢️ Storage Architecture

* **Active Database File**: `backend/database/vyapaarsetu.db` (pure SQLite loaded dynamically via in-memory `sql.js`).
* **Local Backups Folder**: `d:\VyapaarSetu\backups/`
  * Backup format: `backup-YYYY-MM-DD-HH-mm-ss.db`
* **Google OAuth Cache**: Tokens are saved locally at `database/drive_tokens.json`. This file is ignored by git to protect your accounts.

---

## 🛠️ Troubleshooting

#### 1. "Error: SQLite loaded from..." fails or DB fails to start
* **Solution**: Ensure your directory has write permissions. If the database file is corrupted, the restore system will automatically recover from the latest snapshot in the `backups/` directory.

#### 2. Google OAuth Redirect Fails or "Redirect URI mismatch"
* **Solution**: Check that the redirect URI inside Google Console matches `GOOGLE_REDIRECT_URI` in `backend/.env` exactly. It must not have trailing slashes.

#### 3. Deleted customer or vegetable names do not show up on old bills
* **Solution**: VyapaarSetu implements **soft-deletion**. When a customer is deleted, they are marked `is_deleted = 1` and hidden from search lists, but remain in the database so old invoices can display historical metrics correctly. Deleting customers with pending balances is strictly blocked.

---

*Built with ❤️ for the local vegetable market community.*
