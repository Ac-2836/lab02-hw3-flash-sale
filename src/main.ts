import {announcementFor} from './announcements.ts';
import {mountCountdown} from './countdown-view.ts';
import {PRODUCTS} from './data.ts';
import {formatTime} from './format-time.ts';
import {createMockSaleServer} from './mock-server.ts';
import {
  createProductList,
  describeProduct,
  renderCard,
} from './product-view.ts';
import type {ProductViewModel} from './product-view.ts';
import {startRivals} from './rivals.ts';
import {createSaleController} from './sale-controller.ts';
import type {InventoryStatus} from './types.ts';

const SALE_DURATION_MS = 15 * 60 * 1000;
const LOCK_MS = 20_000;

function required(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`#${id} element is missing from index.html`);
  }
  return node;
}

const countdownEl = required('countdown');
const listEl = required('products');
const noticeEl = required('notice');

const server = createMockSaleServer({products: PRODUCTS, lockMs: LOCK_MS});
const controller = createSaleController({products: PRODUCTS, server});
const cards = createProductList(listEl, PRODUCTS);
let saleOpen = true;
const shown = new Map<string, ProductViewModel>();

const lastFsm = new Map<string, InventoryStatus>();
const MAX_NOTICES = 5;

/** Appends to the live log (never replaces) and keeps the newest few. */
function notify(text: string): void {
  const p = document.createElement('p');
  p.textContent = text;
  noticeEl.append(p);
  while (noticeEl.childElementCount > MAX_NOTICES) {
    noticeEl.firstElementChild?.remove();
  }
}

/** Re-reads state and server stock; touches only cards that changed. */
function refresh(): void {
  for (const p of PRODUCTS) {
    const state = controller.getState(p.id);
    const refs = cards.get(p.id);
    if (!state || !refs) {
      continue;
    }
    // Only the shopper's own FSM transitions are announced; a sell-out
    // caused by rivals stays visible on the card but is not read out.
    const from = lastFsm.get(p.id);
    lastFsm.set(p.id, state.status);
    if (from && from !== state.status) {
      const text = announcementFor(p.name, from, state.status);
      if (text) {
        notify(text);
      }
    }
    const vm = describeProduct(state, server.stockOf(p.id), saleOpen);
    const prev = shown.get(p.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(vm)) {
      continue;
    }
    shown.set(p.id, vm);
    renderCard(refs, vm);
  }
}

controller.subscribe(refresh);
controller.subscribeLockTick((id, remainingMs) => {
  const refs = cards.get(id);
  if (refs) {
    refs.lock.textContent = formatTime(remainingMs);
  }
});

// One delegated listener for every card button.
listEl.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) {
    return;
  }
  const btn = e.target.closest<HTMLButtonElement>('button[data-action]');
  const id = btn?.closest<HTMLElement>('[data-product-id]')?.dataset[
    'productId'
  ];
  if (!btn || btn.disabled || !id) {
    return;
  }
  if (btn.dataset['action'] === 'reserve' && saleOpen) {
    void controller.reserve(id);
  } else if (btn.dataset['action'] === 'checkout') {
    void controller.checkout(id);
  }
});

const stopRivals = startRivals({
  server,
  products: PRODUCTS,
  onActivity: refresh,
});

function endSale(): void {
  saleOpen = false;
  stopRivals();
  refresh();
  notify('Đợt flash sale đã kết thúc.');
}

const stopCountdown = mountCountdown(countdownEl, SALE_DURATION_MS, endSale);
refresh();

function teardown(): void {
  stopCountdown();
  stopRivals();
  controller.dispose();
}

// A bfcache page is only frozen: rAF and timers resume on restore and the
// countdown recomputes from the fixed `saleEnd`, so nothing is torn down.
const onPageHide = (e: PageTransitionEvent): void => {
  if (!e.persisted) {
    teardown();
  }
};
window.addEventListener('pagehide', onPageHide);
import.meta.hot?.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  teardown();
});
