import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { TodaySlotsCard } from "@/components/zen/TodaySlotsCard";
import { PendingCertificatesCard } from "@/components/zen/Achievements";
import { QueryError } from "@/components/zen/QueryError";
import { PageHeader } from "@/components/zen/common/PageHeader";
import { CountBadge } from "@/components/zen/common/CountBadge";
import { useSession } from "@/hooks/useSession";
import { isTeacher as isTeacherCheck, listHalaqat, listMyStudents } from "@/lib/zen-api";
import { listPendingRecitations } from "@/lib/zen-lms";
import { TeacherExamReport } from "@/components/zen/TeacherExamReport";
import { ReviewTab } from "@/components/zen/teacher/ReviewTab";
import { AssignTab } from "@/components/zen/teacher/TeacherTabs";
import { StudentsTab } from "@/components/zen/teacher/StudentsTab";
import {
  defaultTeacherTab,
  parseTeacherTab,
  TEACHER_TABS,
  type TeacherTab,
} from "@/lib/teacher-board";
import { useT, t as tStatic } from "@/lib/i18n";

import { usePrefetchRegister } from "@/hooks/use-prefetch-register";
export const Route = createFileRoute("/_authed/teacher")({
  head: () => ({
    meta: [
      { title: tStatic("meta.teacher") },
      {
        name: "description",
        content: tStatic("meta.teacherDesc"),
      },
      { property: "og:title", content: tStatic("meta.teacher") },
      { property: "og:type", content: "website" },
    ],
  }),
  // التبويب في الرابط (فحص الأقسام P1): الرجوع والإشعارات والروابط تفتح التبويب الصحيح.
  validateSearch: (s: Record<string, unknown>): { tab?: TeacherTab; student?: string } => ({
    tab: parseTeacherTab(s.tab),
    student: typeof s.student === "string" && s.student ? s.student : undefined,
  }),
  component: TeacherScreen,
});

function TeacherScreen() {
  const { userId } = useSession();
  const t = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/teacher" });
  const qc = useQueryClient();

  // React Query بدل useEffect يدوي: كان أي فشل شبكة يُبقي مؤشر التحميل يدور للأبد (فحص الأقسام T6).
  const role = useQuery({
    queryKey: ["is-teacher", userId],
    retry: 1,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: () => isTeacherCheck(userId!),
  });
  const allowed = role.data === true;
  // الطابور على دفعات من 50 مع «عرض المزيد» (فحص الأقسام P2) بدل قصّ صامت عند 50.
  const [pendingLimit, setPendingLimit] = useState(50);
  const boardKey = ["teacher-board", userId, pendingLimit] as const;
  const board = useQuery({
    queryKey: boardKey,
    retry: 1,
    enabled: allowed,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [students, h, pending] = await Promise.all([
        listMyStudents(),
        listHalaqat(),
        listPendingRecitations(pendingLimit),
      ]);
      // حلقاته هو فقط: لا يسجّل واجباً في حلقة غيره.
      return { students, halaqat: h.filter((x) => x.teacher_id === userId), pending };
    },
  });
  const students = board.data?.students ?? [];
  const halaqat = board.data?.halaqat ?? [];
  // السجل اليومي أكثر ما يُفتح من هنا: حزمته وورقة اليوم لحلقة واحدة تُحمَّلان مسبقاً (1.17.0).
  usePrefetchRegister(halaqat.length === 1 ? [halaqat[0].id] : [], allowed && halaqat.length > 0);
  const pending = board.data?.pending ?? [];
  const tab: TeacherTab = search.tab ?? defaultTeacherTab(pending.length);
  const setTab = (k: TeacherTab) => void navigate({ search: { tab: k }, replace: true });
  const morePending = pending.length >= pendingLimit;
  const loading = role.isPending || (allowed && board.isPending);
  const failed = role.isError || board.isError;
  const retry = () => void (role.isError ? role.refetch() : board.refetch());
  const removePending = (id: string) => {
    qc.setQueryData(boardKey, (d: typeof board.data) =>
      d ? { ...d, pending: d.pending.filter((x) => x.id !== id) } : d,
    );
    void qc.invalidateQueries({ queryKey: ["teacher-kpis", userId] });
  };
  const pendingByStudent: Record<string, number> = {};
  for (const p of pending)
    pendingByStudent[p.student_id] = (pendingByStudent[p.student_id] ?? 0) + 1;

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? t("students.someone");

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <PageHeader
          title={t("nav.teacher")}
          subtitle={allowed ? t("students.subtitle", { n: students.length }) : undefined}
          actions={
            allowed && halaqat.length > 0 ? (
              <Link
                to="/teacher/register"
                search={halaqat.length === 1 ? { halaqa: halaqat[0].id } : undefined}
                className="min-h-10 px-3 rounded-xl glass text-primary text-[0.6875rem] font-bold flex items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4" aria-hidden="true" />
                {t("students.register")}
              </Link>
            ) : undefined
          }
        />

        {failed ? (
          <div className="flex-1 pt-8">
            <QueryError onRetry={retry} />
          </div>
        ) : loading ? (
          <div className="flex-1 flex justify-center pt-16">
            <Loader2
              className="w-5 h-5 animate-spin text-primary"
              aria-label={t("common.loading")}
            />
          </div>
        ) : !allowed ? (
          <p className="flex-1 text-center text-xs text-muted-foreground pt-16">
            {t("students.teachersOnly")}
          </p>
        ) : (
          <>
            <div className="px-3 pb-2 flex gap-1.5" role="tablist" aria-label={t("nav.teacher")}>
              {TEACHER_TABS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`tab-${k}`}
                  aria-selected={tab === k}
                  aria-controls={`panel-${k}`}
                  onClick={() => setTab(k)}
                  className={`flex-1 min-w-0 rounded-2xl py-2 text-xs font-bold transition-all inline-flex items-center justify-center gap-1 ${
                    tab === k ? "bg-primary/15 text-primary" : "glass text-muted-foreground"
                  }`}
                >
                  <span className="truncate">{t(`students.tabs.${k}`)}</span>
                  {k === "review" && <CountBadge n={pending.length} />}
                </button>
              ))}
            </div>

            <div
              className="flex-1 overflow-y-auto px-3 pb-4 space-y-3"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === "students" && (
                <StudentsTab
                  userId={userId!}
                  students={students}
                  halaqat={halaqat}
                  pendingByStudent={pendingByStudent}
                />
              )}
              {tab === "review" && (
                <>
                  <TodaySlotsCard role="teacher" title={t("students.todaySlots")} />
                  <PendingCertificatesCard />
                  <ReviewTab
                    pending={pending}
                    nameOf={nameOf}
                    teacherId={userId!}
                    onDone={removePending}
                  />
                  {morePending && (
                    <button
                      type="button"
                      onClick={() => setPendingLimit((n) => n + 50)}
                      disabled={board.isFetching}
                      className="w-full min-h-11 rounded-2xl glass text-primary text-xs font-bold disabled:opacity-50"
                    >
                      {board.isFetching ? t("common.loading") : t("students.morePending")}
                    </button>
                  )}
                </>
              )}
              {tab === "assign" && (
                <AssignTab
                  students={students}
                  halaqat={halaqat}
                  teacherId={userId!}
                  initialStudent={search.student}
                />
              )}
              {tab === "exams" && <TeacherExamReport students={students} />}
            </div>
          </>
        )}

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
