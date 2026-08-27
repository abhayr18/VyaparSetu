/**
 * The vendor's day.
 *
 * `created_at` is written by SQLite's CURRENT_TIMESTAMP, which is UTC. Every date the
 * vendor sees or picks is a local calendar date. Five queries compared the two directly,
 * so for the width of the UTC offset every "today" figure was filed under the wrong day.
 *
 * This is not a rounding-error class of bug. An APMC vegetable market opens around 4am;
 * in IST that is 22:30 UTC *the previous day*. So the morning's collections — often the
 * bulk of the day's cash — were attributed to a day the vendor had already closed and
 * were missing from the day they were looking at. The money was never lost, which is
 * what made it dangerous: the totals looked plausible and simply excluded the morning.
 *
 * These tests pin all three affected surfaces. They are written to detect the bug in any
 * host timezone rather than only in IST, because the suite runs on machines that are not
 * the shop's PC — see localWallClockCrossingUtcDate below.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { freshDb, cleanupDbs, makeCustomer } from '../helpers/testDb.js';

afterAll(cleanupDbs);

/** Minutes the host is ahead of UTC. +330 in IST. */
const UTC_OFFSET_MINUTES = -new Date().getTimezoneOffset();

/**
 * A local wall-clock time on `day` whose UTC date is a *different* date.
 *
 * The bug only shows up at a local time that falls on the other side of UTC midnight, and
 * which time that is depends on which side of UTC the host sits:
 *
 *   east of UTC (IST, +05:30)   just after local midnight → previous day in UTC
 *   west of UTC (US, −05:00)    just before local midnight → next day in UTC
 *   exactly UTC                 no such time exists; the bug cannot manifest
 *
 * Returning null for the UTC case lets those tests skip honestly instead of passing
 * vacuously, which would leave a green suite over a live bug.
 */
function localWallClockCrossingUtcDate(day) {
  if (UTC_OFFSET_MINUTES === 0) return null;
  const hour = UTC_OFFSET_MINUTES > 0 ? 0 : 23;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 30, 0);
}

/** Formats an instant the way CURRENT_TIMESTAMP stores it: 'YYYY-MM-DD HH:MM:SS' in UTC. */
function asStoredTimestamp(instant) {
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

/** The local calendar date of an instant, as the vendor writes it. */
function asLocalDate(instant) {
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local midday, `daysAgo` days back. Same local and UTC date, so never a crossing case. */
function middayDaysAgo(daysAgo = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0);
}

/**
 * Writes a ledger row with an explicit created_at, bypassing the models.
 *
 * The models cannot express this: they let CURRENT_TIMESTAMP fill created_at, so there is
 * no way through them to place a row at a chosen instant.
 *
 * `credit_balance` is moved by the same signed amount, and balance_after_transaction is
 * the balance that results — so the fixture satisfies the ledger/balance invariant the
 * rest of the suite checks. A fixture that violated it would make the dashboard log a
 * reconciliation failure and would not resemble anything the app can produce. The sign
 * comes from the app's own creditLedger rather than a copy, for the reason that file exists.
 */
function insertLedgerRow(ctx, { customerId, type, rupees, storedAt }) {
  const { toPaise } = ctx.requireApp('utils/money.js');
  const { signOf } = ctx.requireApp('utils/creditLedger.js');

  const amount = toPaise(rupees);
  ctx.raw.run(
    'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?',
    [signOf(type) * amount, customerId]
  );
  const balanceAfter = Number(
    ctx.raw.exec('SELECT credit_balance FROM customers WHERE id = ?', [customerId])[0].values[0][0]
  );

  ctx.raw.run(
    `INSERT INTO credit_transactions
       (customer_id, transaction_type, amount, payment_mode, balance_after_transaction, created_at)
     VALUES (?, ?, ?, 'Cash', ?, ?)`,
    [customerId, type, amount, balanceAfter, storedAt]
  );
}

/**
 * A customer who already owed money before today, so a payment this morning does not
 * drive the balance negative. Dated a week back, which also proves the older credit is
 * not counted in today's figures.
 */
function customerOwing(ctx, rupees, name) {
  const customer = makeCustomer(ctx, name ? { name } : {});
  insertLedgerRow(ctx, {
    customerId: customer.id,
    type: 'CREDIT_ADDED',
    rupees,
    storedAt: asStoredTimestamp(middayDaysAgo(7)),
  });
  return customer;
}

describe('today’s figures use the vendor’s day, not UTC’s', () => {
  it('counts a payment collected in the early morning on the day it was collected', async () => {
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return; // host is on UTC; see the helper's docblock

    // Guard the premise: this instant must genuinely straddle UTC midnight, or the test
    // proves nothing. If it does not, the helper is wrong and we want to know.
    expect(asStoredTimestamp(earlyMorning).slice(0, 10)).not.toBe(asLocalDate(earlyMorning));

    const ctx = await freshDb();
    const customer = customerOwing(ctx, 10000, 'Abhay');

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 4200,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    const summary = ctx.creditModel.getSummary();
    expect(summary.today_recovered).toBe(4200);
    // The week-old credit is not today's activity, and must not leak into it.
    expect(summary.today_added).toBe(0);
  });

  it('counts credit extended in the early morning on the day it was extended', async () => {
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return;

    const ctx = await freshDb();
    const customer = makeCustomer(ctx);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'CREDIT_ADDED',
      rupees: 1850.75,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    expect(ctx.creditModel.getSummary().today_added).toBe(1850.75);
  });

  it('still counts a row written in the middle of the day', async () => {
    // The fix must not trade one edge for another: a midday row has the same local and
    // UTC date, and was the only case that worked before.
    const ctx = await freshDb();
    const customer = customerOwing(ctx, 5000);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 900,
      storedAt: asStoredTimestamp(middayDaysAgo(0)),
    });

    expect(ctx.creditModel.getSummary().today_recovered).toBe(900);
  });

  it('does not pull in a row that belongs to another day', async () => {
    const ctx = await freshDb();
    const customer = customerOwing(ctx, 8000);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 5000,
      storedAt: asStoredTimestamp(middayDaysAgo(7)),
    });

    expect(ctx.creditModel.getSummary().today_recovered).toBe(0);
  });
});

