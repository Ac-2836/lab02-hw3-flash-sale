import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {createAntiDriftTimer} from './anti-drift-timer.ts';

// Fake clock and a manual rAF queue; frames run only when the test says so.
let now = 0;
let nextId = 1;
let queue = new Map<number, () => void>();
const realNow = Date.now;
const g = globalThis as unknown as Record<string, unknown>;

function frame(advanceMs: number): void {
  now += advanceMs;
  const pending = [...queue.values()];
  queue = new Map();
  pending.forEach((cb) => cb());
}

beforeEach(() => {
  now = 1_000;
  nextId = 1;
  queue = new Map();
  Date.now = () => now;
  g.requestAnimationFrame = (cb: () => void) => {
    queue.set(nextId, cb);
    return nextId++;
  };
  g.cancelAnimationFrame = (id: number) => void queue.delete(id);
});

afterEach(() => {
  Date.now = realNow;
});

test('remaining follows the clock, not the number of ticks', () => {
  const seen: number[] = [];
  createAntiDriftTimer(10_000, (r) => seen.push(r));
  frame(16);
  frame(5_000); // a long stall: no drift, just a bigger step
  frame(16);
  assert.deepEqual(seen, [9_984, 4_984, 4_968]);
});

test('reports 0 once and stops scheduling frames', () => {
  const seen: number[] = [];
  createAntiDriftTimer(100, (r) => seen.push(r));
  frame(500);
  assert.deepEqual(seen, [0]);
  assert.equal(queue.size, 0);
});

test('cleanup cancels the pending frame and is idempotent', () => {
  const seen: number[] = [];
  const stop = createAntiDriftTimer(1_000, (r) => seen.push(r));
  stop();
  stop();
  assert.equal(queue.size, 0);
  frame(16);
  assert.deepEqual(seen, []);
});

test('cleanup called inside onTick stops further frames', () => {
  let stop = (): void => {};
  stop = createAntiDriftTimer(1_000, () => stop());
  frame(16);
  assert.equal(queue.size, 0);
});

test('rejects an invalid duration', () => {
  assert.throws(() => createAntiDriftTimer(-1, () => {}), RangeError);
  assert.throws(() => createAntiDriftTimer(NaN, () => {}), RangeError);
});

test('source has no setInterval or setTimeout countdown', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(
    new URL('./anti-drift-timer.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(src, /setInterval|setTimeout/);
});
