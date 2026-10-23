import assert from 'node:assert/strict';
import {test} from 'node:test';
import {describeProduct, formatVnd} from './product-view.ts';
import type {InventoryState} from './types.ts';

test('prices use vi-VN dong formatting', () => {
  assert.match(formatVnd(299000), /^299\.000\s?₫$/);
  assert.match(formatVnd(1250000), /^1\.250\.000\s?₫$/);
});

const S: Record<string, InventoryState> = {
  avail: {status: 'AVAILABLE', stock: 3},
  reserving: {status: 'RESERVING', stock: 2},
  reserved: {status: 'RESERVED', stock: 2, expiresAt: 9},
  checking: {status: 'CHECKING_OUT', stock: 2, expiresAt: 9},
  bought: {status: 'PURCHASED', stock: 2},
  sold: {status: 'SOLD_OUT', stock: 0},
};

test('buttons follow the FSM state', () => {
  const flags = (k: string, open = true) => {
    const vm = describeProduct(S[k]!, 3, open);
    return [vm.canReserve, vm.canCheckout];
  };
  assert.deepEqual(flags('avail'), [true, false]);
  assert.deepEqual(flags('reserving'), [false, false]);
  assert.deepEqual(flags('reserved'), [false, true]);
  assert.deepEqual(flags('checking'), [false, false]);
  assert.deepEqual(flags('bought'), [false, false]);
  assert.deepEqual(flags('sold'), [false, false]);
});

test('closing the sale disables Reserve but keeps Checkout', () => {
  assert.equal(describeProduct(S.avail!, 3, false).canReserve, false);
  assert.equal(describeProduct(S.reserved!, 3, false).canCheckout, true);
});

test('stock comes from the server, except while RESERVING', () => {
  assert.equal(describeProduct(S.avail!, 1, true).stock, 1);
  // Server not yet decremented: local 2 equals server 3 - 1.
  assert.equal(describeProduct(S.reserving!, 3, true).stock, 2);
});

test('RESERVING never shows a stock above what the server has left', () => {
  const stale: InventoryState = {status: 'RESERVING', stock: 8};
  assert.equal(describeProduct(stale, 1, true).stock, 0);
  assert.equal(describeProduct(stale, 0, true).stock, 0);
  assert.equal(describeProduct(stale, 5, true).stock, 4);
});

test('AVAILABLE with no server stock shows as sold out', () => {
  const vm = describeProduct(S.avail!, 0, true);
  assert.equal(vm.status, 'SOLD_OUT');
  assert.equal(vm.canReserve, false);
  assert.equal(vm.stock, 0);
});

test('lock row shows while RESERVED or CHECKING_OUT only', () => {
  const show = (k: string) => describeProduct(S[k]!, 2, true).showLock;
  assert.deepEqual(
    ['avail', 'reserving', 'reserved', 'checking', 'bought', 'sold'].map(show),
    [false, false, true, true, false, false],
  );
});