describe('the report for a chosen date agrees with the vendor’s calendar', () => {
  it('includes the early-morning trade of the date the vendor picked', async () => {
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return;

    const ctx = await freshDb();
    const reportModel = ctx.requireApp('models/reportModel.js');
    const customer = makeCustomer(ctx);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'CREDIT_ADDED',
      rupees: 3000,
      storedAt: asStoredTimestamp(earlyMorning),
    });
    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 1200,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    // The date the vendor types into the report is the local one.
    const { summary } = reportModel.getCreditSummary(asLocalDate(earlyMorning));

    expect(summary.credit_added).toBe(3000);
    expect(summary.credit_recovered).toBe(1200);
  });

  it('does not report that trade against the neighbouring UTC date', async () => {
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return;

    const ctx = await freshDb();
    const reportModel = ctx.requireApp('models/reportModel.js');
    const customer = makeCustomer(ctx);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'CREDIT_ADDED',
      rupees: 3000,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    // This is the date the buggy query filed the row under. Asking for it must now
    // return nothing — otherwise the row is being counted on two different days.
    const utcDate = asStoredTimestamp(earlyMorning).slice(0, 10);
    expect(reportModel.getCreditSummary(utcDate).summary.credit_added).toBe(0);
  });
});

describe('the dashboard’s recovery figure', () => {
  it('includes the morning’s collections', async () => {
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return;

    const ctx = await freshDb();
    const dashboardService = ctx.requireApp('services/dashboardService.js');
    const customer = customerOwing(ctx, 20000);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 7500,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    const summary = await dashboardService.getDashboardSummary();
    expect(summary.todaySummary.recoveryAmount).toBe(7500);
  });

  it('reports the same recovery figure as the credit summary', async () => {
    // These two numbers sit on screens the vendor switches between. When they disagree,
    // the vendor has no way to tell which one to trust.
    const earlyMorning = localWallClockCrossingUtcDate(new Date());
    if (!earlyMorning) return;

    const ctx = await freshDb();
    const dashboardService = ctx.requireApp('services/dashboardService.js');
    const customer = customerOwing(ctx, 20000);

    insertLedgerRow(ctx, {
      customerId: customer.id,
      type: 'PAYMENT_RECEIVED',
      rupees: 2650.25,
      storedAt: asStoredTimestamp(earlyMorning),
    });

    const summary = await dashboardService.getDashboardSummary();
    expect(summary.todaySummary.recoveryAmount).toBe(ctx.creditModel.getSummary().today_recovered);
  });
});

describe('businessDay helpers', () => {
  it('todayLocal is the host’s calendar date, not UTC’s', async () => {
    const ctx = await freshDb();
    const { todayLocal } = ctx.requireApp('utils/businessDay.js');
    expect(todayLocal()).toBe(asLocalDate(new Date()));
  });

  it('localDateSql converts a stored UTC timestamp to the local date', async () => {
    const instant = localWallClockCrossingUtcDate(new Date());
    if (!instant) return;

    const ctx = await freshDb();
    const { localDateSql } = ctx.requireApp('utils/businessDay.js');

    const res = ctx.raw.exec(`SELECT ${localDateSql('?')} AS d`, [asStoredTimestamp(instant)]);
    expect(res[0].values[0][0]).toBe(asLocalDate(instant));
  });

  it('todayLocal matches the SQL constant it is paired with', async () => {
    const ctx = await freshDb();
    const { todayLocal, TODAY_LOCAL_SQL } = ctx.requireApp('utils/businessDay.js');

    const res = ctx.raw.exec(`SELECT ${TODAY_LOCAL_SQL} AS d`);
    expect(res[0].values[0][0]).toBe(todayLocal());
  });
});
