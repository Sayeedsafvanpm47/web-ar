/**
 * Date helpers for the admin screens.
 *
 * These live outside component modules deliberately: reading the clock during
 * render is impure, and React's lint rules flag it. Keeping the call here also
 * gives one definition of "today" for expiry comparisons.
 *
 * Dates are compared as ISO yyyy-mm-dd strings, matching the `date` column
 * type in Postgres, so no timezone conversion is involved.
 */

/** Today as yyyy-mm-dd. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A date `days` from today as yyyy-mm-dd. Accepts negative values. */
export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
