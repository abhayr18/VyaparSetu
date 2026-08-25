# VyapaarSetu — Production Readiness Audit

**Date:** 2026-08-25
**Scope:** `backend/` (4,914 LOC), `frontend/src/` (10,330 LOC)
**Verdict:** Feature-complete demo. **Not production ready.** There are confirmed money-losing bugs in the credit ledger and a storage engine that will not survive the first year of use.

The feature surface is genuinely good — 11 modules, bilingual UI, transliteration, offline-first framing, print layouts. The gaps are not in *what* it does but in *correctness, durability, and operability*. This document lists every gap found, ordered by how much damage it does.

---

## Executive summary

| Severity | Area | Count | Headline |
|---|---|---|---|
| **P0 — Blocker** | Financial correctness | 5 | Customer debt doubles when a bill is generated; deleting an entry never refunds the debt |
| **P0 — Blocker** | Storage engine | 2 | Every single write rewrites the entire DB file; write cost grows linearly and is already 4× slower at 10k rows. Foreign keys are silently disabled by the first write |
| **P1 — Critical** | Security | 7 | Zero authentication, API bound to all network interfaces, `CORS: *`, OAuth tokens in plaintext |
| **P1 — Critical** | Data durability | 3 | Non-atomic DB writes — a power cut mid-save corrupts the whole ledger |
| **P2 — High** | Reliability | 6 | No error boundary (white screen on any render error), no pagination, N+1 queries |
| **P2 — High** | Testing | 4 | No test runner; the one "test" file writes to the live production database |
| **P3 — Medium** | Ops / packaging | 6 | No process manager, no packaging, vendor must run two terminals by hand |
| **P3 — Medium** | Frontend quality | 7 | 1.18 MB single bundle, no code splitting, no offline support despite "offline-first" claim |

---

# P0 — Financial correctness

These were **verified empirically** by running the real service layer against a copy of the database. Output is reproduced verbatim.

```
start balance      : 0    | ledger rows: 0
tx created         : final= 1080
after 1 credit tx  : 1080 | ledger rows: 1
bill generated     : final= 1080 remaining= 1080
AFTER BILL GEN     : 2160 | ledger rows: 2      <-- debt DOUBLED
2nd bill gen ok?   : true | balance now: 3240    <-- TRIPLED
tx deleted         : true
AFTER TX DELETE    : 3240 | ledger rows: 3      <-- delete refunded NOTHING
commission_rate=8  : base= 100 commission= 800 final= 900   <-- 800% commission
```

### P0.1 — Generating a bill from transactions doubles the customer's debt

`backend/services/transactionService.js:147` → `backend/models/billModel.js:146`

`createTransaction` already adds `remaining_amount` to `customers.credit_balance` and writes a `CREDIT_ADDED` ledger row (`transactionService.js:123-135`). `generateBillFromTransactions` then calls `billModel.create()` with that *same* `remaining_amount`, and `billModel.create` **independently** does `credit_balance = credit_balance + rem` plus another `CREDIT_ADDED` row.

A vendor who enters the day's udhar entries and then prints the consolidated day bill has just double-billed the customer. **This is the primary intended daily workflow.**

**Fix:** `generateBillFromTransactions` must consolidate *already-recorded* debt, not re-record it. Either (a) pass `remaining_amount: 0` and link the existing `credit_transactions` rows to the new `bill_id`, or (b) have transactions not touch `credit_balance` at all and make bill generation the single point where debt is booked. Option (b) is cleaner — one writer for the balance.

### P0.2 — Bill generation is not idempotent

Same call site. Nothing checks whether a bill already exists for that `(customer_id, date)`. Clicking "Generate Today's Bill" twice creates two bills and adds the debt twice again (₹2160 → ₹3240 above). A double-click or a retry after a timeout silently corrupts the ledger.

**Fix:** unique index on `bills(customer_id, date)` for transaction-derived bills, or mark transactions as `consolidated_bill_id` and refuse to re-consolidate. Add a `UNIQUE` constraint so the DB enforces it even if the code forgets.

### P0.3 — Deleting a transaction does not reverse the credit balance

`backend/services/transactionService.js:291` → `backend/models/transactionModel.js:192`

`deleteById` runs a bare `DELETE FROM transactions WHERE id = ?`. It does not decrement `credit_balance` and does not reverse the `CREDIT_ADDED` ledger row. Compare `billModel.remove()` (`billModel.js:257`), which *does* reverse correctly — so the codebase knows the pattern, it just wasn't applied here.

Every mistyped entry that gets deleted leaves phantom debt on a real customer's account, permanently.

**Fix:** wrap delete in a transaction that reverses the balance and writes a compensating ledger entry (never delete ledger history — append a reversal).

### P0.4 — `credit_transactions` cannot be traced back to a transaction

`backend/database/init.js:137-151`

The table has `bill_id` but no `transaction_id`. Ledger rows created by the transactions module (`transactionService.js:130`) are written with no foreign key at all — so there is no way to find, reverse, or audit them. This is *why* P0.3 exists: the reversal is not expressible with the current schema.

**Fix:** add `transaction_id INTEGER REFERENCES transactions(id)`, backfill where possible, and make every balance mutation carry a link to its source document.

### P0.5 — The configurable commission rate is ignored in 3 of 4 code paths

Settings exposes "Default Commission Rate (%)" and stores `commission_rate = '8'`. What actually happens:

