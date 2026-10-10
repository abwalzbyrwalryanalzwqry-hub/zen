import { icons } from "@/components/zen/quran/shell-icons";

/** ثوابت شاشة القارئ (المرحلة 7.5). */

/** مهلة استقرار التمرير قبل حفظ الموضع. */
export const SETTLE_MS = 1200;

export const MORE_ACTIONS: { label: string; icon: string; to: string }[] = [
  { label: "مشاركة", icon: icons.share, to: "/mushaf/share" },
  { label: "العلامات", icon: icons.bookmark, to: "/mushaf/bookmarks" },
  { label: "إعدادات", icon: icons.settings, to: "/mushaf/reader-settings" },
  { label: "المصادر", icon: icons.info, to: "/mushaf/sources" },
];

/** سجل الحفظ والمراجعة لكل صفحة (خاص بزِن، للحسابات المسجّلة). */
export const RECORDS_ACTION = { label: "سجل الحفظ", icon: icons.target, to: "/mushaf/records" };
