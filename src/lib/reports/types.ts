/**
 * التقارير وسجل الإنجاز — الأنواع المشتركة (docs/REPORTS.md).
 *
 * البيانات كما تعيدها `halaqa_report_data` (قراءة فقط من السجل اليومي)، لا نسخة منها ولا جدول جديد.
 */
import type {
  AttendanceStatus,
  DayKind,
  Evaluation,
  QuranRange,
  RecordStatus,
  Segment,
} from "@/lib/daily-record";

export interface ReportWork {
  segments: Segment[];
  /** درجة 0..100 كما في recitation_assessments (تُعرض 1..5 بـ scoreToGrade). */
  score: number | null;
  error_type: string | null;
  notes: string | null;
}

export interface ReportRow {
  date: string;
  student_id: string;
  status: AttendanceStatus | null;
  reason: string | null;
  note: string | null;
  evaluation: Evaluation | null;
  memorize: ReportWork | null;
  review: ReportWork | null;
}

export interface ReportStudent {
  id: string;
  name: string;
  member: boolean;
}

export interface HistorySegment extends Segment {
  student_id: string;
  date: string;
}

export interface ReportData {
  halaqa: { id: string; name: string; teacher_name: string | null; center_name: string | null };
  from: string;
  to: string;
  today: string;
  generated_at: string;
  schedule: { weekday: number; start: string; end: string }[];
  students: ReportStudent[];
  days: {
    date: string;
    status: RecordStatus;
    notes: string | null;
    /** 1.21.1: عمليات التعديل بعد إغلاق اليوم (daily_record_audit)؛ غائب في النسخ القديمة وفي أوراق الجهاز. */
    edits_after_close?: number;
  }[];
  rows: ReportRow[];
  history: HistorySegment[];
  /** دون اتصال (1.16.0، reports/offline.ts): وقت أحدث بيانات على الجهاز بُني منها التقرير. */
  offline_at?: string;
  /** بُني من أوراق السجل على الجهاز وحدها: قد لا يشمل كل أيام النطاق. */
  offline_partial?: boolean;
}

/** سطر حفظ أو مراجعة واحد بعد التطبيع (مدى واحد لليوم، كما يعرضه السجل اليومي). */
export interface WorkLine {
  date: string;
  studentId: string;
  kind: DayKind;
  segments: Segment[];
  range: QuranRange | null;
  pages: number;
  ayahs: number;
  /** 1..5 أو null بلا درجة. */
  grade: number | null;
  notes: string | null;
}
