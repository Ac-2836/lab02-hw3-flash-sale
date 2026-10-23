import {createAntiDriftTimer} from './anti-drift-timer.ts';
import {formatTime} from './format-time.ts';

/** Renders a live countdown into `el`; returns the timer cleanup. */
export function mountCountdown(
  el: HTMLElement,
  durationMs: number,
  onEnd?: () => void,
): () => void {
  // Paint before the first frame so the element is never empty.
  el.textContent = formatTime(durationMs);
  return createAntiDriftTimer(durationMs, (remaining) => {
    el.textContent = formatTime(remaining);
    if (remaining <= 0) {
      onEnd?.();
    }
  });
}
