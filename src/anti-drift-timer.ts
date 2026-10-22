/**
 * Counts down `durationMs` and reports the remaining ms on every frame.
 * Remaining time is always `targetTime - Date.now()`, so a late or skipped
 * frame (busy main thread, background tab) never accumulates drift.
 * Returns a cleanup function; it is safe to call more than once.
 */
export function createAntiDriftTimer(
  durationMs: number,
  onTick: (remaining: number) => void,
): () => void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError('durationMs must be a finite number >= 0');
  }
  const targetTime = Date.now() + durationMs;
  let rafId = 0;
  let stopped = false;

  function tick(): void {
    const remaining = Math.max(0, targetTime - Date.now());
    onTick(remaining);
    // onTick may have called the cleanup function.
    if (remaining > 0 && !stopped) {
      rafId = requestAnimationFrame(tick);
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
