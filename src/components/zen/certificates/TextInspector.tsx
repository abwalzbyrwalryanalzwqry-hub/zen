import { useRef } from "react";
import { useT } from "@/lib/i18n";
import {
  FONT_FAMILY,
  FONT_WEIGHTS,
  type FontSpec,
  type Palette,
  type SignatureEl,
  type TextEl,
} from "@/lib/certificates/model";
import { insertToken, VARIABLES } from "@/lib/certificates/variables";
import { ColorField, Num, Section, Sel, Toggle, Txt, grid2 } from "./fields";
import { SIGNER_PRESETS } from "./helpers";

const PRESETS: Record<string, Partial<FontSpec> & { autoFit?: boolean }> = {
  title: { weight: 900, size: 34, color: "$primary", align: "center", lineHeight: 1.2 },
  name: { weight: 900, size: 30, color: "$ink", align: "center", lineHeight: 1.2, autoFit: true },
  body: { weight: 400, size: 14, color: "$ink", align: "center", lineHeight: 1.75 },
  small: { weight: 400, size: 9, color: "$muted", align: "center", lineHeight: 1.4 },
  number: { weight: 500, size: 9, color: "$muted", align: "left", lineHeight: 1.2, dir: "ltr" },
};

/** منتقي المتغيّرات: يُدرج {{…}} عند موضع المؤشر. */
export function VariablePicker({
  onPick,
  disabled,
}: {
  onPick: (key: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const groups = [...new Set(VARIABLES.filter((v) => !v.image).map((v) => v.group))];
  return (
    <select
      aria-label={t("certificates.prop.insertVar")}
      disabled={disabled}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="w-full rounded-lg bg-gold/10 border border-gold/40 px-2 py-1.5 text-xs font-bold"
    >
      <option value="">{t("certificates.prop.insertVar")}</option>
      {groups.map((g) => (
        <optgroup key={g} label={t(`certificates.var.${g}`)}>
          {VARIABLES.filter((v) => v.group === g && !v.image).map((v) => (
            <option key={v.key} value={v.key}>
              {t(`certificates.var.${v.key}`)} — {`{{${v.key}}}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function FontFields({
  font,
  palette,
  onFont,
  disabled,
}: {
  font: FontSpec;
  palette: Palette;
  onFont: (p: Partial<FontSpec>) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <>
      <div className={grid2}>
        <Sel
          label={t("certificates.prop.font")}
          value={font.family}
          options={[{ value: FONT_FAMILY, label: t("certificates.designer.fontUi") }]}
          onChange={() => undefined}
          disabled
        />
        <Sel
          label={t("certificates.prop.weight")}
          value={font.weight}
          options={FONT_WEIGHTS.map((w) => ({ value: w, label: t(`certificates.prop.w${w}`) }))}
          onChange={(weight) => onFont({ weight })}
          disabled={disabled}
        />
        <Num
          label={t("certificates.prop.size")}
          value={font.size}
          step={0.5}
          min={4}
          max={200}
          onChange={(size) => onFont({ size })}
          disabled={disabled}
        />
        <Num
          label={t("certificates.prop.lineHeight")}
          value={font.lineHeight}
          step={0.05}
          min={0.8}
          max={3}
          onChange={(lineHeight) => onFont({ lineHeight })}
          disabled={disabled}
        />
        <Num
          label={t("certificates.prop.letterSpacing")}
          value={font.letterSpacing}
          step={0.01}
          min={-0.1}
          max={1}
          onChange={(letterSpacing) => onFont({ letterSpacing })}
          disabled={disabled}
        />
        <Sel
          label={t("certificates.prop.dir")}
          value={font.dir}
          options={[
            { value: "rtl", label: t("certificates.prop.dirRtl") },
            { value: "ltr", label: t("certificates.prop.dirLtr") },
            { value: "auto", label: t("certificates.prop.dirAuto") },
          ]}
          onChange={(dir) => onFont({ dir })}
          disabled={disabled}
        />
      </div>
      <Sel
        label={t("certificates.prop.align")}
        value={font.align}
        options={(["right", "center", "left", "justify"] as const).map((a) => ({
          value: a,
          label: t(`certificates.prop.align${a[0].toUpperCase()}${a.slice(1)}`),
        }))}
        onChange={(align) => onFont({ align })}
        disabled={disabled}
      />
      <ColorField
        label={t("certificates.prop.color")}
        value={font.color}
        palette={palette}
        onChange={(color) => onFont({ color })}
        disabled={disabled}
      />
    </>
  );
}

/** مساعد الصياغة (1.26.0، الفكرة 9): عبارات تقدير محايدة للجنس حسب نوع الشهادة، يختارها المعلّم ثم يعدّلها. */
const PHRASE_GROUPS = [
  "memorization",
  "completion",
  "attendance",
  "excellence",
  "participation",
  "thanks",
  "revision",
  "ijazah",
] as const;
const PHRASE_KEYS = ["a", "b", "c"] as const;

function PhrasePicker({ onPick, disabled }: { onPick: (t: string) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <label className="block space-y-1">
      <span className="block text-[0.6875rem] font-bold text-muted-foreground">
        {t("certificates.phrase.title")}
      </span>
      <select
        value=""
        disabled={disabled}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="w-full rounded-xl bg-card border border-border px-2 py-1.5 text-xs"
      >
        <option value="">{t("certificates.phrase.pick")}</option>
        {PHRASE_GROUPS.map((g) => (
          <optgroup key={g} label={t(`certificates.phrase.group.${g}`)}>
            {PHRASE_KEYS.map((k) => {
              const v = t(`certificates.phrase.${g}.${k}`);
              return (
                <option key={k} value={v}>
                  {v.length > 70 ? `${v.slice(0, 70)}…` : v}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function TextInspector({
  el,
  palette,
  onChange,
  disabled,
  focusRef,
}: {
  el: TextEl;
  palette: Palette;
  onChange: (p: Partial<TextEl>) => void;
  disabled?: boolean;
  focusRef?: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
}) {
  const t = useT();
  const area = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const insert = (key: string) => {
    const at = area.current?.selectionStart ?? el.text.length;
    onChange({ text: insertToken(el.text, key, at) });
  };
  return (
    <>
      <Section title={t("certificates.prop.content")}>
        <Txt
          label={t("certificates.prop.content")}
          value={el.text}
          multiline
          disabled={disabled}
          onChange={(text) => onChange({ text })}
          inputRef={(x) => {
            area.current = x;
            focusRef?.(x);
          }}
        />
        <VariablePicker onPick={insert} disabled={disabled} />
        {(el.role === "body" || el.text.includes("achievement.description")) && (
          <PhrasePicker disabled={disabled} onPick={(text) => onChange({ text })} />
        )}
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={t("certificates.prop.presets")}
        >
          {Object.entries(PRESETS).map(([k, p]) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onClick={() => {
                const { autoFit, ...font } = p;
                onChange({
                  font: { ...el.font, ...font },
                  ...(autoFit
                    ? { autoFit: { enabled: true, min: Math.min(14, font.size ?? 14) } }
                    : {}),
                });
              }}
              className="rounded-lg border border-border px-2 py-1 text-[0.6875rem] hover:bg-muted"
            >
              {t(`certificates.preset.${k}`)}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("certificates.prop.font")}>
        <FontFields
          font={el.font}
          palette={palette}
          onFont={(f) => onChange({ font: { ...el.font, ...f } })}
          disabled={disabled}
        />
        <div className={grid2}>
          <Sel
            label={t("certificates.prop.vAlign")}
            value={el.vAlign}
            options={(["top", "middle", "bottom"] as const).map((v) => ({
              value: v,
              label: t(`certificates.prop.v${v[0].toUpperCase()}${v.slice(1)}`),
            }))}
            onChange={(vAlign) => onChange({ vAlign })}
            disabled={disabled}
          />
          <Num
            label={t("certificates.prop.padding")}
            value={el.padding}
            step={0.5}
            min={0}
            max={30}
            onChange={(padding) => onChange({ padding })}
            disabled={disabled}
          />
        </div>
        <Toggle
          label={t("certificates.prop.autoFit")}
          checked={el.autoFit.enabled}
          onChange={(enabled) => onChange({ autoFit: { ...el.autoFit, enabled } })}
          disabled={disabled}
        />
        {el.autoFit.enabled && (
          <Num
            label={t("certificates.prop.autoFitMin")}
            value={el.autoFit.min}
            step={0.5}
            min={4}
            max={el.font.size}
            onChange={(min) => onChange({ autoFit: { ...el.autoFit, min } })}
            disabled={disabled}
          />
        )}
      </Section>
    </>
  );
}

export function SignatureInspector({
  el,
  palette,
  onChange,
  disabled,
  imageSelect,
}: {
  el: SignatureEl;
  palette: Palette;
  onChange: (p: Partial<SignatureEl>) => void;
  disabled?: boolean;
  imageSelect: React.ReactNode;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("certificates.tool.signature")}>
        {imageSelect}
        <Txt
          label={t("certificates.prop.signerLabel")}
          value={el.label}
          onChange={(label) => onChange({ label })}
          disabled={disabled}
        />
        {/* لا بيانات جنس في النظام: صفة الموقّع تُختار بلمسة، وقالب الحلقة يحفظها لحلقات الطالبات. */}
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("certificates.prop.labelPresets")}
        >
          {SIGNER_PRESETS.map((k) => {
            const v = t(`certificates.sig.${k}`);
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                aria-pressed={el.label === v}
                onClick={() => onChange({ label: v })}
                className="min-h-8 rounded-full border border-border px-2.5 text-[0.6875rem] aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary disabled:opacity-50"
              >
                {v}
              </button>
            );
          })}
        </div>
        <Txt
          label={t("certificates.prop.signer")}
          value={el.signer}
          onChange={(signer) => onChange({ signer })}
          disabled={disabled}
        />
        <VariablePicker
          onPick={(k) => onChange({ signer: insertToken(el.signer, k) })}
          disabled={disabled}
        />
        <Toggle
          label={t("certificates.prop.showLine")}
          checked={el.showLine}
          onChange={(showLine) => onChange({ showLine })}
          disabled={disabled}
        />
        <Toggle
          label={t("certificates.prop.required")}
          checked={!!el.required}
          onChange={(required) => onChange({ required })}
          disabled={disabled}
        />
      </Section>
      <Section title={t("certificates.prop.font")}>
        <FontFields
          font={el.font}
          palette={palette}
          onFont={(f) => onChange({ font: { ...el.font, ...f } })}
          disabled={disabled}
        />
        <ColorField
          label={t("certificates.prop.stroke")}
          value={el.lineColor}
          palette={palette}
          onChange={(lineColor) => onChange({ lineColor })}
          disabled={disabled}
        />
      </Section>
    </>
  );
}
