import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, MoreVertical, Search, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { fetchAtRisk } from "@/lib/at-risk";
import { colorFor, getVisiblePhones, initialOf, type Halaqa, type Profile } from "@/lib/zen-api";
import { fetchStudentHalaqat, filterStudents } from "@/lib/teacher-board";
import { useT } from "@/lib/i18n";
import { StudentManageSheet } from "./StudentManageSheet";

/**
 * تبويب «الطلاب» في «طلابي» (فحص الأقسام P1): يحلّ محل صفحة /quran/students المكرّرة.
 * بحث بالاسم وفلتر بالحلقة، وشارتا «ينتظر تقييماً» و«يحتاج متابعة» من بيانات الخادم.
 */
export function StudentsTab({
  userId,
  students,
  halaqat,
  pendingByStudent,
}: {
  userId: string;
  students: Profile[];
  halaqat: Halaqa[];
  pendingByStudent: Record<string, number>;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [halaqa, setHalaqa] = useState<string | null>(null);
  const [managing, setManaging] = useState<Profile | null>(null);
  const ids = halaqat.map((h) => h.id);
  const extra = useQuery({
    queryKey: ["teacher-students-extra", userId, ids.join(",")],
    retry: 1,
    staleTime: 60_000,
    queryFn: async () => {
      const [membership, phones] = await Promise.all([
        fetchStudentHalaqat(ids),
        getVisiblePhones(students.map((s) => s.id)),
      ]);
      return { membership, phones };
    },
  });
  // نفس مفتاح بطاقة الإنذار في الرئيسية: نداء واحد يخدم الشاشتين.
  const risk = useQuery({
    queryKey: ["at-risk", userId],
    staleTime: 10 * 60_000,
    queryFn: () => fetchAtRisk(null),
  });
  const atRisk = useMemo(() => new Set((risk.data ?? []).map((r) => r.student_id)), [risk.data]);
  const membership = extra.data?.membership ?? {};
  const phones = extra.data?.phones ?? {};
  const shown = filterStudents(students, { q, halaqa, membership });
  const halaqaName = (id: string) => halaqat.find((h) => h.id === id)?.name ?? "";

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t("students.emptyTitle")}
        hint={t("students.emptyHint")}
        action={
          <Link
            to="/teacher/import"
            className="mt-1 min-h-11 px-4 rounded-full bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" /> {t("students.add")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <label className="glass rounded-2xl flex items-center gap-2 px-3">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("students.search")}
          aria-label={t("students.search")}
          className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none"
        />
      </label>
      {halaqat.length > 1 && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label={t("students.byHalaqa")}
        >
          {[{ id: null as string | null, name: t("students.allHalaqat") }, ...halaqat].map((h) => (
            <button
              key={h.id ?? "all"}
              type="button"
              aria-pressed={halaqa === h.id}
              onClick={() => setHalaqa(h.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold ${
                halaqa === h.id ? "bg-primary/15 text-primary" : "glass text-muted-foreground"
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
      {extra.isError && <QueryError compact onRetry={() => void extra.refetch()} />}
      <p className="text-[0.6875rem] text-muted-foreground px-1" aria-live="polite">
        {t("students.count", { n: shown.length })}
      </p>
      {shown.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">{t("students.noMatch")}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => {
            const waiting = pendingByStudent[s.id] ?? 0;
            const groups = (membership[s.id] ?? []).map(halaqaName).filter(Boolean).join("، ");
            return (
              <li key={s.id} className="glass rounded-2xl flex items-center">
                <Link
                  to="/quran/student/$userId"
                  params={{ userId: s.id }}
                  className="flex-1 min-w-0 p-3 flex items-center gap-3"
                >
                  <span
                    aria-hidden="true"
                    className={`w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br ${colorFor(s.id)} flex items-center justify-center text-white font-black`}
                  >
                    {initialOf(s.name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-foreground truncate">
                      {s.name}
                    </span>
                    <span className="block text-[0.625rem] text-muted-foreground truncate">
                      {groups || <span dir="ltr">{phones[s.id] ?? ""}</span>}
                    </span>
                    {(waiting > 0 || atRisk.has(s.id)) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {waiting > 0 && (
                          <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[0.625rem] font-bold">
                            {t("students.waiting", { n: waiting })}
                          </span>
                        )}
                        {atRisk.has(s.id) && (
                          <span className="rounded-full bg-gold/15 text-gold px-2 py-0.5 text-[0.625rem] font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            {t("students.atRisk")}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <ChevronLeft
                    className="w-4 h-4 text-muted-foreground ltr:rotate-180"
                    aria-hidden="true"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setManaging(s)}
                  aria-label={t("studentManage.open", { name: s.name })}
                  aria-haspopup="dialog"
                  className="min-h-11 min-w-11 me-1 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary"
                >
                  <MoreVertical className="w-5 h-5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <StudentManageSheet me={userId} student={managing} onClose={() => setManaging(null)} />
    </div>
  );
}
