/**
 * بيانات الاستوديو المشتركة بين شاشاته: السياق (المراكز والحلقات والأنواع)، هوية المركز وأصوله، بيانات الصور
 * للرسم، وتقارير الحلقة من سجل الإنجاز القائم (fetchReportData ← compute) — لا حساب مستقل للإنجاز.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { certApi, certKeys, type AssetMeta, type StudioContext } from "@/lib/certificates/api";
import { brandRefs, type CertBrand } from "@/lib/certificates/brand";
import type { AssetData } from "@/lib/certificates/render";
import { fetchReportData } from "@/lib/reports/api";
import { ALL_FILTERS, compute, type StudentReport } from "@/lib/reports/compute";

/** بكسل CSS لكل مليمتر. */
export const MM_PX = 96 / 25.4;

export function useStudioContext() {
  return useQuery({
    queryKey: certKeys.context(),
    queryFn: certApi.context,
    staleTime: 60_000,
    retry: 1,
  });
}

export type Halaqa = StudioContext["halaqat"][number];

export function useBrand(center: string | null) {
  const brand = useQuery({
    queryKey: certKeys.brand(center ?? ""),
    enabled: !!center,
    queryFn: () => certApi.brand(center!),
    staleTime: 60_000,
    retry: 1,
  });
  const assets = useQuery({
    queryKey: certKeys.assets(center ?? ""),
    enabled: !!center,
    queryFn: () => certApi.assets(center!),
    staleTime: 60_000,
    retry: 1,
  });
  return { brand, assets };
}

/** توقيع المعلّم: آخر توقيع رفعه معلّم الحلقة نفسه (label = teacher). */
export function teacherSignatureOf(assets: AssetMeta[] | undefined, teacherId: string | null) {
  if (!assets || !teacherId) return null;
  return (
    assets.find(
      (a) =>
        a.kind === "signature" && a.label === "teacher" && a.owner === teacherId && !a.archived,
    )?.id ?? null
  );
}

export function refsFor(
  brand: CertBrand | null | undefined,
  assets: AssetMeta[] | undefined,
  teacherId: string | null,
) {
  return brandRefs(brand ?? null, teacherSignatureOf(assets, teacherId));
}

/** بيانات الصور (data URL) للمعرّفات المطلوبة، بمفاتيح asset:<id> كما يطلبها الرسم. */
export function useAssetBlobs(center: string | null, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  const q = useQuery({
    queryKey: ["certificates", "blobs", center ?? "", sorted.join(",")],
    enabled: !!center && sorted.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const out: Record<string, AssetData> = {};
      for (let i = 0; i < sorted.length; i += 40) {
        const part = await certApi.assetData(center!, sorted.slice(i, i + 40));
        for (const a of part)
          out[`asset:${a.id}`] = { data_url: a.data_url, width: a.width, height: a.height };
      }
      return out;
    },
  });
  return { assets: q.data ?? {}, loading: q.isLoading && sorted.length > 0, error: q.error };
}

export interface HalaqaReports {
  students: { id: string; name: string }[];
  byId: Map<string, StudentReport>;
}

/** تقارير طلاب الحلقة للفترة من سجل الإنجاز القائم (مع السجل التاريخي للمحطات وإتمام السور والأجزاء). */
export function useHalaqaReports(halaqa: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["certificates", "reports", halaqa ?? "", from, to],
    enabled: !!halaqa && !!from && !!to,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<HalaqaReports> => {
      const raw = await fetchReportData({ halaqa: halaqa!, from, to, history: true });
      const c = compute(raw, ALL_FILTERS);
      const byId = new Map<string, StudentReport>();
      for (const s of c.students) byId.set(s.stats.student.id, s);
      const students = raw.students
        .filter((s) => s.member)
        .map((s) => ({ id: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));
      return { students, byId };
    },
  });
}

/** هل حُمّلت خطوط «ثمانية» (شرط في فحص الشهادة)؟ */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded",
  );
  useEffect(() => {
    if (ready || typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    void document.fonts.ready.then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}

/** عرض عنصر بالبكسل (لملاءمة الصفحة في حاويتها). */
export function useElementWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width };
}
