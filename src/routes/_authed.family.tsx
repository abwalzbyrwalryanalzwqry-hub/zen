import { useConfirm } from "@/hooks/useConfirm";
import { StudentCertificates } from "@/components/zen/certificates/StudentCertificates";
import { useT, t as tStatic, intlLocale } from "@/lib/i18n";
import { TodayQueueCard } from "@/components/zen/TodayQueueCard";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  Link2,
  Loader2,
  MessageCircle,
  Mic,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { StudentReportExport, WeeklySummaryCard } from "@/components/zen/CenterManagement";
import { monthRange } from "@/lib/center";
import { FamilyGoals } from "@/components/zen/FamilyGoals";
import { FeeStatementCard } from "@/components/zen/fees/FeeStatementCard";
import { GuardianAiConsentCard } from "@/components/guardian/GuardianAiConsentCard";
import { AchievementsSummary } from "@/components/zen/Achievements";
import { getOrCreateDirectChat } from "@/lib/zen-api";
import { ATTENDANCE_LABEL, KIND_LABEL } from "@/lib/zen-lms";
import { MASTERY_LABEL } from "@/lib/exam/types";
import {
  attendanceRate,
  claimGuardianCode,
  getChildOverview,
  listMyChildren,
  RELATION_LABEL,
  removeGuardianLink,
  type ChildOverview,
  type GuardianChild,
} from "@/lib/guardian";
import { RoomConsents } from "@/components/zen/RoomConsents";
import { GuardianInviteApprovals } from "@/components/zen/GuardianInviteApprovals";
import { formatAyahRange, formatDay } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/family")({
  head: () => ({
    meta: [
      { title: tStatic("meta.family") },
      {
        name: "description",
        content: tStatic("meta.familyDesc"),
      },
    ],
  }),
  // من إشعار التقرير الشهري (11.2): ?child=<id>&month=YYYY-MM
  validateSearch: (s: Record<string, unknown>): { child?: string; month?: string } => ({
    child: typeof s.child === "string" ? s.child : undefined,
    month: typeof s.month === "string" ? s.month : undefined,
  }),
  component: FamilyScreen,
});

const ASSIGNMENT_STATUS_KEYS = {
  pending: "assign.status.pending",
  submitted: "assign.status.submitted",
  approved: "assign.status.approved",
  redo: "assign.status.redo",
} as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "long" });
}

