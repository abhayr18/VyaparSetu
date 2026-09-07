/**
 * Timezone check for the shared local-date helpers.
 *
 * There is no test harness on the frontend, and `dates.js` decides which day an entry
 * belongs to and what time the vendor sees against it. Both of its bugs are silent — a
 * wrong day still looks like a day, and a time 5h30m early still looks like a plausible
 * time to sell vegetables — so nobody would report them. This runs on plain node, with
 * no tooling:
 *
 *     node src/utils/__checks__/dates.check.mjs
 *
 * Written to pass in any timezone. Where a case can only be meaningful away from UTC it
 * says so and skips rather than passing vacuously, and the script pins TZ to
 * Asia/Kolkata up front so the offset cases actually run on a developer machine.
 *
 * Exits non-zero if any case fails.
 */

// Set before the first Date is constructed. Node honours a runtime TZ change on Windows
// and Linux, but it is not guaranteed everywhere, so the result is verified rather than
// assumed and the IST-specific block is skipped if it did not take.
process.env.TZ = 'Asia/Kolkata';

const {
  getLocalDateString,
  parseLocalDate,
  shiftDateString,
  daysSince,
  formatStoredTime,
} = await import('../dates.js');

const OFFSET_MINUTES = -new Date().getTimezoneOffset(); // +330 in IST
const IS_UTC = OFFSET_MINUTES === 0;
const PINNED_TO_IST = OFFSET_MINUTES === 330;

let failures = 0;
let checks = 0;
let skipped = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log(`skip  ${label}  (${why})`);
}

console.log(`running at UTC${OFFSET_MINUTES >= 0 ? '+' : '-'}${Math.abs(OFFSET_MINUTES) / 60}\n`);

