/**
 * الإشارات في غرف النقاش (9.6). الصيغة المخزّنة `@[الاسم](معرّف)`؛ خانة الكتابة تعرض `@الاسم` فقط
 * وتحوّلها عند الإرسال. الخادم (post_room_message) وحده يقرّر من يُشعَر.
 */
export type MentionCandidate = { user_id: string; name: string; mod: boolean };
export type Segment =
  { kind: "text"; text: string } | { kind: "mention"; name: string; id: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MARKUP = new RegExp(`@\\[([^\\]]{1,40})\\]\\((${UUID})\\)`, "g");
export const MAX_MENTIONS = 5;

/** يقسم النص المخزّن إلى نصوص وإشارات للعرض. */
export function parseMentions(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "mention", name: m[1], id: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** «@الاسم» بدل الصيغة (للمعاينات والإشعارات والنسخ). */
export const stripMentions = (text: string) => text.replace(MARKUP, "@$1");

/** الكلمة الجارية بعد @ عند المؤشر (أو null): تفتح قائمة الأسماء. */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]{0,20})$/u);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/** يستبدل «@جزء» عند المؤشر بـ «@الاسم » ويعيد النص الجديد وموضع المؤشر. */
export function insertMention(
  text: string,
  caret: number,
  c: MentionCandidate,
): { text: string; caret: number } {
  const q = activeMentionQuery(text, caret);
  const start = q ? q.start : caret;
  const tag = `@${safeName(c.name)} `;
  return { text: text.slice(0, start) + tag + text.slice(caret), caret: start + tag.length };
}

const safeName = (n: string) =>
  n
    .replace(/[[\]()@]/g, "")
    .trim()
    .slice(0, 40) || "عضو";

/** قائمة المرشّحين المطابقة للكتابة (بتوحيد الهمزات والياء). */
export function filterCandidates(
  all: MentionCandidate[],
  query: string,
  limit = 6,
): MentionCandidate[] {
  const norm = (s: string) =>
    s
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .toLowerCase();
  const q = norm(query);
  return all.filter((c) => norm(c.name).includes(q)).slice(0, limit);
}

/** عند الإرسال: كل «@الاسم» لعضو اختير من القائمة يصير `@[الاسم](معرّف)` (حتى 5، والباقي نص). */
export function encodeMentions(text: string, picked: MentionCandidate[]): string {
  const byName = new Map(picked.map((c) => [safeName(c.name), c.user_id]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(${names.map(esc).join("|")})(?=$|[\\s،,.!?؟:;])`, "gu");
  let n = 0;
  return text.replace(re, (all, name: string) =>
    n++ < MAX_MENTIONS ? `@[${name}](${byName.get(name)})` : all,
  );
}
