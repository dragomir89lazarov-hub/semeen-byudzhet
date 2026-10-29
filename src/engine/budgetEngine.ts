/**
 * Family Budget — core business logic (framework-free TypeScript).
 *
 * Conventions
 *  - Money: integer cents (number). Never floats for stored amounts.
 *  - Dates: ISO calendar dates 'YYYY-MM-DD' in the HOUSEHOLD's time zone.
 *    All day arithmetic is done on UTC day numbers so DST can never shift a day.
 *  - Cycles are inclusive on both ends: 25 Oct → 24 Nov contains both days.
 */

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────
export type ISODate = string; // 'YYYY-MM-DD'

const DAY_MS = 86_400_000;

export const toDayNumber = (d: ISODate): number => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day) / DAY_MS;
};

export const fromDayNumber = (n: number): ISODate =>
  new Date(n * DAY_MS).toISOString().slice(0, 10);

export const addDays = (d: ISODate, days: number): ISODate =>
  fromDayNumber(toDayNumber(d) + days);

/** Days from a to b inclusive (a ≤ b ⇒ ≥ 1). */
export const daysInclusive = (a: ISODate, b: ISODate): number =>
  toDayNumber(b) - toDayNumber(a) + 1;

const daysInMonth = (y: number, m1: number): number =>
  new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = 1..12

const weekday = (d: ISODate): number => new Date(toDayNumber(d) * DAY_MS).getUTCDay(); // 0 Sun..6 Sat

/** "Today" as an ISO date in a given IANA time zone (e.g. Europe/Sofia). */
export const todayIn = (timeZone: string, now: Date = new Date()): ISODate =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now); // en-CA formats as YYYY-MM-DD

// ─────────────────────────────────────────────────────────────
// 1. Pay-cycle engine
// ─────────────────────────────────────────────────────────────
export type PaydayRule =
  | {
      type: 'monthly_day';
      day: number; // 1..31, clamped to month length
      weekend?: 'none' | 'previous_business_day' | 'next_business_day';
      holidays?: ISODate[]; // optional public holidays treated like weekends
    }
  | { type: 'manual' };

export interface PayCycle {
  id: string;
  startDate: ISODate;
  endDate: ISODate; // inclusive
}

