import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { FeeStatementCard } from "@/components/zen/fees/FeeStatementCard";
import { useSession } from "@/hooks/useSession";
import { getMyFeeCenters } from "@/lib/fees";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";

/** كشف الرسوم (1.21.0، 5.1): /fees — للطالب نفسه ولكل ابن مربوط، في كل مركز فعّل دفتر الرسوم. */
export const Route = createFileRoute("/_authed/fees")({
  head: () => ({ meta: [{ title: tStatic("meta.fees") }] }),
  component: FeesPage,
});

function FeesPage() {
  usePagesDict();
  const t = useT();
  const { userId } = useSession();
  const q = useQuery({
    queryKey: ["my-fee-centers", userId],
    enabled: !!userId,
    queryFn: getMyFeeCenters,
  });
  const students = q.data
    ? q.data.filter((c, i, a) => a.findIndex((x) => x.student_id === c.student_id) === i)
    : [];
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("fees.page.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("fees.page.sub")}</p>
          </div>
          <Wallet className="w-5 h-5 text-primary" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {q.isPending ? (
            <div className="py-10 flex justify-center" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : q.isError ? (
            <p role="alert" className="text-xs text-destructive text-center">
              {q.error.message}
            </p>
          ) : students.length === 0 ? (
            <p className="glass rounded-3xl p-6 text-center text-xs text-muted-foreground">
              {t("fees.page.empty")}
            </p>
          ) : (
            students.map((s) => (
              <div key={s.student_id} className="space-y-2">
                {!s.self && (
                  <h2 className="px-2 text-xs font-bold text-muted-foreground">{s.student_name}</h2>
                )}
                {userId && <FeeStatementCard studentId={s.student_id} userId={userId} />}
              </div>
            ))
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
