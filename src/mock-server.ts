import type {Product, ProductId, RejectReason} from './types.ts';

/** Rejection carried by a failed reserve/checkout promise. */
export class SaleRejection extends Error {
  readonly reason: RejectReason;

  constructor(reason: RejectReason, message: string) {
    super(message);
    this.name = 'SaleRejection';
    this.reason = reason;
  }
}

export interface MockServerOptions {
  readonly products: readonly Product[];
  /** Returns a number in [0, 1); inject mulberry32(seed) for tests. */
  readonly random?: () => number;
  readonly latencyMs?: {readonly min: number; readonly max: number};
  /** Chance in [0, 1] that a call fails with SERVER_ERROR. */
  readonly failureRate?: number;
  /** How long a reservation holds its unit. */
  readonly lockMs?: number;
  readonly now?: () => number;
}

export interface Reservation {
  readonly lockId: string;
  readonly expiresAt: number;
}

export interface MockSaleServer {
  /** Resolves with a unique lock and its expiry (epoch ms). */
  reserve(productId: ProductId, signal?: AbortSignal): Promise<Reservation>;
  /** Consumes exactly the lock `lockId`; a missing, expired or foreign one
   * rejects with SERVER_ERROR. */
  checkout(
    productId: ProductId,
    lockId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Authoritative units not locked or sold, after releasing expired locks. */
  stockOf(productId: ProductId): number;
}

/** Small seedable PRNG so tests can replay the same sequence of outcomes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Network delay; an abort cancels the request before the server sees it. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

export function createMockSaleServer(
  options: MockServerOptions,
): MockSaleServer {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const minMs = options.latencyMs?.min ?? 300;
  const maxMs = options.latencyMs?.max ?? 900;
  const failureRate = options.failureRate ?? 0.2;
  const lockMs = options.lockMs ?? 30_000;
  if (!(minMs >= 0 && maxMs >= minMs)) {
    throw new RangeError('latencyMs needs 0 <= min <= max');
  }
  if (!(failureRate >= 0 && failureRate <= 1)) {
    throw new RangeError('failureRate must be within [0, 1]');
  }
  if (!(lockMs > 0)) {
    throw new RangeError('lockMs must be > 0');
  }

  const stock = new Map<ProductId, number>();
  for (const p of options.products) {
    stock.set(p.id, p.initialStock);
  }
  // Live locks per product: lockId -> expiry (one lock = one held unit).
  const locks = new Map<ProductId, Map<string, number>>();
  let lockSeq = 0;

  const releaseExpired = (id: ProductId): void => {
    const held = locks.get(id);
    if (!held) {
      return;
    }
    for (const [lockId, expiresAt] of held) {
      if (expiresAt <= now()) {
        held.delete(lockId);
        stock.set(id, (stock.get(id) ?? 0) + 1);
      }
    }
  };

  // Latency and failure are drawn up front so the PRNG sequence depends only
  // on call order. State is read and changed after the delay, in one step.
  async function request<T>(
    id: ProductId,
    signal: AbortSignal | undefined,
    apply: (failed: boolean) => T,
  ): Promise<T> {
    const wait = minMs + random() * (maxMs - minMs);
    const failed = random() < failureRate;
    await delay(wait, signal);
    if (!stock.has(id)) {
      throw new SaleRejection('SERVER_ERROR', `Unknown product ${id}`);
    }
    releaseExpired(id);
    return apply(failed);
  }

  return {
    reserve: (id, signal) =>
      request(id, signal, (failed) => {
        const left = stock.get(id) ?? 0;
        if (left < 1) {
          throw new SaleRejection('SOLD_OUT', `${id} is sold out`);
        }
        if (failed) {
          throw new SaleRejection('SERVER_ERROR', 'Simulated server error');
        }
        const lockId = `lock-${++lockSeq}`;
        const expiresAt = now() + lockMs;
        stock.set(id, left - 1);
        const held = locks.get(id) ?? new Map<string, number>();
        held.set(lockId, expiresAt);
        locks.set(id, held);
        return {lockId, expiresAt};
      }),
    checkout: (id, lockId, signal) =>
      request(id, signal, (failed) => {
        if (failed) {
          throw new SaleRejection('SERVER_ERROR', 'Simulated server error');
        }
        if (!locks.get(id)?.delete(lockId)) {
          throw new SaleRejection('SERVER_ERROR', `No active lock ${lockId}`);
        }
      }),
    stockOf: (id) => {
      releaseExpired(id);
      return stock.get(id) ?? 0;
    },
  };
}
