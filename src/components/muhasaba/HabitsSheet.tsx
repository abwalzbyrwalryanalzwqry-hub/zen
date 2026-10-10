import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Chip, Sheet } from "./parts";
import { activeHabits, moveHabit } from "@/lib/muhasaba/logic";
import { HABIT_PRESETS, WEEKDAY_SHORT, type Habit } from "@/lib/muhasaba/types";

// ترتيب الأيام في الواجهة يبدأ بالسبت.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

function DaysPicker({
  value,
  onChange,
}: {
  value: number[] | null;
  onChange: (d: number[] | null) => void;
}) {
  const set = new Set(value ?? [0, 1, 2, 3, 4, 5, 6]);
  const toggle = (d: number) => {
    const next = new Set(set);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    if (next.size === 0) return; // يوم واحد على الأقل
    onChange(next.size === 7 ? null : [...next].sort());
  };
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="أيام العادة">
      {WEEK_ORDER.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => toggle(d)}
          aria-pressed={set.has(d)}
          className={`min-h-8 min-w-11 px-2 rounded-xl text-[0.6875rem] font-semibold ${
            set.has(d) ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
          }`}
        >
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

function scheduleText(days: number[] | null): string {
  if (!days || days.length === 7) return "كل يوم";
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join("، ");
}

export function HabitsSheet({
  habits,
  onClose,
  onSave,
  onAdd,
}: {
  habits: Habit[];
  onClose: () => void;
  onSave: (changed: Habit[]) => void;
  onAdd: (h: { title: string; preset_key?: string | null; days?: number[] | null }) => void;
}) {
  const list = activeHabits(habits);
  const used = new Set(list.map((h) => h.preset_key));
  const [custom, setCustom] = useState("");
  const [customDays, setCustomDays] = useState<number[] | null>(null);
  const [daysOpen, setDaysOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    onAdd({ title: t, days: customDays });
    setCustom("");
    setCustomDays(null);
  };

  return (
    <Sheet title="طاعاتي" onClose={onClose}>
      <div className="space-y-4">
        <ul className="space-y-2" aria-label="عاداتي">
          {list.length === 0 && (
            <li className="text-[0.6875rem] text-muted-foreground">لم تضف عادات بعد.</li>
          )}
          {list.map((h, i) => (
            <li key={h.id} className="glass rounded-2xl p-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${h.paused ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    {h.title}
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground">
                    {h.paused ? "متوقفة مؤقتاً" : scheduleText(h.days)}
                  </p>
                </div>
                <IconBtn
                  label={`نقل ${h.title} لأعلى`}
                  disabled={i === 0}
                  onClick={() => onSave(moveHabit(habits, h.id, -1))}
                >
                  <ArrowUp className="w-4 h-4" />
                </IconBtn>
                <IconBtn
                  label={`نقل ${h.title} لأسفل`}
                  disabled={i === list.length - 1}
                  onClick={() => onSave(moveHabit(habits, h.id, 1))}
                >
                  <ArrowDown className="w-4 h-4" />
                </IconBtn>
                <IconBtn
                  label={`أيام ${h.title}`}
                  onClick={() => setDaysOpen(daysOpen === h.id ? null : h.id)}
                >
                  <CalendarDays className="w-4 h-4" />
                </IconBtn>
                <IconBtn
                  label={h.paused ? `استئناف ${h.title}` : `إيقاف ${h.title} مؤقتاً`}
                  onClick={() => onSave([{ ...h, paused: !h.paused }])}
                >
                  {h.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </IconBtn>
                <IconBtn label={`حذف ${h.title}`} onClick={() => setConfirmDelete(h.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </IconBtn>
              </div>
              {daysOpen === h.id && (
                <DaysPicker value={h.days} onChange={(d) => onSave([{ ...h, days: d }])} />
              )}
              {confirmDelete === h.id && (
                <div className="flex items-center gap-2 text-[0.6875rem]">
                  <span className="flex-1 text-muted-foreground">
                    تُحذف من الأيام القادمة ويبقى سجلّها السابق.
                  </span>
                  <button
                    onClick={() => {
                      onSave([{ ...h, archived_at: new Date().toISOString() }]);
                      setConfirmDelete(null);
                    }}
                    className="min-h-8 px-3 rounded-xl bg-destructive text-destructive-foreground font-semibold"
                  >
                    حذف
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="min-h-8 px-3 rounded-xl glass font-semibold"
                  >
                    تراجع
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {HABIT_PRESETS.some((p) => !used.has(p.key)) && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground">اقتراحات</p>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_PRESETS.filter((p) => !used.has(p.key)).map((p) => (
                <Chip
                  key={p.key}
                  active={false}
                  onClick={() => onAdd({ title: p.title, preset_key: p.key })}
                >
                  <Plus className="inline w-3 h-3 me-0.5 -mt-0.5" aria-hidden />
                  {p.title}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="habit-custom" className="text-xs font-bold text-muted-foreground">
            عادة من اختيارك
          </label>
          <div className="flex gap-2">
            <input
              id="habit-custom"
              value={custom}
              maxLength={40}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="مثال: صيام الإثنين"
              className="flex-1 min-w-0 glass rounded-2xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={addCustom}
              disabled={!custom.trim()}
              className="min-h-11 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              إضافة
            </button>
          </div>
          {custom.trim() && <DaysPicker value={customDays} onChange={setCustomDays} />}
        </div>
      </div>
    </Sheet>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      {children}
    </button>
  );
}
