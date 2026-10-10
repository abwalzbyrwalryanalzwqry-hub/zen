import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BuildProblems, NumberField, SurahPicker } from "@/components/zen/exam/NewExamParts";
import { useSession } from "@/hooks/useSession";
import { buildScope, type ScopeInput, surahName, surahAyahCount } from "@/lib/exam/scope";
import { buildExam } from "@/lib/exam/engine";
import { pushExam, saveActiveExam } from "@/lib/exam/storage";
import { listWeakSpots } from "@/lib/exam/storage";
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  MAX_QUESTIONS,
  newAttempt,
  type Difficulty,
  type ExamBlueprint,
  type QuestionType,
  type TypeSelection,
} from "@/lib/exam/types";
import { newSeed } from "@/lib/exam/random";

export const Route = createFileRoute("/_authed/exams/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    weak: search.weak === "1" ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "اختبار جديد — Zen" },
      {
        name: "description",
        content: "حدّد نطاق الاختبار بأسماء السور وآياتها، واختر أنواع الأسئلة ومستوى الصعوبة.",
      },
    ],
  }),
  component: NewExamScreen,
});

type ScopeKind = "surah" | "juz" | "surah-range" | "custom";

const SCOPE_KIND_LABEL: Record<ScopeKind, string> = {
  surah: "سورة وآيات",
  juz: "من جزء إلى جزء",
  "surah-range": "من سورة إلى سورة",
  custom: "نطاق مخصص",
};

const COUNT_PRESETS = [5, 10, 15, 20, 30, 50] as const;

type CustomSegment = { surah: number; fromAyah: number; toAyah: number };

