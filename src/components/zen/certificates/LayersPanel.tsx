import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EditorAction, EditorState } from "@/lib/certificates/editor";
import { resolveText } from "@/lib/certificates/variables";
import { layerLabel } from "./helpers";

/** لوحة الطبقات: الأعلى أولاً، مع إظهار/إخفاء وقفل وترتيب. سحب الطبقة يعادله زرّا الأعلى/الأسفل (يعمل باللمس). */
export function LayersPanel({
  state,
  dispatch,
  readOnly,
}: {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const els = state.design.elements;
  const rows = els.map((e, i) => ({ e, i })).reverse();
  return (
    <ul className="space-y-1" aria-label={t("certificates.designer.layers")}>
      {rows.map(({ e, i }) => {
        const on = state.selection.includes(e.id);
        return (
          <li
            key={e.id}
            className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs ${on ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"} ${e.hidden ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-start truncate py-0.5"
              onClick={(ev) => dispatch({ type: "select", ids: [e.id], additive: ev.shiftKey })}
              aria-pressed={on}
              title={e.type === "text" ? resolveText(e.text, {}).text : undefined}
            >
              {e.groupId && <span className="text-gold me-1">⧉</span>}
              {layerLabel(e, t)}
            </button>
            {!readOnly && (
              <>
                <IconBtn
                  label={t(e.hidden ? "certificates.designer.show" : "certificates.designer.hide")}
                  onClick={() =>
                    dispatch({ type: "update", ids: [e.id], patch: { hidden: !e.hidden } })
                  }
                >
                  {e.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </IconBtn>
                <IconBtn
                  label={t(
                    e.locked ? "certificates.designer.unlock" : "certificates.designer.lock",
                  )}
                  onClick={() =>
                    dispatch({ type: "update", ids: [e.id], patch: { locked: !e.locked } })
                  }
                >
                  {e.locked ? (
                    <Lock className="w-3.5 h-3.5 text-gold" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </IconBtn>
                <IconBtn
                  label={t("certificates.designer.forward")}
                  disabled={i === els.length - 1}
                  onClick={() => dispatch({ type: "reorder", from: i, to: i + 1 })}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </IconBtn>
                <IconBtn
                  label={t("certificates.designer.backward")}
                  disabled={i === 0}
                  onClick={() => dispatch({ type: "reorder", from: i, to: i - 1 })}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </IconBtn>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="p-1 rounded hover:bg-background disabled:opacity-30"
    >
      {children}
    </button>
  );
}
