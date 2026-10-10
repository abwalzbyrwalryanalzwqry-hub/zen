import { useMemo, useState } from "react";
import { CalendarCheck, Check, Loader2, Sparkles, X } from "lucide-react";
import { SURAHS, findSurah } from "@/lib/quran-meta";
import { localDay } from "@/lib/prayer";
import { listReviewCards, type ReviewCard } from "@/lib/zen-lms";
import {
  DAY_NAMES,
  PLAN_STATUS_LABEL,
  buildPlanDraft,
  decidePlan,
  itemLabel,
  listPlans,
  planDayFor,
  proposePlan,
  ruleRationale,
  type MemorizationPlan,
  type PlanItem,
} from "@/lib/plan";
import { planRationale } from "@/lib/tools-client";
import { useAsync } from "@/hooks/use-async";

function PlanItems({ items, today }: { items: PlanItem[]; today: number | null }) {
  const days = [...new Set(items.map((i) => i.day))].sort((a, b) => a - b);
  return (
    <div className="space-y-1">
      {days.map((d) => (
        <div
          key={d}
          className={`rounded-xl px-3 py-1.5 text-xs flex gap-2 ${d === today ? "bg-primary/15 ring-1 ring-primary/40" : "glass"}`}
        >
          <span className="font-bold text-foreground shrink-0">
            {d === today ? "اليوم" : DAY_NAMES[d]}
          </span>
          <span className="text-foreground/90">
            {items
              .filter((i) => i.day === d)
              .map((i) => `${i.kind === "new" ? "حفظ" : "مراجعة"} ${itemLabel(i)}`)
              .join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusChip({ plan }: { plan: MemorizationPlan }) {
  const tone =
    plan.status === "approved"
      ? "bg-primary/15 text-primary"
      : plan.status === "proposed"
        ? "bg-gold/15 text-gold"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`text-[0.625rem] px-2 py-0.5 rounded-full ${tone}`}>
      {PLAN_STATUS_LABEL[plan.status]}
    </span>
  );
}

function cardStats(cards: ReviewCard[], today: string) {
  return {
    cards: cards.length,
    overdue: cards.filter((c) => c.due_date < today).length,
    weak: cards.filter((c) => c.lapses > 0 || Number(c.ease) < 2.3).length,
  };
}

/** بطاقة الطالب: خطته المعتمدة أو المعلّقة، واقتراح خطة جديدة من سجل المراجعة. */
const NO_PLANS: MemorizationPlan[] = [];
const NO_CARDS: ReviewCard[] = [];

export function StudentPlanCard({ studentId }: { studentId: string }) {
  const today = localDay(new Date());
  const explain = planRationale;
  const dataQ = useAsync(`plan:${studentId}`, () =>
    Promise.all([listPlans(studentId), listReviewCards(studentId)]),
  );
  const plans: MemorizationPlan[] = dataQ.data?.[0] ?? NO_PLANS;
  const cards: ReviewCard[] = dataQ.data?.[1] ?? NO_CARDS;
  const load = dataQ.reload;
  const [open, setOpen] = useState(false);
  const [surah, setSurah] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(5);
  const [newDays, setNewDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const current = plans.find((p) => p.status === "approved") ?? null;
  const pending = plans.find((p) => p.status === "proposed") ?? null;
  const last = plans[0] ?? null;

  const draft = useMemo(
    () =>
      buildPlanDraft(cards, {
        today,
        newPortion: surah ? { surah_name: surah, from_ayah: from, to_ayah: to } : null,
        newDays,
      }),
    [cards, today, surah, from, to, newDays],
  );

  const submit = async () => {
    if (draft.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      let rationale = ruleRationale(cards, draft, today);
      try {
        const r = await explain({ data: { items: draft, stats: cardStats(cards, today) } });
        if (r.text) rationale = r.text;
      } catch {
        // التعليل الآلي يكفي عند تعذّر المساعد.
      }
      await proposePlan(studentId, draft, rationale, today);
      setOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الإرسال.");
    } finally {
      setBusy(false);
    }
  };

  const maxAyah = findSurah(surah)?.ayahs ?? 286;

  return (
    <div className="mx-5 mt-3 glass-strong rounded-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground flex-1">خطة الأسبوع</span>
        {(pending ?? current) && <StatusChip plan={pending ?? current!} />}
      </div>

      {current && (
        <>
          <PlanItems items={current.items} today={planDayFor(current, today)} />
          {current.teacher_note && (
            <p className="text-[0.6875rem] text-muted-foreground">
              ملاحظة المعلّم: {current.teacher_note}
            </p>
          )}
        </>
      )}
      {pending && (
        <p className="text-[0.6875rem] text-muted-foreground">
          اقتراحك ({pending.items.length} عنصراً) بانتظار اعتماد المعلّم.
        </p>
      )}
      {!current && !pending && last?.status === "rejected" && (
        <p className="text-[0.6875rem] text-muted-foreground">
          لم يعتمد المعلّم الخطة الأخيرة{last.teacher_note ? `: ${last.teacher_note}` : "."}
        </p>
      )}
      {!current && !pending && !last && (
        <p className="text-[0.6875rem] text-muted-foreground">
          خطة تُبنى من مواعيد مراجعتك ومقطع جديد تختاره، ويعتمدها معلّمك.
        </p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl glass text-xs font-semibold py-2.5 text-foreground"
        >
          اقترح خطة جديدة
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-[0.6875rem] text-muted-foreground">
            حفظ جديد هذا الأسبوع (اختياري)
            <select
              value={surah}
              onChange={(e) => {
                setSurah(e.target.value);
                setFrom(1);
                setTo(Math.min(5, findSurah(e.target.value)?.ayahs ?? 5));
              }}
              className="mt-1 w-full rounded-xl glass px-3 py-2 text-sm text-foreground bg-transparent"
            >
              <option value="">بلا حفظ جديد — مراجعة فقط</option>
              {SURAHS.map((s) => (
                <option key={s.n} value={s.name}>
                  {s.n}. {s.name}
                </option>
              ))}
            </select>
          </label>
          {surah && (
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["من آية", from, setFrom, 1],
                  ["إلى آية", to, setTo, from],
                  ["أيام الحفظ", newDays, setNewDays, 1],
                ] as const
              ).map(([label, v, set, min]) => (
                <label key={label} className="text-[0.625rem] text-muted-foreground">
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={label === "أيام الحفظ" ? 6 : maxAyah}
                    value={v}
                    onChange={(e) => set(Number(e.target.value) || min)}
                    className="mt-1 w-full rounded-xl glass px-2 py-1.5 text-sm text-foreground bg-transparent"
                  />
                </label>
              ))}
            </div>
          )}
          {draft.length > 0 ? (
            <PlanItems items={draft} today={1} />
          ) : (
            <p className="text-[0.6875rem] text-muted-foreground">
              لا مراجعات مستحقة هذا الأسبوع؛ اختر مقطعاً جديداً لبناء الخطة.
            </p>
          )}
          {err && (
            <p role="alert" className="text-xs text-destructive">
              {err}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void submit()}
              disabled={busy || draft.length === 0}
              className="flex-1 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              أرسل للمعلّم
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-2xl glass text-xs px-4 text-foreground"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** بطاقة المعلّم في صفحة الطالب: الخطة المعلّقة للاعتماد أو الرفض، والمعتمدة الحالية. */
export function TeacherPlanReview({ studentId }: { studentId: string }) {
  const today = localDay(new Date());
  const plansQ = useAsync(`plans:${studentId}`, () => listPlans(studentId));
  const plans: MemorizationPlan[] = plansQ.data ?? NO_PLANS;
  const load = plansQ.reload;
  const [note, setNote] = useState("");
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = plans.find((p) => p.status === "proposed") ?? null;
  const current = plans.find((p) => p.status === "approved") ?? null;

  const decide = async (approve: boolean) => {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      const kept = pending.items.filter((_, i) => !removed.has(i));
      if (approve && kept.length === 0) throw new Error("أبقِ عنصراً واحداً على الأقل.");
      await decidePlan(pending.id, approve, note, approve && removed.size > 0 ? kept : undefined);
      setNote("");
      setRemoved(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّرت العملية.");
    } finally {
      setBusy(false);
    }
  };

  if (!pending && !current) return null;

  return (
    <div className="glass-strong rounded-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground flex-1">خطة الحفظ</span>
        <StatusChip plan={pending ?? current!} />
      </div>
      {pending ? (
        <>
          {pending.rationale && (
            <p className="text-[0.6875rem] text-muted-foreground leading-5 whitespace-pre-line">
              {pending.rationale}
            </p>
          )}
          <div className="space-y-1">
            {pending.items.map((it, i) => (
              <label
                key={i}
                className="flex items-center gap-2 text-xs rounded-xl glass px-3 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={!removed.has(i)}
                  onChange={() =>
                    setRemoved((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <span className="text-foreground">
                  {DAY_NAMES[it.day]} · {it.kind === "new" ? "حفظ" : "مراجعة"} {itemLabel(it)}
                </span>
              </label>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="ملاحظة للطالب (اختياري)"
            aria-label="ملاحظة للطالب"
            className="w-full rounded-xl glass px-3 py-2 text-sm text-foreground bg-transparent"
          />
          {err && (
            <p role="alert" className="text-xs text-destructive">
              {err}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void decide(true)}
              disabled={busy}
              className="flex-1 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" /> اعتماد
            </button>
            <button
              onClick={() => void decide(false)}
              disabled={busy}
              className="flex-1 rounded-2xl glass text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 text-foreground disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" /> عدم اعتماد
            </button>
          </div>
        </>
      ) : (
        current && <PlanItems items={current.items} today={planDayFor(current, today)} />
      )}
    </div>
  );
}
