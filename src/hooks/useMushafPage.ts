import { useEffect, useMemo } from "react";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { getCachedPage, loadMushafPage, prefetchPages, type Mushaf15Page } from "@/lib/mushaf15";
import { friendlyLoadError } from "@/lib/quran/reader-labels";

export type MushafPageState =
  | { status: "loading" }
  | { status: "ready"; data: Mushaf15Page }
  | { status: "error"; error: string };

/**
 * تحميل صفحة (من الملفات المضمَّنة) مع تسخين الصفحات المجاورة — للسجل ومنتقي المدى.
 * المحمّل وذاكرته مشتركان مع القارئ (`@/lib/quran/mushaf15`)، والخطأ رسالة مفهومة للمستخدم.
 */
export function useMushafPage(page: number, reloadKey = 0): MushafPageState {
  const r = useCachedResource(
    `${page}:${reloadKey}`,
    () => getCachedPage(page),
    () => loadMushafPage(page),
  );
  useEffect(() => prefetchPages([page + 1, page - 1, page + 2]), [page]);
  return useMemo<MushafPageState>(
    () =>
      r.status === "ready"
        ? { status: "ready", data: r.data }
        : r.status === "error"
          ? { status: "error", error: friendlyLoadError(r.error) }
          : { status: "loading" },
    [r],
  );
}
