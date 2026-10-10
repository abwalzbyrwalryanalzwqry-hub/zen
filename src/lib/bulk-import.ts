/**
 * استيراد الطلاب جماعياً (9.3): CSV أو Excel يُقرأ على الجهاز، ومعاينة بأخطاء كل صف قبل الإرسال،
 * ثم `teacher_create_students_bulk` (حتى 100)، وبطاقات دخول للطباعة (اسم المستخدم وكلمة المرور المؤقتة).
 */
import { supabase } from "@/integrations/supabase/client";
import { generateTempPassword } from "@/lib/auth";
import { normalizeUsername, suggestUsername, usernameError, USERNAME_MAX } from "@/lib/username";

export const MAX_IMPORT = 100;

/** يقسم نص CSV/TSV مع دعم علامات الاقتباس، ويحذف BOM والأسطر الفارغة. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = ["\t", ",", ";", "،"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const NAME_HEADERS = ["الاسم", "اسم الطالب", "name", "student", "الطالب"];
const USER_HEADERS = ["اسم المستخدم", "المستخدم", "username", "user", "login"];

/** عمود الاسم واسم المستخدم من سطر العنوان إن وُجد؛ وإلا الأول اسم والثاني اسم مستخدم. */
export function detectColumns(rows: string[][]): {
  name: number;
  username: number;
  header: boolean;
} {
  const head = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  const name = head.findIndex((c) => NAME_HEADERS.includes(c));
  const username = head.findIndex((c) => USER_HEADERS.includes(c));
  if (name >= 0) return { name, username, header: true };
  return { name: 0, username: rows.some((r) => (r[1] ?? "").trim()) ? 1 : -1, header: false };
}

export type ImportRow = {
  line: number;
  name: string;
  username: string;
  password: string;
  error: string | null;
};

/** صفوف المعاينة: اسم المستخدم المقترح إن غاب، ومنع التكرار داخل الملف، وكلمة مرور مؤقتة لكل صف. */
export function buildImport(
  rows: string[][],
  password: () => string = generateTempPassword,
): ImportRow[] {
  const cols = detectColumns(rows);
  const body = cols.header ? rows.slice(1) : rows;
  const seen = new Set<string>();
  return body.map((r, i) => {
    const line = i + 1 + (cols.header ? 1 : 0);
    const name = (r[cols.name] ?? "").replace(/\s+/g, " ").trim();
    const given = cols.username >= 0 ? (r[cols.username] ?? "").trim() : "";
    let username = given ? normalizeUsername(given) : suggestUsername(name);
    if (!given && username) {
      // المقترح المكرر يأخذ رقماً (احمد_علي، احمد_علي2 …) ضمن الطول المسموح.
      let n = 2;
      const base = username;
      while (seen.has(username))
        username = `${base.slice(0, USERNAME_MAX - String(n).length)}${n++}`;
    }
    let error: string | null = null;
    if (name.length < 2) error = "الاسم ناقص (حرفان على الأقل).";
    else if (usernameError(username)) error = usernameError(username);
    else if (seen.has(username)) error = "اسم المستخدم مكرر في الملف.";
    if (!error) seen.add(username);
    return { line, name, username, password: password(), error };
  });
}

export async function readImportFile(file: File): Promise<string[][]> {
  if (file.size > 2_000_000) throw new Error("الملف كبير (الحد 2 ميغابايت).");
  if (/\.xlsx$/i.test(file.name)) {
    const { readXlsx } = await import("./xlsx-lite");
    return readXlsx(new Uint8Array(await file.arrayBuffer())).filter((r) =>
      r.some((c) => c.trim()),
    );
  }
  if (/\.xls$/i.test(file.name))
    throw new Error("صيغة xls القديمة غير مدعومة. احفظ الملف xlsx أو CSV.");
  return parseDelimited(await file.text());
}

export type BulkResult = {
  created: number;
  failed: number;
  rows: Array<{
    row: number;
    ok: boolean;
    name: string;
    username: string;
    recovery_code?: string;
    error?: string;
  }>;
};

export async function importStudents(halaqa: string, rows: ImportRow[]): Promise<BulkResult> {
  const { data, error } = await supabase.rpc("teacher_create_students_bulk", {
    _halaqa: halaqa,
    _rows: rows.map((r) => ({ name: r.name, username: r.username, password: r.password })) as never,
  });
  if (error) {
    if (error.message.includes("rate_limited") || error.message.includes("too_many"))
      throw new Error("تجاوزت عدد الاستيرادات المسموح في الساعة. حاول لاحقاً.");
    if (error.message.includes("not_allowed")) throw new Error("هذه الحلقة ليست من حلقاتك.");
    throw new Error("تعذّر الاستيراد. تحقّق من الاتصال.");
  }
  return data as unknown as BulkResult;
}

export function bulkRowError(code: string | undefined): string {
  switch (code) {
    case "username_taken":
      return "اسم المستخدم مأخوذ";
    case "invalid_username":
      return "اسم المستخدم غير صالح";
    case "invalid_name":
      return "الاسم ناقص";
    default:
      return "تعذّر الإنشاء";
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** بطاقات الدخول للطباعة: 8 في الصفحة، كل بطاقة تُقص وتُسلَّم لطالبها. */
export function loginCardsHtml(
  cards: Array<{ name: string; username: string; password: string; recovery_code?: string }>,
  halaqaName: string,
): string {
  const items = cards
    .map(
      (c) => `<div class="card"><h2>${esc(c.name)}</h2><p class="h">${esc(halaqaName)}</p>
<dl><dt>اسم المستخدم</dt><dd dir="ltr">${esc(c.username)}</dd><dt>كلمة المرور المؤقتة</dt><dd dir="ltr">${esc(c.password)}</dd>${
        c.recovery_code ? `<dt>رمز الاسترداد</dt><dd dir="ltr">${esc(c.recovery_code)}</dd>` : ""
      }</dl><p class="n">ادخل تطبيق زِن باسم المستخدم وكلمة المرور، ثم اختر كلمة مرور خاصة بك. احفظ رمز الاسترداد.</p></div>`,
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بطاقات الدخول — ${esc(halaqaName)}</title>
<style>@page{size:A4;margin:10mm}body{font-family:system-ui,"Noto Naskh Arabic",sans-serif;margin:0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.card{border:1px dashed #555;border-radius:4mm;padding:4mm;break-inside:avoid;height:62mm;box-sizing:border-box}
h2{margin:0;font-size:14pt}.h{margin:0 0 2mm;color:#555;font-size:9pt}dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:1mm 3mm;font-size:10pt}
dt{color:#555}dd{margin:0;font-family:monospace;font-size:12pt;font-weight:700;text-align:left}.n{font-size:8pt;color:#444;margin:2mm 0 0}</style></head>
<body><div class="grid">${items}</div></body></html>`;
}
