import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize, Pause, Play, Printer } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { CertPage } from "@/components/zen/certificates/CertPage";
import { SBtn, StudioFrame } from "@/components/zen/certificates/StudioFrame";
import { Num } from "@/components/zen/certificates/fields";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi } from "@/lib/certificates/api";
import { ceremonyOrder } from "@/lib/certificates/honor";
import { printCertificates } from "@/lib/certificates/export";
import { domMeasurer } from "@/lib/certificates/fit";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { mapLimit, renderIssued, type IssuedPage } from "@/lib/certificates/issued";
import { renderPage } from "@/lib/certificates/render";
import {
  calibrationDesign,
  cleanOffset,
  fieldsOnly,
  loadOffset,
  saveOffset,
  type Offset,
} from "@/lib/certificates/preprinted";

const ids = (v: unknown) =>
  typeof v === "string" && v
    ? v
        .split(",")
        .map((x) => x.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 200)
    : [];

/**
 * /certificates/ceremony?ids=… — وضع الحفل والطباعة المرتّبة (1.26.0، فحص الاستوديو المرحلة 5 — الفكرتان 6 و8):
 * عرض الشهادات تباعاً بملء الشاشة باسم الطالب، وطباعتها كلها بالترتيب على ورق عادي أو على ورق المركز المطبوع
 * مسبقاً (الحقول فقط) مع إزاحة معايرة تُحفظ للمركز على هذا الجهاز.
 */
export const Route = createFileRoute("/_authed/certificates/ceremony")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesCeremony") }] }),
  validateSearch: (s: Record<string, unknown>): { ids?: string } => ({
    ids: typeof s.ids === "string" ? s.ids.slice(0, 16_400) : undefined,
  }),
  component: Ceremony,
});

