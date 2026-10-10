import { useT } from "@/lib/i18n";
import type { CertElement, FrameKind, OrnamentKind, Palette } from "@/lib/certificates/model";
import { ColorField, Num, Section, Sel, grid2 } from "./fields";

const FRAMES: FrameKind[] = ["classic", "double", "islamic", "royal", "minimal", "corners", "gold"];
const ORNAMENTS: OrnamentKind[] = [
  "rosette",
  "star8",
  "medallion",
  "divider",
  "corner",
  "arch",
  "laurel",
  "book",
  "seal",
  "crescentStar",
];

/** خصائص الأشكال والخطوط والإطارات والزخارف وQR (فُصلت من Inspector.tsx في 1.25.0، فحص الاستوديو L6). */
export function DecorInspector({
  el,
  palette,
  set,
  dis,
}: {
  el: CertElement;
  palette: Palette;
  set: (p: Record<string, unknown>) => void;
  dis: boolean;
}) {
  const t = useT();
  return (
    <>
      {el.type === "shape" && (
        <Section title={t("certificates.tool.shape")}>
          <Sel
            label={t("certificates.prop.shapeKind")}
            value={el.shape}
            options={(["rect", "roundRect", "ellipse"] as const).map((v) => ({
              value: v,
              label: t(`certificates.prop.${v}`),
            }))}
            onChange={(shape) => set({ shape })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.fill")}
            value={el.fill}
            palette={palette}
            onChange={(fill) => set({ fill })}
            allowNone
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.stroke")}
            value={el.stroke}
            palette={palette}
            onChange={(stroke) => set({ stroke })}
            allowNone
            disabled={dis}
          />
          <div className={grid2}>
            <Num
              label={t("certificates.prop.strokeWidth")}
              value={el.strokeWidth}
              step={0.1}
              min={0}
              max={10}
              onChange={(strokeWidth) => set({ strokeWidth })}
              disabled={dis}
            />
            <Num
              label={t("certificates.prop.radius")}
              value={el.radius}
              step={0.5}
              min={0}
              max={50}
              onChange={(radius) => set({ radius })}
              disabled={dis}
            />
          </div>
        </Section>
      )}
      {el.type === "line" && (
        <Section title={t("certificates.tool.line")}>
          <ColorField
            label={t("certificates.prop.stroke")}
            value={el.stroke}
            palette={palette}
            onChange={(stroke) => set({ stroke })}
            disabled={dis}
          />
          <div className={grid2}>
            <Num
              label={t("certificates.prop.strokeWidth")}
              value={el.strokeWidth}
              step={0.1}
              min={0.1}
              max={10}
              onChange={(strokeWidth) => set({ strokeWidth })}
              disabled={dis}
            />
            <Sel
              label={t("certificates.prop.dash")}
              value={el.dash}
              options={(["solid", "dashed", "dotted"] as const).map((v) => ({
                value: v,
                label: t(`certificates.prop.${v}`),
              }))}
              onChange={(dash) => set({ dash })}
              disabled={dis}
            />
          </div>
        </Section>
      )}
      {el.type === "frame" && (
        <Section title={t("certificates.tool.frame")}>
          <Sel
            label={t("certificates.prop.frameKind")}
            value={el.frame}
            options={FRAMES.map((v) => ({ value: v, label: t(`certificates.frame.${v}`) }))}
            onChange={(frame) => set({ frame })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.color")}
            value={el.color}
            palette={palette}
            onChange={(color) => set({ color })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.color2")}
            value={el.color2}
            palette={palette}
            onChange={(color2) => set({ color2 })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.thickness")}
            value={el.thickness}
            step={0.1}
            min={0.2}
            max={4}
            onChange={(thickness) => set({ thickness })}
            disabled={dis}
          />
        </Section>
      )}
      {el.type === "ornament" && (
        <Section title={t("certificates.tool.ornament")}>
          <Sel
            label={t("certificates.prop.ornamentKind")}
            value={el.ornament}
            options={ORNAMENTS.map((v) => ({ value: v, label: t(`certificates.ornament.${v}`) }))}
            onChange={(ornament) => set({ ornament })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.color")}
            value={el.color}
            palette={palette}
            onChange={(color) => set({ color })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.color2")}
            value={el.color2}
            palette={palette}
            onChange={(color2) => set({ color2 })}
            disabled={dis}
          />
        </Section>
      )}
      {el.type === "qr" && (
        <Section title={t("certificates.tool.qr")}>
          <ColorField
            label={t("certificates.prop.qrColor")}
            value={el.color}
            palette={palette}
            onChange={(color) => set({ color })}
            disabled={dis}
          />
          <ColorField
            label={t("certificates.prop.qrBg")}
            value={el.background}
            palette={palette}
            onChange={(background) => set({ background })}
            disabled={dis}
          />
        </Section>
      )}
    </>
  );
}
