import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { certApi, certKeys, type ListQuery } from "@/lib/certificates/api";

/**
 * «شهاداتي» (فحص الاستوديو H5/M9، 1.23.0): شهائد الاستوديو الصادرة للطالب، في صفحة إنجازاته ولكل ابن في صفحة
 * وليّ الأمر. الخادم (cert_visible) لا يعيد للطالب ووليّه إلا الصادرة والملغاة والمؤرشفة، لا المسودات.
 */
export function StudentCertificates({ studentId, title }: { studentId: string; title?: string }) {
  const t = useT();
  const q: ListQuery = { student_id: studentId, status: "all", limit: 50 };
  const list = useQuery({
    queryKey: certKeys.list(q),
    queryFn: () => certApi.list(q),
    staleTime: 60_000,
  });
  const items = list.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section
      aria-label={title ?? t("myCertificates.title")}
      className="glass-strong rounded-3xl p-4 space-y-2"
    >
      <h2 className="text-sm font-black text-foreground flex items-center gap-2">
        <Award className="w-4 h-4 text-primary" aria-hidden="true" />
        {title ?? t("myCertificates.title")}
      </h2>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const off = c.status === "revoked";
          return (
            <li key={c.id}>
              <Link
                to="/certificates/$id"
                params={{ id: c.id }}
                className="flex items-center gap-2 rounded-2xl bg-card/60 px-3 py-2 min-h-11"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-bold truncate ${off ? "line-through opacity-70" : ""}`}
                  >
                    {c.type_name ?? t("myCertificates.untitled")}
                  </p>
                  <p className="text-[0.6875rem] text-muted-foreground truncate">
                    <span dir="ltr">{c.certificate_number}</span>
                    {c.issue_date ? ` · ${c.issue_date}` : ""}
                    {c.center_name ? ` · ${c.center_name}` : ""}
                  </p>
                </div>
                {off && (
                  <span className="text-[0.625rem] font-bold text-destructive">
                    {t(c.replaced_by ? "myCertificates.replaced" : "myCertificates.revoked")}
                  </span>
                )}
                <ChevronLeft
                  className="w-4 h-4 text-muted-foreground rtl:rotate-0 ltr:rotate-180"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
