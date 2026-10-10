import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { PencilRuler, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  editorReducer,
  initEditor,
  type Align,
  type EditorAction,
} from "@/lib/certificates/editor";
import type { CertElement, Design } from "@/lib/certificates/model";
import { composePage, type Sources } from "@/lib/certificates/compose";
import { domMeasurer } from "@/lib/certificates/fit";
import type { VarBag } from "@/lib/certificates/variables";
import { useLatest } from "@/hooks/use-latest";
import { DesignCanvas, type ViewOpts } from "./DesignCanvas";
import { Inspector, type ImageOption } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { PagePanel } from "./PagePanel";
import { ToolPalette } from "./ToolPalette";
import { DesignerToolbar } from "./DesignerToolbar";
import { QuickEdit } from "./QuickEdit";
import { MM_PX, useElementWidth } from "./hooks";

type Tab = "props" | "layers" | "page";

import { FirstUseTip } from "@/components/zen/common/FirstUseTip";
/**
 * مصمم الشهادة: لوحة رسم بالعناصر (لا صورة ثابتة)، أدوات، طبقات، خصائص، ومعاينة حية على طالب. كل تعديل خطوة
 * تراجع، والحالة تُرفع للأب للحفظ التلقائي. اختصارات: Ctrl+Z/Y، Ctrl+C/X/V/D، Ctrl+G، Delete، الأسهم (Shift: 5 مم).
 */
