import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paydayInMonth, nextPayday, proposeNextCycle, cycleClock, validateCycle,
  computeAllowance, computeBucketAllowance, weekWithinCycle, mergeBudgetAccounts, nextPaydayFrom, splitPayment, splitLines, velocitySeries, bucketBalance, parseAmountToCents, todayIn,
} from './budgetEngine.ts';
import type { Tx } from './budgetEngine.ts';

const rule = { type: 'monthly_day' as const, day: 25, weekend: 'previous_business_day' as const };

test('payday shifts off weekends', () => {
  assert.equal(paydayInMonth(2026, 10, rule), '2026-10-23'); // 25 Oct 2026 is a Sunday → Fri 23
  assert.equal(paydayInMonth(2026, 11, rule), '2026-11-25'); // Wednesday
  assert.equal(paydayInMonth(2026, 2, { type: 'monthly_day', day: 31 }), '2026-02-28'); // clamped
});

test('next cycle runs until the day before next payday', () => {
  const next = proposeNextCycle({ startDate: '2026-09-25', endDate: '2026-10-22' }, rule);
  assert.deepEqual(next, { startDate: '2026-10-23', endDate: '2026-11-24' });
  assert.equal(nextPayday('2026-12-31', rule), '2027-01-25');
});

test('manual rule keeps previous length', () => {
  const next = proposeNextCycle({ startDate: '2026-10-01', endDate: '2026-10-30' }, { type: 'manual' });
  assert.deepEqual(next, { startDate: '2026-10-31', endDate: '2026-11-29' });
});

test('cycle clock counts today as a day left', () => {
  const c = cycleClock({ startDate: '2026-10-23', endDate: '2026-11-24' }, '2026-10-29');
  assert.equal(c.totalDays, 33);
  assert.equal(c.daysElapsed, 6);
  assert.equal(c.daysLeft, 27);
  assert.equal(cycleClock({ startDate: '2026-10-23', endDate: '2026-11-24' }, '2026-11-24').daysLeft, 1);
});

test('overlap validation', () => {
  const others = [{ id: 'a', startDate: '2026-09-25', endDate: '2026-10-22' }];
  assert.match(validateCycle({ startDate: '2026-10-20', endDate: '2026-11-20' }, others)!, /Overlaps/);
  assert.equal(validateCycle({ startDate: '2026-10-23', endDate: '2026-11-24' }, others), null);
});

const cycle = { id: 'c1', startDate: '2026-10-23', endDate: '2026-11-24' };
const categories = [
  { id: 'groceries', isFixed: false }, { id: 'takeaway', isFixed: false }, { id: 'bills', isFixed: true },
];
const base: Tx[] = [
  { id: 'i1', kind: 'income', amountCents: 250000, occurredOn: '2026-10-23' },
  { id: 'i2', kind: 'income', amountCents: 180000, occurredOn: '2026-10-23' },
  { id: 'b1', kind: 'bucket_deposit', amountCents: 50000, occurredOn: '2026-10-23', bucketId: 'kids' },
  { id: 'b2', kind: 'bucket_deposit', amountCents: 30000, occurredOn: '2026-10-23', bucketId: 'car' },
  { id: 'f1', kind: 'expense', amountCents: 90000, occurredOn: '2026-10-24', categoryId: 'bills' },
];

