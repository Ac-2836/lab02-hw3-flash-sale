import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transition} from './inventory-machine.ts';
import type {InventoryEvent, InventoryState} from './types.ts';

const EXP = 5_000;
const STATES: Record<InventoryState['status'], InventoryState> = {
  AVAILABLE: {status: 'AVAILABLE', stock: 3},
  RESERVING: {status: 'RESERVING', stock: 2},
  RESERVED: {status: 'RESERVED', stock: 2, expiresAt: EXP},
  CHECKING_OUT: {status: 'CHECKING_OUT', stock: 2, expiresAt: EXP},
  PURCHASED: {status: 'PURCHASED', stock: 2},
  SOLD_OUT: {status: 'SOLD_OUT', stock: 0},
};

const EVENTS: Record<string, InventoryEvent> = {
  RESERVE: {type: 'RESERVE'},
  CONFIRMED: {type: 'RESERVE_CONFIRMED', expiresAt: 9_000},
  REJ_ERR: {type: 'RESERVE_REJECTED', reason: 'SERVER_ERROR'},
  REJ_SOLD: {type: 'RESERVE_REJECTED', reason: 'SOLD_OUT'},
  EXPIRED: {type: 'LOCK_EXPIRED'},
  CHECKOUT: {type: 'CHECKOUT'},
  PAID: {type: 'CHECKOUT_CONFIRMED'},
  PAY_ERR: {type: 'CHECKOUT_REJECTED', reason: 'SERVER_ERROR'},
  PAY_SOLD: {type: 'CHECKOUT_REJECTED', reason: 'SOLD_OUT'},
};

// Every legal (state, event) pair and its expected result; all others fail.
const VALID: Record<string, InventoryState> = {
  'AVAILABLE/RESERVE': {status: 'RESERVING', stock: 2},
  'RESERVING/CONFIRMED': {status: 'RESERVED', stock: 2, expiresAt: 9_000},
  'RESERVING/REJ_ERR': {status: 'AVAILABLE', stock: 3},
  'RESERVING/REJ_SOLD': {status: 'SOLD_OUT', stock: 0},
  'RESERVED/CHECKOUT': {status: 'CHECKING_OUT', stock: 2, expiresAt: EXP},
  'RESERVED/EXPIRED': {status: 'AVAILABLE', stock: 3},
  'CHECKING_OUT/PAID': {status: 'PURCHASED', stock: 2},
  'CHECKING_OUT/PAY_ERR': {status: 'RESERVED', stock: 2, expiresAt: EXP},
  'CHECKING_OUT/PAY_SOLD': {status: 'RESERVED', stock: 2, expiresAt: EXP},
};

test('every state x event pair matches the transition table', () => {
  let checked = 0;
  for (const [sName, state] of Object.entries(STATES)) {
    for (const [eName, event] of Object.entries(EVENTS)) {
      const key = `${sName}/${eName}`;
      const result = transition(state, event);
      const expected = VALID[key];
      if (expected) {
        assert.deepEqual(result, {ok: true, state: expected}, key);
      } else {
        assert.equal(result.ok, false, key);
        assert.equal(typeof (result as {error: string}).error, 'string', key);
      }
      checked++;
    }
  }
  assert.equal(checked, 6 * 9);
});

test('AVAILABLE with stock 0 rejects RESERVE', () => {
  const r = transition({status: 'AVAILABLE', stock: 0}, {type: 'RESERVE'});
  assert.equal(r.ok, false);
});

test('LOCK_EXPIRED while CHECKING_OUT is rejected', () => {
  assert.equal(
    transition(STATES.CHECKING_OUT, {type: 'LOCK_EXPIRED'}).ok,
    false,
  );
});

test('late and duplicate events are rejected', () => {
  const reserved = transition(STATES.RESERVING, EVENTS.CONFIRMED!);
  assert.ok(reserved.ok);
  assert.equal(transition(reserved.state, EVENTS.CONFIRMED!).ok, false);
  assert.equal(transition(reserved.state, EVENTS.REJ_ERR!).ok, false);
  assert.equal(transition(STATES.PURCHASED, EVENTS.EXPIRED!).ok, false);
});

test('RESERVE_CONFIRMED with a non-finite expiresAt is rejected', () => {
  const r = transition(STATES.RESERVING, {
    type: 'RESERVE_CONFIRMED',
    expiresAt: NaN,
  });
  assert.equal(r.ok, false);
});

test('inputs are never mutated', () => {
  for (const state of Object.values(STATES)) {
    for (const event of Object.values(EVENTS)) {
      const before = JSON.stringify(state);
      transition(state, event);
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('stock never goes below 0 over random event sequences', () => {
  let seed = 12345;
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const events = Object.values(EVENTS);
  for (let run = 0; run < 200; run++) {
    let state: InventoryState = {status: 'AVAILABLE', stock: rand(3)};
    for (let i = 0; i < 50; i++) {
      const r = transition(state, events[rand(events.length)]!);
      if (r.ok) {
        state = r.state;
      }
      assert.ok(state.stock >= 0 && Number.isInteger(state.stock));
    }
  }
});
