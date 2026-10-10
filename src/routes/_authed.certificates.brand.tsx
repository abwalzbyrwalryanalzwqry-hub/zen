import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame, SBtn } from "@/components/zen/certificates/StudioFrame";
import {
  teacherSignatureOf,
  useAssetBlobs,
  useBrand,
  useStudioContext,
} from "@/components/zen/certificates/hooks";
import { Field, Section, Sel, Toggle, Txt } from "@/components/zen/certificates/fields";
import { useSession } from "@/hooks/useSession";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, certKeys, CertError, type AssetMeta } from "@/lib/certificates/api";
import { cleanNumberPrefix, type CertBrand } from "@/lib/certificates/brand";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { prepareImage } from "@/lib/certificates/upload";

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/** /certificates/brand — هوية المركز (لإدارته) وتوقيع المعلّم الشخصي، مع سجل التدقيق. */
export const Route = createFileRoute("/_authed/certificates/brand")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesBrand") }] }),
  validateSearch: (s: Record<string, unknown>): { center?: string } => ({ center: str(s.center) }),
  component: BrandScreen,
});

type Slot = "logo" | "logo_white" | "stamp" | "supervisor" | "director" | "teacher";

function BrandScreen() {
  useCertificatesDict();
  const t = useT();
  const qc = useQueryClient();
  const { userId } = useSession();
  const s = Route.useSearch();
  const ctx = useStudioContext();
  const centers = (ctx.data?.centers ?? []).filter(
    (c) => c.can_manage || ctx.data?.halaqat.some((h) => h.center_id === c.id && h.can_issue),
  );
  const [center, setCenter] = useState(s.center ?? "");
  const cid = center || centers[0]?.id || "";
  const { brand, assets } = useBrand(cid || null);
  const info = brand.data;
  const canEdit = !!info?.can_edit;
  const [edit, setEdit] = useState<CertBrand | null>(null);
  const b: CertBrand = edit ?? info?.brand ?? {};
  const mySig = teacherSignatureOf(assets.data, userId);
  const slotId = (k: Slot): string | null =>
    k === "teacher"
      ? mySig
      : k === "supervisor" || k === "director"
        ? (b.signatures?.[k] ?? null)
        : (b[k] ?? null);
  const ids = (["logo", "logo_white", "stamp", "supervisor", "director", "teacher"] as Slot[])
    .map(slotId)
    .filter((x): x is string => !!x);
  const blobs = useAssetBlobs(cid || null, ids);
  const audit = useQuery({
    queryKey: certKeys.audit(cid),
    enabled: !!cid && canEdit,
    queryFn: () => certApi.audit(cid, 40),
  });
  const [busy, setBusy] = useState<Slot | "save" | null>(null);

  const upload = async (slot: Slot, file: File) => {
    const p = await prepareImage(file);
    if (typeof p === "string")
      return toast.error(
        t(p === "unsafe" ? "certificates.err.UNSAFE_SVG" : `certificates.brand.${p}`),
      );
    setBusy(slot);
    try {
      const kind: AssetMeta["kind"] =
        slot === "logo" || slot === "logo_white" || slot === "stamp" ? slot : "signature";
      const id = await certApi.saveAsset(cid, {
        kind,
        data_url: p.data_url,
        width: p.width,
        height: p.height,
        label: slot === "teacher" ? "teacher" : slot,
        signer_name:
          slot === "supervisor" || slot === "director" ? b.signers?.[slot]?.name : undefined,
        signer_title:
          slot === "supervisor" || slot === "director" ? b.signers?.[slot]?.title : undefined,
      });
      await qc.invalidateQueries({ queryKey: certKeys.assets(cid) });
      if (slot !== "teacher") {
        const next: CertBrand =
          slot === "supervisor" || slot === "director"
            ? { ...b, signatures: { ...b.signatures, [slot]: id } }
            : { ...b, [slot]: id };
        await certApi.saveBrand(cid, next);
        setEdit(null);
        await qc.invalidateQueries({ queryKey: certKeys.brand(cid) });
      }
      toast.success(t("certificates.brand.saved"));
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (slot: Exclude<Slot, "teacher">) => {
    const next: CertBrand =
      slot === "supervisor" || slot === "director"
        ? { ...b, signatures: { ...b.signatures, [slot]: null } }
        : { ...b, [slot]: null };
    setEdit(next);
  };
  const save = async () => {
    setBusy("save");
    try {
      await certApi.saveBrand(cid, b);
      setEdit(null);
      await qc.invalidateQueries({ queryKey: certKeys.brand(cid) });
      void qc.invalidateQueries({ queryKey: certKeys.audit(cid) });
      toast.success(t("certificates.brand.saved"));
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(null);
    }
  };
  const signer = (r: "supervisor" | "director", f: "name" | "title", v: string) =>
    setEdit({ ...b, signers: { ...b.signers, [r]: { ...b.signers?.[r], [f]: v.slice(0, 80) } } });

  const img = ({
    slot,
    label,
    hint,
    dark,
  }: {
    slot: Slot;
    label: string;
    hint?: string;
    dark?: boolean;
  }) => {
    const id = slotId(slot);
    const url = id ? blobs.assets[`asset:${id}`]?.data_url : null;
    const can = slot === "teacher" ? true : canEdit;
    return (
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-black">{label}</p>
        {hint && <p className="text-[0.625rem] text-muted-foreground">{hint}</p>}
        <div
          className={`h-24 rounded-xl flex items-center justify-center ${dark ? "bg-primary" : "bg-muted/40"}`}
        >
          {url ? (
            <img src={url} alt={label} className="max-h-20 max-w-full object-contain" />
          ) : (
            <span className="text-[0.6875rem] text-muted-foreground">{t("certificates.none")}</span>
          )}
        </div>
        {can && (
          <div className="flex gap-1.5">
            <UploadBtn
              busy={busy === slot}
              label={id ? t("certificates.brand.replace") : t("certificates.brand.upload")}
              onFile={(f) => void upload(slot, f)}
            />
            {id && slot !== "teacher" && (
              <SBtn onClick={() => void remove(slot)}>{t("certificates.brand.remove")}</SBtn>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <StudioFrame title={t("certificates.brand.title")} subtitle={info?.center.name}>
      <div className="space-y-5 max-w-4xl">
        {(ctx.isError || brand.isError) && (
          <QueryError onRetry={() => void (ctx.isError ? ctx.refetch() : brand.refetch())} />
        )}
        {(ctx.isPending || (cid && brand.isPending)) && (
          <div
            className="flex justify-center py-10"
            role="status"
            aria-label={t("certificates.loading")}
          >
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        {centers.length > 1 && (
          <div className="w-60">
            <Sel
              label={t("certificates.home.center")}
              value={cid}
              options={centers.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => {
                setCenter(v);
                setEdit(null);
              }}
            />
          </div>
        )}
        {info && (
          <>
            <p className="text-xs text-muted-foreground">
              {canEdit ? t("certificates.brand.hint") : t("certificates.brand.readOnly")}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {t("certificates.brand.uploadHint")}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {img({ slot: "logo", label: t("certificates.brand.logo") })}
              {img({ slot: "logo_white", label: t("certificates.brand.logoWhite"), dark: true })}
              {img({ slot: "stamp", label: t("certificates.brand.stamp") })}
            </div>
            <Section title={t("certificates.brand.signatures")}>
              <div className="grid gap-3 sm:grid-cols-3">
                {img({
                  slot: "teacher",
                  label: t("certificates.brand.mySignature"),
                  hint: t("certificates.brand.mySignatureHint"),
                })}
                {(["supervisor", "director"] as const).map((r) => (
                  <div key={r} className="space-y-2">
                    {img({ slot: r, label: t(`certificates.sig.${r}`) })}
                    {canEdit && (
                      <>
                        <Txt
                          label={t("certificates.brand.signerName")}
                          value={b.signers?.[r]?.name ?? ""}
                          onChange={(v) => signer(r, "name", v)}
                        />
                        <Txt
                          label={t("certificates.brand.signerTitle")}
                          value={b.signers?.[r]?.title ?? ""}
                          onChange={(v) => signer(r, "title", v)}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Section>
            {canEdit && (
              <Section title={t("certificates.brand.colors")}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <HexField
                    label={t("certificates.brand.primary")}
                    value={b.colors?.primary ?? info.report_colors?.primary ?? "#1f5f4a"}
                    onChange={(v) => setEdit({ ...b, colors: { ...b.colors, primary: v } })}
                  />
                  <HexField
                    label={t("certificates.brand.accent")}
                    value={b.colors?.accent ?? info.report_colors?.accent ?? "#b08d57"}
                    onChange={(v) => setEdit({ ...b, colors: { ...b.colors, accent: v } })}
                  />
                  <Txt
                    label={t("certificates.brand.officialName")}
                    value={b.officialName ?? ""}
                    onChange={(v) => setEdit({ ...b, officialName: v.slice(0, 120) })}
                  />
                </div>
              </Section>
            )}
            {canEdit && (
              <Section title={t("certificates.brand.approvalTitle")}>
                <div className="space-y-3">
                  <Toggle
                    label={t("certificates.brand.requireApproval")}
                    checked={!!b.requireApproval}
                    onChange={(v) => setEdit({ ...b, requireApproval: v })}
                  />
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {t("certificates.brand.requireApprovalHint")}
                  </p>
                  <Txt
                    label={t("certificates.brand.numberPrefix")}
                    value={b.numberPrefix ?? ""}
                    dir="ltr"
                    placeholder="ABC"
                    onChange={(v) => setEdit({ ...b, numberPrefix: cleanNumberPrefix(v) || null })}
                  />
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {t("certificates.brand.numberPrefixHint", {
                      sample: `ZEN-${b.numberPrefix || "ABC"}-${new Date().getFullYear()}-0001`,
                    })}
                  </p>
                </div>
              </Section>
            )}
            {canEdit && edit && (
              <div className="sticky bottom-2 flex justify-end">
                <SBtn tone="primary" disabled={busy === "save"} onClick={() => void save()}>
                  {busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />}{" "}
                  {t("certificates.save")}
                </SBtn>
              </div>
            )}
            {canEdit && audit.data && (
              <Section title={t("certificates.brand.audit")}>
                {!audit.data.length && (
                  <p className="text-xs text-muted-foreground">{t("certificates.none")}</p>
                )}
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                  {audit.data.map((a) => (
                    <li key={a.id} className="px-3 py-2 text-xs flex gap-2">
                      <span className="font-bold flex-1">
                        {t(`certificates.audit.${a.action}`)}
                      </span>
                      <span className="text-muted-foreground">{a.actor ?? ""}</span>
                      <span className="text-muted-foreground tabular-nums" dir="ltr">
                        {new Date(a.at).toLocaleString("ar-u-nu-latn", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </StudioFrame>
  );
}

function UploadBtn({
  label,
  busy,
  onFile,
}: {
  label: string;
  busy: boolean;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <SBtn onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{" "}
        {label}
      </SBtn>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}

function HexField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#1f5f4a"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-background"
        />
      )}
    </Field>
  );
}
