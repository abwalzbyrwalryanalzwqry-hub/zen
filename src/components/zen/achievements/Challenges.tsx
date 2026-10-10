import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import {
  challengePercent,
  createChallenge,
  deleteChallenge,
  getChallenges,
  logChallengePages,
  partAction,
  type Challenge,
  type ChallengeKind,
  type ChallengesView,
} from "@/lib/achievements";
import { isoDate } from "@/lib/center";
import { errText } from "@/components/zen/achievements/err";

export function ChallengesCard({ halaqaId, userId }: { halaqaId: string; userId: string }) {
  const [v, setV] = useState<ChallengesView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(
    () =>
      getChallenges(halaqaId)
        .then((x) => {
          setV(x);
          setErr(null);
        })
        .catch((e) => setErr(errText(e, "تعذّر التحميل"))),
    [halaqaId],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (!v) return err ? <p className="text-[0.6875rem] text-destructive">{err}</p> : null;
  if (v.challenges.length === 0 && !v.can_manage) return null;
  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary" /> التحديات الجماعية
        </p>
        {v.can_manage && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[0.6875rem] font-bold text-primary flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> تحدٍّ جديد
          </button>
        )}
      </div>
      {adding && (
        <NewChallengeForm
          halaqaId={halaqaId}
          userId={userId}
          today={v.today}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {v.challenges.length === 0 && !adding && (
        <p className="text-[0.6875rem] text-muted-foreground">
          ختمة جماعية يحجز فيها كل عضو أجزاءً، أو هدف صفحات يشارك فيه الجميع.
        </p>
      )}
      {v.challenges.map((c) => (
        <ChallengeItem key={c.id} c={c} view={v} onChange={load} onError={(m) => setErr(m)} />
      ))}
      {err && <p className="text-[0.6875rem] text-destructive">{err}</p>}
    </div>
  );
}

function ChallengeItem({
  c,
  view,
  onChange,
  onError,
}: {
  c: Challenge;
  view: ChallengesView;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState("");
  const active = !c.completed_at && view.today >= c.starts_on && view.today <= c.ends_on;
  const canAct = active && view.is_member;
  const pct = challengePercent(c);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
      onChange();
    } catch (e) {
      onError(errText(e, "تعذّر التنفيذ"));
    } finally {
      setBusy(false);
    }
  };
  const byPart = new Map(c.parts.map((p) => [p.part, p]));
  return (
    <div className="rounded-2xl bg-background/50 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-foreground">{c.title}</p>
          <p className="text-[0.625rem] text-muted-foreground">
            {c.kind === "khatma"
              ? `${c.progress} من 30 جزءاً`
              : `${c.progress} من ${c.target} صفحة`}
            {` · ${c.contributors} مشارك · حتى ${c.ends_on}`}
            {c.completed_at ? " · اكتمل" : !active ? " · غير جارٍ" : ""}
          </p>
        </div>
        {view.can_manage && (
          <button
            onClick={() => {
              if (confirm("حذف التحدي؟")) run(() => deleteChallenge(c.id));
            }}
            aria-label="حذف التحدي"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="h-2 rounded-full bg-primary/10 overflow-hidden mt-2">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
      {c.kind === "khatma" && (
        <div className="grid grid-cols-10 gap-1 mt-2">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
            const p = byPart.get(n);
            const cls = p?.done
              ? "bg-primary text-primary-foreground"
              : p?.mine
                ? "bg-primary/30 text-foreground ring-1 ring-primary"
                : p
                  ? "bg-primary/15 text-muted-foreground"
                  : "bg-background text-foreground border border-border";
            const title = p ? `الجزء ${n}: ${p.name}${p.done ? " (تمّ)" : ""}` : `الجزء ${n}: متاح`;
            const action = !canAct
              ? null
              : !p
                ? () => run(() => partAction(c.id, n, "claim"))
                : p.mine && !p.done
                  ? () => {
                      if (confirm(`أتممت قراءة الجزء ${n}؟`))
                        run(() => partAction(c.id, n, "done"));
                    }
                  : null;
            return (
              <button
                key={n}
                title={title}
                aria-label={title}
                disabled={busy || !action}
                onClick={action ?? undefined}
                className={`aspect-square rounded-lg text-[0.625rem] font-bold ${cls}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
      {c.kind === "khatma" && canAct && (
        <>
          <p className="text-[0.625rem] text-muted-foreground mt-1.5">
            اضغط جزءاً متاحاً لحجزه، ثم اضغطه بعد قراءته. حد 3 أجزاء محجوزة لم تُتمّ.
          </p>
          {c.parts.some((p) => p.mine && !p.done) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[0.625rem] text-muted-foreground">أجزائي المحجوزة:</span>
              {c.parts
                .filter((p) => p.mine && !p.done)
                .map((p) => (
                  <button
                    key={p.part}
                    disabled={busy}
                    onClick={() => run(() => partAction(c.id, p.part, "release"))}
                    className="text-[0.625rem] font-bold rounded-full glass px-2 py-0.5"
                  >
                    ترك الجزء {p.part}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      {c.kind === "pages" && canAct && (
        <div className="flex items-center gap-2 mt-2">
          <input
            inputMode="numeric"
            value={pages}
            onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="صفحات قرأتها"
            className="flex-1 h-8 rounded-xl bg-background border border-border px-3 text-xs"
            aria-label="صفحات قرأتها"
          />
          <button
            disabled={busy || !pages}
            onClick={() =>
              run(async () => {
                await logChallengePages(c.id, Number(pages));
                setPages("");
              })
            }
            className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[0.6875rem] font-bold"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "أضف"}
          </button>
          {c.my_pages > 0 && (
            <span className="text-[0.625rem] text-muted-foreground">مساهمتك {c.my_pages}</span>
          )}
        </div>
      )}
    </div>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function NewChallengeForm({
  halaqaId,
  userId,
  today,
  onDone,
}: {
  halaqaId: string;
  userId: string;
  today: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("ختمة جماعية");
  const [kind, setKind] = useState<ChallengeKind>("khatma");
  const [target, setTarget] = useState("604");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 29));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createChallenge(halaqaId, userId, {
        title,
        kind,
        target: kind === "khatma" ? 30 : Number(target),
        starts_on: start,
        ends_on: end,
      });
      onDone();
    } catch (e) {
      setErr(errText(e, "تعذّر الإنشاء"));
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full h-9 rounded-xl bg-background border border-border px-3 text-xs";
  return (
    <div className="rounded-2xl bg-background/50 p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        className={input}
        aria-label="عنوان التحدي"
      />
      <div className="grid grid-cols-2 gap-2">
        {(["khatma", "pages"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              if (title === "ختمة جماعية" || title === "هدف صفحات")
                setTitle(k === "khatma" ? "ختمة جماعية" : "هدف صفحات");
            }}
            className={`h-9 rounded-xl text-xs font-bold ${
              kind === k ? "bg-primary text-primary-foreground" : "glass text-foreground"
            }`}
          >
            {k === "khatma" ? "ختمة (30 جزءاً)" : "هدف صفحات"}
          </button>
        ))}
      </div>
      {kind === "pages" && (
        <input
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ""))}
          className={input}
          aria-label="عدد الصفحات المستهدف"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.625rem] text-muted-foreground">
          من
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={input}
          />
        </label>
        <label className="text-[0.625rem] text-muted-foreground">
          إلى
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {err && <p className="text-[0.6875rem] text-destructive">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "إنشاء"}
        </button>
        <button onClick={onDone} className="h-9 px-4 rounded-xl glass text-xs font-bold">
          إلغاء
        </button>
      </div>
    </div>
  );
}
