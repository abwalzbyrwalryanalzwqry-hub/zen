import { useT } from "@/lib/i18n";
import type { EditorAction } from "@/lib/certificates/editor";
import {
  MAX_PAGE_MM,
  MIN_PAGE_MM,
  pageDims,
  type Design,
  type Palette,
  type PageSizeKey,
  type PatternKind,
} from "@/lib/certificates/model";
import { ColorField, Field, Num, Section, Sel, grid2 } from "./fields";
import { ImageSelect, type ImageOption } from "./Inspector";

const PATTERNS: PatternKind[] = ["none", "girih", "stars", "lattice", "dots"];

/** إعدادات الصفحة حين لا يكون عنصر محدداً: القياس والاتجاه والهوامش والخلفية وألوان القالب والأرقام. */
export function PagePanel({
  design,
  dispatch,
  readOnly,
  images,
  onUpload,
}: {
  design: Design;
  dispatch: (a: EditorAction) => void;
  readOnly?: boolean;
  images: ImageOption[];
  onUpload?: (file: File) => Promise<string | null>;
}) {
  const t = useT();
  const pg = design.page;
  const page = (patch: Partial<Design["page"]>) => dispatch({ type: "page", patch });
  const setSize = (size: PageSizeKey, orientation = pg.orientation) =>
    page(
      size === "custom"
        ? { size, orientation }
        : { size, orientation, ...pageDims(size, orientation) },
    );
  return (
    <div className="space-y-3">
      <Section title={t("certificates.designer.page")}>
        <div className={grid2}>
          <Sel
            label={t("certificates.designer.size")}
            value={pg.size}
            options={[
              { value: "A4", label: "A4" },
              { value: "A5", label: "A5" },
              { value: "Letter", label: "Letter" },
              { value: "custom", label: t("certificates.designer.custom") },
            ]}
            onChange={(s) => setSize(s)}
            disabled={readOnly}
          />
          <Sel
            label={t("certificates.designer.orientation")}
            value={pg.orientation}
            options={[
              { value: "landscape", label: t("certificates.designer.landscape") },
              { value: "portrait", label: t("certificates.designer.portrait") },
            ]}
            onChange={(o) =>
              pg.size === "custom"
                ? page({ orientation: o, width: pg.height, height: pg.width })
                : setSize(pg.size, o)
            }
            disabled={readOnly}
          />
          {pg.size === "custom" && (
            <>
              <Num
                label={t("certificates.designer.width")}
                value={pg.width}
                min={MIN_PAGE_MM}
                max={MAX_PAGE_MM}
                onChange={(width) => page({ width })}
                disabled={readOnly}
              />
              <Num
                label={t("certificates.designer.height")}
                value={pg.height}
                min={MIN_PAGE_MM}
                max={MAX_PAGE_MM}
                onChange={(height) => page({ height })}
                disabled={readOnly}
              />
            </>
          )}
          <Num
            label={t("certificates.designer.safe")}
            value={pg.safe}
            min={0}
            max={40}
            step={0.5}
            onChange={(safe) => page({ safe })}
            disabled={readOnly}
          />
          <Num
            label={t("certificates.designer.bleed")}
            value={pg.bleed}
            min={0}
            max={10}
            step={0.5}
            onChange={(bleed) => page({ bleed })}
            disabled={readOnly}
          />
        </div>
      </Section>
      <Section title={t("certificates.designer.background")}>
        <ColorField
          label={t("certificates.designer.background")}
          value={pg.background}
          palette={design.palette}
          onChange={(background) => page({ background })}
          disabled={readOnly}
        />
        <ImageSelect
          label={t("certificates.designer.backgroundImage")}
          value={pg.backgroundImage ?? ""}
          options={images}
          onChange={(v) => page({ backgroundImage: v || null })}
          onUpload={onUpload}
          disabled={readOnly}
        />
        <div className={grid2}>
          <Sel
            label={t("certificates.designer.pattern")}
            value={pg.pattern?.kind ?? "none"}
            options={PATTERNS.map((p) => ({ value: p, label: t(`certificates.pattern.${p}`) }))}
            onChange={(kind) =>
              page({
                pattern:
                  kind === "none"
                    ? null
                    : {
                        kind,
                        color: pg.pattern?.color ?? "$accent",
                        opacity: pg.pattern?.opacity ?? 0.12,
                      },
              })
            }
            disabled={readOnly}
          />
          {pg.pattern && (
            <Num
              label={t("certificates.designer.patternOpacity")}
              value={Math.round(pg.pattern.opacity * 100)}
              min={2}
              max={60}
              onChange={(v) => page({ pattern: { ...pg.pattern!, opacity: v / 100 } })}
              disabled={readOnly}
            />
          )}
        </div>
        {pg.pattern && (
          <ColorField
            label={t("certificates.prop.color")}
            value={pg.pattern.color}
            palette={design.palette}
            onChange={(color) => page({ pattern: { ...pg.pattern!, color } })}
            disabled={readOnly}
          />
        )}
      </Section>
      <Section title={t("certificates.designer.palette")}>
        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(design.palette) as (keyof Palette)[]).map((k) => (
            <Field key={k} label={t(`certificates.prop.palette.${k}`)}>
              {(id) => (
                <input
                  id={id}
                  type="color"
                  disabled={readOnly}
                  value={design.palette[k]}
                  onChange={(e) => dispatch({ type: "palette", patch: { [k]: e.target.value } })}
                  className="w-full h-8 rounded border border-border bg-transparent p-0"
                />
              )}
            </Field>
          ))}
        </div>
      </Section>
      <Section title={t("certificates.designer.numbers")}>
        <div className={grid2}>
          <Sel
            label={t("certificates.designer.numbers")}
            value={design.numbers.digits}
            options={[
              { value: "arab", label: t("certificates.designer.digitsArab") },
              { value: "latn", label: t("certificates.designer.digitsLatn") },
            ]}
            onChange={(digits) => dispatch({ type: "numbers", patch: { digits } })}
            disabled={readOnly}
          />
          <Sel
            label={t("certificates.var.certificate.date")}
            value={design.numbers.calendar}
            options={[
              { value: "gregorian", label: t("certificates.designer.calGregorian") },
              { value: "hijri", label: t("certificates.designer.calHijri") },
              { value: "both", label: t("certificates.designer.calBoth") },
            ]}
            onChange={(calendar) => dispatch({ type: "numbers", patch: { calendar } })}
            disabled={readOnly}
          />
        </div>
      </Section>
    </div>
  );
}