| Path | Behaviour | File |
|---|---|---|
| `POST /api/bills` | ✅ reads settings correctly | `billService.js:104-116` |
| Bill modal on-screen total | ❌ hardcoded `8.0` / `* 0.08` | `BillModal.jsx:281-282` |
| Transaction entry | ❌ hardcoded `0.08` | `TransactionEntry.jsx:131` |
| Transaction → bill | ❌ hardcoded `8.0` | `transactionService.js:194` |
| UI labels | ❌ hardcoded "Commission (8%)" | `en.json:234`, `mr.json:234` |

Two consequences. First, setting the rate to 6% changes nothing except the `/api/bills` stored value — so **the total the vendor sees on screen differs from the total that gets saved and printed**. Second, there is a **unit mismatch**: `bills.commission_rate` is a percentage (`8.0`), `transactions.commission_rate` is a fraction (`0.08`), and settings stores a percentage. Passing the settings value into the transaction path yields the 800% commission shown in the probe output above.

**Fix:** one unit (store percentage everywhere), one resolver function used by every path, and derive the UI label from the setting. Add a `CHECK (commission_rate BETWEEN 0 AND 100)` constraint.

### P0.6 — Money stored as floating point

Every amount column is `REAL` (`init.js`). Float arithmetic on currency accumulates drift, and the code papers over it with `.toFixed(2)` in ~40 places and `Number.EPSILON` nudges (`calculation.js:7`). For a ledger that must reconcile, this is the wrong representation.

**Fix:** store integer paise (`INTEGER`), format at the edges only. This is a migration, so schedule it before the data volume grows — it gets harder every month.

### P0.7 — Transaction creation is not atomic

`transactionService.js:104-136`. `transactionModel.create()` calls `saveDb()` internally (`transactionModel.js:69`), *then* the service updates `credit_balance` and inserts the ledger row, then calls `saveDb()` again. There is no `BEGIN`/`COMMIT` around the three operations. A crash between them leaves a transaction with no corresponding debt, or debt with no ledger row.

`billModel` and `creditModel` do this correctly. The transactions module — the newest, uncommitted code — does not.

**Fix:** single `BEGIN`/`COMMIT` in the service, one `saveDb()` after `COMMIT`. Remove `saveDb()` from model functions entirely so models compose.

---

# P0 — Storage engine

### P0.8 — `sql.js` rewrites the entire database file on every write

`backend/database/db.js:61-73`. `saveDb()` does `db.export()` (serialize the whole DB to a byte array) followed by `fs.writeFileSync` (rewrite the whole file). This is called after **every** insert, update, and delete.

Measured on this codebase:

| Rows in `transactions` | DB file size | ms per insert |
|---|---|---|
| 600 | 164 KB | 0.89 |
| 2,100 | 388 KB | 1.12 |
| 5,100 | 836 KB | 1.56 |
| 10,100 | 1.58 MB | **3.59** |

Cost per write grows linearly with total database size — a 4× slowdown across the first 10k rows. At 100 entries/day that is reached in ~3 months. Extrapolated to a 50 MB database (2–3 years), every keystroke-triggered save costs ~100 ms of **synchronous, event-loop-blocking** work, freezing the entire app for every connected device.

Three compounding problems:
1. **O(n) writes.** Unavoidable with `sql.js` — it has no incremental persistence.
2. **Blocking.** `writeFileSync` + `export()` are synchronous on Node's single thread.
3. **Non-atomic.** `writeFileSync` truncates then writes. A power cut mid-write leaves a **truncated, unopenable database** — total data loss for a business with no other record. For a market vendor on unreliable power this is not hypothetical.

**Fix — the single highest-value change in this document:** replace `sql.js` with **`better-sqlite3`**. It is a real embedded SQLite: incremental writes (O(size of change), not O(size of DB)), WAL mode, crash-safe atomic commits, and genuine transactions. The API is synchronous like `sql.js`, so the model layer's shape barely changes — `db.exec(sql, params)` becomes `db.prepare(sql).all(params)`, and every `saveDb()` call simply disappears.

The historical objection to `better-sqlite3` was native compilation; it now ships prebuilt binaries for Windows/macOS/Linux on all supported Node versions. If native modules are genuinely unacceptable, the fallback is to keep `sql.js` but make `saveDb()` (a) atomic via write-to-temp + `fs.rename`, (b) debounced/batched rather than per-statement, and (c) asynchronous. That mitigates corruption and blocking but **not** the O(n) growth — it is a stopgap, not a fix.

### P0.9 — Foreign keys are declared throughout the schema and enforced only until the first write

*Found during Phase 0 implementation, after the initial audit. It is the reason several of the P0 bugs above could corrupt data as far as they did.*

`backend/database/db.js`. `initDb()` runs `PRAGMA foreign_keys = ON` once, at startup. Every `FOREIGN KEY` clause in the schema depends on it, because SQLite defaults the pragma to **off** and it is a **per-connection** setting.

`saveDb()` calls `db.export()` after every write. In `sql.js`, `export()` closes the SQLite connection and reopens it to serialize the file. The reopened connection is a *new* connection, and it starts with `foreign_keys` back at its default of off.

So the enforcement window is: on at boot, off from the first insert onward, for the entire life of the process. Every `REFERENCES` clause in `init.js` was decoration. Empirically — this is the assertion in `tests/invariants/persistence.test.js:235`:

