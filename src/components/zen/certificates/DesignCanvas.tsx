import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { EditorAction, EditorState } from "@/lib/certificates/editor";
import { snap } from "@/lib/certificates/editor";
import { round2, type CertElement } from "@/lib/certificates/model";
import { MM_PX } from "./hooks";

export interface ViewOpts {
  grid: boolean;
  guides: boolean;
  rulers: boolean;
  snap: boolean;
  safe: boolean;
  bleed: boolean;
}

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const GRID_MM = 5;

type Drag =
  | {
      kind: "move";
      sx: number;
      sy: number;
      orig: Record<string, { x: number; y: number }>;
      moved: boolean;
      lead: string;
    }
  | { kind: "resize"; sx: number; sy: number; h: Handle; orig: CertElement; moved: boolean }
  | { kind: "rotate"; cx: number; cy: number; moved: boolean; id: string };

/**
 * لوحة الرسم: الصفحة المرسومة نفسها تحتها (HTML من محرّك الرسم)، وفوقها طبقة تفاعل بمربعات العناصر: تحديد
 * (Shift للإضافة)، سحب، تغيير الحجم بثمانية مقابض، تدوير (Shift: كل 15°)، ومحاذاة مغناطيسية للشبكة ومنتصف
 * الصفحة وحوافها مع أدلة ظاهرة. العنصر المقفل يُحدَّد ولا يتحرك.
 */
export function DesignCanvas({
  state,
  dispatch,
  html,
  zoom,
  view,
  readOnly,
  onEditText,
}: {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  html: string;
  zoom: number;
  view: ViewOpts;
  readOnly?: boolean;
  onEditText?: (id: string) => void;
}) {
  const d = state.design;
  const pg = d.page;
  const k = MM_PX * zoom;
  const W = pg.width * k;
  const H = pg.height * k;
  const drag = useRef<Drag | null>(null);
  const [guide, setGuide] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const sel = new Set(state.selection);

  const toMm = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  const startMove = (e: RPointerEvent, el: CertElement) => {
    e.stopPropagation();
    if (!sel.has(el.id) || e.shiftKey)
      dispatch({ type: "select", ids: [el.id], additive: e.shiftKey });
    if (readOnly || el.locked) return;
    const ids = sel.has(el.id) ? state.selection : [el.id];
    const orig: Record<string, { x: number; y: number }> = {};
    for (const x of d.elements)
      if (ids.includes(x.id) || (el.groupId && x.groupId === el.groupId))
        orig[x.id] = { x: x.x, y: x.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, orig, moved: false, lead: el.id };
  };

  const startResize = (e: RPointerEvent, el: CertElement, h: Handle) => {
    e.stopPropagation();
    if (readOnly || el.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", sx: e.clientX, sy: e.clientY, h, orig: el, moved: false };
  };

  const startRotate = (e: RPointerEvent, el: CertElement) => {
    e.stopPropagation();
    if (readOnly || el.locked) return;
    const page = (e.currentTarget as HTMLElement).closest("[data-page]") as HTMLElement;
    const r = page.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      kind: "rotate",
      cx: r.left + (el.x + el.w / 2) * k,
      cy: r.top + (el.y + el.h / 2) * k,
      moved: false,
      id: el.id,
    };
  };

  const onMove = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    if (g.kind === "move") {
      let dx = (e.clientX - g.sx) / k;
      let dy = (e.clientY - g.sy) / k;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 0.4) return;
      const lead = d.elements.find((x) => x.id === g.lead)!;
      const o = g.orig[g.lead] ?? { x: lead.x, y: lead.y };
      let gv = false;
      let gh = false;
      if (view.snap) {
        const opt = (page: number) => ({ grid: view.grid ? GRID_MM : 0, page, tol: 1.2 });
        const nx = snap(o.x + dx, lead.w, opt(pg.width));
        const ny = snap(o.y + dy, lead.h, opt(pg.height));
        gv = Math.abs(nx + lead.w / 2 - pg.width / 2) < 0.01;
        gh = Math.abs(ny + lead.h / 2 - pg.height / 2) < 0.01;
        dx = nx - o.x;
        dy = ny - o.y;
      }
      if (view.guides) setGuide({ v: gv, h: gh });
      const orig = g.orig;
      dispatch({
        type: "update",
        ids: Object.keys(orig),
        patch: (x) => ({ x: round2(orig[x.id].x + dx), y: round2(orig[x.id].y + dy) }),
        merge: g.moved,
      });
      g.moved = true;
    } else if (g.kind === "resize") {
      const o = g.orig;
      const dx = (e.clientX - g.sx) / k;
      const dy = (e.clientY - g.sy) / k;
      let { x, y, w, h } = o;
      if (g.h.includes("e")) w = o.w + dx;
      if (g.h.includes("w")) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (g.h.includes("s")) h = o.h + dy;
      if (g.h.includes("n")) {
        h = o.h - dy;
        y = o.y + dy;
      }
      if (e.shiftKey && g.h.length === 2) {
        const r = o.w / o.h;
        if (w / h > r) w = h * r;
        else h = w / r;
        if (g.h.includes("w")) x = o.x + o.w - w;
        if (g.h.includes("n")) y = o.y + o.h - h;
      }
      w = Math.max(2, w);
      h = Math.max(1, h);
      dispatch({
        type: "update",
        ids: [o.id],
        patch: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
        merge: g.moved,
      });
      g.moved = true;
    } else {
      let deg = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      if (deg > 180) deg -= 360;
      dispatch({ type: "update", ids: [g.id], patch: { rotation: deg }, merge: g.moved });
      g.moved = true;
    }
  };

  const end = () => {
    drag.current = null;
    setGuide({ v: false, h: false });
  };

  const one =
    state.selection.length === 1 ? d.elements.find((e) => e.id === state.selection[0]) : null;

  return (
    <div className="relative inline-block" style={{ padding: view.rulers ? "22px 0 0 22px" : 0 }}>
      {view.rulers && <Rulers w={pg.width} h={pg.height} k={k} />}
      <div
        data-page
        dir="ltr"
        className="relative bg-white shadow-[0_16px_50px_-16px_rgba(20,50,40,.45)] select-none touch-none"
        style={{ width: W, height: H }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg)
            dispatch({ type: "select", ids: [] });
        }}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            width: pg.width * MM_PX,
            height: pg.height * MM_PX,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {view.grid && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(31,93,70,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(31,93,70,.10) 1px, transparent 1px)",
              backgroundSize: `${GRID_MM * k}px ${GRID_MM * k}px`,
            }}
          />
        )}
        {view.safe && pg.safe > 0 && (
          <div
            aria-hidden
            className="absolute pointer-events-none border border-dashed border-sky-500/60"
            style={{ inset: pg.safe * k }}
          />
        )}
        {view.bleed && pg.bleed > 0 && (
          <div
            aria-hidden
            className="absolute pointer-events-none border border-rose-500/50"
            style={{ inset: -pg.bleed * k }}
          />
        )}
        {guide.v && (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-fuchsia-500 pointer-events-none"
            style={{ left: W / 2 }}
          />
        )}
        {guide.h && (
          <div
            aria-hidden
            className="absolute left-0 right-0 h-px bg-fuchsia-500 pointer-events-none"
            style={{ top: H / 2 }}
          />
        )}
        {d.elements.map((el) =>
          el.hidden ? null : (
            <div
              key={el.id}
              data-el={el.id}
              onPointerDown={(e) => startMove(e, el)}
              onDoubleClick={() => onEditText?.(el.id)}
              className={`absolute ${sel.has(el.id) ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/50"} ${el.locked ? "cursor-not-allowed" : readOnly ? "cursor-default" : "cursor-move"}`}
              style={{
                left: el.x * k,
                top: el.y * k,
                width: el.w * k,
                height: el.h * k,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                zIndex: 1000,
              }}
            />
          ),
        )}
        {one && !one.locked && !readOnly && !one.hidden && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: one.x * k,
              top: one.y * k,
              width: one.w * k,
              height: one.h * k,
              transform: one.rotation ? `rotate(${one.rotation}deg)` : undefined,
              zIndex: 1001,
            }}
          >
            {HANDLES.map((h) => (
              <span
                key={h}
                onPointerDown={(e) => startResize(e, one, h)}
                className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-sm pointer-events-auto"
                style={handlePos(h)}
              />
            ))}
            <span
              onPointerDown={(e) => startRotate(e, one)}
              className="absolute left-1/2 -top-6 -ml-1.5 w-3 h-3 rounded-full bg-gold border-2 border-white shadow pointer-events-auto cursor-grab"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function handlePos(h: Handle): React.CSSProperties {
  const s: React.CSSProperties = { marginLeft: -5, marginTop: -5 };
  s.left = h.includes("w") ? 0 : h.includes("e") ? "100%" : "50%";
  s.top = h.includes("n") ? 0 : h.includes("s") ? "100%" : "50%";
  s.cursor = `${h}-resize`;
  return s;
}

