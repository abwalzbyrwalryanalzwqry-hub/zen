/**
 * نصوص طلبات المساعد وبيانات تقرير PDF لصفحة «سجل الحفظ» (`_authed.quran.tsx`).
 * دوال صافية فُصلت من الصفحة (M5) دون تغيير في السلوك.
 */
import type { ProgressRow } from "@/lib/zen-api";
import { weekLabel } from "@/lib/report";
import { localDayOf } from "@/lib/local-day";

const ayahCount = (r: ProgressRow) => Math.max(0, r.to_ayah - r.from_ayah + 1);

// تدقيق 1.2: حُذفت progressStats (كانت تحسب الإجماليات من آخر 200 سجل في الواجهة). الإجماليات الآن
// من الخادم: getProgressStats ← progress_stats (كل السجل، بصلاحيات المستدعي وتوقيته).

/*
 * تدقيق 1.7 (القاعدة 29): المطالبات للنموذج أرقام وأسماء سور ونطاقات فقط. ملاحظات الطالب وملاحظة المعلّم
 * نصّ حرّ قد يحوي أسماء أو تفاصيل شخصية، فلا تُرسل؛ التقييم الرقمي يكفي للسياق.
 */
export function entryFeedbackPrompt(r: ProgressRow): string {
  const count = ayahCount(r);
  return [
    `آخر تسجيل حفظ للطالب:`,
    `- السورة: ${r.surah_name}`,
    `- الآيات: ${r.from_ayah} إلى ${r.to_ayah} (${count} آية)`,
    `- النوع: ${r.memorization_type === "new" ? "حفظ جديد" : "مراجعة"}`,
    r.rating != null ? `- تقييم المعلم: ${r.rating}/5` : "",
    r.feedback ? "- للمعلّم ملاحظة مكتوبة على هذا التسجيل." : "",
    "",
    "أعطني تقييماً شخصياً لهذا التسجيل مع نصائح عملية وخطة للغد.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function logSummary(rows: ProgressRow[]): string {
  return rows
    .slice(0, 20)
    .map(
      (r) =>
        `- ${r.surah_name} [${r.from_ayah}-${r.to_ayah}] (${r.memorization_type === "new" ? "جديد" : "مراجعة"})`,
    )
    .join("\n");
}

export function weeklyPlanPrompt(rows: ProgressRow[]): string {
  const latest = rows[0];
  const recent = rows
    .slice(0, 15)
    .map(
      (r) =>
        `- ${r.surah_name} [${r.from_ayah}-${r.to_ayah}] ${r.memorization_type === "new" ? "جديد" : "مراجعة"} (${localDayOf(r.created_at)})`,
    )
    .join("\n");
  return [
    `آخر سجل حفظ: سورة ${latest.surah_name} الآيات ${latest.from_ayah}–${latest.to_ayah} (${latest.memorization_type === "new" ? "حفظ جديد" : "مراجعة"}).`,
    "",
    `السجل الأخير:\n${recent}`,
    "",
    "اصنع لي خطة مراجعة أسبوعية مخصّصة من ٧ أيام (السبت إلى الجمعة).",
    "لكل يوم: الورد الجديد، ورد المراجعة، ومدة تقريبية. اجعلها واقعية ومبنية على سجلي أعلاه، ثم أضف سطرين نصائح.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReportData(rows: ProgressRow[]) {
  const daily = rows.slice(0, 60).map((r) => ({
    date: localDayOf(r.created_at),
    title: `سورة ${r.surah_name}`,
    detail: `الآيات ${r.from_ayah}–${r.to_ayah}، ${r.memorization_type === "new" ? "حفظ جديد" : "مراجعة"}`,
    note: r.notes,
    rating: r.rating,
  }));

  const buckets: Record<string, ProgressRow[]> = {};
  rows.forEach((r) => {
    const k = weekLabel(r.created_at);
    (buckets[k] ??= []).push(r);
  });
  const weekly = Object.entries(buckets).map(([week, list]) => ({
    week,
    count: list.length,
    detail: `${list.reduce((s, r) => s + ayahCount(r), 0)} آية، ${
      list.filter((r) => r.memorization_type === "new").length
    } حفظ جديد، ${list.filter((r) => r.memorization_type === "revision").length} مراجعة`,
  }));
  return { daily, weekly };
}
