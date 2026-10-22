import {createAntiDriftTimer} from './anti-drift-timer.ts';
import {transition} from './inventory-machine.ts';
import {SaleRejection} from './mock-server.ts';
import type {MockSaleServer} from './mock-server.ts';
import type {
  InventoryEvent,
  InventoryState,
  Product,
  ProductId,
  RejectReason,
} from './types.ts';

export type SaleServer = Pick<MockSaleServer, 'reserve' | 'checkout'>;

export interface SaleControllerOptions {
  readonly products: readonly Product[];
  readonly server: SaleServer;
  readonly now?: () => number;
  /** Injectable for tests; defaults to the rAF based anti-drift timer. */
  readonly createTimer?: typeof createAntiDriftTimer;
}

export interface SaleController {
  /** Current state of one product; undefined for an unknown id. */
  getState(id: ProductId): InventoryState | undefined;
  /** Called after every applied state change. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Remaining ms of the lock held for `id`; undefined when none is armed. */
  getLockRemaining(id: ProductId): number | undefined;
  /** Called on every lock-timer frame (about 60/s); kept apart from
   * `subscribe` so a full re-render is not triggered per frame. */
  subscribeLockTick(
    listener: (id: ProductId, remainingMs: number) => void,
  ): () => void;
  /** Optimistic reserve; resolves when the server has answered. */
  reserve(id: ProductId): Promise<void>;
  /** Optimistic checkout of the lock held for `id`. */
  checkout(id: ProductId): Promise<void>;
  /** Aborts in-flight calls, drops listeners and ignores later answers. */
  dispose(): void;
}

interface Entry {
  readonly id: ProductId;
  state: InventoryState;
  /** Server lock for this product; kept outside the FSM. */
  lockId: string | undefined;
  /** Identifies the call whose answer may still be applied. */
  token: number;
  abort: AbortController | undefined;
  /** Expiry timer; exists only while the state is RESERVED. */
  timer: {stop: () => void} | undefined;
  lockRemaining: number | undefined;
}

/** Network errors and aborts are treated as a plain server failure. */
const reasonOf = (e: unknown): RejectReason =>
  e instanceof SaleRejection ? e.reason : 'SERVER_ERROR';

export function createSaleController(
  options: SaleControllerOptions,
): SaleController {
  const {server} = options;
  const now = options.now ?? Date.now;
  const createTimer = options.createTimer ?? createAntiDriftTimer;
  const entries = new Map<ProductId, Entry>();
  const listeners = new Set<() => void>();
  const tickListeners = new Set<(id: ProductId, ms: number) => void>();
  let tokenSeq = 0;
  let disposed = false;

  for (const p of options.products) {
    entries.set(p.id, {
      id: p.id,
      state:
        p.initialStock > 0
          ? {status: 'AVAILABLE', stock: p.initialStock}
          : {status: 'SOLD_OUT', stock: 0},
      lockId: undefined,
      token: 0,
      abort: undefined,
      timer: undefined,
      lockRemaining: undefined,
    });
  }

  /** The only place state changes; a rejected transition changes nothing. */
  function dispatch(entry: Entry, event: InventoryEvent): boolean {
    const result = transition(entry.state, event);
    if (!result.ok) {
      return false;
    }
    entry.state = result.state;
    if (result.state.status !== 'RESERVED' &&
        result.state.status !== 'CHECKING_OUT') {
      entry.lockId = undefined;
    }
    if (result.state.status !== 'RESERVED') {
      stopTimer(entry);
    }
    listeners.forEach((l) => l());
    if (result.state.status === 'RESERVED' && !entry.timer) {
      armTimer(entry, result.state.expiresAt);
    }
    return true;
  }

  function stopTimer(entry: Entry): void {
    entry.timer?.stop();
    entry.timer = undefined;
    entry.lockRemaining = undefined;
  }

  /** Expires the lock at `expiresAt`, or at once if that is already past. */
  function armTimer(entry: Entry, expiresAt: number): void {
    const remaining = expiresAt - now();
    if (remaining <= 0) {
      dispatch(entry, {type: 'LOCK_EXPIRED'});
      return;
    }
    const handle = {stop: () => {}};
    entry.timer = handle;
    entry.lockRemaining = remaining;
    tickListeners.forEach((l) => l(entry.id, remaining));
    const stop = createTimer(remaining, (left) => {
      if (entry.timer !== handle) {
        return;
      }
      entry.lockRemaining = left;
      tickListeners.forEach((l) => l(entry.id, left));
      if (left <= 0) {
        dispatch(entry, {type: 'LOCK_EXPIRED'});
      }
    });
    handle.stop = stop;
    if (entry.timer !== handle) {
      stop();
    }
  }

  /** Starts a call: applies `first` optimistically, then awaits the server. */
  async function run<T>(
    entry: Entry,
    first: InventoryEvent,
    call: (signal: AbortSignal) => Promise<T>,
    onSuccess: (value: T) => void,
    onFailure: (reason: RejectReason) => void,
  ): Promise<void> {
    if (!dispatch(entry, first)) {
      return;
    }
    const token = ++tokenSeq;
    const abort = new AbortController();
    entry.token = token;
    entry.abort = abort;
    let value: T;
    try {
      value = await call(abort.signal);
    } catch (e) {
      if (entry.token === token && !disposed) {
        entry.abort = undefined;
        onFailure(reasonOf(e));
      }
      return;
    }
    // A superseded or disposed request must not touch the state.
    if (entry.token === token && !disposed) {
      entry.abort = undefined;
      onSuccess(value);
    }
  }

  return {
    getState: (id) => entries.get(id)?.state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getLockRemaining: (id) => entries.get(id)?.lockRemaining,
    subscribeLockTick: (listener) => {
      tickListeners.add(listener);
      return () => void tickListeners.delete(listener);
    },
    reserve: async (id) => {
      const entry = entries.get(id);
      if (!entry || disposed) {
        return;
      }
      await run(
        entry,
        {type: 'RESERVE'},
        (signal) => server.reserve(id, signal),
        ({lockId, expiresAt}) => {
          entry.lockId = lockId;
          dispatch(entry, {type: 'RESERVE_CONFIRMED', expiresAt});
        },
        (reason) => void dispatch(entry, {type: 'RESERVE_REJECTED', reason}),
      );
    },
    checkout: async (id) => {
      const entry = entries.get(id);
      const lockId = entry?.lockId;
      if (!entry || lockId === undefined || disposed) {
        return;
      }
      await run(
        entry,
        {type: 'CHECKOUT'},
        (signal) => server.checkout(id, lockId, signal),
        () => void dispatch(entry, {type: 'CHECKOUT_CONFIRMED'}),
        // Back in RESERVED the timer re-arms, or expires an already dead
        // lock at once, so a checkout is never retried on it.
        (reason) => void dispatch(entry, {type: 'CHECKOUT_REJECTED', reason}),
      );
    },
    dispose: () => {
      disposed = true;
      entries.forEach((e) => {
        e.abort?.abort();
        stopTimer(e);
      });
      listeners.clear();
      tickListeners.clear();
    },
  };
}
