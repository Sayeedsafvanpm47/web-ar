/**
 * Customer-facing copy, in one place.
 *
 * Every string a customer can see lives here so the Arabic version cannot
 * drift behind the English one, and so nobody has to grep the components to
 * find out what the product actually says.
 *
 * ARABIC IS MACHINE-DRAFTED AND NOT APPROVED. Every `ar` value is marked
 * TODO-REVIEW in `arabicNeedsReview` below. Do not treat this as shippable
 * Arabic — it needs a native speaker, particularly for tone: this product is
 * used at funerals as often as at weddings, and the English was written
 * carefully for that. Machine Arabic will not have been.
 *
 * Naming rules from CLAUDE.md are enforced here by construction: the product
 * is "Live photo book", the brand is "Blackpearl" (one word), and no string
 * below contains "Living Memories", "AR", "WebAR", "MindAR", "target",
 * "UUID", or any error code.
 */

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Arabic copy has not been reviewed by a native speaker. */
export const arabicNeedsReview = true;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'ar';
}

export function dir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Picks a locale from an explicit choice, then the browser's preference.
 *
 * The choice travels in the URL rather than a cookie: the customer arrives
 * from a printed QR code with no prior session, and a query parameter needs no
 * consent banner, survives sharing the link, and cannot get stuck.
 */
export function resolveLocale(
  explicit: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(explicit)) return explicit;

  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag === 'ar' || tag.startsWith('ar-')) return 'ar';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return DEFAULT_LOCALE;
}

type Dictionary = {
  brand: string;
  productName: string;

  entry: {
    eyebrow: string;
    instruction: string;
    primaryAction: string;
    steps: [string, string, string];
    pageCount: (n: number) => string;
    conditions: string;
    withoutCamera: string;
    downloads: string;
  };

  states: {
    notFound: { heading: string; body: string };
    expired: { heading: string; body: string };
    notReady: { heading: string; body: string };
    empty: { heading: string; body: string };
    unavailable: { heading: string; body: string };
  };

  player: {
    back: string;
    page: (n: number) => string;
    tapForSound: string;
    cantLoad: string;
    retry: string;
  };

  downloads: {
    title: string;
    intro: string;
    page: (n: number) => string;
    action: string;
    preparing: string;
    failed: string;
    back: string;
  };

  support: {
    action: string;
    /** Prefilled WhatsApp text. Carries the short reference, never the id. */
    message: (reference: string) => string;
  };

  /** Label for the other language, shown in that language. */
  switchTo: string;
};

const en: Dictionary = {
  brand: 'Blackpearl',
  productName: 'Live photo book',

  entry: {
    eyebrow: 'Live photo book',
    instruction: 'Hold your phone over a photo in your book and it starts playing.',
    primaryAction: 'Scan to play',
    steps: [
      'Allow camera access when your phone asks.',
      'Hold your phone over a photo in your book.',
      'Keep it steady — the photo starts playing.',
    ],
    pageCount: (n) => (n === 1 ? '1 page in this book' : `${n} pages in this book`),
    conditions: 'Works best in good light, with the whole photo in frame.',
    withoutCamera: 'Watch without the camera',
    downloads: 'Download my videos',
  },

  states: {
    notFound: {
      heading: 'We couldn’t find this book',
      body: 'Check the link, or scan the code again. If it still doesn’t work, message us and we’ll help.',
    },
    expired: {
      heading: 'This book’s hosting has ended',
      body: 'Your videos are safe. Message us to renew and we’ll bring them back.',
    },
    notReady: {
      heading: 'This book isn’t ready yet',
      body: 'We’re still preparing it. Please try again shortly, or message us if you were expecting it today.',
    },
    empty: {
      heading: 'Nothing in this book yet',
      body: 'No videos have been added to this book. Message us and we’ll sort it out.',
    },
    unavailable: {
      heading: 'Something went wrong at our end',
      body: 'This is our problem, not yours, and your videos are safe. Please try again in a few minutes.',
    },
  },

  player: {
    back: 'Back',
    page: (n) => `Page ${n}`,
    tapForSound: 'Tap for sound',
    cantLoad: 'This video can’t load right now',
    retry: 'Try again',
  },

  downloads: {
    title: 'Your videos',
    intro: 'Download any video from your book to keep on your phone.',
    page: (n) => `Page ${n}`,
    action: 'Download',
    preparing: 'Preparing…',
    failed: 'Couldn’t prepare that download. Try again.',
    back: 'Back',
  },

  support: {
    action: 'Message us on WhatsApp',
    message: (reference) =>
      `Hello Blackpearl, I need help with my Live photo book (${reference}).`,
  },

  switchTo: 'العربية',
};

