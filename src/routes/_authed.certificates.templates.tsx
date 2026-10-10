import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutTemplate, Loader2, Plus } from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame, SBtn } from "@/components/zen/certificates/StudioFrame";
import { TemplatePicker } from "@/components/zen/certificates/TemplatePicker";
import { galleryItems, type GalleryItem } from "@/components/zen/certificates/helpers";
import { useStudioContext } from "@/components/zen/certificates/hooks";
import { useDesignSources } from "@/components/zen/certificates/useDesignSources";
import { Sel } from "@/components/zen/certificates/fields";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, certKeys, CertError } from "@/lib/certificates/api";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { pickKey } from "@/lib/certificates/resolve";
import { sampleVars } from "@/lib/certificates/variables";

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/** /certificates/templates — المعرض وإدارة القوالب: قوالب المركز والحلقات (حسب الصلاحية) ثم قوالب زِن الثمانية. */
export const Route = createFileRoute("/_authed/certificates/templates")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesGallery") }] }),
  validateSearch: (s: Record<string, unknown>): { center?: string; manage?: string } => ({
    center: str(s.center),
    manage: s.manage === "1" ? "1" : undefined,
  }),
  component: TemplatesScreen,
});

function TemplatesScreen() {
  useCertificatesDict();
  const t = useT();
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = Route.useSearch();
  const ctx = useStudioContext();
  const centers = ctx.data?.centers ?? [];
  const [center, setCenter] = useState<string>(search.center ?? "");
  const cid = center || centers[0]?.id || "";
  const cen = centers.find((c) => c.id === cid);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const tpls = useQuery({
    queryKey: certKeys.templates(cid),
    enabled: !!cid,
    queryFn: () => certApi.templates(cid),
  });
  const src = useDesignSources(cid || null, null, null);
  const myHalaqat = (ctx.data?.halaqat ?? []).filter((h) => h.center_id === cid && h.can_issue);
  const canCreate = !!cen?.can_manage || myHalaqat.length > 0;
  const items = galleryItems(tpls.data ?? [], t, showArchived);
  const typeName = (k: string | null) => ctx.data?.types.find((x) => x.key === k)?.name ?? k ?? "";
  const halName = (id: string | null) => ctx.data?.halaqat.find((h) => h.id === id)?.name ?? "";

  const scopeLabel = (it: GalleryItem) => {
    const r = it.row;
    if (!r) return t("certificates.gallery.scopeSystem");
    if (r.type_key) return `${t("certificates.gallery.scopeType")}: ${typeName(r.type_key)}`;
    if (r.halaqa_id) return `${t("certificates.gallery.scopeHalaqa")}: ${halName(r.halaqa_id)}`;
    return t("certificates.gallery.scopeCenter");
  };

  const act = async (it: GalleryItem, action: "duplicate" | "archive" | "restore") => {
    if (!it.row) return;
    setBusy(pickKey(it.pick));
    try {
      const halaqa = action === "duplicate" && !cen?.can_manage ? (myHalaqat[0]?.id ?? null) : null;
      const id = await certApi.templateAction(it.row.id, action, halaqa);
      await qc.invalidateQueries({ queryKey: certKeys.templates(cid) });
      toast.success(
        t(action === "duplicate" ? "certificates.gallery.copied" : "certificates.saved"),
      );
      if (action === "duplicate" && id)
        void nav({ to: "/certificates/design", search: { center: cid, template: `c:${id}` } });
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(null);
    }
  };

  const designSearch = (template: string) => ({
    center: cid,
    template,
    halaqa: cen?.can_manage ? undefined : myHalaqat[0]?.id,
  });

  return (
    <StudioFrame
      title={t(search.manage ? "certificates.home.templates" : "certificates.gallery.title")}
      subtitle={cen?.name}
      actions={
        canCreate && (
          <Link
            to="/certificates/design"
            search={designSearch("s:elegant_minimal")}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4" /> {t("certificates.empty.createTemplate")}
          </Link>
        )
      }
    >
      <div className="space-y-4">
        {(ctx.isError || tpls.isError) && (
          <QueryError onRetry={() => void (ctx.isError ? ctx.refetch() : tpls.refetch())} />
        )}
        {(ctx.isPending || tpls.isPending) && cid !== "" && (
          <div
            className="flex justify-center py-10"
            role="status"
            aria-label={t("certificates.loading")}
          >
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {centers.length > 1 && (
            <div className="w-56">
              <Sel
                label={t("certificates.home.center")}
                value={cid}
                options={centers.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setCenter}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />
            {t("certificates.gallery.archived")}
          </label>
          <p className="text-[0.6875rem] text-muted-foreground flex-1">
            {t("certificates.gallery.priority")}
          </p>
        </div>
        {tpls.data && !tpls.data.length && (
          <EmptyState
            icon={LayoutTemplate}
            title={t("certificates.empty.templates")}
            hint={t("certificates.gallery.systemHint")}
            action={
              canCreate ? (
                <Link
                  to="/certificates/design"
                  search={designSearch("s:elegant_minimal")}
                  className="text-sm font-bold text-primary"
                >
                  {t("certificates.empty.createTemplate")}
                </Link>
              ) : undefined
            }
          />
        )}
        {cid && (
          <TemplatePicker
            items={items}
            sources={src.sources}
            vars={sampleVars(t, t("certificates.sample.type"))}
            scopeLabel={scopeLabel}
            actions={(it) => {
              const k = pickKey(it.pick);
              const r = it.row;
              return (
                <>
                  {myHalaqat.length > 0 && !r?.archived && (
                    <Link
                      to="/certificates/new"
                      search={{ template: k }}
                      className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-bold bg-primary text-primary-foreground"
                    >
                      {t("certificates.gallery.use")}
                    </Link>
                  )}
                  {r?.can_edit && !r.archived && (
                    <Link
                      to="/certificates/design"
                      search={{ center: cid, template: k }}
                      className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-bold border border-border"
                    >
                      {t("certificates.gallery.edit")}
                    </Link>
                  )}
                  {!r && canCreate && (
                    <Link
                      to="/certificates/design"
                      search={designSearch(k)}
                      className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-bold border border-border"
                    >
                      {t("certificates.gallery.copy")}
                    </Link>
                  )}
                  {r && canCreate && (
                    <SBtn disabled={busy === k} onClick={() => void act(it, "duplicate")}>
                      {t("certificates.gallery.copy")}
                    </SBtn>
                  )}
                  {r?.can_edit && (
                    <SBtn
                      disabled={busy === k}
                      onClick={() => void act(it, r.archived ? "restore" : "archive")}
                    >
                      {t(
                        r.archived
                          ? "certificates.gallery.restore"
                          : "certificates.gallery.archive",
                      )}
                    </SBtn>
                  )}
                  {r && (
                    <span className="text-[0.625rem] text-muted-foreground self-center">
                      {t("certificates.gallery.version", { v: r.version })} ·{" "}
                      {t("certificates.gallery.used", { n: r.used })}
                    </span>
                  )}
                </>
              );
            }}
          />
        )}
      </div>
    </StudioFrame>
  );
}
