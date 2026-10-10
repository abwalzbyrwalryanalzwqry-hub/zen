import { useId, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import type { Palette } from "@/lib/certificates/model";

/** حقول لوحة الخصائص (مدمجة، بوسوم مرتبطة لقارئ الشاشة). */
export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1 min-w-0">
      <label htmlFor={id} className="block text-[0.6875rem] font-bold text-muted-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40";

export function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="number"
          dir="ltr"
          inputMode="decimal"
          className={INPUT}
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v))
              onChange(min != null || max != null ? Math.min(max ?? v, Math.max(min ?? v, v)) : v);
          }}
        />
      )}
    </Field>
  );
}

export function Sel<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className={INPUT}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => {
            const o = options.find((x) => String(x.value) === e.target.value);
            if (o) onChange(o.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Txt({
  label,
  value,
  onChange,
  multiline,
  disabled,
  placeholder,
  inputRef,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
  dir?: "rtl" | "ltr" | "auto";
}) {
  return (
    <Field label={label}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            ref={inputRef}
            dir={dir ?? "auto"}
            rows={3}
            className={`${INPUT} leading-relaxed resize-y`}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            ref={inputRef}
            dir={dir ?? "auto"}
            className={INPUT}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
      <input
        type="checkbox"
        className="accent-[hsl(var(--primary))] w-4 h-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const TOKENS: (keyof Palette)[] = ["primary", "accent", "ink", "paper", "muted"];

/** لون: من ألوان القالب ($primary…) أو لون حر. */
export function ColorField({
  label,
  value,
  palette,
  onChange,
  allowNone,
  disabled,
}: {
  label: string;
  value: string;
  palette: Palette;
  onChange: (v: string) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const hex = value.startsWith("$") ? palette[value.slice(1) as keyof Palette] : value;
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex items-center gap-1 flex-wrap">
          {TOKENS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              title={t(`certificates.prop.palette.${k}`)}
              aria-label={t(`certificates.prop.palette.${k}`)}
              aria-pressed={value === `$${k}`}
              onClick={() => onChange(`$${k}`)}
              className={`w-6 h-6 rounded-full border ${value === `$${k}` ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
              style={{ background: palette[k] }}
            />
          ))}
          {allowNone && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange("transparent")}
              aria-pressed={value === "transparent"}
              className={`w-6 h-6 rounded-full border bg-[linear-gradient(135deg,transparent_45%,#c33_45%,#c33_55%,transparent_55%)] ${value === "transparent" ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
              aria-label={t("certificates.prop.noColor")}
            />
          )}
          <input
            id={id}
            type="color"
            disabled={disabled}
            value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-6 rounded border border-border bg-transparent p-0"
          />
        </div>
      )}
    </Field>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border/60 pt-3 first:border-0 first:pt-0">
      <h3 className="text-[0.6875rem] font-black text-primary">{title}</h3>
      {children}
    </section>
  );
}

export const grid2 = "grid grid-cols-2 gap-2";
