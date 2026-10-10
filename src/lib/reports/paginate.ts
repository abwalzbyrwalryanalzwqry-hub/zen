/**
 * تقسيم التقرير إلى صفحات A4 (دالة صرفة تُختبر بلا متصفح). المدخل ارتفاعات مقيسة لكل قطعة، والناتج
 * صفحات من قطع، بقواعد الطباعة الرسمية:
 * - لا يُقطع صف بين صفحتين، ورأس الجدول يتكرر في كل صفحة يمتد إليها.
 * - مجموعة الطالب (حفظ + مراجعة) وحدة واحدة ما دامت تتسع لصفحة؛ وإلا تُقسم على حدود الصفوف.
 * - العنوان لا يبقى وحيداً أسفل الصفحة: ينتقل مع أول مجموعة من جدوله.
 * - لا صفحات فارغة.
 */

export type Unit =
  | { kind: "block"; index: number; h: number; keepWithNext?: boolean; breakBefore?: boolean }
  | { kind: "table"; index: number; headerH: number; emptyH: number; groups: { rows: number[] }[] };

export type Piece =
  | { kind: "block"; index: number }
  | { kind: "table"; index: number; rows: { group: number; from: number; to: number }[] };

export type Page = Piece[];

const groupH = (g: { rows: number[] }) => g.rows.reduce((a, b) => a + b, 0);

/** أقل ما يجب أن يتسع بعد العنوان: رأس الجدول وأول مجموعة (أو أول صف إن كانت المجموعة أطول من صفحة). */
function minStart(u: Unit | undefined, pageH: number): number {
  if (!u) return 0;
  if (u.kind === "block") return u.h;
  if (!u.groups.length) return u.headerH + u.emptyH;
  const g = u.groups[0];
  const gh = groupH(g);
  return u.headerH + (u.headerH + gh <= pageH ? gh : (g.rows[0] ?? 0));
}

export function paginate(units: readonly Unit[], pageH: number): Page[] {
  const pages: Page[] = [[]];
  let left = pageH;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    if (page().length) pages.push([]);
    left = pageH;
  };

  units.forEach((u, i) => {
    if (u.kind === "block") {
      if (u.breakBefore) newPage();
      const need = u.h + (u.keepWithNext ? minStart(units[i + 1], pageH) : 0);
      if (need > left && page().length) newPage();
      page().push({ kind: "block", index: u.index });
      left -= u.h;
      return;
    }
    if (!u.groups.length) {
      if (u.headerH + u.emptyH > left && page().length) newPage();
      page().push({ kind: "table", index: u.index, rows: [] });
      left -= u.headerH + u.emptyH;
      return;
    }
    let piece: Extract<Piece, { kind: "table" }> | null = null;
    const startPiece = () => {
      piece = { kind: "table", index: u.index, rows: [] };
      page().push(piece);
      left -= u.headerH;
    };
    const add = (group: number, from: number, to: number) => {
      const p = piece as Extract<Piece, { kind: "table" }> | null;
      const last = p?.rows[p.rows.length - 1];
      if (last && last.group === group && last.to === from) last.to = to;
      else p?.rows.push({ group, from, to });
    };
    u.groups.forEach((g, gi) => {
      const gh = groupH(g);
      const fitsFresh = u.headerH + gh <= pageH;
      if (!piece) {
        const first = fitsFresh ? gh : (g.rows[0] ?? 0);
        if (u.headerH + first > left && page().length) newPage();
        startPiece();
      }
      if (gh <= left) {
        add(gi, 0, g.rows.length);
        left -= gh;
        return;
      }
      if (fitsFresh) {
        newPage();
        startPiece();
        add(gi, 0, g.rows.length);
        left -= gh;
        return;
      }
      // مجموعة أطول من صفحة: تُقسم على حدود الصفوف، والرأس يتكرر.
      g.rows.forEach((rh, ri) => {
        if (rh > left && (piece as Extract<Piece, { kind: "table" }>).rows.length) {
          newPage();
          startPiece();
        }
        add(gi, ri, ri + 1);
        left -= rh;
      });
    });
  });
  return pages.filter((p) => p.length);
}
