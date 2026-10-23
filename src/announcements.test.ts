import assert from 'node:assert/strict';
import {test} from 'node:test';
import {announcementFor} from './announcements.ts';
import type {InventoryStatus} from './types.ts';

test('every shopper transition has a message', () => {
  const pairs: Array<[InventoryStatus, InventoryStatus]> = [
    ['RESERVING', 'RESERVED'],
    ['RESERVING', 'AVAILABLE'],
    ['RESERVING', 'SOLD_OUT'],
    ['RESERVED', 'AVAILABLE'],
    ['CHECKING_OUT', 'PURCHASED'],
    ['CHECKING_OUT', 'RESERVED'],
  ];
  for (const [from, to] of pairs) {
    assert.ok(announcementFor('X', from, to), `${from} -> ${to}`);
  }
});

test('a rival-caused sold out (display only) is not announced', () => {
  // The FSM stays AVAILABLE; only the displayed stock reaches 0.
  assert.equal(announcementFor('X', 'AVAILABLE', 'AVAILABLE'), undefined);
  assert.equal(announcementFor('X', 'AVAILABLE', 'SOLD_OUT'), undefined);
  assert.equal(announcementFor('X', 'PURCHASED', 'PURCHASED'), undefined);
});

test('only shopper-driven states produce a message', () => {
  // Every pair that has a message starts in a shopper-driven state.
  const all: InventoryStatus[] = [
    'AVAILABLE',
    'RESERVING',
    'RESERVED',
    'CHECKING_OUT',
    'PURCHASED',
    'SOLD_OUT',
  ];
  for (const from of all) {
    for (const to of all) {
      if (announcementFor('X', from, to)) {
        assert.ok(['RESERVING', 'RESERVED', 'CHECKING_OUT'].includes(from));
      }
    }
  }
});

test('the purchase message names the product', () => {
  assert.equal(
    announcementFor('Bàn phím', 'CHECKING_OUT', 'PURCHASED'),
    'Đã mua Bàn phím.',
  );
});
