import { useCallback, useEffect, useState } from "react";
import { useCachedResource, type ResourceState } from "@/hooks/use-cached-resource";
import { quranTextService } from "@/lib/quran/text-service";
import type { SurahText } from "@/lib/quran/text-types";

/** Load the Uthmani text for a Surah with cache + adjacency prefetch. */
export function useSurahText(id: number): ResourceState<SurahText> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state = useCachedResource(
    `${id}:${attempt}`,
    () => quranTextService.getCached(id),
    () => quranTextService.loadSurah(id),
  );
  // Prefetch neighbours for smooth flow.
  useEffect(() => quranTextService.prefetch([id - 1, id + 1]), [id]);
  return { ...state, retry };
}
