import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByCategory, normalizeDate, normalizeReceipt, sumLines, toNumber } from './receipt.ts';

test('number parsing', () => {
  assert.equal(toNumber('2,49'), 2.49);
  assert.equal(toNumber('1 234,50 лв.'), 1234.5);
  assert.equal(toNumber('1.234,50'), 1234.5);
  assert.equal(toNumber('1,234.50'), 1234.5);
  assert.equal(toNumber(-0.2), -0.2);
  assert.ok(Number.isNaN(toNumber('abc')));
});

test('dates', () => {
  assert.equal(normalizeDate('29.10.2026'), '2026-10-29');
  assert.equal(normalizeDate('2026-10-29'), '2026-10-29');
  assert.equal(normalizeDate('31.02.2026'), null);
  assert.equal(normalizeDate(''), null);
});

const cats = ['groceries', 'kids', 'clothes'];

test('discount is spread over the lines and the total still matches', () => {
  const r = normalizeReceipt({
    store: 'Лидл', date: '29.10.2026', currency: 'EUR', total: 13.74,
    items: [
      { name: 'Прясно мляко', amount: 1.29, category_id: 'groceries' },
      { name: 'Хляб', amount: 0.89, category_id: 'groceries' },
      { name: 'Банани', amount: 1.3, category_id: 'groceries' },
      { name: 'Кисело мляко', amount: 0.79, category_id: 'groceries' },
      { name: 'Отстъпка', amount: -0.2 },
      { name: 'Мокри кърпи', amount: 2.49, category_id: 'kids' },
      { name: 'Чорапи детски', amount: 4.99, category_id: 'clothes' },
      { name: 'Препарат за подове', amount: 2.19, new_category: 'Домакинство' },
    ],
  }, cats);
  assert.equal(r.date, '2026-10-29');
  assert.equal(r.totalCents, 1374);
  assert.equal(r.lines.length, 7);
  assert.equal(sumLines(r.lines), 1374);
  assert.ok(r.lines.every(l => l.amountCents > 0));
  const floor = r.lines.find(l => l.name === 'Препарат за подове')!;
  assert.equal(floor.categoryId, null);
  assert.equal(floor.newCategory, 'Домакинство');
});

test('BGN receipts are converted at 1.95583', () => {
  const r = normalizeReceipt({ currency: 'BGN', items: [{ name: 'Сирене', amount: '19,56', category_id: 'groceries' }] }, cats);
  assert.equal(r.lines[0].amountCents, 1000);
});

test('unknown category ids are not trusted', () => {
  const r = normalizeReceipt({ items: [{ name: 'X', amount: 3, category_id: 'made-up' }] }, cats);
  assert.equal(r.lines[0].categoryId, null);
});

test('group by category', () => {
  const r = normalizeReceipt({ items: [
    { name: 'A', amount: 1, category_id: 'groceries' }, { name: 'B', amount: 2, category_id: 'groceries' }, { name: 'C', amount: 5, category_id: 'kids' },
  ] }, cats);
  const g = groupByCategory(r.lines);
  assert.deepEqual(g.map(x => [x.categoryKey, x.amountCents, x.names.length]), [['groceries', 300, 2], ['kids', 500, 1]]);
});
