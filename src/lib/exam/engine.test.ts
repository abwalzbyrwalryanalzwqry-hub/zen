import { describe, expect, it, beforeAll } from "vitest";
import { loadQuranCorpus, type QuranCorpus } from "./corpus";
import { buildExam, gradeAttempt, gradeQuestion, resolveTypes } from "./engine";
import { isInScope, type ScopeInput } from "./scope";
import { normalizeArabic } from "./text";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  type Difficulty,
  type ExamAttempt,
  type ExamBlueprint,
  type ExamSnapshot,
  type QuestionType,
} from "./types";

let corpus: QuranCorpus;

beforeAll(async () => {
  corpus = await loadQuranCorpus();
});

function blueprint(overrides: Partial<ExamBlueprint> = {}): ExamBlueprint {
  return {
    scopeInput: { kind: "surah", surah: 18, fromAyah: 1, toAyah: 40 },
    questionCount: 10,
    types: { kind: "varied" },
    difficulty: "medium",
    mode: "exam",
    timer: { mode: "none", seconds: null },
    allowRepeats: false,
    seed: "seed-thabit",
    ...overrides,
  };
}

function emptyAttempt(snapshot: ExamSnapshot): ExamAttempt {
  return {
    id: "attempt-1",
    examId: snapshot.id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "in_progress",
    currentIndex: 0,
    answers: {},
  };
}

/** يجيب إجابات صحيحة على كل الأسئلة (لاختبار التصحيح). */
function perfectAttempt(snapshot: ExamSnapshot): ExamAttempt {
  const attempt = emptyAttempt(snapshot);
  for (const q of snapshot.questions) {
    attempt.answers[q.id] = {
      questionId: q.id,
      value: q.correct,
      flagged: false,
      seconds: 5,
      answeredAt: new Date().toISOString(),
    };
  }
  return attempt;
}

