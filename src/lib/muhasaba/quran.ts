/**
 * «علاقتي بالقرآن اليوم» — يُقرأ من السجلات القائمة في التطبيق، فلا يُطلب من
 * الطالب إدخال المعلومة نفسها مرتين، ولا يُنشأ نظام موازٍ.
 *
 *   الحفظ الجديد ← progress (new) · mushaf_records (memorize)
 *   المراجعة     ← progress (revision) · mushaf_records (review/consolidate)
 *                  · review_cards.last_reviewed_at · exam_results · recitation_sessions (review)
 *   التسميع      ← recitation_sessions
 */

import { supabase } from "@/integrations/supabase/client";
import { isoDay } from "./dates";
import type { QuranActivity } from "./logic";

const db = supabase;

export type QuranSources = {
  progress: { created_at: string; memorization_type: string | null }[];
  sessions: { created_at: string; session_date: string | null; kind: string | null }[];
  mushaf: { session_date: string | null; created_at: string; kind: string | null }[];
  cards: { last_reviewed_at: string | null }[];
  exams: { created_at: string }[];
};

const localDay = (ts: string) => isoDay(new Date(ts));

/** يدمج السجلات في خريطة يوم ← نشاط. دالة خالصة ومختبَرة. */
export function mergeQuranActivity(src: QuranSources): Record<string, QuranActivity> {
  const out: Record<string, QuranActivity> = {};
  const mark = (day: string, key: keyof QuranActivity) => {
    const a = (out[day] ??= { memorize: false, review: false, recite: false });
    a[key] = true;
  };
  for (const p of src.progress) {
    mark(localDay(p.created_at), p.memorization_type === "revision" ? "review" : "memorize");
  }
  for (const s of src.sessions) {
    const day = s.session_date ?? localDay(s.created_at);
    mark(day, "recite");
    if (s.kind === "review") mark(day, "review");
  }
  for (const m of src.mushaf) {
    const day = m.session_date ?? localDay(m.created_at);
    mark(day, m.kind === "memorize" ? "memorize" : "review");
  }
  for (const c of src.cards) if (c.last_reviewed_at) mark(localDay(c.last_reviewed_at), "review");
  for (const e of src.exams) mark(localDay(e.created_at), "review");
  return out;
}

/**
 * يجلب نشاط القرآن للمستخدم بين يومين. أي مصدر يفشل يُتجاهل بهدوء؛
 * فالمحاسبة لا تتعطّل لأن جدولاً واحداً لم يستجب.
 */
export async function fetchQuranActivity(
  userId: string,
  from: string,
  to: string,
): Promise<Record<string, QuranActivity>> {
  // حدود زمنية واسعة بيوم من كل جهة لتغطية فروق المناطق الزمنية؛ الدمج يعيد التصنيف محلياً.
  const fromTs = new Date(`${from}T00:00:00`);
  fromTs.setDate(fromTs.getDate() - 1);
  const toTs = new Date(`${to}T23:59:59`);
  toTs.setDate(toTs.getDate() + 1);
  const a = fromTs.toISOString();
  const b = toTs.toISOString();

  const safe = async <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await p;
      return error ? [] : (data ?? []);
    } catch {
      return [];
    }
  };

  const [progress, sessions, mushaf, cards, exams] = await Promise.all([
    safe<QuranSources["progress"][number]>(
      db
        .from("progress")
        .select("created_at, memorization_type")
        .eq("user_id", userId)
        .gte("created_at", a)
        .lte("created_at", b),
    ),
    safe<QuranSources["sessions"][number]>(
      db
        .from("recitation_sessions")
        .select("created_at, session_date, kind")
        .eq("student_id", userId)
        .gte("session_date", from)
        .lte("session_date", to),
    ),
    safe<QuranSources["mushaf"][number]>(
      db
        .from("mushaf_records")
        .select("session_date, created_at, kind")
        .eq("student_id", userId)
        .gte("session_date", from)
        .lte("session_date", to),
    ),
    safe<QuranSources["cards"][number]>(
      db
        .from("review_cards")
        .select("last_reviewed_at")
        .eq("student_id", userId)
        .gte("last_reviewed_at", a)
        .lte("last_reviewed_at", b),
    ),
    safe<QuranSources["exams"][number]>(
      db
        .from("exam_results")
        .select("created_at")
        .eq("student_id", userId)
        .gte("created_at", a)
        .lte("created_at", b),
    ),
  ]);

  const merged = mergeQuranActivity({ progress, sessions, mushaf, cards, exams });
  // نُبقي الأيام داخل المدى المطلوب فقط.
  return Object.fromEntries(Object.entries(merged).filter(([d]) => d >= from && d <= to));
}
