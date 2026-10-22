import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PRODUCTS} from './data.ts';

test('catalog ids are unique', () => {
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
});

test('prices are positive integers, stock a non-negative integer', () => {
  for (const p of PRODUCTS) {
    assert.ok(Number.isInteger(p.priceVnd) && p.priceVnd > 0, p.id);
    assert.ok(Number.isInteger(p.initialStock) && p.initialStock >= 0, p.id);
  }
});
