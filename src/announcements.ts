import type {InventoryStatus} from './types.ts';

/**
 * Message for the shopper's own FSM transition, or undefined when silent.
 * It takes FSM statuses, not display statuses, so a product that sells out
 * because of a rival (a display-only change) is never announced.
 */
export function announcementFor(
  name: string,
  from: InventoryStatus,
  to: InventoryStatus,
): string | undefined {
  if (from === 'RESERVING' && to === 'RESERVED') {
    return `Đã giữ ${name}. Hãy thanh toán trước khi hết thời gian giữ.`;
  }
  if (from === 'RESERVING' && to === 'AVAILABLE') {
    return `Không giữ được ${name} do lỗi máy chủ. Đã hoàn lại.`;
  }
  if (from === 'RESERVING' && to === 'SOLD_OUT') {
    return `${name} đã hết hàng, không giữ được.`;
  }
  if (from === 'RESERVED' && to === 'AVAILABLE') {
    return `Hết thời gian giữ ${name}. Hàng đã trả về kho.`;
  }
  if (from === 'CHECKING_OUT' && to === 'PURCHASED') {
    return `Đã mua ${name}.`;
  }
  if (from === 'CHECKING_OUT' && to === 'RESERVED') {
    return `Thanh toán ${name} thất bại. Bạn vẫn đang giữ hàng.`;
  }
  return undefined;
}
