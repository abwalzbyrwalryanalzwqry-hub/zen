import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Award, KeyRound, Loader2, LogOut, Pencil } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { AccountKindSettings, DataSettings } from "@/components/zen/AccountSettings";
import { LoginSecuritySettings } from "@/components/zen/LoginSecurity";
import { TeacherActivation } from "@/components/zen/TeacherActivation";
import { GuardianLinkCard } from "@/components/guardian/GuardianLinkCard";
import { ConfirmDialog } from "@/components/zen/common/ConfirmDialog";
import { CopyButton } from "@/components/zen/more/CopyButton";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { ActionRow } from "@/components/zen/more/ListRow";
import { QueryError } from "@/components/zen/QueryError";
import { AvatarEditor } from "@/components/zen/account/AvatarEditor";
import { RecentAccounts } from "@/components/zen/account/RecentAccounts";
import { updateRecentName } from "@/lib/recent-accounts";
import { useSession } from "@/hooks/useSession";
import { useHomeContext } from "@/hooks/useHomeContext";
import {
  PROFILE_NAME_MAX,
  PROFILE_NAME_MIN,
  useProfile,
  useRenameProfile,
} from "@/hooks/useProfile";
import { createTeacherInvite } from "@/lib/roles";
import { signOutEverywhere } from "@/lib/auth/sign-out";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authed/account")({
  head: () => ({ meta: [{ title: tStatic("meta.account") }] }),
  component: AccountPage,
});

/**
 * «الحساب» (تحليل «المزيد» §7.2): من أنا؟ الاسم ونوع الحساب ودور المعلّم وأولياء الأمر وأمان الدخول
 * وبياناتي. العرض واللغة انتقلا إلى `/settings/display`، والخصوصية والإصدار إلى «عن زِن».
 * الدور من `useHomeContext` وحده (IA-07) فلا يختلف عمّا في «المزيد».
 */
function AccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userId, session } = useSession();
  const { ctx, mode, refetch } = useHomeContext();
  const profileQ = useProfile();
  const rename = useRenameProfile();
  const profile = profileQ.data ?? null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const teacher = ctx.is_teacher;
  // الاسم الظاهر في «الحسابات على هذا الجهاز» يتبع آخر اسم محفوظ (GAP-09).
  useEffect(() => {
    if (userId) updateRecentName(userId, profile?.name);
  }, [userId, profile?.name]);

  const save = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < PROFILE_NAME_MIN || clean.length > PROFILE_NAME_MAX) {
      toast.error(t("profile.nameInvalid"));
      return;
    }
    try {
      await rename.mutateAsync(clean);
      setEditing(false);
      toast.success(t("profile.nameSaved"));
    } catch (e) {
      toast.error(t("profile.nameSaveFailed", { reason: e instanceof Error ? e.message : "" }));
    }
  };

  const issueInvite = async () => {
    if (issuing) return;
    setIssuing(true);
    try {
      setIssuedCode(await createTeacherInvite(t("account.teacher.inviteNote")));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("account.teacher.issueFailed"));
    } finally {
      setIssuing(false);
    }
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutEverywhere(qc);
    void navigate({ to: "/auth/login", replace: true });
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <h1 className="flex-1 text-xl font-black text-foreground">{t("account.title")}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-8 space-y-4">
          {profileQ.isError && !profile ? (
            <QueryError onRetry={() => void profileQ.refetch()} />
          ) : (
            <section
              aria-label={t("account.identity")}
              className="glass-strong rounded-3xl p-5 flex items-center gap-4"
            >
              {userId && <AvatarEditor userId={userId} profile={profile} />}
              <div className="flex-1 min-w-0">
                {!profile ? (
                  <Loader2
                    className="w-5 h-5 animate-spin text-primary"
                    role="status"
                    aria-label={t("common.loading")}
                  />
                ) : editing ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                  >
                    <label
                      htmlFor="zen-account-name"
                      className="block text-xs text-muted-foreground"
                    >
                      {t("account.nameLabel")}
                    </label>
                    <input
                      id="zen-account-name"
                      value={name}
                      maxLength={PROFILE_NAME_MAX}
                      autoComplete="name"
                      onChange={(e) => setName(e.target.value)}
                      className="w-full glass rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={rename.isPending || name.trim().length < PROFILE_NAME_MIN}
                        className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
                      >
                        {rename.isPending ? t("account.saving") : t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="min-h-11 px-4 rounded-xl glass text-xs"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="text-lg font-black text-foreground truncate">{profile.name}</p>
                    {session?.user.phone && (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {session.user.phone}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gold/15 border border-gold/30 text-xs text-gold font-medium">
                        <Award className="w-3 h-3" aria-hidden="true" />
                        {t(`more.roles.${mode}`)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setName(profile.name ?? "");
                          setEditing(true);
                        }}
                        className="min-h-11 px-2 inline-flex items-center gap-1 text-xs text-primary font-bold"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        {t("account.editName")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          <AccountKindSettings />

          <SettingsSection
            id="teacher"
            variant="card"
            title={teacher ? t("account.teacher.inviteTitle") : t("account.teacher.roleTitle")}
          >
            {teacher ? (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("account.teacher.inviteHint")}
                </p>
                <button
                  type="button"
                  onClick={() => void issueInvite()}
                  disabled={issuing}
                  className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  {issuing ? t("account.teacher.issuing") : t("account.teacher.issue")}
                </button>
                {issuedCode && (
                  <div className="glass rounded-2xl ps-4 pe-1 py-1 flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-sm tracking-widest text-gold select-all"
                      dir="ltr"
                    >
                      {issuedCode}
                    </span>
                    <CopyButton value={issuedCode} label={t("account.teacher.copyCode")} />
                  </div>
                )}
              </>
            ) : (
              <TeacherActivation
                onActivated={() => {
                  void refetch();
                  void profileQ.refetch();
                }}
              />
            )}
          </SettingsSection>

          {!teacher && mode !== "guardian" && userId && (
            <SettingsSection id="guardians" variant="card" title={t("account.guardians")}>
              <GuardianLinkCard studentId={userId} />
            </SettingsSection>
          )}

          <LoginSecuritySettings />

          <DataSettings />

          {userId && <RecentAccounts userId={userId} />}

          <ul className="glass rounded-3xl overflow-hidden">
            <ActionRow
              icon={LogOut}
              tone="danger"
              label={t("more.logout")}
              busy={signingOut}
              onClick={() => setConfirmOut(true)}
            />
          </ul>
        </div>

        <ConfirmDialog
          open={confirmOut}
          onOpenChange={setConfirmOut}
          busy={signingOut}
          title={t("more.logoutConfirm")}
          description={t("more.logoutBody")}
          confirmLabel={t("more.logout")}
          onConfirm={() => void signOut()}
        />
      </div>
    </PhoneFrame>
  );
}