function FamilyScreen() {
  usePagesDict();
  const t = useT();
  const [confirmDialog, ask] = useConfirm();
  const { userId } = useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const monthly = monthRange(search.month);
  const [children, setChildren] = useState<GuardianChild[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const overviewQ = useAsync(selected ? `child-overview:${selected}` : null, () =>
    getChildOverview(selected as string),
  );
  const overview: ChildOverview | null = overviewQ.data ?? null;
  const loading = overviewQ.loading;
  const [actionErr, setErr] = useState<string | null>(null);
  const err =
    actionErr ??
    (overviewQ.error
      ? overviewQ.error instanceof Error
        ? overviewQ.error.message
        : t("family.loadFailed")
      : null);

  const [code, setCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  // سلسلة وعود: setState بعد وصول القائمة، فيصحّ النداء من الأثر (M12).
  const loadChildren = (focus?: string) =>
    listMyChildren().then((list) => {
      setChildren(list);
      const fromLink =
        search.child && list.some((c) => c.student_id === search.child) ? search.child : undefined;
      setSelected(
        (cur) =>
          focus ??
          fromLink ??
          (cur && list.some((c) => c.student_id === cur) ? cur : (list[0]?.student_id ?? null)),
      );
    });

  useEffect(() => {
    void loadChildren();
    // التحميل عند الفتح فقط؛ ?child يُقرأ مرة واحدة من رابط الإشعار.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async () => {
    if (linking || code.trim().length < 6) return;
    setLinking(true);
    setLinkErr(null);
    setLinkMsg(null);
    try {
      const r = await claimGuardianCode(code);
      setCode("");
      setLinkMsg(t("family.linked", { name: r.name }));
      await loadChildren(r.studentId);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : t("family.badCode"));
    } finally {
      setLinking(false);
    }
  };

  const unlink = async (c: GuardianChild) => {
    if (!userId) return;
    const ok = await ask({
      title: t("family.unlinkConfirm", { name: c.name }),
      confirmLabel: t("guardianLink.unlink"),
    });
    if (!ok) return;
    try {
      await removeGuardianLink(userId, c.student_id);
      await loadChildren();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("guardianLink.unlinkFailed"));
    }
  };

  const messageTeacher = async (teacherId: string) => {
    if (!userId) return;
    try {
      const chatId = await getOrCreateDirectChat(userId, teacherId);
      navigate({ to: "/chats/$chatId", params: { chatId } });
    } catch {
      setErr(t("family.chatFailed"));
    }
  };

  const current = children?.find((c) => c.student_id === selected) ?? null;
  const rate = overview ? attendanceRate(overview.attendance_30d) : null;
  const scored = overview?.assessments.filter((a) => typeof a.score === "number") ?? [];
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length)
      : null;
  const teachers = overview
    ? overview.halaqat.filter(
        (h, i, arr) => h.teacher_id && arr.findIndex((x) => x.teacher_id === h.teacher_id) === i,
      )
    : [];

  return (
    <PhoneFrame>
      {confirmDialog}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("family.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("family.subtitle")}</p>
          </div>
          <HeartHandshake className="w-5 h-5 text-primary" />
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {children === null ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            children.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {children.map((c) => (
                  <button
                    key={c.student_id}
                    onClick={() => setSelected(c.student_id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs ${
                      c.student_id === selected
                        ? "bg-primary text-primary-foreground font-bold"
                        : "glass text-foreground"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )
          )}

          {selected && userId && <TodayQueueCard userId={userId} studentId={selected} />}
          {loading && (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          {err && (
            <p role="alert" className="text-xs text-destructive text-center">
              {err}
            </p>
          )}

          {overview && current && !loading && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("homes.att30")} value={rate === null ? "—" : `${rate}%`} />
                <Stat label={t("family.pages")} value={String(overview.mushaf.memorized_pages)} />
                <Stat label={t("family.avg")} value={avgScore === null ? "—" : `${avgScore}`} />
              </div>

              <WeeklySummaryCard studentId={current.student_id} />
              <FamilyGoals
                key={current.student_id}
                studentId={current.student_id}
                mode="guardian"
              />
              <AchievementsSummary studentId={current.student_id} />
              {userId && <FeeStatementCard studentId={current.student_id} userId={userId} />}
              <GuardianAiConsentCard studentId={current.student_id} />

              <Card icon={GraduationCap} title={t("family.halaqat")}>
                {overview.halaqat.length === 0 ? (
                  <Empty text={t("family.noHalaqa")} />
                ) : (
                  overview.halaqat.map((h) => (
                    <div key={h.id} className="rounded-2xl glass px-3 py-2">
                      <p className="text-xs font-bold text-foreground">{h.name}</p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {[
                          h.center_name,
                          h.teacher_name && t("slots.teacher", { name: h.teacher_name }),
                          h.schedule,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))
                )}
                {teachers.map((h) => (
                  <button
                    key={h.teacher_id}
                    onClick={() => void messageTeacher(h.teacher_id!)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl glass-strong py-2 text-xs text-primary"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />{" "}
                    {t("family.messageTeacher", { name: h.teacher_name ?? t("family.theTeacher") })}
                  </button>
                ))}
              </Card>

              <Card icon={Mic} title={t("family.grades")}>
                {overview.assessments.length === 0 ? (
                  <Empty text={t("family.noGrades")} />
                ) : (
                  overview.assessments.map((a) => (
                    <div key={a.id} className="rounded-2xl glass px-3 py-2 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground">
                          {formatAyahRange(a.surah_name, a.from_ayah, a.to_ayah)}
                        </p>
                        <span
                          className={`text-[0.625rem] rounded-full px-2 py-0.5 ${a.approved ? "bg-primary/15 text-primary" : "bg-gold/15 text-gold"}`}
                        >
                          {a.approved ? t("todayPage.approved") : t("review.redoShort")}
                          {typeof a.score === "number" ? ` · ${a.score}` : ""}
                        </span>
                      </div>
                      {a.teacher_notes && (
                        <p className="text-[0.6875rem] text-foreground/80 leading-5">
                          {a.teacher_notes}
                        </p>
                      )}
                      <p className="text-[0.625rem] text-muted-foreground">
                        {fmtDate(a.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </Card>

              <Card icon={ClipboardList} title={t("family.assignments")}>
                {overview.assignments.length === 0 ? (
                  <Empty text={t("family.noAssignments")} />
                ) : (
                  overview.assignments.map((a) => (
                    <div key={a.id} className="rounded-2xl glass px-3 py-2">
                      <p className="text-xs font-bold text-foreground">
                        {KIND_LABEL[a.kind]} ·{" "}
                        {formatAyahRange(a.surah_name, a.from_ayah, a.to_ayah)}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {t("family.due", { date: formatDay(a.due_date) })} ·{" "}
                        {t(ASSIGNMENT_STATUS_KEYS[a.status])}
                      </p>
                    </div>
                  ))
                )}
              </Card>

              <Card icon={BookOpen} title={t("family.exams")}>
                {overview.exams.length === 0 ? (
                  <Empty text={t("family.noExams")} />
                ) : (
                  overview.exams.map((e) => (
                    <div key={e.id} className="rounded-2xl glass px-3 py-2 flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-foreground">{e.title}</p>
                        <p className="text-[0.625rem] text-muted-foreground">
                          {fmtDate(e.created_at)}
                        </p>
                      </div>
                      <span className="text-[0.6875rem] text-primary font-bold">
                        {e.percentage}% · {MASTERY_LABEL[e.mastery]}
                      </span>
                    </div>
                  ))
                )}
              </Card>

              <Card icon={CalendarCheck} title={t("family.attendance")}>
                {overview.attendance.length === 0 ? (
                  <Empty text={t("family.noAttendance")} />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {overview.attendance.map((a) => (
                      <span
                        key={a.date}
                        title={a.reason ?? undefined}
                        className={`text-[0.625rem] rounded-full px-2.5 py-1 ${
                          a.status === "absent"
                            ? "bg-destructive/15 text-destructive"
                            : a.status === "present"
                              ? "bg-primary/15 text-primary"
                              : "glass text-muted-foreground"
                        }`}
                      >
                        {a.date.slice(5)} · {ATTENDANCE_LABEL[a.status]}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              <StudentCertificates
                studentId={current.student_id}
                title={t("myCertificates.child", { name: current.name })}
              />

              <StudentReportExport
                studentId={current.student_id}
                studentName={current.name}
                range={monthly && search.child === current.student_id ? monthly : null}
                title={
                  monthly && search.child === current.student_id
                    ? t("family.monthly", { month: search.month ?? "" })
                    : t("family.period")
                }
              />

              <button
                onClick={() => void unlink(current)}
                className="w-full text-[0.6875rem] text-muted-foreground underline decoration-dotted py-1"
              >
                {t("family.unlink", {
                  name: current.name,
                  relation: RELATION_LABEL[current.relation],
                })}
              </button>
            </>
          )}

          <GuardianInviteApprovals />
          <RoomConsents />

          <div className="glass rounded-3xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">
                {children && children.length > 0 ? t("family.linkAnother") : t("family.linkFirst")}
              </p>
            </div>
            <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
              {t("family.codeHint")}
            </p>
            <div className="flex gap-2">
              <label htmlFor="guardian-code" className="sr-only">
                {t("family.code")}
              </label>
              <input
                id="guardian-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && void link()}
                placeholder="XXXXX-XXXXX"
                dir="ltr"
                autoComplete="off"
                className="flex-1 glass-strong rounded-xl px-3 py-2 text-sm font-mono tracking-widest outline-none"
              />
              <button
                onClick={() => void link()}
                disabled={linking || code.trim().length < 6}
                className="rounded-xl bg-primary text-primary-foreground px-4 text-xs font-bold disabled:opacity-50"
              >
                {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : t("family.link")}
              </button>
            </div>
            {linkMsg && (
              <p role="status" className="text-[0.6875rem] text-primary">
                {linkMsg}
              </p>
            )}
            {linkErr && (
              <p role="alert" className="text-[0.6875rem] text-destructive">
                {linkErr}
              </p>
            )}
          </div>
        </div>
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="text-lg font-black text-primary">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Mic;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[0.6875rem] text-muted-foreground">{text}</p>;
}
