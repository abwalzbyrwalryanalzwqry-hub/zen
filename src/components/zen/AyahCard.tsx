import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { quranTextService } from "@/lib/quran";
import type { AyahRef } from "@/lib/chat-format";

/**
 * بطاقة آية داخل المحادثة: النص من المصحف المضمَّن في التطبيق (Tanzil، الرسم العثماني)،
 * لا من نص يكتبه المرسل. تظهر عندما تكون الرسالة مرجعاً فقط مثل «البقرة 255».
 */
export function AyahCard({ refr }: { refr: AyahRef }) {
  const [ayat, setAyat] = useState<{ n: number; t: string }[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    quranTextService
      .loadSurah(refr.surah)
      .then((s) => {
        if (!alive) return;
        setAyat(s.ayahs.filter((a) => a.n >= refr.from && a.n <= refr.to));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [refr.surah, refr.from, refr.to]);

  if (failed) return null;
  return (
    <div className="mt-2 rounded-2xl bg-background/60 text-foreground p-3 border border-gold/30">
      <p className="text-[0.625rem] text-muted-foreground flex items-center gap-1 mb-1">
        <BookOpen className="w-3 h-3" /> سورة {refr.name} ·{" "}
        {refr.from === refr.to ? `الآية ${refr.from}` : `الآيات ${refr.from}–${refr.to}`}
      </p>
      {ayat ? (
        <p className="font-quran text-base leading-loose" dir="rtl">
          {ayat.map((a) => `${a.t} ﴿${a.n.toLocaleString("ar-EG")}﴾`).join(" ")}
        </p>
      ) : (
        <p className="text-[0.6875rem] text-muted-foreground">جارٍ تحميل الآية…</p>
      )}
    </div>
  );
}