describe("بناء الاختبار", () => {
  it("يُنتج العدد المطلوب من الأسئلة مع لقطة مجمَّدة", async () => {
    const outcome = await buildExam(blueprint());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot.questions).toHaveLength(10);
    expect(Object.isFrozen(outcome.snapshot)).toBe(true);
    expect(Object.isFrozen(outcome.snapshot.questions)).toBe(true);
    expect(outcome.snapshot.corpus.sha256).toBe(corpus.sha256);
    expect(outcome.report.passed).toBe(true);
  });

  it("نفس البذرة تُنتج نفس الاختبار حرفياً، وبذرة أخرى تُنتج غيره", async () => {
    const a = await buildExam(blueprint({ seed: "بذرة-١" }));
    const b = await buildExam(blueprint({ seed: "بذرة-١" }));
    const c = await buildExam(blueprint({ seed: "بذرة-٢" }));
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;

    const fingerprint = (s: ExamSnapshot) =>
      s.questions.map((q) => `${q.type}|${q.validation.signature}|${q.correct}`).join("\n");
    expect(fingerprint(a.snapshot)).toBe(fingerprint(b.snapshot));
    expect(fingerprint(a.snapshot)).not.toBe(fingerprint(c.snapshot));
  });

  it("لا يتغيّر النطاق بعد البدء", async () => {
    const outcome = await buildExam(blueprint());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(() => {
      (outcome.snapshot.blueprint as { questionCount: number }).questionCount = 50;
    }).toThrow();
    expect(outcome.snapshot.blueprint.questionCount).toBe(10);
  });

  it("لا أسئلة مكرّرة داخل الاختبار", async () => {
    const outcome = await buildExam(
      blueprint({
        questionCount: 20,
        scopeInput: { kind: "surah", surah: 2, fromAyah: 1, toAyah: 120 },
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const signatures = outcome.snapshot.questions.map((q) => q.validation.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("قفل النطاق (Scope Lock) — الاختبار الحرج", () => {
  const scopes: { name: string; input: ScopeInput }[] = [
    { name: "سورة الكهف 1–20", input: { kind: "surah", surah: 18, fromAyah: 1, toAyah: 20 } },
    { name: "من الجزء 1 إلى 2", input: { kind: "juz", fromJuz: 1, toJuz: 2 } },
    { name: "من البقرة إلى النساء", input: { kind: "surah-range", fromSurah: 2, toSurah: 4 } },
    {
      name: "نطاق مخصص من ثلاث سور",
      input: {
        kind: "custom",
        segments: [
          { surah: 2, fromAyah: 1, toAyah: 20 },
          { surah: 3, fromAyah: 30, toAyah: 50 },
          { surah: 4, fromAyah: 1, toAyah: 10 },
        ],
      },
    },
  ];

  for (const scopeCase of scopes) {
    for (const difficulty of DIFFICULTIES) {
      it(`${scopeCase.name} · ${difficulty}: كل مرجع وخيار داخل النطاق`, async () => {
        const outcome = await buildExam(
          blueprint({
            scopeInput: scopeCase.input,
            difficulty,
            questionCount: 12,
            seed: `s-${difficulty}`,
          }),
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { scope, questions } = outcome.snapshot;
        expect(questions.length).toBeGreaterThan(0);

        for (const q of questions) {
          for (const ref of q.refs) {
            expect(
              isInScope(scope, ref.surah, ref.ayah),
              `${q.type}: مرجع ${ref.surah}:${ref.ayah} خارج ${scope.label}`,
            ).toBe(true);
          }
          for (const option of q.options) {
            if (!option.ref) continue;
            expect(
              isInScope(scope, option.ref.surah, option.ref.ayah),
              `${q.type}: خيار ${option.ref.surah}:${option.ref.ayah} خارج النطاق`,
            ).toBe(true);
          }
        }
      });
    }
  }

  it("الكهف 1–20: لا يظهر نص الآية 21 ولا أي آية بعدها في أي سؤال", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "surah", surah: 18, fromAyah: 1, toAyah: 20 },
        questionCount: 15,
        difficulty: "hard",
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // نصوص خارج النطاق يجب ألا تظهر مطلقاً.
    const outsideTexts = [
      ...corpus
        .surah(18)
        .slice(20)
        .map((a) => normalizeArabic(a.text)),
      normalizeArabic(corpus.ayah(19, 1)!.text),
      normalizeArabic(corpus.ayah(17, 1)!.text),
    ].filter((t) => t.split(" ").length >= 4);

    const shown = outcome.snapshot.questions
      .flatMap((q) => [q.passage ?? "", q.reference, ...q.options.map((o) => o.text)])
      .map((t) => normalizeArabic(t))
      .join(" \n ");

    for (const outside of outsideTexts) {
      // مقارنة على مقطع من أربع كلمات: تطابق أربع كلمات متتالية = تسريب فعلي.
      const chunk = outside.split(" ").slice(0, 4).join(" ");
      expect(shown.includes(chunk), `تسريب نص من خارج النطاق: ${chunk}`).toBe(false);
    }
  });

  it("أسماء السور خارج النطاق لا تظهر كخيارات", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: {
          kind: "custom",
          segments: [
            { surah: 18, fromAyah: 1, toAyah: 30 },
            { surah: 19, fromAyah: 1, toAyah: 30 },
            { surah: 20, fromAyah: 1, toAyah: 30 },
          ],
        },
        questionCount: 15,
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const allowed = new Set(["الكهف", "مريم", "طه"]);
    const forbidden = ["البقرة", "الأنبياء", "النور", "الفاتحة", "يس"];
    const text = outcome.snapshot.questions
      .flatMap((q) => [q.prompt, q.reference, ...q.options.map((o) => o.text)])
      .join(" ");
    for (const name of forbidden) {
      expect(text.includes(name), `اسم سورة من خارج النطاق ظهر: ${name}`).toBe(false);
    }
    expect([...allowed].some((name) => text.includes(name))).toBe(true);
  });
});

describe("المولّدات: كل نوع يُنتج سؤالاً صالحاً", () => {
  for (const type of QUESTION_TYPES) {
    it(`النوع ${type}`, async () => {
      // نطاق واسع + مستوى «متقن» يسمح بكل الأنواع.
      const outcome = await buildExam(
        blueprint({
          scopeInput: { kind: "surah-range", fromSurah: 2, toSurah: 7 },
          types: { kind: "single", types: [type as QuestionType] },
          difficulty: "mastery",
          questionCount: 3,
          seed: `gen-${type}`,
        }),
      );
      expect(
        outcome.ok,
        `تعذّر توليد ${type}: ${!outcome.ok ? outcome.problems.join(" · ") : ""}`,
      ).toBe(true);
      if (!outcome.ok) return;
      const produced = outcome.snapshot.questions.filter((q) => q.type === type);
      expect(produced.length).toBeGreaterThan(0);
      for (const q of produced) {
        expect(q.prompt.length).toBeGreaterThan(3);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        if (q.answerShape === "single_choice") {
          expect(q.options.some((o) => o.id === q.correct)).toBe(true);
        } else {
          expect(Array.isArray(q.correct)).toBe(true);
          expect((q.correct as string[]).length).toBe(q.options.length);
        }
        expect(q.reference).toMatch(/سورة|الصواب/);
        expect(q.reference).not.toMatch(/سورة\s+\d/);
      }
    });
  }

  it("«اكتشف الخطأ»: الإجابة الصحيحة نص محرَّف غير موجود في المصحف", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "surah-range", fromSurah: 2, toSurah: 5 },
        types: { kind: "single", types: ["spot_the_error"] },
        difficulty: "hard",
        questionCount: 5,
        seed: "spot",
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const all = corpus.ayahs.map((a) => a.normalized);
    for (const q of outcome.snapshot.questions) {
      const correct = q.options.find((o) => o.id === q.correct)!;
      const altered = normalizeArabic(correct.text);
      expect(all.some((t) => t.includes(altered))).toBe(false);
      // بقية الخيارات آيات صحيحة فعلاً.
      for (const other of q.options.filter((o) => o.id !== q.correct)) {
        expect(all.some((t) => t.includes(normalizeArabic(other.text)))).toBe(true);
      }
    }
  });

  it("المتشابهات: الخيارات مواضع مختلفة لنص متقارب", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "juz", fromJuz: 1, toJuz: 3 },
        types: { kind: "single", types: ["similar_ayah_place"] },
        difficulty: "hard",
        questionCount: 3,
        seed: "sim",
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const q of outcome.snapshot.questions) {
      expect(q.refs.length).toBeGreaterThanOrEqual(2);
      const refs = q.options.map((o) => `${o.ref!.surah}:${o.ref!.ayah}`);
      expect(new Set(refs).size).toBe(refs.length);
      expect(q.validation.distractorSimilarity).toBeGreaterThan(0.5);
    }
  });
});

