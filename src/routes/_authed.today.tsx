import { useT, t as tStatic } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KhatmForecastCard } from "@/components/zen/KhatmForecastCard";
import { TodayQueueCard } from "@/components/zen/TodayQueueCard";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { TodaySlotsCard } from "@/components/zen/TodaySlotsCard";
import { TodayStreakCard } from "@/components/zen/Achievements";
import { Recorder, type RecorderResult } from "@/components/zen/Recorder";
import { MuhasabaEntryCard } from "@/components/muhasaba/EntryCard";
import { PrayerTimesCard } from "@/components/zen/PrayerTimesCard";
import { GuardianHome, KindChoiceCard, TeacherHome } from "@/components/zen/RoleHomes";
import { localDayKey } from "@/lib/local-day";
import { ActiveChallengeCard } from "@/components/zen/home/OnboardingCards";
import { GuestHome } from "@/components/zen/GuestHome";
import { QueryError } from "@/components/zen/QueryError";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { countUnreadNotifications } from "@/lib/notification-count";
import { capCount, formatAyahRange, formatDay, nearestReview } from "@/lib/format";
import { useHomeContext } from "@/hooks/useHomeContext";
import { needsKindChoice } from "@/lib/home";
import {
  BookMarked,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  Bell,
  Mic,
  HeartHandshake,
  Sparkles,
  ClipboardCheck,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { listMyChildren } from "@/lib/guardian";
import {
  createRecitationSession,
  KIND_LABEL,
  listAssessmentsForStudent,
  listMyAssignments,
  listMyRecitations,
  RECITATION_STATUS_LABEL,
  uploadRecitationAudio,
  type Assignment,
  type RecitationAssessment,
} from "@/lib/zen-lms";

import { MustChangePasswordBanner } from "@/components/zen/LoginSecurity";
export const Route = createFileRoute("/_authed/today")({
  head: () => ({
    meta: [
      { title: tStatic("meta.today") },
      {
        name: "description",
        content: tStatic("meta.todayDesc"),
      },
      { property: "og:title", content: tStatic("meta.today") },
      {
        property: "og:description",
        content: tStatic("meta.todayOg"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TodayScreen,
});

function TodayScreen() {
  const { guest } = useSession();
  return guest ? <GuestHome /> : <SignedInToday />;
}

function SignedInToday() {
  const t = useT();
  const { userId } = useSession();
  const queryClient = useQueryClient();

  const [active, setActive] = useState<Assignment | null>(null);
  const [rec, setRec] = useState<RecorderResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { on } = useFeatureFlags();

  // البيانات عبر React Query: تخزين مؤقت وإعادة تحقّق بدل جلب كامل في كل تحميل
  // للشاشة. قبل ذلك كان كل دخول للصفحة يُطلق أربعة طلبات متوازية بلا أي تخزين،
  // وكل إرسال تسميع يُعيد جلب الأربعة كلها.
  const home = useHomeContext();
  const enabled = !!userId;
  const studentMode = home.mode === "student";
  const dashboard = useQuery({
    queryKey: ["today", userId],
    enabled: enabled && studentMode,
    staleTime: 30_000,
    queryFn: async () => {
      const uid = userId!;
      const [assignments, sessions, assessments] = await Promise.all([
        listMyAssignments(uid),
        listMyRecitations(uid, 20),
        listAssessmentsForStudent(uid, 20),
      ]);
      return { assignments, sessions, assessments };
    },
  });

  // شارة الإشعارات لكل الأدوار: العدد من الخادم لا من آخر 50 محمَّلة (فحص الأقسام H3).
  const unreadQuery = useQuery({
    queryKey: ["unread-notifications", userId],
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => countUnreadNotifications(userId!),
  });

  // ولي الأمر: بطاقة مختصرة لأبنائه المرتبطين.
  const childrenQuery = useQuery({
    queryKey: ["guardian-children", userId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: listMyChildren,
  });
  const guardianChildren = childrenQuery.data ?? [];

  const loading = dashboard.isPending;
  const assignments = dashboard.data?.assignments ?? [];
  const sessions = dashboard.data?.sessions ?? [];
  const assessments: RecitationAssessment[] = dashboard.data?.assessments ?? [];
  const unread = unreadQuery.data ?? 0;

  const submit = async () => {
    if (!userId || !active || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      let path: string | null = null;
      if (rec) path = await uploadRecitationAudio(userId, rec.blob);
      await createRecitationSession({
        student_id: userId,
        assignment_id: active.id,
        halaqa_id: active.halaqa_id,
        surah_name: active.surah_name,
        from_ayah: active.from_ayah,
        to_ayah: active.to_ayah,
        kind: active.kind,
        audio_path: path,
        duration_seconds: rec?.seconds ?? 0,
      });
      setMsg({ ok: true, text: t("todayPage.sent") });
      setActive(null);
      setRec(null);
      await queryClient.invalidateQueries({ queryKey: ["today", userId] });
      await queryClient.invalidateQueries({ queryKey: ["today-queue", userId] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("todayPage.sendFailed") });
    } finally {
      setSaving(false);
    }
  };

  const pending = assignments.filter((a) => a.status === "pending" || a.status === "redo");
  const nextReview = nearestReview(assessments.map((a) => a.next_review_date));

  if (!studentMode) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col">
          {home.mode === "guardian" ? (
            <GuardianHome unread={unread} />
          ) : (
            <TeacherHome ctx={home.ctx} unread={unread} userId={userId} />
          )}
          <BottomNav />
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("todayPage.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("todayPage.subtitle")}</p>
          </div>
          <Link
            to="/notifications"
            aria-label={unread > 0 ? t("homes.notifUnread", { n: unread }) : t("homes.notif")}
            className="relative w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <Bell className="w-4 h-4 text-foreground" aria-hidden="true" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-gold text-gold-foreground text-[0.625rem] font-black flex items-center justify-center"
              >
                {capCount(unread)}
              </span>
            )}
          </Link>
        </header>
        <MustChangePasswordBanner />

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {dashboard.isError ? (
            <QueryError onRetry={() => void dashboard.refetch()} />
          ) : loading ? (
            <div className="flex justify-center py-12">
              <Loader2
                className="w-5 h-5 animate-spin text-primary"
                role="status"
                aria-label={t("common.loading")}
              />
            </div>
          ) : (
            <>
              {home.ready && needsKindChoice(home.ctx) && (
                <KindChoiceCard onChosen={() => void home.refetch()} />
              )}

              {home.ctx.active_challenge && (
                <ActiveChallengeCard
                  c={home.ctx.active_challenge}
                  today={localDayKey(new Date())}
                />
              )}

              {userId && (
                <TodayQueueCard
                  userId={userId}
                  onAssignment={(id) => {
                    const a = assignments.find((x) => x.id === id);
                    if (a) setActive(a);
                  }}
                />
              )}

              <section className="space-y-2">
                <h2 className="text-xs font-bold text-muted-foreground px-2">
                  {t("todayPage.myAssignments")}
                </h2>
                {assignments.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">
                    {t("todayPage.noAssignments")}
                  </p>
                )}
                {openFirst(assignments).map((a) => (
                  <div key={a.id} className="glass rounded-3xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-primary" aria-hidden="true" />
                      <p className="flex-1 text-sm font-bold text-foreground">
                        {formatAyahRange(a.surah_name, a.from_ayah, a.to_ayah)}
                      </p>
                      <span className="text-[0.625rem] rounded-full px-2 py-0.5 glass-strong text-muted-foreground">
                        {KIND_LABEL[a.kind]}
                      </span>
                    </div>
                    {a.instructions && (
                      <p className="text-[0.6875rem] text-muted-foreground">{a.instructions}</p>
                    )}
                    <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                      {t("todayPage.due", { date: formatDay(a.due_date) })}
                      <span className="mr-auto flex items-center gap-1">
                        {a.status === "approved" ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{" "}
                            {t("todayPage.approved")}
                          </>
                        ) : a.status === "submitted" ? (
                          t("todayPage.awaiting")
                        ) : a.status === "redo" ? (
                          t("todayPage.redo")
                        ) : (
                          t("todayPage.required")
                        )}
                      </span>
                    </div>
                    {(a.status === "pending" || a.status === "redo") && (
                      <button
                        onClick={() => {
                          setActive(active?.id === a.id ? null : a);
                          setRec(null);
                          setMsg(null);
                        }}
                        className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-semibold"
                      >
                        {active?.id === a.id ? t("todayPage.closeRec") : t("todayPage.openRec")}
                      </button>
                    )}
                    {active?.id === a.id && (
                      <div className="space-y-2">
                        <Recorder onReady={setRec} disabled={saving} />
                        <button
                          onClick={submit}
                          disabled={saving}
                          className="w-full rounded-2xl bg-gold text-gold-foreground py-2.5 text-xs font-bold disabled:opacity-50"
                        >
                          {saving
                            ? t("todayPage.sending")
                            : rec
                              ? t("todayPage.sendAudio")
                              : t("todayPage.sendLive")}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {msg && (
                  <p
                    role={msg.ok ? "status" : "alert"}
                    className={`text-center text-[0.6875rem] ${msg.ok ? "text-primary" : "text-destructive"}`}
                  >
                    {msg.text}
                  </p>
                )}
              </section>

              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("todayPage.openCount")} value={String(pending.length)} />
                <Stat
                  label={t("todayPage.awaitingReview")}
                  value={String(sessions.filter((s) => s.status === "awaiting_teacher").length)}
                />
                <Stat label={t("todayPage.nextReview")} value={formatDay(nextReview)} />
              </div>

              <TodaySlotsCard title={t("todayPage.mySlot")} />
              {home.ready && home.ctx.halaqas_joined > 0 && (
                <Link to="/check-in" className="glass rounded-3xl p-3 flex items-center gap-3">
                  <ScanLine className="w-5 h-5 text-primary" aria-hidden="true" />
                  <span className="flex-1 text-sm font-bold">{t("todayPage.checkIn")}</span>
                </Link>
              )}
              {userId && <TodayStreakCard userId={userId} />}
              {userId && <KhatmForecastCard studentId={userId} />}

              <nav aria-label={t("todayPage.shortcuts")} className="grid grid-cols-3 gap-2">
                <Shortcut to="/exams" icon={ClipboardCheck} label={t("todayPage.exams")} />
                {on("recite") && <Shortcut to="/recite" icon={Mic} label={t("todayPage.recite")} />}
                {on("stories") && (
                  <Shortcut to="/stories" icon={Sparkles} label={t("todayPage.stories")} />
                )}
              </nav>

              {guardianChildren.length > 0 && (
                <Link to="/family" className="glass rounded-3xl p-4 flex items-center gap-3">
                  <HeartHandshake className="w-5 h-5 text-gold" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">{t("homes.followChildren")}</p>
                    <p className="text-[0.6875rem] text-muted-foreground">
                      {guardianChildren.map((c) => c.name).join(t("homes.listSep"))} —{" "}
                      {t("homes.followHint")}
                    </p>
                  </div>
                </Link>
              )}

              <PrayerTimesCard />
              <MuhasabaEntryCard userId={userId} />

              <section className="space-y-2">
                <h2 className="text-xs font-bold text-muted-foreground px-2">
                  {t("todayPage.recent")}
                </h2>
                {sessions.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    {t("todayPage.noRecent")}
                  </p>
                )}
                {sessions.map((s) => {
                  const assess = assessments.find((x) => x.session_id === s.id);
                  return (
                    <div key={s.id} className="glass rounded-2xl p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <CalendarCheck className="w-4 h-4 text-primary" aria-hidden="true" />
                        <p className="flex-1 text-xs font-bold text-foreground">
                          {formatAyahRange(s.surah_name, s.from_ayah, s.to_ayah)}
                        </p>
                        <span className="text-[0.625rem] text-muted-foreground">
                          {RECITATION_STATUS_LABEL[s.status]}
                        </span>
                      </div>
                      {assess && (
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {t("todayPage.gradeLine", {
                            score: assess.score ?? "—",
                            date: formatDay(assess.next_review_date),
                          })}
                          {assess.teacher_notes ? ` · ${assess.teacher_notes}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}

/** المفتوح (مطلوب أو يحتاج إعادة) أولاً، ثم ما ينتظر المعلّم، ثم المعتمد؛ الترتيب الأصلي داخل كل فئة. */
function openFirst<T extends { status: string }>(list: T[]): T[] {
  const rank = (s: string) => (s === "pending" || s === "redo" ? 0 : s === "submitted" ? 1 : 2);
  return [...list].sort((a, b) => rank(a.status) - rank(b.status));
}

/** اختصار مضغوط بدل بطاقة إعلانية كاملة لكل ميزة (فحص الأقسام H2). */
function Shortcut({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="glass rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center">
      <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
      <span className="text-[0.6875rem] font-bold text-foreground leading-tight">{label}</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="text-sm font-black text-primary">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
