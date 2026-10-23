import type {InventoryState, InventoryStatus, Product} from './types.ts';

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export const formatVnd = (amount: number): string => VND.format(amount);

const STATUS_TEXT: Record<InventoryStatus, string> = {
  AVAILABLE: 'Còn hàng',
  RESERVING: 'Đang giữ hàng…',
  RESERVED: 'Đã giữ hàng',
  CHECKING_OUT: 'Đang xác nhận thanh toán…',
  PURCHASED: 'Đã mua',
  SOLD_OUT: 'Hết hàng',
};

export interface ProductViewModel {
  /** Display status; AVAILABLE with no stock left reads as SOLD_OUT. */
  readonly status: InventoryStatus;
  readonly statusText: string;
  readonly stock: number;
  readonly canReserve: boolean;
  readonly canCheckout: boolean;
  readonly showLock: boolean;
}

/**
 * Maps FSM state to what the card shows. `syncedStock` is the server's
 * stock (rivals included). While RESERVING the local optimistic value is
 * capped by the server's stock minus our pending unit, so a rival can make
 * the shown stock fall but a stale local value can never make it rise.
 */
export function describeProduct(
  state: InventoryState,
  syncedStock: number,
  saleOpen: boolean,
): ProductViewModel {
  const raw =
    state.status === 'RESERVING'
      ? Math.max(0, Math.min(state.stock, syncedStock - 1))
      : syncedStock;
  const status: InventoryStatus =
    state.status === 'AVAILABLE' && raw < 1 ? 'SOLD_OUT' : state.status;
  return {
    status,
    statusText: STATUS_TEXT[status],
    stock: status === 'SOLD_OUT' ? 0 : raw,
    canReserve: saleOpen && status === 'AVAILABLE',
    canCheckout: status === 'RESERVED',
    showLock: status === 'RESERVED' || status === 'CHECKING_OUT',
  };
}

export interface CardRefs {
  readonly article: HTMLElement;
  readonly status: HTMLElement;
  readonly stock: HTMLElement;
  readonly lockRow: HTMLElement;
  readonly lock: HTMLElement;
  readonly reserve: HTMLButtonElement;
  readonly checkout: HTMLButtonElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function row(label: string, value: HTMLElement): HTMLElement {
  const p = el('p', 'row');
  p.append(el('span', 'label', `${label}: `), value);
  return p;
}

function button(action: string, text: string): HTMLButtonElement {
  const b = el('button', 'btn', text);
  b.type = 'button';
  b.dataset['action'] = action;
  return b;
}

/** Builds one static card per product once; later updates are in place. */
export function createProductList(
  list: HTMLElement,
  products: readonly Product[],
): Map<string, CardRefs> {
  const cards = new Map<string, CardRefs>();
  for (const p of products) {
    const li = el('li');
    const article = el('article', 'card');
    article.dataset['productId'] = p.id;
    article.tabIndex = -1; // focus fallback when a button disables itself
    const nameId = `name-${p.id}`;
    const name = el('h3', 'name', p.name);
    name.id = nameId;
    article.setAttribute('aria-labelledby', nameId);

    const status = el('span', 'status');
    const stock = el('span', 'stock');
    const lock = el('span', 'lock');
    lock.setAttribute('aria-live', 'off');
    const lockRow = row('Giữ hàng còn', lock);
    lockRow.hidden = true;
    const reserve = button('reserve', 'Giữ hàng');
    const checkout = button('checkout', 'Thanh toán');
    const actions = el('div', 'actions');
    actions.append(reserve, checkout);

    article.append(
      name,
      el('p', 'price', formatVnd(p.priceVnd)),
      row('Còn lại', stock),
      row('Trạng thái', status),
      lockRow,
      actions,
    );
    li.append(article);
    list.append(li);
    cards.set(p.id, {article, status, stock, lockRow, lock, reserve, checkout});
  }
  return cards;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/** Updates one card in place; keeps keyboard focus on the card's action. */
export function renderCard(refs: CardRefs, vm: ProductViewModel): void {
  const active = document.activeElement;
  // Focus is "in" the card on a button or on the article fallback target.
  const focusInCard =
    active === refs.reserve || active === refs.checkout ||
    active === refs.article;
  refs.article.dataset['status'] = vm.status;
  setText(refs.status, vm.statusText);
  setText(refs.stock, String(vm.stock));
  refs.lockRow.hidden = !vm.showLock;
  refs.reserve.disabled = !vm.canReserve;
  refs.checkout.disabled = !vm.canCheckout;
  if (focusInCard) {
    const next = vm.canCheckout
      ? refs.checkout
      : vm.canReserve
        ? refs.reserve
        : refs.article;
    if (next !== active) {
      next.focus();
    }
  }
}