```
PRAGMA foreign_keys immediately after initDb()      → 1
PRAGMA foreign_keys after one customer is created   → 0
```

What that permits, all of which the money tests then confirmed:
- `bill_items` rows pointing at a `vegetable_id` that does not exist — a printed bill line item for a vegetable the shop never carried.
- `credit_transactions` rows pointing at a deleted `bill_id` or `customer_id` — debt attached to nobody, which still counts toward the shop's outstanding total.
- `billModel.remove()` deleting a `bills` row while its `bill_items` children remain, since nothing rejected the parent delete. The orphans then attach to whatever `bills.id` SQLite reuses next.

This is quieter than the other P0s and worse in one specific way: the ledger bugs produce a *wrong number*, which a vendor can eventually notice. This produces rows that are *unexplainable* — no path back to the customer or the sale — and there is nothing to notice until someone asks where a figure came from.

**Fix:** re-apply the pragma at every point a connection can be created — in `initDb()`, in `reloadDb()`, and in `saveDb()` immediately after `export()`. A single `applyConnectionPragmas(handle)` used by all three keeps the three call sites from drifting. This is also why the Phase 1 migration to `better-sqlite3` matters here: a real connection that is never silently reopened makes this class of bug structurally impossible rather than something the code has to remember.

Note that turning enforcement on for the first time *breaks code that was relying on it being off* — `billModel.remove()` was deleting parents before children and started failing immediately. That is the fix working. Migrations must also run with `PRAGMA foreign_keys = OFF` explicitly, since the drop-and-rename table rebuild pattern legitimately needs it disabled.

---

# P1 — Security

### P1.1 — No authentication or authorization whatsoever

There is no auth middleware, no session, no login. Every endpoint — including `POST /api/backup/restore`, `POST /api/drive/restore`, `DELETE /api/customers/:id`, and `PUT /api/settings/:key` — is open to any caller.

### P1.2 — The API listens on every network interface

`server.js:44` — `app.listen(PORT)` with no host argument binds `0.0.0.0`. Combined with P1.1, **anyone on the same network as the shop PC can read the entire customer ledger, alter balances, or wipe the database** with a single `curl`. In a mandi with shared WiFi this is a live exposure of customer names, mobile numbers, and debt records.

**Fix:** bind `127.0.0.1` explicitly for single-machine deployment. If LAN/multi-device access is required, that is a real auth requirement — a PIN or password gate with a signed session cookie, plus HTTPS.

### P1.3 — `CORS: origin: '*'`

`server.js:20`. Any website the vendor visits can issue authenticated-by-default requests to `localhost:5000` and read or destroy the ledger.

