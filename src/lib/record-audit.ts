/**
 * دقة الإدخال (1.18.0، المرحلة 2؛ supabase/migrations/20261208100000_daily_record_audit.sql، docs/DAILY_RECORD.md):
 * سجل تعديلات ما بعد الإغلاق، ومراقب الأنماط غير المعتادة، وجودة الإدخال للمركز، وعيّنة التدقيق الأسبوعية.
 * القراءة كلها عبر دوال الخادم التي تتحقق من الصلاحية؛ لا قراءة مباشرة للجداول.
 */
import { rpc } from "@/integrations/supabase/rpc";
import { t } from "@/lib/i18n";
import type { AttendanceStatus, ErrorType, Segment } from "@/lib/daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

export type AuditWork = {
  segments: Segment[];
  score?: number | null;
  error_type?: ErrorType | null;
  notes?: string | null;
};
/** حالة الطالب في اليوم كما يلتقطها الخادم (الحقول الفارغة محذوفة). */
export type AuditSnapshot = {
  status?: AttendanceStatus;
  reason?: string;
  note?: string;
  evaluation?: {
    overall?: number | null;
    tajweed?: number | null;
    pronunciation?: number | null;
    behavior?: number | null;
  };
  memorize?: AuditWork;
  review?: AuditWork;
};
export type AuditAction = "edit" | "reopen" | "recomplete";
export type AuditRow = {
  id: number;
  at: string;
  halaqa_id: string;
  record_date: string;
  action: AuditAction;
  student_id: string | null;
  student_name: string | null;
  actor_id: string | null;
  actor_name: string | null;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
};

export type AnomalyCode =
  | "pages_spike"
  | "perfect_with_mistakes"
  | "perfect_attendance"
  | "late_close"
  | "no_recitation"
  | "edits_after_close";
export type Anomaly = {
  code: AnomalyCode;
  student_id?: string;
  student_name?: string | null;
  date?: string;
  detail: Record<string, unknown>;
};
export type AnomalyReport = {
  halaqa_id: string;
  days: number;
  from: string;
  to: string;
  records: number;
  items: Anomaly[];
};

export type HalaqaQuality = {
  halaqa_id: string;
  name: string;
  teacher_name: string | null;
  records: number;
  edits_after_close: number;
  late_closes: number;
  warnings: number;
};

export type SampleItem = {
  record_id: string;
  date: string;
  student_id: string;
  student_name: string | null;
  entry: AuditSnapshot;
  review: { ok: boolean; note: string | null; at: string; reviewer_name: string | null } | null;
};
export type AuditSample = { halaqa_id: string; week: string; items: SampleItem[] };

/** شدّة التنبيه: «تحقق» لما يُرجَّح خطؤه، و«للعلم» لما قد يكون صحيحاً تماماً. */
export const ANOMALY_SEVERITY: Record<AnomalyCode, "check" | "info"> = {
  pages_spike: "check",
  perfect_with_mistakes: "check",
  late_close: "check",
  no_recitation: "check",
  edits_after_close: "info",
  perfect_attendance: "info",
};

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

/** `halaqa` = null مع `student`: ما يخص الطالب في كل حلقة يقرؤها المستخدم (صفحة الطالب). */
export const fetchAuditList = (halaqa: string | null, student?: string | null, limit = 50) =>
  call<AuditRow[]>(
    rpc("daily_record_audit_list", {
      _halaqa: halaqa ?? undefined,
      _student: student ?? undefined,
      _limit: limit,
    }),
  );

export const fetchAnomalies = (halaqa: string, days = 30) =>
  call<AnomalyReport>(rpc("daily_record_anomalies", { _halaqa: halaqa, _days: days }));

export const fetchCenterQuality = (center: string, days = 30) =>
  call<{ center_id: string; days: number; halaqat: HalaqaQuality[] }>(
    rpc("center_record_quality", { _center: center, _days: days }),
  );

export const fetchAuditSample = (halaqa: string) =>
  call<AuditSample>(rpc("audit_sample", { _halaqa: halaqa }));

export const reviewAuditSample = (
  record: string,
  student: string,
  ok: boolean,
  note: string | null,
) =>
  call<{ ok: boolean }>(
    rpc("review_audit_sample", {
      _record: record,
      _student: student,
      _ok: ok,
      _note: note ?? undefined,
    }),
  );

/** ما تغيّر بين لقطتين، بترتيب العرض. */
export type ChangeField = "status" | "reason" | "memorize" | "review" | "evaluation" | "note";
const FIELDS: readonly ChangeField[] = [
  "status",
  "reason",
  "memorize",
  "review",
  "evaluation",
  "note",
];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function changedFields(
  before: AuditSnapshot | null,
  after: AuditSnapshot | null,
): ChangeField[] {
  return FIELDS.filter((f) => !same(before?.[f], after?.[f]));
}

/** بنود المراقب التي تخص طالباً بعينه (لفحص الشهادة). */
export function anomaliesFor(report: AnomalyReport | null | undefined, student: string): Anomaly[] {
  return (report?.items ?? []).filter((i) => i.student_id === student);
}

/** ترتيب العرض: ما يحتاج تحققاً أولاً، ثم الأحدث. */
export function sortAnomalies(items: readonly Anomaly[]): Anomaly[] {
  const rank = (a: Anomaly) => (ANOMALY_SEVERITY[a.code] === "check" ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? ""));
}

/** نص التنبيه بلغة الواجهة (تبويب التدقيق وفحص الشهادة). */
export function anomalyText(a: Anomaly): string {
  const d = a.detail as Record<string, number | string | null | undefined>;
  return t(`dailyRecord.audit.codes.${a.code}`, {
    pages: d.pages ?? 0,
    count: d.count ?? 0,
    days: d.days ?? d.present_days ?? 0,
    error: d.error_type ? t(`dailyRecord.errorTypes.${String(d.error_type)}`) : "",
  });
}
