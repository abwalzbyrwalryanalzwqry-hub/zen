import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface RadioItem<V> {
  value: V;
  label: string;
  content: ReactNode;
  className: (on: boolean) => string;
}

/**
 * مجموعة اختيار واحد بنمط WAI-ARIA (DR-14): Tab يدخلها مرة واحدة (على المختار أو الأول)، والأسهم تنقل
 * وتختار باتجاه اللغة (في RTL السهم الأيسر هو «التالي»)، وHome/End للطرفين. اللمس كما هو: لمسة تختار،
 * ولمسة على المختار تستدعي onRepeat إن وُجد (مسح الحضور).
 */
export function RadioRow<V extends string | number>({
  label,
  items,
  value,
  disabled,
  onSelect,
  onRepeat,
  className,
}: {
  label: string;
  items: readonly RadioItem<V>[];
  value: V | null | undefined;
  disabled: boolean;
  onSelect: (v: V) => void;
  onRepeat?: (v: V) => void;
  className: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = items.findIndex((x) => x.value === value);
  const tabStop = current >= 0 ? current : 0;
  const move = (i: number) => {
    const n = (i + items.length) % items.length;
    refs.current[n]?.focus();
    if (items[n].value !== value) onSelect(items[n].value);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const map: Record<string, number> = {
      [fwd]: i + 1,
      ArrowDown: i + 1,
      [back]: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    move(map[e.key]);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={className}
    >
      {items.map((x, i) => {
        const on = x.value === value;
        return (
          <button
            key={String(x.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={x.label}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => (on ? onRepeat?.(x.value) : onSelect(x.value))}
            className={x.className(on)}
          >
            {x.content}
          </button>
        );
      })}
    </div>
  );
}
