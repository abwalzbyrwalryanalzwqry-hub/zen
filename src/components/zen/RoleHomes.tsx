import { capCount } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useLatest } from "@/hooks/use-latest";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AtRiskCard } from "@/components/zen/AtRiskCard";
import { TeacherKpis } from "@/components/zen/teacher/TeacherKpis";
import {
  Bell,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Users,
  Building2,
} from "lucide-react";
import { TodaySlotsCard } from "@/components/zen/TodaySlotsCard";
import { MuhasabaEntryCard } from "@/components/muhasaba/EntryCard";
import { attendanceRate, getChildOverview, listMyChildren, RELATION_LABEL } from "@/lib/guardian";
import { TeacherActivation } from "@/components/zen/TeacherActivation";
import { setAccountKind, type AccountKind, type HomeContext } from "@/lib/home";
import { clearOnboardRole, onboardRole } from "@/lib/onboarding";
import { useSimpleMode } from "@/lib/simple-mode";
import { FirstDayCard } from "@/components/zen/home/OnboardingCards";

function HomeHeader({
  title,
  subtitle,
  unread,
}: {
  title: string;
  subtitle: string;
  unread: number;
}) {
  const t = useT();
  return (
    <header className="px-5 pt-12 pb-3 flex items-center gap-3">
      <div className="flex-1">
        <h1 className="text-xl font-black text-foreground">{title}</h1>
        <p className="text-[0.6875rem] text-muted-foreground">{subtitle}</p>
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
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  hint,
}: {
  to: string;
  icon: typeof Bell;
  title: string;
  hint: string;
}) {
  return (
    <Link to={to} className="glass rounded-3xl p-4 flex items-center gap-3">
      <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block text-[0.6875rem] text-muted-foreground">{hint}</span>
      </span>
      <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** يُسأل صاحب الحساب الجديد مرة واحدة: طالب، أم ولي أمر، أم معلّم؟ */
export function KindChoiceCard({ onChosen }: { onChosen: () => void }) {
  const t = useT();
  // الدور المختار في الترحيب (3.11): المعلّم يرى التفعيل مفتوحاً، والطالب وولي الأمر يُطبَّق دورهما تلقائياً
  // (والأزرار معطّلة حتى يُحفظ).
  const [autoKind] = useState(() => {
    const r = onboardRole();
    return r === "student" || r === "guardian" ? r : null;
  });
  const [busy, setBusy] = useState(autoKind !== null);
  const [teacherOpen, setTeacherOpen] = useState(() => onboardRole() === "teacher");
  const onChosenRef = useLatest(onChosen);
  const navigate = useNavigate();
  const pick = async (k: AccountKind) => {
    setBusy(true);
    try {
      await setAccountKind(k);
      clearOnboardRole();
      onChosen();
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!autoKind) return;
    setAccountKind(autoKind)
      .then(() => {
        clearOnboardRole();
        onChosenRef.current();
      })
      .finally(() => setBusy(false));
  }, [autoKind, onChosenRef]);
  const option =
    "rounded-2xl p-3 text-right disabled:opacity-60 min-h-[4.5rem] flex flex-col justify-center";
  return (
    <section aria-labelledby="zen-kind-title" className="glass-strong rounded-3xl p-4 space-y-3">
      <h2 id="zen-kind-title" className="text-sm font-black text-foreground">
        {t("homes.kindQ")}
      </h2>
      <div className="zen-choice-grid grid grid-cols-3 gap-2">
        <button
          disabled={busy}
          onClick={() => void pick("student")}
          className={`${option} bg-primary text-primary-foreground`}
        >
          <span className="block text-sm font-bold">{t("homes.iStudent")}</span>
          <span className="block text-[0.6875rem] opacity-90">{t("homes.iStudentHint")}</span>
        </button>
        <button
          disabled={busy}
          onClick={() => void pick("guardian")}
          className={`${option} glass text-foreground`}
        >
          <span className="block text-sm font-bold">{t("homes.iGuardian")}</span>
          <span className="block text-[0.6875rem] text-muted-foreground">
            {t("homes.iGuardianHint")}
          </span>
        </button>
        <button
          disabled={busy}
          onClick={() => setTeacherOpen((v) => !v)}
          aria-expanded={teacherOpen}
          aria-controls="zen-teacher-activation"
          className={`${option} glass text-foreground ${teacherOpen ? "ring-2 ring-primary" : ""}`}
        >
          <span className="flex items-center gap-1 text-sm font-bold">
            <GraduationCap className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            {t("homes.iTeacher")}
          </span>
          <span className="block text-[0.6875rem] text-muted-foreground">
            {t("homes.iTeacherHint")}
          </span>
        </button>
      </div>
      {teacherOpen && (
        <div id="zen-teacher-activation" className="glass rounded-2xl p-3">
          <TeacherActivation
            onActivated={(kind) => {
              // المؤسس يبدأ بإنشاء مركزه الأول؛ المعلّم المدعو تظهر له لوحة المعلم.
              if (kind === "founder") void navigate({ to: "/centers" });
              else onChosen();
            }}
          />
        </div>
      )}
      <p className="text-[0.6875rem] text-muted-foreground">{t("homes.kindLater")}</p>
    </section>
  );
}

function ChildCard({ id, name, relation }: { id: string; name: string; relation: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["guardian-child", id],
    staleTime: 60_000,
    queryFn: () => getChildOverview(id),
  });
  const o = q.data;
  const rate = o ? attendanceRate(o.attendance_30d) : null;
  const open = o
    ? o.assignments.filter((a) => a.status === "pending" || a.status === "redo").length
    : 0;
  const last = o?.assessments[0];
  return (
    <Link to="/family" className="glass rounded-3xl p-4 block space-y-2">
      <div className="flex items-center gap-2">
        <HeartHandshake className="w-4 h-4 text-gold" aria-hidden="true" />
        <p className="flex-1 text-sm font-bold text-foreground">{name}</p>
        <span className="text-[0.625rem] text-muted-foreground">{relation}</span>
      </div>
      {q.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin text-primary" aria-label={t("common.loading")} />
      ) : o ? (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="glass rounded-2xl p-2">
            <dt className="text-[0.625rem] text-muted-foreground">{t("homes.att30")}</dt>
            <dd className="text-sm font-black text-primary">{rate == null ? "—" : `${rate}%`}</dd>
          </div>
          <div className="glass rounded-2xl p-2">
            <dt className="text-[0.625rem] text-muted-foreground">{t("todayPage.openCount")}</dt>
            <dd className="text-sm font-black text-primary">{open}</dd>
          </div>
          <div className="glass rounded-2xl p-2">
            <dt className="text-[0.625rem] text-muted-foreground">{t("homes.lastGrade")}</dt>
            <dd className="text-sm font-black text-primary">{last?.score ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-[0.6875rem] text-muted-foreground">{t("homes.summaryFailed")}</p>
      )}
    </Link>
  );
}

