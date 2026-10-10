/** البحث داخل المحادثة: مطابقة لا تتأثر بالتشكيل والتطويل وأشكال الهمزة، وتقسيم النص لتظليل الموضع. */

const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** صيغة موحَّدة للمقارنة: بلا تشكيل ولا تطويل، والهمزات ألفاً، والتاء المربوطة هاءً، والألف المقصورة ياءً. */
export function normalizeForSearch(s: string): string {
  return s
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

/**
 * يقسم النص إلى أجزاء مطابقة وغير مطابقة للاستعلام، مع إبقاء النص الأصلي كما هو (بتشكيله).
 * المطابقة على الصيغة الموحَّدة، ثم تُعاد المواضع إلى النص الأصلي عبر خريطة الأحرف.
 */
export function splitMatches(text: string, query: string): { text: string; hit: boolean }[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [{ text, hit: false }];
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalizeForSearch(text[i]);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      map.push(i);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  let from = 0;
  for (;;) {
    const at = norm.indexOf(q, from);
    if (at < 0) break;
    const start = map[at];
    const end = map[at + q.length - 1] + 1;
    if (start > last) out.push({ text: text.slice(last, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    last = end;
    from = at + q.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  return !!q && normalizeForSearch(text).includes(q);
}

/** مسودة المحادثة على الجهاز: تبقى إن خرج المستخدم قبل الإرسال وتعود عند فتحها. */
const DRAFT_KEY = (chatId: string) => `zen.chat.draft.${chatId}`;

export function loadDraft(chatId: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY(chatId)) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(chatId: string, text: string): void {
  try {
    if (text.trim()) localStorage.setItem(DRAFT_KEY(chatId), text.slice(0, 4000));
    else localStorage.removeItem(DRAFT_KEY(chatId));
  } catch {
    /* تخزين غير متاح (وضع خاص): المسودة للجلسة فقط. */
  }
}
