import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createMockSaleServer,
  mulberry32,
  SaleRejection,
} from './mock-server.ts';
import {createSaleController} from './sale-controller.ts';
import type {SaleServer} from './sale-controller.ts';
import type {Product, RejectReason} from './types.ts';

const product = (id: string, initialStock: number): Product => ({
  id,
  name: id,
  priceVnd: 1000,
  initialStock,
});

/** Hand-driven server: each call waits until the test settles it. */
function stub() {
  const reserves: Array<{
    signal: AbortSignal | undefined;
    ok: (v: {lockId: string; expiresAt: number}) => void;
    fail: (e: unknown) => void;
  }> = [];
  const checkouts: Array<{
    lockId: string;
    ok: () => void;
    fail: (e: unknown) => void;
  }> = [];
  const server: SaleServer = {
    reserve: (_id, signal) =>
      new Promise((ok, fail) => reserves.push({signal, ok, fail})),
    checkout: (_id, lockId) =>
      new Promise<void>((ok, fail) => checkouts.push({lockId, ok, fail})),
  };
  return {server, reserves, checkouts};
}

const reject = (reason: RejectReason): SaleRejection =>
  new SaleRejection(reason, reason);
type CreateTimer = NonNullable<
  Parameters<typeof createSaleController>[0]['createTimer']
>;
const noTimer: CreateTimer = () => () => {};

/** Manual timers: the test calls `onTick` itself; nothing runs on a clock. */
function fakeTimers() {
  const timers: Array<{
    durationMs: number;
    onTick: (remaining: number) => void;
    stopped: boolean;
  }> = [];
  const createTimer: CreateTimer = (durationMs, onTick) => {
    const t = {durationMs, onTick, stopped: false};
    timers.push(t);
    return () => {
      t.stopped = true;
    };
  };
  return {createTimer, timers};
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

test('initialStock 0 starts SOLD_OUT and reserve is ignored', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 0)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  assert.deepEqual(c.getState('p'), {status: 'SOLD_OUT', stock: 0});
  await c.reserve('p');
  assert.equal(s.reserves.length, 0);
  assert.equal(c.getState('nope'), undefined);
});

test('reserve is applied optimistically, then confirmed', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  let notified = 0;
  c.subscribe(() => notified++);
  const done = c.reserve('p');
  assert.deepEqual(c.getState('p'), {status: 'RESERVING', stock: 1});
  assert.equal(notified, 1);
  s.reserves[0]!.ok({lockId: 'L1', expiresAt: 9_000});
  await done;
  assert.deepEqual(c.getState('p'), {
    status: 'RESERVED',
    stock: 1,
    expiresAt: 9_000,
  });
});

test('SERVER_ERROR rolls the optimistic reserve back', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  const done = c.reserve('p');
  s.reserves[0]!.fail(reject('SERVER_ERROR'));
  await done;
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
});

test('SOLD_OUT from the server ends in SOLD_OUT with stock 0', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 1)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  const done = c.reserve('p');
  s.reserves[0]!.fail(reject('SOLD_OUT'));
  await done;
  assert.deepEqual(c.getState('p'), {status: 'SOLD_OUT', stock: 0});
});

test('an unknown error or abort rolls back as SERVER_ERROR', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  const done = c.reserve('p');
  s.reserves[0]!.fail(new DOMException('aborted', 'AbortError'));
  await done;
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
});

test('a second reserve while RESERVING never reaches the server', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  const first = c.reserve('p');
  await c.reserve('p');
  assert.equal(s.reserves.length, 1);
  s.reserves[0]!.ok({lockId: 'L1', expiresAt: 9_000});
  await first;
  await c.reserve('p'); // RESERVED: rejected by the FSM
  assert.equal(s.reserves.length, 1);
});

async function reserved(
  expiresAt: number,
  now: () => number,
  createTimer: CreateTimer = noTimer,
) {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now,
    createTimer,
  });
  const done = c.reserve('p');
  s.reserves[0]!.ok({lockId: 'L1', expiresAt});
  await done;
  return {s, c};
}

test('checkout is optimistic and uses the held lockId', async () => {
  const {s, c} = await reserved(9_000, () => 0);
  const done = c.checkout('p');
  assert.deepEqual(c.getState('p'), {
    status: 'CHECKING_OUT',
    stock: 1,
    expiresAt: 9_000,
  });
  assert.equal(s.checkouts[0]!.lockId, 'L1');
  s.checkouts[0]!.ok();
  await done;
  assert.deepEqual(c.getState('p'), {status: 'PURCHASED', stock: 1});
});

test('rejected checkout goes back to RESERVED, same expiresAt', async () => {
  const {s, c} = await reserved(9_000, () => 8_999);
  const done = c.checkout('p');
  s.checkouts[0]!.fail(reject('SERVER_ERROR'));
  await done;
  assert.deepEqual(c.getState('p'), {
    status: 'RESERVED',
    stock: 1,
    expiresAt: 9_000,
  });
  // Still alive: the shopper may try again with the same lock.
  void c.checkout('p');
  assert.equal(s.checkouts.length, 2);
});

