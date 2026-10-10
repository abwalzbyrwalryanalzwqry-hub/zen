// ============================================================
// Zen — Quran Module
// Reading history: resume points, daily streak, khatmah progress
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { SURAH_META } from "./metadata";
import type { ReaderMode } from "@/lib/quran/reader-state";
import { recordAyahs } from "@/lib/quran/activity";
import { ayahsOnPages } from "@/lib/quran/page-math";

const KEY = "zen.quran.history.v1";
const EVENT = "zen:quran-history";
const MAX_ENTRIES = 40;
/** أقصى عدد أيام محفوظة في السجل (يكفي سلسلة الأيام التي تُحسب حتى ٤٠٠ يوم). */
const MAX_DAYS = 400;
/** Two visits to the same surah inside this window are one entry. */
const MERGE_WINDOW_MS = 30 * 60 * 1000;

export interface ReadEntry {
  surah: number;
  ayah: number;
  page: number;
  /** Juz (1..30) — shown in the history list. */
  juz: number;
  mode?: ReaderMode;
  /** Last time this position was open. */
  at: number;
}

export interface HistoryState {
  entries: ReadEntry[];
  /** `YYYY-MM-DD` → number of reading sessions recorded that day. */
  days: Record<string, number>;
  /** Furthest position ever reached, as a global ayah ordinal (1..6236). */
  furthest: number;
  /** صفحات المصحف (١..٦٠٤) التي قُرئت فعلاً — مرتّبة بلا تكرار. أساس نسبة الختمة. */
  pages: number[];
  /** آخر مرة احتُسبت فيها جلسة قراءة (بقراءة صفحة فعلاً). */
  sessionAt?: number;
}

const EMPTY: HistoryState = { entries: [], days: {}, furthest: 0, pages: [] };
export const TOTAL_PAGES = 604;

function cleanPages(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const x of v) {
    const n = Math.trunc(Number(x));
    if (n >= 1 && n <= TOTAL_PAGES) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/* ---------- Global ayah ordinals ---------- */

const OFFSETS: number[] = (() => {
  const out: number[] = [0];
  let acc = 0;
  for (const s of SURAH_META) {
    out.push(acc);
    acc += s.ayatCount;
  }
  return out;
})();

export const TOTAL_AYAHS = SURAH_META.reduce((n, s) => n + s.ayatCount, 0);

/** 1-based ordinal of an ayah across the whole Mushaf. */
export function globalAyahIndex(surah: number, ayah: number): number {
  const s = Math.min(114, Math.max(1, surah));
  const meta = SURAH_META[s - 1];
  const a = Math.min(meta.ayatCount, Math.max(1, ayah));
  return OFFSETS[s] + a;
}

/* ---------- Storage ---------- */

function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function read(): HistoryState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<HistoryState>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES) : [],
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      furthest: typeof parsed.furthest === "number" ? parsed.furthest : 0,
      pages: cleanPages(parsed.pages),
      sessionAt: typeof parsed.sessionAt === "number" ? parsed.sessionAt : undefined,
    };
  } catch {
    return EMPTY;
  }
}

