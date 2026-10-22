import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createMockSaleServer,
  mulberry32,
  SaleRejection,
} from './mock-server.ts';
import type {MockServerOptions} from './mock-server.ts';
import type {Product} from './types.ts';

const product = (id: string, initialStock: number): Product => ({
  id,
  name: id,
  priceVnd: 1000,
  initialStock,
});

function make(stock: number, extra: Partial<MockServerOptions> = {}) {
  return createMockSaleServer({
    products: [product('p', stock)],
    latencyMs: {min: 0, max: 2},
    failureRate: 0,
    ...extra,
  });
}

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof SaleRejection ? e.reason : 'other';
  }
}

test('concurrent reserves never oversell', async () => {
  const server = make(3);
  const results = await Promise.all(
    Array.from({length: 20}, () => outcome(server.reserve('p'))),
  );
  assert.equal(results.filter((r) => r === 'ok').length, 3);
  assert.equal(results.filter((r) => r === 'SOLD_OUT').length, 17);
  assert.equal(server.stockOf('p'), 0);
});

test('random failures never oversell or push stock below 0', async () => {
  const server = make(5, {failureRate: 0.5, random: mulberry32(7)});
  const results = await Promise.all(
    Array.from({length: 50}, () => outcome(server.reserve('p'))),
  );
  const okCount = results.filter((r) => r === 'ok').length;
  assert.ok(okCount <= 5);
  assert.equal(server.stockOf('p'), 5 - okCount);
  assert.ok(results.includes('SERVER_ERROR'));
});

test('initialStock 0 is SOLD_OUT immediately', async () => {
  assert.equal(await outcome(make(0).reserve('p')), 'SOLD_OUT');
});

test('same seed gives the same outcomes', async () => {
  const run = async (): Promise<string[]> => {
    const server = make(100, {failureRate: 0.4, random: mulberry32(42)});
    const out: string[] = [];
    for (let i = 0; i < 20; i++) {
      out.push(await outcome(server.reserve('p')));
    }
    return out;
  };
  const a = await run();
  assert.deepEqual(a, await run());
  assert.ok(a.includes('ok') && a.includes('SERVER_ERROR'));
});

test('reserve returns expiresAt = now + lockMs and a lockId', async () => {
  const server = make(1, {lockMs: 5_000, now: () => 10_000});
  const r = await server.reserve('p');
  assert.equal(r.expiresAt, 15_000);
  assert.equal(typeof r.lockId, 'string');
});

test('double reserve gives two independent locks', async () => {
  const server = make(2);
  const a = await server.reserve('p');
  const b = await server.reserve('p');
  assert.notEqual(a.lockId, b.lockId);
  await server.checkout('p', a.lockId);
  await server.checkout('p', b.lockId);
  assert.equal(server.stockOf('p'), 0);
});

test('shopper A can not consume the lock of shopper B', async () => {
  const server = make(2);
  const a = await server.reserve('p');
  const b = await server.reserve('p');
  await server.checkout('p', a.lockId);
  // A's lock is gone; B's lock is untouched and still usable by B only.
  assert.equal(await outcome(server.checkout('p', a.lockId)), 'SERVER_ERROR');
  assert.equal(await outcome(server.checkout('p', 'lock-999')), 'SERVER_ERROR');
  await server.checkout('p', b.lockId);
});

test('a lockId is bound to its product', async () => {
  const server = createMockSaleServer({
    products: [product('p', 1), product('q', 1)],
    latencyMs: {min: 0, max: 2},
    failureRate: 0,
  });
  const a = await server.reserve('p');
  assert.equal(await outcome(server.checkout('q', a.lockId)), 'SERVER_ERROR');
  await server.checkout('p', a.lockId);
});

test('checkout consumes the lock; a second checkout is rejected', async () => {
  const server = make(1);
  const {lockId} = await server.reserve('p');
  await server.checkout('p', lockId);
  assert.equal(server.stockOf('p'), 0);
  assert.equal(await outcome(server.checkout('p', lockId)), 'SERVER_ERROR');
});

test('checkout without a reservation is rejected', async () => {
  const server = make(1);
  assert.equal(await outcome(server.checkout('p', 'lock-1')), 'SERVER_ERROR');
});

test('expired lock releases stock and can not be checked out', async () => {
  let t = 0;
  const server = make(1, {lockMs: 1_000, now: () => t});
  const {lockId} = await server.reserve('p');
  assert.equal(server.stockOf('p'), 0);
  t = 1_000;
  assert.equal(server.stockOf('p'), 1);
  assert.equal(await outcome(server.checkout('p', lockId)), 'SERVER_ERROR');
  assert.equal(await outcome(server.reserve('p')), 'ok');
});

test('unknown product is rejected', async () => {
  assert.equal(await outcome(make(1).reserve('nope')), 'SERVER_ERROR');
});

test('abort before and during latency cancels the request', async () => {
  const server = make(1, {latencyMs: {min: 10_000, max: 10_000}});
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(server.reserve('p', pre.signal), {name: 'AbortError'});

  const mid = new AbortController();
  const pending = server.reserve('p', mid.signal);
  setTimeout(() => mid.abort(), 5);
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(server.stockOf('p'), 1);
});

test('rejects invalid options', () => {
  assert.throws(() => make(1, {failureRate: 2}), RangeError);
  assert.throws(() => make(1, {lockMs: 0}), RangeError);
  assert.throws(() => make(1, {latencyMs: {min: 5, max: 1}}), RangeError);
});
