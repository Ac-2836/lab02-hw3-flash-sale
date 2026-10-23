import type {MockSaleServer} from './mock-server.ts';
import type {Product} from './types.ts';

export interface RivalsOptions {
  readonly server: MockSaleServer;
  readonly products: readonly Product[];
  /** Called after every rival call settles, so the UI can resync stock. */
  readonly onActivity: () => void;
  readonly random?: () => number;
  /** Gap between rival actions, ms. */
  readonly gapMs?: {readonly min: number; readonly max: number};
  /** Chance a rival that got a lock checks out; otherwise it abandons it. */
  readonly buyRate?: number;
}

/**
 * Simulated rival buyers. They use the same server API as the shopper, each
 * with its own locks, so SOLD_OUT and lock expiry happen for real.
 * setTimeout only spaces out their actions; it is not a countdown.
 * Returns stop(), which cancels timers and in-flight calls.
 */
export function startRivals(options: RivalsOptions): () => void {
  const random = options.random ?? Math.random;
  const gap = options.gapMs ?? {min: 700, max: 1800};
  const buyRate = options.buyRate ?? 0.7;
  const abort = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number, fn: () => void): void => {
    if (abort.signal.aborted) {
      return;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const between = (min: number, max: number): number =>
    min + random() * (max - min);
  const settled = (): void => {
    if (!abort.signal.aborted) {
      options.onActivity();
    }
  };

  function act(): void {
    const product = options.products[
      Math.floor(random() * options.products.length)
    ];
    if (product) {
      options.server.reserve(product.id, abort.signal).then(
        ({lockId}) => {
          settled();
          if (random() < buyRate) {
            later(between(500, 2500), () => {
              options.server
                .checkout(product.id, lockId, abort.signal)
                .then(settled, settled);
            });
          }
        },
        settled, // SOLD_OUT, server error or abort: nothing to hold
      );
    }
    later(between(gap.min, gap.max), act);
  }

  later(between(gap.min, gap.max), act);
  return () => {
    abort.abort();
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
