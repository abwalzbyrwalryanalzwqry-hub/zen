/**
 * «ما الجديد» (تحليل «المزيد» GAP-04): ملاحظات إصدار للمستخدم بلغته، لا سجل المطوّرين (CHANGELOG.md).
 * كل إصدار مفاتيح نقاطه في `whatsNew.v{major}{minor}{patch}.*` بلغتَي الواجهة (ar وen). نقطة «جديد» تظهر بجانب المدخل حتى
 * يفتح المستخدم الصفحة مرة بعد التحديث (تُحفظ على الجهاز).
 */
import { APP_VERSION } from "@/lib/app-version";

export type Release = { version: string; items: readonly string[] };

export const RELEASES: readonly Release[] = [
  { version: "1.37.0", items: ["consent", "children", "recite"] },
  { version: "1.36.0", items: ["guardian", "age", "privacy"] },
  { version: "1.35.0", items: ["continue", "mushaf", "stories", "cleanup"] },
  { version: "1.34.0", items: ["stability"] },
  { version: "1.33.0", items: ["storage", "deps"] },
  { version: "1.32.0", items: ["accuracy", "longRecite", "quota"] },
  { version: "1.31.0", items: ["widgetLock", "security"] },
  { version: "1.30.0", items: ["consent", "font", "privacy"] },
  { version: "1.29.0", items: ["lockNow", "lockPrivacy", "lockRecovery"] },
  { version: "1.28.0", items: ["lockMethods", "lockGrace", "lockRecovery"] },
  { version: "1.27.0", items: ["mushafSearch", "mushafPages", "mushafRecite"] },
  { version: "1.26.0", items: ["certHonor", "certCeremony", "certIjazah"] },
  { version: "1.25.0", items: ["certQuickEdit", "certBatchFast", "certCenterDelete"] },
  { version: "1.24.0", items: ["certApproval", "certServerCheck", "certNumbering"] },
  { version: "1.23.0", items: ["certPublic", "certMine", "certIdentity"] },
  { version: "1.22.0", items: ["certSafety", "certReissue", "certDates", "certAutosave"] },
  { version: "1.21.1", items: ["edits", "tips"] },
  { version: "1.21.0", items: ["ledger", "receipts", "remote"] },
  { version: "1.20.0", items: ["compare", "drill", "teachers", "weekly", "league", "story"] },
  { version: "1.19.0", items: ["firstDay", "simple", "tips", "challenge"] },
  { version: "1.18.0", items: ["audit", "monitor", "sample"] },
  { version: "1.17.0", items: ["perf", "register", "storage", "certificates"] },
  { version: "1.16.1", items: ["push"] },
  { version: "1.16.0", items: ["offlineAccount", "offlineRecord", "offlineReports", "faster"] },
  { version: "1.15.0", items: ["oneScreen", "export", "identity", "shortcuts", "content"] },
  { version: "1.14.0", items: ["sheets", "directions", "autosave", "swipe", "trash"] },
  { version: "1.13.0", items: ["stories", "storyTools"] },
  { version: "1.12.1", items: ["fixes"] },
  { version: "1.12.0", items: ["polish"] },
  { version: "1.11.1", items: ["languages"] },
  { version: "1.11.0", items: ["achievement", "reports", "exports"] },
  { version: "1.10.1", items: ["allDays"] },
  {
    version: "1.10.0",
    items: ["ayahGrid", "mushafFocus", "history", "students", "progress", "chat"],
  },
  { version: "1.9.0", items: ["fasterRecord", "reasons", "offlineCopy", "share"] },
  {
    version: "1.8.0",
    items: ["more", "settings", "account", "profile", "about", "feedback", "help", "safety"],
  },
  { version: "1.7.0", items: ["dailyRecord", "studentPanel", "offline"] },
];

export const releaseKey = (version: string) => `v${version.replace(/\./g, "")}`;

const SEEN_KEY = "zen-whats-new-seen";

/** أحدث إصدار له ملاحظات ولا يتجاوز الإصدار المثبَّت (ملاحظات الإصدار القادم لا تظهر قبل أوانه). */
export function latestRelease(current: string = APP_VERSION): Release | null {
  return RELEASES.find((r) => compareVersions(r.version, current) <= 0) ?? null;
}

export function visibleReleases(current: string = APP_VERSION): Release[] {
  return RELEASES.filter((r) => compareVersions(r.version, current) <= 0);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function hasUnseenRelease(current: string = APP_VERSION): boolean {
  const latest = latestRelease(current);
  if (!latest) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== latest.version;
  } catch {
    return false;
  }
}

export function markReleaseSeen(current: string = APP_VERSION): void {
  const latest = latestRelease(current);
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_KEY, latest.version);
  } catch {
    /* تخزين غير متاح */
  }
}
