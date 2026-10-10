import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Medal,
  Bell,
  BookOpen,
  BookOpenCheck,
  Bot,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Download,
  HelpCircle,
  MessageSquareWarning,
  Share2,
  Sparkles,
  Star,
  Inbox,
  Search,
  X,
  HeartHandshake,
  Info,
  LogOut,
  Mic,
  QrCode,
  ScrollText,
  BellRing,
  FileText,
  Moon,
  Palette,
  Shield,
  ShieldCheck,
  Sprout,
  Upload,
  type LucideIcon,
  Wallet,
  Headphones,
  LockKeyhole,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { PageHeader } from "@/components/zen/common/PageHeader";
import { useHomeContext } from "@/hooks/useHomeContext";
import { useSession } from "@/hooks/useSession";
import {
  aboutSection,
  supportSection,
  guestMoreSections,
  moreSectionsFor,
  ownerSection,
  type MoreSection,
} from "@/lib/home";
import { GuestAccountCard } from "@/components/zen/GuestHome";
import { useIsAppOwner } from "@/hooks/useIsAppOwner";
import { useT, t as tStatic } from "@/lib/i18n";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { UserAvatar } from "@/components/zen/account/UserAvatar";
import { useProfile } from "@/hooks/useProfile";
import { signOutEverywhere } from "@/lib/auth/sign-out";
import { ConfirmDialog } from "@/components/zen/common/ConfirmDialog";
import { ActionRow, ListRow } from "@/components/zen/more/ListRow";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { ForwardChevron } from "@/components/zen/more/ForwardChevron";
import { CountBadge } from "@/components/zen/more/CountBadge";
import { QuickBar } from "@/components/zen/more/QuickBar";
import { useMoreBadges } from "@/hooks/useMoreBadges";
import { badgeFor } from "@/lib/more-badges";
import { filterSections } from "@/lib/more-search";
import { canRateApp, rateApp, shareApp } from "@/lib/app-share";
import { hasUnseenRelease } from "@/lib/whats-new";
import { toast } from "@/lib/toast";
import { useAppLock } from "@/lib/app-lock-state";

// «اقفل الآن» (1.29.0) في Android فقط: نصوصه في قاموس القفل الكسول، لا في الحزمة الأولى.
const MoreLockNowRow = lazy(() =>
  Promise.all([
    import("@/components/zen/lock/MoreLockNowRow"),
    import("@/lib/lock-i18n").then((m) => m.ensureLockDict().catch(() => undefined)),
  ]).then(([m]) => m),
);

import { useSimpleMode } from "@/lib/simple-mode";
export const Route = createFileRoute("/_authed/more")({
  head: () => ({ meta: [{ title: tStatic("meta.more") }] }),
  component: MorePage,
});

/** أيقونة لكل مدخل بمفتاحه الثابت: القائمة النصية الطويلة كانت تُقرأ ببطء (فحص الأقسام P1). */
const ICON: Record<string, LucideIcon> = {
  assistant: Bot,
  recite: Mic,
  exams: ClipboardCheck,
  stories: ScrollText,
  achievements: Award,
  certificates: Medal,
  quran: BookOpen,
  mushaf: BookOpenCheck,
  muhasaba: Sprout,
  family: HeartHandshake,
  centers: Building2,
  notifications: Bell,
  settingsDisplay: Palette,
  settingsNotifications: BellRing,
  settingsPrayer: Moon,
  settingsLock: LockKeyhole,
  storage: Download,
  privacy: Shield,
  terms: FileText,
  ownerUsage: BarChart3,
  register: ClipboardList,
  attendanceCode: QrCode,
  atRisk: AlertTriangle,
  import: Upload,
  verify: ShieldCheck,
  appHealth: Activity,
  about: Info,
  help: HelpCircle,
  feedback: MessageSquareWarning,
  whatsNew: Sparkles,
  ownerFeedback: Inbox,
  fees: Wallet,
  remote: Headphones,
  teacherRemote: Headphones,
};

