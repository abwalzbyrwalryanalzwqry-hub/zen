/**
 * تخزين الاختبارات: محلي أولاً، والسحابة للسجل والمتابعة.
 *
 * المحرّك يعمل دون اتصال، فالمصدر الحيّ لحالة المحاولة هو `localStorage`:
 * كل إجابة تُكتب فوراً، فإغلاق التطبيق أو انقطاع الشبكة لا يفقد التقدّم.
 * ثم تُرفَع اللقطة والنتيجة إلى Supabase عند توفّر الشبكة — والفشل في الرفع
 * لا يُسقط الاختبار ولا يمنع إكماله.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ExamAttempt, ExamResult, ExamSnapshot, QuestionAnswer } from "./types";
import type { ReportResultRow } from "./report";
import { GUEST_ID } from "@/lib/offline/guest";

const db = supabase;

const ACTIVE_KEY = "zen-exam-active";

export type ActiveExamState = {
  snapshot: ExamSnapshot;
  attempt: ExamAttempt;
  /** هل رُفعت اللقطة إلى السحابة؟ */
  synced: boolean;
};

// ─────────────────────── التخزين المحلي ───────────────────────

export function saveActiveExam(state: ActiveExamState): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
  } catch {
    // التخزين قد يكون ممتلئاً أو محجوباً — الاختبار يكمل في الذاكرة.
  }
}

export function loadActiveExam(): ActiveExamState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExamState;
    if (!parsed?.snapshot?.questions?.length || !parsed.attempt) return null;
    if (parsed.attempt.status !== "in_progress") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveExam(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* لا شيء */
  }
}

/** يُحدّث إجابة سؤال في المحاولة ويحفظها محلياً فوراً. */
export function recordAnswer(state: ActiveExamState, answer: QuestionAnswer): ActiveExamState {
  const next: ActiveExamState = {
    ...state,
    attempt: {
      ...state.attempt,
      answers: { ...state.attempt.answers, [answer.questionId]: answer },
    },
  };
  saveActiveExam(next);
  return next;
}

// ─────────────────────── سجل الجهاز (وضع الضيف) ───────────────────────

const LOCAL_HISTORY_KEY = "zen-exam-history-local";
const LOCAL_HISTORY_MAX = 50;

type LocalHistoryEntry = ExamHistoryRow & {
  weak: {
    surah_number: number;
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    errors: number;
  }[];
};

function readLocalHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as LocalHistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** يحفظ نتيجة اختبار على الجهاز وحده (الضيف بلا حساب). */
export function recordLocalResult(snapshot: ExamSnapshot, result: ExamResult): void {
  try {
    const entry: LocalHistoryEntry = {
      id: result.attemptId || `${Date.now()}`,
      title: `اختبار ${snapshot.scope.label}`,
      scope_label: snapshot.scope.label,
      difficulty: snapshot.blueprint.difficulty,
      mode: snapshot.blueprint.mode,
      question_count: snapshot.questions.length,
      created_at: new Date().toISOString(),
      result: {
        id: result.attemptId,
        percentage: result.percentage,
        score: result.score,
        possible: result.possible,
        mastery: result.mastery,
      },
      weak: result.weakSpots.map((w) => ({
        surah_number: w.surah,
        surah_name: w.surahName,
        from_ayah: w.fromAyah,
        to_ayah: w.toAyah,
        errors: w.errors,
      })),
    };
    const list = [entry, ...readLocalHistory()].slice(0, LOCAL_HISTORY_MAX);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* التخزين ممتلئ: النتيجة ظاهرة في شاشتها على أي حال */
  }
}

// ─────────────────────── المزامنة السحابية ───────────────────────

