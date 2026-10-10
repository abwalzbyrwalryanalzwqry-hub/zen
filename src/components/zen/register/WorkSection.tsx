import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { BookMarked, Plus, RotateCw, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { gradeFromMistakes, surahNo, type DayKind, type DayStudent } from "@/lib/daily-record";
import { SURAHS } from "@/lib/quran-meta";
import { QuranRangeField } from "./QuranRangeField";
import { ErrorChips, GradePicker, MistakeCounter, RangeShortcuts } from "./DayDialogParts";
import { suggestion, type Draft, type WorkDraft } from "./student-draft";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const FIELD =
  "w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-60";

/** قسم الحفظ أو المراجعة في لوحة الطالب: المدى والاتجاه، والاختصارات، وعدّاد الأخطاء، والمستوى، ونوع الخطأ. */
export function WorkSection({
  k,
  w,
  student,
  writable,
  canWork,
  tried,
  setWork,
  setDraft,
  onPickFromMushaf,
  onRequestSurah,
}: {
  onRequestSurah?: ComponentProps<typeof QuranRangeField>["onRequestSurah"];
  k: DayKind;
  w: WorkDraft;
  student: DayStudent;
  writable: boolean;
  canWork: boolean;
  tried: boolean;
  setWork: (k: DayKind, p: Partial<WorkDraft>) => void;
  setDraft: Dispatch<SetStateAction<Draft>>;
  onPickFromMushaf: (k: DayKind) => void;
}) {
  const t = useT();
  const title = t(`dailyRecord.detail.${k}`);
  return (
    <section
      className={`rounded-2xl border p-3 space-y-2 ${w.on ? "border-primary/25 bg-primary/5" : "border-border/50 bg-muted/20"}`}
      aria-label={title}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
          {k === "memorize" ? (
            <BookMarked className="w-4 h-4 text-primary" aria-hidden="true" />
          ) : (
            <RotateCw className="w-4 h-4 text-gold-ink" aria-hidden="true" />
          )}
          {title}
        </h3>
        {w.on ? (
          <button
            type="button"
            disabled={!writable}
            onClick={() => setWork(k, { on: false })}
            className="min-h-11 px-2 rounded-lg text-destructive text-xs font-bold flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t("dailyRecord.detail.remove")}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canWork}
            onClick={() => setWork(k, { on: true })}
            className="min-h-11 px-3 rounded-lg bg-primary/12 text-primary text-xs font-bold flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t(`dailyRecord.detail.add.${k}`)}
          </button>
        )}
      </div>
      {w.on && (
        <>
          <LastRecorded student={student} k={k} />
          <div data-no-swipe="">
            <QuranRangeField
              label={title}
              value={w.range}
              direction={w.direction}
              onDirection={(direction) =>
                setDraft((d) => {
                  const cur = d[k];
                  // المدى المقترح يتبع الاتجاه ما لم يغيّره المعلّم.
                  const untouched =
                    JSON.stringify(cur.range) ===
                    JSON.stringify(suggestion(student, k, cur.direction));
                  return {
                    ...d,
                    [k]: {
                      ...cur,
                      direction,
                      range: untouched ? suggestion(student, k, direction) : cur.range,
                    },
                  };
                })
              }
              disabled={!writable}
              showError={tried}
              onChange={(range) => setWork(k, { range })}
              onPickFromMushaf={() => onPickFromMushaf(k)}
            />
          </div>
          {writable && (
            <RangeShortcuts
              kind={k}
              s={student}
              range={w.range}
              direction={w.direction}
              set={(range) => setWork(k, { range })}
            />
          )}
          {writable && (
            <MistakeCounter
              label={t("dailyRecord.mistakes.group", { kind: title })}
              value={w.mistakes ?? 0}
              disabled={!writable}
              onChange={(n) => setWork(k, { mistakes: n, grade: gradeFromMistakes(n) })}
            />
          )}
          <GradePicker
            label={t("dailyRecord.detail.performance", { kind: title })}
            value={w.grade}
            disabled={!writable}
            onChange={(grade) => setWork(k, { grade })}
          />
          {tried && !w.grade && (
            <p className="text-xs text-destructive">{t("dailyRecord.detail.pickGrade")}</p>
          )}
          <ErrorChips
            label={t("dailyRecord.detail.errorType", { kind: title })}
            value={w.error_type}
            disabled={!writable}
            onChange={(error_type) => setWork(k, { error_type })}
          />
          <input
            aria-label={t("dailyRecord.detail.workNotes", { kind: title })}
            placeholder={t("dailyRecord.detail.workNotesPlaceholder")}
            maxLength={1000}
            value={w.notes}
            disabled={!writable}
            onChange={(e) => setWork(k, { notes: e.target.value })}
            className={FIELD}
          />
        </>
      )}
    </section>
  );
}

/**
 * «آخر ما سُجّل» في آخر جلسة سابقة (1.35.0): السورة ورقم آخر آية، ومنها يكمل المعلّم. البداية في النموذج
 * وفي «اختيار من المصحف» هي الآية التي تليها.
 */
function LastRecorded({ student, k }: { student: DayStudent; k: DayKind }) {
  const t = useT();
  const last = k === "memorize" ? student.last_memorize : student.last_review;
  const n = last ? surahNo(last.surah_name) : 0;
  if (!last || !n) return null;
  return (
    <p
      className="rounded-xl bg-gold/10 border border-gold/30 px-3 py-1.5 text-xs text-foreground"
      data-testid={`last-recorded-${k}`}
    >
      {t("dailyRecord.range.lastRecorded", {
        surah: SURAHS[n - 1]?.name ?? last.surah_name,
        ayah: last.to_ayah,
      })}
    </p>
  );
}
