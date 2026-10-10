// بطاقات «محاسبتي» للعهد وإغلاق اليوم (M5: من DayCards.tsx دون تغيير السلوك).

import { useState } from "react";
import { Check, Clock, Sparkles, Undo2 } from "lucide-react";
import {
  GOAL_RESULT_ECHO,
  GOAL_RESULT_LABEL,
  type FocusKey,
  type GoalResult,
  type MuhasabaDay,
} from "@/lib/muhasaba/types";
import { GOAL_MAX, suggestedPledge } from "@/lib/muhasaba/logic";
import { useT } from "@/lib/i18n";

// ─────────────────────── عهدي غداً ───────────────────────

export function PledgeCard({
  day,
  onCommit,
}: {
  day: MuhasabaDay;
  onCommit: (key: FocusKey | null, text: string) => void;
}) {
  const t = useT();
  const suggestion = suggestedPledge(day);
  const [editing, setEditing] = useState(!day.goal_text);
  const [text, setText] = useState(day.goal_text ?? "");
  const [key, setKey] = useState<FocusKey | null>(day.goal_key ?? null);

  if (day.goal_text && !editing) {
    return (
      <section
        className="glass rounded-3xl p-4 space-y-2 border border-gold/30"
        aria-labelledby="pledge-title"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden>🌙</span>
          <h2 id="pledge-title" className="flex-1 text-sm font-bold text-foreground">
            {t("muhasabaCards.pledgeTitle")}
          </h2>
          <button
            onClick={() => {
              setText(day.goal_text ?? "");
              setEditing(true);
            }}
            className="min-h-8 px-2 text-[0.6875rem] font-semibold text-primary"
          >
            {t("muhasabaCards.edit")}
          </button>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{day.goal_text}</p>
        <p className="text-[0.625rem] text-muted-foreground">{t("muhasabaCards.pledgeGentle")}</p>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl p-4 space-y-3" aria-labelledby="pledge-title">
      <div className="flex items-center gap-2">
        <span aria-hidden>🌙</span>
        <h2 id="pledge-title" className="flex-1 text-sm font-bold text-foreground">
          {t("muhasabaCards.pledgeTitle")}
        </h2>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">{t("muhasabaCards.pledgeHint")}</p>
      {suggestion && !text && (
        <button
          type="button"
          onClick={() => {
            setText(suggestion.text);
            setKey(suggestion.key);
          }}
          className="w-full text-start glass rounded-2xl px-3 py-2 text-xs text-foreground"
        >
          <Sparkles className="inline w-3 h-3 text-gold me-1 -mt-0.5" aria-hidden />
          {suggestion.text}
        </button>
      )}
      <label htmlFor="pledge-input" className="sr-only">
        {t("muhasabaCards.pledgeLabel")}
      </label>
      <input
        id="pledge-input"
        value={text}
        maxLength={GOAL_MAX}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value) setKey(null);
        }}
        placeholder={t("muhasabaCards.pledgePlaceholder")}
        className="w-full glass rounded-2xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onCommit(key, text);
            setEditing(false);
          }}
          className="flex-1 min-h-11 rounded-2xl bg-gold text-gold-foreground text-xs font-bold disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {t("muhasabaCards.commitPledge")}
        </button>
        {day.goal_text && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-11 px-4 rounded-2xl glass text-xs font-semibold"
          >
            {t("muhasabaCards.cancel")}
          </button>
        )}
      </div>
    </section>
  );
}

// ─────────────────────── عهد الأمس ───────────────────────

export function YesterdayPledgeCard({
  row,
  onRate,
}: {
  row: MuhasabaDay;
  onRate: (r: GoalResult) => void;
}) {
  const t = useT();
  return (
    <section
      className="glass rounded-3xl p-4 space-y-3 border border-gold/30"
      aria-labelledby="yp-title"
    >
      <div className="space-y-1">
        <h2 id="yp-title" className="text-sm font-bold text-foreground">
          {t("muhasabaCards.yesterdayTitle")}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">«{row.goal_text}»</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="yp-title">
        {(["kept", "partial", "not_yet"] as GoalResult[]).map((r) => {
          const on = row.goal_result === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onRate(r)}
              className={`min-h-10 rounded-2xl text-xs font-semibold transition-all active:scale-95 ${
                on
                  ? r === "kept"
                    ? "bg-primary text-primary-foreground"
                    : r === "partial"
                      ? "bg-gold text-gold-foreground"
                      : "bg-foreground/15 text-foreground ring-1 ring-foreground/30"
                  : "bg-muted/60 text-foreground"
              }`}
            >
              {on && <Check className="inline w-3 h-3 me-0.5 -mt-0.5" aria-hidden />}
              {GOAL_RESULT_LABEL[r]}
            </button>
          );
        })}
      </div>
      {row.goal_result && (
        <p className="text-[0.6875rem] text-muted-foreground anim-float-in">
          {GOAL_RESULT_ECHO[row.goal_result]}
        </p>
      )}
    </section>
  );
}

// ─────────────────────── إغلاق اليوم ───────────────────────

export function CloseDayBar({
  closed,
  onClose,
  onReopen,
}: {
  closed: boolean;
  onClose: () => void;
  onReopen: () => void;
}) {
  const t = useT();
  if (closed) {
    return (
      <div className="glass rounded-3xl p-4 flex items-center gap-3">
        <span className="text-lg" aria-hidden>
          🌙
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">{t("muhasabaCards.closedTitle")}</p>
          <p className="text-[0.6875rem] text-muted-foreground">{t("muhasabaCards.closedHint")}</p>
        </div>
        <button
          onClick={onReopen}
          className="min-h-9 px-3 rounded-xl glass text-[0.6875rem] font-semibold inline-flex items-center gap-1"
        >
          <Undo2 className="w-3 h-3" aria-hidden /> {t("muhasabaCards.reopen")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClose}
      className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] transition-all glow-primary"
    >
      {t("muhasabaCards.closeDay")}
    </button>
  );
}

export function PausedHint() {
  const t = useT();
  return (
    <p className="text-[0.625rem] text-muted-foreground px-2 inline-flex items-center gap-1">
      <Clock className="w-3 h-3" aria-hidden /> {t("muhasabaCards.autosave")}
    </p>
  );
}
