import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Screen, ScreenHeader, SectionLabel, Skeleton } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { useSurahText } from "@/hooks/quran/use-surah-text";
import {
  buildShareText,
  renderAyahCard,
  shareCardImage,
  shareCardText,
  SHARE_SIZES,
  SHARE_THEMES,
  toArabicDigits,
  useSurahTafsir,
  useTafsirEdition,
  type ShareSize,
  type ShareTheme,
} from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";

export const Route = createFileRoute("/_authed/mushaf/share")({
  head: () => ({
    meta: [
      { title: "مشاركة آية — Zen" },
      {
        name: "description",
        content: "صمّم بطاقة فاخرة لأي آية وشاركها كصورة أو نص، بدون إنترنت.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { surah?: number; ayah?: number } => {
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    };
    return { surah: num(search.surah), ayah: num(search.ayah) };
  },
  component: ShareScreen,
});

function ShareScreen() {
  const params = Route.useSearch();
  const [surah, setSurah] = useState(() =>
    params.surah && params.surah >= 1 && params.surah <= 114 ? params.surah : 1,
  );
  const [ayah, setAyah] = useState(() => (params.ayah && params.ayah > 0 ? params.ayah : 1));
  const [theme, setTheme] = useState<ShareTheme>("night");
  const [size, setSize] = useState<ShareSize>("square");
  const [withTafsir, setWithTafsir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const meta = SURAH_META[surah - 1];
  const text = useSurahText(surah);
  const { slug } = useTafsirEdition();
  const tafsir = useSurahTafsir(slug, surah);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // سورة أقصر: تُقصر الآية على عدد آياتها أثناء العرض (M12).
  const clampedAyah = Math.min(Math.max(1, ayah), meta.ayatCount);
  if (clampedAyah !== ayah) setAyah(clampedAyah);

  const ayahText = useMemo(() => {
    if (text.status !== "ready") return null;
    return text.data.ayahs.find((a) => a.n === ayah) ?? null;
  }, [ayah, text]);

  const note = useMemo(() => {
    if (!withTafsir || tafsir.status !== "ready") return undefined;
    const raw = tafsir.data[String(ayah)];
    if (!raw) return undefined;
    const body = raw.split(/\n+/).filter((l) => l.trim() && !l.startsWith("["));
    const line = body[body.length - 1] ?? "";
    return line.length > 220 ? `${line.slice(0, 217)}…` : line;
  }, [ayah, tafsir, withTafsir]);

  // Redraw whenever anything changes.
  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ayahText) return;
    await renderAyahCard(canvas, {
      text: ayahText.t,
      surahNameAr: meta.nameAr,
      ayahFrom: ayah,
      ayahTo: ayah,
      theme,
      size,
      note,
    });
    setPreview(canvas.toDataURL("image/png"));
  }, [ayah, ayahText, meta.nameAr, note, size, theme]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const fileName = `zen-${surah}-${ayah}.png`;

  const onShareImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ayahText) return;
    setBusy(true);
    try {
      const outcome = await shareCardImage(
        canvas,
        fileName,
        buildShareText({
          text: ayahText.t,
          surahNameAr: meta.nameAr,
          ayahFrom: ayah,
          ayahTo: ayah,
        }),
      );
      setNotice(
        outcome === "shared"
          ? "تمت المشاركة"
          : outcome === "downloaded"
            ? "تم تنزيل الصورة"
            : outcome === "cancelled"
              ? "أُلغيت المشاركة"
              : "تم النسخ",
      );
    } catch {
      setNotice("تعذّرت المشاركة — جرّب مرة أخرى");
    } finally {
      setBusy(false);
    }
  };

  const onShareText = async () => {
    if (!ayahText) return;
    setBusy(true);
    try {
      const outcome = await shareCardText(
        buildShareText({
          text: ayahText.t,
          surahNameAr: meta.nameAr,
          ayahFrom: ayah,
          ayahTo: ayah,
        }),
      );
      setNotice(
        outcome === "copied"
          ? "تم نسخ النص"
          : outcome === "shared"
            ? "تمت المشاركة"
            : "أُلغيت المشاركة",
      );
    } catch {
      setNotice("تعذّرت المشاركة");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="مشاركة آية" subtitle="بطاقة فاخرة بخط المصحف" backTo="/mushaf" />

      {/* Ayah pickers */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5">
        <select
          value={surah}
          onChange={(e) => {
            setSurah(Number(e.target.value));
            setAyah(1);
          }}
          className="w-full rounded-2xl border border-border/60 bg-card/70 px-3 py-3 text-sm outline-none"
          dir="rtl"
        >
          {SURAH_META.map((s) => (
            <option key={s.id} value={s.id}>
              {toArabicDigits(s.id)}. {s.nameAr}
            </option>
          ))}
        </select>
        <select
          value={ayah}
          onChange={(e) => setAyah(Number(e.target.value))}
          className="rounded-2xl border border-border/60 bg-card/70 px-3 py-3 text-sm tabular-nums outline-none"
          dir="rtl"
        >
          {Array.from({ length: meta.ayatCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              آية {toArabicDigits(n)}
            </option>
          ))}
        </select>
      </div>

      {/* Preview */}
      <SectionLabel hint={`${toArabicDigits(meta.ayatCount)} آية`}>المعاينة</SectionLabel>
      <div className="px-5">
        <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card/60 p-3 shadow-elegant backdrop-blur-xl">
          {text.status === "loading" && <Skeleton className="aspect-square w-full rounded-2xl" />}
          {text.status === "error" && (
            <p className="py-10 text-center text-[0.75rem] text-destructive">
              تعذّر تحميل نص السورة.
            </p>
          )}
          {preview && (
            <img
              src={preview}
              alt={`بطاقة الآية ${ayah} من سورة ${meta.nameAr}`}
              className="mx-auto w-full rounded-2xl"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {/* Styles */}
      <SectionLabel>الستايل</SectionLabel>
      <div className="px-5">
        <div className="grid grid-cols-3 gap-2">
          {SHARE_THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`rounded-2xl border py-2.5 text-[0.7188rem] font-medium transition active:scale-95 ${
                theme === t.key
                  ? "border-gold/50 bg-gold/15 text-gold"
                  : "border-border/60 bg-card/70 text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {SHARE_SIZES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSize(s.key)}
              className={`rounded-2xl border py-2.5 text-[0.7188rem] font-medium transition active:scale-95 ${
                size === s.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/70 text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setWithTafsir((v) => !v)}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3.5 text-right shadow-soft"
        >
          <span className="min-w-0 flex-1 text-[0.75rem] font-medium">
            إضافة سطر من التفسير
            <span className="mt-0.5 block text-[0.625rem] font-normal text-muted-foreground">
              يُختصر تلقائيًا ليناسب البطاقة
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              withTafsir ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                withTafsir ? "right-0.5" : "right-[1.375rem]"
              }`}
            />
          </span>
        </button>
      </div>

      {notice && (
        <div className="mt-4 px-5">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-center text-[0.6875rem] text-primary">
            {notice}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 grid gap-2.5 px-5">
        <button
          onClick={() => void onShareImage()}
          disabled={busy || !ayahText}
          className="gradient-primary flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[0.8125rem] font-medium text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-50"
        >
          <Icon d={icons.share} size={16} />
          مشاركة البطاقة كصورة
        </button>
        <button
          onClick={() => void onShareText()}
          disabled={busy || !ayahText}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card/70 py-3.5 text-[0.8125rem] font-medium shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          <Icon d={icons.copy} size={16} />
          مشاركة النص فقط
        </button>
      </div>

      <p className="mt-4 px-6 text-center text-[0.625rem] leading-relaxed text-muted-foreground">
        تُرسم البطاقة داخل جهازك بخط المصحف المضمّن — تعمل بدون إنترنت.
      </p>
    </Screen>
  );
}
