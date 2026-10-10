import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, QrCode } from "lucide-react";
import { myHalaqaSchedule, slotsForDay, type MyScheduleSlot } from "@/lib/center";
import { useT } from "@/lib/i18n";
import { usePrefetchRegister } from "@/hooks/use-prefetch-register";

/*
 * نُقلت من CenterManagement.tsx (فحص الأقسام P2) لتحمل إجراءات الحلقة الجارية للمعلّم:
 * «سجل الحلقة» و«رمز الحضور» مفتوحين على الحلقة نفسها (?halaqa=).
 */
/** مواعيد اليوم من جدول الحلقات. لا يظهر شيء إن لم تكن هناك مواعيد. */
export function TodaySlotsCard({
  role,
  title,
}: {
  role?: MyScheduleSlot["as_role"];
  title?: string;
}) {
  const t = useT();
  const [slots, setSlots] = useState<MyScheduleSlot[]>([]);
  useEffect(() => {
    myHalaqaSchedule()
      .then((all) =>
        setSlots(slotsForDay(role ? all.filter((s) => s.as_role === role) : all, new Date())),
      )
      .catch(() => setSlots([]));
  }, [role]);
  const teaching = slots.filter((s) => s.as_role === "teacher").map((s) => s.halaqa_id);
  usePrefetchRegister([...new Set(teaching)], teaching.length > 0);
  if (slots.length === 0) return null;
  return (
    <div className="glass-strong rounded-3xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground">{title ?? t("slots.title")}</p>
      </div>
      <div className="space-y-1.5">
        {slots.map((s) => (
          <div key={`${s.slot_id}-${s.child_name ?? ""}`} className="glass rounded-2xl px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs font-bold text-foreground truncate">{s.halaqa_name}</p>
              <span className="text-[0.6875rem] text-primary font-medium" dir="ltr">
                {s.start_time}–{s.end_time}
              </span>
            </div>
            <p className="text-[0.625rem] text-muted-foreground">
              {[
                s.as_role === "guardian" && s.child_name
                  ? t("slots.child", { name: s.child_name })
                  : null,
                s.as_role !== "teacher" && s.teacher_name
                  ? t("slots.teacher", { name: s.teacher_name })
                  : null,
                s.location,
                s.center_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {s.as_role === "teacher" && (
              <div className="flex gap-1.5 mt-1.5">
                <Link
                  to="/teacher/register"
                  search={{ halaqa: s.halaqa_id }}
                  className="min-h-9 px-3 rounded-xl bg-primary/15 text-primary text-[0.6875rem] font-bold inline-flex items-center gap-1"
                >
                  <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                  {t("slots.register")}
                </Link>
                <Link
                  to="/teacher/attendance-code"
                  search={{ halaqa: s.halaqa_id }}
                  className="min-h-9 px-3 rounded-xl glass text-primary text-[0.6875rem] font-bold inline-flex items-center gap-1"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  {t("slots.code")}
                </Link>
              </div>
            )}
            {s.online_url && (
              <a
                href={s.online_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[0.625rem] text-primary underline"
              >
                {t("slots.online")}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
