// ============================================================
// Zen — Quran Module
// Tafsir: bundled Arabic commentaries, fully offline
// ------------------------------------------------------------
// Data lives at `/data/quran/tafsir/{edition}/{surah}.json` in the
// shape `{ s: surahId, e: edition, a: { "1": "…", "2": "…" } }`.
// Prepared from the open Tafsir API dataset:
//   https://github.com/spa5k/tafsir_api
// which in turn packages the QUL / quran.com resources:
//   https://qul.tarteel.ai/resources/tafsir
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useCachedResource, type ResourceState } from "@/hooks/use-cached-resource";

export interface TafsirEdition {
  slug: string;
  nameAr: string;
  authorAr: string;
  descAr: string;
  /** Rough length hint so the reader knows what to expect. */
  lengthAr: string;
  sourceUrl: string;
}

export const TAFSIR_EDITIONS: TafsirEdition[] = [
  {
    slug: "ar-tafsir-muyassar",
    nameAr: "التفسير الميسّر",
    authorAr: "مجمع الملك فهد",
    descAr: "تفسير مختصر بعبارة سهلة، مع مقاصد السورة وسبب التسمية.",
    lengthAr: "موجز",
    sourceUrl: "https://qul.tarteel.ai/resources/tafsir/38",
  },
  {
    slug: "ar-tafsir-al-mukhtasar",
    nameAr: "المختصر في التفسير",
    authorAr: "مركز تفسير للدراسات القرآنية",
    descAr: "معنى الآية في سطور قليلة — مناسب للقراءة اليومية.",
    lengthAr: "مختصر جدًا",
    sourceUrl: "https://qul.tarteel.ai/resources/tafsir/251",
  },
];

export function getEdition(slug: string): TafsirEdition {
  return TAFSIR_EDITIONS.find((e) => e.slug === slug) ?? TAFSIR_EDITIONS[0];
}

interface TafsirFile {
  s: number;
  e: string;
  a: Record<string, string>;
}

const BASE = "/data/quran/tafsir";
const cache = new Map<string, Record<string, string>>();
const inflight = new Map<string, Promise<Record<string, string>>>();

function cacheKey(edition: string, surah: number) {
  return `${edition}:${surah}`;
}

export class TafsirService {
  /** Loads one surah of one edition (cached in memory). */
  async load(edition: string, surah: number): Promise<Record<string, string>> {
    if (surah < 1 || surah > 114) throw new Error(`رقم سورة غير صحيح: ${surah}`);
    const key = cacheKey(edition, surah);
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;

    const p = (async () => {
      try {
        const res = await fetch(`${BASE}/${edition}/${surah}.json`, { cache: "force-cache" });
        if (!res.ok) throw new Error(`تعذّر تحميل التفسير من الملفات المحلية (${res.status})`);
        const data = (await res.json()) as TafsirFile;
        if (!data || typeof data.a !== "object") {
          throw new Error("ملف التفسير المحلي غير مكتمل — أعد المحاولة");
        }
        cache.set(key, data.a);
        return data.a;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, p);
    return p;
  }

  getCached(edition: string, surah: number): Record<string, string> | undefined {
    return cache.get(cacheKey(edition, surah));
  }
}

export const tafsirService = new TafsirService();

/* ---------- الآيات المجمّعة ---------- */

/**
 * التفسير الميسّر يفسّر أحياناً آيات متتالية بنص واحد، فيتكرر النص نفسه لكل
 * آية منها. هنا تُجمع هذه الآيات: «تفسير الآيات ٤٥–٤٦» بدل تكرار النص.
 */
export interface TafsirGroup {
  from: number;
  to: number;
  text: string;
}

export function tafsirGroup(data: Record<string, string>, ayah: number): TafsirGroup | null {
  const norm = (n: number) => data[String(n)]?.trim() ?? "";
  const text = norm(ayah);
  if (!text) return null;
  let from = ayah;
  let to = ayah;
  while (from > 1 && norm(from - 1) === text) from -= 1;
  while (norm(to + 1) === text) to += 1;
  return { from, to, text: data[String(ayah)] };
}

/* ---------- Selected edition (persisted) ---------- */

const KEY = "zen.quran.tafsir.edition.v1";
const EVENT = "zen:tafsir-edition";

export function readTafsirEdition(): string {
  if (typeof window === "undefined") return TAFSIR_EDITIONS[0].slug;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw && TAFSIR_EDITIONS.some((e) => e.slug === raw) ? raw : TAFSIR_EDITIONS[0].slug;
  } catch {
    return TAFSIR_EDITIONS[0].slug;
  }
}

export function useTafsirEdition() {
  const [slug, setSlug] = useState<string>(TAFSIR_EDITIONS[0].slug);

  useEffect(() => {
    const sync = () => setSlug(readTafsirEdition());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((next: string) => {
    try {
      window.localStorage.setItem(KEY, next);
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* ignore */
    }
    setSlug(next);
  }, []);

  return { slug, edition: getEdition(slug), select } as const;
}

/* ---------- Hook: tafsir for one surah ---------- */

type TafsirState = ResourceState<Record<string, string>>;

export function useSurahTafsir(
  edition: string,
  surah: number,
): TafsirState & { retry: () => void } {
  const [tick, setTick] = useState(0);
  const state = useCachedResource(
    `${edition}:${surah}:${tick}`,
    () => tafsirService.getCached(edition, surah),
    () => tafsirService.load(edition, surah),
  );
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, retry };
}

/**
 * Splits a tafsir entry into paragraphs and flags headings, so the
 * Miyassar's "تسمية السورة / من مقاصد السورة / [التفسير]" structure
 * renders as designed sections instead of one wall of text.
 */
export interface TafsirBlock {
  kind: "heading" | "bullet" | "text";
  text: string;
}

const HEADINGS = ["تسمية السورة", "من مقاصد السورة", "مقاصد السورة"];

export function parseTafsir(raw: string): TafsirBlock[] {
  const blocks: TafsirBlock[] = [];
  for (const part of raw.split(/\n+/)) {
    const line = part.trim();
    if (!line) continue;
    if (line === "[التفسير]") {
      blocks.push({ kind: "heading", text: "التفسير" });
      continue;
    }
    if (HEADINGS.includes(line.replace(/[:：]$/, ""))) {
      blocks.push({ kind: "heading", text: line.replace(/[:：]$/, "") });
      continue;
    }
    if (line.startsWith("•") || line.startsWith("-")) {
      blocks.push({ kind: "bullet", text: line.replace(/^[•-]\s*/, "") });
      continue;
    }
    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}
