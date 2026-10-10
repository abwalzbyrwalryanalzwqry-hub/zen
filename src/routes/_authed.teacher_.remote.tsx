import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, Loader2, Plus, X } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { AssignSheet, ReviewSheet } from "@/components/zen/remote/RemoteSheets";
import { useSession } from "@/hooks/useSession";
import { formatDay } from "@/lib/format";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import {
  cancelRemote,
  formatDuration,
  teacherRemoteQueue,
  type RemoteItem,
} from "@/lib/remote-recitation";
import { toast } from "@/lib/toast";

/**
 * التسميع عن بُعد للمعلّم (1.21.0، 5.3): /teacher/remote — تكليف مقطع لطلاب حلقة، وطابور التسجيلات
 * المرسلة، والمراجعة على شبكة الآيات (لمسة تدور: حفظ ← تجويد ← تشكيل ← وقف ← بلا خطأ) فتدخل سجل اليوم.
 */
export const Route = createFileRoute("/_authed/teacher_/remote")({
  head: () => ({ meta: [{ title: tStatic("meta.remote") }] }),
  component: RemoteTeacherPage,
});

function RemoteTeacherPage() {
  usePagesDict();
  const t = useT();
  const { userId } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["remote-queue", userId],
    enabled: !!userId,
    queryFn: teacherRemoteQueue,
  });
  const [assign, setAssign] = useState(false);
  const [review, setReview] = useState<RemoteItem | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["remote-queue"] });
  const groups = useMemo(() => {
    const d = q.data ?? [];
    return {
      submitted: d.filter((r) => r.status === "submitted"),
      assigned: d.filter((r) => r.status === "assigned"),
      reviewed: d.filter((r) => r.status === "reviewed"),
    };
  }, [q.data]);
  const cancel = async (id: string) => {
    try {
      await cancelRemote(id);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("remote.err.save"));
    }
  };
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("remote.teacher.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("remote.teacher.sub")}</p>
          </div>
          <Headphones className="w-5 h-5 text-primary" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          <button
            type="button"
            onClick={() => setAssign(true)}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t("remote.teacher.assign")}
          </button>
          {q.isPending ? (
            <div className="py-10 flex justify-center" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : q.isError ? (
            <p role="alert" className="text-xs text-destructive text-center">
              {q.error.message}
            </p>
          ) : q.data.length === 0 ? (
            <p className="glass rounded-3xl p-6 text-center text-xs text-muted-foreground">
              {t("remote.teacher.empty")}
            </p>
          ) : (
            (["submitted", "assigned", "reviewed"] as const).map(
              (k) =>
                groups[k].length > 0 && (
                  <section
                    key={k}
                    className="glass rounded-3xl p-4 space-y-2"
                    aria-label={t(`remote.teacher.group.${k}`)}
                  >
                    <h2 className="text-sm font-bold">
                      {t(`remote.teacher.group.${k}`)} ({groups[k].length})
                    </h2>
                    <ul className="divide-y divide-border/50">
                      {groups[k].map((r) => (
                        <li
                          key={r.id}
                          className="py-2 flex items-center gap-2"
                          data-testid={`remote-${k}`}
                        >
                          <button
                            type="button"
                            disabled={k !== "submitted"}
                            onClick={() => setReview(r)}
                            className="flex-1 min-w-0 text-start min-h-11"
                          >
                            <span className="block text-sm font-bold truncate">
                              {r.student_name}
                            </span>
                            <span className="block text-[0.6875rem] text-muted-foreground truncate">
                              {t("remote.passage", {
                                surah: r.surah_name,
                                from: r.from_ayah,
                                to: r.to_ayah,
                              })}
                              {" · "}
                              {k === "submitted"
                                ? formatDuration(r.duration_seconds)
                                : k === "reviewed"
                                  ? t("remote.grade", { n: r.grade ?? 0 })
                                  : r.due_date
                                    ? t("remote.due", { d: formatDay(r.due_date) })
                                    : r.halaqa_name}
                            </span>
                          </button>
                          {k === "submitted" && (
                            <button
                              type="button"
                              onClick={() => setReview(r)}
                              className="min-h-11 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
                            >
                              {t("remote.teacher.review")}
                            </button>
                          )}
                          {k === "assigned" && (
                            <button
                              type="button"
                              onClick={() => void cancel(r.id)}
                              aria-label={t("remote.teacher.cancel")}
                              className="w-11 h-11 rounded-xl glass flex items-center justify-center"
                            >
                              <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
            )
          )}
        </div>
      </div>
      {userId && (
        <AssignSheet open={assign} onOpenChange={setAssign} userId={userId} onDone={refresh} />
      )}
      <ReviewSheet item={review} onClose={() => setReview(null)} onDone={refresh} />
    </PhoneFrame>
  );
}
