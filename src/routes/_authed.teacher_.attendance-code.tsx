import { useT, t as tStatic } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { useSession } from "@/hooks/useSession";
import { listHalaqat } from "@/lib/zen-api";
import { AttendanceCodePanel } from "@/components/zen/AttendanceCodePanel";

/** رمز الحضور (9.2): QR وأرقام تتجدّد كل 30 ثانية ما دامت الشاشة مفتوحة. */
export const Route = createFileRoute("/_authed/teacher_/attendance-code")({
  head: () => ({ meta: [{ title: tStatic("meta.attendanceCode") }] }),
  // ?halaqa= يفتح الحلقة الجارية مباشرة من بطاقة «حلقاتك اليوم» (فحص الأقسام P2).
  validateSearch: (s: Record<string, unknown>): { halaqa?: string } => ({
    halaqa: typeof s.halaqa === "string" && s.halaqa ? s.halaqa : undefined,
  }),
  component: AttendanceCodeScreen,
});

function AttendanceCodeScreen() {
  const t = useT();
  const { userId } = useSession();
  const halaqat = useQuery({
    queryKey: ["register-halaqat", userId],
    enabled: !!userId,
    queryFn: () => listHalaqat(),
  });
  const mine = useMemo(
    () => (halaqat.data ?? []).filter((h) => h.teacher_id === userId),
    [halaqat.data, userId],
  );
  const [halaqa, setHalaqa] = useState(Route.useSearch().halaqa ?? "");

  // أول حلقة للمعلّم افتراضياً حين لا يحدّدها الرابط (أثناء العرض، M12).
  if (!halaqa && mine[0]) setHalaqa(mine[0].id);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/teacher/register" />
          <h1 className="text-lg font-black flex-1">{t("attendanceCode.title")}</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <select
            aria-label={t("attendanceCode.halaqa")}
            value={halaqa}
            onChange={(e) => setHalaqa(e.target.value)}
            className="w-full min-h-11 rounded-2xl glass px-3 py-2 text-sm"
          >
            {mine.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          {halaqa && <AttendanceCodePanel key={halaqa} halaqa={halaqa} />}
        </div>
      </div>
    </PhoneFrame>
  );
}
