import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame, SBtn } from "@/components/zen/certificates/StudioFrame";
import { Designer } from "@/components/zen/certificates/Designer";
import { useStudioContext } from "@/components/zen/certificates/hooks";
import { useDesignSources } from "@/components/zen/certificates/useDesignSources";
import { Sel, Txt } from "@/components/zen/certificates/fields";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, certKeys, CertError, type TemplateRow } from "@/lib/certificates/api";
import { brandPalette } from "@/lib/certificates/brand";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { cloneDesign, normalizeDesign, type Design } from "@/lib/certificates/model";
import { parsePick } from "@/lib/certificates/resolve";
import { systemTemplate, systemTemplateName } from "@/lib/certificates/templates";
import { sampleVars } from "@/lib/certificates/variables";

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/**
 * /certificates/design?center=&template=c:<id>|s:<key>&halaqa= — مصمم القالب. قالب النظام يُنسخ إلى المركز
 * (أو الحلقة) عند أول حفظ. الحفظ التلقائي يحدّث المسودة؛ «حفظ نسخة» يثبّت نسخة جديدة، والشهائد الصادرة
 * سابقاً تبقى على تصميمها.
 */
export const Route = createFileRoute("/_authed/certificates/design")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesDesign") }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { center?: string; template?: string; halaqa?: string } => ({
    center: str(s.center),
    template: str(s.template),
    halaqa: str(s.halaqa),
  }),
  component: DesignScreen,
});

