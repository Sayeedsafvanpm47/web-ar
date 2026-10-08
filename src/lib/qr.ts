/**
 * QR codes for print. SERVER ONLY.
 *
 * Generated locally, never through a hosted QR service. The URL encoded into
 * a book's QR *is* the credential for that customer's videos — handing it to a
 * third party would put a working link to every book printed into someone
 * else's request logs, permanently and unrevocably.
 *
 * Encoding is pure computation. There is no reason for it to leave the server.
 */
import QRCode from 'qrcode';

/**
 * Error correction level.
 *
 * 'H' recovers ~30% of the code, chosen because these are printed inside
 * hardback books that get handled, thumbed and occasionally spilled on. A
 * reprint is far more expensive than the extra modules.
 */
const ERROR_CORRECTION = 'H' as const;

/** Quiet zone, in modules. Below 4 many scanners simply fail. */
const MARGIN = 4;

export type QrTarget = {
  /** Absolute URL to encode. */
  url: string;
  /** Filename stem, e.g. "book-BP-7K4MXQ" or "page-03". */
  name: string;
};

/**
 * Scalable vector QR, for print.
 *
 * SVG is the right format for a printer: it stays sharp at any size, and the
 * modules land on exact edges instead of being resampled by whatever DPI the
 * press runs at.
 */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: MARGIN,
    color: {
      // Brand ink on paper, not pure black on pure white — these sit on a
      // printed page beside everything else Blackpearl makes.
      dark: '#0A0A0AFF',
      light: '#FAFAF8FF',
    },
  });
}

/**
 * PNG QR as a data URL, for layouts that cannot take vector art.
 *
 * `scale` is pixels per module. 12 gives roughly 500px for a typical code,
 * which prints cleanly at 30mm. Raise it rather than scaling the image up
 * afterwards — resampling a QR is how unreadable codes happen.
 */
export async function qrPngDataUrl(url: string, scale = 12): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: MARGIN,
    scale,
    color: { dark: '#0A0A0AFF', light: '#FAFAF8FF' },
  });
}

/** Absolute URL for a book's entry page — what the cover QR encodes. */
export function bookUrl(origin: string, bookId: string): string {
  return `${origin}/b/${bookId}`;
}

/** Absolute URL for one page's no-camera player — what a page QR encodes. */
export function memoryUrl(
  origin: string,
  bookId: string,
  memoryId: string,
): string {
  return `${origin}/b/${bookId}/m/${memoryId}`;
}
