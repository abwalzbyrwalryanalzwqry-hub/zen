import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type TouchEvent,
} from "react";
import { Check, ChevronLeft, CloudOff, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  isPresent,
  lastRecordedPos,
  type AttendanceStatus,
  type DayKind,
  type DayStudent,
} from "@/lib/daily-record";
import type { EntryPayload } from "@/lib/daily-record-api";
import { dailyErrorText, type SaveOutcome } from "@/hooks/use-daily-record";
import { ConfirmDialog } from "./ConfirmDialog";
import { EvaluationSection } from "./DayDialogParts";
import { WorkSection } from "./WorkSection";
import { SurahList } from "./SurahList";
import { draftOf, same, savable, workInvalid, type Draft, type WorkDraft } from "./student-draft";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const REASONS = ["sick", "travel", "family"] as const;

const MushafRangePicker = lazy(() => import("./MushafRangePicker"));
/** الحفظ التلقائي بعد توقّف التعديل (1.14.0): لا زر «حفظ». */
const AUTOSAVE_MS = 800;
const FIELD =
  "w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-60";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

/** عرض فرعي داخل نصف الشاشة نفسها بدل نافذة فوقها (1.14.0). */
export type SubView =
  | { type: "mushaf"; kind: DayKind }
  | {
      type: "surah";
      current?: number;
      min: number;
      max: number;
      done: (n: number) => void;
    };

