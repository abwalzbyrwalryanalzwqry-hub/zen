import { useMemo, useState } from "react";
import { Check, Eye, EyeOff, Headphones, Loader2, Minus, Plus } from "lucide-react";
import { useSurahText } from "@/hooks/quran/use-surah-text";
import { useRecitationPlayer } from "@/hooks/quran/recitation-host";
import { toArabicDigits } from "@/lib/quran";
import {
  MEMORIZE_LEVELS,
  displayOf,
  maskAyah,
  nextLevel,
  repetitionPlan,
  stepLabel,
  type MemorizeLevel,
} from "@/lib/quran/memorize";
import { stripBasmala } from "@/lib/quran/basmala";
import { markMastered } from "@/lib/quran/memorize-api";
import { t } from "@/lib/i18n";

/**
 * وضع الحفظ التدريجي (8.1): إخفاء متدرّج للنص العثماني بلا تغيير فيه، وكشف الكلمة باللمس،
 * وتكرار الصوت بجدول «كل آية N مرات ثم الربط»، و«أتقنتُها» عبر apply_review.
 */
export function MemorizeMode({
  surah,
  from,
  to,
  userId,
  canSave,
}: {
  surah: number;
  from: number;
  to: number;
  userId: string | null;
  canSave: boolean;
}) {
  const text = useSurahText(surah);
  const player = useRecitationPlayer();
  const [level, setLevel] = useState<MemorizeLevel>(1);
  const [times, setTimes] = useState(3);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ayahs = useMemo(
    () => (text.data ? text.data.ayahs.filter((a) => a.n >= from && a.n <= to) : []),
    [text.data, from, to],
  );
  const plan = useMemo(() => repetitionPlan(from, to, times), [from, to, times]);
  // تغيّر المدى أو عدد التكرار يبني جدولاً جديداً: نبدأ من خطوته الأولى ونخفي ما كُشف.
  const rangeKey = `${surah}:${from}:${to}`;
  const [prev, setPrev] = useState({ rangeKey, times });
  if (prev.rangeKey !== rangeKey || prev.times !== times) {
    if (prev.rangeKey !== rangeKey) setRevealed(new Set());
    setPrev({ rangeKey, times });
    setStep(0);
  }
  const current = plan[Math.min(step, plan.length - 1)];

  const changeLevel = (l: MemorizeLevel) => {
    setLevel(l);
    setRevealed(new Set());
  };
  const toggleWord = (key: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const save = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await markMastered(userId, surah, from, to);
      setMsg({
        ok: true,
        text:
          r && r.queued
            ? t("review.queued")
            : r?.due_date
              ? `أُضيف إلى المراجعة. موعدها ${r.due_date}.`
              : "أُضيف إلى المراجعة.",
      });
      changeLevel(nextLevel(level, true));
    } catch {
      setMsg({ ok: false, text: "تعذّر الحفظ. تحقّق من الاتصال ثم أعد المحاولة." });
    } finally {
      setSaving(false);
    }
  };

  if (text.status === "loading")
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  if (text.status === "error")
    return <p className="text-center text-sm text-destructive py-10">تعذّر تحميل النص.</p>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="glass rounded-3xl p-3 space-y-2" role="radiogroup" aria-label="مستوى الإخفاء">
        <div className="grid grid-cols-5 gap-1">
          {MEMORIZE_LEVELS.map((l) => (
            <button
              key={l.level}
              role="radio"
              aria-checked={level === l.level}
              aria-label={l.label}
              onClick={() => changeLevel(l.level)}
              className={`min-h-11 rounded-xl py-2 text-sm font-bold tabular-nums ${level === l.level ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground"}`}
            >
              {toArabicDigits(l.level)}
            </button>
          ))}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground text-center">
          {MEMORIZE_LEVELS[level].label}، المس الكلمة المخفية لكشفها
        </p>
      </div>

      <section
        aria-label="نص الحفظ"
        className="rounded-3xl border border-gold/20 bg-card/70 p-4 font-quran text-[1.25rem] leading-[2.4] text-center"
      >
        {ayahs.map((a) => (
          <span key={a.n} data-ayah={a.n}>
            {maskAyah(stripBasmala(surah, a.n, a.t), level).map((seg, i) => {
              if (seg.kind === "space") return seg.text;
              const key = `${a.n}:${i}`;
              const shown = displayOf(seg, level, revealed.has(key));
              if (!seg.hidden) return <span key={key}>{seg.text}</span>;
              return (
                <button
                  key={key}
                  onClick={() => toggleWord(key)}
                  aria-label={revealed.has(key) ? "إخفاء الكلمة" : "كشف الكلمة"}
                  data-hidden-word={revealed.has(key) ? undefined : true}
                  className={`inline rounded-md px-0.5 ${revealed.has(key) ? "text-primary" : "bg-muted/80 text-muted-foreground"}`}
                >
                  {shown ?? (
                    <span className="invisible" aria-hidden="true">
                      {seg.text}
                    </span>
                  )}
                </button>
              );
            })}{" "}
            <span className="text-gold text-base">﴿{toArabicDigits(a.n)}﴾</span>{" "}
          </span>
        ))}
      </section>

      <div className="glass rounded-3xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold">التكرار لكل آية</span>
          <div className="flex items-center gap-2">
            <button
              aria-label="أقل"
              onClick={() => setTimes((t) => Math.max(1, t - 1))}
              className="min-h-11 min-w-11 rounded-xl glass flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center tabular-nums" aria-live="polite">
              {toArabicDigits(times)}
            </span>
            <button
              aria-label="أكثر"
              onClick={() => setTimes((t) => Math.min(20, t + 1))}
              className="min-h-11 min-w-11 rounded-xl glass flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <ol className="flex flex-wrap gap-1.5" aria-label="جدول التكرار">
          {plan.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={`min-h-11 rounded-full px-3 text-xs ${i === step ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground"}`}
              >
                {stepLabel(s)}
              </button>
            </li>
          ))}
        </ol>
        {current && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => player.playRange(surah, current.from, current.to, current.times)}
              className="rounded-2xl bg-primary text-primary-foreground py-2.5 text-sm font-bold flex items-center justify-center gap-2"
            >
              <Headphones className="w-4 h-4" /> استمع: {stepLabel(current)}
            </button>
            <button
              onClick={() => setStep((s) => Math.min(plan.length - 1, s + 1))}
              disabled={step >= plan.length - 1}
              className="rounded-2xl glass py-2.5 text-sm font-bold disabled:opacity-50"
            >
              الخطوة التالية
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => changeLevel(nextLevel(level, false))}
          className="rounded-2xl glass py-3 text-sm font-bold flex items-center justify-center gap-2"
        >
          <Eye className="w-4 h-4" /> تعثّرت: أظهر أكثر
        </button>
        <button
          onClick={() => changeLevel(nextLevel(level, true))}
          className="rounded-2xl glass py-3 text-sm font-bold flex items-center justify-center gap-2"
        >
          <EyeOff className="w-4 h-4" /> أخفِ أكثر
        </button>
      </div>
      <button
        onClick={() => void save()}
        disabled={!canSave || saving}
        className="w-full rounded-2xl gradient-primary text-primary-foreground py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        أتقنتُها — أضفها إلى المراجعة
      </button>
      {!canSave && (
        <p className="text-[0.6875rem] text-muted-foreground text-center">
          الإضافة إلى المراجعة تحتاج حساباً. الحفظ نفسه يعمل بلا حساب وبلا اتصال.
        </p>
      )}
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`text-xs text-center ${msg.ok ? "text-primary" : "text-destructive"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