// ── getLocalDateString: local parts, never a UTC conversion ─────────────────────
// The bug this replaces is `toISOString().slice(0,10)`. It only shows up at the edges
// of the day, which is exactly when a vendor is closing the books.
check('midday is its own date',            getLocalDateString(new Date(2026, 7, 28, 12, 0)),  '2026-08-28');
check('23:30 does not roll to tomorrow',   getLocalDateString(new Date(2026, 7, 28, 23, 30)), '2026-08-28');
check('00:15 does not roll to yesterday',  getLocalDateString(new Date(2026, 7, 28, 0, 15)),  '2026-08-28');
check('23:59:59 stays on the same day',    getLocalDateString(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31');
check('single-digit month and day pad',    getLocalDateString(new Date(2026, 0, 5)),          '2026-01-05');

// ── parseLocalDate: a bare date is local midnight, not UTC midnight ─────────────
// `new Date('2026-08-14')` is UTC midnight, which reads back as the 13th west of
// Greenwich. Splitting the parts is what avoids it.
const parsed = parseLocalDate('2026-08-14');
check('parses to the day asked for', [parsed.getFullYear(), parsed.getMonth(), parsed.getDate()], [2026, 7, 14]);
check('parses to local midnight',    [parsed.getHours(), parsed.getMinutes()], [0, 0]);

for (const bad of ['', null, undefined, 'garbage', '2026-8', '2026']) {
  check(`unparseable ${JSON.stringify(bad)} is null, not Invalid Date`, parseLocalDate(bad), null);
}

// Round-trip across boundaries a naive implementation gets wrong.
for (const s of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-08-28', '2026-12-31']) {
  check(`round-trip ${s}`, getLocalDateString(parseLocalDate(s)), s);
}

// ── shiftDateString: month, year and leap boundaries ───────────────────────────
check('step back within a month',   shiftDateString('2026-08-28', -1), '2026-08-27');
check('step back over month start', shiftDateString('2026-08-01', -1), '2026-07-31');
check('step back over year start',  shiftDateString('2026-01-01', -1), '2025-12-31');
check('step forward over month end',shiftDateString('2026-08-31', 1),  '2026-09-01');
check('step forward over year end', shiftDateString('2026-12-31', 1),  '2027-01-01');
check('non-leap Feb has no 29th',   shiftDateString('2026-02-28', 1),  '2026-03-01');
check('leap year does',             shiftDateString('2024-02-28', 1),  '2024-02-29');
check('leap day steps to March',    shiftDateString('2024-02-29', 1),  '2024-03-01');
check('zero delta is identity',     shiftDateString('2026-08-28', 0),  '2026-08-28');
check('a week back',                shiftDateString('2026-03-03', -7), '2026-02-24');

// A bad value must come back unchanged, not as `NaN-NaN-NaN`. The date navigator binds
// this straight to an <input type="date">, and NaN there strands the vendor on a blank
// screen with no way back.
for (const bad of ['', null, undefined, 'garbage', '2026-8']) {
  check(`bad input ${JSON.stringify(bad)} survives a shift unchanged`, shiftDateString(bad, -1), bad);
}

// ── daysSince: relative to today, so the cases are written relative to today ────
const today = getLocalDateString();
check('today is 0 days ago',        daysSince(today), 0);
check('yesterday is 1',             daysSince(shiftDateString(today, -1)), 1);
check('5 days back is 5',           daysSince(shiftDateString(today, -5)), 5);
// Crossing a DST transition makes the raw gap 4.96 or 5.04 days; Math.round is what
// keeps that from reporting 4.
check('30 days back is 30',         daysSince(shiftDateString(today, -30)), 30);
check('365 days back is 365',       daysSince(shiftDateString(today, -365)), 365);
check('tomorrow is negative',       daysSince(shiftDateString(today, 1)), -1);
check('unparseable is null',        daysSince('garbage'), null);
check('null is null',               daysSince(null), null);

// ── formatStoredTime: SQLite CURRENT_TIMESTAMP is UTC ──────────────────────────
// `transactions.created_at` defaults to CURRENT_TIMESTAMP and the INSERT never sets it,
// so what lands on disk is UTC in `YYYY-MM-DD HH:MM:SS` with no zone marker. The
// expectation here is built from Date.UTC, which is the same instant expressed a
// different way — so the case is a genuine assertion in every timezone.
const opts = { hour: '2-digit', minute: '2-digit' };
const utcInstant = new Date(Date.UTC(2026, 7, 28, 9, 21, 0));
const expectedLocal = utcInstant.toLocaleTimeString('en-IN', opts);

check('a stored timestamp is read as UTC', formatStoredTime('2026-08-28 09:21:00', false), expectedLocal);

// The regression guard. Drop the appended Z and the bare string is read as local, which
// is the 5h30m-early bug. On a UTC machine the two are identical by definition, so the
// case is skipped rather than passed.
const naive = new Date('2026-08-28T09:21:00').toLocaleTimeString('en-IN', opts);
if (IS_UTC) {
  skip('reading it as local time is visibly wrong', 'indistinguishable at UTC+0');
} else {
  check('reading it as local time is visibly wrong',
    formatStoredTime('2026-08-28 09:21:00', false) !== naive, true);
}

// An already-zoned value is trusted as-is rather than having a second Z stapled on.
check('trailing Z is respected',      formatStoredTime('2026-08-28T09:21:00Z', false), expectedLocal);
check('lowercase z is respected',     formatStoredTime('2026-08-28T09:21:00z', false), expectedLocal);
check('an explicit +05:30 offset is the same instant',
  formatStoredTime('2026-08-28T14:51:00+05:30', false), expectedLocal);
check('an explicit -04:00 offset is the same instant',
  formatStoredTime('2026-08-28T05:21:00-04:00', false), expectedLocal);
check('ISO T separator without a zone is still UTC',
  formatStoredTime('2026-08-28T09:21:00', false), expectedLocal);
check('surrounding whitespace is tolerated',
  formatStoredTime('  2026-08-28 09:21:00  ', false), expectedLocal);

// Empty is empty, and garbage is empty — never the string 'Invalid Date' in a table cell.
for (const bad of ['', null, undefined, 0]) {
  check(`missing timestamp ${JSON.stringify(bad)} renders blank`, formatStoredTime(bad, false), '');
}
check('unparseable timestamp renders blank', formatStoredTime('not a date', false), '');
check('half a timestamp renders blank',      formatStoredTime('2026-13-45 99:99:99', false), '');

// Marathi formats the same instant, in Devanagari numerals. Only the locale differs.
check('Marathi renders the same instant',
  formatStoredTime('2026-08-28 09:21:00', true),
  utcInstant.toLocaleTimeString('mr-IN', opts));

// ── The concrete case from the bug report, with TZ pinned ──────────────────────
// A sale logged at 6:42 PM in Pune stores as 13:12 UTC. Read as local it prints 1:12 PM,
// which is wrong in a way nobody questions. Asserting the digits rather than the whole
// string keeps this stable across ICU versions, which disagree about "pm" vs "PM".
if (PINNED_TO_IST) {
  check('a 6:42 PM sale prints as 6:42, not 1:12',
    formatStoredTime('2026-08-28 13:12:00', false).includes('06:42'), true);
  check('and the 5h30m-early bug would have printed 01:12',
    naive.includes('09:21'), true);
} else {
  skip('a 6:42 PM sale prints as 6:42, not 1:12', 'TZ could not be pinned to Asia/Kolkata');
  skip('and the 5h30m-early bug would have printed 01:12', 'TZ could not be pinned to Asia/Kolkata');
}

console.log(`\n${checks - failures}/${checks} passed${skipped ? `, ${skipped} skipped` : ''}`);
if (failures > 0) process.exit(1);