**Fix:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })`.

### P1.4 — No security headers, no rate limiting, no body size limit

No `helmet`, no `express-rate-limit`, and `express.json()` with no `limit` option (default 100 KB, but the backup/restore paths accept unbounded streams). No `compression`.

**Fix:** add `helmet`, `compression`, `express.json({ limit: '1mb' })`, and rate-limit the expensive endpoints (`/api/backup/*`, `/api/drive/*`, `/api/reports/*`).

### P1.5 — Google OAuth refresh tokens stored in plaintext

`googleDriveBackupService.js:50` writes `drive_tokens.json` unencrypted. A refresh token is effectively permanent access to the user's Drive scope. Any process or person with filesystem read access takes it.

**Fix:** encrypt at rest with a key from the OS keychain (`keytar`) or a machine-derived key; set restrictive file permissions; treat this file as a secret in every backup path (**note:** it currently sits in `database/`, next to the DB — confirm it is never swept into a backup archive).

### P1.6 — OAuth flow has no `state` parameter

`googleDriveBackupService.js:74-80`. `generateAuthUrl` omits `state`, so the callback (`/api/drive/oauth-callback`) will accept an authorization code from anywhere — a classic CSRF / code-injection vector that can bind the vendor's app to an attacker's Drive account.

**Fix:** generate a random `state`, store it server-side, verify on callback.

### P1.7 — `restoreFromDrive` accepts an arbitrary file ID with no validation

`googleDriveBackupService.js:231`. Any `driveFileId` is downloaded and written over the live database. There is no check that the file lives in the app's own folder, no size cap (disk exhaustion), and no verification that the bytes are a valid SQLite database before overwriting.

The local restore path (`backupService.js:93-110`) is notably better — it has a proper path-traversal guard. Apply the same rigour here.

**Fix:** verify the file's parent is the app folder, cap the download size, check the `SQLite format 3\0` magic header **and** run `PRAGMA integrity_check` plus a schema sanity check on a temp copy *before* swapping it in.

### P1.8 — Google credentials absent from the actual `.env`

`backend/.env` contains only `PORT`, `NODE_ENV`, `DB_PATH`. The `GOOGLE_*` vars documented in `.env.example` and the README are missing, so `new google.auth.OAuth2(undefined, undefined, undefined)` is constructed at import time (`googleDriveBackupService.js:17`) and the entire Drive module fails at runtime with an opaque error. There is no startup validation of required config.

**Fix:** validate required env vars at boot and fail fast with a clear message; feature-flag the Drive module off when unconfigured so the UI can hide it rather than erroring.

---

# P1 — Data durability

### P1.9 — Non-atomic writes (see P0.8) — the single most likely cause of total data loss.

### P1.10 — No automatic backups

`backupService` is fully manual — the vendor must remember to click. There is no scheduler, no retention policy, and no backup-on-startup/shutdown. The two files in `backups/` are from **2026-06-14**, two months stale.

**Fix:** scheduled backup (daily + on clean shutdown), rotation/retention (keep N daily, M weekly), and a dashboard warning when the last backup is older than 24h. The dashboard already surfaces `lastBackup` — make it actionable.

### P1.11 — Backups are never verified

Nothing checks that a written backup is a valid, openable, non-corrupt SQLite file. An unverified backup is not a backup.

**Fix:** after writing, open the file and run `PRAGMA integrity_check` plus a row-count sanity check. Record the result in the backup metadata.

### P1.12 — Two divergent database files, caused by a path-resolution bug

`db.js:17` — `path.resolve(process.env.DB_PATH || './database/vyapaarsetu.db')` resolves relative to **`process.cwd()`**, whereas `backupService.js:7` resolves `BACKUP_DIR` relative to **`__dirname`**. Two different conventions in the same app.

The evidence that this already bit: there are two live databases, `backend/database/vyapaarsetu.db` (73 KB, modified Aug 25) and `database/vyapaarsetu.db` (73 KB, modified Aug 14). Starting the server from the wrong directory silently opens or **creates** a different database — the vendor's day of work vanishes with no error.

**Fix:** resolve all paths from a single explicit application root; refuse to start if `DB_PATH` resolves outside it; log the absolute resolved path at boot (it already does — but nobody reads logs, so surface it in the health endpoint and the UI too).

---

# P2 — Reliability & correctness

### P2.1 — No React error boundary → white screen of death

No `ErrorBoundary` or `componentDidCatch` anywhere in `frontend/src`. Any render-time exception in any component unmounts the whole app to a blank page, mid-sale, with no recovery path and no indication that data was or wasn't saved.

**Fix:** an error boundary at the router level and per-page, with a "reload / report" affordance.

### P2.2 — Today's dashboard ignores the transactions module

`dashboardService.js:30-40` aggregates **only** the `bills` table. The transactions/udhar flow writes to `transactions`. So a vendor who enters 80 udhar entries sees "Today's Sales: ₹0" and "Commission: ₹0" until a bill is generated. The dashboard silently understates the day's business.

**Fix:** aggregate across both, or (better) make bills the single source of truth for reporting and always derive them from transactions.

### P2.3 — Timezone bug that specifically breaks early-morning trading

`created_at` is `CURRENT_TIMESTAMP`, which SQLite stores in **UTC**. `dashboardService.js:55` and `reportModel.js:106,116` compare `date(created_at)` against a **local** date string. In IST (UTC+5:30) every payment recorded between **00:00 and 05:30 local time is attributed to the previous day**.

APMC vegetable markets trade from roughly 3 AM. This misfiles a large share of the actual business day.

`creditModel.js:32,41` uses `date('now','localtime')` — the correct-ish convention — so the two modules **disagree with each other** on what "today" means, and the dashboard and the credit summary will show different numbers for the same day.

**Fix:** pick one convention. Store explicit local date columns (`transaction_date` already does this correctly) or store UTC and convert consistently at every read via a single shared helper. Add a test with a 02:00 IST timestamp.

### P2.4 — No pagination anywhere

`GET /api/transactions`, `/api/bills`, `/api/customers` all return every row ever created. Measured: **10,100 transactions → 4.4 MB of JSON per request**. Rendered into a React list with no virtualisation.

**Fix:** cursor or offset pagination on all list endpoints, with a server-enforced max page size; virtualise the long tables.

### P2.5 — N+1 queries on every bill list

`billModel.js:22-33` — `findAll()` fetches all bills, then issues a separate `getByBillId` query **per bill**. 36,500 bills (one year at 100/day) → 36,501 queries per page load.

**Fix:** one `JOIN` (or one `WHERE bill_id IN (...)`) and group in memory.

### P2.6 — Backend validation error messages never reach the user

Controllers return `{ success: false, error: "Discount cannot exceed subtotal" }` (a **string**). The axios interceptor at `apiService.js:25` reads `error.response?.data?.error?.message` — a **nested object** path that is always `undefined` for controller responses. Only the `errorHandler` middleware produces that shape.

Net effect: the user sees *"Request failed with status code 400"* instead of the specific, already-written, already-translated reason. Every carefully crafted validation message in `billService`, `creditService`, and `customerService` is silently discarded.

**Fix:** one response envelope used by every controller *and* the error handler, and make the interceptor tolerant of both shapes during migration.

### P2.7 — Errors swallowed to console

e.g. `useTransactions.js:48` — `catch (err) { console.error(...) }`. If the backend is down, master data silently fails to load and the vendor sees empty dropdowns with no explanation.

**Fix:** surface load failures in the UI; add a global "backend unreachable" banner driven by the existing health endpoint.

### P2.8 — Destructive auto-migration in the startup path

`init.js:71-82`: if the `bills` table lacks a `subtotal` column, the code runs `DROP TABLE bills` and `DROP TABLE bill_items` — **silently destroying all invoice history** on startup. It is guarded by a probe, but any future schema drift that trips this condition wipes the vendor's billing records with a single `logger.info` as the only trace.

The rest of `init.js` is a hand-rolled sequence of `try { SELECT col } catch { ALTER TABLE }` probes with swallowed errors (`init.js:194-197`) and no version tracking, no ordering guarantees, and no rollback.

**Fix:** a real migration system — a `schema_version` table, numbered forward-only migration files, each in a transaction, backup taken before any migration runs. **Never** `DROP TABLE` on data.

### P2.9 — Fragile inserted-row-ID retrieval

`transactionModel.js:71-76` uses `SELECT MAX(id) FROM transactions WHERE customer_id = ?`; `billModel.js:136` uses `SELECT id FROM bills WHERE bill_number = ?`. Both are indirect substitutes for `last_insert_rowid()`, and `MAX(id)` returns the wrong row under any concurrency or ID reuse.

**Fix:** `last_insert_rowid()` (or `better-sqlite3`'s `.lastInsertRowid`).

### P2.10 — Sign lost on credit adjustments

`creditModel.js:127` stores `Math.abs(amount)` for `CREDIT_ADJUSTMENT`, so the ledger cannot tell an increase from a decrease. Worse, `customerModel.getLedger()` (`customerModel.js:195-200`) computes its summary from `CREDIT_ADDED` and `PAYMENT_RECEIVED` only — **adjustments are excluded entirely**, so the printed ledger summary will not reconcile against `credit_balance` for any customer who has ever been adjusted.

**Fix:** store the signed amount, include adjustments in the summary, and add a reconciliation test asserting `sum(ledger) == credit_balance` for every customer.

### P2.11 — SQL string interpolation

`transactionService.js:127` — `db.exec(\`SELECT credit_balance FROM customers WHERE id = ${customer_id}\`)`. The single interpolated SQL sink in the codebase (everything else is correctly parameterised). It happens to be shielded because `customer_id` is validated by a parameterised lookup earlier in the function, but it is one refactor away from being exploitable and should not exist.

**Fix:** parameterise it. Add an ESLint rule banning template literals in `db.exec`/`db.run` arguments.

### P2.12 — DNS lookup on every dashboard load

`dashboardService.js:111` → `backupService.checkInternetStatus()` does a live `dns.lookup('google.com')` on every dashboard render. For an **offline-first** app this adds latency and a timeout stall precisely when offline — the case it is meant to detect gracefully.

**Fix:** move connectivity detection to the client (`navigator.onLine` + a cheap probe against your own endpoint), or cache the result server-side with a short TTL and never block the dashboard response on it.

### P2.13 — Unvalidated settings keys

`settingsService.updateSettingByKey` accepts any key and any value — `PUT /api/settings/anything` inserts arbitrary rows, and `commission_rate` can be set to `"abc"` or `9999` server-side (only the *frontend* validates 0–100, `SettingsPage.jsx:44-47`).

**Fix:** whitelist keys with per-key type/range validators server-side.

### P2.14 — Soft-deleted customers silently inherit old debt on re-add

`customerModel.js:98-106`. Re-adding a previously deleted mobile number reactivates the old row **with its `credit_balance` intact**. Defensible as a feature, but it happens with no disclosure to the user.

**Fix:** surface it — "This mobile belongs to a previously removed customer with ₹X outstanding. Restore their account?"

---

# P2 — Testing & quality

### P2.15 — No test runner, no `npm test`

Neither `package.json` defines a `test` script. There is no Jest/Vitest/node:test setup and no CI.

### P2.16 — The one existing test writes to the live production database

`backend/tests/transactionTest.js:15` calls `initializeDatabase()` with the default `DB_PATH` — so running it **creates real customers, vegetables, transactions, and bills in the vendor's actual ledger**. It also uses `console.assert`, which prints and continues: the file cannot fail, so it cannot gate anything.

**Fix:** Vitest or `node:test`; every test against an isolated temp DB via `DB_PATH`; real assertions that exit non-zero.

### P2.17 — Zero coverage on the code most likely to lose money

`billingCalc.js` and `calculation.js` are pure functions — trivially testable, completely untested. Every P0 bug in this document would have been caught by a handful of unit tests.

**Priority test targets:** commission/discount/rounding maths, ledger reconciliation (`sum(ledger) == credit_balance`), transaction→bill consolidation, delete/reversal paths, backup→restore round-trip, timezone boundaries (02:00 IST).

### P2.18 — Backend lint is broken; no formatter; no CI

`backend/package.json:9` declares `"lint": "eslint ."` but there is **no `eslint.config.js` in `backend/`** and **`eslint` is not a backend devDependency** — the command fails outright (verified). No Prettier. No GitHub Actions or equivalent.

**Fix:** ESLint flat config for the backend, Prettier shared across both packages, a CI workflow running lint + test + build on every push.

### P2.19 — Uncommitted work and a single-commit history

`git log` shows exactly one commit ("first version is ready for demo"). Working tree has **7 modified files and 14 untracked files** — including the entire transactions module (`transactionModel.js`, `transactionService.js`, `transactionController.js`, `transactionRoutes.js`, `TransactionsPage.jsx`, and 5 more components), which is where most of the P0 bugs live.

That module is the newest code, is unreviewed, is uncommitted, and is the least correct part of the system. **Commit it before touching anything**, so the fixes below are reviewable diffs rather than indistinguishable from the original.

---

# P3 — Operations & packaging

### P3.1 — No process manager or supervision

`npm run dev` (nodemon) is the documented way to run it. If the backend crashes, it stays down. `bootstrap()` calls `process.exit(1)` on DB init failure with no restart.

**Fix:** PM2 or a Windows Service / systemd unit with restart-on-failure.

### P3.2 — No packaging — the vendor must run two terminals

Production requires manually starting a backend and a frontend dev/preview server. This is not a shippable artifact for a market vendor.

**Fix (recommended):** serve the built `frontend/dist` as static files from Express so there is **one** process on **one** port, then wrap it in **Electron** (or a Windows installer + service) for a double-click launch. This also removes the CORS problem entirely (same origin) and fixes `BrowserRouter` deep-linking, which currently has no history fallback.

### P3.3 — Stale build artifact committed to the working tree

`frontend/dist/` is present and dated **Aug 14** while `src/` has changed since. It is correctly gitignored, but a stale `dist` served in production would silently ship two-week-old code.

**Fix:** build in CI/release only; never keep a checked-in `dist`.

### P3.4 — `console.log` logging, no persistence, no rotation

`utils/logger.js` writes to stdout only. Under PM2/Electron/Windows Service, stdout goes nowhere the vendor can retrieve. When something goes wrong with a ledger, there is **no diagnostic trail**.

**Fix:** `pino` with file transport + rotation. Log every balance mutation with before/after values — for a financial app this is not optional.

### P3.5 — The `audit_log` table is created and never used

`init.js:30-39` defines `audit_log`; nothing writes to it. For a system tracking money owed by named individuals, an append-only audit trail of every mutation is a core requirement, and the schema is already sitting there.

**Fix:** write to it on every create/update/delete of bills, transactions, credit, customers, and settings — actor (once auth exists), action, before/after, timestamp.

### P3.6 — No health/readiness depth, no monitoring

`healthService.js` returns a hardcoded `version: '1.0.0'` (drifts from `package.json`) and probes only `SELECT 1`. It does not report the resolved DB path, DB size, last backup age, or migration version — all of which are the things that actually go wrong here.

**Fix:** extend the health payload with resolved paths, DB size, schema version, last-backup age, and integrity-check status; surface it in the UI.

---

# P3 — Frontend quality

### P3.7 — 1.18 MB single JS bundle, no code splitting

`frontend/dist/assets/index-B47fYnHT.js` is 1,182,865 bytes, plus 151 KB and 26 KB chunks. `jspdf` and `html2canvas` (heavy, needed only for PDF export) are eagerly bundled. No `React.lazy`, no manual chunks, no `build.rollupOptions`. `vite.config.js` is 7 lines with no build configuration at all.

**Fix:** lazy-load routes and the PDF/print path; `manualChunks` for vendor splitting. Target < 300 KB initial.

### P3.8 — "Offline-first" is a claim, not an implementation

No service worker, no PWA manifest, no IndexedDB queue, no optimistic writes. Every action requires a live HTTP round-trip to localhost. The app is *locally hosted*, which is not the same thing as offline-capable, and the distinction matters the moment it runs on a phone or tablet on the shop floor.

**Fix:** either implement it (service worker + write queue + reconciliation) or drop the claim from the README so expectations match reality.

### P3.9 — 10s axios timeout on long operations

`apiService.js:14` sets `timeout: 10000` globally. Drive upload/restore and large report generation will exceed it and surface as spurious failures — and a timed-out *restore* is exactly the case where the user must not be told "failed" ambiguously.

**Fix:** per-endpoint timeouts; long operations get generous limits or move to a job + poll pattern.

### P3.10 — No optimistic UI or request deduplication

Every mutation is a full round-trip and refetch. Nothing prevents double-submission — directly enabling the P0.2 duplicate-bill bug.

**Fix:** disable submit during flight, idempotency keys on mutating endpoints, optimistic updates for high-frequency entry.

### P3.11 — 1,813-line `globals.css` with heavy inline-style usage

`styles/globals.css` is 1,813 lines, and pages mix in long inline `style={{...}}` objects (e.g. `SettingsPage.jsx:153`). No CSS modules or scoping — high collision risk as the app grows.

### P3.12 — Accessibility and input hardening not assessed

Not audited in depth, but no focus management, ARIA, or keyboard-trap handling was observed in the modals. For a high-speed data-entry app used at 4 AM, keyboard-only operation is a productivity feature, not just compliance.

### P3.13 — No 404 route

`App.jsx:29-41` has no catch-all `<Route path="*">`. An unknown URL renders an empty layout.

---

# Recommended roadmap

Phases are ordered so that each one leaves the app in a strictly better state. **Phase 0 is not optional and nothing else should start before it.**

### Phase 0 — Stop the bleeding (1–2 days)
1. **Commit the uncommitted transactions module** so all subsequent work is reviewable.
2. Write failing tests for P0.1–P0.5 (they reproduce in minutes — the probe script in this audit is a starting point).
3. Fix the double-count (P0.1), idempotency (P0.2), delete-reversal (P0.3 + schema P0.4), commission unit (P0.5), and atomicity (P0.7).
4. Add the ledger reconciliation invariant as a test **and** as a runtime check surfaced on the dashboard.
5. ~~Audit the existing production data for already-doubled balances.~~ **Dropped — data confirmed disposable.** See "Decisions taken" below.

### Phase 1 — Make the data survive (2–4 days)
6. Migrate `sql.js` → `better-sqlite3` with WAL (P0.8). Delete every `saveDb()` call.
7. Real migration system with `schema_version`; **remove the `DROP TABLE` path** (P2.8).
8. Single path-resolution root; reconcile the two divergent DB files (P1.12).
9. Automatic scheduled + verified backups with retention (P1.10, P1.11).
10. Money as integer paise (P0.6) — do it here, while the dataset is still small.

### Phase 2 — Close the security gaps (2–3 days)
11. Bind to `127.0.0.1`; lock down CORS; add `helmet`, rate limits, body caps (P1.2–P1.4).
12. Decide the deployment model, then add auth accordingly (P1.1).
13. Encrypt Drive tokens; add OAuth `state`; validate restore sources and verify SQLite integrity before any swap (P1.5–P1.7).
14. Boot-time config validation; feature-flag Drive when unconfigured (P1.8).

### Phase 3 — Correctness and trust (3–5 days)
15. One timezone convention, with an 02:00 IST test (P2.3).
16. Dashboard and reports aggregate transactions too (P2.2).
17. One response envelope; fix the interceptor so validation messages reach users (P2.6).
18. Error boundaries + a backend-unreachable banner (P2.1, P2.7).
19. Pagination + fix the N+1 (P2.4, P2.5).
20. Populate `audit_log` on every mutation; structured file logging (P3.4, P3.5).

### Phase 4 — Ship it (3–5 days)
21. Serve `dist` from Express — one process, one port (P3.2).
22. Package as Electron or a Windows service + installer.
23. Code splitting and lazy loading to get under 300 KB initial (P3.7).
24. CI: lint + test + build; fix the broken backend lint (P2.18).
25. Rewrite the README against reality; drop or implement the offline-first claim (P3.8).

---

## Decisions taken (2026-08-25)

**Deployment model: single shop PC, localhost only.** Not LAN, not multi-device.

This materially simplifies Phase 2:
- **P1.1 (no authentication) is downgraded from blocker to deferred hardening.** The threat it defends against — other devices on the network — does not exist in this model. Build the middleware seam so it can be switched on later; do not enforce it now.
- **P1.2 is a one-line fix**: `app.listen(PORT, '127.0.0.1')`. That single change also neutralises the practical impact of P1.3 (`CORS: *`), and serving `dist` from Express (P3.2) removes cross-origin entirely.
- HTTPS is not required.
- Packaging target is confirmed: Electron or a Windows service + installer, one process, one port.

**Existing data: disposable demo.** No reconciliation needed.

This simplifies Phase 0 and Phase 1:
- **Phase 0 step 5 (audit and correct existing doubled balances) is dropped.** Nothing in the current DB needs preserving or correcting.
- Schema migrations may reset balances freely and drop/recreate tables during development.
- **P0.6 (money as integer paise) gets cheaper and moves earlier** — do it in Phase 1 as planned, with no data-migration risk. Deferring it only makes it harder.
- The two divergent DB files (P1.12) can simply be deleted and regenerated once path resolution is fixed.

### Revised phase ordering

Phase 0 loses its riskiest step; Phase 2 shrinks to the cheap hardening items and moves after Phase 3.

| Phase | Content | Est. |
|---|---|---|
| **0** | Commit transactions module; failing tests; fix P0.1–P0.5, P0.7; ledger reconciliation invariant | 1–2 days |
| **1** | `better-sqlite3` + WAL; migration system; path resolution; verified auto-backups; integer paise | 2–4 days |
| **2** | Bind localhost; helmet/rate-limit/body-cap; encrypt Drive tokens; OAuth `state`; restore validation; boot config validation | 1 day *(was 2–3)* |
| **3** | Timezone; dashboard aggregation; response envelope; error boundaries; pagination + N+1; audit log; structured logging | 3–5 days |
| **4** | Serve `dist` from Express; Electron/Windows packaging; code splitting; CI; README rewrite | 3–5 days |

Deferred (design the seam, don't build): authentication (P1.1), offline-first service worker (P3.8) — drop the README claim instead unless it's genuinely wanted.

---

## Implementation status

### Phase 0 — complete (2026-08-25)

Test suite: **136 passing, 9 files** (`cd backend && npm test`). It started at 68 passing / 29 failing, where every failure was a reproduction of a bug listed here. Nothing below was made to pass by weakening an assertion — every change was to application source.

| Gap | Status | What changed |
|---|---|---|
| **P0.1** debt doubles on bill generation | Fixed | `billModel.create(data, { bookCredit })`. There is now exactly one writer to `credit_balance` per unit of debt. A directly-entered bill books its own; a bill consolidated from transactions does not, because the transactions already did. |
| **P0.2** bill generation not idempotent | Fixed | `transactions.bill_id` marks consolidated rows. `markAsBilled` claims them with `WHERE bill_id IS NULL` and reports the row count; a second click finds nothing to claim and the bill is refused. The guard is in the `UPDATE`'s `WHERE`, not in a prior `SELECT`, so a concurrent double-submit cannot slip between the two. |
| **P0.3** delete doesn't reverse the balance | Fixed | `deleteTransaction` reverses the exact `CREDIT_ADDED` rows carrying its `transaction_id`, then deletes them, inside one transaction. It refuses outright once the transaction has been consolidated into a bill. |
| **P0.4** ledger rows untraceable | Fixed | `credit_transactions.transaction_id → transactions(id)`, migration 6. This is what makes P0.3 and P0.9's orphan detection possible — reversal needs to know which rows it owns. |
| **P0.5** commission rate ignored | Fixed | Percentage is canonical everywhere: `8.0` means 8%. `normalizeCommissionPercent` guards on `Number.isFinite` and `< 0` instead of `Number(x) \|\| 0.08`, which had made a deliberate 0% impossible. `frontend/src/utils/money.js` mirrors the backend so the on-screen preview cannot drift from the saved figure, and both entry screens now read the shop's configured rate rather than a hardcoded 8%. |
| **P0.7** transaction creation not atomic | Fixed | `db.transaction(fn)` with a depth counter, since SQLite has no nested `BEGIN` but the call graph nests (service → model). `saveDb()` no-ops while a transaction is open, which also closes a pre-existing hole: `billModel.create` was serializing the database mid-transaction via a nested `saveDb()`. |
| **P0.9** foreign keys silently off | Fixed | `applyConnectionPragmas` at all three points a connection can appear, including after every `export()`. |
| **P2.8** destructive auto-migration | Fixed | `backend/database/migrations.js` with `schema_version`. Nothing is dropped; every migration is guarded so it is a no-op on an already-correct database. The `DROP TABLE bills` path in `init.js` is gone. Pulled forward from Phase 1 because Phase 0's schema changes needed it. |
| **P2.9** fragile row-ID retrieval | Fixed | `last_insert_rowid()` replaces `SELECT MAX(id) WHERE customer_id = ?`, and runs before `saveDb()` rather than after. |
| **P2.10** sign lost on adjustments | Fixed | `creditModel.recordAdjustment` stores the signed amount. `customerModel.getLedger`'s summary folds signed adjustments into both sides, so `totalCredit − totalRecovered` lands exactly on `outstanding` — the three figures a vendor reads side by side while a customer does the subtraction. |
| **P2.11** SQL string interpolation | Fixed | The interpolated balance read in `transactionService` is parameterized. |
| **P2.15–P2.17** no test runner, test wrote to the live DB | Fixed | Vitest with `pool: 'forks'`. The harness redirects `DB_PATH` to a temp file and refuses to run if it detects it is pointing at the real shop database. |
| Ledger reconciliation as a runtime check | Done | `creditModel.findBalanceMismatches()` runs the same invariant the tests end on against live data; the dashboard shows which customers are affected and by how much. A check that cannot run reports as *not ok* rather than clean. |
| The upgrade path itself under test | Done | `tests/invariants/migration.test.js` boots the app against a database in an old shape — the case the rest of the suite is structurally blind to, since a new database is already current and every migration correctly finds nothing to do. Two fixtures: the schema read verbatim out of the database that failed to boot (what a shop PC upgrading today actually holds), and the earliest shape the migrations claim to handle (the only fixture that exercises migrations 2–4 at all — without it those three are code nothing ever runs). Each asserts the migrated schema converges with a fresh one column by column and index by index, that no row is lost, that `0.08` becomes `8.0` without changing what was charged, that a second boot is a no-op and does not multiply the rate again, that a rate the vendor had already configured is not reset to the default, and that a sale still books correctly afterwards. |

**One bug found by shipping, not by the suite.** The first boot against the real database failed outright: `no such column: bill_id`. The new baseline block created an index over a column that migration 7 adds. `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so against an older database the baseline's column list is aspiration rather than fact — and `CREATE INDEX` is the one statement that will not tolerate the gap. A second latent instance existed for `credit_transactions(transaction_id)`. Both indexes now live in their owning migration, next to the `ALTER TABLE` that adds the column, and the rule is written into the `init.js` header where the next person to add an index will read it.

The interesting part is why 118 passing tests said nothing. Every one of them started from `freshDb()`, where the column exists before the index is built. This is the failure mode a test count hides: the suite was not thin, it was pointed away from the seam. Putting the bad line back now fails all 18 migration tests, under both fixtures, with that exact boot error — checked, not assumed.

**Known limits of the Phase 0 fixes, stated rather than buried:**

- **The reconciliation check cannot see the bug that motivated it.** It detects *divergence* between `credit_balance` and the sum of the passbook. P0.1 doubled the debt by writing both sides together — a balance increment and a matching ledger row — so both were wrong by the same amount and the two still agreed. A vendor auditing that customer would find the passbook confirming the inflated balance. What the check does catch is a write that half-landed (the P0.7 atomicity class) and a sign stored backwards (P2.10). So the invariant tests are the primary defense here and this is a backstop, not the other way round.
- **Migration 5 cannot repair the 800% overcharges.** Converting the rate column leaves rows written as `base × 0.08` internally consistent, but rows written at a literal `8.0` were genuinely overcharged and no column conversion recovers the intended figure. The migration counts them (`commission_amount > base_amount`) and logs a warning naming the count, so an operator reviews and re-enters rather than a wrong number passing as correct. Moot for this deployment — the data is disposable — but it would matter on a real dataset.
- **P0.6 (money as floating point) is untouched.** Every fix above rounds to paise at each step, which contains the drift but does not remove it. Integer paise remains a Phase 1 item.
- **P0.8 stands.** `saveDb()` is now atomic (write-to-temp + `rename`) and deferred until after `COMMIT`, which removes the corruption-on-power-cut window and the mid-transaction serialization. The O(n)-per-write growth is unchanged and only the `better-sqlite3` migration fixes it. `better-sqlite3` 13.x was verified installable on this machine (SQLite 3.53.4), so Phase 1 has no blocker.
