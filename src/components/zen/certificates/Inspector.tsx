import { useT } from "@/lib/i18n";
import type { CertElement, ImageEl, Palette } from "@/lib/certificates/model";
import { ColorField, Num, Section, Sel, Toggle, Txt, grid2 } from "./fields";
import { SignatureInspector, TextInspector } from "./TextInspector";
import { DecorInspector } from "./DecorInspector";

export interface ImageOption {
  value: string;
  label: string;
}

/** صندوق اختيار صورة (هوية المركز أو أصوله) مع زر رفع. */
export function ImageSelect({
  label,
  value,
  options,
  onChange,
  onUpload,
  disabled,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options: ImageOption[];
  onChange: (v: string) => void;
  onUpload?: (file: File) => Promise<string | null>;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const t = useT();
  const opts = allowEmpty
    ? [{ value: "", label: t("certificates.prop.noImage") }, ...options]
    : options;
  return (
    <div className="space-y-1.5">
      <Sel label={label} value={value} options={opts} onChange={onChange} disabled={disabled} />
      {onUpload && !disabled && (
        <label className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 px-2 py-1.5 text-[0.6875rem] font-bold text-primary cursor-pointer hover:bg-primary/5">
          {t("certificates.prop.upload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const ref = await onUpload(f);
              if (ref) onChange(ref);
            }}
          />
        </label>
      )}
    </div>
  );
}

export function Inspector({
  el,
  palette,
  onChange,
  readOnly,
  images,
  onUpload,
  focusRef,
}: {
  el: CertElement;
  palette: Palette;
  onChange: (p: Partial<CertElement>) => void;
  readOnly?: boolean;
  images: ImageOption[];
  onUpload?: (file: File) => Promise<string | null>;
  focusRef?: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
}) {
  const t = useT();
  const dis = readOnly || el.locked;
  const set = onChange as (p: Record<string, unknown>) => void;
  return (
    <div className="space-y-3">
      <Section title={t("certificates.designer.properties")}>
        <Txt
          label={t("certificates.prop.layerName")}
          value={el.name ?? ""}
          onChange={(name) => set({ name })}
          disabled={readOnly}
        />
        <div className={grid2}>
          <Num
            label={t("certificates.prop.x")}
            value={el.x}
            step={0.5}
            onChange={(x) => set({ x })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.y")}
            value={el.y}
            step={0.5}
            onChange={(y) => set({ y })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.w")}
            value={el.w}
            step={0.5}
            min={1}
            onChange={(w) => set({ w })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.h")}
            value={el.h}
            step={0.5}
            min={0.5}
            onChange={(h) => set({ h })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.rotation")}
            value={el.rotation}
            min={-180}
            max={180}
            onChange={(rotation) => set({ rotation })}
            disabled={dis}
          />
          <Num
            label={t("certificates.prop.opacity")}
            value={Math.round(el.opacity * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => set({ opacity: v / 100 })}
            disabled={dis}
          />
        </div>
      </Section>
      {el.type === "text" && (
        <TextInspector
          el={el}
          palette={palette}
          onChange={set}
          disabled={dis}
          focusRef={focusRef}
        />
      )}
      {el.type === "signature" && (
        <SignatureInspector
          el={el}
          palette={palette}
          onChange={set}
          disabled={dis}
          imageSelect={
            <ImageSelect
              label={t("certificates.prop.src")}
              value={el.src ?? ""}
              options={images}
              onChange={(src) => set({ src: src || null })}
              onUpload={onUpload}
              disabled={dis}
            />
          }
        />
      )}
      {el.type === "image" && (
        <ImageFields el={el} images={images} onChange={set} onUpload={onUpload} disabled={dis} />
      )}
      <DecorInspector el={el} palette={palette} set={set} dis={!!dis} />
    </div>
  );
}

function ImageFields({
  el,
  images,
  onChange,
  onUpload,
  disabled,
}: {
  el: ImageEl;
  images: ImageOption[];
  onChange: (p: Record<string, unknown>) => void;
  onUpload?: (file: File) => Promise<string | null>;
  disabled?: boolean;
}) {
  const t = useT();
  const crop = el.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const setCrop = (p: Partial<typeof crop>) => {
    const c = { ...crop, ...p };
    c.w = Math.min(c.w, 1 - c.x);
    c.h = Math.min(c.h, 1 - c.y);
    onChange({ crop: c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 ? null : c });
  };
  return (
    <Section title={t("certificates.tool.image")}>
      <ImageSelect
        label={t("certificates.prop.src")}
        value={el.src}
        options={images}
        onChange={(src) => onChange({ src })}
        onUpload={onUpload}
        disabled={disabled}
      />
      <div className={grid2}>
        <Sel
          label={t("certificates.prop.fit")}
          value={el.fit}
          options={(["contain", "cover", "fill"] as const).map((v) => ({
            value: v,
            label: t(`certificates.prop.fit${v[0].toUpperCase()}${v.slice(1)}`),
          }))}
          onChange={(fit) => onChange({ fit })}
          disabled={disabled}
        />
        <Num
          label={t("certificates.prop.radius")}
          value={el.radius}
          step={0.5}
          min={0}
          max={100}
          onChange={(radius) => onChange({ radius })}
          disabled={disabled}
        />
      </div>
      <p className="text-[0.6875rem] font-bold text-muted-foreground">
        {t("certificates.prop.crop")}
      </p>
      <div className={grid2}>
        {(["x", "y", "w", "h"] as const).map((k) => (
          <Num
            key={k}
            label={`${t("certificates.prop.crop")} ${k.toUpperCase()} %`}
            value={Math.round(crop[k] * 100)}
            min={k === "w" || k === "h" ? 5 : 0}
            max={k === "w" || k === "h" ? 100 : 95}
            step={1}
            onChange={(v) => setCrop({ [k]: v / 100 })}
            disabled={disabled}
          />
        ))}
      </div>
      {el.crop && (
        <button
          type="button"
          onClick={() => onChange({ crop: null })}
          className="text-[0.6875rem] text-primary font-bold"
        >
          {t("certificates.prop.cropReset")}
        </button>
      )}
      <Toggle
        label={t("certificates.prop.required")}
        checked={!!el.required}
        onChange={(required) => onChange({ required })}
        disabled={disabled}
      />
    </Section>
  );
}
