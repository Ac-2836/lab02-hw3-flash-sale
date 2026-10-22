const pad = (n: number, width: number): string =>
  String(n).padStart(width, '0');

/**
 * Formats remaining milliseconds as `hh:mm:ss.ms` (ms is 3 digits).
 * Fractions round up so the display only reads zero when time is truly up.
 * Invalid or negative input is shown as zero; hours may exceed 2 digits.
 */
export function formatTime(remainingMs: number): string {
  const total = Number.isFinite(remainingMs)
    ? Math.max(0, Math.ceil(remainingMs))
    : 0;
  const ms = total % 1000;
  const totalSeconds = Math.floor(total / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(ms, 3)}`;
}