test('allowance: reserves unpaid fixed bills and excludes bucket spending', () => {
  const txs: Tx[] = [
    ...base,
    { id: 'g1', kind: 'expense', amountCents: 6000, occurredOn: '2026-10-24', categoryId: 'groceries' },
    { id: 'g2', kind: 'expense', amountCents: 4000, occurredOn: '2026-10-27', categoryId: 'takeaway' },
    { id: 'k1', kind: 'expense', amountCents: 9999, occurredOn: '2026-10-27', categoryId: 'groceries', bucketId: 'kids' },
    { id: 'x1', kind: 'expense', amountCents: 50000, occurredOn: '2026-10-28', categoryId: 'groceries', deletedAt: '2026-10-28T10:00:00Z' },
    { id: 't1', kind: 'expense', amountCents: 2500, occurredOn: '2026-10-29', categoryId: 'groceries' },
  ];
  const r = computeAllowance({
    cycle, transactions: txs, categories, today: '2026-10-29',
    budgetLines: [{ categoryId: 'bills', plannedCents: 120000 }],
  });
  // 430000 − 80000 (buckets) − 90000 paid − 30000 reserved − 12500 flexible
  assert.equal(r.fixedReservedCents, 30000);
  assert.equal(r.spentFlexibleCents, 12500);
  assert.equal(r.remainingCents, 217500);
  assert.equal(r.daysLeft, 27);
  // as of start of today: 217500 + 2500 = 220000 / 27 = 8148
  assert.equal(r.dailyAllowanceCents, 8148);
  assert.equal(r.spentTodayCents, 2500);
  assert.equal(r.leftTodayCents, 5648);
  assert.equal(r.averageDailyRemainingCents, Math.floor(217500 / 27)); // 8055
  // Week Mon 26 Oct – Sun 1 Nov: spent this week 4000 (27th) + 2500 (29th); the 24th is last week.
  assert.equal(r.weekStart, '2026-10-26');
  assert.equal(r.weekEnd, '2026-11-01');
  assert.equal(r.spentThisWeekCents, 6500);
  // Thu 29 Oct: "За днес" 5648 + "На ден" 8055 × 3 days (Fri–Sun)
  assert.equal(r.weekRestDays, 3);
  assert.equal(r.weekAllowanceCents, 8148 + 3 * 8055);
  assert.equal(r.leftThisWeekCents, 5648 + 3 * 8055);
  assert.equal(r.status, 'on_track');
  // Kids' Fund as the default fund: 50000 in, 9999 paid on the 27th → 40001 over 27 days
  const k = computeBucketAllowance({ bucketId: 'kids', transactions: txs, cycle, today: '2026-10-29' });
  assert.equal(k.balanceCents, 40001);
  assert.equal(k.daysLeft, 27);
  assert.equal(k.dailyAllowanceCents, Math.floor(40001 / 27));
  assert.equal(k.leftTodayCents, Math.floor(40001 / 27));
  // a bucket payment today lowers today's share, not the even split
  const k2 = computeBucketAllowance({ bucketId: 'kids', cycle, today: '2026-10-29',
    transactions: [...txs, { id: 'k2', kind: 'expense', amountCents: 1000, occurredOn: '2026-10-29', categoryId: 'kids', bucketId: 'kids' }] });
  assert.equal(k2.dailyAllowanceCents, Math.floor(40001 / 27));
  assert.equal(k2.leftTodayCents, Math.floor(40001 / 27) - 1000);
  assert.equal(k2.averageDailyRemainingCents, Math.floor(39001 / 27));
  assert.equal(bucketBalance('kids', txs), 50000 - 9999);
});

test('forecast warns when pace exhausts funds before payday', () => {
  const heavy: Tx[] = [...base];
  for (let d = 23; d <= 28; d++)
    heavy.push({ id: `h${d}`, kind: 'expense', amountCents: 25000, occurredOn: `2026-10-${d}`, categoryId: 'groceries' });
  const r = computeAllowance({ cycle, transactions: heavy, categories, today: '2026-10-29', budgetLines: [] });
  // remaining = 430000 − 80000 − 90000 − 150000 = 110000, pace 25000/day → ~4 days
  assert.equal(r.remainingCents, 110000);
  assert.equal(r.paceCentsPerDay, 25000);
  assert.equal(r.status, 'overspending');
  assert.equal(r.runOutDate, '2026-11-02');
  assert.match(r.message, /runs out on 2026-11-02/);
});

test('overdrawn status', () => {
  const txs: Tx[] = [...base, { id: 'big', kind: 'expense', amountCents: 300000, occurredOn: '2026-10-25', categoryId: 'groceries' }];
  const r = computeAllowance({ cycle, transactions: txs, categories, today: '2026-10-29', budgetLines: [] });
  assert.equal(r.status, 'overdrawn');
  assert.equal(r.dailyAllowanceCents, 0);
});

test('velocity series ends at today with an even safe line', () => {
  const txs: Tx[] = [...base, { id: 'g', kind: 'expense', amountCents: 33000, occurredOn: '2026-10-25', categoryId: 'groceries' }];
  const s = velocitySeries({ cycle, transactions: txs, categories, today: '2026-10-29', budgetLines: [] });
  assert.equal(s.length, 7);
  assert.equal(s.at(-1)!.date, '2026-10-29');
  assert.equal(s.at(-1)!.actualCents, 33000);
  // flexible budget = 430000 − 80000 − 90000 = 260000 over 33 days; day 7 safe = 260000·7/33
  assert.equal(s.at(-1)!.safeCents, Math.round(260000 * 7 / 33));
});

