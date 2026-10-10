// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Public barrel.
// ------------------------------------------------------------
// All Quran-related screens should import from "@/lib/quran".
// ============================================================

export type { RevelationType, NumericRange, SurahMeta, JuzMeta, HizbMeta, AyahRef } from "./types";
export { REVELATION_LABEL_AR } from "./types";

export { SURAH_META } from "./metadata";
export { JUZ_META, HIZB_META } from "./juz-metadata";
export { SURAH_DETAILS, MOCK_SURAH_IDS, type SurahDetail } from "./mock-data";

export { QuranRepository, quranRepository } from "./repository";

export { QuranTextService, quranTextService } from "./text-service";
export type { AyahText, SurahText, QuranIndex } from "./text-types";

export { toArabicDigits, surahDisplayName, formatRangeAr } from "./format";

/* --- Search, bookmarks, history, tafsir, recitation, sharing --- */

export {
  normalizeArabic,
  quranSkeleton,
  tokenizeArabic,
  wordMatchesToken,
  splitWords,
  matchedWordIndices,
  containsAllTokens,
} from "./normalize";

export {
  quranSearchService,
  searchSurahNames,
  parseAyahRef,
  readRecentSearches,
  pushRecentSearch,
  clearRecentSearches,
  type AyahHit,
  type SearchScope,
} from "./search-service";

export {
  BOOKMARK_TAGS,
  listBookmarks,
  isBookmarked,
  addBookmark,
  removeBookmark,
  toggleBookmark,
  updateBookmark,
  clearBookmarks,
  exportBookmarks,
  importBookmarks,
  useBookmarks,
  tagLabel,
  tagChipClass,
  bookmarkId,
  type Bookmark,
  type NewBookmark,
  type BookmarkTag,
} from "./bookmarks";

export {
  recordRead,
  readHistory,
  clearHistory,
  removeHistoryEntry,
  globalAyahIndex,
  computeStreak,
  lastSevenDays,
  useReadingHistory,
  TOTAL_AYAHS,
  type ReadEntry,
  type HistorySummary,
} from "./reading-history";

export {
  TAFSIR_EDITIONS,
  getEdition,
  tafsirService,
  readTafsirEdition,
  useTafsirEdition,
  useSurahTafsir,
  parseTafsir,
  tafsirGroup,
  type TafsirGroup,
  type TafsirEdition,
  type TafsirBlock,
} from "./tafsir-service";

export {
  RECITERS,
  RECITATION_SOURCE_URL,
  getReciter,
  ayahFileName,
  ayahAudioUrl,
  useRecitationPrefs,
  DEFAULT_RECITATION_PREFS,
  type Reciter,
  type RecitationPrefs,
} from "./recitations";

export {
  downloadSurah,
  startDownload,
  cancelDownload,
  cancelAllDownloads,
  useActiveDownload,
  useActiveDownloads,
  setDownloadManagerEvents,
  deleteDownload,
  deleteAllDownloads,
  localAyahSrc,
  isDownloaded,
  getDownload,
  listDownloads,
  useDownloads,
  formatBytesAr,
  offlineSupported,
  type DownloadedSurah,
  type DownloadHandle,
  type ActiveDownload,
} from "./recitation-offline";

export {
  SHARE_THEMES,
  SHARE_SIZES,
  renderAyahCard,
  ensureShareFonts,
  buildShareText,
  shareCardImage,
  shareCardText,
  type ShareTheme,
  type ShareSize,
  type ShareCardInput,
  type ShareOutcome,
} from "./share-card";
