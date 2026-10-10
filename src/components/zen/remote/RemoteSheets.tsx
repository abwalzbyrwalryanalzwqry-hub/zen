import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Field } from "@/components/zen/fees/FeeStatementCard";
import { listHalaqaMembers, listHalaqat } from "@/lib/zen-halaqat-api";
import { SURAHS } from "@/lib/quran-meta";
import { useT } from "@/lib/i18n";
import {
  assignRemote,
  cycleMistake,
  mistakeCounts,
  MISTAKE_TYPES,
  remoteAudioUrl,
  reviewRemote,
  suggestGrade,
  type Mistake,
  type MistakeType,
  type RemoteItem,
} from "@/lib/remote-recitation";
import { toast } from "@/lib/toast";

const TONE: Record<MistakeType, string> = {
  hifz: "bg-destructive text-destructive-foreground",
  tajweed: "bg-gold text-background",
  tashkeel: "bg-sky-600 text-white",
  waqf: "bg-violet-600 text-white",
};

/** نوافذ التسميع عن بُعد للمعلّم (1.21.0): تكليف مقطع، ومراجعة التسجيل على شبكة الآيات. */
export function AssignSheet({
  open,
  onOpenChange,
  userId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onDone: () => void;
}) {
  const t = useT();
  const halaqat = useQuery({
    queryKey: ["my-taught-halaqat", userId],
    enabled: open,
    queryFn: async () => (await listHalaqat()).filter((h) => h.teacher_id === userId),
  });
  const [halaqa, setHalaqa] = useState("");
  const hid = halaqa || halaqat.data?.[0]?.id || "";
  const members = useQuery({
    queryKey: ["halaqa-members", hid],
    enabled: open && !!hid,
    queryFn: () => listHalaqaMembers(hid),
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"memorize" | "review">("review");
  const [surahNo, setSurahNo] = useState(67);
  const surah = SURAHS[surahNo - 1];
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const ok =
    !!hid && picked.size > 0 && from >= 1 && to >= from && to <= surah.ayahs && to - from < 300;
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const n = await assignRemote({
        halaqaId: hid,
        students: [...picked],
        kind,
        surah: surah.name,
        from,
        to,
        instructions: instructions.trim() || null,
        due: due || null,
      });
      toast.success(t("remote.teacher.assigned", { n }));
      onOpenChange(false);
      setPicked(new Set());
      setInstructions("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("remote.err.save"));
    } finally {
      setBusy(false);
    }
  };
  const num = (v: string, d: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const members_ = members.data ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t("remote.teacher.assign")}
        description={t("remote.teacher.assignHint")}
        footer={
          <button
            type="button"
            disabled={!ok || busy}
            onClick={() => void save()}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("remote.teacher.send", { n: picked.size })}
          </button>
        }
      >
        <div className="space-y-3">
          {halaqat.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" aria-hidden="true" />
          ) : (halaqat.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">{t("remote.teacher.noHalaqa")}</p>
          ) : (
            <Field label={t("remote.teacher.halaqa")}>
              <select
                value={hid}
                onChange={(e) => {
                  setHalaqa(e.target.value);
                  setPicked(new Set());
                }}
                className="w-full min-h-11 rounded-xl glass px-3 text-sm"
              >
                {halaqat.data?.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex gap-2" role="radiogroup" aria-label={t("remote.teacher.kind")}>
            {(["review", "memorize"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`flex-1 min-h-11 rounded-xl text-xs font-bold ${kind === k ? "bg-primary text-primary-foreground" : "glass"}`}
              >
                {t(`remote.kind.${k}`)}
              </button>
            ))}
          </div>
          <Field label={t("remote.teacher.surah")}>
            <select
              value={surahNo}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSurahNo(n);
                setFrom(1);
                setTo(Math.min(10, SURAHS[n - 1].ayahs));
              }}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            >
              {SURAHS.map((s) => (
                <option key={s.n} value={s.n}>
                  {s.n}. {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("remote.teacher.from")}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={surah.ayahs}
                value={from}
                onChange={(e) => setFrom(num(e.target.value, 1))}
                className="w-full min-h-11 rounded-xl glass px-3 text-sm"
              />
            </Field>
            <Field label={t("remote.teacher.to", { max: surah.ayahs })}>
              <input
                type="number"
                inputMode="numeric"
                min={from}
                max={surah.ayahs}
                value={to}
                onChange={(e) => setTo(num(e.target.value, from))}
                className="w-full min-h-11 rounded-xl glass px-3 text-sm"
              />
            </Field>
          </div>
          <Field label={t("remote.teacher.instructions")}>
            <input
              value={instructions}
              maxLength={500}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          <Field label={t("remote.teacher.dueOptional")}>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          {members_.length > 0 && (
            <>
              <label className="flex items-center gap-2 min-h-11 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={picked.size === members_.length}
                  onChange={(e) =>
                    setPicked(e.target.checked ? new Set(members_.map((m) => m.id)) : new Set())
                  }
                  className="w-5 h-5 accent-primary"
                />
                {t("remote.teacher.allStudents", { n: members_.length })}
              </label>
              <ul className="space-y-1 max-h-56 overflow-y-auto">
                {members_.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 min-h-11 text-xs">
                      <input
                        type="checkbox"
                        checked={picked.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          setPicked(next);
                        }}
                        className="w-5 h-5 accent-primary"
                      />
                      {m.name || "—"}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ReviewSheet({
  item,
  onClose,
  onDone,
}: {
  item: RemoteItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  // مفتاح لكل تسجيل: الأخطاء والدرجة تبدأ فارغة عند فتح تسجيل آخر.
  return item ? <ReviewBody key={item.id} item={item} onClose={onClose} onDone={onDone} /> : null;
}

function ReviewBody({
  item,
  onClose,
  onDone,
}: {
  item: RemoteItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const audio = useQuery({
    queryKey: ["remote-audio", item.audio_path],
    enabled: !!item.audio_path,
    queryFn: () => remoteAudioUrl(item.audio_path!),
    staleTime: 30 * 60_000,
  });
  const ayahs = Array.from(
    { length: item.to_ayah - item.from_ayah + 1 },
    (_, i) => item.from_ayah + i,
  );
  const counts = mistakeCounts(mistakes);
  const g = grade ?? suggestGrade(mistakes.length, ayahs.length);
  const save = async () => {
    setBusy(true);
    try {
      await reviewRemote(item.id, g, mistakes, note.trim() || null);
      toast.success(t("remote.teacher.reviewed"));
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("remote.err.save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={item.student_name ?? ""}
        description={t("remote.passage", {
          surah: item.surah_name,
          from: item.from_ayah,
          to: item.to_ayah,
        })}
        defaultExpanded
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("remote.teacher.saveReview", { g })}
          </button>
        }
      >
        <div className="space-y-3">
          {audio.data ? (
            <audio controls src={audio.data} className="w-full" preload="metadata" />
          ) : audio.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" aria-hidden="true" />
          ) : (
            <p className="text-xs text-destructive">{t("remote.err.audio")}</p>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">{t("remote.teacher.gridHint")}</p>
          <div className="flex flex-wrap gap-1.5 text-[0.625rem]" aria-hidden="true">
            {MISTAKE_TYPES.map((k) => (
              <span key={k} className={`px-2 py-0.5 rounded-full ${TONE[k]}`}>
                {t(`remote.mistake.${k}`)} {counts[k] > 0 ? counts[k] : ""}
              </span>
            ))}
          </div>
          <div
            className="grid grid-cols-6 gap-1.5"
            role="group"
            aria-label={t("remote.teacher.grid")}
          >
            {ayahs.map((n) => {
              const m = mistakes.find((x) => x.ayah === n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMistakes((l) => cycleMistake(l, n))}
                  aria-label={
                    m
                      ? t("remote.teacher.ayahWith", { n, type: t(`remote.mistake.${m.type}`) })
                      : t("remote.teacher.ayah", { n })
                  }
                  className={`min-h-11 rounded-xl text-xs font-bold tabular-nums ${m ? TONE[m.type] : "glass"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {t("remote.teacher.gradeLabel")}
          </p>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-label={t("remote.teacher.gradeLabel")}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={g === n}
                onClick={() => setGrade(n)}
                className={`flex-1 min-h-11 rounded-xl text-sm font-black ${g === n ? "bg-primary text-primary-foreground" : "glass"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <Field label={t("remote.teacher.note")}>
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
        </div>
      </SheetContent>
    </Sheet>
  );
}
