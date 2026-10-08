/**
 * Shown while the book is looked up and its media signed.
 *
 * Deliberately almost empty: a spinner on a near-instant page reads as
 * jitter, and a customer who has just scanned a QR code at a funeral should
 * not be met with a loading animation. A quiet wordmark holds the space.
 */
export default function Loading() {
  return (
    <div className="bg-paper text-ink flex min-h-dvh w-full flex-col items-center justify-center">
      <p className="bp-eyebrow text-grey-4 animate-pulse">Blackpearl</p>
    </div>
  );
}
