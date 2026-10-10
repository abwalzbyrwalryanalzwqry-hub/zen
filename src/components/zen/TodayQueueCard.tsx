import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Circle, ClipboardList, Loader2, RotateCcw, Target } from "lucide-react";
import {
  fetchTodayQueue,
  formatMinutes,
  itemSurah,
  itemTitle,
  queueProgress,
  type QueueItem,
} from "@/lib/today-queue";
import { markMastered } from "@/lib/quran/memorize-api";
import { sendErrorsToReview } from "@/lib/exam/storage";
import { logWird } from "@/lib/achievements";

const ICON = { assignment: ClipboardList, review: RotateCcw, exam_error: Target, wird: BookOpen };

/**
 * طابور اليوم (8.2) أعلى شاشة اليوم: بند لكل ما على الطالب مع زمنه، ويُشطب البند عند إنجازه.
 * مع `studentId` تصبح نسخة قراءة لولي الأمر بلا أزرار.
 */
export function TodayQueueCard({
  userId,
  studentId,
  onAssignment,
}: {
  userId: string;
  studentId?: string;
  onAssignment?: (id: string) => void;
}) {
  const readOnly = !!studentId;
  const qc = useQueryClient();
  const key = ["today-queue", studentId ?? userId];
  const query = useQuery({
    queryKey: key,
    staleTime: 30_000,
    queryFn: () => fetchTodayQueue(studentId),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (i: QueueItem, fn: () => Promise<unknown>) => {
    setBusy(i.id);
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ.");
    } finally {
      setBusy(null);
    }
  };

  if (query.isPending)
    return (
      <div className="glass rounded-3xl p-4 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      </div>
    );
  if (query.isError || !query.data) return null;
  const q = query.data;
  const p = queueProgress(q);

  return (
    <section aria-label="طابور اليوم" className="glass rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black">{readOnly ? "طابور اليوم لابنك" : "طابور اليوم"}</h2>
        <span className="text-[0.6875rem] text-muted-foreground" aria-live="polite">
          {p.done}/{p.total} ·{" "}
          {p.minutesLeft ? `بقي ${formatMinutes(p.minutesLeft)}` : "أنجزت كل شيء"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-primary"
          style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }}
        />
      </div>
      <ul className="space-y-2">
        {q.items.map((i) => {
          const Icon = ICON[i.kind];
          const surah = itemSurah(i);
          return (
            <li
              key={`${i.kind}:${i.id}`}
              data-kind={i.kind}
              data-done={i.done || undefined}
              className="flex items-center gap-2"
            >
              {i.done ? (
                <Check className="w-4 h-4 text-primary shrink-0" aria-label="منجز" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              <Icon className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-bold truncate ${i.done ? "line-through text-muted-foreground" : ""}`}
                >
                  {itemTitle(i)}
                </p>
                <p className="text-[0.625rem] text-muted-foreground">~{formatMinutes(i.minutes)}</p>
              </div>
              {!readOnly && !i.done && busy === i.id && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {!readOnly && !i.done && busy !== i.id && (
                <div className="flex gap-1 shrink-0">
                  {i.kind === "assignment" && onAssignment && (
                    <button
                      onClick={() => onAssignment(i.id)}
                      className="rounded-full px-2.5 py-1 text-[0.625rem] bg-primary text-primary-foreground font-semibold"
                    >
                      سمّع
                    </button>
                  )}
                  {(i.kind === "review" || i.kind === "exam_error") && surah && (
                    <Link
                      to="/mushaf/memorize"
                      search={{ surah, from: i.from_ayah ?? 1, to: i.to_ayah }}
                      className="rounded-full px-2.5 py-1 text-[0.625rem] glass font-semibold"
                    >
                      احفظ
                    </Link>
                  )}
                  {i.kind === "review" && surah && (
                    <button
                      onClick={() =>
                        void act(i, () =>
                          markMastered(userId, surah, i.from_ayah!, i.to_ayah!, i.surah_name),
                        )
                      }
                      className="rounded-full px-2.5 py-1 text-[0.625rem] bg-primary text-primary-foreground font-semibold"
                    >
                      راجعتها
                    </button>
                  )}
                  {i.kind === "exam_error" && i.result_id && (
                    <button
                      onClick={() => void act(i, () => sendErrorsToReview(i.result_id!))}
                      className="rounded-full px-2.5 py-1 text-[0.625rem] bg-primary text-primary-foreground font-semibold"
                    >
                      إلى المراجعة
                    </button>
                  )}
                  {i.kind === "wird" && (
                    <button
                      onClick={() => void act(i, () => logWird(userId, q.day, null))}
                      className="rounded-full px-2.5 py-1 text-[0.625rem] bg-primary text-primary-foreground font-semibold"
                    >
                      قرأت وردي
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && (
        <p role="alert" className="text-[0.6875rem] text-destructive">
          {err}
        </p>
      )}
    </section>
  );
}
