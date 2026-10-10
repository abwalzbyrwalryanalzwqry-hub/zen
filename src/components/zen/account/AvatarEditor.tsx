import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/zen/account/UserAvatar";
import { useConfirm } from "@/hooks/useConfirm";
import { profileKey } from "@/hooks/useProfile";
import { AvatarError, displayableAvatar, removeAvatar, uploadAvatar } from "@/lib/avatar";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import type { Profile } from "@/lib/zen-api";

/** تغيير الصورة الشخصية أو إزالتها من «الحساب» (GAP-08). */
export function AvatarEditor({ userId, profile }: { userId: string; profile: Profile | null }) {
  const t = useT();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useConfirm();
  const current = profile?.avatar ?? null;
  const has = !!displayableAvatar(current);

  const setAvatar = (avatar: string | null) => {
    qc.setQueryData<Profile | null>(profileKey(userId), (p) => (p ? { ...p, avatar } : p));
  };

  const pick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      setAvatar(await uploadAvatar(userId, file, current));
      toast.success(t("account.avatar.saved"));
    } catch (e) {
      const code = e instanceof AvatarError ? e.code : "upload";
      toast.error(t(`account.avatar.errors.${code}`));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    if (busy) return;
    const ok = await ask({
      title: t("account.avatar.removeTitle"),
      description: t("account.avatar.removeBody"),
      confirmLabel: t("account.avatar.remove"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeAvatar(userId, current);
      setAvatar(null);
    } catch {
      toast.error(t("account.avatar.errors.save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative">
        <UserAvatar userId={userId} name={profile?.name ?? ""} avatar={current} size="lg" />
        {busy && (
          <span
            role="status"
            aria-label={t("account.avatar.uploading")}
            className="absolute inset-0 rounded-3xl bg-background/60 flex items-center justify-center"
          >
            <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="avatar-input"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label={has ? t("account.avatar.change") : t("account.avatar.add")}
          className="min-h-11 min-w-11 rounded-xl glass flex items-center justify-center text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
        </button>
        {has && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            aria-label={t("account.avatar.remove")}
            className="min-h-11 min-w-11 rounded-xl glass flex items-center justify-center text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {dialog}
    </div>
  );
}