test('overspending shows negative today; at midnight the limit is recomputed from what is left', () => {
  // 30-day cycle with 1500 € → 50 €/day. 100 € spent on day 1.
  const c30 = { id: 'c', startDate: '2026-11-02', endDate: '2026-12-01' };
  const txs: Tx[] = [
    { id: 'i', kind: 'income', amountCents: 150000, occurredOn: '2026-11-02' },
    { id: 'big', kind: 'expense', amountCents: 10000, occurredOn: '2026-11-02', categoryId: 'groceries' },
  ];
  const day1 = computeAllowance({ cycle: c30, transactions: txs, categories, budgetLines: [], today: '2026-11-02' });
  assert.equal(day1.dailyAllowanceCents, 5000);   // 1500 € ÷ 30 days
  assert.equal(day1.leftTodayCents, -5000);       // until midnight: 50 − 100 = −50 €
  const day2 = computeAllowance({ cycle: c30, transactions: txs, categories, budgetLines: [], today: '2026-11-03' });
  assert.equal(day2.dailyAllowanceCents, Math.floor(140000 / 29)); // 1400 € left ÷ 29 days = 48,27 €
  assert.equal(day2.leftTodayCents, Math.floor(140000 / 29));      // a fresh day, nothing spent yet
});

test('food vouchers count as part of the everyday budget', () => {
  // Salary 1579 € into the salaries fund, vouchers 86,78 € received into their own account,
  // 100 € of groceries paid with vouchers, a 30 € top-up moved from the salaries to the vouchers.
  const c30 = { id: 'c', startDate: '2026-10-29', endDate: '2026-11-28' };
  const raw: Tx[] = [
    { id: 's', kind: 'income', amountCents: 157900, occurredOn: '2026-10-29' },
    { id: 'v', kind: 'income', amountCents: 8678, occurredOn: '2026-11-02', bucketId: 'vouchers' },
    { id: 'g', kind: 'expense', amountCents: 10000, occurredOn: '2026-11-02', categoryId: 'groceries', bucketId: 'vouchers' },
    { id: 't', kind: 'bucket_deposit', amountCents: 3000, occurredOn: '2026-11-02', bucketId: 'vouchers' },
    { id: 'k', kind: 'bucket_deposit', amountCents: 20000, occurredOn: '2026-11-02', bucketId: 'kids' }, // real savings
  ];
  assert.equal(bucketBalance('vouchers', raw), 8678 - 10000 + 3000);
  const merged = mergeBudgetAccounts(raw, new Set(['vouchers']));
  const r = computeAllowance({ cycle: c30, transactions: merged, categories, budgetLines: [], today: '2026-11-02' });
  assert.equal(r.incomeCents, 157900 + 8678);              // salary + vouchers
  assert.equal(r.spentFlexibleCents, 10000);               // groceries paid with vouchers count
  assert.equal(r.netToBucketsCents, 20000);                // only the kids' savings leaves the budget
  assert.equal(r.remainingCents, 157900 + 8678 - 10000 - 20000);
  assert.equal(r.spentTodayCents, 10000);
});

test('paying more than the account holds takes the rest from the salaries fund', () => {
  assert.deepEqual(splitPayment(15000, 8200), { fromAccount: 8200, fromPool: 6800 });
  assert.deepEqual(splitPayment(5000, 8200), { fromAccount: 5000, fromPool: 0 });
  assert.deepEqual(splitPayment(5000, 0), { fromAccount: 0, fromPool: 5000 });
  assert.deepEqual(splitPayment(5000, -300), { fromAccount: 0, fromPool: 5000 });
  const r = splitLines([{ amountCents: 3000 }, { amountCents: 4000 }, { amountCents: 2000 }], 5000);
  assert.deepEqual(r.map(x => [x.fromAccount, x.fromPool]), [[3000, 0], [2000, 2000], [0, 2000]]);
});

test('days until payday follow the rule in Settings', () => {
  const r = { type: 'monthly_day' as const, day: 25, weekend: 'previous_business_day' as const };
  assert.deepEqual(nextPaydayFrom('2026-11-05', r), { date: '2026-11-25', days: 20 });
  assert.deepEqual(nextPaydayFrom('2026-11-25', r), { date: '2026-11-25', days: 0 });   // payday is today
  assert.deepEqual(nextPaydayFrom('2026-11-26', r), { date: '2026-12-25', days: 29 });
  assert.deepEqual(nextPaydayFrom('2026-10-20', r), { date: '2026-10-23', days: 3 });   // 25 Oct is Sunday → Fri 23
  assert.equal(nextPaydayFrom('2026-11-05', { type: 'manual' }), null);
});

