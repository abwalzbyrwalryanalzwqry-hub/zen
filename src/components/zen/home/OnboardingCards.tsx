import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Trophy, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ActiveChallenge, HomeContext } from "@/lib/home";
import { firstDaySteps, FIRST_DAY_DISMISSED_KEY } from "@/lib/first-day";

/**
 * «أول يوم لك» (1.19.0، المرحلة 3): أربع خطوات للمعلّم الجديد — حلقة، وطلاب، وأول سجل يومي، وأول رمز وليّ
 * أمر — من سياق الرئيسية نفسه (بلا نداء إضافي). تختفي حين تكتمل أو يُخفيها المعلّم.
 */
export function FirstDayCard({ ctx }: { ctx: HomeContext }) {
  const t = useT();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(FIRST_DAY_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const steps = firstDaySteps(ctx);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <section
      aria-labelledby="first-day"
      className="glass-strong rounded-3xl p-4 space-y-2.5"
      data-testid="first-day"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 id="first-day" className="text-sm font-black text-foreground">
            {t("homes.firstDay.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("homes.firstDay.progress", { done, n: steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(FIRST_DAY_DISMISSED_KEY, "1");
            } catch {
              /* يُخفى لهذه الجلسة */
            }
            setHidden(true);
          }}
          aria-label={t("homes.firstDay.hide")}
          className="w-11 h-11 -m-2 rounded-xl flex items-center justify-center text-muted-foreground"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div
        className="h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label={t("homes.firstDay.title")}
      >
        <div
          className="h-full bg-primary rounded-full"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.key} data-step={s.key} data-done={s.done}>
            <Link
              to={s.to}
              className={`min-h-11 flex items-center gap-2 rounded-xl px-2 text-xs ${
                s === next ? "bg-primary/10 font-bold text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span className={`flex-1 ${s.done ? "line-through" : ""}`}>
                {t(`homes.firstDay.steps.${s.key}`)}
              </span>
              {s === next && (
                <span className="text-primary font-bold shrink-0">{t("homes.firstDay.go")}</span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** التحدي الجاري في حلقة الطالب (1.19.0): تقدّم الحلقة كلها وما بقي من أيامه، ويفتح صفحة الإنجازات. */
export function ActiveChallengeCard({ c, today }: { c: ActiveChallenge; today: string }) {
  const t = useT();
  const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100));
  const daysLeft = Math.max(
    0,
    Math.round(
      (Date.parse(`${c.ends_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
    ),
  );
  return (
    <Link
      to="/achievements"
      className="block glass-strong rounded-3xl p-4 space-y-2"
      data-testid="active-challenge"
    >
      <span className="flex items-center gap-2 text-sm font-black text-foreground">
        <Trophy className="w-4 h-4 text-gold-ink shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{c.title}</span>
        <span className="text-xs font-bold text-muted-foreground shrink-0">
          {daysLeft === 0
            ? t("homes.challenge.lastDay")
            : t("homes.challenge.daysLeft", { n: daysLeft })}
        </span>
      </span>
      <span
        className="block h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={c.title}
      >
        <span className="block h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
      </span>
      <span className="block text-xs text-muted-foreground">
        {t(c.kind === "khatma" ? "homes.challenge.parts" : "homes.challenge.pages", {
          done: c.progress,
          n: c.target,
        })}
      </span>
    </Link>
  );
}