function DesignScreen() {
  useCertificatesDict();
  const t = useT();
  const s = Route.useSearch();
  const ctx = useStudioContext();
  const pick = parsePick(s.template) ?? { kind: "system" as const, key: "elegant_minimal" };
  const center = s.center ?? ctx.data?.centers[0]?.id ?? null;
  const tpls = useQuery({
    queryKey: certKeys.templates(center ?? ""),
    enabled: !!center,
    queryFn: () => certApi.templates(center!),
  });
  const src = useDesignSources(center, null, null);
  const row = pick.kind === "center" ? (tpls.data?.find((r) => r.id === pick.id) ?? null) : null;
  const ready = !!center && !tpls.isPending && !src.loading && (pick.kind === "system" || !!row);
  const error =
    ctx.error ??
    tpls.error ??
    (tpls.data && pick.kind === "center" && !row ? new Error("NOT_FOUND") : null);
  return (
    <StudioFrame
      title={t("certificates.designer.title")}
      wide
      scroll={false}
      back="/certificates/templates"
    >
      {error && (
        <div className="p-4">
          <QueryError onRetry={() => void tpls.refetch()} />
        </div>
      )}
      {!error && !ready && (
        <div
          className="flex justify-center py-16"
          role="status"
          aria-label={t("certificates.loading")}
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {!error && ready && center && (
        <TemplateEditor
          key={s.template ?? ""}
          center={center}
          halaqa={s.halaqa ?? null}
          row={row}
          systemKey={pick.kind === "system" ? pick.key : null}
          initial={
            row
              ? normalizeDesign(row.design)
              : brandSystem(pick.kind === "system" ? pick.key : "", src.brand?.brand ?? null)
          }
        />
      )}
    </StudioFrame>
  );
}

function brandSystem(key: string, brand: Parameters<typeof brandPalette>[1]): Design {
  const d = cloneDesign((systemTemplate(key) ?? systemTemplate("elegant_minimal")!).build());
  d.palette = brandPalette(d.palette, brand);
  return d;
}

function TemplateEditor({
  center,
  halaqa,
  row,
  systemKey,
  initial,
}: {
  center: string;
  halaqa: string | null;
  row: TemplateRow | null;
  systemKey: string | null;
  initial: Design;
}) {
  const t = useT();
  const qc = useQueryClient();
  const ctx = useStudioContext();
  const [design, setDesign] = useState<Design>(initial);
  const [draft, setDraft] = useState<Design | null>(null);
  const [name, setName] = useState(
    row?.name ??
      (systemKey ? `${systemTemplateName(systemKey)} — ${t("certificates.gallery.center")}` : ""),
  );
  const [typeKey, setTypeKey] = useState(row?.type_key ?? "");
  const [version, setVersion] = useState(row?.version ?? 0);
  const [publishing, setPublishing] = useState(false);
  const id = useRef<string | null>(row?.id ?? null);
  // آخر نسخة نعرفها من الخادم: الحفظ يرفض (STALE) إن عدّل غيرنا القالب بعدها.
  const stamp = useRef<string | null>(row?.updated_at ?? null);
  const src = useDesignSources(center, design, null);
  const types = (ctx.data?.types ?? []).filter((x) => !x.center_id || x.center_id === center);
  const editable = row ? row.can_edit : true;

  const save = async (d: Design, publish = false) => {
    const r = await certApi.saveTemplate(
      id.current
        ? {
            id: id.current,
            name: name.trim() || t("certificates.designer.untitled"),
            type_key: typeKey || null,
            design: d,
            expected_updated_at: stamp.current,
          }
        : {
            center_id: center,
            halaqa_id: halaqa,
            type_key: typeKey || null,
            name: name.trim() || t("certificates.designer.untitled"),
            based_on: systemKey ? `system:${systemKey}` : null,
            categories: systemKey
              ? ((systemTemplate(systemKey)?.categories as string[]) ?? [])
              : [],
            design: d,
          },
      publish,
    );
    // أول حفظ لقالب نظام ينشئ قالباً في المركز؛ تبقى الشاشة نفسها (بلا إعادة تحميل تفقد سجل التراجع).
    id.current ??= r.id;
    stamp.current = r.updated_at;
    setVersion(r.version);
    void qc.invalidateQueries({ queryKey: certKeys.templates(center) });
  };
  const status = useAutoSave<Design>(
    editable ? draft : null,
    (d) => save(d),
    (saved) => setDraft((cur) => (cur === saved ? null : cur)),
    (e) => toast.error(e instanceof CertError ? e.message : t("certificates.saveError")),
    1500,
  );
  const publish = async () => {
    setPublishing(true);
    try {
      await save(design, true);
      setDraft(null);
      toast.success(t("certificates.designer.published", { v: version + 1 }));
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setPublishing(false);
    }
  };
  const side = (
    <div className="space-y-2 p-3 border-b border-border">
      <Txt
        label={t("certificates.designer.name")}
        value={name}
        onChange={(v) => {
          setName(v);
          setDraft(design);
        }}
      />
      <Sel
        label={t("certificates.designer.typeFor")}
        value={typeKey}
        options={[
          { value: "", label: t("certificates.designer.anyType") },
          ...types.map((x) => ({ value: x.key, label: x.name })),
        ]}
        onChange={(v) => {
          setTypeKey(v);
          setDraft(design);
        }}
      />
      <div className="flex items-center gap-2">
        <SBtn tone="primary" disabled={!editable || publishing} onClick={() => void publish()}>
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{" "}
          {t("certificates.designer.publish")}
        </SBtn>
        <span className="text-[0.6875rem] text-muted-foreground" role="status">
          {status === "saving"
            ? t("certificates.saving")
            : status === "saved"
              ? t("certificates.designer.autosaved")
              : status === "error"
                ? t("certificates.saveError")
                : ""}
          {version > 0 ? ` · ${t("certificates.gallery.version", { v: version })}` : ""}
        </span>
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        {t("certificates.designer.versionNote")}
      </p>
    </div>
  );
  return (
    <div className="h-full">
      <Designer
        initial={initial}
        onChange={(d) => {
          setDesign(d);
          if (editable) setDraft(d);
        }}
        readOnly={!editable}
        vars={sampleVars(
          t,
          types.find((x) => x.key === typeKey)?.name ?? t("certificates.sample.type"),
        )}
        sources={src.sources}
        images={src.images}
        onUpload={src.onUpload}
        side={side}
        typeName={types.find((x) => x.key === typeKey)?.name}
      />
    </div>
  );
}
