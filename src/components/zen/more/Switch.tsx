/**
 * مفتاح تشغيل موحَّد (تحليل «المزيد» ARC-03): كانت في الصفحات خمس نسخ بمقاسات ومواضع مختلفة، وبعضها بـ
 * `right-*` الثابت فينعكس خطأً في الاتجاه من اليسار. هنا خصائص منطقية (`start-*`) وهدف لمس 44px.
 */
export function Switch({
  on,
  onChange,
  label,
  labelledBy,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  /** نص الوصف للقارئ إن لم يوجد عنصر عنوان ظاهر. */
  label?: string;
  /** معرّف العنصر الظاهر الذي يصف المفتاح. */
  labelledBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="group relative shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative block w-11 h-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-all ${
            on ? "start-[1.375rem]" : "start-0.5"
          }`}
        />
      </span>
    </button>
  );
}
