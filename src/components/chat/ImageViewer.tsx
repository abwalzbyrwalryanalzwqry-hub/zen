import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

/** عرض صورة المحادثة بملء الشاشة، ويُغلق بـ Escape أو بالنقر خارجها. */
export function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog.Root open={!!src} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          onClick={onClose}
        >
          <Dialog.Title className="sr-only">{t("chat.image.title")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("chat.image.hint")}</Dialog.Description>
          {src && (
            <img
              src={src}
              alt={t("chat.image.alt")}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-2xl object-contain"
            />
          )}
          <Dialog.Close
            aria-label={t("common.close")}
            className="absolute top-4 end-4 min-h-11 min-w-11 rounded-full bg-black/50 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