// TODO-REVIEW: every string below is machine-drafted and needs a native
// speaker before this ships. Tone matters more than literal accuracy here.
const ar: Dictionary = {
  brand: 'بلاك بيرل',
  productName: 'ألبوم الصور الحي',

  entry: {
    eyebrow: 'ألبوم الصور الحي',
    instruction: 'وجّه هاتفك نحو صورة في الألبوم وسيبدأ تشغيلها.',
    primaryAction: 'امسح للتشغيل',
    steps: [
      'اسمح باستخدام الكاميرا عندما يطلب هاتفك ذلك.',
      'وجّه هاتفك نحو صورة في الألبوم.',
      'أبقِ الهاتف ثابتًا — ستبدأ الصورة بالتحرك.',
    ],
    pageCount: (n) => (n === 1 ? 'صفحة واحدة في هذا الألبوم' : `${n} صفحات في هذا الألبوم`),
    conditions: 'يعمل بشكل أفضل في إضاءة جيدة مع ظهور الصورة كاملة.',
    withoutCamera: 'المشاهدة بدون الكاميرا',
    downloads: 'تنزيل مقاطعي',
  },

  states: {
    notFound: {
      heading: 'لم نتمكن من العثور على هذا الألبوم',
      body: 'تحقق من الرابط أو امسح الرمز مرة أخرى. إذا استمرت المشكلة، راسلنا وسنساعدك.',
    },
    expired: {
      heading: 'انتهت مدة استضافة هذا الألبوم',
      body: 'مقاطعك بأمان. راسلنا للتجديد وسنعيدها.',
    },
    notReady: {
      heading: 'هذا الألبوم غير جاهز بعد',
      body: 'ما زلنا نجهّزه. يرجى المحاولة بعد قليل، أو راسلنا إذا كنت تتوقعه اليوم.',
    },
    empty: {
      heading: 'لا يوجد شيء في هذا الألبوم بعد',
      body: 'لم تُضف أي مقاطع إلى هذا الألبوم. راسلنا وسنتولى الأمر.',
    },
    unavailable: {
      heading: 'حدث خطأ لدينا',
      body: 'هذه مشكلتنا وليست مشكلتك، ومقاطعك بأمان. يرجى المحاولة بعد بضع دقائق.',
    },
  },

  player: {
    back: 'رجوع',
    page: (n) => `صفحة ${n}`,
    tapForSound: 'اضغط للصوت',
    cantLoad: 'لا يمكن تحميل هذا المقطع الآن',
    retry: 'حاول مرة أخرى',
  },

  downloads: {
    title: 'مقاطعك',
    intro: 'نزّل أي مقطع من ألبومك للاحتفاظ به على هاتفك.',
    page: (n) => `صفحة ${n}`,
    action: 'تنزيل',
    preparing: 'جارٍ التحضير…',
    failed: 'تعذّر تحضير التنزيل. حاول مرة أخرى.',
    back: 'رجوع',
  },

  support: {
    action: 'راسلنا على واتساب',
    message: (reference) =>
      `مرحبًا بلاك بيرل، أحتاج مساعدة بخصوص ألبوم الصور الحي (${reference}).`,
  },

  switchTo: 'English',
};

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** WhatsApp deep link carrying the short reference — never the book id. */
export const SUPPORT_WHATSAPP_NUMBER = '97431123552';

export function supportLink(locale: Locale, reference: string | null): string {
  const text = getDictionary(locale).support.message(reference ?? '—');
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
