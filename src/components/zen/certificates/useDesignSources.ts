import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { localDayOf } from "@/lib/local-day";
import { toast } from "@/lib/toast";
import { certApi, certKeys, CertError, type AssetMeta } from "@/lib/certificates/api";
import type { Sources } from "@/lib/certificates/compose";
import { neededAssetIds } from "@/lib/certificates/compose";
import type { Design } from "@/lib/certificates/model";
import { prepareImage } from "@/lib/certificates/upload";
import { refsFor, useAssetBlobs, useBrand } from "./hooks";
import type { ImageOption } from "./Inspector";

/**
 * مصادر الرسم لتصميم في مركز: الهوية (brand:* ← asset:<id>) وبيانات الصور المطلوبة وخيارات الصور للمصمم
 * ورفع صورة جديدة إلى أصول المركز.
 */
export function useDesignSources(
  center: string | null,
  design: Design | null,
  teacherId: string | null,
) {
  const t = useT();
  const qc = useQueryClient();
  const { brand, assets } = useBrand(center);
  const b = brand.data?.brand ?? null;
  const refs = refsFor(b, assets.data, teacherId);
  const ids = design ? neededAssetIds(design, refs) : [];
  // صور الخيارات تُحمَّل كذلك ليظهر ما يختاره المستخدم فوراً.
  const blobs = useAssetBlobs(center, ids);
  const sources: Sources = { assets: blobs.assets, brand: b, refs };

  const images: ImageOption[] = [
    { value: "brand:logo", label: t("certificates.prop.brandLogo") },
    { value: "brand:logo_white", label: t("certificates.prop.brandLogoWhite") },
    { value: "brand:stamp", label: t("certificates.prop.brandStamp") },
    { value: "brand:signature:teacher", label: t("certificates.prop.sigTeacher") },
    { value: "brand:signature:supervisor", label: t("certificates.prop.sigSupervisor") },
    { value: "brand:signature:director", label: t("certificates.prop.sigDirector") },
    ...(assets.data ?? [])
      .filter((a) => !a.archived)
      .map((a: AssetMeta) => ({
        value: `asset:${a.id}`,
        label: `${t(`certificates.assetKind.${a.kind}`)} — ${a.label || a.signer_name || localDayOf(a.created_at)}`,
      })),
  ];

  const onUpload = center
    ? async (file: File): Promise<string | null> => {
        const p = await prepareImage(file);
        if (typeof p === "string") {
          toast.error(
            t(p === "unsafe" ? "certificates.err.UNSAFE_SVG" : `certificates.brand.${p}`),
          );
          return null;
        }
        try {
          const id = await certApi.saveAsset(center, {
            kind: "image",
            data_url: p.data_url,
            width: p.width,
            height: p.height,
            label: file.name.slice(0, 60),
          });
          await qc.invalidateQueries({ queryKey: certKeys.assets(center) });
          return `asset:${id}`;
        } catch (e) {
          toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
          return null;
        }
      }
    : undefined;

  return {
    sources,
    images,
    onUpload,
    brand: brand.data ?? null,
    assets: assets.data ?? [],
    loading: brand.isLoading || assets.isLoading || blobs.loading,
    error: brand.error ?? assets.error ?? blobs.error,
    refetch: () => {
      void brand.refetch();
      void assets.refetch();
    },
  };
}
