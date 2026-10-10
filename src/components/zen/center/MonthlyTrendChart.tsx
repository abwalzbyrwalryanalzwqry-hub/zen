import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthLabel, type MonthlyKpi } from "@/lib/center";

/** الاتجاه الشهري (10.3): الصفحات أعمدةً ونسبة الحضور خطاً. ملف مستقل لتحميل recharts عند الحاجة. */
export default function MonthlyTrendChart({ monthly }: { monthly: MonthlyKpi[] }) {
  const data = monthly.map((m) => ({
    month: monthLabel(m.month),
    pages: m.pages,
    rate: m.attendance_rate,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="p" tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
        <YAxis
          yAxisId="r"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 10 }}
          width={28}
        />
        <Tooltip
          formatter={(v, name) => (name === "rate" ? [`${v ?? 0}%`, "الحضور"] : [v ?? 0, "صفحات"])}
        />
        <Legend
          formatter={(v: string) => (v === "rate" ? "الحضور %" : "صفحات محفوظة")}
          wrapperStyle={{ fontSize: 10 }}
        />
        <Bar yAxisId="p" dataKey="pages" fill="var(--primary)" radius={[6, 6, 0, 0]} />
        <Line
          yAxisId="r"
          dataKey="rate"
          stroke="var(--gold, #b8903c)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
