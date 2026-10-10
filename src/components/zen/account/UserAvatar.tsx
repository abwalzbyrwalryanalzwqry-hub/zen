import { useState } from "react";
import { displayableAvatar } from "@/lib/avatar";
import { colorFor, initialOf } from "@/lib/zen-api";

const SIZES = {
  md: "w-12 h-12 rounded-2xl text-lg",
  lg: "w-16 h-16 rounded-3xl text-2xl",
} as const;

/**
 * صورة المستخدم أو حرفه الأول على تدرّج لونه (GAP-08). زخرفية: الاسم مكتوب بجانبها دائماً.
 * إن تعذّر تحميل الصورة (حُذفت، دون اتصال) يعود الحرف.
 */
export function UserAvatar({
  userId,
  name,
  avatar,
  size = "md",
}: {
  userId: string;
  name: string;
  avatar: string | null | undefined;
  size?: keyof typeof SIZES;
}) {
  const url = displayableAvatar(avatar);
  const [broken, setBroken] = useState<string | null>(null);
  const cls = `${SIZES[size]} shrink-0 overflow-hidden`;
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        data-testid="user-avatar-img"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(url)}
        className={`${cls} object-cover bg-secondary`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${cls} bg-gradient-to-br ${colorFor(userId)} flex items-center justify-center font-black text-white`}
    >
      {initialOf(name)}
    </span>
  );
}
