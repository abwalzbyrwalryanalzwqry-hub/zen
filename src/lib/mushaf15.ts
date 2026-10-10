/**
 * مصحف المدينة (١٥ سطراً، طبعة V1) نصّاً لا صوراً — إعادة تصدير للمصدر الوحيد
 * `@/lib/quran/mushaf15` (كانت هنا نسخة مكررة بمحمّل وحساب جزء مختلفين).
 */
export {
  MUSHAF_TOTAL_PAGES,
  MUSHAF15_BASE,
  MUSHAF15_FONT,
  QPC_BASMALA,
  clampPage,
  getCachedPage,
  hizbOfPage,
  isAyahLine,
  isOpeningPage,
  isValidPage,
  juzOfPage,
  loadMushafPage,
  mushafPageUrl,
  prefetchPages,
  surahsOnPage,
  type Mushaf15Line,
  type Mushaf15Page,
  type Mushaf15Token,
} from "@/lib/quran/mushaf15";