function Ceremony() {
  useCertificatesDict();
  const t = useT();
  const list = ids(Route.useSearch().ids);
  const data = useQuery({
    queryKey: ["certificates", "ceremony", list.join(",")],
    enabled: list.length > 0,
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
      const all = (await mapLimit(chunks, 2, (c) => certApi.getMany(c))).flat();
      return ceremonyOrder(all.filter((d) => d.status === "issued" || d.status === "archived"));
    },
  });
  const details = useMemo(() => data.data ?? [], [data.data]);
  const pages = useQuery({
    queryKey: ["certificates", "ceremony-pages", list.join(","), details.length],
    enabled: details.length > 0,
    queryFn: () => {
      const m = domMeasurer();
      return mapLimit(details, 4, (d) => renderIssued(d, m));
    },
  });
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(false);
  const n = pages.data?.length ?? 0;
  useEffect(() => {
    if (!play || n < 2) return;
    const h = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(h);
  }, [play, n]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // الواجهة من اليمين لليسار: السهم الأيسر «التالي».
      if (e.key === "ArrowLeft" || e.key === " ") setI((x) => Math.min(n - 1, x + 1));
      else if (e.key === "ArrowRight") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [n]);
  const center = details[0]?.center_id ?? "";
  // الإزاحة محفوظة لكل مركز؛ تُقرأ عند تغيّر المركز دون تأثير جانبي.
  const [edited, setEdited] = useState<{ center: string; o: Offset } | null>(null);
  const offset: Offset =
    edited?.center === center ? edited.o : center ? loadOffset(center) : { dx: 0, dy: 0 };
  const setOff = (o: Partial<Offset>) => {
    const v = cleanOffset({ ...offset, ...o });
    setEdited({ center, o: v });
    if (center) saveOffset(center, v);
  };
  const [printing, setPrinting] = useState<string | null>(null);
  const title = t("certificates.ceremony.title");
  const print = async (kind: "all" | "fields" | "calibrate") => {
    if (!pages.data?.length) return;
    setPrinting(kind);
    try {
      const size = pages.data[0].size;
      let html: string[];
      if (kind === "all") html = pages.data.map((p) => p.html);
      else if (kind === "calibrate") {
        const page = details[0].design?.page;
        if (!page) return;
        html = [
          renderPage(calibrationDesign(page, t("certificates.ceremony.calibrateSheet")), {
            vars: {},
            assets: {},
            uid: "cal",
          }).html,
        ];
      } else {
        const m = domMeasurer();
        const out: IssuedPage[] = await mapLimit(details, 4, (d) =>
          renderIssued({ ...d, design: d.design ? fieldsOnly(d.design, offset) : d.design }, m),
        );
        html = out.map((p) => p.html);
      }
      await printCertificates(html, size, title);
    } catch (e) {
      console.warn("[certificates] ceremony print", e);
      toast.error(t("certificates.err.generic"));
    } finally {
      setPrinting(null);
    }
  };
  const p = pages.data?.[Math.min(i, Math.max(0, n - 1))];
  const d = details[Math.min(i, Math.max(0, n - 1))];
  const full = () => void document.getElementById("zen-ceremony")?.requestFullscreen?.();

  return (
    <StudioFrame title={title} subtitle={t("certificates.ceremony.subtitle")}>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {!list.length && (
          <p className="text-sm text-muted-foreground">{t("certificates.ceremony.none")}</p>
        )}
        {(data.isLoading || pages.isLoading) && (
          <div
            className="flex justify-center py-16"
            role="status"
            aria-label={t("certificates.loading")}
          >
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        {(data.error || pages.error) && (
          <QueryError onRetry={() => void (data.error ? data.refetch() : pages.refetch())} />
        )}
        {p && d && (
          <>
            <div
              id="zen-ceremony"
              className="rounded-3xl bg-[#0f2a20] p-4 sm:p-8 flex flex-col items-center gap-4 text-white"
            >
              <p
                className="text-2xl sm:text-4xl font-black text-center break-words"
                aria-live="polite"
              >
                {d.student_name}
              </p>
              <CertPage
                html={p.html}
                width={p.size.width}
                height={p.size.height}
                maxHeight={620}
                label={p.title}
              />
              <p className="text-sm opacity-80">
                {t("certificates.ceremony.of", { i: Math.min(i, n - 1) + 1, n })}
                {d.halaqa_name ? ` · ${d.halaqa_name}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SBtn onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
                <ChevronRight className="w-4 h-4" /> {t("certificates.ceremony.prev")}
              </SBtn>
              <SBtn
                tone="primary"
                onClick={() => setI((x) => Math.min(n - 1, x + 1))}
                disabled={i >= n - 1}
              >
                {t("certificates.ceremony.next")} <ChevronLeft className="w-4 h-4" />
              </SBtn>
              <SBtn onClick={() => setPlay((v) => !v)}>
                {play ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{" "}
                {t(play ? "certificates.ceremony.pause" : "certificates.ceremony.play")}
              </SBtn>
              <SBtn onClick={full}>
                <Maximize className="w-4 h-4" /> {t("certificates.ceremony.fullscreen")}
              </SBtn>
            </div>
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-black">{t("certificates.ceremony.printTitle")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("certificates.ceremony.printHint")}
              </p>
              <SBtn tone="primary" disabled={!!printing} onClick={() => void print("all")}>
                <Printer className="w-4 h-4" /> {t("certificates.ceremony.printAll", { n })}
              </SBtn>
              <div className="rounded-xl bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-bold">{t("certificates.ceremony.preprinted")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("certificates.ceremony.preprintedHint")}
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  <Num
                    label={t("certificates.ceremony.dx")}
                    value={offset.dx}
                    step={0.5}
                    min={-20}
                    max={20}
                    onChange={(dx) => setOff({ dx })}
                  />
                  <Num
                    label={t("certificates.ceremony.dy")}
                    value={offset.dy}
                    step={0.5}
                    min={-20}
                    max={20}
                    onChange={(dy) => setOff({ dy })}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SBtn disabled={!!printing} onClick={() => void print("calibrate")}>
                    {t("certificates.ceremony.calibrate")}
                  </SBtn>
                  <SBtn disabled={!!printing} onClick={() => void print("fields")}>
                    <Printer className="w-4 h-4" /> {t("certificates.ceremony.printFields")}
                  </SBtn>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </StudioFrame>
  );
}
