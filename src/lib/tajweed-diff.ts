/** مقارنة نص تلاوة الطالب بالنص القرآني المرجعي على مستوى الكلمات. */

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function words(text: string): string[] {
  const n = normalizeArabic(text);
  return n ? n.split(" ") : [];
}

export type DiffOp =
  | { op: "match"; ref: string; i: number }
  | { op: "wrong"; ref: string; said: string; i: number }
  | { op: "missing"; ref: string; i: number }
  | { op: "extra"; said: string; i: number };

/** محاذاة بأطول تسلسل مشترك (LCS) بين كلمات المرجع وكلمات التلاوة. */
export function diffWords(reference: string, heard: string): DiffOp[] {
  const a = words(reference);
  const b = words(heard);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "match", ref: a[i], i });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // الكلمة المرجعية لم تُقرأ — قد تكون نُطقت خطأً إن تلتها كلمة زائدة
      const nextExtra = j < m && (i + 1 >= n || a[i + 1] !== b[j]);
      if (nextExtra) {
        ops.push({ op: "wrong", ref: a[i], said: b[j], i });
        i++;
        j++;
      } else {
        ops.push({ op: "missing", ref: a[i], i });
        i++;
      }
    } else {
      ops.push({ op: "extra", said: b[j], i });
      j++;
    }
  }
  while (i < n) ops.push({ op: "missing", ref: a[i], i: i++ });
  // كلمات زائدة بعد نهاية المقطع (أكمل الطالب بعد آخر آية). كان j لا يتقدّم هنا فتدور الحلقة بلا نهاية حتى
  // نفاد الذاكرة (كشفه تقييم التسميع، تدقيق أكتوبر 2026).
  while (j < m) ops.push({ op: "extra", said: b[j++], i: n });
  return ops;
}

export type DiffSummary = {
  score: number;
  total: number;
  matched: number;
  wrong: number;
  missing: number;
  extra: number;
  ops: DiffOp[];
  weakSpots: string[];
};

export function summarizeDiff(reference: string, heard: string): DiffSummary {
  const ops = diffWords(reference, heard);
  const total = words(reference).length || 1;
  const matched = ops.filter((o) => o.op === "match").length;
  const wrong = ops.filter((o) => o.op === "wrong").length;
  const missing = ops.filter((o) => o.op === "missing").length;
  const extra = ops.filter((o) => o.op === "extra").length;
  const penalty = wrong + missing + extra * 0.5;
  const score = Math.max(0, Math.min(100, Math.round(((total - penalty) / total) * 100)));

  const weakSpots: string[] = [];
  ops.forEach((o, k) => {
    if (o.op === "wrong" || o.op === "missing") {
      const around = ops
        .slice(Math.max(0, k - 2), k + 3)
        .map((x) => ("ref" in x ? x.ref : x.said))
        .join(" ");
      weakSpots.push(around);
    }
  });
  return { score, total, matched, wrong, missing, extra, ops, weakSpots: weakSpots.slice(0, 8) };
}
