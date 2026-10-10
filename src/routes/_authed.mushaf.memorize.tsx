import { createFileRoute } from "@tanstack/react-router";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { MemorizeMode } from "@/components/mushaf/MemorizeMode";
import { useSession } from "@/hooks/useSession";
import { quranRepository, toArabicDigits } from "@/lib/quran";

/** وضع الحفظ: /mushaf/memorize?surah=67&from=1&to=5 */
export const Route = createFileRoute("/_authed/mushaf/memorize")({
  head: () => ({ meta: [{ title: "وضع الحفظ — Zen" }] }),
  validateSearch: (s: Record<string, unknown>): { surah: number; from: number; to?: number } => {
    const n = (v: unknown, d: number) => {
      const x = Math.floor(Number(v));
      return Number.isFinite(x) && x > 0 ? x : d;
    };
    const surah = Math.min(114, n(s.surah, 1));
    return { surah, from: n(s.from, 1), to: s.to === undefined ? undefined : n(s.to, 1) };
  },
  component: MemorizeScreen,
});

function MemorizeScreen() {
  const { surah, from, to } = Route.useSearch();
  const { userId, guest } = useSession();
  const meta = quranRepository.getSurah(surah) ?? quranRepository.getSurah(1)!;
  const a = Math.min(meta.ayatCount, from);
  // افتراضياً: خمس آيات من موضع البدء.
  const b = Math.min(meta.ayatCount, Math.max(a, to ?? a + 4));
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/mushaf/read" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black truncate">وضع الحفظ</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              سورة {meta.nameAr}، الآيات {toArabicDigits(a)}–{toArabicDigits(b)}
            </p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <MemorizeMode
            key={`${surah}:${a}:${b}`}
            surah={meta.id}
            from={a}
            to={b}
            userId={userId}
            canSave={!!userId && !guest}
          />
        </div>
      </div>
    </PhoneFrame>
  );
}
