import type {
  InventoryEvent,
  InventoryState,
  TransitionResult,
} from './types.ts';

const ok = (state: InventoryState): TransitionResult => ({ok: true, state});

const invalid = (
  state: InventoryState,
  event: InventoryEvent,
): TransitionResult => ({
  ok: false,
  error: `Invalid transition: ${event.type} in ${state.status}`,
});

/**
 * Pure inventory transition. Anything not listed below is rejected with
 * `{ok: false}` and the caller keeps its current state.
 *
 * - AVAILABLE with no stock rejects RESERVE (it is never turned into
 *   SOLD_OUT behind the caller's back), so stock can not go below 0.
 * - LOCK_EXPIRED while CHECKING_OUT is rejected: the in-flight checkout
 *   wins and its server answer decides. If it is then rejected, the state
 *   returns to RESERVED with an expiresAt that may already be past, and
 *   the caller must send LOCK_EXPIRED again.
 * - CHECKOUT_REJECTED returns to RESERVED whatever the reason.
 * - PURCHASED and SOLD_OUT are terminal.
 */
export function transition(
  state: InventoryState,
  event: InventoryEvent,
): TransitionResult {
  switch (state.status) {
    case 'AVAILABLE':
      if (event.type === 'RESERVE' && state.stock >= 1) {
        return ok({status: 'RESERVING', stock: state.stock - 1});
      }
      return invalid(state, event);
    case 'RESERVING':
      if (event.type === 'RESERVE_CONFIRMED') {
        if (!Number.isFinite(event.expiresAt)) {
          return {ok: false, error: 'RESERVE_CONFIRMED: bad expiresAt'};
        }
        return ok({
          status: 'RESERVED',
          stock: state.stock,
          expiresAt: event.expiresAt,
        });
      }
      if (event.type === 'RESERVE_REJECTED') {
        return event.reason === 'SOLD_OUT'
          ? ok({status: 'SOLD_OUT', stock: 0})
          : ok({status: 'AVAILABLE', stock: state.stock + 1});
      }
      return invalid(state, event);
    case 'RESERVED':
      if (event.type === 'CHECKOUT') {
        return ok({
          status: 'CHECKING_OUT',
          stock: state.stock,
          expiresAt: state.expiresAt,
        });
      }
      if (event.type === 'LOCK_EXPIRED') {
        return ok({status: 'AVAILABLE', stock: state.stock + 1});
      }
      return invalid(state, event);
    case 'CHECKING_OUT':
      if (event.type === 'CHECKOUT_CONFIRMED') {
        return ok({status: 'PURCHASED', stock: state.stock});
      }
      if (event.type === 'CHECKOUT_REJECTED') {
        return ok({
          status: 'RESERVED',
          stock: state.stock,
          expiresAt: state.expiresAt,
        });
      }
      return invalid(state, event);
    case 'PURCHASED':
    case 'SOLD_OUT':
      return invalid(state, event);
  }
}
