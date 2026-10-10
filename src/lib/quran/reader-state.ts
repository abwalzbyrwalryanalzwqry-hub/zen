import { useCallback, useEffect, useState } from "react";

const KEY = "zen.quran.reader.v1";
/** يُطلَق بعد كل حفظ، وبعد استيراد نسخة احتياطية. */
export const READER_STATE_EVENT = "zen:reader-state";

export type ReaderMode = "surah" | "mushaf";

export type ReaderState = {
  surah: number; // 1..114
  juz: number; // 1..30
  bookmarked: boolean;
  mode: ReaderMode;
  page: number; // 1..604 — last opened Mushaf page
  /** آخر آية وقف عندها القارئ في وضع السورة. */
  ayah?: number;
  updatedAt: number; // ms
};

const DEFAULT: ReaderState = {
  surah: 1,
  juz: 1,
  bookmarked: false,
  mode: "surah",
  page: 1,
  updatedAt: Date.now(),
};

export function readReaderState(): ReaderState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ReaderState>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

export function useReaderState() {
  const [state, setState] = useState<ReaderState>(DEFAULT);

  useEffect(() => {
    const sync = () => setState(readReaderState());
    sync();
    window.addEventListener(READER_STATE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(READER_STATE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<ReaderState>) => {
    // نبني الحالة من المخزَّن (مصدر الحقيقة) ونحفظها قبل إطلاق الحدث، فلا
    // يقرأ أي مستمع قيمة قديمة.
    const next = { ...readReaderState(), ...patch, updatedAt: Date.now() };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / privacy errors */
    }
    setState(next);
    window.dispatchEvent(new Event(READER_STATE_EVENT));
  }, []);

  return [state, update] as const;
}

/**
 * صيغة العدد العربية: ١ «دقيقة»، ٢ «دقيقتين»، ٣–١٠ «٣ دقائق»، ١١ فأكثر «١١ دقيقة».
 * (كانت «قبل ٣ دقيقة» و«قبل ٥ يوم»). تُكتب يدوياً لا بـ Intl لأن WebView القديم يختلف فيها.
 */
function countAr(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${toAr(n)} ${few}`;
  return `${toAr(n)} ${many}`;
}

export function formatRelativeArabic(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "قبل لحظات";
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${countAr(min, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${countAr(hr, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "أمس";
  return `قبل ${countAr(day, "يوم", "يومين", "أيام", "يوماً")}`;
}

function toAr(n: number) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
