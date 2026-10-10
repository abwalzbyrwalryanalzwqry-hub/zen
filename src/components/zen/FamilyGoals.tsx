import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, Plus, Target, X } from "lucide-react";
import {
  GOAL_KINDS,
  cancelFamilyGoal,
  familyGoalsFor,
  goalErrorMessage,
  goalKind,
  goalPercent,
  goalTitle,
  setFamilyGoal,
  type FamilyGoal,
  type GoalKind,
} from "@/lib/family-goals";

/**
 * الأهداف العائلية (11.3). guardian: قائمة أهداف الابن المختار مع إضافة وإلغاء.
 * student: أهدافه للقراءة. بلا مقارنة بين الأبناء ولا درجات.
 */
export function FamilyGoals({
  studentId,
  mode,
}: {
  studentId: string;
  mode: "guardian" | "student";
}) {
  const [goals, setGoals] = useState<FamilyGoal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    familyGoalsFor(studentId)
      .then(setGoals)
      .catch(() => setGoals([]));
  }, [studentId]);
  useEffect(load, [load]);

  if (!goals) return null;
  if (mode === "student" && goals.length === 0) return null;
  const active = goals.filter((g) => g.status === "active").length;

  return (
    <section aria-label="الأهداف العائلية" className="glass-strong rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="text-xs font-bold flex-1">
          {mode === "guardian" ? "أهداف عائلية" : "أهدافي العائلية"}
        </h2>
        {mode === "guardian" && !adding && active < 3 && (
          <button
            onClick={() => setAdding(true)}
            className="h-7 px-2.5 rounded-lg glass text-[0.6875rem] font-bold text-primary flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> هدف جديد
          </button>
        )}
      </div>
      {mode === "guardian" && goals.length === 0 && !adding && (
        <p className="text-[0.6875rem] text-muted-foreground">
          ضع لابنك هدفاً صغيراً ومكافأة رمزية تتفقان عليها. يُحسب التقدّم من سجله تلقائياً.
        </p>
      )}
      {adding && (
        <GoalForm
          studentId={studentId}
          onDone={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {goals.map((g) => (
        <GoalRow
          key={g.id}
          g={g}
          canCancel={mode === "guardian" && g.mine && g.status === "active"}
          onCancel={async () => {
            setErr(null);
            try {
              await cancelFamilyGoal(g.id);
              load();
            } catch (e) {
              setErr(goalErrorMessage(e));
            }
          }}
        />
      ))}
      {err && (
        <p role="alert" className="text-[0.6875rem] text-destructive">
          {err}
        </p>
      )}
    </section>
  );
}

function GoalRow({
  g,
  canCancel,
  onCancel,
}: {
  g: FamilyGoal;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const pct = goalPercent(g);
  const done = g.status === "done";
  return (
    <div className="glass rounded-2xl p-3 space-y-1.5" data-goal={g.id}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs font-bold">{goalTitle(g)}</p>
        {done ? (
          <span className="text-[0.625rem] font-bold text-primary">تمّ</span>
        ) : g.expired ? (
          <span className="text-[0.625rem] text-muted-foreground">انتهت مدته</span>
        ) : null}
        {canCancel && (
          <button
            onClick={onCancel}
            aria-label={`إلغاء ${goalTitle(g)}`}
            className="text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={g.target}
        aria-valuenow={g.progress}
        aria-label={`${g.progress} من ${g.target} ${goalKind(g.kind).unit}`}
      >
        <div className={`h-full ${done ? "bg-gold" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[0.625rem] text-muted-foreground flex items-center gap-1">
        <span className="tabular-nums">
          {g.progress} / {g.target}
        </span>
        {g.ends_on && <span>· حتى {g.ends_on}</span>}
        {g.reward && (
          <span className="flex items-center gap-1 ms-auto text-foreground">
            <Gift className="w-3 h-3 text-gold" aria-hidden="true" /> {g.reward}
          </span>
        )}
      </p>
    </div>
  );
}

function GoalForm({
  studentId,
  onDone,
  onCancel,
}: {
  studentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<GoalKind>("pages");
  const [target, setTarget] = useState(10);
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const k = goalKind(kind);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setFamilyGoal({ studentId, kind, target, title, reward, endsOn: endsOn || null });
      onDone();
    } catch (e) {
      setErr(goalErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="glass rounded-2xl p-3 space-y-2"
      aria-label="هدف جديد"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="block text-[0.6875rem] font-bold">
        نوع الهدف
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as GoalKind)}
          className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-xs"
        >
          {GOAL_KINDS.map((g) => (
            <option key={g.kind} value={g.kind}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[0.6875rem] font-bold">
        العدد ({k.unit})
        <input
          type="number"
          min={1}
          max={k.max}
          value={target}
          onChange={(e) => setTarget(Math.max(1, Math.min(k.max, Number(e.target.value) || 1)))}
          className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-xs tabular-nums"
        />
      </label>
      <label className="block text-[0.6875rem] font-bold">
        العنوان (اختياري)
        <input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً: سورة الملك قبل رمضان"
          className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-xs"
        />
      </label>
      <label className="block text-[0.6875rem] font-bold">
        المكافأة الرمزية (اختياري)
        <input
          value={reward}
          maxLength={80}
          onChange={(e) => setReward(e.target.value)}
          placeholder="مثلاً: نزهة يوم الجمعة"
          className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-xs"
        />
      </label>
      <label className="block text-[0.6875rem] font-bold">
        حتى تاريخ (اختياري)
        <input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-xs"
        />
      </label>
      {err && (
        <p role="alert" className="text-[0.6875rem] text-destructive">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ الهدف
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl glass text-xs">
          إلغاء
        </button>
      </div>
    </form>
  );
}
