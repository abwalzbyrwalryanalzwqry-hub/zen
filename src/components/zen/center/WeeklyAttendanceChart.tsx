import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** رسم الحضور الأسبوعي. في ملف مستقل لتُحمَّل recharts عند عرض الرسم فقط (المرحلة 7.4). */
export default function WeeklyAttendanceChart({
  weekly,
}: {
  weekly: { week: string; rate: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={weekly.map((w) => ({ week: w.week.slice(5), rate: w.rate ?? 0 }))}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} />
        <Tooltip formatter={(v) => [`${v ?? 0}%`, "الحضور"]} />
        <Bar dataKey="rate" fill="var(--primary)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