/** Actual payday in a given month after weekend/holiday adjustment. */
export function paydayInMonth(year: number, month1: number, rule: Extract<PaydayRule, { type: 'monthly_day' }>): ISODate {
  const day = Math.min(rule.day, daysInMonth(year, month1));
  let d: ISODate = `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holidays = new Set(rule.holidays ?? []);
  const isOff = (x: ISODate) => weekday(x) === 0 || weekday(x) === 6 || holidays.has(x);
  const step = rule.weekend === 'next_business_day' ? 1 : rule.weekend === 'previous_business_day' ? -1 : 0;
  if (step !== 0) while (isOff(d)) d = addDays(d, step);
  return d;
}

/** First payday strictly after `after`. */
export function nextPayday(after: ISODate, rule: Extract<PaydayRule, { type: 'monthly_day' }>): ISODate {
  let [y, m] = after.split('-').map(Number);
  // A shifted payday can move into the previous month, so check this month and the next two.
  for (let i = 0; i < 3; i++) {
    const candidate = paydayInMonth(y, m, rule);
    if (toDayNumber(candidate) > toDayNumber(after)) return candidate;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  throw new Error('unreachable: no payday found within 3 months');
}

/**
 * Propose the next cycle: it starts the day after the previous one ends and runs
 * until the day before the next payday. With a manual rule, fall back to the
 * previous cycle's length. The UI shows this as an editable suggestion.
 */
export function proposeNextCycle(previous: Pick<PayCycle, 'startDate' | 'endDate'>, rule: PaydayRule): { startDate: ISODate; endDate: ISODate } {
  const startDate = addDays(previous.endDate, 1);
  if (rule.type === 'manual') {
    const len = daysInclusive(previous.startDate, previous.endDate);
    return { startDate, endDate: addDays(startDate, len - 1) };
  }
  const payday = nextPayday(startDate, rule);
  return { startDate, endDate: addDays(payday, -1) };
}

/** Validate a user-edited cycle against its neighbours (mirrors the DB exclusion constraint). */
export function validateCycle(c: Pick<PayCycle, 'startDate' | 'endDate'>, others: PayCycle[]): string | null {
  if (toDayNumber(c.endDate) < toDayNumber(c.startDate)) return 'End date is before start date.';
  if (daysInclusive(c.startDate, c.endDate) > 62) return 'A cycle longer than 62 days is probably a typo.';
  const clash = others.find(o => toDayNumber(c.startDate) <= toDayNumber(o.endDate) && toDayNumber(o.startDate) <= toDayNumber(c.endDate));
  return clash ? `Overlaps the cycle ${clash.startDate} → ${clash.endDate}.` : null;
}

export function findCycleFor(date: ISODate, cycles: PayCycle[]): PayCycle | undefined {
  const n = toDayNumber(date);
  return cycles.find(c => toDayNumber(c.startDate) <= n && n <= toDayNumber(c.endDate));
}

export interface CycleClock {
  totalDays: number;
  daysElapsed: number;     // full days before today
  daysLeft: number;        // including today
  progress: number;        // 0..1 of the cycle's time used
  phase: 'upcoming' | 'active' | 'ended';
}

export function cycleClock(cycle: Pick<PayCycle, 'startDate' | 'endDate'>, today: ISODate): CycleClock {
  const totalDays = daysInclusive(cycle.startDate, cycle.endDate);
  const t = toDayNumber(today), s = toDayNumber(cycle.startDate), e = toDayNumber(cycle.endDate);
  if (t < s) return { totalDays, daysElapsed: 0, daysLeft: totalDays, progress: 0, phase: 'upcoming' };
  if (t > e) return { totalDays, daysElapsed: totalDays, daysLeft: 0, progress: 1, phase: 'ended' };
  const daysElapsed = t - s;
  return { totalDays, daysElapsed, daysLeft: e - t + 1, progress: daysElapsed / totalDays, phase: 'active' };
}

// ─────────────────────────────────────────────────────────────
// 2. Daily allowance & burn forecast
// ─────────────────────────────────────────────────────────────
export type TxKind = 'income' | 'expense' | 'bucket_deposit' | 'bucket_withdrawal';

export interface Tx {
  id: string;
  kind: TxKind;
  amountCents: number;   // always > 0
  occurredOn: ISODate;
  categoryId?: string | null;
  bucketId?: string | null; // expense with bucketId = paid from a savings bucket
  deletedAt?: string | null;
}

export interface Category { id: string; isFixed: boolean }
export interface BudgetLine { categoryId: string; plannedCents: number }

export interface AllowanceInput {
  cycle: PayCycle & { openingCarryoverCents?: number };
  transactions: Tx[];          // the cycle's transactions (any order, may include deleted)
  categories: Category[];
  budgetLines: BudgetLine[];   // planned amounts for this cycle
  today: ISODate;
  /** Keep this much aside as a cushion that the daily allowance never spends. */
  bufferCents?: number;
}

export type PaceStatus = 'on_track' | 'tight' | 'overspending' | 'overdrawn';

export interface AllowanceResult {
  incomeCents: number;
  netToBucketsCents: number;     // deposits − withdrawals
  fixedReservedCents: number;    // planned fixed bills not yet paid
  spentFlexibleCents: number;
  spentFixedCents: number;
  remainingCents: number;        // spendable on flexible categories for the rest of the cycle
  daysLeft: number;
  dailyAllowanceCents: number;   // remaining ÷ days left (as of start of today)
  spentTodayCents: number;
  leftTodayCents: number;        // today's allowance minus what was spent today
  averageDailyRemainingCents: number; // remaining now ÷ days left (today included)
  paceCentsPerDay: number;       // projected flexible spend per day
  projectedEndBalanceCents: number;
  runOutDate: ISODate | null;    // when money hits zero at current pace, if before cycle end
  status: PaceStatus;
  message: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Remaining Available Budget
 *   = opening carry-over + income
 *   − net transfers into savings buckets
 *   − fixed bills: max(planned, paid) for each fixed category
 *   − flexible spending so far (expenses not paid from a bucket)
 *
 * Daily Burn Allowance = Remaining Available Budget ÷ Days Left (today included).
 *
 * The allowance is computed as of the START of today (today's spending added back),
 * so a big purchase this morning lowers "left today" instead of silently re-spreading.
 */
export function computeAllowance(input: AllowanceInput): AllowanceResult {
  const { cycle, today, bufferCents = 0 } = input;
  const live = input.transactions.filter(t => !t.deletedAt);
  const fixedIds = new Set(input.categories.filter(c => c.isFixed).map(c => c.id));
  const s = toDayNumber(cycle.startDate), e = toDayNumber(cycle.endDate);
  const inCycle = (t: Tx) => { const n = toDayNumber(t.occurredOn); return n >= s && n <= e; };

  const income = (cycle.openingCarryoverCents ?? 0) +
    sum(live.filter(t => t.kind === 'income').map(t => t.amountCents));
  const deposits = sum(live.filter(t => t.kind === 'bucket_deposit').map(t => t.amountCents));
  const withdrawals = sum(live.filter(t => t.kind === 'bucket_withdrawal').map(t => t.amountCents));
  const poolExpenses = live.filter(t => t.kind === 'expense' && !t.bucketId && inCycle(t));

  const spentFixed = sum(poolExpenses.filter(t => fixedIds.has(t.categoryId ?? '')).map(t => t.amountCents));
  const flexible = poolExpenses.filter(t => !fixedIds.has(t.categoryId ?? ''));
  const spentFlexible = sum(flexible.map(t => t.amountCents));

  // Reserve unpaid fixed bills per category: max(planned, paid) is what the cycle will cost.
  const paidByFixedCat = new Map<string, number>();
  for (const t of poolExpenses) if (fixedIds.has(t.categoryId ?? ''))
    paidByFixedCat.set(t.categoryId!, (paidByFixedCat.get(t.categoryId!) ?? 0) + t.amountCents);
  const fixedReserved = sum(input.budgetLines
    .filter(b => fixedIds.has(b.categoryId))
    .map(b => Math.max(0, b.plannedCents - (paidByFixedCat.get(b.categoryId) ?? 0))));

  const remaining = income - (deposits - withdrawals) - spentFixed - fixedReserved - spentFlexible - bufferCents;

  const clock = cycleClock(cycle, today);
  const todayN = toDayNumber(today);
  const spentToday = sum(flexible.filter(t => toDayNumber(t.occurredOn) === todayN).map(t => t.amountCents));

  const daysLeft = clock.daysLeft;
  const remainingAtStartOfToday = remaining + (clock.phase === 'active' ? spentToday : 0);
  const dailyAllowance = daysLeft > 0 ? Math.floor(Math.max(0, remainingAtStartOfToday) / daysLeft) : 0;
  const leftToday = dailyAllowance - spentToday;

  // Pace: blend whole-cycle average with the last 7 days so a recent splurge shows up fast,
  // using only completed days (today is partial and would understate the rate).
  const completedDays = clock.daysElapsed;
  const before = (n: number) => flexible.filter(t => toDayNumber(t.occurredOn) < n);
  const cycleAvg = completedDays > 0 ? sum(before(todayN).map(t => t.amountCents)) / completedDays : 0;
  const win = Math.min(7, completedDays);
  const recentAvg = win > 0
    ? sum(before(todayN).filter(t => toDayNumber(t.occurredOn) >= todayN - win).map(t => t.amountCents)) / win
    : 0;
  const pace = completedDays >= 3 ? 0.6 * recentAvg + 0.4 * cycleAvg : Math.max(cycleAvg, recentAvg);

  // Project from the start of today: today's spend is counted inside the pace, not twice.
  const projectedEnd = Math.round(remainingAtStartOfToday - pace * daysLeft);
  let runOutDate: ISODate | null = null;
  if (pace > 0 && projectedEnd < 0) {
    const daysUntilZero = Math.floor(Math.max(0, remainingAtStartOfToday) / pace);
    runOutDate = addDays(today, daysUntilZero);
  }

  let status: PaceStatus;
  let message: string;
  const eur = (c: number) => (c / 100).toFixed(2);
  if (remaining < 0) {
    status = 'overdrawn';
    message = `Over budget by ${eur(-remaining)}. Move money from a bucket or cut back.`;
  } else if (runOutDate) {
    status = 'overspending';
    message = `At this pace the money runs out on ${runOutDate}, ${daysInclusive(runOutDate, cycle.endDate) - 1} days before payday.`;
  } else if (daysLeft > 0 && projectedEnd < 0.1 * Math.max(1, remainingAtStartOfToday)) {
    status = 'tight';
    message = `On course but tight: about ${eur(projectedEnd)} left at payday.`;
  } else {
    status = 'on_track';
    message = `On track: about ${eur(projectedEnd)} left at payday.`;
  }

  return {
    incomeCents: income,
    netToBucketsCents: deposits - withdrawals,
    fixedReservedCents: fixedReserved,
    spentFlexibleCents: spentFlexible,
    spentFixedCents: spentFixed,
    remainingCents: remaining,
    daysLeft,
    dailyAllowanceCents: dailyAllowance,
    spentTodayCents: spentToday,
    leftTodayCents: leftToday,
    averageDailyRemainingCents: daysLeft > 0 ? Math.floor(Math.max(0, remaining) / daysLeft) : 0,
    paceCentsPerDay: Math.round(pace),
    projectedEndBalanceCents: projectedEnd,
    runOutDate,
    status,
    message,
  };
}

/**
 * Series for the "spending velocity" chart: cumulative flexible spend per day
 * vs. the even-pace line (what you could have spent by that day).
 */
export function velocitySeries(input: AllowanceInput): { date: ISODate; actualCents: number; safeCents: number }[] {
  const r = computeAllowance({ ...input, today: input.cycle.startDate });
  // Total flexible money for the cycle = what's left + what's already been spent on flexible categories.
  const budgetForFlexible = r.remainingCents + r.spentFlexibleCents;
  const fixedIds = new Set(input.categories.filter(c => c.isFixed).map(c => c.id));
  const flexible = input.transactions.filter(t => !t.deletedAt && t.kind === 'expense' && !t.bucketId && !fixedIds.has(t.categoryId ?? ''));
  const total = daysInclusive(input.cycle.startDate, input.cycle.endDate);
  const lastDay = Math.min(toDayNumber(input.today), toDayNumber(input.cycle.endDate));
  const out: { date: ISODate; actualCents: number; safeCents: number }[] = [];
  let cum = 0;
  for (let n = toDayNumber(input.cycle.startDate), i = 1; n <= lastDay; n++, i++) {
    cum += sum(flexible.filter(t => toDayNumber(t.occurredOn) === n).map(t => t.amountCents));
    out.push({ date: fromDayNumber(n), actualCents: cum, safeCents: Math.round(budgetForFlexible * i / total) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 3. Savings buckets
// ─────────────────────────────────────────────────────────────
export function bucketBalance(bucketId: string, txs: Tx[]): number {
  return sum(txs.filter(t => !t.deletedAt && t.bucketId === bucketId).map(t =>
    t.kind === 'bucket_deposit' ? t.amountCents : -t.amountCents));
}

export interface FundAllowanceResult {
  balanceCents: number;               // what's in the fund right now
  daysLeft: number;                   // days left in the pay cycle, today included
  dailyAllowanceCents: number;        // balance at start of today ÷ days left
  spentTodayCents: number;            // paid from this fund today
  leftTodayCents: number;             // today's share minus what was paid today
  averageDailyRemainingCents: number; // balance now ÷ days left
}

/**
 * The same three "how much is left" numbers as the spending pool, for a savings
 * bucket, spread over the current pay cycle. Used when a bucket is the household's
 * default fund on the Today screen.
 */
export function computeBucketAllowance(args: {
  bucketId: string; transactions: Tx[]; cycle: Pick<PayCycle, 'startDate' | 'endDate'>; today: ISODate;
}): FundAllowanceResult {
  const live = args.transactions.filter(t => !t.deletedAt);
  const balance = bucketBalance(args.bucketId, live);
  const clock = cycleClock(args.cycle, args.today);
  const todayN = toDayNumber(args.today);
  const spentToday = sum(live.filter(t => t.bucketId === args.bucketId && t.kind === 'expense' &&
    toDayNumber(t.occurredOn) === todayN).map(t => t.amountCents));
  const daysLeft = clock.daysLeft;
  const startOfDay = balance + (clock.phase === 'active' ? spentToday : 0);
  const daily = daysLeft > 0 ? Math.floor(Math.max(0, startOfDay) / daysLeft) : 0;
  return {
    balanceCents: balance,
    daysLeft,
    dailyAllowanceCents: daily,
    spentTodayCents: spentToday,
    leftTodayCents: daily - spentToday,
    averageDailyRemainingCents: daysLeft > 0 ? Math.floor(Math.max(0, balance) / daysLeft) : 0,
  };
}

/** Build the two-sided record for "move €X from spending into a bucket" (or back). */
export function makeBucketTransfer(args: {
  id: string; bucketId: string; amountCents: number; direction: 'to_bucket' | 'from_bucket'; on: ISODate;
}): Tx {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) throw new Error('Amount must be a positive whole number of cents.');
  return {
    id: args.id,
    kind: args.direction === 'to_bucket' ? 'bucket_deposit' : 'bucket_withdrawal',
    amountCents: args.amountCents,
    occurredOn: args.on,
    bucketId: args.bucketId,
  };
}

/** Parse user input like "12,50" or "12.5" or "€1 200" into cents. */
export function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.replace(/[€\s\u00a0]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
