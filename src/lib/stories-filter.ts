// بحث قسم القصص: مطابقة عربية متسامحة (بلا تشكيل، والألف بصورها ألفٌ واحدة، والتاء المربوطة هاء).
import type { Story } from "./zen-stories";

export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** هل تطابق القصة نص البحث؟ (الاسم والعنوان والقوم والمكان والمقدّمة والـ slug) */
export function matchesStory(
  s: Pick<Story, "prophet" | "title" | "intro" | "people" | "place" | "slug">,
  query: string,
): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  const hay = normalizeArabic(
    [s.prophet, s.title, s.intro, s.people ?? "", s.place ?? "", s.slug ?? ""].join(" "),
  );
  return q.split(" ").every((w) => hay.includes(w));
}
