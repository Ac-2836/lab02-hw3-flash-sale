import {mountCountdown} from './countdown-view.ts';

const SALE_DURATION_MS = 15 * 60 * 1000;

const countdownEl = document.getElementById('countdown');
if (!countdownEl) {
  throw new Error('#countdown element is missing from index.html');
}

// The end time is fixed once; a bfcache restore must not extend the sale.
const saleEnd = Date.now() + SALE_DURATION_MS;
let stopCountdown = mountCountdown(countdownEl, SALE_DURATION_MS);

const onPageHide = (): void => stopCountdown();
const onPageShow = (e: PageTransitionEvent): void => {
  if (!e.persisted) {
    return;
  }
  stopCountdown();
  const remaining = Math.max(0, saleEnd - Date.now());
  stopCountdown = mountCountdown(countdownEl, remaining);
};

window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
import.meta.hot?.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  stopCountdown();
});
