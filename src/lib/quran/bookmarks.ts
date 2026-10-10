// ============================================================
// Zen — Quran Module
// Ayah bookmarks (local, offline, cross-component reactive)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { stripBasmala } from "./basmala";

const KEY = "zen.quran.bookmarks.v1";
const EVENT = "zen:quran-bookmarks";

export type BookmarkTag = "tadabbur" | "hifz" | "dua" | "amal" | "review";

export interface Bookmark {
  /** `${surah}:${ayah}` — one bookmark per ayah. */
  id: string;
  surah: number;
  ayah: number;
  page: number;
  juz: number;
  /** Snapshot of the ayah text, so the list renders without loading a surah. */
  text: string;
  note?: string;
  tag: BookmarkTag;
  createdAt: number;
}

export const BOOKMARK_TAGS: {
  key: BookmarkTag;
  label: string;
  /** Tailwind classes for the chip. */
  chip: string;
  dot: string;
}[] = [
  {
    key: "tadabbur",
    label: "تدبّر",
    chip: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  { key: "hifz", label: "حفظ", chip: "border-gold/40 bg-gold/10 text-gold", dot: "bg-gold" },
  {
    key: "dua",
    label: "دعاء",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  {
    key: "amal",
    label: "عمل",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    key: "review",
    label: "مراجعة",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
];

export function tagLabel(tag: BookmarkTag): string {
  return BOOKMARK_TAGS.find((t) => t.key === tag)?.label ?? "تدبّر";
}

export function tagChipClass(tag: BookmarkTag): string {
  return BOOKMARK_TAGS.find((t) => t.key === tag)?.chip ?? BOOKMARK_TAGS[0].chip;
}

export function bookmarkId(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

/** علامات قديمة حُفظت قبل فصل البسملة: نُزيلها من نص الآية الأولى. */
function cleanSnapshot(b: Bookmark): Bookmark {
  const text = stripBasmala(b.surah, 1, b.text);
  return text === b.text ? b : { ...b, text };
}

function read(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (b): b is Bookmark =>
          !!b &&
          typeof b === "object" &&
          typeof (b as Bookmark).surah === "number" &&
          typeof (b as Bookmark).ayah === "number",
      )
      .map((b) => (b.ayah === 1 && typeof b.text === "string" ? cleanSnapshot(b) : b));
  } catch {
    return [];
  }
}

function write(list: Bookmark[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function listBookmarks(): Bookmark[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function isBookmarked(surah: number, ayah: number): boolean {
  const id = bookmarkId(surah, ayah);
  return read().some((b) => b.id === id);
}

export interface NewBookmark {
  surah: number;
  ayah: number;
  page: number;
  juz: number;
  text: string;
  note?: string;
  tag?: BookmarkTag;
}

export function addBookmark(input: NewBookmark): Bookmark {
  const id = bookmarkId(input.surah, input.ayah);
  const list = read().filter((b) => b.id !== id);
  const entry: Bookmark = {
    id,
    surah: input.surah,
    ayah: input.ayah,
    page: input.page,
    juz: input.juz,
    text: input.text,
    note: input.note?.trim() || undefined,
    tag: input.tag ?? "tadabbur",
    createdAt: Date.now(),
  };
  write([entry, ...list]);
  return entry;
}

export function removeBookmark(surah: number, ayah: number): void {
  const id = bookmarkId(surah, ayah);
  write(read().filter((b) => b.id !== id));
}

/** Adds when missing, removes when present. Returns the new state. */
export function toggleBookmark(input: NewBookmark): boolean {
  if (isBookmarked(input.surah, input.ayah)) {
    removeBookmark(input.surah, input.ayah);
    return false;
  }
  addBookmark(input);
  return true;
}

export function updateBookmark(
  surah: number,
  ayah: number,
  patch: Partial<Pick<Bookmark, "note" | "tag">>,
): void {
  const id = bookmarkId(surah, ayah);
  write(
    read().map((b) =>
      b.id === id
        ? {
            ...b,
            ...patch,
            note: patch.note !== undefined ? patch.note.trim() || undefined : b.note,
          }
        : b,
    ),
  );
}

export function clearBookmarks(): void {
  write([]);
}

/** Portable backup payload. */
export function exportBookmarks(): string {
  return JSON.stringify(
    { app: "zen", kind: "quran-bookmarks", version: 1, items: listBookmarks() },
    null,
    2,
  );
}

/** Merges a previously exported payload. Returns how many were added. */
export function importBookmarks(json: string): number {
  const parsed = JSON.parse(json) as { items?: unknown };
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const existing = read();
  const known = new Set(existing.map((b) => b.id));
  let added = 0;
  const merged = [...existing];
  for (const raw of items) {
    const b = raw as Bookmark;
    if (!b || typeof b.surah !== "number" || typeof b.ayah !== "number") continue;
    const id = bookmarkId(b.surah, b.ayah);
    if (known.has(id)) continue;
    merged.push({
      id,
      surah: b.surah,
      ayah: b.ayah,
      page: typeof b.page === "number" ? b.page : 1,
      juz: typeof b.juz === "number" ? b.juz : 1,
      text: typeof b.text === "string" ? stripBasmala(b.surah, b.ayah, b.text) : "",
      note: typeof b.note === "string" ? b.note : undefined,
      tag: BOOKMARK_TAGS.some((t) => t.key === b.tag) ? b.tag : "tadabbur",
      createdAt: typeof b.createdAt === "number" ? b.createdAt : Date.now(),
    });
    known.add(id);
    added++;
  }
  write(merged);
  return added;
}

/** Reactive bookmarks list, synced across screens and tabs. */
export function useBookmarks() {
  const [items, setItems] = useState<Bookmark[]>([]);

  useEffect(() => {
    const sync = () => setItems(listBookmarks());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = useCallback(
    (surah: number, ayah: number) => items.some((b) => b.id === bookmarkId(surah, ayah)),
    [items],
  );

  return {
    items,
    has,
    add: addBookmark,
    remove: removeBookmark,
    toggle: toggleBookmark,
    update: updateBookmark,
    clear: clearBookmarks,
  } as const;
}
