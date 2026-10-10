import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arabesque, Icon, Screen, ScreenHeader, SectionLabel } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRecitationPlayer } from "@/hooks/quran/recitation-host";
import {
  deleteAllDownloads,
  formatBytesAr,
  offlineSupported,
  RECITATION_SOURCE_URL,
  RECITERS,
  toArabicDigits,
  useDownloads,
  useRecitationPrefs,
} from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { searchSurahNames } from "@/lib/quran/search-service";
import { SurahRow, ToggleRow, TransportButton } from "@/components/zen/quran/recitations-parts";

export const Route = createFileRoute("/_authed/mushaf/recitations")({
  head: () => ({
    meta: [
      { title: "التلاوات — Zen" },
      {
        name: "description",
        content: "استمع لأشهر القرّاء آية آية، مع التكرار وحفظ السور للاستماع بدون إنترنت.",
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
  component: RecitationsScreen,
});

const RATES = [0.75, 1, 1.25, 1.5];

function RecitationsScreen() {
  const params = Route.useSearch();
  const { prefs, update, reciter } = useRecitationPrefs();
  const player = useRecitationPlayer();
  // إبقاء الشاشة مضاءة أثناء التلاوة يتولاه RecitationPlayerProvider في الجذر.
  const downloads = useDownloads();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [surah, setSurah] = useState(() =>
    params.surah && params.surah >= 1 && params.surah <= 114 ? params.surah : 1,
  );
  const [query, setQuery] = useState("");
  const startedRef = useRef(false);

  // Auto-play the ayah a deep link asked for.
  useEffect(() => {
    if (startedRef.current || !params.surah) return;
    startedRef.current = true;
    player.play(params.surah, params.ayah ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return SURAH_META;
    // البحث المطبَّع نفسه المستعمل في منتقي المصحف («الانعام» تجد «الأنعام»).
    return searchSurahNames(q, SURAH_META.length);
  }, [query]);

  const currentMeta = player.track ? SURAH_META[player.track.surah - 1] : SURAH_META[surah - 1];

  return (
    <Screen>
      <ScreenHeader
        title="التلاوات"
        subtitle={`${toArabicDigits(RECITERS.length)} قارئًا، تلاوة آية بآية`}
        backTo="/mushaf"
      />

      {/* Player */}
      <div className="px-5 animate-fade-up">
        <div className="gradient-night relative overflow-hidden rounded-[32px] p-5 text-white shadow-elegant">
          <Arabesque className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 text-gold/20" />

          <button
            onClick={() => setPickerOpen(true)}
            className="relative flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 text-right backdrop-blur transition active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/20 text-gold">
              <Icon d={icons.azkar} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{reciter.nameAr}</span>
              <span className="block truncate text-[0.625rem] text-white/75">
                {reciter.styleAr}، {toArabicDigits(reciter.kbps)} ك.ب/ث
              </span>
            </span>
            <span className="rotate-90 text-white/75">
              <Icon d={icons.chevron} size={14} />
            </span>
          </button>

          <div className="relative mt-5 text-center">
            <div className="font-display text-2xl font-medium">سورة {currentMeta.nameAr}</div>
            <div className="mt-1 text-[0.6875rem] text-white/70 tabular-nums">
              {player.track
                ? `الآية ${toArabicDigits(player.track.ayah)} من ${toArabicDigits(currentMeta.ayatCount)}`
                : `${toArabicDigits(currentMeta.ayatCount)} آية`}
              {player.offline && "، بدون إنترنت"}
            </div>
          </div>

          {/* Transport */}
          <div className="relative mt-5 flex items-center justify-center gap-3">
            <TransportButton icon={icons.skipPrev} label="السابقة" onClick={player.prev} />
            <button
              onClick={() => (player.track ? player.toggle() : player.play(surah, 1))}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary shadow-glow transition active:scale-95"
              aria-label={player.status === "playing" ? "إيقاف مؤقت" : "تشغيل"}
            >
              {player.status === "loading" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              ) : (
                <Icon d={player.status === "playing" ? icons.pause : icons.play} size={24} />
              )}
            </button>
            <TransportButton icon={icons.skipNext} label="التالية" onClick={player.next} />
          </div>

          {/* Seek */}
          <div className="relative mt-4">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(player.position.duration))}
              value={Math.floor(player.position.current)}
              onChange={(e) => player.seek(Number(e.target.value))}
              className="h-1.5 w-full accent-[#C9A227]"
              dir="ltr"
              aria-label="موضع التلاوة"
            />
            <div className="mt-1 flex justify-between text-[0.6875rem] font-medium text-white/80 tabular-nums">
              <span>{clock(player.position.current)}</span>
              <span>{clock(player.position.duration)}</span>
            </div>
          </div>

          {player.error && (
            <div className="relative mt-3 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-3 text-[0.6875rem] leading-relaxed text-rose-100">
              {player.error}
            </div>
          )}

          {player.track && (
            <div className="relative mt-3 flex justify-center gap-2">
              <Link
                to="/mushaf/read"
                search={{ surah: player.track.surah, ayah: player.track.ayah, mode: "surah" }}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.625rem] backdrop-blur"
              >
                متابعة في المصحف
              </Link>
              <button
                onClick={player.stop}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.625rem] backdrop-blur"
              >
                إيقاف
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preferences */}
      <SectionLabel>إعدادات الاستماع</SectionLabel>
      <div className="space-y-3 px-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-soft backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[0.6875rem] font-medium">
            <Icon d={icons.repeat} size={14} />
            التكرار
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(
              [
                { key: "off", label: "بدون" },
                { key: "ayah", label: "الآية" },
                { key: "range", label: "السورة" },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => update({ repeat: o.key })}
                className={`rounded-xl border py-2 text-[0.6875rem] font-medium transition active:scale-95 ${
                  prefs.repeat === o.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 bg-background/60 text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {prefs.repeat === "ayah" && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-3 py-2">
              <span className="text-[0.6875rem] text-muted-foreground">عدد مرات تكرار الآية</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => update({ repeatCount: Math.max(2, prefs.repeatCount - 1) })}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60"
                  aria-label="أقل"
                >
                  <Icon d={icons.minus} size={13} />
                </button>
                <span className="w-6 text-center text-[0.75rem] font-medium tabular-nums">
                  {toArabicDigits(prefs.repeatCount)}
                </span>
                <button
                  onClick={() => update({ repeatCount: Math.min(20, prefs.repeatCount + 1) })}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60"
                  aria-label="أكثر"
                >
                  <Icon d={icons.plus} size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-soft backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[0.6875rem] font-medium">
            <Icon d={icons.speed} size={14} />
            سرعة التلاوة
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {RATES.map((r) => (
              <button
                key={r}
                onClick={() => update({ rate: r })}
                className={`rounded-xl border py-2 text-[0.6875rem] font-medium tabular-nums transition active:scale-95 ${
                  prefs.rate === r
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-border/60 bg-background/60 text-muted-foreground"
                }`}
              >
                {toArabicDigits(r.toString().replace(".", "٫"))}×
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          label="المتابعة إلى السورة التالية"
          hint="يواصل التشغيل تلقائيًا عند انتهاء السورة"
          value={prefs.continuous}
          onChange={(v) => update({ continuous: v })}
        />
      </div>

      {/* Surah list */}
      <SectionLabel hint={`${toArabicDigits(filtered.length)} سورة`}>اختر السورة</SectionLabel>
      <div className="px-5">
        <div className="glass flex items-center gap-3 rounded-2xl border border-border/60 px-4 py-2.5">
          <Icon d={icons.search} size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم السورة أو رقمها"
            className="flex-1 bg-transparent text-right text-[0.8125rem] outline-none placeholder:text-muted-foreground"
            dir="rtl"
          />
        </div>
      </div>

      <div className="mt-3 space-y-2 px-5">
        {filtered.map((s) => (
          <SurahRow
            key={s.id}
            id={s.id}
            nameAr={s.nameAr}
            ayahs={s.ayatCount}
            playing={player.track?.surah === s.id && player.status === "playing"}
            downloaded={downloads.has(reciter.folder, s.id)}
            onPlay={() => {
              setSurah(s.id);
              player.play(s.id, 1);
            }}
            reciterFolder={reciter.folder}
          />
        ))}
      </div>

      {/* Downloads manager */}
      <SectionLabel hint={downloads.items.length ? formatBytesAr(downloads.totalBytes) : undefined}>
        الاستماع بدون إنترنت
      </SectionLabel>
      <div className="px-5">
        {!offlineSupported() && (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-4 text-[0.6875rem] leading-relaxed text-muted-foreground shadow-soft backdrop-blur-xl">
            تحميل السور متاح في تطبيق الأندرويد. في المتصفح يعمل التشغيل عبر البث المباشر فقط.
          </div>
        )}

        {offlineSupported() && (
          <>
            {downloads.items.length === 0 && (
              <div className="rounded-3xl border border-border/60 bg-card/70 p-4 text-[0.6875rem] leading-relaxed text-muted-foreground shadow-soft backdrop-blur-xl">
                لم تحمّل أي سورة بعد. اضغط رمز التحميل بجوار أي سورة لحفظها على جهازك.
              </div>
            )}
            <div className="space-y-2">
              {downloads.items.map((d) => {
                const rec = RECITERS.find((r) => r.folder === d.folder);
                return (
                  <div
                    key={`${d.folder}-${d.surah}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon d={icons.check} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.7812rem] font-medium">
                        سورة {SURAH_META[d.surah - 1].nameAr}
                      </div>
                      <div className="mt-0.5 truncate text-[0.625rem] text-muted-foreground">
                        {rec?.nameAr ?? d.folder}، {formatBytesAr(d.bytes)}،{" "}
                        {toArabicDigits(d.ayahs)} آية
                      </div>
                    </div>
                    <button
                      onClick={() => void downloads.remove(d.folder, d.surah)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
                      aria-label="حذف التحميل"
                    >
                      <Icon d={icons.trash} size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {downloads.items.length > 1 && (
              <button
                onClick={() => void deleteAllDownloads()}
                className="mt-3 w-full rounded-2xl border border-destructive/40 bg-destructive/10 py-2.5 text-[0.75rem] font-medium text-destructive"
              >
                حذف كل التحميلات ({formatBytesAr(downloads.totalBytes)})
              </button>
            )}
          </>
        )}

        <p className="mt-4 text-center text-[0.625rem] leading-relaxed text-muted-foreground">
          مصدر التلاوات:{" "}
          <a
            href={RECITATION_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-gold underline"
          >
            everyayah.com
          </a>
        </p>
      </div>

      {/* Reciter picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          className="max-w-md rounded-3xl border-border/60 bg-card/95 p-0 backdrop-blur-2xl sm:rounded-3xl"
          dir="rtl"
        >
          <DialogHeader className="px-5 pt-5 text-right">
            <DialogTitle className="font-display text-xl">اختر القارئ</DialogTitle>
            <p className="text-[0.6875rem] text-muted-foreground">
              {toArabicDigits(RECITERS.length)} قارئًا، تلاوة مرتّلة آية بآية
            </p>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto px-3 pb-4">
            <ul className="grid gap-1.5">
              {RECITERS.map((r) => {
                const active = r.id === prefs.reciterId;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        update({ reciterId: r.id });
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition active:scale-[0.98] ${
                        active
                          ? "border-primary/50 bg-primary/10 shadow-soft"
                          : "border-border/50 bg-background/60"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          active ? "bg-primary text-primary-foreground" : "bg-gold/10 text-gold"
                        }`}
                      >
                        <Icon d={icons.azkar} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium">
                          {r.nameAr}
                        </span>
                        <span className="block truncate text-[0.625rem] text-muted-foreground">
                          {r.styleAr}
                        </span>
                      </span>
                      {active && (
                        <span className="text-primary">
                          <Icon d={icons.check} size={16} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}

/* ---------- Pieces ---------- */

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "٠:٠٠";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${toArabicDigits(m)}:${toArabicDigits(String(s).padStart(2, "0"))}`;
}