/** يرفع اللقطة وينشئ صف المحاولة. يُعيد معرّفات السحابة أو null عند الفشل. */
export async function pushExam(
  snapshot: ExamSnapshot,
  attempt: ExamAttempt,
  studentId: string,
): Promise<{ examId: string; attemptId: string } | null> {
  try {
    const { data: exam, error } = await db
      .from("exams")
      .insert({
        student_id: studentId,
        title: `اختبار ${snapshot.scope.label}`,
        scope_label: snapshot.scope.label,
        scope: snapshot.scope as unknown as Json,
        blueprint: snapshot.blueprint as unknown as Json,
        snapshot: snapshot as unknown as Json,
        question_count: snapshot.questions.length,
        difficulty: snapshot.blueprint.difficulty,
        mode: snapshot.blueprint.mode,
        seed: snapshot.blueprint.seed,
        corpus_sha256: snapshot.corpus.sha256,
        engine_version: snapshot.engineVersion,
      })
      .select("id")
      .single();
    if (error || !exam) return null;

    const { data: row, error: attemptError } = await db
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        student_id: studentId,
        status: "in_progress",
        current_index: attempt.currentIndex,
        answers: attempt.answers,
      })
      .select("id")
      .single();
    if (attemptError || !row) return null;

    return { examId: exam.id as string, attemptId: row.id as string };
  } catch {
    return null;
  }
}

/** يحفظ تقدّم المحاولة في السحابة (استكمال من جهاز آخر). */
export async function pushProgress(attempt: ExamAttempt): Promise<void> {
  try {
    await db
      .from("exam_attempts")
      .update({ current_index: attempt.currentIndex, answers: attempt.answers })
      .eq("id", attempt.id);
  } catch {
    /* التقدّم محفوظ محلياً على أي حال */
  }
}

/** يسلّم المحاولة ويحفظ النتيجة ومواضع الخطأ. */
export async function pushResult(
  attempt: ExamAttempt,
  result: ExamResult,
  studentId: string,
): Promise<{ resultId: string } | null> {
  try {
    await db
      .from("exam_attempts")
      .update({
        status: "submitted",
        ended_at: new Date().toISOString(),
        current_index: attempt.currentIndex,
        answers: attempt.answers,
      })
      .eq("id", attempt.id);

    const { data: row, error } = await db
      .from("exam_results")
      .insert({
        attempt_id: attempt.id,
        exam_id: attempt.examId,
        student_id: studentId,
        score: result.score,
        possible: result.possible,
        percentage: result.percentage,
        mastery: result.mastery,
        correct_count: result.correctCount,
        wrong_count: result.wrongCount,
        skipped_count: result.skippedCount,
        duration_seconds: result.durationSeconds,
        analysis: {
          byFamily: result.byFamily,
          byDifficulty: result.byDifficulty,
          masteryReasons: result.masteryReasons,
        },
      })
      .select("id")
      .single();
    if (error || !row) return null;

    if (result.weakSpots.length) {
      await db.from("exam_errors").insert(
        result.weakSpots.map((spot) => ({
          result_id: row.id,
          student_id: studentId,
          surah_number: spot.surah,
          surah_name: spot.surahName,
          from_ayah: spot.fromAyah,
          to_ayah: spot.toAyah,
          errors: spot.errors,
        })),
      );
    }
    return { resultId: row.id as string };
  } catch {
    return null;
  }
}

/**
 * يرسل مواضع الخطأ إلى نظام المراجعة المتباعدة القائم (SM-2) عبر دالة قاعدة
 * البيانات — لا يُعاد حساب الجدولة في العميل.
 */
