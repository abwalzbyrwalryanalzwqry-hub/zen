/**
 * عشوائية حتمية (deterministic) — نفس البذرة تُنتج نفس الاختبار حرفياً.
 *
 * ضرورية لثلاثة أسباب: إعادة إنتاج اختبار للمراجعة أو الشكوى، واختبارات وحدة
 * قابلة للتكرار، ومنع اختلاف الأسئلة بين إعادة تحميل الصفحة ونسخة الخادم.
 */

export type Rng = {
  /** عدد عشري في [0, 1). */
  next: () => number;
  /** عدد صحيح في [0, max). */
  int: (max: number) => number;
  /** عنصر عشوائي من مصفوفة غير فارغة. */
  pick: <T>(items: readonly T[]) => T;
  /** نسخة مخلوطة من المصفوفة (لا تُعدّل الأصل). */
  shuffle: <T>(items: readonly T[]) => T[];
  /** عيّنة بحجم n بلا تكرار. */
  sample: <T>(items: readonly T[], n: number) => T[];
};

/** يحوّل نصاً إلى بذرة رقمية ثابتة (xfnv1a). */
export function seedFrom(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** بذرة عشوائية قابلة للحفظ مع الاختبار. */
export function newSeed(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** مولّد mulberry32 — صغير وسريع وحتمي. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === "number" ? seed : seedFrom(seed)) >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number) => (max <= 0 ? 0 : Math.floor(next() * max));

  const pick = <T>(items: readonly T[]): T => {
    if (!items.length) throw new Error("pick على مصفوفة فارغة");
    return items[int(items.length)]!;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };

  const sample = <T>(items: readonly T[], n: number): T[] =>
    shuffle(items).slice(0, Math.max(0, n));

  return { next, int, pick, shuffle, sample };
}
