/**
 * البحث في «المزيد» (تحليل «المزيد» GAP-06): تصفية المداخل بعنوانها ووصفها واسم قسمها. يطابق العربية
 * دون تشكيل ومع توحيد الهمزات والتاء المربوطة والألف المقصورة، فـ«اعدادات» تجد «الإعدادات».
 */
import type { MoreSection } from "@/lib/home";

const TASHKEEL = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeSearch(s: string): string {
  return s
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** الأقسام بمداخلها المطابقة فقط؛ القسم الذي يطابق اسمه يبقى كاملاً. نص فارغ ⇒ كما هي. */
export function filterSections(sections: MoreSection[], query: string): MoreSection[] {
  const q = normalizeSearch(query);
  if (!q) return sections;
  const words = q.split(" ");
  const hit = (text: string) => {
    const t = normalizeSearch(text);
    return words.every((w) => t.includes(w));
  };
  return sections
    .map((s) =>
      hit(s.title) ? s : { ...s, links: s.links.filter((l) => hit(`${l.label} ${l.hint}`)) },
    )
    .filter((s) => s.links.length > 0);
}
