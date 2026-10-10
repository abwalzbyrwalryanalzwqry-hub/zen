import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { ActionRow } from "@/components/zen/more/ListRow";
import { useConfirm } from "@/hooks/useConfirm";
import { signOutEverywhere } from "@/lib/auth/sign-out";
import { forgetAccount, otherAccounts, type RecentAccount } from "@/lib/recent-accounts";
import { useT } from "@/lib/i18n";
import { colorFor, initialOf } from "@/lib/zen-api";

/**
 * «الحسابات على هذا الجهاز» (GAP-09): التبديل خروج كامل ثم دخول باسم المستخدم مملوءاً، فلا تُحفظ جلستان
 * ولا تبقى بيانات حساب في ذاكرة آخر. لا يُحفظ إلا اسم المستخدم والاسم الظاهر.
 */
export function RecentAccounts({ userId }: { userId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [list, setList] = useState<RecentAccount[]>(() => otherAccounts(userId));
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useConfirm();

  const go = async (username?: string) => {
    if (busy) return;
    const ok = await ask({
      title: username
        ? t("account.switch.confirmTitle", { name: username })
        : t("account.switch.addTitle"),
      description: t("account.switch.confirmBody"),
      confirmLabel: username ? t("account.switch.switch") : t("account.switch.continue"),
    });
    if (!ok) return;
    setBusy(true);
    await signOutEverywhere(qc);
    void navigate({ to: "/auth/login", search: username ? { u: username } : {}, replace: true });
  };

  const forget = (r: RecentAccount) => {
    forgetAccount(r.userId);
    setList(otherAccounts(userId));
  };

  return (
    <SettingsSection id="switch" title={t("account.switch.title")}>
      {list.map((r) => (
        <li key={r.userId} className="flex items-center gap-1 pe-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void go(r.username)}
            aria-label={t("account.switch.to", { name: r.name ?? r.username })}
            className="flex-1 min-w-0 min-h-14 px-4 py-2 flex items-center gap-3 text-start disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span
              aria-hidden="true"
              className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${colorFor(r.userId)} flex items-center justify-center text-white text-sm font-black`}
            >
              {initialOf(r.name ?? r.username)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-foreground truncate">
                {r.name ?? r.username}
              </span>
              <span className="block text-xs text-muted-foreground truncate" dir="ltr">
                {r.username}
              </span>
            </span>
            <span className="text-xs font-bold text-primary">{t("account.switch.switch")}</span>
          </button>
          <button
            type="button"
            onClick={() => forget(r)}
            aria-label={t("account.switch.forget", { name: r.name ?? r.username })}
            className="min-h-11 min-w-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </li>
      ))}
      <ActionRow
        icon={UserPlus}
        label={t("account.switch.add")}
        hint={t("account.switch.hint")}
        busy={busy}
        onClick={() => void go()}
      />
      {dialog}
    </SettingsSection>
  );
}