function Rulers({ w, h, k }: { w: number; h: number; k: number }) {
  const ticks = (n: number) => Array.from({ length: Math.floor(n / 10) + 1 }, (_, i) => i * 10);
  const bg = (dir: "right" | "bottom") =>
    `repeating-linear-gradient(to ${dir}, rgba(0,0,0,.35) 0 1px, transparent 1px ${10 * k}px)`;
  return (
    <>
      <div
        aria-hidden
        className="absolute top-0 h-[20px] bg-card border-b border-border text-[0.5rem] text-muted-foreground overflow-hidden"
        style={{
          left: 22,
          width: w * k,
          backgroundImage: bg("right"),
          backgroundSize: `100% 6px`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "bottom",
        }}
        dir="ltr"
      >
        {ticks(w)
          .filter((v) => v % 50 === 0)
          .map((v) => (
            <span key={v} className="absolute top-0.5" style={{ left: v * k + 2 }}>
              {v}
            </span>
          ))}
      </div>
      <div
        aria-hidden
        className="absolute left-0 w-[20px] bg-card border-e border-border text-[0.5rem] text-muted-foreground overflow-hidden"
        style={{
          top: 22,
          height: h * k,
          backgroundImage: bg("bottom"),
          backgroundSize: `6px 100%`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right",
        }}
        dir="ltr"
      >
        {ticks(h)
          .filter((v) => v % 50 === 0)
          .map((v) => (
            <span key={v} className="absolute left-0.5" style={{ top: v * k + 2 }}>
              {v}
            </span>
          ))}
      </div>
    </>
  );
}
