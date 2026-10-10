// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Mock detailed metadata for 3 Surahs.
// ------------------------------------------------------------
// Metadata ONLY (no verses). Used by early UI to validate the
// shape that a future Quran source (API / bundled JSON) will
// return.
// ============================================================

import type { SurahMeta } from "./types";
import { SURAH_META } from "./metadata";

export interface SurahDetail extends SurahMeta {
  /** Was Bismillah revealed at the start of the Surah? */
  hasBismillah: boolean;
  /** Number of Ruku (sections). */
  rukuCount: number;
  /** Number of Sajda ayat within the Surah. */
  sajdaCount: number;
  /** Short Arabic summary of the Surah's themes. */
  summaryAr: string;
  /** Well-known virtues (فضل السورة) — short Arabic lines. */
  virtuesAr: string[];
}

const byId = (id: number) => SURAH_META[id - 1];

export const SURAH_DETAILS: Record<number, SurahDetail> = {
  1: {
    ...byId(1),
    hasBismillah: true,
    rukuCount: 1,
    sajdaCount: 0,
    summaryAr:
      "أم الكتاب وأعظم سورة في القرآن، تجمع بين الثناء على الله وسؤاله الهداية إلى الصراط المستقيم.",
    virtuesAr: [
      "تُقرأ في كل ركعة من الصلاة.",
      "سماها النبي ﷺ السبع المثاني والقرآن العظيم.",
      "رقية من الأمراض بإذن الله.",
    ],
  },
  2: {
    ...byId(2),
    hasBismillah: true,
    rukuCount: 40,
    sajdaCount: 0,
    summaryAr:
      "أطول سور القرآن، تُرسّخ أصول التشريع والعقيدة، وفيها آية الكرسي وخواتيم السورة العظيمة.",
    virtuesAr: [
      "من قرأ الآيتين من آخر البقرة في ليلة كفتاه.",
      "لا تستطيعها البطلة (السحرة).",
      "البيت الذي تُقرأ فيه لا يدخله الشيطان.",
    ],
  },
  3: {
    ...byId(3),
    hasBismillah: true,
    rukuCount: 20,
    sajdaCount: 0,
    summaryAr:
      "تُعنى بتقرير التوحيد ومحاجّة أهل الكتاب، وفيها دروس غزوة أحد ووصايا للأمة بالصبر والثبات.",
    virtuesAr: [
      "قرينة سورة البقرة تأتيان يوم القيامة كأنهما غمامتان تحاجّان عن صاحبهما.",
      "تسميان الزهراوين لنورهما وعظيم بركتهما.",
    ],
  },
};

export const MOCK_SURAH_IDS = [1, 2, 3] as const;
