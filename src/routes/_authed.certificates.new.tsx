import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame } from "@/components/zen/certificates/StudioFrame";
import { IssueWizard, type WizardInit } from "@/components/zen/certificates/IssueWizard";
import { useStudioContext } from "@/components/zen/certificates/hooks";
import { useT, t as tStatic } from "@/lib/i18n";
import { certApi } from "@/lib/certificates/api";
import type { AchievementRef } from "@/lib/certificates/eligibility";
import { useCertificatesDict } from "@/lib/certificates/i18n";

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);
const int = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
};

/** ?students=a,b,c من لوحة التكريم (1.26.0): حتى 200 معرّف. */
const list = (v: unknown) => {
  if (typeof v !== "string" || !v) return undefined;
  const ids = v
    .split(",")
    .map((x) => x.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 200);
  return ids.length ? ids : undefined;
};

interface NewSearch {
  halaqa?: string;
  student?: string;
  students?: string[];
  type?: string;
  juz?: number;
  surah?: number;
  template?: string;
  batch?: string;
  replaces?: string;
}

/**
 * /certificates/new — معالج الإصدار. مداخل: ?halaqa= (شهائد الحلقة)، ?student=&type=&juz=|surah= (سجل الإنجاز)،
 * ?template= (من قالب)، ?batch= (متابعة مسودة)، ?replaces= (إعادة إصدار بشهادة جديدة).
 */
export const Route = createFileRoute("/_authed/certificates/new")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesNew") }] }),
  validateSearch: (s: Record<string, unknown>): NewSearch => ({
    halaqa: str(s.halaqa),
    student: str(s.student),
    students: list(s.students),
    type: str(s.type),
    juz: int(s.juz, 30),
    surah: int(s.surah, 114),
    template: str(s.template),
    batch: str(s.batch),
    replaces: str(s.replaces),
  }),
  component: NewCertificate,
});

function NewCertificate() {
  useCertificatesDict();
  const t = useT();
  const s = Route.useSearch();
  const ctx = useStudioContext();
  const batch = useQuery({
    queryKey: ["certificates", "batch", s.batch],
    enabled: !!s.batch,
    queryFn: () => certApi.batch(s.batch!),
  });
  const old = useQuery({
    queryKey: ["certificates", "one", s.replaces],
    enabled: !!s.replaces,
    queryFn: () => certApi.get(s.replaces!),
  });

  const loading = ctx.isPending || (s.batch && batch.isPending) || (s.replaces && old.isPending);
  const error = ctx.error ?? batch.error ?? old.error;
  let init: WizardInit | null = null;
  if (!loading && !error) {
    if (batch.data) {
      const b = batch.data;
      init = {
        halaqa: b.halaqa_id,
        type: b.type_key,
        students: b.items.map((i) => i.student_id),
        ref: b.items[0]?.achievement_ref ?? null,
        template: b.template_id
          ? `c:${b.template_id}`
          : b.system_template
            ? `s:${b.system_template}`
            : null,
        design: b.design,
        batchId: b.batch_id,
        from: b.period_from ?? undefined,
        to: b.period_to ?? undefined,
        issueDate: b.issue_date ?? undefined,
      };
    } else if (old.data) {
      const o = old.data;
      init = {
        halaqa: o.halaqa_id,
        type: o.type_key,
        students: [o.student_id],
        ref: o.snapshot?.achievement_ref ?? null,
        template: o.template_id
          ? `c:${o.template_id}`
          : o.system_template
            ? `s:${o.system_template}`
            : null,
        design: o.design,
        replacesId: o.id,
        from: o.period_from ?? undefined,
        to: o.period_to ?? undefined,
      };
    } else {
      const ref: AchievementRef = s.juz
        ? { kind: "juz", juz: s.juz }
        : s.surah
          ? { kind: "surah", surah: s.surah }
          : null;
      init = {
        halaqa: s.halaqa ?? soleHalaqa(ctx.data, s.student),
        students: s.students ?? (s.student ? [s.student] : []),
        type: s.type,
        ref,
        template: s.template,
      };
    }
  }
  return (
    <StudioFrame
      title={t(s.replaces ? "certificates.wizard.reissueTitle" : "certificates.wizard.title")}
    >
      {loading && (
        <div
          className="flex justify-center py-16"
          role="status"
          aria-label={t("certificates.loading")}
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {error && (
        <QueryError
          onRetry={() => {
            void ctx.refetch();
            if (s.batch) void batch.refetch();
            if (s.replaces) void old.refetch();
          }}
        />
      )}
      {init && ctx.data && (
        <IssueWizard key={`${s.batch ?? ""}${s.replaces ?? ""}`} ctx={ctx.data} init={init} />
      )}
    </StudioFrame>
  );
}

/** دخول من صفحة طالب بلا حلقة: إن كانت للمستخدم حلقة واحدة يصدر منها فهي هي (الخادم يتحقق من العضوية). */
function soleHalaqa(
  ctx: { halaqat: { id: string; can_issue: boolean }[] } | undefined,
  student?: string,
) {
  if (!student || !ctx) return null;
  const mine = ctx.halaqat.filter((h) => h.can_issue);
  return mine.length === 1 ? mine[0].id : null;
}
