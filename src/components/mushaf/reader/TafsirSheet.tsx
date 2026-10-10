import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Icon, Skeleton } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  parseTafsir,
  tafsirGroup,
  TAFSIR_EDITIONS,
  toArabicDigits,
  useSurahTafsir,
  useTafsirEdition,
} from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { friendlyLoadError } from "@/lib/quran/reader-labels";
import { useT } from "@/lib/i18n";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/**
 * التفسير داخل القارئ: يفتح على الآية نفسها دون مغادرة موضع القراءة، مع التبديل بين
 * النسختين والتنقل بين الآيات، ورابط إلى شاشة التفسير الكاملة.
 */
export function TafsirSheet({
  target,
  onClose,
}: {
  target: { surah: number; ayah: number } | null;
  onClose: () => void;
}) {
  const t = useT();
  const { slug, edition, select } = useTafsirEdition();
  const surah = target?.surah ?? 1;
  const meta = SURAH_META[surah - 1];
  const [ayahState, setAyahState] = useState<{ for: typeof target; ayah: number } | null>(null);
  const ayah = ayahState && ayahState.for === target ? ayahState.ayah : (target?.ayah ?? 1);
  const setAyah = (n: number) =>
    setAyahState({ for: target, ayah: Math.min(meta.ayatCount, Math.max(1, n)) });
  const tafsir = useSurahTafsir(slug, surah);

  const group = useMemo(
    () => (tafsir.status === "ready" ? tafsirGroup(tafsir.data, ayah) : null),
    [ayah, tafsir],
  );
  const from = group?.from ?? ayah;
  const to = group?.to ?? ayah;
  const blocks = useMemo(() => (group ? parseTafsir(group.text) : []), [group]);
  const rangeLabel =
    to > from
      ? t("mushafReader.tafsir.ayahs", { from: toArabicDigits(from), to: toArabicDigits(to) })
      : t("mushafReader.tafsir.ayah", { n: toArabicDigits(ayah) });

  const goPrev = () => {
    const target2 = Math.max(1, from - 1);
    const g = tafsir.status === "ready" ? tafsirGroup(tafsir.data, target2) : null;
    setAyah(g?.from ?? target2);
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-lg">
            {t("mushafReader.tafsir.title", { surah: meta.nameAr, range: rangeLabel })}
          </DialogTitle>
        </DialogHeader>

        <div
          className="grid grid-cols-2 gap-1 rounded-full border border-border/60 p-1"
          role="radiogroup"
          aria-label={t("mushafReader.tafsir.edition")}
        >
          {TAFSIR_EDITIONS.map((e) => (
            <button
              key={e.slug}
              type="button"
              role="radio"
              aria-checked={slug === e.slug}
              onClick={() => select(e.slug)}
              className={`rounded-full py-1.5 text-[0.6875rem] font-medium transition ${
                slug === e.slug
                  ? "gradient-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {e.nameAr}
            </button>
          ))}
        </div>

        <div className="min-h-24 text-[0.9375rem] leading-[2] text-foreground/90">
          {tafsir.status === "loading" && (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 rounded-full" />
              ))}
            </div>
          )}
          {tafsir.status === "error" && (
            <div className="text-center">
              <p className="text-[0.75rem] text-destructive">{friendlyLoadError(tafsir.error)}</p>
              <button
                onClick={tafsir.retry}
                className="mt-3 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[0.75rem] font-medium text-primary"
              >
                {t("mushafReader.error.retry")}
              </button>
            </div>
          )}
          {tafsir.status === "ready" && blocks.length === 0 && (
            <p className="text-center text-[0.75rem] text-muted-foreground">
              {t("mushafReader.tafsir.empty")}
            </p>
          )}
          {blocks.map((b, i) =>
            b.kind === "heading" ? (
              <h3 key={i} className="mt-3 text-[0.6875rem] font-medium text-gold first:mt-0">
                {b.text}
              </h3>
            ) : (
              <p key={i} className="mt-2 first:mt-0">
                {b.kind === "bullet" ? "• " : ""}
                {b.text}
              </p>
            ),
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={goPrev}
            disabled={from <= 1}
            className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 py-2 text-[0.6875rem] disabled:opacity-50"
          >
            <Icon d={icons.chevron} size={14} />
            {t("mushafReader.tafsir.prev")}
          </button>
          <Link
            to="/mushaf/tafsir"
            search={{ surah, ayah }}
            className="text-[0.6875rem] text-primary underline-offset-2 hover:underline"
          >
            {t("mushafReader.tafsir.full")}
          </Link>
          <button
            onClick={() => setAyah(to + 1)}
            disabled={to >= meta.ayatCount}
            className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 py-2 text-[0.6875rem] disabled:opacity-50"
          >
            {t("mushafReader.tafsir.next")}
            <span className="rotate-180">
              <Icon d={icons.chevron} size={14} />
            </span>
          </button>
        </div>
        <p className="text-center text-[0.625rem] text-muted-foreground">
          {edition.nameAr} — {edition.authorAr}
        </p>
      </DialogContent>
    </Dialog>
  );
}
