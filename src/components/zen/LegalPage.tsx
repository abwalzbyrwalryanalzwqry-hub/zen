import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import type { LegalDoc } from "@/content/legal";
import { useT } from "@/lib/i18n";

/** عرض صفحة قانونية من `src/content/legal.ts` (المصدر نفسه للصفحات العامة الثابتة). */
export function LegalPage({ doc, icon: Icon }: { doc: LegalDoc; icon: LucideIcon }) {
  const t = useT();
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <Link
            to="/auth/login"
            aria-label={t("common.back")}
            className="glass w-10 h-10 rounded-xl flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-black text-foreground">{doc.title}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              {t("legal.updated", { date: doc.updated })}
            </p>
          </div>
          <Icon aria-hidden className="w-5 h-5 text-primary" />
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
          {doc.sections.map((s) => (
            <section key={s.title} className="glass rounded-2xl p-4 space-y-1.5">
              <h2 className="text-sm font-bold text-primary">{s.title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}
