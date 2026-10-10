import { LockKeyhole } from "lucide-react";
import { ActionRow } from "@/components/zen/more/ListRow";
import { useT } from "@/lib/i18n";
import { lockAppNow } from "@/lib/app-lock";

/** صف «اقفل الآن» في صفحة «المزيد» (1.29.0)؛ يظهر والقفل مفعّل فقط. */
export default function MoreLockNowRow() {
  const t = useT();
  return (
    <ActionRow
      icon={LockKeyhole}
      label={t("appLock.lockNow.label")}
      hint={t("appLock.lockNow.hint")}
      onClick={() => void lockAppNow().catch(() => undefined)}
    />
  );
}
