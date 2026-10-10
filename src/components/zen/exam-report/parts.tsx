// أجزاء صغيرة مشتركة في تقرير الاختبارات (M5: من TeacherExamReport.tsx).

import { type FamilyStat } from "@/lib/exam/report";
import { percentColor, barColor } from "./colors";

export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl glass-strong py-2">
      <p className={`text-base font-black ${className ?? "text-foreground"}`}>{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}

export function FamilyBars({ families }: { families: FamilyStat[] }) {
  return (
    <div className="space-y-2">
      {families.map((f) => (
        <div key={f.family} className="space-y-1">
          <div className="flex justify-between text-[0.6875rem]">
            <span className="text-foreground">{f.family}</span>
            <span className="text-muted-foreground">
              <span dir="ltr">
                {f.correct}/{f.total}
              </span>{" "}
              · <span className={`font-bold ${percentColor(f.percentage)}`}>{f.percentage}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor(f.percentage)}`}
              style={{ width: `${f.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