function write(state: HistoryState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function readHistory(): HistoryState {
  return read();
}

/** Records (or refreshes) a reading position. */
export function recordRead(entry: Omit<ReadEntry, "at">): void {
  const now = Date.now();
  const state = read();
  const rest = state.entries.filter(
    (e) => !(e.surah === entry.surah && now - e.at < MERGE_WINDOW_MS),
  );
  const entries = [{ ...entry, at: now }, ...rest].slice(0, MAX_ENTRIES);

  // لا يُحتسب يوم القراءة هنا: فتح المصحف وحده ليس قراءة.
  // الجلسة تُحتسب في markPagesRead عند قراءة صفحة فعلاً.
  const nextGlobal = globalAyahIndex(entry.surah, entry.ayah);
  const furthest = Math.max(state.furthest, nextGlobal);
  write({ ...state, entries, furthest });
  // السجل اليومي للآيات لا يُحسب هنا: تغيّر الموضع قد يكون تنقّلاً أو تقليباً سريعاً.
  // الآيات تُحتسب في markPagesRead من الصفحات التي ثبتت قراءتها بالمكوث.
}

/**
 * يسجّل صفحات قُرئت فعلاً (تجاوزها القارئ للأمام في وضع السورة، أو قلبها إلى
 * التالية في وضع المصحف). فتح صفحة وحده لا يُعدّ قراءة لها.
 */
export function markPagesRead(pages: number[], now: number = Date.now()): void {
  const valid = cleanPages(pages);
  if (valid.length === 0) return;
  const state = read();
  const merged = cleanPages([...state.pages, ...valid]);

  // جلسة قراءة: أول صفحة مقروءة، ثم جلسة جديدة بعد انقطاع أطول من نافذة الدمج
  // أو في يوم جديد. إعادة قراءة صفحات سابقة (ختمة ثانية) تُحتسب أيضاً.
  const days = { ...state.days };
  const key = dayKey(now);
  const last = state.sessionAt;
  const newSession = last === undefined || dayKey(last) !== key || now - last >= MERGE_WINDOW_MS;
  if (newSession) days[key] = (days[key] ?? 0) + 1;
  // لا تنمو خريطة الأيام بلا حدّ: يكفي ما يغطي سلسلة الأيام وحسابها (٤٠٠ يوم).
  const dayKeys = Object.keys(days).sort();
  for (const old of dayKeys.slice(0, Math.max(0, dayKeys.length - MAX_DAYS))) delete days[old];

  write({ ...state, pages: merged, days, sessionAt: now });
  // السجل اليومي الموحّد: آيات الصفحات المقروءة فعلاً (لا فرق المواضع).
  recordAyahs(ayahsOnPages(valid), new Date(now));
}

export function clearHistory(): void {
  write(EMPTY);
}

export function removeHistoryEntry(at: number): void {
  const state = read();
  write({ ...state, entries: state.entries.filter((e) => e.at !== at) });
}

/* ---------- Derived stats ---------- */

/** Consecutive days ending today (or yesterday) with at least one session. */
export function computeStreak(days: Record<string, number>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d.getTime());
    if ((days[key] ?? 0) > 0) {
      streak++;
    } else if (i === 0) {
      // Today may not have started yet — keep looking at yesterday.
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/** The last 7 days, oldest first, for the mini chart. */
export function lastSevenDays(
  days: Record<string, number>,
): { key: string; label: string; count: number }[] {
  const labels = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const out: { key: string; label: string; count: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d.getTime());
    out.push({ key, label: labels[d.getDay()], count: days[key] ?? 0 });
  }
  return out;
}

export interface HistorySummary {
  entries: ReadEntry[];
  last: ReadEntry | undefined;
  streak: number;
  week: { key: string; label: string; count: number }[];
  sessionsToday: number;
  totalSessions: number;
  /** 0..1 — نسبة صفحات المصحف المقروءة فعلاً. */
  progress: number;
  furthest: number;
  /** عدد الصفحات المقروءة (٠..٦٠٤). */
  pagesRead: number;
}

function summarize(state: HistoryState): HistorySummary {
  const week = lastSevenDays(state.days);
  const totals = Object.values(state.days).reduce((n, v) => n + v, 0);
  return {
    entries: state.entries,
    last: state.entries[0],
    streak: computeStreak(state.days),
    week,
    sessionsToday: week[week.length - 1]?.count ?? 0,
    totalSessions: totals,
    progress: Math.min(1, state.pages.length / TOTAL_PAGES),
    furthest: state.furthest,
    pagesRead: state.pages.length,
  };
}

/** Reactive reading history, synced across screens and tabs. */
export function useReadingHistory(): HistorySummary & {
  clear: () => void;
  remove: (at: number) => void;
} {
  const [state, setState] = useState<HistoryState>(EMPTY);

  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const clear = useCallback(() => clearHistory(), []);
  const remove = useCallback((at: number) => removeHistoryEntry(at), []);

  return { ...summarize(state), clear, remove };
}