function NewExamScreen() {
  const navigate = useNavigate();
  const { userId, guest } = useSession();
  const { weak } = Route.useSearch();

  const [kind, setKind] = useState<ScopeKind>("surah");
  const [surah, setSurah] = useState(18);
  const [fromAyah, setFromAyah] = useState(1);
  const [toAyah, setToAyah] = useState(20);
  const [fromJuz, setFromJuz] = useState(1);
  const [toJuz, setToJuz] = useState(1);
  const [fromSurah, setFromSurah] = useState(78);
  const [toSurah, setToSurah] = useState(114);
  const [segments, setSegments] = useState<CustomSegment[]>([]);
  const [draft, setDraft] = useState<CustomSegment>({ surah: 2, fromAyah: 1, toAyah: 10 });

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(10);
  const [typeMode, setTypeMode] = useState<TypeSelection["kind"]>("varied");
  const [chosenTypes, setChosenTypes] = useState<QuestionType[]>(["complete_ayah", "next_ayah"]);
  const [mode, setMode] = useState<"exam" | "practice">("exam");
  const [timerMode, setTimerMode] = useState<"none" | "per_question" | "total">("none");
  const [timerSeconds, setTimerSeconds] = useState(60);

  const [building, setBuilding] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // «اختبرني في نقاط ضعفي»: يُبنى نطاق مخصص من مواضع الخطأ المسجّلة.
  useEffect(() => {
    if (weak !== "1" || !userId) return;
    let cancelled = false;
    listWeakSpots(userId, 12)
      .then((spots) => {
        if (cancelled || !spots.length) return;
        setKind("custom");
        setSegments(
          spots.map((s) => ({ surah: s.surah_number, fromAyah: s.from_ayah, toAyah: s.to_ayah })),
        );
      })
      .catch(() => {
        /* الشاشة تعمل بنطاق يدوي */
      });
    return () => {
      cancelled = true;
    };
  }, [weak, userId]);

  const scopeInput = useMemo<ScopeInput>(() => {
    switch (kind) {
      case "surah":
        return { kind: "surah", surah, fromAyah, toAyah };
      case "juz":
        return { kind: "juz", fromJuz, toJuz };
      case "surah-range":
        return { kind: "surah-range", fromSurah, toSurah };
      case "custom":
        return { kind: "custom", segments };
    }
  }, [kind, surah, fromAyah, toAyah, fromJuz, toJuz, fromSurah, toSurah, segments]);

  // معاينة النطاق تُحدَّث مع كل تغيير: الرقم لا يظهر إلا لترقيم الآيات.
  const preview = useMemo(() => buildScope(scopeInput), [scopeInput]);
  const maxCount = preview.ok
    ? Math.min(MAX_QUESTIONS, preview.scope.ayahCount * 2)
    : MAX_QUESTIONS;

  async function start() {
    if (!preview.ok) return;
    setBuilding(true);
    setProblems([]);
    setSuggestions([]);

    const blueprint: ExamBlueprint = {
      scopeInput,
      questionCount: Math.min(count, maxCount),
      types:
        typeMode === "single"
          ? { kind: "single", types: [chosenTypes[0] ?? "complete_ayah"] }
          : typeMode === "multiple"
            ? { kind: "multiple", types: chosenTypes.length ? chosenTypes : ["complete_ayah"] }
            : { kind: typeMode },
      difficulty,
      mode,
      timer:
        timerMode === "none"
          ? { mode: "none", seconds: null }
          : { mode: timerMode, seconds: timerSeconds },
      allowRepeats: false,
      seed: newSeed(),
    };

    try {
      const outcome = await buildExam(blueprint);
      if (!outcome.ok) {
        setProblems(outcome.problems);
        setSuggestions(outcome.suggestions);
        return;
      }
      const attempt = newAttempt(outcome.snapshot);
      const remote = userId && !guest ? await pushExam(outcome.snapshot, attempt, userId) : null;
      saveActiveExam({
        snapshot: outcome.snapshot,
        attempt: remote ? { ...attempt, id: remote.attemptId, examId: remote.examId } : attempt,
        synced: !!remote,
      });
      await navigate({ to: "/exams/run" });
    } catch (error) {
      setProblems([error instanceof Error ? error.message : "تعذّر بناء الاختبار. أعد المحاولة."]);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">اختبار جديد</h1>
            <p className="text-[0.6875rem] text-muted-foreground">الأسئلة لا تخرج عن نطاقك أبداً</p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/exams" })}
            aria-label="رجوع إلى الاختبارات"
            className="w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {/* ───── نوع النطاق ───── */}
          <section className="glass rounded-3xl p-4 space-y-3">
            <h2 className="text-xs font-bold text-foreground">النطاق</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SCOPE_KIND_LABEL) as ScopeKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-2xl px-3 py-2 text-[0.6875rem] font-bold transition ${
                    kind === k
                      ? "bg-primary text-primary-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {SCOPE_KIND_LABEL[k]}
                </button>
              ))}
            </div>

            {kind === "surah" && (
              <div className="space-y-2">
                <SurahPicker label="السورة" value={surah} onChange={setSurah} />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="من الآية"
                    value={fromAyah}
                    min={1}
                    max={surahAyahCount(surah)}
                    onChange={setFromAyah}
                  />
                  <NumberField
                    label="إلى الآية"
                    value={toAyah}
                    min={1}
                    max={surahAyahCount(surah)}
                    onChange={setToAyah}
                  />
                </div>
              </div>
            )}

            {kind === "juz" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="من الجزء"
                  value={fromJuz}
                  min={1}
                  max={30}
                  onChange={setFromJuz}
                />
                <NumberField label="إلى الجزء" value={toJuz} min={1} max={30} onChange={setToJuz} />
              </div>
            )}

            {kind === "surah-range" && (
              <div className="space-y-2">
                <SurahPicker label="من سورة" value={fromSurah} onChange={setFromSurah} />
                <SurahPicker label="إلى سورة" value={toSurah} onChange={setToSurah} />
              </div>
            )}

            {kind === "custom" && (
              <div className="space-y-2">
                {segments.map((seg, i) => (
                  <div
                    key={`${seg.surah}-${seg.fromAyah}-${seg.toAyah}-${i}`}
                    className="flex items-center gap-2 glass-strong rounded-2xl px-3 py-2"
                  >
                    <span className="flex-1 text-[0.6875rem] text-foreground">
                      سورة {surahName(seg.surah)} · الآيات {seg.fromAyah}–{seg.toAyah}
                    </span>
                    <button
                      type="button"
                      aria-label={`حذف مقطع سورة ${surahName(seg.surah)}`}
                      onClick={() => setSegments(segments.filter((_, idx) => idx !== i))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="space-y-2 rounded-2xl glass-strong p-3">
                  <SurahPicker
                    label="أضف مقطعاً"
                    value={draft.surah}
                    onChange={(v) => setDraft({ ...draft, surah: v })}
                  />
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <NumberField
                      label="من"
                      value={draft.fromAyah}
                      min={1}
                      max={surahAyahCount(draft.surah)}
                      onChange={(v) => setDraft({ ...draft, fromAyah: v })}
                    />
                    <NumberField
                      label="إلى"
                      value={draft.toAyah}
                      min={1}
                      max={surahAyahCount(draft.surah)}
                      onChange={(v) => setDraft({ ...draft, toAyah: v })}
                    />
                    <button
                      type="button"
                      onClick={() => setSegments([...segments, draft])}
                      className="rounded-xl bg-primary text-primary-foreground py-2 text-[0.6875rem] font-bold flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`rounded-2xl px-3 py-2 text-[0.6875rem] ${
                preview.ok ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"
              }`}
              aria-live="polite"
            >
              {preview.ok ? preview.scope.label : preview.errors.map((e) => e.message).join(" · ")}
            </div>
          </section>

          {/* ───── الإعدادات ───── */}
          <section className="glass rounded-3xl p-4 space-y-3">
            <h2 className="text-xs font-bold text-foreground">عدد الأسئلة</h2>
            <div className="flex flex-wrap gap-2">
              {COUNT_PRESETS.filter((c) => c <= maxCount).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCount(c)}
                  aria-pressed={count === c}
                  className={`rounded-full px-4 py-1.5 text-[0.6875rem] font-bold ${
                    count === c
                      ? "bg-primary text-primary-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
              <NumberField
                label="مخصص"
                value={count}
                min={1}
                max={maxCount}
                onChange={setCount}
                compact
              />
            </div>

            <h2 className="text-xs font-bold text-foreground pt-1">مستوى الصعوبة</h2>
            <div className="grid grid-cols-4 gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  aria-pressed={difficulty === d}
                  className={`rounded-2xl py-2 text-[0.6875rem] font-bold ${
                    difficulty === d
                      ? "bg-gold text-gold-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>

            <h2 className="text-xs font-bold text-foreground pt-1">أنواع الأسئلة</h2>
            <div className="grid grid-cols-4 gap-2">
              {(["varied", "random", "multiple", "single"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTypeMode(m)}
                  aria-pressed={typeMode === m}
                  className={`rounded-2xl py-2 text-[0.625rem] font-bold ${
                    typeMode === m
                      ? "bg-primary text-primary-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {m === "varied"
                    ? "متنوّع"
                    : m === "random"
                      ? "عشوائي"
                      : m === "multiple"
                        ? "متعدّد"
                        : "محدّد"}
                </button>
              ))}
            </div>

            {(typeMode === "multiple" || typeMode === "single") && (
              <div className="flex flex-wrap gap-1.5">
                {QUESTION_TYPES.map((t) => {
                  const on = chosenTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosenTypes(
                          typeMode === "single"
                            ? [t]
                            : on
                              ? chosenTypes.filter((x) => x !== t)
                              : [...chosenTypes, t],
                        )
                      }
                      className={`rounded-full px-3 py-1 text-[0.625rem] ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "glass-strong text-muted-foreground"
                      }`}
                    >
                      {QUESTION_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            )}

            <h2 className="text-xs font-bold text-foreground pt-1">النمط والوقت</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["exam", "practice"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-2xl py-2 text-[0.6875rem] font-bold ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {m === "exam" ? "اختبار" : "تدريب (تصحيح فوري)"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["none", "per_question", "total"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimerMode(t)}
                  aria-pressed={timerMode === t}
                  className={`rounded-2xl py-2 text-[0.625rem] font-bold ${
                    timerMode === t
                      ? "bg-gold text-gold-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {t === "none" ? "بلا مؤقّت" : t === "per_question" ? "لكل سؤال" : "للاختبار كلّه"}
                </button>
              ))}
            </div>
            {timerMode !== "none" && (
              <NumberField
                label={timerMode === "per_question" ? "ثوانٍ لكل سؤال" : "ثوانٍ للاختبار"}
                value={timerSeconds}
                min={10}
                max={7200}
                onChange={setTimerSeconds}
              />
            )}
          </section>

          <BuildProblems problems={problems} suggestions={suggestions} />

          <button
            type="button"
            onClick={start}
            disabled={!preview.ok || building}
            className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {building && <Loader2 className="w-4 h-4 animate-spin" />}
            {building ? "جارٍ بناء الأسئلة…" : "ابدأ الاختبار"}
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