test('week is Monday–Sunday, clipped to the pay cycle', () => {
  const c = { startDate: '2026-10-23', endDate: '2026-11-24' };
  assert.deepEqual(weekWithinCycle('2026-10-29', c), { start: '2026-10-26', end: '2026-11-01' }); // Thu
  assert.deepEqual(weekWithinCycle('2026-11-01', c), { start: '2026-10-26', end: '2026-11-01' }); // Sunday
  assert.deepEqual(weekWithinCycle('2026-11-02', c), { start: '2026-11-02', end: '2026-11-08' }); // Monday
  assert.deepEqual(weekWithinCycle('2026-10-24', c), { start: '2026-10-23', end: '2026-10-25' }); // cycle starts Fri
  assert.deepEqual(weekWithinCycle('2026-11-24', c), { start: '2026-11-23', end: '2026-11-24' }); // cycle ends Tue
});

test('fund week share', () => {
  const k = computeBucketAllowance({ bucketId: 'kids', cycle: { startDate: '2026-10-23', endDate: '2026-11-24' }, today: '2026-10-29',
    transactions: [
      { id: 'd', kind: 'bucket_deposit', amountCents: 30000, occurredOn: '2026-10-23', bucketId: 'kids' },
      { id: 'e', kind: 'expense', amountCents: 2000, occurredOn: '2026-10-27', categoryId: 'kids', bucketId: 'kids' },
    ] });
  assert.equal(k.spentThisWeekCents, 2000);
  // 28000 left over 27 days (29 Oct – 24 Nov): today's share 1037 + 3 × 1037 (Fri–Sun)
  assert.equal(k.weekRestDays, 3);
  assert.equal(k.leftThisWeekCents, 4 * Math.floor(28000 / 27));
});

test('week = За днес + На ден × days left in the week (real data, Thu 5 Nov 2026)', () => {
  const cycle = { id: 'c', startDate: '2026-10-29', endDate: '2026-11-27' };
  // 1237,53 € left this morning; 49,29 € spent today → 1188,24 € left, 23 days incl. today
  const txs: Tx[] = [
    { id: 'i', kind: 'income', amountCents: 166578, occurredOn: '2026-10-29' },
    { id: 'a', kind: 'expense', amountCents: 166578 - 123753, occurredOn: '2026-11-03', categoryId: 'food' },
    { id: 'b', kind: 'expense', amountCents: 4929, occurredOn: '2026-11-05', categoryId: 'food' },
  ];
  const r = computeAllowance({ cycle, transactions: txs, categories: [], budgetLines: [], today: '2026-11-05' });
  assert.equal(r.remainingCents, 118824);
  assert.equal(r.averageDailyRemainingCents, 5166);              // 51,66 € на ден
  assert.equal(r.leftTodayCents, Math.floor(123753 / 23) - 4929); // 53,80 − 49,29 = 4,51 €
  assert.equal(r.weekRestDays, 3);                                // Fri, Sat, Sun
  assert.equal(r.leftThisWeekCents, 451 + 3 * 5166);             // 159,49 €
  // overspent today → the excess comes off the week
  const over = computeAllowance({ cycle, today: '2026-11-05', categories: [], budgetLines: [],
    transactions: [...txs, { id: 'c', kind: 'expense', amountCents: 10000, occurredOn: '2026-11-05', categoryId: 'food' }] });
  assert.equal(over.leftTodayCents, 451 - 10000);
  assert.equal(over.leftThisWeekCents, over.leftTodayCents + 3 * over.averageDailyRemainingCents);
  // Sunday: only today is left in the week
  const sun = computeAllowance({ cycle, transactions: txs, categories: [], budgetLines: [], today: '2026-11-08' });
  assert.equal(sun.weekRestDays, 0);
  assert.equal(sun.leftThisWeekCents, sun.leftTodayCents);
});

test('amount parsing', () => {
  assert.equal(parseAmountToCents('12,50'), 1250);
  assert.equal(parseAmountToCents('€1 200'), 120000);
  assert.equal(parseAmountToCents('3.5'), 350);
  assert.equal(parseAmountToCents('abc'), null);
  assert.equal(parseAmountToCents('1.234'), null);
});

test('today in Sofia', () => {
  // 23:30 UTC on 28 Oct is already 29 Oct in Sofia (UTC+2)
  assert.equal(todayIn('Europe/Sofia', new Date('2026-10-28T23:30:00Z')), '2026-10-29');
});
