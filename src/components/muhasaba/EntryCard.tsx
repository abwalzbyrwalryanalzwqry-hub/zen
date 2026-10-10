import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { isoDay } from "@/lib/muhasaba/dates";
import { dayState, type DayState } from "@/lib/muhasaba/logic";
import { loadLocal } from "@/lib/muhasaba/storage";

const TEXT: Record<DayState | "new", { title: string; sub: string; emoji: string }> = {
  new: { emoji: "🌱", title: "محاسبتي", sub: "مساحة يومية تقف فيها مع نفسك" },
  empty: { emoji: "🌿", title: "محاسبتي", sub: "كيف كان يومك؟ خذ دقيقة مع نفسك" },
  partial: { emoji: "🌿", title: "محاسبتي", sub: "بدأت وقفة اليوم — أكملها متى شئت" },
  closed: { emoji: "🌙", title: "محاسبتي", sub: "أغلقت يومك، أحسنت على وقفتك" },
};

/** مدخل «محاسبتي» في الصفحة الرئيسية — بدل إضافة تبويب جديد يزحم شريط التنقّل. */
export function MuhasabaEntryCard({ userId }: { userId: string | null | undefined }) {
  // من التخزين المحلي مباشرة (متزامن)، فلا حاجة لأثر يضبط الحالة بعد العرض الأول.
  const state = useMemo<DayState | "new">(() => {
    if (!userId) return "empty";
    const s = loadLocal(userId);
    return s.settings.onboarded_at ? dayState(s.days[isoDay()]) : "new";
  }, [userId]);
  const t = TEXT[state];
  return (
    <Link
      to="/muhasaba"
      className="glass rounded-3xl p-4 flex items-center gap-3 border border-primary/20"
    >
      <span
        className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center text-xl"
        aria-hidden
      >
        {t.emoji}
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">{t.title}</p>
        <p className="text-[0.6875rem] text-muted-foreground">{t.sub}</p>
      </div>
      <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
