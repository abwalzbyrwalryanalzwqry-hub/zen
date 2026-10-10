import { useEffect, useRef, useState } from "react";
import { Loader2, Share2, Smartphone } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  drawStory,
  loadStoryFonts,
  storyName,
  storyQr,
  type StoryInput,
  type StoryQr,
} from "@/lib/certificates/story";
import { shareCardImage } from "@/lib/quran/share-io";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";

type Base = Omit<StoryInput, "name" | "scanHint" | "brand" | "lead"> & { lead?: string };

/**
 * زر «مشاركة كقصة» ونافذته (1.20.0، المرحلة 4.6): معاينة 1080×1920 مع QR التحقق، ومفتاح «إخفاء الاسم
 * الكامل» مفعّل افتراضياً (الاسم الأول وحده)؛ يُطفئه وليّ الأمر أو صاحب الشهادة إن أراد.
 */
export function StoryShareButton({
  fullName,
  base,
  qrPayload,
  fileName,
  shareText,
  className,
}: {
  fullName: string;
  base: Base;
  qrPayload: string | null;
  fileName: string;
  shareText: string;
  className?: string;
}) {
  usePagesDict();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "h-8 px-3 rounded-xl glass text-primary text-[0.6875rem] font-bold flex items-center gap-1"
        }
        data-testid="story-share"
      >
        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
        {t("story.button")}
      </button>
      {open && (
        <StorySheet
          fullName={fullName}
          base={base}
          qrPayload={qrPayload}
          fileName={fileName}
          shareText={shareText}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StorySheet({
  fullName,
  base,
  qrPayload,
  fileName,
  shareText,
  onClose,
}: {
  fullName: string;
  base: Base;
  qrPayload: string | null;
  fileName: string;
  shareText: string;
  onClose: () => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hideFull, setHideFull] = useState(true);
  const [qr, setQr] = useState<StoryQr | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([storyQr(qrPayload), loadStoryFonts()]).then(([m]) => {
      if (alive) setQr(m);
    });
    return () => {
      alive = false;
    };
  }, [qrPayload]);

  useEffect(() => {
    if (qr === undefined) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    drawStory(
      canvas,
      {
        ...base,
        lead: base.lead ?? t("story.lead"),
        name: storyName(fullName, hideFull),
        scanHint: t("story.scan"),
        brand: t("story.brand"),
      },
      qr,
    );
    // معاينة مصغّرة (صورة JPEG خفيفة) بدل وضع اللوحة الكاملة في الصفحة.
    const id = requestAnimationFrame(() => setPreview(canvas.toDataURL("image/jpeg", 0.6)));
    return () => cancelAnimationFrame(id);
  }, [qr, hideFull, base, fullName, t]);

  const share = async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const r = await shareCardImage(canvasRef.current, fileName, shareText, t("story.button"));
      if (r === "downloaded") toast.success(t("story.downloaded"));
    } catch {
      toast.error(t("story.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={t("story.title")}
        description={t("story.hint")}
        defaultExpanded
        footer={
          <button
            type="button"
            onClick={() => void share()}
            disabled={busy || !preview}
            className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Share2 className="w-4 h-4" aria-hidden="true" />
            )}
            {t("story.share")}
          </button>
        }
      >
        <label className="flex items-start gap-3 glass rounded-2xl px-3 py-2.5 mb-3">
          <input
            type="checkbox"
            checked={hideFull}
            onChange={(e) => setHideFull(e.target.checked)}
            className="mt-1 w-4 h-4 accent-primary"
            data-testid="story-hide-name"
          />
          <span>
            <span className="block text-xs font-bold text-foreground">{t("story.hideName")}</span>
            <span className="block text-[0.6875rem] text-muted-foreground leading-relaxed">
              {t("story.hideNameHint")}
            </span>
          </span>
        </label>
        <div className="flex justify-center">
          {preview ? (
            <img
              src={preview}
              alt={t("story.preview")}
              className="h-[46dvh] w-auto rounded-2xl shadow-lg"
              data-testid="story-preview"
            />
          ) : (
            <div className="h-[46dvh] aspect-[9/16] rounded-2xl bg-muted animate-pulse" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