/** الرئيسية لولي الأمر: أبناؤه ومواعيدهم فقط، بلا أدوات الطالب. */
export function GuardianHome({ unread }: { unread: number }) {
  const t = useT();
  const children = useQuery({
    queryKey: ["guardian-children"],
    staleTime: 5 * 60_000,
    queryFn: listMyChildren,
  });
  const list = children.data ?? [];
  return (
    <>
      <HomeHeader title={t("homes.home")} subtitle={t("homes.guardianSub")} unread={unread} />
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        <TodaySlotsCard role="guardian" title={t("homes.childrenSlots")} />
        {children.isPending ? (
          <div className="flex justify-center py-8">
            <Loader2
              className="w-5 h-5 animate-spin text-primary"
              aria-label={t("common.loading")}
            />
          </div>
        ) : list.length === 0 ? (
          <section className="glass rounded-3xl p-4 space-y-2">
            <p className="text-sm font-bold text-foreground">{t("homes.noChild")}</p>
            <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
              {t("homes.noChildHint")}
            </p>
            <Link
              to="/family"
              className="inline-block rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold"
            >
              {t("homes.enterCode")}
            </Link>
          </section>
        ) : (
          list.map((c) => (
            <ChildCard
              key={c.student_id}
              id={c.student_id}
              name={c.name}
              relation={RELATION_LABEL[c.relation]}
            />
          ))
        )}
        <ActionCard
          to="/chats"
          icon={Users}
          title={t("homes.msgTeachers")}
          hint={t("homes.msgTeachersHint")}
        />
      </div>
    </>
  );
}

/** الرئيسية للمعلّم: حلقاته اليوم واختصارات التعليم. */
export function TeacherHome({
  ctx,
  unread,
  userId,
}: {
  ctx: HomeContext;
  unread: number;
  userId: string | null;
}) {
  const t = useT();
  // الوضع المبسّط (1.19.0) يُخفي بطاقة الاختبارات؛ تبقى في «المزيد» عند إيقافه.
  const simple = useSimpleMode(ctx.center_simple_mode);
  return (
    <>
      <HomeHeader
        title={t("homes.home")}
        subtitle={
          ctx.halaqas_taught > 0
            ? t("homes.taught", { n: ctx.halaqas_taught })
            : t("homes.teacherBoard")
        }
        unread={unread}
      />
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        {ctx.halaqas_taught === 0 && (
          <Link
            to="/centers"
            className="block rounded-3xl gradient-primary text-primary-foreground p-4 glow-primary"
          >
            <span className="flex items-center gap-2 text-sm font-black">
              <Building2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              {t("homes.startCenter")}
            </span>
            <span className="block text-[0.6875rem] opacity-90 mt-1 leading-relaxed">
              {t("homes.startCenterHint")}
            </span>
          </Link>
        )}
        {ctx.setup && <FirstDayCard ctx={ctx} />}
        {ctx.halaqas_taught > 0 && <TeacherKpis userId={userId} />}
        <TodaySlotsCard role="teacher" title={t("homes.mySlots")} />
        {ctx.halaqas_taught > 0 && <AtRiskCard userId={userId} />}
        {!simple && (
          <ActionCard
            to="/exams"
            icon={ClipboardCheck}
            title={t("homes.exams")}
            hint={t("homes.examsHint")}
          />
        )}
        {ctx.children > 0 && (
          <ActionCard
            to="/family"
            icon={HeartHandshake}
            title={t("homes.followChildren")}
            hint={t("homes.followHint")}
          />
        )}
        <MuhasabaEntryCard userId={userId} />
      </div>
    </>
  );
}
