/**
 * حالة المصمم كدالة نقية (reducer): تراجع/إعادة، نسخ/لصق/تكرار، ترتيب الطبقات، محاذاة وتوزيع، تجميع وفك،
 * إخفاء وقفل. العنصر المقفل لا يُحرَّك ولا يُحذف. السحب المتواصل يُدمج في خطوة تراجع واحدة (`merge`).
 */
import {
  clamp,
  cloneDesign,
  newId,
  round2,
  type CertElement,
  type Design,
  type PageSpec,
  type Palette,
} from "./model";
import { bounds } from "./validate";

export const HISTORY_LIMIT = 100;

export interface EditorState {
  design: Design;
  selection: string[];
  past: Design[];
  future: Design[];
  clipboard: CertElement[] | null;
  /** يتغيّر مع كل تعديل (للحفظ التلقائي). */
  rev: number;
}

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export type EditorAction =
  | { type: "load"; design: Design }
  | { type: "select"; ids: string[]; additive?: boolean }
  | {
      type: "update";
      ids: string[];
      patch: Partial<CertElement> | ((e: CertElement) => Partial<CertElement>);
      merge?: boolean;
    }
  | { type: "move"; ids: string[]; dx: number; dy: number; merge?: boolean }
  | { type: "add"; element: CertElement }
  | { type: "remove"; ids: string[] }
  | { type: "duplicate"; ids: string[] }
  | { type: "copy"; ids: string[] }
  | { type: "cut"; ids: string[] }
  | { type: "paste" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "order"; ids: string[]; to: "front" | "back" | "forward" | "backward" }
  | { type: "reorder"; from: number; to: number }
  | { type: "align"; ids: string[]; align: Align; to?: "page" | "selection" }
  | { type: "distribute"; ids: string[]; axis: "h" | "v" }
  | { type: "group"; ids: string[] }
  | { type: "ungroup"; ids: string[] }
  | { type: "page"; patch: Partial<PageSpec> }
  | { type: "palette"; patch: Partial<Palette> }
  | { type: "numbers"; patch: Partial<Design["numbers"]> };

export function initEditor(design: Design): EditorState {
  return { design, selection: [], past: [], future: [], clipboard: null, rev: 0 };
}

/** يوسّع التحديد ليشمل أعضاء المجموعات المحددة. */
export function withGroups(d: Design, ids: string[]): string[] {
  const groups = new Set(
    d.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId),
  );
  return d.elements
    .filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId)))
    .map((e) => e.id);
}

function commit(
  s: EditorState,
  design: Design,
  merge = false,
  selection = s.selection,
): EditorState {
  const past = merge && s.past.length ? s.past : [...s.past, s.design].slice(-HISTORY_LIMIT);
  return { ...s, design, selection, past, future: [], rev: s.rev + 1 };
}

const map = (d: Design, ids: string[], f: (e: CertElement) => CertElement): Design => ({
  ...d,
  elements: d.elements.map((e) => (ids.includes(e.id) ? f(e) : e)),
});

const movable = (d: Design, ids: string[]) =>
  d.elements.filter((e) => ids.includes(e.id) && !e.locked).map((e) => e.id);

