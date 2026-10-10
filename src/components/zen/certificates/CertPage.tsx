import { MM_PX, useElementWidth } from "./hooks";

/**
 * صفحة شهادة مرسومة (HTML من render.ts) مصغّرة لتملأ عرض حاويتها أو بمقياس محدد. الرسم نفسه الذي يُطبع
 * ويُصدَّر — المعاينة تطابق الملف.
 */
export function CertPage({
  html,
  width,
  height,
  zoom,
  maxHeight,
  className = "",
  label,
}: {
  html: string;
  width: number;
  height: number;
  /** مقياس ثابت (1 = الحجم الحقيقي). بدونه: ملء العرض. */
  zoom?: number;
  maxHeight?: number;
  className?: string;
  label?: string;
}) {
  const { ref, width: box } = useElementWidth<HTMLDivElement>();
  const natW = width * MM_PX;
  const natH = height * MM_PX;
  let scale = zoom ?? (box ? box / natW : 0);
  if (!zoom && maxHeight && natH * scale > maxHeight) scale = maxHeight / natH;
  return (
    <div ref={ref} className={`w-full ${className}`}>
      {scale > 0 && (
        <div
          role="img"
          dir="ltr"
          aria-label={label}
          className="mx-auto shadow-[0_10px_40px_-12px_rgba(20,50,40,.35)] ring-1 ring-black/5 bg-white"
          style={{ width: natW * scale, height: natH * scale, overflow: "hidden" }}
        >
          <div
            style={{
              width: natW,
              height: natH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}