describe("قواعد الصعوبة", () => {
  it("المستوى السهل لا يشمل المتشابهات ولا اكتشاف الخطأ", () => {
    const easy = resolveTypes(blueprint({ difficulty: "easy", types: { kind: "varied" } }));
    expect(easy).not.toContain("similar_ayah_place");
    expect(easy).not.toContain("spot_the_error");
    expect(easy).not.toContain("diff_two_ayahs");
    expect(easy).toContain("complete_ayah");
  });

  it("مستوى «متقن» يشمل كل الأنواع", () => {
    const mastery = resolveTypes(blueprint({ difficulty: "mastery", types: { kind: "varied" } }));
    expect(new Set(mastery)).toEqual(new Set(QUESTION_TYPES));
  });

  it("طلب نوع غير مسموح في المستوى يُستبدل بالأنواع المسموحة", () => {
    const types = resolveTypes(
      blueprint({ difficulty: "easy", types: { kind: "single", types: ["diff_two_ayahs"] } }),
    );
    expect(types).not.toContain("diff_two_ayahs");
    expect(types.length).toBeGreaterThan(0);
  });

  it("مشتتات «متقن» أقرب من مشتتات «سهل» في نفس النطاق", async () => {
    const scopeInput: ScopeInput = { kind: "surah", surah: 2, fromAyah: 1, toAyah: 140 };
    const easy = await buildExam(
      blueprint({
        scopeInput,
        difficulty: "easy",
        types: { kind: "single", types: ["next_ayah"] },
        questionCount: 8,
        seed: "d-easy",
      }),
    );
    const mastery = await buildExam(
      blueprint({
        scopeInput,
        difficulty: "mastery",
        types: { kind: "single", types: ["next_ayah"] },
        questionCount: 8,
        seed: "d-mastery",
      }),
    );
    expect(easy.ok && mastery.ok).toBe(true);
    if (!easy.ok || !mastery.ok) return;
    const avg = (s: ExamSnapshot) =>
      s.questions.reduce((sum, q) => sum + q.validation.distractorSimilarity, 0) /
      s.questions.length;
    expect(avg(mastery.snapshot)).toBeGreaterThan(avg(easy.snapshot));
  });
});

