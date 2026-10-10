import { useId, useState } from "react";
import { BookOpen, ChevronDown, Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SurahPicker } from "@/components/mushaf/reader/Pickers";
import { AyahGrid } from "@/components/zen/register/AyahGrid";
import { addProgress, updateProgress, type ProgressRow } from "@/lib/zen-api";
import { SURAHS } from "@/lib/quran-meta";
import { surahNo } from "@/lib/daily-record";
import { useT } from "@/lib/i18n";

const FIELD =
  "w-full min-h-11 rounded-xl border border-border/60 bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary/60";

export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="glass rounded-2xl p-2.5 flex flex-col items-center gap-1">
      <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
      <span className="text-base font-black text-foreground leading-none tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

type Key = "from" | "to";

/**
 * «تسجيل حفظ» (وتعديله ما لم يُقيَّم): السورة من قائمة المصحف الموحَّدة، والآيتان كتابةً أو من شبكة
 * آيات السورة، ولا يُقبل رقم أكبر من آياتها. الحارس على الخادم (progress_guard) يتحقق من المدى أيضاً.
 */
export function LogSheet({
  userId,
  editing,
  onClose,
  onSaved,
}: {
  userId: string;
  editing?: ProgressRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const id = useId();
  const startSurah = (editing && surahNo(editing.surah_name)) || 1;
  const [surah, setSurah] = useState(startSurah);
  const [from, setFrom] = useState<number | undefined>(editing?.from_ayah ?? 1);
  const [to, setTo] = useState<number | undefined>(
    editing?.to_ayah ?? SURAHS[startSurah - 1].ayahs,
  );
  const [type, setType] = useState<"new" | "revision">(editing?.memorization_type ?? "new");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [grid, setGrid] = useState<Key | null>(null);
  const [picking, setPicking] = useState(false);
  const max = SURAHS[surah - 1]?.ayahs ?? 0;
  const name = SURAHS[surah - 1]?.name ?? "";

  const clamp = (n: number | undefined) => {
    if (n && n > max) {
      setErr(t("progressLog.maxAyah", { surah: name, n: max }));
      return max;
    }
    setErr(null);
    return n;
  };
  const typed = (k: Key, v: string) => {
    const n = v === "" ? undefined : clamp(Math.max(1, Math.floor(Number(v)) || 1));
    if (k === "from") setFrom(n);
    else setTo(n);
  };
  const pickSurah = (n: number) => {
    setSurah(n);
    setFrom(1);
    setTo(SURAHS[n - 1]?.ayahs);
    setErr(null);
    setPicking(false);
    setGrid("from");
  };
  const pick = (k: Key, n: number) => {
    setErr(null);
    if (k === "from") {
      setFrom(n);
      if (to != null && to < n) setTo(undefined);
      setGrid("to");
    } else {
      setTo(n);
      setGrid(null);
    }
  };

  const save = async () => {
    if (saving) return;
    if (!from || !to || from < 1 || to < from || to > max) {
      setErr(t("progressLog.badRange"));
      return;
    }
    setSaving(true);
    setErr(null);
    const row = {
      surah_name: name,
      from_ayah: from,
      to_ayah: to,
      memorization_type: type,
      notes: notes.trim() || null,
    };
    try {
      if (editing) await updateProgress(editing.id, row);
      else await addProgress({ user_id: userId, ...row });
      onSaved();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(
        m.includes("progress_reviewed")
          ? t("progressLog.reviewed")
          : m.includes("invalid_range")
            ? t("progressLog.badRange")
            : t("progressLog.failed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const ayahInput = (k: Key, label: string, value: number | undefined) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="numeric"
        dir="ltr"
        min={k === "to" ? (from ?? 1) : 1}
        max={max}
        value={value ?? ""}
        aria-controls={grid === k ? `${id}-grid` : undefined}
        aria-expanded={grid === k}
        onFocus={() => setGrid(k)}
        onChange={(e) => typed(k, e.target.value)}
        className={`${FIELD} text-center tabular-nums ${grid === k ? "border-primary/60 ring-2 ring-primary/20" : ""}`}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card p-4 gap-3">
        <DialogHeader className="text-start px-8">
          <DialogTitle className="text-lg font-black">
            {editing ? t("progressLog.editTitle") : t("progressLog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("progressLog.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 text-xs text-muted-foreground">
          <span id={`${id}-surah`}>{t("progressLog.surah")}</span>
          <button
            type="button"
            aria-labelledby={`${id}-surah`}
            aria-haspopup="dialog"
            onClick={() => setPicking(true)}
            className={`${FIELD} flex items-center gap-2 text-start`}
          >
            <span className="w-7 h-7 shrink-0 rounded-lg border border-gold/30 bg-gold/10 text-gold-ink text-xs font-bold flex items-center justify-center tabular-nums">
              {surah}
            </span>
            <span className="flex-1 min-w-0 truncate font-display font-medium">{name}</span>
            <span className="shrink-0 rounded-md bg-muted/70 px-1.5 text-xs tabular-nums text-muted-foreground">
              {t("surahPicker.ayahs", { n: max })}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ayahInput("from", t("progressLog.from"), from)}
          {ayahInput("to", t("progressLog.to"), to)}
        </div>
        {grid && (
          <AyahGrid
            id={`${id}-grid`}
            title={t(grid === "from" ? "progressLog.gridFrom" : "progressLog.gridTo", {
              surah: name,
            })}
            max={max}
            min={grid === "to" ? (from ?? 1) : 1}
            value={grid === "from" ? from : to}
            inRange={(n) => !!from && !!to && n >= from && n <= to}
            onPick={(n) => pick(grid, n)}
            onClose={() => setGrid(null)}
          />
        )}

        <div className="grid gap-1 text-xs text-muted-foreground">
          {t("progressLog.type")}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("progressLog.type")}>
            {(["new", "revision"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={type === k}
                onClick={() => setType(k)}
                className={`min-h-11 rounded-xl text-sm font-bold ${
                  type === k
                    ? k === "new"
                      ? "bg-primary text-primary-foreground"
                      : "bg-gold text-gold-foreground"
                    : "glass text-foreground"
                }`}
              >
                {t(k === "new" ? "progressLog.new" : "progressLog.revision")}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-1 text-xs text-muted-foreground">
          {t("progressLog.notes")}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm text-foreground outline-none resize-none focus:border-primary/60"
            placeholder={t("progressLog.notesPh")}
          />
        </label>

        {err && (
          <p role="alert" className="text-xs font-bold text-destructive">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          {editing ? t("progressLog.saveEdit") : t("progressLog.save")}
        </button>

        <SurahPicker
          open={picking}
          onOpenChange={setPicking}
          current={surah}
          onPick={(s) => pickSurah(s.id)}
        />
      </DialogContent>
    </Dialog>
  );
}
