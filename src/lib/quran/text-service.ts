// ============================================================
// Zen — Quran Data Layer
// Phase 8.6 — Text service (async loader + in-memory cache)
// ------------------------------------------------------------
// Loads authentic Uthmani script per-Surah from the bundled
// local dataset at `/data/quran/uthmani/{id}.json`.
// Source: Tanzil.net (via api.alquran.cloud) — edition
// "quran-uthmani". Text is NOT hardcoded into any component.
// ============================================================

import { stripBasmala } from "./basmala";
import type { SurahText } from "./text-types";

const BASE = "/data/quran/uthmani";
const cache = new Map<number, SurahText>();
const inflight = new Map<number, Promise<SurahText>>();

export class QuranTextService {
  /** Load a Surah's full Uthmani text (cached). */
  async loadSurah(id: number): Promise<SurahText> {
    if (id < 1 || id > 114) throw new Error(`Invalid surah id: ${id}`);
    const cached = cache.get(id);
    if (cached) return cached;
    const pending = inflight.get(id);
    if (pending) return pending;

    const p = (async () => {
      try {
        const res = await fetch(`${BASE}/${id}.json`, { cache: "force-cache" });
        if (!res.ok) throw new Error(`تعذّر تحميل السورة من الملفات المحلية (${res.status})`);
        const data = (await res.json()) as SurahText;
        if (!data || !Array.isArray(data.ayahs) || data.ayahs.length === 0) {
          throw new Error("ملف السورة المحلي غير مكتمل — أعد المحاولة");
        }
        // البسملة تُعرض رأساً مستقلاً؛ نفصلها هنا مرة واحدة لتصل الآية الأولى
        // نظيفة إلى القارئ والبحث والتفسير والمشاركة والعلامات.
        data.ayahs = data.ayahs.map((a) =>
          a.n === 1 ? { ...a, t: stripBasmala(id, a.n, a.t) } : a,
        );
        cache.set(id, data);
        return data;
      } finally {
        inflight.delete(id);
      }
    })();

    inflight.set(id, p);
    return p;
  }

  /** Synchronous cache read — returns undefined if not yet loaded. */
  getCached(id: number): SurahText | undefined {
    return cache.get(id);
  }

  /** Preload adjacent surahs for smoother navigation. */
  prefetch(ids: number[]): void {
    for (const id of ids) {
      if (id >= 1 && id <= 114 && !cache.has(id) && !inflight.has(id)) {
        void this.loadSurah(id).catch(() => {
          /* silent */
        });
      }
    }
  }
}

export const quranTextService = new QuranTextService();
