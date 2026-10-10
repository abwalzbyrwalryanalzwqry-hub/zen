import { useCallback, useEffect, useState } from "react";
import { useCachedResource, type ResourceState } from "@/hooks/use-cached-resource";
import { clampPage, quranPageService, type MushafPage } from "@/lib/quran/page-service";

export type MushafPageState = ResourceState<MushafPage>;

/** Load a Mushaf page (1..604) with cache + neighbour prefetch (the only prefetch for the reader). */
export function useMushafPage(pageInput: number): MushafPageState & { retry: () => void } {
  const page = clampPage(pageInput);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state = useCachedResource(
    `${page}:${attempt}`,
    () => quranPageService.getCached(page),
    () => quranPageService.loadPage(page),
  );
  useEffect(() => quranPageService.prefetch([page - 1, page + 1, page + 2, page - 2]), [page]);
  return { ...state, retry };
}
