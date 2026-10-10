// أجزاء شاشة التلاوات: أزرار التحكم، وصف الإعداد، وصف السورة مع التنزيل (M5: من _authed.mushaf.recitations.tsx
// دون تغيير السلوك).

import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import {
  cancelDownload,
  formatBytesAr,
  offlineSupported,
  toArabicDigits,
  useDownloads,
  startDownload,
  useActiveDownload,
  useRecitationPrefs,
} from "@/lib/quran";
import { useT } from "@/lib/i18n";

export function TransportButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition active:scale-95"
    >
      <Icon d={icon} size={18} />
    </button>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 rounded-3xl border border-border/60 bg-card/70 p-4 text-right shadow-soft backdrop-blur-xl"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.7812rem] font-medium">{label}</span>
        <span className="mt-0.5 block text-[0.625rem] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            value ? "right-0.5" : "right-[1.375rem]"
          }`}
        />
      </span>
    </button>
  );
}

export function SurahRow({
  id,
  nameAr,
  ayahs,
  playing,
  downloaded,
  onPlay,
  reciterFolder,
}: {
  id: number;
  nameAr: string;
  ayahs: number;
  playing: boolean;
  downloaded: boolean;
  onPlay: () => void;
  reciterFolder: string;
}) {
  const t = useT();
  const { reciter } = useRecitationPrefs();
  const downloads = useDownloads();
  // التحميل في مدير عام: يستمر بعد مغادرة الشاشة، ويعود تقدّمه هنا عند الرجوع.
  const job = useActiveDownload(reciterFolder, id);
  const progress = job?.status === "active" ? job : null;
  const error = job?.status === "error" ? job.message : null;

  const start = () => startDownload(reciter, id, ayahs);
  return (
    <div
      className={`rounded-2xl border p-3 shadow-soft backdrop-blur-xl transition ${
        playing ? "border-primary/50 bg-primary/10" : "border-border/60 bg-card/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onPlay}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 ${
            playing ? "gradient-primary text-primary-foreground" : "bg-gold/10 text-gold"
          }`}
          aria-label={t("recitationsList.play", { name: nameAr })}
        >
          <Icon d={playing ? icons.pause : icons.play} size={16} />
        </button>

        <button onClick={onPlay} className="min-w-0 flex-1 text-right">
          <div className="truncate text-[0.8125rem] font-medium">
            {toArabicDigits(id)}. {nameAr}
          </div>
          <div className="mt-0.5 text-[0.625rem] text-muted-foreground tabular-nums">
            {t("recitationsList.ayahs", { n: toArabicDigits(ayahs) })}
            {downloaded && t("recitationsList.downloaded")}
          </div>
        </button>

        {offlineSupported() &&
          (downloaded ? (
            <button
              onClick={() => void downloads.remove(reciterFolder, id)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
              aria-label={t("recitationsList.removeDownload")}
            >
              <Icon d={icons.check} size={15} />
            </button>
          ) : progress ? (
            <button
              onClick={() => cancelDownload(reciterFolder, id)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground"
              aria-label={t("recitationsList.cancelDownload")}
            >
              <Icon d={icons.close} size={14} />
            </button>
          ) : (
            <button
              onClick={start}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground"
              aria-label={t("recitationsList.download", { name: nameAr })}
            >
              <Icon d={icons.download} size={15} />
            </button>
          ))}
      </div>

      {progress && (
        <div className="mt-2.5">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="gradient-primary h-full transition-all"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[0.5938rem] text-muted-foreground tabular-nums">
            <span>
              {t("recitationsList.progress", {
                done: toArabicDigits(progress.done),
                total: toArabicDigits(progress.total),
              })}
            </span>
            <span>{formatBytesAr(progress.bytes)}</span>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[0.625rem] leading-relaxed text-destructive">{error}</p>}
    </div>
  );
}
