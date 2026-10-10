import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Award,
  FilePlus2,
  FileSpreadsheet,
  HeartHandshake,
  LayoutTemplate,
  Loader2,
  Palette,
  Search,
  Stamp,
} from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame, SBtn } from "@/components/zen/certificates/StudioFrame";
import { CertificatesTable } from "@/components/zen/certificates/CertificatesTable";
import { ApprovalButtons } from "@/components/zen/certificates/ApprovalActions";
import { useStudioContext } from "@/components/zen/certificates/hooks";
import { Sel } from "@/components/zen/certificates/fields";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { exportExcel } from "@/lib/center-export";
import { certApi, certKeys, type ListQuery } from "@/lib/certificates/api";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { certificatesReportDoc } from "@/lib/certificates/report";
import { localDayKey } from "@/lib/local-day";

type Status = NonNullable<ListQuery["status"]>;
const STATUSES: Status[] = [
  "active",
  "pending",
  "issued",
  "drafts",
  "rejected",
  "revoked",
  "archived",
  "all",
];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** /certificates — الرئيسية: الإحصاءات والبدء والبحث وجدول الشهائد. ?student= «شهائد الطالب»، ?halaqa= «شهائد الحلقة». */
export const Route = createFileRoute("/_authed/certificates/")({
  head: () => ({ meta: [{ title: tStatic("meta.certificates") }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { student?: string; halaqa?: string; center?: string; status?: Status } => ({
    student: str(s.student),
    halaqa: str(s.halaqa),
    center: str(s.center),
    status: STATUSES.includes(s.status as Status) ? (s.status as Status) : undefined,
  }),
  component: CertificatesHome,
});

const PAGE = 50;

function CertificatesHome() {
  useCertificatesDict();
  const t = useT();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const ctx = useStudioContext();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>(search.status ?? "active");
  const [typeKey, setTypeKey] = useState("");
  const [halaqa, setHalaqa] = useState(search.halaqa ?? "");
  const [center, setCenter] = useState(search.center ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);

  const query: ListQuery = {
    center_id: center || undefined,
    halaqa_id: halaqa || undefined,
    student_id: search.student,
    type_key: typeKey || undefined,
    status,
    from: from || undefined,
    to: to || undefined,
    q: q.trim() || undefined,
    limit,
  };
  const list = useQuery({
    queryKey: certKeys.list(query),
    queryFn: () => certApi.list(query),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: certKeys.stats(center || null, halaqa || null),
    queryFn: () => certApi.stats(center || null, halaqa || null),
    enabled: !search.student,
  });
  const c = ctx.data;
  const studentName = search.student ? list.data?.items[0]?.student_name : null;
  const halName = c?.halaqat.find((h) => h.id === halaqa)?.name;
  const title = search.student
    ? t("certificates.student.title")
    : search.halaqa
      ? t("certificates.circle.title")
      : t("certificates.title");
  const canIssue = !!c?.halaqat.some((h) => h.can_issue);
  const canManage = !!c?.centers.some((x) => x.can_manage);
  const refresh = () => void qc.invalidateQueries({ queryKey: certKeys.all });

  const exportReport = async () => {
    setExporting(true);
    try {
      const all = await certApi.list({ ...query, limit: 1000, offset: 0 });
      await exportExcel(
        certificatesReportDoc(
          all.items,
          stats.data ?? null,
          halName ?? c?.centers.find((x) => x.id === center)?.name ?? "",
        ),
        `${t("certificates.home.report")} ${localDayKey()}`,
      );
    } catch (e) {
      console.warn("[certificates] report", e);
      toast.error(t("certificates.err.generic"));
    } finally {
      setExporting(false);
    }
  };

  const newSearch = { halaqa: halaqa || undefined, student: search.student };
  return (
    <StudioFrame
      title={title}
      subtitle={studentName ?? halName ?? t("certificates.subtitle")}
      back={search.student || search.halaqa ? "/certificates" : "/more"}
      actions={
        canIssue && (
          <Link
            to="/certificates/new"
            search={newSearch}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-primary text-primary-foreground"
          >
            <FilePlus2 className="w-4 h-4" /> {t("certificates.home.new")}
          </Link>
        )
      }
    >
      <div className="space-y-5">
        {ctx.isError && <QueryError onRetry={() => void ctx.refetch()} />}
        {c && !c.centers.length && (
          <EmptyState
            icon={Award}
            title={t("certificates.home.noCenter")}
            hint={t("certificates.home.noCenterHint")}
            action={
              <Link
                to="/centers"
                className="text-xs font-bold text-primary underline min-h-11 py-3"
              >
                {t("certificates.home.createCenter")}
              </Link>
            }
          />
        )}
        {!!stats.data?.to_approve && status !== "pending" && (
          <button
            type="button"
            onClick={() => {
              setStatus("pending");
              setLimit(PAGE);
            }}
            className="w-full rounded-2xl border border-gold/50 bg-gold/10 p-3 text-start text-sm font-bold"
          >
            {t("certificates.approval.banner", { count: stats.data.to_approve })}
          </button>
        )}
        {stats.data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {(["total", "month", "year", "revoked", "drafts", "students"] as const).map((k) => (
              <div key={k} className="rounded-2xl border border-border bg-card p-3">
                <p className="text-xl font-black tabular-nums">{stats.data[k]}</p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  {t(`certificates.stats.${k}`)}
                </p>
              </div>
            ))}
          </div>
        )}
        {!search.student && c && c.centers.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {canIssue && (
              <ActionCard
                to="/certificates/new"
                search={newSearch}
                icon={<FilePlus2 />}
                title={t("certificates.home.new")}
                hint={t("certificates.home.newHint")}
                primary
              />
            )}
            <ActionCard
              to="/certificates/templates"
              icon={<LayoutTemplate />}
              title={t("certificates.home.gallery")}
              hint={t("certificates.home.galleryHint")}
            />
            <ActionCard
              to="/certificates/templates"
              search={{ manage: "1" }}
              icon={<Palette />}
              title={t("certificates.home.templates")}
              hint={t("certificates.home.templatesHint")}
            />
            {canIssue && (
              <ActionCard
                to="/certificates/honor"
                icon={<HeartHandshake />}
                title={t("certificates.honor.title")}
                hint={t("certificates.honor.cardHint")}
              />
            )}
            <ActionCard
              to="/certificates/brand"
              icon={<Stamp />}
              title={t("certificates.home.brand")}
              hint={t(
                canManage ? "certificates.home.brandHint" : "certificates.brand.mySignatureHint",
              )}
            />
          </div>
        )}
        <section className="space-y-3">
          <div
            className="flex gap-1.5 overflow-x-auto pb-1"
            role="tablist"
            aria-label={t("certificates.filter.status")}
          >
            {STATUSES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={status === s}
                onClick={() => {
                  setStatus(s);
                  setLimit(PAGE);
                }}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold border ${status === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
              >
                {t(`certificates.filter.${s}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 items-end">
            <label className="lg:col-span-2 relative block">
              <span className="sr-only">{t("certificates.search")}</span>
              <Search
                className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-2.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("certificates.searchPlaceholder")}
                className="w-full rounded-xl bg-card border border-border ps-8 pe-2 py-2 text-sm"
              />
            </label>
            {c && c.centers.length > 1 && (
              <Sel
                label={t("certificates.home.center")}
                value={center}
                options={[
                  { value: "", label: t("certificates.all") },
                  ...c.centers.map((x) => ({ value: x.id, label: x.name })),
                ]}
                onChange={setCenter}
              />
            )}
            {c && !search.student && (
              <Sel
                label={t("certificates.filter.halaqa")}
                value={halaqa}
                options={[
                  { value: "", label: t("certificates.all") },
                  ...c.halaqat
                    .filter((h) => !center || h.center_id === center)
                    .map((x) => ({ value: x.id, label: x.name })),
                ]}
                onChange={setHalaqa}
              />
            )}
            {c && (
              <Sel
                label={t("certificates.filter.type")}
                value={typeKey}
                options={[
                  { value: "", label: t("certificates.all") },
                  ...dedupe(c.types).map((x) => ({ value: x.key, label: x.name })),
                ]}
                onChange={setTypeKey}
              />
            )}
            <DateIn label={t("certificates.filter.from")} value={from} onChange={setFrom} />
            <DateIn label={t("certificates.filter.to")} value={to} onChange={setTo} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              {list.data ? t("certificates.home.count", { n: list.data.total }) : ""}
              {list.isFetching && <Loader2 className="inline w-3 h-3 animate-spin ms-1" />}
            </p>
            <SBtn onClick={() => void exportReport()} disabled={exporting || !list.data?.total}>
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}{" "}
              {t("certificates.stats.export")}
            </SBtn>
          </div>
          {list.isError && <QueryError onRetry={() => void list.refetch()} />}
          {list.isPending && (
            <div
              className="flex justify-center py-10"
              role="status"
              aria-label={t("certificates.loading")}
            >
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          {list.data && !list.data.items.length && (
            <EmptyState
              icon={Award}
              title={
                q || typeKey || from || to
                  ? t("certificates.empty.search")
                  : search.student
                    ? t("certificates.empty.student")
                    : t("certificates.empty.issued")
              }
              hint={q || typeKey ? undefined : t("certificates.empty.issuedHint")}
              action={
                canIssue && !q ? (
                  <Link
                    to="/certificates/new"
                    search={newSearch}
                    className="text-sm font-bold text-primary"
                  >
                    {t("certificates.home.new")}
                  </Link>
                ) : undefined
              }
            />
          )}
          {status === "pending" && list.data?.items.some((x) => x.can_approve) && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground flex-1 min-w-48">
                {t("certificates.approval.bulkHint")}
              </p>
              <ApprovalButtons
                ids={list.data.items.filter((x) => x.can_approve).map((x) => x.id)}
                onDone={refresh}
              />
            </div>
          )}
          {list.data && list.data.items.length > 0 && (
            <CertificatesTable items={list.data.items} onChanged={refresh} />
          )}
          {list.data && list.data.total > list.data.items.length && (
            <div className="flex justify-center">
              <SBtn onClick={() => setLimit(limit + PAGE)} disabled={list.isFetching}>
                {t("certificates.home.more")}
              </SBtn>
            </div>
          )}
        </section>
      </div>
    </StudioFrame>
  );
}

const dedupe = <T extends { key: string }>(xs: T[]) =>
  xs.filter((x, i) => xs.findIndex((y) => y.key === x.key) === i);

function ActionCard({
  to,
  search,
  icon,
  title,
  hint,
  primary,
}: {
  to:
    "/certificates/new" | "/certificates/templates" | "/certificates/brand" | "/certificates/honor";
  search?: Record<string, string | undefined>;
  icon: ReactNode;
  title: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={`rounded-2xl border p-4 flex gap-3 items-start transition hover:shadow-sm ${primary ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}
    >
      <span className={`shrink-0 [&>svg]:w-5 [&>svg]:h-5 ${primary ? "" : "text-primary"}`}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span
          className={`block text-[0.6875rem] ${primary ? "opacity-85" : "text-muted-foreground"}`}
        >
          {hint}
        </span>
      </span>
    </Link>
  );
}

function DateIn({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[0.6875rem] font-bold text-muted-foreground mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-card border border-border px-2 py-1.5 text-xs"
      />
    </label>
  );
}