/** كل ما ليس في الشريط السفلي، مرتّباً حسب دور صاحب الحساب. */
function MorePage() {
  const { ctx, mode, guest } = useHomeContext();
  const { userId } = useSession();
  const navigate = useNavigate();
  const t = useT();
  const lockSnap = useAppLock();
  const lockOn = lockSnap.status === "ready" && lockSnap.state.enabled;
  const owner = useIsAppOwner();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const qc = useQueryClient();
  const me = useProfile();
  const { on } = useFeatureFlags();
  const badges = useMoreBadges();
  const [query, setQuery] = useState("");
  const simple = useSimpleMode(ctx.center_simple_mode);
  const base = guest ? guestMoreSections() : moreSectionsFor(mode, ctx, on, simple);
  // «صاحب التطبيق» لمالكه وحده (7.7)، و«عن زِن» للجميع (ومنهم الضيف) في الآخر.
  const sections: MoreSection[] = guest
    ? base
    : [...base, ...(owner ? [ownerSection()] : []), supportSection(), aboutSection()];
  // نقطة «جديد» بجانب «ما الجديد» حتى تُفتح بعد التحديث (GAP-04). تُقرأ مرة عند فتح الصفحة.
  const [unseen] = useState(hasUnseenRelease);
  const share = async () => {
    const r = await shareApp();
    if (r === "copied") toast.success(t("support.linkCopied"));
    else if (r === "failed") toast.error(t("support.shareFailed"));
  };
  const shown = filterSections(sections, query);
  const results = shown.reduce((n, s) => n + s.links.length, 0);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // رمز الإشعارات والذاكرة ومفاتيح الحساب تُمسح كلها (lib/auth/sign-out).
    await signOutEverywhere(qc);
    void navigate({ to: "/auth/login", replace: true });
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <PageHeader title={t("nav.more")} />
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          {guest ? (
            <GuestAccountCard />
          ) : (
            <Link
              to="/account"
              className="glass rounded-3xl p-4 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {me.isPending ? (
                // فحص 2026-10 (P1-9): هيكل تحميل بدل «؟» و«…» حتى يصل الملف.
                <span
                  aria-hidden="true"
                  data-testid="profile-skeleton"
                  className="w-12 h-12 rounded-2xl shrink-0 bg-secondary animate-pulse"
                />
              ) : (
                <UserAvatar
                  userId={userId ?? ""}
                  name={me.data?.name || t("more.unnamed")}
                  avatar={me.data?.avatar}
                />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-black text-foreground truncate">
                  {me.isPending ? (
                    <>
                      <span className="sr-only">{t("more.loadingProfile")}</span>
                      <span
                        aria-hidden="true"
                        className="block h-4 w-28 rounded-md bg-secondary animate-pulse"
                      />
                    </>
                  ) : (
                    me.data?.name || t("more.unnamed")
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`more.roles.${mode}`)} · {t("more.profileHint")}
                </span>
              </span>
              <ForwardChevron />
            </Link>
          )}
          <QuickBar />
          <div className="relative" role="search">
            <Search
              className="w-4 h-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("more.search.label")}
              placeholder={t("more.search.placeholder")}
              enterKeyHint="search"
              className="w-full min-h-12 rounded-2xl glass ps-10 pe-11 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("more.search.clear")}
                className="absolute end-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
          </div>
          {query.trim() !== "" && (
            <p className="px-2 text-xs text-muted-foreground" role="status">
              {results > 0
                ? t("more.search.count", { n: results })
                : t("more.search.empty", { q: query.trim() })}
            </p>
          )}
          {shown.map((sec) => (
            <SettingsSection key={sec.key} id={sec.key} title={sec.title}>
              {sec.links.map((l) => (
                <ListRow
                  key={l.key}
                  to={l.to}
                  icon={ICON[l.key] ?? BarChart3}
                  label={l.label}
                  hint={l.hint}
                  badge={
                    l.key === "whatsNew" && unseen ? (
                      <span
                        data-testid="more-new"
                        className="shrink-0 text-xs font-black px-2 py-0.5 rounded-full bg-gold/20 text-gold"
                      >
                        {t("whatsNew.new")}
                      </span>
                    ) : (
                      <CountBadge
                        count={badgeFor(l.key, badges)}
                        tone={l.key === "atRisk" ? "danger" : "primary"}
                      />
                    )
                  }
                />
              ))}
              {sec.key === "app" && !query && lockOn && (
                <Suspense fallback={null}>
                  <MoreLockNowRow />
                </Suspense>
              )}
              {sec.key === "support" && !query && (
                <>
                  <ActionRow
                    icon={Share2}
                    label={t("support.share")}
                    hint={t("support.shareHint")}
                    onClick={() => void share()}
                  />
                  {canRateApp() && (
                    <ActionRow
                      icon={Star}
                      label={t("support.rate")}
                      hint={t("support.rateHint")}
                      onClick={rateApp}
                    />
                  )}
                </>
              )}
            </SettingsSection>
          ))}
          {!guest && !query && (
            <ul className="glass rounded-3xl overflow-hidden">
              <ActionRow
                icon={LogOut}
                tone="danger"
                label={t("more.logout")}
                busy={signingOut}
                onClick={() => setConfirmOut(true)}
              />
            </ul>
          )}
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
        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