describe("بوابة الجودة", () => {
  it("ترفض 50 سؤالاً من نطاق ضيق وتقترح حلولاً بدل توليد أسئلة رديئة", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "surah", surah: 1, fromAyah: 1, toAyah: 7 },
        questionCount: 50,
        difficulty: "medium",
      }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.join(" ")).toContain("لا توفّر");
    expect(outcome.suggestions.length).toBeGreaterThan(0);
  });

  it("ترفض نطاقاً غير صالح قبل التوليد", async () => {
    const outcome = await buildExam(
      blueprint({ scopeInput: { kind: "surah", surah: 1, fromAyah: 1, toAyah: 50 } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("تقبل نطاقاً صغيراً مع عدد أسئلة يناسب حجمه", async () => {
    // الفاتحة سبع آيات قصيرة: ثلاثة أسئلة فريدة ممكنة، وطلب أكثر منها يُرفض.
    const ok = await buildExam(
      blueprint({
        scopeInput: { kind: "surah", surah: 1, fromAyah: 1, toAyah: 7 },
        questionCount: 3,
        difficulty: "easy",
        types: { kind: "multiple", types: ["complete_ayah", "next_ayah"] },
      }),
    );
    expect(ok.ok, !ok.ok ? ok.problems.join(" · ") : "").toBe(true);
    if (ok.ok) expect(ok.snapshot.questions).toHaveLength(3);

    const tooMany = await buildExam(
      blueprint({
        scopeInput: { kind: "surah", surah: 1, fromAyah: 1, toAyah: 7 },
        questionCount: 12,
        difficulty: "easy",
        types: { kind: "multiple", types: ["complete_ayah", "next_ayah"] },
      }),
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.problems.join(" ")).toContain("لا توفّر");
      expect(tooMany.suggestions.join(" ")).toContain("وسّع");
    }
  });
});

describe("التصحيح والنتائج", () => {
  it("الإجابات الصحيحة كلها ⇒ 100% ولا مواضع ضعف", async () => {
    const outcome = await buildExam(blueprint({ questionCount: 8 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = gradeAttempt(outcome.snapshot, perfectAttempt(outcome.snapshot));
    expect(result.percentage).toBe(100);
    expect(result.correctCount).toBe(8);
    expect(result.wrongCount).toBe(0);
    expect(result.weakSpots).toEqual([]);
  });

  it("عدم الإجابة ⇒ تخطي لا خطأ، والدرجة صفر", async () => {
    const outcome = await buildExam(blueprint({ questionCount: 5 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = gradeAttempt(outcome.snapshot, emptyAttempt(outcome.snapshot));
    expect(result.skippedCount).toBe(5);
    expect(result.wrongCount).toBe(0);
    expect(result.score).toBe(0);
    expect(result.mastery).toBe("weak");
  });

  it("ترتيب خاطئ يُصنَّف wrong_order لا wrong", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "surah", surah: 2, fromAyah: 1, toAyah: 60 },
        types: { kind: "single", types: ["order_ayahs"] },
        questionCount: 3,
        seed: "ord",
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const q = outcome.snapshot.questions[0]!;
    const reversed = [...(q.correct as string[])].reverse();
    const graded = gradeQuestion(q, {
      questionId: q.id,
      value: reversed,
      flagged: false,
      seconds: 3,
      answeredAt: null,
    });
    expect(graded.kind).toBe("wrong_order");
    expect(graded.earned).toBe(0);

    const partial = gradeQuestion(q, {
      questionId: q.id,
      value: (q.correct as string[]).slice(0, 1),
      flagged: false,
      seconds: 3,
      answeredAt: null,
    });
    expect(partial.kind).toBe("incomplete");
  });

  it("مواضع الخطأ تُستخرج من مصدر السؤال لا من المشتتات", async () => {
    const outcome = await buildExam(blueprint({ questionCount: 6 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const attempt = emptyAttempt(outcome.snapshot);
    const wrongQ = outcome.snapshot.questions[0]!;
    const wrongOption = wrongQ.options.find((o) => o.id !== wrongQ.correct)!;
    attempt.answers[wrongQ.id] = {
      questionId: wrongQ.id,
      value: wrongQ.answerShape === "ordering" ? [wrongOption.id] : wrongOption.id,
      flagged: false,
      seconds: 4,
      answeredAt: null,
    };
    const result = gradeAttempt(outcome.snapshot, attempt);
    expect(result.weakSpots.length).toBeGreaterThan(0);
    const spot = result.weakSpots[0]!;
    expect(spot.surahName).not.toMatch(/^\d+$/);
    expect(spot.surah).toBe(wrongQ.refs[0]!.surah);
  });

  it("نسبة 100% في مستوى سهل لا تُعطي وسم «متقن»", async () => {
    const outcome = await buildExam(
      blueprint({ difficulty: "easy", questionCount: 10, seed: "easy-perfect" }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = gradeAttempt(outcome.snapshot, perfectAttempt(outcome.snapshot));
    expect(result.percentage).toBe(100);
    expect(result.mastery).not.toBe("mastery");
    expect(result.masteryReasons.join(" ")).toContain("صعب");
  });

  it("نسبة 100% في مستوى متقن مع تنوّع ⇒ وسم «متقن»", async () => {
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "surah-range", fromSurah: 2, toSurah: 6 },
        difficulty: "mastery",
        questionCount: 12,
        seed: "mastery-perfect",
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = gradeAttempt(outcome.snapshot, perfectAttempt(outcome.snapshot));
    expect(result.percentage).toBe(100);
    expect(result.mastery).toBe("mastery");
  });

  it("تحليل الأخطاء يُصنَّف بعائلة السؤال وبمستوى الصعوبة", async () => {
    const outcome = await buildExam(blueprint({ questionCount: 10 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = gradeAttempt(outcome.snapshot, perfectAttempt(outcome.snapshot));
    expect(result.byFamily.length).toBeGreaterThan(0);
    expect(result.byFamily.every((f) => f.total > 0)).toBe(true);
    expect(result.byDifficulty.reduce((s, d) => s + d.total, 0)).toBe(10);
  });
});

describe("الأداء", () => {
  it("يبني 50 سؤالاً من نطاق كبير في وقت معقول", async () => {
    const started = Date.now();
    const outcome = await buildExam(
      blueprint({
        scopeInput: { kind: "juz", fromJuz: 1, toJuz: 5 },
        questionCount: 50,
        difficulty: "hard",
        seed: "perf",
      }),
    );
    const elapsed = Date.now() - started;
    expect(outcome.ok, !outcome.ok ? outcome.problems.join(" · ") : "").toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot.questions).toHaveLength(50);
    expect(elapsed).toBeLessThan(20_000);
  });
});

describe("الاختبار لا يحتاج شبكة", () => {
  it("بناء اختبار كامل دون أي نداء fetch", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      calls += 1;
      return original(...args);
    }) as typeof fetch;
    try {
      const outcome = await buildExam(blueprint({ questionCount: 6, seed: "offline" }));
      expect(outcome.ok).toBe(true);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("لا أرقام سور في واجهة السؤال", () => {
  it("كل النصوص المعروضة تستخدم أسماء السور", async () => {
    for (const difficulty of DIFFICULTIES as readonly Difficulty[]) {
      const outcome = await buildExam(
        blueprint({
          scopeInput: { kind: "surah-range", fromSurah: 2, toSurah: 6 },
          difficulty,
          questionCount: 10,
          seed: `names-${difficulty}`,
        }),
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      for (const q of outcome.snapshot.questions) {
        const shown = [q.prompt, q.reference, ...q.options.map((o) => o.text)].join(" ");
        expect(shown, `${q.type}: رقم سورة ظهر في الواجهة`).not.toMatch(/سورة\s+\d+/);
      }
    }
  });
});
