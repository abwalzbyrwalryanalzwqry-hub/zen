import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MM } from "@/lib/reports/render";

/**
 * عرض صفحات التقرير كما ستُطبع: المستند نفسه الذي يصير PDF (iframe بـ srcdoc، بلا سكربت)، بتكبير
 * وتصغير وتنقّل بين الصفحات. `thumb` لعرض الصفحة الأولى مصغّرة في خطوات التصميم.
 */
export function PagesView({
  html,
  pages,
  landscape,
  thumb = false,
}: {
  html: string;
  pages: number;
  landscape: boolean;
  thumb?: boolean;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const pageW = (landscape ? 297 : 210) * MM;
  const pageH = (landscape ? 210 : 297) * MM;
  const fit = (width - 16) / pageW;
  const scale = fit * zoom;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // تصغير بـ transform لا بـ zoom: zoom يعيد تخطيط النص بمقاس مصغّر فتتقرّب ارتفاعات الأسطر وتطول الجداول
  // قليلاً فيُقص آخر صف في المعاينة. transform يصغّر الصورة فقط، فالمعاينة تطابق PDF تماماً.
  const apply = () => {
    const d = frame.current?.contentDocument;
    const b = d?.body;
    if (!d?.documentElement || !b) return;
    const vw = d.documentElement.clientWidth || width;
    Object.assign(b.style, {
      position: "absolute",
      top: "0",
      left: `${Math.max(0, (vw - pageW * scale) / 2)}px`,
      width: `${pageW}px`,
      transformOrigin: "0 0",
      transform: `scale(${scale})`,
    });
    d.documentElement.style.overflowX = scale * pageW > vw + 1 ? "auto" : "hidden";
    if (thumb) d.documentElement.style.overflow = "hidden";
  };
  useEffect(apply);

  const onLoad = () => {
    apply();
    const w = frame.current?.contentWindow;
    w?.addEventListener("scroll", () => {
      const d = frame.current?.contentDocument;
      if (!d) return;
      const y = (w.scrollY || d.documentElement.scrollTop) / scale;
      setPage(Math.min(pages, Math.max(1, Math.floor((y + pageH / 2) / (pageH + 6 * MM)) + 1)));
    });
  };

  const go = (n: number) => {
    const d = frame.current?.contentDocument;
    const el = d?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!el) return;
    frame.current?.contentWindow?.scrollTo({ top: el.offsetTop * scale - 8, behavior: "smooth" });
    setPage(n);
  };

  const height = thumb ? pageH * fit + 12 * MM * fit : undefined;
  return (
    <div className="space-y-2">
      <div ref={box} className="rounded-3xl overflow-hidden bg-muted/60 border border-border">
        <iframe
          ref={frame}
          title={t("reports.preview.frame")}
          srcDoc={html}
          onLoad={onLoad}
          className="w-full block bg-transparent"
          style={{ height: height ?? "min(70vh, 720px)" }}
        />
      </div>
      {!thumb && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label={t("reports.preview.prev")}
            className="min-h-11 min-w-11 rounded-2xl glass flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4 ltr:rotate-180" aria-hidden="true" />
          </button>
          <span
            role="status"
            className="flex-1 text-center text-sm font-bold text-foreground tabular-nums"
          >
            {t("reports.preview.page", { n: page, total: pages })}
          </span>
          <button
            type="button"
            onClick={() => go(Math.min(pages, page + 1))}
            disabled={page >= pages}
            aria-label={t("reports.preview.next")}
            className="min-h-11 min-w-11 rounded-2xl glass flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4 ltr:rotate-180" aria-hidden="true" />
          </button>
          <span className="w-px h-6 bg-border" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))}
            aria-label={t("reports.preview.zoomOut")}
            className="min-h-11 min-w-11 rounded-2xl glass flex items-center justify-center"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-bold text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Math.round((z + 0.2) * 10) / 10))}
            aria-label={t("reports.preview.zoomIn")}
            className="min-h-11 min-w-11 rounded-2xl glass flex items-center justify-center"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
