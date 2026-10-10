import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Expand,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import type { CheckItem } from "@/lib/certificates/validate";
import { CertPage } from "./CertPage";
import { CheckList } from "./CheckList";
import { SBtn } from "./StudioFrame";

export interface PreviewItem {
  id: string;
  name: string;
  html: string;
  ok: boolean;
  items: CheckItem[];
}

/**
 * نافذة المعاينة: تكبير وتصغير، ملء الشاشة، التالي والسابق بين طلاب الدفعة، وأزرار تعديل / حفظ كقالب /
 * فحص الشهادة / إصدار / إلغاء. الإصدار معطّل ما دام في أي شهادة بند مانع.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  items,
  index,
  onIndex,
  size,
  onEdit,
  onSaveTemplate,
  onIssue,
  issuing,
  issueLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: PreviewItem[];
  index: number;
  onIndex: (i: number) => void;
  size: { width: number; height: number };
  onEdit?: () => void;
  onSaveTemplate?: () => void;
  onIssue?: () => void;
  issuing?: boolean;
  issueLabel?: string;
}) {
  const t = useT();
  const [zoom, setZoom] = useState<number | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = items[Math.min(index, items.length - 1)];
  const blocked = items.filter((i) => !i.ok).length;
  if (!cur) return null;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !issuing && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          ref={box}
          dir="rtl"
          className="fixed z-50 inset-2 sm:inset-6 rounded-3xl bg-background flex flex-col overflow-hidden shadow-2xl focus:outline-none"
        >
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border/60">
            <Dialog.Title className="text-sm font-black flex-1 truncate">
              {t("certificates.preview.title")} — {cur.name}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t("certificates.preview.student")}
            </Dialog.Description>
            {items.length > 1 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("certificates.preview.of", { i: index + 1, n: items.length })}
              </span>
            )}
            <SBtn
              title={t("certificates.preview.zoomOut")}
              onClick={() => setZoom(Math.max(0.3, (zoom ?? 0.7) - 0.1))}
            >
              <Minus className="w-4 h-4" />
            </SBtn>
            <SBtn title={t("certificates.preview.fit")} onClick={() => setZoom(null)}>
              {zoom ? `${Math.round(zoom * 100)}%` : t("certificates.preview.fit")}
            </SBtn>
            <SBtn
              title={t("certificates.preview.zoomIn")}
              onClick={() => setZoom(Math.min(2.5, (zoom ?? 0.7) + 0.1))}
            >
              <Plus className="w-4 h-4" />
            </SBtn>
            <SBtn
              title={t("certificates.preview.fullscreen")}
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void box.current?.requestFullscreen?.()
              }
            >
              <Expand className="w-4 h-4" />
            </SBtn>
            <Dialog.Close asChild>
              <SBtn title={t("certificates.close")} disabled={issuing}>
                <X className="w-4 h-4" />
              </SBtn>
            </Dialog.Close>
          </div>
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-8 bg-muted/40 flex items-start justify-center">
              <CertPage
                html={cur.html}
                width={size.width}
                height={size.height}
                zoom={zoom ?? undefined}
                maxHeight={zoom ? undefined : 640}
                label={cur.name}
              />
            </div>
            {showCheck && (
              <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-s border-border/60 p-4 overflow-y-auto max-h-[40vh] lg:max-h-none">
                <h2 className="text-sm font-black mb-2">{t("certificates.check.title")}</h2>
                <CheckList items={cur.items} ok={cur.ok} name={cur.name} />
                {items.length > 1 && (
                  <p
                    className={`mt-3 text-xs font-bold ${blocked ? "text-destructive" : "text-primary"}`}
                  >
                    {blocked
                      ? t("certificates.check.someBlocked", { n: blocked })
                      : t("certificates.check.allReady", { n: items.length })}
                  </p>
                )}
              </aside>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2 flex-wrap px-4 py-3 border-t border-border/60">
            {items.length > 1 && (
              <>
                <SBtn
                  title={t("certificates.preview.prev")}
                  disabled={index === 0}
                  onClick={() => onIndex(index - 1)}
                >
                  <ChevronRight className="w-4 h-4" /> {t("certificates.preview.prev")}
                </SBtn>
                <SBtn
                  title={t("certificates.preview.next")}
                  disabled={index >= items.length - 1}
                  onClick={() => onIndex(index + 1)}
                >
                  {t("certificates.preview.next")} <ChevronLeft className="w-4 h-4" />
                </SBtn>
              </>
            )}
            <span className="flex-1" />
            {onEdit && <SBtn onClick={onEdit}>{t("certificates.preview.edit")}</SBtn>}
            {onSaveTemplate && (
              <SBtn onClick={onSaveTemplate}>{t("certificates.preview.saveAsTemplate")}</SBtn>
            )}
            <SBtn tone="gold" onClick={() => setShowCheck((v) => !v)}>
              <ClipboardCheck className="w-4 h-4" /> {t("certificates.preview.check")}
            </SBtn>
            <Dialog.Close asChild>
              <SBtn disabled={issuing}>{t("certificates.preview.cancel")}</SBtn>
            </Dialog.Close>
            {onIssue && (
              <SBtn
                tone="primary"
                disabled={issuing || blocked > 0}
                onClick={onIssue}
                title={blocked ? t("certificates.check.blocked") : undefined}
              >
                {issuing && <Loader2 className="w-4 h-4 animate-spin" />}
                {issueLabel ?? t("certificates.preview.issue")}
              </SBtn>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
