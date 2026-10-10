import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmOptions } from "@/components/zen/common/ConfirmDialog";

/**
 * بديل وعدي لـ `window.confirm`: `const [dialog, ask] = useConfirm()` ثم `if (await ask({...}))`.
 * يُرسم `dialog` مرة واحدة في المكوّن.
 */
export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const dialog = (
    <ConfirmDialog
      open={!!opts}
      onOpenChange={(o) => !o && close(false)}
      onConfirm={() => close(true)}
      title={opts?.title ?? ""}
      description={opts?.description}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      destructive={opts?.destructive}
    />
  );
  return [dialog, ask];
}
