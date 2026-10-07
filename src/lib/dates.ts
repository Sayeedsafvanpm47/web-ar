/**
 * Date helpers.
 *
 * Everything here works in ISO yyyy-mm-dd strings, matching the `date` column
 * type in Postgres, so no timezone conversion happens at the database edge.
 *
 * The conversion that does matter is which day "today" is. Blackpearl operates
 * in Doha (UTC+3), so a hosting term that ends on the 7th should end at
 * midnight in Doha, not at 03:00 Doha time on the 8th, which is what UTC gives.
 * Every caller must agree on this or admin and the public viewer will disagree
 * about whether a book is live.
 *
 * These also live outside component modules deliberately: reading the clock
 * during render is impure, and React's lint rules flag it.
 */

/** The timezone the business operates in. */
export const BUSINESS_TIMEZONE = 'Asia/Qatar';

/** `date` as yyyy-mm-dd in the business timezone. */
function isoInBusinessTimezone(date: Date): string {
  // en-CA formats as yyyy-mm-dd, which is exactly the shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Today in Doha, as yyyy-mm-dd. */
export function todayISO(): string {
  return isoInBusinessTimezone(new Date());
}

/** A date `days` from today in Doha, as yyyy-mm-dd. Accepts negative values. */
export function isoDaysFromNow(days: number): string {
  return isoInBusinessTimezone(new Date(Date.now() + days * 86_400_000));
}
