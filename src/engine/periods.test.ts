import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodName } from './periods.ts';

test('pay periods are named after the month they mostly cover', () => {
  assert.equal(periodName('2026-10-23', '2026-11-24'), 'Ноември 2026');
  assert.equal(periodName('2026-09-25', '2026-10-22'), 'Октомври 2026');
  assert.equal(periodName('2026-07-24', '2026-08-24'), 'Август 2026');
  assert.equal(periodName('2026-11-01', '2026-11-30'), 'Ноември 2026');
});
test('longer ranges', () => {
  assert.equal(periodName('2026-07-24', '2026-10-22'), 'Август – Октомври 2026');
  assert.equal(periodName('2026-12-24', '2027-02-24'), 'Януари – Февруари 2027');
  assert.equal(periodName('2026-11-25', '2027-01-22'), 'Декември 2026 – Януари 2027');
  assert.equal(periodName('2026-01-01', '2026-12-31'), '2026');
});
test('short ranges inside one month', () => {
  assert.equal(periodName('2026-10-26', '2026-11-01'), 'Октомври 2026');
  assert.equal(periodName('2026-10-29', '2026-10-29'), 'Октомври 2026');
});