test('rejected checkout on an expired lock releases it, no retry', async () => {
  let t = 0;
  const {s, c} = await reserved(9_000, () => t);
  const done = c.checkout('p');
  t = 9_000;
  s.checkouts[0]!.fail(reject('SERVER_ERROR'));
  await done;
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
  await c.checkout('p'); // lock is gone
  assert.equal(s.checkouts.length, 1);
});

test('dispose aborts in-flight calls and ignores late answers', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  let notified = 0;
  c.subscribe(() => notified++);
  const done = c.reserve('p');
  assert.equal(notified, 1);
  c.dispose();
  assert.equal(s.reserves[0]!.signal?.aborted, true);
  s.reserves[0]!.ok({lockId: 'L1', expiresAt: 9_000});
  await done;
  assert.equal(c.getState('p')?.status, 'RESERVING');
  assert.equal(notified, 1);
  await c.reserve('p');
  assert.equal(s.reserves.length, 1);
});

test('unsubscribe stops notifications', async () => {
  const s = stub();
  const c = createSaleController({
    products: [product('p', 2)],
    server: s.server,
    now: () => 0,
    createTimer: noTimer,
  });
  let n = 0;
  const off = c.subscribe(() => n++);
  off();
  void c.reserve('p');
  assert.equal(n, 0);
});

test('seeded server: stock stays >= 0 through every notification', async () => {
  const products = [product('a', 2), product('b', 1), product('c', 0)];
  const server = createMockSaleServer({
    products,
    latencyMs: {min: 0, max: 2},
    failureRate: 0.4,
    random: mulberry32(3),
  });
  const c = createSaleController({products, server, createTimer: noTimer});
  c.subscribe(() => {
    for (const p of products) {
      const st = c.getState(p.id)!;
      assert.ok(st.stock >= 0 && Number.isInteger(st.stock));
    }
  });
  for (let round = 0; round < 20; round++) {
    await Promise.all(
      products.flatMap((p) => [c.reserve(p.id), c.checkout(p.id)]),
    );
    await Promise.all(products.map((p) => c.checkout(p.id)));
    await tick();
  }
  c.dispose();
});

test('RESERVED arms a timer for expiresAt - now', async () => {
  const f = fakeTimers();
  const {c} = await reserved(9_000, () => 4_000, f.createTimer);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0]!.durationMs, 5_000);
  assert.equal(c.getLockRemaining('p'), 5_000);
  const seen: Array<[string, number]> = [];
  c.subscribeLockTick((id, ms) => seen.push([id, ms]));
  f.timers[0]!.onTick(4_900);
  assert.deepEqual(seen, [['p', 4_900]]);
  assert.equal(c.getLockRemaining('p'), 4_900);
});

test('timer reaching 0 expires the lock and releases the stock', async () => {
  const f = fakeTimers();
  const {s, c} = await reserved(9_000, () => 0, f.createTimer);
  f.timers[0]!.onTick(0);
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
  assert.equal(f.timers[0]!.stopped, true);
  assert.equal(c.getLockRemaining('p'), undefined);
  await c.checkout('p'); // the lock is gone
  assert.equal(s.checkouts.length, 0);
});

test('checkout stops the timer; stale ticks are ignored', async () => {
  const f = fakeTimers();
  const {s, c} = await reserved(9_000, () => 0, f.createTimer);
  const done = c.checkout('p');
  assert.equal(f.timers[0]!.stopped, true);
  f.timers[0]!.onTick(0); // would expire the lock if it were still live
  assert.equal(c.getState('p')?.status, 'CHECKING_OUT');
  s.checkouts[0]!.ok();
  await done;
  assert.equal(c.getState('p')?.status, 'PURCHASED');
  assert.equal(f.timers.length, 1);
});

test('rejected checkout with time left re-arms the timer', async () => {
  let t = 1_000;
  const f = fakeTimers();
  const {s, c} = await reserved(9_000, () => t, f.createTimer);
  const done = c.checkout('p');
  t = 3_000;
  s.checkouts[0]!.fail(reject('SERVER_ERROR'));
  await done;
  assert.equal(f.timers.length, 2);
  assert.equal(f.timers[1]!.durationMs, 6_000);
  assert.equal(f.timers[1]!.stopped, false);
  assert.equal(c.getState('p')?.status, 'RESERVED');
});

test('rejected checkout past expiry expires at once, no timer', async () => {
  let t = 0;
  const f = fakeTimers();
  const {c, s} = await reserved(9_000, () => t, f.createTimer);
  const done = c.checkout('p');
  t = 9_000;
  s.checkouts[0]!.fail(reject('SERVER_ERROR'));
  await done;
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
  assert.equal(f.timers.length, 1);
});

test('a confirmation already past its expiry releases at once', async () => {
  const f = fakeTimers();
  const {c} = await reserved(500, () => 1_000, f.createTimer);
  assert.deepEqual(c.getState('p'), {status: 'AVAILABLE', stock: 2});
  assert.equal(f.timers.length, 0);
});

test('dispose stops the running timer', async () => {
  const f = fakeTimers();
  const {c} = await reserved(9_000, () => 0, f.createTimer);
  c.dispose();
  assert.equal(f.timers[0]!.stopped, true);
  f.timers[0]!.onTick(0);
  assert.equal(c.getState('p')?.status, 'RESERVED');
});

test('the controller never uses setInterval', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(
    new URL('./sale-controller.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(src, /setInterval/);
});