export async function sendErrorsToReview(resultId: string): Promise<number> {
  const { data, error } = await db.rpc("send_exam_errors_to_review", { _result_id: resultId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export type ExamHistoryRow = {
  id: string;
  title: string;
  scope_label: string;
  difficulty: string;
  mode: string;
  question_count: number;
  created_at: string;
  result: {
    id: string;
    percentage: number;
    score: number;
    possible: number;
    mastery: string;
  } | null;
};

/** سجل اختبارات الطالب مع نتيجة كل اختبار إن وُجدت. */
export async function listExamHistory(studentId: string, limit = 30): Promise<ExamHistoryRow[]> {
  if (studentId === GUEST_ID) {
    return readLocalHistory()
      .slice(0, limit)
      .map(({ weak: _weak, ...row }) => row);
  }
  const { data } = await db
    .from("exams")
    .select(
      "id, title, scope_label, difficulty, mode, question_count, created_at, exam_results(id, percentage, score, possible, mastery)",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Raw = Omit<ExamHistoryRow, "result"> & {
    exam_results:
      { id: string; percentage: number; score: number; possible: number; mastery: string }[] | null;
  };

  return ((data as Raw[]) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    scope_label: row.scope_label,
    difficulty: row.difficulty,
    mode: row.mode,
    question_count: row.question_count,
    created_at: row.created_at,
    result: row.exam_results?.[0] ?? null,
  }));
}

/** آخر مواضع الضعف التي لم تُرسَل إلى المراجعة — أساس «اختبرني في نقاط ضعفي». */
export async function listWeakSpots(
  studentId: string,
  limit = 20,
): Promise<
  { surah_number: number; surah_name: string; from_ayah: number; to_ayah: number; errors: number }[]
> {
  if (studentId === GUEST_ID) {
    return readLocalHistory()
      .flatMap((h) => h.weak)
      .slice(0, limit);
  }
  const { data } = await db
    .from("exam_errors")
    .select("surah_number, surah_name, from_ayah, to_ayah, errors")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (
    (data as {
      surah_number: number;
      surah_name: string;
      from_ayah: number;
      to_ayah: number;
      errors: number;
    }[]) ?? []
  );
}

// ─────────────────────── تقرير المعلّم ───────────────────────

/** أقصى عدد نتائج يُقرأ للتقرير دفعة واحدة. */
export const TEACHER_REPORT_LIMIT = 1000;

/**
 * نتائج اختبارات الطلاب لتقرير المعلّم، الأحدث أولاً، مع وصف كل اختبار ومواضع
 * خطئه. الصلاحية تفرضها سياسات RLS (المعلّم يقرأ ولا يعدّل)، لا هذا الاستعلام.
 */
export async function listTeacherExamResults(
  since: string | null,
  limit = TEACHER_REPORT_LIMIT,
): Promise<ReportResultRow[]> {
  let query = db
    .from("exam_results")
    .select(
      "id, student_id, exam_id, percentage, score, possible, mastery, correct_count, wrong_count, skipped_count, duration_seconds, analysis, created_at, exams(scope_label, difficulty, mode, question_count), exam_errors(surah_number, surah_name, from_ayah, to_ayah, errors, sent_to_review)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw new Error("تعذّر تحميل نتائج الاختبارات.");

  type Raw = Omit<ReportResultRow, "exam" | "errors"> & {
    exams: ReportResultRow["exam"] | ReportResultRow["exam"][];
    exam_errors: ReportResultRow["errors"] | null;
  };

  return ((data as Raw[]) ?? []).map(({ exams, exam_errors, ...row }) => ({
    ...row,
    exam: Array.isArray(exams) ? (exams[0] ?? null) : (exams ?? null),
    errors: exam_errors ?? [],
  }));
}

/** معرّفات طلاب حلقات المعلّم الحالي — القراءة الفعلية تحكمها سياسات RLS. */
export async function listMyHalaqaStudentIds(): Promise<string[]> {
  const { data, error } = await db.rpc("my_halaqa_student_ids");
  if (error) throw new Error("تعذّر تحميل طلاب حلقاتك.");
  // دالة SETOF uuid تُرجع مصفوفة قيم مباشرة.
  return ((data as (string | { my_halaqa_student_ids: string })[]) ?? []).map((v) =>
    typeof v === "string" ? v : v.my_halaqa_student_ids,
  );
}
