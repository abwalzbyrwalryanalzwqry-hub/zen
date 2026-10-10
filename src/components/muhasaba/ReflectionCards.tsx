// بطاقات «محاسبتي» للطاعات والمزاج وما تريد إصلاحه (M5: من DayCards.tsx دون تغيير السلوك).

import { useState } from "react";
import { CheckCircle2, Circle, Lock, Plus, Settings2 } from "lucide-react";
import { Chip, SectionTitle } from "./parts";
import {
  FOCUS_OPTIONS,
  MOODS,
  MOOD_ECHO,
  type FocusKey,
  type Habit,
  type MuhasabaDay,
} from "@/lib/muhasaba/types";
import { NOTE_MAX } from "@/lib/muhasaba/logic";
import { useT } from "@/lib/i18n";

// ─────────────────────── طاعاتي ───────────────────────

export function HabitsCard({
  habits,
  done,
  onToggle,
  onManage,
}: {
  habits: Habit[];
  done: string[];
  onToggle: (id: string) => void;
  onManage: () => void;
}) {
  const t = useT();
  return (
    <section className="space-y-2" aria-labelledby="habits-title">
      <SectionTitle
        action={
          <button
            onClick={onManage}
            className="min-h-8 px-2 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-primary"
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden /> {t("muhasabaCards.edit")}
          </button>
        }
      >
        <span id="habits-title">{t("muhasabaCards.habitsTitle")}</span>
      </SectionTitle>
      <div className="glass rounded-3xl p-3">
        {habits.length === 0 ? (
          <p className="text-[0.6875rem] text-muted-foreground px-1 py-2">
            {t("muhasabaCards.noHabits")}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {habits.map((h) => {
              const on = done.includes(h.id);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(h.id)}
                    aria-pressed={on}
                    className={`w-full min-h-12 rounded-2xl px-3 py-2 flex items-center gap-2 text-start transition-all active:scale-[0.97] ${
                      on ? "bg-primary/15 ring-1 ring-primary/40" : "bg-muted/50 hover:bg-muted"
                    }`}
                  >
                    {on ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Circle className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span
                      className={`text-xs font-semibold ${on ? "text-foreground" : "text-foreground/80"}`}
                    >
                      {h.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onManage}
          className="mt-2 w-full min-h-10 rounded-2xl border border-dashed border-primary/40 text-xs font-semibold text-primary inline-flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> {t("muhasabaCards.addHabit")}
        </button>
      </div>
    </section>
  );
}

// ─────────────────────── كيف كان يومك؟ ───────────────────────

export function MoodCard({
  day,
  onPick,
}: {
  day: MuhasabaDay;
  onPick: (m: MuhasabaDay["mood"] & string) => void;
}) {
  const t = useT();
  return (
    <section className="space-y-2" aria-labelledby="mood-title">
      <SectionTitle>
        <span id="mood-title">{t("muhasabaCards.moodTitle")}</span>
      </SectionTitle>
      <div className="glass rounded-3xl p-3 space-y-2">
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="mood-title">
          {MOODS.map((m) => {
            const on = day.mood === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(m.key)}
                className={`min-h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  on ? "bg-primary/15 ring-1 ring-primary/50" : "bg-muted/50 hover:bg-muted"
                }`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {m.emoji}
                </span>
                <span className="text-[0.6875rem] font-semibold text-foreground">{m.label}</span>
              </button>
            );
          })}
        </div>
        {day.mood && (
          <p className="text-[0.6875rem] text-muted-foreground px-1 anim-float-in">
            {MOOD_ECHO[day.mood]}
          </p>
        )}
      </div>
    </section>
  );
}

// ─────────────────────── ما تريد إصلاحه ───────────────────────

export function FocusCard({
  day,
  onToggle,
  onNote,
}: {
  day: MuhasabaDay;
  onToggle: (k: FocusKey) => void;
  onNote: (text: string) => void;
}) {
  const t = useT();
  const [noteOpen, setNoteOpen] = useState(!!day.note);
  return (
    <section className="space-y-2" aria-labelledby="focus-title">
      <SectionTitle>
        <span id="focus-title">{t("muhasabaCards.focusTitle")}</span>
      </SectionTitle>
      <div className="glass rounded-3xl p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_OPTIONS.map((f) => (
            <Chip key={f.key} active={day.focus.includes(f.key)} onClick={() => onToggle(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {noteOpen || day.focus.includes("other") ? (
          <div className="space-y-1">
            <label
              htmlFor="muhasaba-note"
              className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground"
            >
              <Lock className="w-3 h-3" aria-hidden /> {t("muhasabaCards.privateNoteLabel")}
            </label>
            <textarea
              id="muhasaba-note"
              defaultValue={day.note ?? ""}
              maxLength={NOTE_MAX}
              rows={2}
              onBlur={(e) => onNote(e.target.value)}
              placeholder={t("muhasabaCards.privateNotePlaceholder")}
              className="w-full glass rounded-2xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="min-h-8 text-[0.6875rem] font-semibold text-primary inline-flex items-center gap-1"
          >
            <Lock className="w-3 h-3" aria-hidden /> {t("muhasabaCards.addPrivateNote")}
          </button>
        )}
      </div>
    </section>
  );
}