export interface StudentNav {
  /** ترتيب الطالب في القائمة المعروضة وعددها («5 من 20»). */
  index: number;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** محتوى لوحة الطالب: المسودة والحفظ التلقائي والتنقّل بالسحب والعروض الفرعية. */
export function StudentBody({
  student,
  writable,
  onClose,
  onSave,
  onReason,
  nav,
  closeRef,
  navRef,
  view,
  setView,
}: {
  view: SubView | null;
  setView: (v: SubView | null) => void;
  student: DayStudent;
  writable: boolean;
  onClose: () => void;
  onSave: (student: string, payload: EntryPayload) => Promise<SaveOutcome>;
  onReason?: (student: string, status: AttendanceStatus, reason: string) => Promise<boolean>;
  nav: StudentNav | null;
  closeRef: RefObject<(() => void) | null>;
  navRef: RefObject<((go: () => void) => void) | null>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(() => draftOf(student));
  const [state, setState] = useState<SaveState>("idle");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<(() => void) | null>(null);
  const failedKey = useRef<string | null>(null);
  // آخر ما أُرسل بنجاح: لا يُعاد إرساله ولو اختلف ردّ الخادم عنه (لا حلقة حفظ).
  const sentKey = useRef<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const away = student.status === "absent" || student.status === "excused";
  const present = isPresent(student.status);
  const canWork = writable && !away;
  const saved = draftOf(student);
  const dirty = writable && !same(draft, saved);
  const valid = !workInvalid(draft.memorize) && !workInvalid(draft.review);
  const part = savable(draft, saved);
  // ما يمكن حفظه الآن مختلف عن المحفوظ (ولو بقي قسم ناقص).
  const pending = writable && !same(part.draft, saved);
  const key = JSON.stringify(part.payload) + "|" + draft.reason.trim();

  const setWork = (k: DayKind, p: Partial<WorkDraft>) =>
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }));

  // آخر نسخة للحفظ من خارج دورة العرض (المؤقّت والإغلاق والتنقّل).
  const latest = useRef({ draft, student, dirty, valid, pending, key });
  useEffect(() => {
    latest.current = { draft, student, dirty, valid, pending, key };
  });
  const inflight = useRef<Promise<boolean> | null>(null);

  const persist = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const { draft: d, student: s, pending: has, key: k } = latest.current;
    if (!has || sentKey.current === k) return true;
    const run = (async () => {
      setState("saving");
      setError(null);
      try {
        if (
          (s.status === "absent" || s.status === "excused") &&
          onReason &&
          d.reason.trim() !== (s.reason ?? "") &&
          !(await onReason(s.student_id, s.status as AttendanceStatus, d.reason.trim()))
        ) {
          setState("error");
          failedKey.current = k;
          return false;
        }
        const r = await onSave(s.student_id, savable(d, draftOf(s)).payload);
        setState(r === "queued" ? "queued" : "saved");
        failedKey.current = null;
        sentKey.current = k;
        setSavedKey(k);
        return true;
      } catch (e) {
        setError(dailyErrorText(e));
        setState("error");
        failedKey.current = k;
        return false;
      }
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, [onSave, onReason]);

  // الحفظ التلقائي: بعد توقّف التعديل، لما اكتمل وتغيّر، ولا يُعاد ما رفضه الخادم حتى يتغيّر.
  useEffect(() => {
    if (!pending || failedKey.current === key || sentKey.current === key) return;
    const id = window.setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [key, pending, persist]);

  /** يحفظ ما اكتمل ثم يمضي؛ وما لم يكتمل يُسأل عن تجاهله (DR-19). */
  const leave = useCallback(
    (then: () => void) => {
      void persist().then((done) => {
        if (!done) return;
        const { dirty: isDirty, valid: ok } = latest.current;
        // حُفظ ما اكتمل؛ وقسم ناقص بقي ⇒ يُسأل عن تجاهله.
        if (isDirty && !ok) {
          setTried(true);
          setError(t("dailyRecord.detail.fixErrors"));
          setDiscarding(() => then);
          return;
        }
        then();
      });
    },
    [persist, t],
  );
  useEffect(() => {
    closeRef.current = () => leave(onClose);
    navRef.current = (fn) => leave(fn);
    return () => {
      closeRef.current = null;
      navRef.current = null;
    };
  }, [leave, onClose, closeRef, navRef]);

  // السحب أفقياً: في RTL السحب يساراً «التالي».
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("input, textarea, [data-no-swipe]")) return;
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0 || !nav) return;
    const dx = e.changedTouches[0].clientX - s0.x;
    const dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) / 2) return;
    const rtl = document.documentElement.dir !== "ltr";
    const toNext = rtl ? dx < 0 : dx > 0;
    const fn = toNext ? nav.onNext : nav.onPrev;
    if (fn) leave(fn);
  };

  const status =
    state === "saving" ? (
      <>
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        {t("dailyRecord.detail.saving")}
      </>
    ) : dirty && !valid ? (
      t("dailyRecord.autosave.incomplete")
    ) : state === "queued" && savedKey === key ? (
      <>
        <CloudOff className="w-3.5 h-3.5" aria-hidden="true" />
        {t("dailyRecord.autosave.queued")}
      </>
    ) : state === "saved" && savedKey === key ? (
      <>
        <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        {t("dailyRecord.autosave.saved")}
      </>
    ) : null;

  return (
    <>
      <div
        className="space-y-3"
        hidden={!!view}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {writable && !present && (
          <p className="rounded-xl bg-muted/60 p-2 text-xs text-muted-foreground">
            {student.status
              ? t("dailyRecord.detail.notPresent")
              : t("dailyRecord.detail.autoPresent")}
          </p>
        )}
        {away && (writable || student.reason) && (
          <section className="space-y-2" aria-label={t("dailyRecord.reason.label")}>
            <h3 className="text-sm font-black text-foreground">
              {t("dailyRecord.reason.label")}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {t("dailyRecord.detail.optional")}
              </span>
            </h3>
            {writable && (
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={draft.reason === t(`dailyRecord.reason.${r}`)}
                    onClick={() =>
                      setDraft((d) => ({ ...d, reason: t(`dailyRecord.reason.${r}`) }))
                    }
                    className={`min-h-11 px-3 rounded-full text-xs font-bold ${
                      draft.reason === t(`dailyRecord.reason.${r}`)
                        ? "bg-foreground text-background"
                        : "bg-muted/60 text-foreground"
                    }`}
                  >
                    {t(`dailyRecord.reason.${r}`)}
                  </button>
                ))}
              </div>
            )}
            <input
              aria-label={t("dailyRecord.reason.label")}
              placeholder={t("dailyRecord.reason.placeholder")}
              maxLength={300}
              value={draft.reason}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              className={FIELD}
            />
          </section>
        )}
        <WorkSection
          k="memorize"
          w={draft.memorize}
          student={student}
          writable={writable}
          canWork={canWork}
          tried={tried}
          setWork={setWork}
          setDraft={setDraft}
          onPickFromMushaf={(kind) => setView({ type: "mushaf", kind })}
          onRequestSurah={(r) =>
            setView({
              type: "surah",
              current: r.current,
              min: r.min,
              max: r.max,
              done: (n) => {
                r.done(n);
                setView(null);
              },
            })
          }
        />
        <WorkSection
          k="review"
          w={draft.review}
          student={student}
          writable={writable}
          canWork={canWork}
          tried={tried}
          setWork={setWork}
          setDraft={setDraft}
          onPickFromMushaf={(kind) => setView({ type: "mushaf", kind })}
          onRequestSurah={(r) =>
            setView({
              type: "surah",
              current: r.current,
              min: r.min,
              max: r.max,
              done: (n) => {
                r.done(n);
                setView(null);
              },
            })
          }
        />
        <EvaluationSection
          value={draft.evaluation}
          disabled={!writable}
          onChange={(c, g) => setDraft((d) => ({ ...d, evaluation: { ...d.evaluation, [c]: g } }))}
        />
        <label className="grid gap-1 text-sm font-black text-foreground">
          {t("dailyRecord.detail.note")}
          <textarea
            rows={2}
            maxLength={1000}
            value={draft.note}
            disabled={!writable}
            placeholder={t("dailyRecord.detail.notePlaceholder")}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            className={`${FIELD} font-normal`}
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="sticky -bottom-4 -mx-4 -mb-4 border-t border-border/60 bg-background/95 px-4 pt-2 pb-3 flex items-center gap-2">
          <p
            role="status"
            aria-live="polite"
            className="flex-1 min-w-0 text-xs text-muted-foreground flex items-center gap-1"
          >
            {status}
          </p>
          {nav?.onNext ? (
            <button
              type="button"
              onClick={() => leave(nav.onNext!)}
              disabled={state === "saving"}
              className="min-h-12 px-5 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {t("dailyRecord.nav.next")}
              <ChevronLeft className="w-4 h-4 ltr:rotate-180" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => leave(onClose)}
              disabled={state === "saving"}
              className="min-h-12 px-5 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
            >
              {t("dailyRecord.autosave.done")}
            </button>
          )}
        </div>
        <ConfirmDialog
          open={!!discarding}
          title={t("dailyRecord.discard.title")}
          body={t("dailyRecord.discard.body")}
          confirmLabel={t("dailyRecord.discard.confirm")}
          destructive
          onCancel={() => setDiscarding(null)}
          onConfirm={() => {
            const fn = discarding;
            setDiscarding(null);
            fn?.();
          }}
        />
      </div>
      {view?.type === "surah" && (
        <SurahList current={view.current} min={view.min} max={view.max} onPick={view.done} />
      )}
      {view?.type === "mushaf" && (
        <Suspense fallback={null}>
          <MushafRangePicker
            initial={draft[view.kind].range}
            direction={draft[view.kind].direction}
            focus={lastRecordedPos(student, view.kind)}
            onPick={(range) => {
              setWork(view.kind, { range });
              setView(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
