import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ForwardChevron } from "./ForwardChevron";

/**
 * صف قائمة موحَّد لـ«المزيد» وصفحات الحساب (تحليل «المزيد» ARC-02): أيقونة، وعنوان، ووصف، وشارة اختيارية،
 * وسهم «إلى الأمام». الهدف 56px على الأقل، وحلقة تركيز ظاهرة. يُستعمل داخل `SettingsSection` (عنصر `li`).
 */
type Common = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  /** شارة عدد أو حالة بجانب العنوان (مثلاً تنبيهات غير مقروءة). */
  badge?: ReactNode;
  tone?: "default" | "danger";
};

function Body({ icon: Icon, label, hint, badge, tone = "default" }: Common) {
  const danger = tone === "danger";
  return (
    <>
      <span
        className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center ${danger ? "bg-destructive/10" : "bg-primary/10"}`}
      >
        <Icon
          className={`w-4 h-4 ${danger ? "text-destructive" : "text-primary"}`}
          aria-hidden="true"
        />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-bold ${danger ? "text-destructive" : "text-foreground"}`}
        >
          {label}
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {badge}
    </>
  );
}

const ROW =
  "w-full min-h-14 flex items-center gap-3 px-4 py-3 text-start hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60";

export function ListRow(props: Common & { to: string; search?: Record<string, string> }) {
  return (
    <li>
      <Link to={props.to} search={props.search} className={ROW}>
        <Body {...props} />
        <ForwardChevron />
      </Link>
    </li>
  );
}

/** صف يُنفّذ إجراءً بدل الانتقال (الخروج، المشاركة…)، بلا سهم. */
export function ActionRow(
  props: Common & { onClick: () => void; disabled?: boolean; busy?: boolean },
) {
  return (
    <li>
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled || props.busy}
        aria-busy={props.busy || undefined}
        aria-label={props.label}
        className={ROW}
      >
        <Body {...props} />
      </button>
    </li>
  );
}
