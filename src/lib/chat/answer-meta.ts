/**
 * Javob shaffofligi — /api/chat oqimining oxirida keladigan "meta" hodisasi va
 * assistant xabarida saqlanadigan ma'lumot. Faqat server haqiqatda bilgan narsa:
 * qaysi model javob bergani va shu javob uchun oylik limitga yozilgan token soni.
 */
export interface AnswerMeta {
  /** Foydalanuvchi tanlagan model id (Auto bo'lsa — Auto rejalagan model). */
  requested: string;
  /** Javobni bergan model id (katalog/OmniRoute id). */
  served: string;
  /** Upstream provayder qaytargan model nomi (bo'lsa) — masalan "claude-sonnet-4-5-20250929". */
  upstream?: string;
  /** So'ralgan model javob bermadi: boshqa model/zaxira shlyuz javob berdi. */
  fallback: boolean;
  /** Javobni tekin zaxira shlyuz berdi (asosiy provayderlar ishlamadi). */
  rescue?: boolean;
  /** Tanlov Auto rejimida qilingan. */
  auto?: boolean;
  /** Javob semantik keshdan qaytdi (model chaqirilmadi). */
  cached?: boolean;
  /** Server shu javob uchun hisoblagan token soni (taxmin: ~4 belgi = 1 token). */
  tokens?: number;
  /** Shu javob oylik token limitining necha foizi (faqat hisobga yozilgan bo'lsa). */
  monthPct?: number;
  /** Token oylik hisobga haqiqatan yozildi (kirgan foydalanuvchi). */
  billed?: boolean;
}

/** 1234 → "1.2k", 950 → "950". */
export function compactTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}
