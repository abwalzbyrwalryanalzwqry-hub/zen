/** أدوات عرض المحادثة (المرحلة 3): فواصل الأيام، ووصف الطرف الآخر، وبطاقات الآيات. */
import { SURAHS } from "@/lib/quran-meta";
import { AR_LATN } from "@/lib/i18n";

const DAY_MS = 24 * 3600 * 1000;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «اليوم» أو «أمس» أو اسم اليوم خلال الأسبوع أو التاريخ الكامل. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "اليوم";
  if (dayKey(d) === dayKey(new Date(now.getTime() - DAY_MS))) return "أمس";
  const diff = now.getTime() - d.getTime();
  if (diff > 0 && diff < 6 * DAY_MS) return d.toLocaleDateString(AR_LATN, { weekday: "long" });
  return d.toLocaleDateString(AR_LATN, {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** هل تبدأ هذه الرسالة يوماً جديداً مقارنة بالسابقة؟ */
export function startsNewDay(prevIso: string | undefined, iso: string): boolean {
  return !prevIso || dayKey(new Date(prevIso)) !== dayKey(new Date(iso));
}

export type PeerKind = "teacher" | "guardian" | "student";
export const PEER_KIND_LABEL: Record<PeerKind, string> = {
  teacher: "معلّم",
  guardian: "وليّ أمر",
  student: "طالب",
};

export type AyahRef = { surah: number; name: string; from: number; to: number };

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/**
 * مرجع آية إن كانت الرسالة مرجعاً فقط، مثل «البقرة 255» أو «سورة البقرة: 255-257» أو «آل عمران ٨».
 * يُعرض عندها نص الآية من المصحف المضمَّن في التطبيق، ولا يُعتمد على نص يكتبه المستخدم.
 */
export function parseAyahRef(text: string): AyahRef | null {
  const t = toLatin(text.trim())
    .replace(/[﴿﴾«»()[\]]/g, "")
    .trim();
  const m = t.match(
    /^(?:سورة\s+)?([\u0600-\u06FF\s]+?)\s*[:،,]?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/,
  );
  if (!m) return null;
  const name = m[1].trim();
  const s = SURAHS.find((x) => x.name === name);
  if (!s) return null;
  const from = Number(m[2]);
  const to = m[3] ? Number(m[3]) : from;
  if (from < 1 || to < from || to > s.ayahs || to - from > 9) return null;
  return { surah: s.n, name: s.name, from, to };
}
