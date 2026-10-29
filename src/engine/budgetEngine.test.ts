import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paydayInMonth, nextPayday, proposeNextCycle, cycleClock, validateCycle,
  computeAllowance, computeBucketAllowance, weekWithinCycle, velocitySeries, bucketBalance, parseAmountToCents, todayIn,
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
  // at Monday: 217500 + 6500 = 224000 over 30 days left (26 Oct – 24 Nov) → 7 days' share
  assert.equal(r.weekAllowanceCents, Math.floor(224000 * 7 / 30)); // 52266
  assert.equal(r.leftThisWeekCents, 52266 - 6500);
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
  assert.equal(k.weekAllowanceCents, Math.floor(30000 * 7 / 30)); // 7000
  assert.equal(k.leftThisWeekCents, 5000);
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