function copies(els: CertElement[], offset: number): CertElement[] {
  const groupMap = new Map<string, string>();
  return els.map((e) => {
    const c = cloneDesign(e);
    c.id = newId();
    if (c.groupId) {
      if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, newId("g"));
      c.groupId = groupMap.get(c.groupId)!;
    }
    c.x = round2(c.x + offset);
    c.y = round2(c.y + offset);
    c.locked = false;
    return c;
  });
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const d = s.design;
  switch (a.type) {
    case "load":
      return initEditor(a.design);
    case "select": {
      const ids = withGroups(d, a.ids);
      return { ...s, selection: a.additive ? [...new Set([...s.selection, ...ids])] : ids };
    }
    case "update": {
      const next = map(
        d,
        a.ids,
        (e) => ({ ...e, ...(typeof a.patch === "function" ? a.patch(e) : a.patch) }) as CertElement,
      );
      return commit(s, next, a.merge);
    }
    case "move": {
      const ids = movable(d, withGroups(d, a.ids));
      if (!ids.length) return s;
      const next = map(d, ids, (e) => ({ ...e, x: round2(e.x + a.dx), y: round2(e.y + a.dy) }));
      return commit(s, next, a.merge);
    }
    case "add":
      return commit(s, { ...d, elements: [...d.elements, a.element] }, false, [a.element.id]);
    case "remove": {
      const ids = movable(d, withGroups(d, a.ids));
      if (!ids.length) return s;
      return commit(
        s,
        { ...d, elements: d.elements.filter((e) => !ids.includes(e.id)) },
        false,
        [],
      );
    }
    case "duplicate": {
      const src = d.elements.filter((e) => withGroups(d, a.ids).includes(e.id));
      if (!src.length) return s;
      const dup = copies(src, 4);
      return commit(
        s,
        { ...d, elements: [...d.elements, ...dup] },
        false,
        dup.map((e) => e.id),
      );
    }
    case "copy":
      return {
        ...s,
        clipboard: cloneDesign(d.elements.filter((e) => withGroups(d, a.ids).includes(e.id))),
      };
    case "cut": {
      const clip = cloneDesign(d.elements.filter((e) => withGroups(d, a.ids).includes(e.id)));
      const removed = editorReducer(s, { type: "remove", ids: a.ids });
      return { ...removed, clipboard: clip };
    }
    case "paste": {
      if (!s.clipboard?.length) return s;
      const pasted = copies(s.clipboard, 5);
      return {
        ...commit(
          s,
          { ...d, elements: [...d.elements, ...pasted] },
          false,
          pasted.map((e) => e.id),
        ),
        clipboard: s.clipboard.map((e) => ({ ...e, x: e.x + 5, y: e.y + 5 })),
      };
    }
    case "undo": {
      const prev = s.past.at(-1);
      if (!prev) return s;
      return {
        ...s,
        design: prev,
        past: s.past.slice(0, -1),
        future: [d, ...s.future],
        selection: keep(prev, s.selection),
        rev: s.rev + 1,
      };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...s,
        design: next,
        past: [...s.past, d],
        future: s.future.slice(1),
        selection: keep(next, s.selection),
        rev: s.rev + 1,
      };
    }
    case "order": {
      const ids = withGroups(d, a.ids);
      const sel = d.elements.filter((e) => ids.includes(e.id));
      const rest = d.elements.filter((e) => !ids.includes(e.id));
      let els: CertElement[];
      if (a.to === "front") els = [...rest, ...sel];
      else if (a.to === "back") els = [...sel, ...rest];
      else {
        els = [...d.elements];
        const step = a.to === "forward" ? 1 : -1;
        const idx = els.map((e, i) => (ids.includes(e.id) ? i : -1)).filter((i) => i >= 0);
        const order = step > 0 ? idx.reverse() : idx;
        for (const i of order) {
          const j = i + step;
          if (j < 0 || j >= els.length || ids.includes(els[j].id)) continue;
          [els[i], els[j]] = [els[j], els[i]];
        }
      }
      return commit(s, { ...d, elements: els });
    }
    case "reorder": {
      const els = [...d.elements];
      if (a.from < 0 || a.from >= els.length) return s;
      const [x] = els.splice(a.from, 1);
      els.splice(clamp(a.to, 0, els.length), 0, x);
      return commit(s, { ...d, elements: els });
    }
    case "align": {
      const ids = movable(d, withGroups(d, a.ids));
      if (!ids.length) return s;
      const sel = d.elements.filter((e) => ids.includes(e.id));
      const box =
        a.to === "selection" && sel.length > 1
          ? union(sel)
          : { x: 0, y: 0, w: d.page.width, h: d.page.height };
      const next = map(d, ids, (e) => {
        const b = bounds(e);
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        switch (a.align) {
          case "left":
            return { ...e, x: round2(box.x + dx) };
          case "right":
            return { ...e, x: round2(box.x + box.w - b.w + dx) };
          case "hcenter":
            return { ...e, x: round2(box.x + (box.w - b.w) / 2 + dx) };
          case "top":
            return { ...e, y: round2(box.y + dy) };
          case "bottom":
            return { ...e, y: round2(box.y + box.h - b.h + dy) };
          case "vcenter":
            return { ...e, y: round2(box.y + (box.h - b.h) / 2 + dy) };
        }
      });
      return commit(s, next);
    }
    case "distribute": {
      const ids = movable(d, a.ids);
      if (ids.length < 3) return s;
      const key = a.axis === "h" ? "x" : "y";
      const size = a.axis === "h" ? "w" : "h";
      const sel = d.elements.filter((e) => ids.includes(e.id)).sort((p, q) => p[key] - q[key]);
      const first = sel[0];
      const last = sel[sel.length - 1];
      const total = sel.reduce((n, e) => n + e[size], 0);
      const gap = (last[key] + last[size] - first[key] - total) / (sel.length - 1);
      let pos = first[key];
      const at = new Map<string, number>();
      for (const e of sel) {
        at.set(e.id, round2(pos));
        pos += e[size] + gap;
      }
      return commit(
        s,
        map(d, ids, (e) => ({ ...e, [key]: at.get(e.id)! })),
      );
    }
    case "group": {
      if (a.ids.length < 2) return s;
      const g = newId("g");
      return commit(
        s,
        map(d, a.ids, (e) => ({ ...e, groupId: g })),
      );
    }
    case "ungroup": {
      const ids = withGroups(d, a.ids);
      return commit(
        s,
        map(d, ids, (e) => ({ ...e, groupId: null })),
      );
    }
    case "page":
      return commit(s, { ...d, page: { ...d.page, ...a.patch } });
    case "palette":
      return commit(s, { ...d, palette: { ...d.palette, ...a.patch } });
    case "numbers":
      return commit(s, { ...d, numbers: { ...d.numbers, ...a.patch } });
  }
}

const keep = (d: Design, ids: string[]) => ids.filter((id) => d.elements.some((e) => e.id === id));

function union(els: CertElement[]) {
  const bs = els.map(bounds);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w));
  const btm = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

/** المحاذاة المغناطيسية: يلتصق الموضع بالشبكة وبمنتصف الصفحة وحوافها إن اقترب منها. */
export function snap(
  v: number,
  size: number,
  opts: { grid: number; page: number; tol: number },
): number {
  const targets = [0, opts.page / 2 - size / 2, opts.page - size];
  for (const tgt of targets) if (Math.abs(v - tgt) <= opts.tol) return round2(tgt);
  if (opts.grid > 0) {
    const g = Math.round(v / opts.grid) * opts.grid;
    if (Math.abs(g - v) <= opts.tol) return round2(g);
  }
  return round2(v);
}
