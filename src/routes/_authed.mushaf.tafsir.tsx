import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Icon, Screen, ScreenHeader, Skeleton } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { useSurahText } from "@/hooks/quran/use-surah-text";
import {
  parseTafsir,
  tafsirGroup,
  TAFSIR_EDITIONS,
  toArabicDigits,
  useSurahTafsir,
  useTafsirEdition,
} from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { addBookmark, isBookmarked, removeBookmark, useBookmarks } from "@/lib/quran/bookmarks";
import { copyText, shareCardText } from "@/lib/quran/share-io";

/** أحجام خط التفسير (بكسل)، ويُحفظ الاختيار على الجهاز. */
const FONT_SIZES = [13.5, 15, 16.5, 18.5, 21];
const FONT_KEY = "zen.quran.tafsir.font.v1";
const FONT_EVENT = "zen:tafsir-font";

function readFontIndex(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(window.localStorage.getItem(FONT_KEY));
  return Number.isInteger(n) && n >= 0 && n < FONT_SIZES.length ? n : 0;
}

export const Route = createFileRoute("/_authed/mushaf/tafsir")({
  head: () => ({
    meta: [
      { title: "التفسير — Zen" },
      {
        name: "description",
        content: "تفسير كل آية من التفسير الميسّر والمختصر في التفسير، بدون إنترنت.",
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
  component: TafsirScreen,
});

function TafsirScreen() {
  const params = Route.useSearch();
  const navigate = useNavigate();
  const { slug, edition, select } = useTafsirEdition();

  const [surah, setSurah] = useState(() =>
    params.surah && params.surah >= 1 && params.surah <= 114 ? params.surah : 1,
  );
  const [ayah, setAyah] = useState(() => (params.ayah && params.ayah > 0 ? params.ayah : 1));

  const meta = SURAH_META[surah - 1];
  const text = useSurahText(surah);
  const tafsir = useSurahTafsir(slug, surah);
  useBookmarks();

  // Keep the ayah inside range when the surah changes (during render, M12).
  const clampedAyah = Math.min(Math.max(1, ayah), meta.ayatCount);
  if (clampedAyah !== ayah) setAyah(clampedAyah);

  // Reflect the current position in the URL so the screen is shareable.
  useEffect(() => {
    navigate({ to: "/mushaf/tafsir", search: { surah, ayah }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, ayah]);

  const ayahText = useMemo(() => {
    if (text.status !== "ready") return null;
    return text.data.ayahs.find((a) => a.n === ayah) ?? null;
  }, [ayah, text]);

  // الآيات التي يجمعها التفسير في نص واحد (الميسّر يفعل ذلك كثيراً).
  const group = useMemo(
    () => (tafsir.status === "ready" ? tafsirGroup(tafsir.data, ayah) : null),
    [ayah, tafsir],
  );
  const from = group?.from ?? ayah;
  const to = group?.to ?? ayah;
  const grouped = to > from;

  const blocks = useMemo(() => (group ? parseTafsir(group.text) : []), [group]);

  const groupAyahs = useMemo(() => {
    if (text.status !== "ready") return [];
    return text.data.ayahs.filter((a) => a.n >= from && a.n <= to);
  }, [from, to, text]);

  const goNext = () => setAyah(Math.min(meta.ayatCount, to + 1));
  const goPrev = () => {
    const target = Math.max(1, from - 1);
    const g = tafsir.status === "ready" ? tafsirGroup(tafsir.data, target) : null;
    setAyah(g?.from ?? target);
  };

  const [fontIndex, setFontIndex] = useState(0);
  useEffect(() => {
    const sync = () => setFontIndex(readFontIndex());
    sync();
    // يُعاد القراءة بعد استيراد نسخة احتياطية أو التعديل في تبويب آخر.
    window.addEventListener(FONT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FONT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setFont = (i: number) => {
    const next = Math.min(FONT_SIZES.length - 1, Math.max(0, i));
    setFontIndex(next);
    try {
      window.localStorage.setItem(FONT_KEY, String(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(FONT_EVENT));
  };
  const fontPx = FONT_SIZES[fontIndex];

  const rangeLabel = grouped
    ? `الآيات ${toArabicDigits(from)}–${toArabicDigits(to)}`
    : `الآية ${toArabicDigits(ayah)}`;
  // التنبيه («تم النسخ») يخصّ الموضع الذي ظهر فيه؛ الانتقال لغيره يخفيه دون أثر (M12).
  const noticeAt = `${surah}:${ayah}:${slug}`;
  const [noticeState, setNoticeState] = useState<{ at: string; text: string } | null>(null);
  const notice = noticeState?.at === noticeAt ? noticeState.text : null;
  const setNotice = (text: string | null) => setNoticeState(text ? { at: noticeAt, text } : null);
  const tafsirPlain = () =>
    `${blocks.map((b) => (b.kind === "bullet" ? `• ${b.text}` : b.text)).join("\n")}\n\n— ${
      edition.nameAr
    }، سورة ${meta.nameAr}، ${rangeLabel}`;
  const copyTafsir = async () => {
    // copyText: الحافظة ثم طريقة execCommand في WebView القديم.
    setNotice((await copyText(tafsirPlain())) ? "تم نسخ التفسير" : "تعذّر النسخ على هذا الجهاز");
  };
  const shareTafsir = async () => {
    const r = await shareCardText(tafsirPlain());
    if (r === "copied") setNotice("تم نسخ التفسير");
  };

  const saved = isBookmarked(surah, ayah);

  return (
    <Screen>
      <ScreenHeader
        title="التفسير"
        subtitle={`${edition.nameAr}، ${edition.authorAr}`}
        backTo="/mushaf"
        action={
          <Link
            to="/mushaf/read"
            search={{ surah, ayah, mode: "surah" }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft"
            aria-label="فتح في المصحف"
          >
            <Icon d={icons.quran} size={18} />
          </Link>
        }
      />

      {/* Edition switch */}
      <div className="px-5">
        <div className="glass grid grid-cols-2 gap-1 rounded-full border border-border/60 p-1.5 shadow-soft">
          {TAFSIR_EDITIONS.map((e) => (
            <button
              key={e.slug}
              onClick={() => select(e.slug)}
              className={`rounded-full py-2 text-[0.75rem] font-medium transition active:scale-95 ${
                slug === e.slug
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground"
              }`}
            >
              {e.nameAr}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[0.625rem] leading-relaxed text-muted-foreground">
          {edition.descAr}
        </p>
      </div>

      {/* Surah + ayah pickers */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5">
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

      {/* Ayah navigation */}
      <div className="mt-3 flex items-center justify-between px-5">
        <button
          onClick={goPrev}
          disabled={from <= 1}
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-[0.6875rem] transition disabled:opacity-60 active:scale-95"
        >
          <Icon d={icons.chevron} size={14} />
          السابقة
        </button>
        <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
          {grouped ? `${toArabicDigits(from)}–${toArabicDigits(to)}` : toArabicDigits(ayah)} /{" "}
          {toArabicDigits(meta.ayatCount)}
        </span>
        <button
          onClick={goNext}
          disabled={to >= meta.ayatCount}
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-[0.6875rem] transition disabled:opacity-60 active:scale-95"
        >
          التالية
          <span className="rotate-180">
            <Icon d={icons.chevron} size={14} />
          </span>
        </button>
      </div>

      {/* Ayah text */}
      <section className="mt-5 px-5">
        <div className="relative overflow-hidden rounded-[28px] border border-gold/25 bg-card/70 p-5 shadow-elegant backdrop-blur-xl">
          <div className="flex items-center justify-between text-[0.625rem] uppercase tracking-[0.25em] text-gold">
            <span>سورة {meta.nameAr}</span>
            <span className="tabular-nums">{rangeLabel}</span>
          </div>
          {text.status === "loading" && <Skeleton className="mt-4 h-20 rounded-2xl" />}
          {text.status === "error" && (
            <p className="mt-4 text-[0.75rem] text-destructive">تعذّر تحميل نص السورة.</p>
          )}
          {ayahText && (
            <p className="mt-4 text-center font-quran text-[1.1875rem] leading-[2.2] text-foreground">
              {(grouped && groupAyahs.length ? groupAyahs : [ayahText]).map((a) => (
                <span key={a.n}>
                  {a.t}{" "}
                  <span className="mx-0.5 font-sans text-[0.75rem] text-gold tabular-nums">
                    ﴿{toArabicDigits(a.n)}﴾
                  </span>{" "}
                </span>
              ))}
            </p>
          )}
          {ayahText && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                صفحة {toArabicDigits(ayahText.p)}، الجزء {toArabicDigits(ayahText.j)}
              </span>
              <button
                onClick={() => {
                  if (saved) removeBookmark(surah, ayah);
                  else
                    addBookmark({
                      surah,
                      ayah,
                      page: ayahText.p,
                      juz: ayahText.j,
                      text: ayahText.t,
                      tag: "tadabbur",
                    });
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.6875rem] font-medium transition active:scale-95 ${
                  saved
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-border/60 bg-background/70 text-muted-foreground"
                }`}
              >
                <Icon d={icons.bookmark} size={13} />
                {saved ? "محفوظة" : "حفظ الآية"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Tafsir body */}
      <section className="mt-4 px-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-soft backdrop-blur-xl">
          {tafsir.status === "loading" && (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 rounded-full" />
              ))}
            </div>
          )}

          {tafsir.status === "error" && (
            <div className="text-center">
              <p className="text-[0.75rem] text-destructive">{tafsir.error.message}</p>
              <button
                onClick={tafsir.retry}
                className="mt-3 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[0.75rem] font-medium text-primary"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {tafsir.status === "ready" && blocks.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[0.75rem] font-medium text-foreground">تفسير {rangeLabel}</div>
                {grouped && (
                  <div className="text-[0.625rem] text-muted-foreground">
                    يفسّر {edition.nameAr} هذه الآيات معاً في نص واحد
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1" role="group" aria-label="حجم الخط">
                <button
                  onClick={() => setFont(fontIndex - 1)}
                  disabled={fontIndex === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 text-[0.6875rem] font-medium disabled:opacity-60"
                  aria-label="تصغير الخط"
                >
                  أ-
                </button>
                <button
                  onClick={() => setFont(fontIndex + 1)}
                  disabled={fontIndex === FONT_SIZES.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 text-[0.8125rem] font-medium disabled:opacity-60"
                  aria-label="تكبير الخط"
                >
                  أ+
                </button>
              </div>
            </div>
          )}

          {tafsir.status === "ready" && blocks.length === 0 && (
            <p className="text-center text-[0.75rem] text-muted-foreground">
              لا يوجد نص تفسير لهذه الآية في هذه النسخة — جرّب النسخة الأخرى.
            </p>
          )}

          {blocks.map((b, i) =>
            b.kind === "heading" ? (
              <div key={i} className="mt-4 flex items-center gap-2 first:mt-0">
                <span className="h-px w-4 bg-gold" />
                <h3 className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-gold">
                  {b.text}
                </h3>
              </div>
            ) : b.kind === "bullet" ? (
              <div
                key={i}
                className="mt-2 flex gap-2 leading-[2] text-foreground/90"
                style={{ fontSize: fontPx }}
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <p>{b.text}</p>
              </div>
            ) : (
              <p
                key={i}
                className="mt-2.5 leading-[2] text-foreground/90"
                style={{ fontSize: fontPx }}
              >
                {b.text}
              </p>
            ),
          )}

          {blocks.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => void copyTafsir()}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium transition active:scale-[0.98]"
              >
                <Icon d={icons.copy} size={14} />
                نسخ التفسير
              </button>
              <button
                onClick={() => void shareTafsir()}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium transition active:scale-[0.98]"
              >
                <Icon d={icons.share} size={14} />
                مشاركة
              </button>
            </div>
          )}
          {notice && (
            <p className="mt-2 text-center text-[0.6875rem] text-primary" role="status">
              {notice}
            </p>
          )}

          <div className="mt-5 border-t border-border/50 pt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
            المصدر: {edition.nameAr} — {edition.authorAr}، النص من مكتبة{" "}
            <a
              href={edition.sourceUrl}
              className="text-gold underline"
              target="_blank"
              rel="noreferrer"
            >
              QUL / tarteel
            </a>
          </div>
        </div>
      </section>
    </Screen>
  );
}
