import type { ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Scissors,
  SendToBack,
  Trash2,
  Undo2,
  Ungroup,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Align, EditorAction, EditorState } from "@/lib/certificates/editor";
import type { ViewOpts } from "./DesignCanvas";

/**
 * شريط أدوات المصمم (فُصل من Designer.tsx في 1.25.0، فحص الاستوديو L6). على الجوال سطر واحد يُمرَّر أفقياً بدل
 * أسطر تدفع اللوحة فوق ما بعدها (M7)؛ لكل زر اسم مقروء (aria-label/title).
 */
export function DesignerToolbar({
  state,
  readOnly,
  act,
  align,
  zoom: z,
  setZoom,
  view,
  setView,
}: {
  state: EditorState;
  readOnly?: boolean;
  act: (a: EditorAction) => void;
  align: (a: Align) => void;
  zoom: number;
  setZoom: (z: number | null) => void;
  view: ViewOpts;
  setView: (v: ViewOpts) => void;
}) {
  const t = useT();
  const sel = state.selection;
  const none = sel.length === 0;
  const ic = "w-4 h-4";
  const tb = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      disabled={readOnly || disabled}
      onClick={onClick}
      className="shrink-0 p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"
    >
      {icon}
    </button>
  );
  return (
    <div
      role="toolbar"
      aria-label={t("certificates.designer.tools")}
      className="shrink-0 flex items-center gap-0.5 flex-nowrap overflow-x-auto lg:flex-wrap border-b border-border/60 bg-card/60 px-2 py-1"
    >
      {tb(
        t("certificates.designer.undo"),
        <Undo2 className={ic} />,
        () => act({ type: "undo" }),
        !state.past.length,
      )}
      {tb(
        t("certificates.designer.redo"),
        <Redo2 className={ic} />,
        () => act({ type: "redo" }),
        !state.future.length,
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {tb(
        t("certificates.designer.copy"),
        <Copy className={ic} />,
        () => act({ type: "copy", ids: sel }),
        none,
      )}
      {tb(
        t("certificates.designer.cut"),
        <Scissors className={ic} />,
        () => act({ type: "cut", ids: sel }),
        none,
      )}
      {tb(
        t("certificates.designer.paste"),
        <ClipboardPaste className={ic} />,
        () => act({ type: "paste" }),
        !state.clipboard?.length,
      )}
      {tb(
        t("certificates.designer.duplicate"),
        <CopyPlus className={ic} />,
        () => act({ type: "duplicate", ids: sel }),
        none,
      )}
      {tb(
        t("certificates.designer.delete"),
        <Trash2 className={ic} />,
        () => act({ type: "remove", ids: sel }),
        none,
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {tb(
        t("certificates.designer.alignRight"),
        <AlignEndVertical className={ic} />,
        () => align("right"),
        none,
      )}
      {tb(
        t("certificates.designer.alignHCenter"),
        <AlignCenterVertical className={ic} />,
        () => align("hcenter"),
        none,
      )}
      {tb(
        t("certificates.designer.alignLeft"),
        <AlignStartVertical className={ic} />,
        () => align("left"),
        none,
      )}
      {tb(
        t("certificates.designer.alignTop"),
        <AlignStartHorizontal className={ic} />,
        () => align("top"),
        none,
      )}
      {tb(
        t("certificates.designer.alignVCenter"),
        <AlignCenterHorizontal className={ic} />,
        () => align("vcenter"),
        none,
      )}
      {tb(
        t("certificates.designer.alignBottom"),
        <AlignEndHorizontal className={ic} />,
        () => align("bottom"),
        none,
      )}
      {tb(
        t("certificates.designer.distributeH"),
        <AlignHorizontalSpaceAround className={ic} />,
        () => act({ type: "distribute", ids: sel, axis: "h" }),
        sel.length < 3,
      )}
      {tb(
        t("certificates.designer.distributeV"),
        <AlignVerticalSpaceAround className={ic} />,
        () => act({ type: "distribute", ids: sel, axis: "v" }),
        sel.length < 3,
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {tb(
        t("certificates.designer.group"),
        <Group className={ic} />,
        () => act({ type: "group", ids: sel }),
        sel.length < 2,
      )}
      {tb(
        t("certificates.designer.ungroup"),
        <Ungroup className={ic} />,
        () => act({ type: "ungroup", ids: sel }),
        none,
      )}
      {tb(
        t("certificates.designer.front"),
        <BringToFront className={ic} />,
        () => act({ type: "order", ids: sel, to: "front" }),
        none,
      )}
      {tb(
        t("certificates.designer.back"),
        <SendToBack className={ic} />,
        () => act({ type: "order", ids: sel, to: "back" }),
        none,
      )}
      <span className="flex-1" />
      <button
        type="button"
        aria-label={t("certificates.preview.zoomOut")}
        title={t("certificates.preview.zoomOut")}
        onClick={() => setZoom(Math.max(0.2, +(z - 0.1).toFixed(2)))}
        className="p-1.5 rounded-lg hover:bg-muted"
      >
        <Minus className={ic} />
      </button>
      <span className="text-[0.6875rem] font-bold w-10 text-center tabular-nums" dir="ltr">
        {Math.round(z * 100)}%
      </span>
      <button
        type="button"
        aria-label={t("certificates.preview.zoomIn")}
        title={t("certificates.preview.zoomIn")}
        onClick={() => setZoom(Math.min(3, +(z + 0.1).toFixed(2)))}
        className="p-1.5 rounded-lg hover:bg-muted"
      >
        <Plus className={ic} />
      </button>
      <button
        type="button"
        aria-label={t("certificates.preview.fit")}
        title={t("certificates.preview.fit")}
        onClick={() => setZoom(null)}
        className="p-1.5 rounded-lg hover:bg-muted"
      >
        <Maximize className={ic} />
      </button>
      <ViewToggles view={view} setView={setView} />
    </div>
  );
}

function ViewToggles({ view, setView }: { view: ViewOpts; setView: (v: ViewOpts) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-0.5 ms-1">
      {(Object.keys(view) as (keyof ViewOpts)[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={view[k]}
          onClick={() => setView({ ...view, [k]: !view[k] })}
          className={`px-1.5 py-1 rounded-md text-[0.625rem] font-bold ${view[k] ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
        >
          {t(`certificates.designer.${k}`)}
        </button>
      ))}
    </div>
  );
}
