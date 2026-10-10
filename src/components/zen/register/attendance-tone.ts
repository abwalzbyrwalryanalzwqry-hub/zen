import { CheckCircle2, Clock, Hand, XCircle, type LucideIcon } from "lucide-react";
import type { AttendanceStatus } from "@/lib/daily-record";

/**
 * ألوان الحضور الدلالية من رموز التصميم (فاتح وداكن): حاضر أخضر، غائب أحمر، مستأذن بنفسجي، متأخر
 * برتقالي ذهبي. اللون لا يعمل وحده: لكل حالة أيقونة ونص.
 */
export const ATTENDANCE_TONE: Record<AttendanceStatus, string> = {
  present: "bg-primary text-primary-foreground",
  late: "bg-gold text-gold-foreground",
  absent: "bg-destructive text-destructive-foreground",
  excused: "bg-excused text-excused-foreground",
};
export const ATTENDANCE_TEXT: Record<AttendanceStatus, string> = {
  present: "text-primary",
  late: "text-gold-ink",
  absent: "text-destructive",
  excused: "text-excused",
};
export const ATTENDANCE_ICON: Record<AttendanceStatus, LucideIcon> = {
  present: CheckCircle2,
  late: Clock,
  absent: XCircle,
  excused: Hand,
};
