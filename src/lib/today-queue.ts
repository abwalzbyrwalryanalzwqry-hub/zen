import { supabase } from "@/integrations/supabase/client";
import { SURAHS } from "@/lib/quran-meta";
import { normalizeArabic } from "@/lib/exam/text";

/** طابور اليوم (8.2): يُقرأ من my_today_queue / guardian_today_queue ولا يُحسب في العميل. */
export type QueueKind = "assignment" | "review" | "exam_error" | "wird";

export interface QueueItem {
  kind: QueueKind;
  id: string;
  surah_name?: string;
  surah_number?: number;
  from_ayah?: number;
  to_ayah?: number;
  sub?: string;
  due_date?: string;
  done: boolean;
  minutes: number;
  result_id?: string;
}

export interface TodayQueue {
  day: string;
  total_minutes: number;
  done: number;
  items: QueueItem[];
}

const KIND_LABEL: Record<QueueKind, string> = {
  assignment: "واجب",
  review: "مراجعة",
  exam_error: "موضع خطأ",
  wird: "ورد اليوم",
};

export function itemTitle(i: QueueItem): string {
  if (i.kind === "wird") return "ورد اليوم من المصحف";
  const range = i.from_ayah === i.to_ayah ? `${i.from_ayah}` : `${i.from_ayah}–${i.to_ayah}`;
  return `${KIND_LABEL[i.kind]}: ${i.surah_name ?? ""} ${range}`.trim();
}

/** رقم السورة من البند (اسمها العربي كما في التسميع، أو رقمها من الاختبار). */
export function itemSurah(i: QueueItem): number | null {
  if (i.surah_number) return i.surah_number;
  if (!i.surah_name) return null;
  // اسم السورة قد يكتبه المعلّم بهمزة مختلفة («النبأ» / «النبإ»).
  const key = normalizeArabic(i.surah_name.replace(/^سورة\s+/u, ""));
  return SURAHS.find((s) => normalizeArabic(s.name) === key)?.n ?? null;
}

/** نسبة الإنجاز والوقت المتبقي، للبطاقة. */
export function queueProgress(q: TodayQueue): { done: number; total: number; minutesLeft: number } {
  return {
    done: q.items.filter((i) => i.done).length,
    total: q.items.length,
    minutesLeft: q.items.filter((i) => !i.done).reduce((n, i) => n + i.minutes, 0),
  };
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ساعة و${r} دقيقة` : `${h} ساعة`;
}

export async function fetchTodayQueue(studentId?: string): Promise<TodayQueue> {
  const { data, error } = studentId
    ? await supabase.rpc("guardian_today_queue", { _student: studentId })
    : await supabase.rpc("my_today_queue");
  if (error) throw error;
  return data as unknown as TodayQueue;
}
