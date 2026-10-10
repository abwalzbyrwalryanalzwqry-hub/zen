import { useT } from "@/lib/i18n";
import type { EditorAction } from "@/lib/certificates/editor";
import type { CertElement, Design, Palette, TextEl } from "@/lib/certificates/model";
import { Section, Toggle } from "./fields";
import { layerLabel } from "./helpers";

/**
 * «تعديل سريع» للجوال (1.25.0، فحص الاستوديو M7): التحرير الدقيق بالإصبع صعب، فهنا ما يحتاجه أغلب المعلّمين —
 * نصوص الشهادة، ولونا الهوية، وإظهار الشعار والختم والتواقيع — دون سحب أو تحجيم. المصمم الكامل للجهاز اللوحي والويب.
 */
const SHOWABLE = new Set<CertElement["type"]>(["image", "signature", "qr"]);

export function QuickEdit({
  design,
  dispatch,
  readOnly,
}: {
  design: Design;
  dispatch: (a: EditorAction) => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const texts = design.elements.filter((e): e is TextEl => e.type === "text" && !e.locked);
  const media = design.elements.filter((e) => SHOWABLE.has(e.type) && !e.locked);
  const label = (e: CertElement) => layerLabel(e, t);
  return (
    <div className="space-y-4">
      <p className="text-[0.6875rem] text-muted-foreground">{t("certificates.quick.hint")}</p>
      <Section title={t("certificates.quick.texts")}>
        <div className="space-y-3">
          {!texts.length && (
            <p className="text-xs text-muted-foreground">{t("certificates.none")}</p>
          )}
          {texts.map((e) => (
            <label key={e.id} className="block space-y-1">
              <span className="block text-[0.6875rem] font-bold text-muted-foreground">
                {label(e)}
              </span>
              <textarea
                value={e.text}
                disabled={readOnly}
                rows={Math.min(4, Math.max(1, Math.ceil(e.text.length / 40)))}
                dir="auto"
                onChange={(ev) =>
                  dispatch({
                    type: "update",
                    ids: [e.id],
                    patch: { text: ev.target.value.slice(0, 2000) },
                    merge: true,
                  })
                }
                className="w-full rounded-xl bg-card border border-border p-2 text-sm"
              />
            </label>
          ))}
        </div>
      </Section>
      <Section title={t("certificates.designer.palette")}>
        <div className="grid grid-cols-2 gap-3">
          {(["primary", "accent"] as (keyof Palette)[]).map((k) => (
            <label key={k} className="block space-y-1">
              <span className="block text-[0.6875rem] font-bold text-muted-foreground">
                {t(`certificates.prop.palette.${k}`)}
              </span>
              <input
                type="color"
                disabled={readOnly}
                value={design.palette[k]}
                onChange={(ev) => dispatch({ type: "palette", patch: { [k]: ev.target.value } })}
                className="w-full h-10 rounded-xl border border-border bg-transparent p-0"
              />
            </label>
          ))}
        </div>
      </Section>
      {media.length > 0 && (
        <Section title={t("certificates.quick.show")}>
          <div className="space-y-2">
            {media.map((e) => (
              <Toggle
                key={e.id}
                label={label(e)}
                checked={!e.hidden}
                disabled={readOnly}
                onChange={(v) => dispatch({ type: "update", ids: [e.id], patch: { hidden: !v } })}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
