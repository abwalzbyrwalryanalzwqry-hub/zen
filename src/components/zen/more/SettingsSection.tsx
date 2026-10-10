import type { ReactNode } from "react";

/**
 * مجموعة معنونة في «المزيد» وصفحات الإعدادات. المعرّف من مفتاح ثابت لا من النص المترجَم (تحليل «المزيد» A11Y-01):
 * النص العربي في `id` كان يكسر `aria-labelledby` عند تغيّر اللغة ويولّد معرّفات بمسافات.
 */
export function SettingsSection({
  id,
  title,
  children,
  variant = "list",
}: {
  id: string;
  title: string;
  children: ReactNode;
  /** `list`: صفوف بفواصل (`ListRow`)، `card`: محتوى حر بحشوة. */
  variant?: "list" | "card";
}) {
  const headingId = `more-sec-${id}`;
  return (
    <section className="space-y-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xs font-bold text-muted-foreground px-2">
        {title}
      </h2>
      {variant === "list" ? (
        <ul className="glass rounded-3xl divide-y divide-border/60 overflow-hidden">{children}</ul>
      ) : (
        <div className="glass rounded-3xl p-4 space-y-3">{children}</div>
      )}
    </section>
  );
}
