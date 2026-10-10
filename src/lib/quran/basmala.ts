// ============================================================
// Zen — Quran Data Layer
// البسملة: فصلها عن الآية الأولى مرة واحدة عند تحميل النص.
// ------------------------------------------------------------
// نص Tanzil العثماني يُلصق البسملة بأول الآية الأولى في كل سورة
// عدا الفاتحة (البسملة فيها آية مستقلة) والتوبة (لا بسملة لها).
// ترتيب علامات التشكيل يختلف أحياناً (شدّة ثم فتحة أو العكس)، وفي
// سورتي التين والقدر تأتي «بِّسْمِ» بشدّة زائدة، لذلك تُقارَن الكلمات
// الأربع الأولى بعد حذف التشكيل بدل المطابقة الحرفية.
// ============================================================

/** البسملة كما وردت في المصدر (الفاتحة ١:١) — للعرض فقط. */
export const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\uFEFF\u0640]/g;
const bare = (w: string) => w.replace(MARKS, "").replace(/ٱ/g, "ا");
const BARE_WORDS = ["بسم", "الله", "الرحمن", "الرحيم"];

/** هل تحمل هذه السورة بسملة تُعرض رأساً مستقلاً فوق الآية الأولى؟ */
export function hasBasmalaHeader(surahId: number): boolean {
  return surahId !== 1 && surahId !== 9;
}

/**
 * يفصل البسملة عن نص الآية الأولى إن وُجدت.
 * يعيد النص كما هو للفاتحة والتوبة أو إن لم تبدأ الآية بالبسملة.
 */
export function stripBasmala(surahId: number, ayahNumber: number, text: string): string {
  const clean = text.replace(/\uFEFF/g, "");
  if (ayahNumber !== 1 || !hasBasmalaHeader(surahId)) return clean;
  const words = clean.trim().split(/\s+/);
  if (words.length < 4) return clean;
  for (let i = 0; i < 4; i++) if (bare(words[i]) !== BARE_WORDS[i]) return clean;
  return words.slice(4).join(" ");
}
