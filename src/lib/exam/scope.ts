/**
 * نطاق الاختبار (ExamScope) — القاعدة الحرجة في المحرّك.
 *
 * كل سؤال وكل إجابة وكل مشتّت وكل مرجع يجب أن يكون داخل النطاق الذي اختاره
 * المستخدم. النطاق يُبنى مرّة، يُتحقَّق منه، ثم يُجمَّد داخل لقطة الاختبار
 * (`Object.freeze`) فلا يتغيّر بعد البدء.
 *
 * أنواعه أربعة: سورة بنطاق آيات، مدى أجزاء، مدى سور، ونطاق مخصص من عدة مقاطع.
 * كلها تُحوَّل إلى الشكل الداخلي الواحد: قائمة مقاطع `ScopeSegment` مرتّبة
 * وغير متداخلة — وهو ما تعتمده كل الطبقات التالية.
 */

import { SURAHS } from "@/lib/quran-meta";

/** مقطع قرآني متصل داخل سورة واحدة (المرجع الداخلي الوحيد). */
export type ScopeSegment = {
  surah: number;
  fromAyah: number;
  toAyah: number;
};

export type SurahScopeInput = {
  kind: "surah";
  surah: number;
  fromAyah: number;
  toAyah: number;
};

export type JuzScopeInput = {
  kind: "juz";
  fromJuz: number;
  toJuz: number;
};

export type SurahRangeScopeInput = {
  kind: "surah-range";
  fromSurah: number;
  toSurah: number;
};

export type CustomScopeInput = {
  kind: "custom";
  segments: ScopeSegment[];
};

export type ScopeInput = SurahScopeInput | JuzScopeInput | SurahRangeScopeInput | CustomScopeInput;

export type ExamScope = {
  readonly kind: ScopeInput["kind"];
  /** الشكل الداخلي الموحّد: مقاطع مرتّبة غير متداخلة. */
  readonly segments: readonly ScopeSegment[];
  /** عدد الآيات داخل النطاق. */
  readonly ayahCount: number;
  /** وصف عربي يُعرض للمستخدم — بأسماء السور لا أرقامها. */
  readonly label: string;
  /** المُدخل الأصلي كما اختاره المستخدم (للعرض وإعادة البناء). */
  readonly input: ScopeInput;
};

export type ScopeError = {
  code:
    | "EMPTY"
    | "UNKNOWN_SURAH"
    | "AYAH_OUT_OF_RANGE"
    | "REVERSED_AYAH"
    | "REVERSED_SURAH"
    | "UNKNOWN_JUZ"
    | "REVERSED_JUZ"
    | "TOO_SMALL";
  message: string;
};

export type ScopeResult = { ok: true; scope: ExamScope } | { ok: false; errors: ScopeError[] };

/** أقل عدد آيات يسمح ببناء اختبار ذي معنى. */
export const MIN_SCOPE_AYAHS = 3;

/** أسماء السور بالترتيب — للاختيار في الواجهة بالاسم لا بالرقم. */
export const SURAH_NAMES: readonly string[] = SURAHS.map((s) => s.name);

export function surahName(surah: number): string {
  return SURAHS.find((s) => s.n === surah)?.name ?? "";
}

export function surahAyahCount(surah: number): number {
  return SURAHS.find((s) => s.n === surah)?.ayahs ?? 0;
}

/** بداية كل جزء [سورة، آية] — من ملف البيانات المرجعي. */
let juzStartsCache: ReadonlyArray<readonly [number, number]> | null = null;

export function setJuzStarts(starts: ReadonlyArray<readonly [number, number]>): void {
  juzStartsCache = starts;
}

function juzStarts(): ReadonlyArray<readonly [number, number]> {
  if (!juzStartsCache) {
    throw new Error("بداية الأجزاء غير محمّلة — استدعِ loadQuranCorpus أولاً.");
  }
  return juzStartsCache;
}

