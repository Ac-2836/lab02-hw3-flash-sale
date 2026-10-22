/** Stable unique product id; used as the render key. */
export type ProductId = string;

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  /** Sale price in VND, a positive integer (no fractional dong). */
  readonly priceVnd: number;
  /** Units on the shelf when the sale starts. */
  readonly initialStock: number;
}

/**
 * Inventory FSM for one product, seen from the local shopper.
 * `stock` is the units still available to others; it already excludes the
 * unit this shopper holds, so it never goes below 0.
 */
export type InventoryState =
  | {readonly status: 'AVAILABLE'; readonly stock: number}
  /** Optimistic local reserve, waiting for the server's answer. */
  | {readonly status: 'RESERVING'; readonly stock: number}
  /** Server confirmed; the lock is released at `expiresAt` (epoch ms). */
  | {
      readonly status: 'RESERVED';
      readonly stock: number;
      readonly expiresAt: number;
    }
  /** Optimistic checkout in flight; falls back to RESERVED on rejection. */
  | {
      readonly status: 'CHECKING_OUT';
      readonly stock: number;
      readonly expiresAt: number;
    }
  | {readonly status: 'PURCHASED'; readonly stock: number}
  /** Nothing left to reserve (stock is always 0). */
  | {readonly status: 'SOLD_OUT'; readonly stock: 0};

export type InventoryStatus = InventoryState['status'];

export type RejectReason = 'SOLD_OUT' | 'SERVER_ERROR';

export type InventoryEvent =
  | {readonly type: 'RESERVE'}
  | {readonly type: 'RESERVE_CONFIRMED'; readonly expiresAt: number}
  | {readonly type: 'RESERVE_REJECTED'; readonly reason: RejectReason}
  | {readonly type: 'LOCK_EXPIRED'}
  | {readonly type: 'CHECKOUT'}
  | {readonly type: 'CHECKOUT_CONFIRMED'}
  | {readonly type: 'CHECKOUT_REJECTED'; readonly reason: RejectReason};

/** Result of a transition: invalid events are reported, never applied. */
export type TransitionResult =
  | {readonly ok: true; readonly state: InventoryState}
  | {readonly ok: false; readonly error: string};
