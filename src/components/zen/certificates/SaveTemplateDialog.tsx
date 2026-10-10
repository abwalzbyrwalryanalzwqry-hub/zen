import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, CertError, type CertType } from "@/lib/certificates/api";
import type { Design } from "@/lib/certificates/model";
import { GALLERY_CATEGORIES } from "@/lib/certificates/templates";
import { Sel, Txt } from "./fields";
import { SBtn } from "./StudioFrame";

/**
 * «حفظ كقالب»: نسخة جديدة في قوالب المركز (لإدارته) أو الحلقة (لمعلّمها)، اختيارياً لنوع محدد. القالب يحفظ
 * مراجع الهوية (brand:*) لا صورها، فيتبع هوية المركز إلى أن تُصدر منه شهادة فتُجمَّد.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  design,
  centerId,
  halaqaId,
  canManage,
  types,
  defaultType,
  basedOn,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  design: Design;
  centerId: string;
  halaqaId: string | null;
  canManage: boolean;
  types: CertType[];
  defaultType?: string | null;
  basedOn?: string | null;
  onSaved?: (id: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"center" | "halaqa">(canManage ? "center" : "halaqa");
  const [typeKey, setTypeKey] = useState(defaultType ?? "");
  const [cats, setCats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await certApi.saveTemplate(
        {
          center_id: centerId,
          halaqa_id: scope === "halaqa" ? halaqaId : null,
          type_key: typeKey || null,
          name: name.trim() || t("certificates.designer.untitled"),
          categories: cats,
          based_on: basedOn ?? null,
          design,
        },
        true,
      );
      toast.success(t("certificates.saved"));
      onSaved?.(r.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          dir="rtl"
          className="fixed z-[60] inset-x-4 top-[10vh] mx-auto max-w-md rounded-3xl bg-background p-5 space-y-3 shadow-2xl"
        >
          <Dialog.Title className="text-base font-black">
            {t("certificates.preview.saveAsTemplate")}
          </Dialog.Title>
          <Dialog.Description className="text-xs text-muted-foreground">
            {t("certificates.designer.versionNote")}
          </Dialog.Description>
          <Txt label={t("certificates.designer.name")} value={name} onChange={setName} />
          {halaqaId && canManage && (
            <Sel
              label={t("certificates.designer.scope")}
              value={scope}
              options={[
                { value: "center", label: t("certificates.designer.scopeCenter") },
                { value: "halaqa", label: t("certificates.designer.scopeHalaqa") },
              ]}
              onChange={setScope}
            />
          )}
          <Sel
            label={t("certificates.designer.typeFor")}
            value={typeKey}
            options={[
              { value: "", label: t("certificates.designer.anyType") },
              ...types.map((x) => ({ value: x.key, label: x.name })),
            ]}
            onChange={setTypeKey}
          />
          <fieldset className="space-y-1">
            <legend className="text-[0.6875rem] font-bold text-muted-foreground">
              {t("certificates.designer.categories")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {GALLERY_CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setCats(on ? cats.filter((x) => x !== c) : [...cats, c].slice(0, 6))
                    }
                    className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-bold border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  >
                    {t(`certificates.gallery.cat.${c}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex gap-2 justify-end pt-2">
            <Dialog.Close asChild>
              <SBtn disabled={busy}>{t("certificates.cancel")}</SBtn>
            </Dialog.Close>
            <SBtn
              tone="primary"
              disabled={busy || (scope === "halaqa" && !halaqaId)}
              onClick={() => void save()}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t("certificates.save")}
            </SBtn>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
