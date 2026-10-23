import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMockSaleServer, mulberry32} from './mock-server.ts';
import {startRivals} from './rivals.ts';
import type {Product} from './types.ts';

const products: Product[] = [
  {id: 'p', name: 'p', priceVnd: 1000, initialStock: 3},
];
const wait = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function setup() {
  const server = createMockSaleServer({
    products,
    latencyMs: {min: 0, max: 1},
    failureRate: 0,
    lockMs: 60_000,
  });
  let activity = 0;
  const stop = startRivals({
    server,
    products,
    random: mulberry32(5),
    gapMs: {min: 1, max: 3},
    buyRate: 1,
    onActivity: () => activity++,
  });
  return {server, stop, activity: () => activity};
}

test('rivals buy real stock until it is sold out', async () => {
  const {server, stop, activity} = setup();
  await wait(300);
  stop();
  assert.equal(server.stockOf('p'), 0);
  assert.ok(activity() >= 3);
});

test('stop() halts all rival activity', async () => {
  const {stop, activity} = setup();
  await wait(20);
  stop();
  const seen = activity();
  await wait(100);
  assert.equal(activity(), seen);
});