export function Designer({
  initial,
  onChange,
  readOnly,
  vars,
  sources,
  images,
  onUpload,
  side,
  typeName,
}: {
  initial: Design;
  onChange?: (d: Design) => void;
  readOnly?: boolean;
  vars: VarBag;
  sources: Sources;
  images: ImageOption[];
  onUpload?: (file: File) => Promise<string | null>;
  /** محتوى إضافي أعلى اللوحة الجانبية (اسم القالب، المعاينة على طالب…). */
  side?: ReactNode;
  typeName?: string;
}) {
  const t = useT();
  const [state, dispatch] = useReducer(editorReducer, initial, initEditor);
  const [tab, setTab] = useState<Tab>("page");
  // M7 (1.25.0): على الشاشات الضيقة يبدأ «التعديل السريع»، والمصمم الكامل بنقرة.
  const [quick, setQuick] = useState(
    () =>
      !readOnly &&
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(max-width: 1023px)").matches,
  );
  const [zoom, setZoom] = useState<number | null>(null);
  const [view, setView] = useState<ViewOpts>({
    grid: false,
    guides: true,
    rulers: true,
    snap: true,
    safe: true,
    bleed: false,
  });
  const [measure] = useState(() => (typeof document !== "undefined" ? domMeasurer() : null));
  const { ref: boxRef, width: boxW } = useElementWidth<HTMLDivElement>();
  const textRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const changed = useLatest(onChange);

  useEffect(() => {
    if (state.rev > 0) changed.current?.(state.design);
  }, [state.rev, state.design, changed]);

  const d = state.design;
  const fitZoom = boxW ? Math.max(0.2, Math.min(2, (boxW - 48) / (d.page.width * MM_PX))) : 0.5;
  const z = zoom ?? fitZoom;
  const composed = composePage(d, vars, sources, {
    uid: "dz",
    pending: true,
    placeholders: true,
    measure,
  });
  const sel = state.selection;
  const one = sel.length === 1 ? (d.elements.find((e) => e.id === sel[0]) ?? null) : null;
  const act = (a: EditorAction) => !readOnly && dispatch(a);
  /** التحديد من اللوحة أو الطبقات يفتح الخصائص (إلا إن كانت الطبقات مفتوحة). */
  const pick = (a: EditorAction) => {
    if (a.type === "select" && a.ids.length && tab === "page") setTab("props");
    dispatch(a);
  };

  const keys = useLatest((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") act({ type: e.shiftKey ? "redo" : "undo" });
    else if (mod && k === "y") act({ type: "redo" });
    else if (mod && k === "c") act({ type: "copy", ids: sel });
    else if (mod && k === "x") act({ type: "cut", ids: sel });
    else if (mod && k === "v") act({ type: "paste" });
    else if (mod && k === "d") act({ type: "duplicate", ids: sel });
    else if (mod && k === "g") act({ type: e.shiftKey ? "ungroup" : "group", ids: sel });
    else if ((k === "delete" || k === "backspace") && sel.length) act({ type: "remove", ids: sel });
    else if (k.startsWith("arrow") && sel.length) {
      const s = e.shiftKey ? 5 : 1;
      const dx = k === "arrowleft" ? -s : k === "arrowright" ? s : 0;
      const dy = k === "arrowup" ? -s : k === "arrowdown" ? s : 0;
      act({ type: "move", ids: sel, dx, dy });
    } else if (k === "escape") dispatch({ type: "select", ids: [] });
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [keys]);

  const add = (el: CertElement) => {
    act({ type: "add", element: el });
    setTab("props");
  };
  const align = (a: Align) =>
    act({ type: "align", ids: sel, align: a, to: sel.length > 1 ? "selection" : "page" });
  const none = sel.length === 0;

  return (
    // الجوال: الصفحة كلها تُمرَّر عمودياً واللوحة بارتفاع ثابت، فلا يُضغط عمودها فيرسم فوق ما بعده (M7).
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-y-auto lg:overflow-hidden">
      {!readOnly && (
        <div className="lg:hidden shrink-0 flex gap-1 p-2 border-b border-border/60 bg-card/60">
          {([true, false] as const).map((q) => (
            <button
              key={String(q)}
              type="button"
              aria-pressed={quick === q}
              onClick={() => setQuick(q)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold ${quick === q ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {q ? <Wand2 className="w-4 h-4" /> : <PencilRuler className="w-4 h-4" />}
              {t(q ? "certificates.quick.mode" : "certificates.quick.full")}
            </button>
          ))}
        </div>
      )}
      {!readOnly && !quick && (
        <ToolPalette
          design={d}
          onAdd={add}
          onBackground={() => {
            dispatch({ type: "select", ids: [] });
            setTab("page");
          }}
          typeName={typeName}
        />
      )}
      <div className="shrink-0 lg:shrink lg:flex-1 min-w-0 lg:min-h-0 flex flex-col">
        {!readOnly && (
          <div className="px-2 pt-2">
            <FirstUseTip id="designer" />
          </div>
        )}
        {!quick && (
          <DesignerToolbar
            state={state}
            readOnly={readOnly}
            act={act}
            align={align}
            zoom={z}
            setZoom={setZoom}
            view={view}
            setView={setView}
          />
        )}
        <div
          ref={boxRef}
          className="relative isolate h-[46vh] min-h-[260px] lg:h-auto lg:flex-1 lg:min-h-[320px] overflow-auto bg-[repeating-linear-gradient(45deg,hsl(var(--muted))_0_8px,hsl(var(--background))_8px_16px)]"
        >
          <div className="p-6 w-max min-w-full flex justify-center">
            <DesignCanvas
              state={state}
              dispatch={pick}
              html={composed.html}
              zoom={z}
              view={view}
              readOnly={readOnly}
              onEditText={() => {
                setTab("props");
                setTimeout(() => textRef.current?.focus(), 0);
              }}
            />
          </div>
        </div>
      </div>
      <aside className="w-full lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-s border-border/60 bg-card/50 flex flex-col lg:min-h-0">
        {side && <div className="p-3 border-b border-border/60 space-y-2">{side}</div>}
        {quick ? (
          <div className="p-3">
            <QuickEdit design={d} dispatch={act} readOnly={readOnly} />
          </div>
        ) : (
          <>
            <div role="tablist" className="flex border-b border-border/60 text-xs font-bold">
              {(["props", "layers", "page"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`flex-1 py-2 ${tab === k ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
                >
                  {t(
                    k === "props"
                      ? "certificates.designer.properties"
                      : k === "layers"
                        ? "certificates.designer.layers"
                        : "certificates.designer.page",
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {tab === "layers" ? (
                <LayersPanel state={state} dispatch={dispatch} readOnly={readOnly} />
              ) : tab === "page" || none ? (
                tab === "props" && none ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {t("certificates.designer.noSelection")}
                  </p>
                ) : (
                  <PagePanel
                    design={d}
                    dispatch={dispatch}
                    readOnly={readOnly}
                    images={images}
                    onUpload={onUpload}
                  />
                )
              ) : one ? (
                <Inspector
                  el={one}
                  palette={d.palette}
                  readOnly={readOnly}
                  images={images}
                  onUpload={onUpload}
                  focusRef={(x) => (textRef.current = x)}
                  onChange={(patch) => act({ type: "update", ids: [one.id], patch })}
                />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {t("certificates.designer.multi", { n: sel.length })}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