/** يحوّل مدى أجزاء إلى مقاطع سور دقيقة. */
function juzRangeToSegments(fromJuz: number, toJuz: number): ScopeSegment[] {
  const starts = juzStarts();
  const start = starts[fromJuz - 1]!;
  const afterEnd = toJuz >= 30 ? null : starts[toJuz]!;
  const segments: ScopeSegment[] = [];

  const lastSurah = afterEnd ? afterEnd[0] : 114;
  for (let surah = start[0]; surah <= lastSurah; surah += 1) {
    const total = surahAyahCount(surah);
    const from = surah === start[0] ? start[1] : 1;
    let to = total;
    if (afterEnd && surah === afterEnd[0]) {
      // الآية الأولى من الجزء التالي ليست داخل النطاق.
      to = afterEnd[1] - 1;
    }
    if (to >= from && to >= 1) segments.push({ surah, fromAyah: from, toAyah: to });
  }
  return segments;
}

/** يدمج المقاطع المتداخلة أو المتلاصقة ويرتّبها بترتيب المصحف. */
export function normalizeSegments(segments: readonly ScopeSegment[]): ScopeSegment[] {
  const sorted = [...segments].sort((a, b) =>
    a.surah === b.surah ? a.fromAyah - b.fromAyah : a.surah - b.surah,
  );
  const out: ScopeSegment[] = [];
  for (const seg of sorted) {
    const last = out[out.length - 1];
    if (last && last.surah === seg.surah && seg.fromAyah <= last.toAyah + 1) {
      last.toAyah = Math.max(last.toAyah, seg.toAyah);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

function countAyahs(segments: readonly ScopeSegment[]): number {
  return segments.reduce((sum, s) => sum + (s.toAyah - s.fromAyah + 1), 0);
}

function describe(input: ScopeInput, segments: readonly ScopeSegment[], count: number): string {
  switch (input.kind) {
    case "surah": {
      const name = surahName(input.surah);
      const whole = input.fromAyah === 1 && input.toAyah === surahAyahCount(input.surah);
      return whole
        ? `سورة ${name} كاملة · ${count} آية`
        : `سورة ${name} · الآيات ${input.fromAyah}–${input.toAyah} · ${count} آية`;
    }
    case "juz":
      return input.fromJuz === input.toJuz
        ? `الجزء ${input.fromJuz} · ${count} آية`
        : `من الجزء ${input.fromJuz} إلى الجزء ${input.toJuz} · ${count} آية`;
    case "surah-range":
      return input.fromSurah === input.toSurah
        ? `سورة ${surahName(input.fromSurah)} · ${count} آية`
        : `من سورة ${surahName(input.fromSurah)} إلى سورة ${surahName(input.toSurah)} · ${count} آية`;
    case "custom":
      return `نطاق مخصص — ${segments.length} ${segments.length === 1 ? "مقطع" : "مقاطع"} · ${count} آية`;
  }
}

/** وصف مقطع واحد للعرض (باسم السورة). */
export function segmentLabel(seg: ScopeSegment): string {
  const name = surahName(seg.surah);
  if (seg.fromAyah === seg.toAyah) return `${name} · الآية ${seg.fromAyah}`;
  if (seg.fromAyah === 1 && seg.toAyah === surahAyahCount(seg.surah)) return `${name} · كاملة`;
  return `${name} · ${seg.fromAyah}–${seg.toAyah}`;
}

function validateSegment(seg: ScopeSegment, errors: ScopeError[]): void {
  const total = surahAyahCount(seg.surah);
  if (!total) {
    errors.push({ code: "UNKNOWN_SURAH", message: `رقم سورة غير موجود: ${seg.surah}` });
    return;
  }
  const name = surahName(seg.surah);
  if (seg.fromAyah < 1 || seg.toAyah > total) {
    errors.push({
      code: "AYAH_OUT_OF_RANGE",
      message: `سورة ${name} فيها ${total} آية، والنطاق المطلوب ${seg.fromAyah}–${seg.toAyah} خارجها.`,
    });
  }
  if (seg.toAyah < seg.fromAyah) {
    errors.push({
      code: "REVERSED_AYAH",
      message: `في سورة ${name}: آية النهاية (${seg.toAyah}) قبل آية البداية (${seg.fromAyah}).`,
    });
  }
}

/** يبني نطاقاً مُتحقَّقاً منه، أو يُعيد قائمة أخطاء صريحة للعرض. */
export function buildScope(input: ScopeInput): ScopeResult {
  const errors: ScopeError[] = [];
  let segments: ScopeSegment[] = [];

  switch (input.kind) {
    case "surah": {
      const seg = { surah: input.surah, fromAyah: input.fromAyah, toAyah: input.toAyah };
      validateSegment(seg, errors);
      segments = [seg];
      break;
    }
    case "juz": {
      if (input.fromJuz < 1 || input.fromJuz > 30 || input.toJuz < 1 || input.toJuz > 30) {
        errors.push({ code: "UNKNOWN_JUZ", message: "أرقام الأجزاء يجب أن تكون بين 1 و30." });
      } else if (input.toJuz < input.fromJuz) {
        errors.push({ code: "REVERSED_JUZ", message: "جزء النهاية قبل جزء البداية." });
      } else {
        segments = juzRangeToSegments(input.fromJuz, input.toJuz);
      }
      break;
    }
    case "surah-range": {
      if (!surahAyahCount(input.fromSurah) || !surahAyahCount(input.toSurah)) {
        errors.push({ code: "UNKNOWN_SURAH", message: "سورة غير موجودة." });
      } else if (input.toSurah < input.fromSurah) {
        errors.push({
          code: "REVERSED_SURAH",
          message: `سورة ${surahName(input.toSurah)} قبل سورة ${surahName(input.fromSurah)} في ترتيب المصحف.`,
        });
      } else {
        for (let s = input.fromSurah; s <= input.toSurah; s += 1) {
          segments.push({ surah: s, fromAyah: 1, toAyah: surahAyahCount(s) });
        }
      }
      break;
    }
    case "custom": {
      if (!input.segments.length) {
        errors.push({ code: "EMPTY", message: "أضف مقطعاً واحداً على الأقل إلى النطاق المخصص." });
      }
      for (const seg of input.segments) validateSegment(seg, errors);
      segments = input.segments.map((s) => ({ ...s }));
      break;
    }
  }

  if (errors.length) return { ok: false, errors };

  const normalized = normalizeSegments(segments);
  const ayahCount = countAyahs(normalized);

  if (!normalized.length || ayahCount === 0) {
    return { ok: false, errors: [{ code: "EMPTY", message: "النطاق فارغ." }] };
  }
  if (ayahCount < MIN_SCOPE_AYAHS) {
    return {
      ok: false,
      errors: [
        {
          code: "TOO_SMALL",
          message: `النطاق يحتوي ${ayahCount} آية فقط؛ الحد الأدنى ${MIN_SCOPE_AYAHS} آيات لبناء اختبار.`,
        },
      ],
    };
  }

  const scope: ExamScope = Object.freeze({
    kind: input.kind,
    segments: Object.freeze(normalized.map((s) => Object.freeze(s))),
    ayahCount,
    label: describe(input, normalized, ayahCount),
    input: Object.freeze(structuredCloneSafe(input)),
  });
  return { ok: true, scope };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** هل هذه الآية داخل النطاق؟ الفحص الذي تبنى عليه كل طبقات التحقق. */
export function isInScope(scope: ExamScope, surah: number, ayah: number): boolean {
  return scope.segments.some((s) => s.surah === surah && ayah >= s.fromAyah && ayah <= s.toAyah);
}

/** السور الداخلة في النطاق (بأرقامها الداخلية). */
export function scopeSurahs(scope: ExamScope): number[] {
  return [...new Set(scope.segments.map((s) => s.surah))];
}
