import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import {
  cancelScheduledRoomMessage,
  defaultScheduleValue,
  roomErrorMessage,
  scheduleRoomMessage,
  scheduleTimeError,
  scheduledRoomMessages,
  validateRoomMessage,
  type ScheduledRoomMessage,
} from "@/lib/rooms";
import { intlLocale, t as tr } from "@/lib/i18n";

const STATUS: Record<ScheduledRoomMessage["status"], string> = {
  pending: "مجدولة",
  sent: "أُرسلت",
  cancelled: "أُلغيت",
  failed: "تعذّر الإرسال",
};

/** جدولة رسالة الغرفة (9.5): النص من خانة الكتابة، والوقت بتوقيت الجهاز، وقائمة المجدول مع الإلغاء. */
export function ScheduleSheet(props: {
  roomId: string;
  draft: string;
  onScheduled: () => void;
  onClose: () => void;
}) {
  const [when, setWhen] = useState(() => defaultScheduleValue());
  const [rows, setRows] = useState<ScheduledRoomMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(() => {
    scheduledRoomMessages(props.roomId)
      .then(setRows)
      .catch((e) => setError(roomErrorMessage(e)));
  }, [props.roomId]);
  useEffect(load, [load]);

  const submit = async () => {
    const problem = validateRoomMessage(props.draft) ?? scheduleTimeError(when);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await scheduleRoomMessage(props.roomId, props.draft, new Date(when));
      setOk(
        tr("rooms.scheduledOk", {
          time: new Date(when).toLocaleString(intlLocale(), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        }),
      );
      props.onScheduled();
      load();
    } catch (e) {
      setError(roomErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/40 flex items-end" onClick={props.onClose}>
      <div
        role="dialog"
        aria-label="جدولة رسالة"
        className="glass-strong w-full rounded-t-3xl p-5 max-h-[75%] overflow-y-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">جدولة رسالة</h2>
          <button onClick={props.onClose} aria-label="إغلاق" className="p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        {props.draft.trim() ? (
          <p className="rounded-2xl bg-background/70 p-3 text-xs whitespace-pre-wrap">
            {props.draft.trim()}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            اكتب الرسالة في خانة الكتابة أولاً ثم اجدولها.
          </p>
        )}
        <label className="block text-xs font-bold">
          وقت الإرسال (بتوقيت جهازك)
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 w-full rounded-2xl bg-background/70 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-[0.625rem] text-muted-foreground">
          تُرسل خلال 5 دقائق من الوقت المحدّد، باسمك.
        </p>
        <button
          onClick={() => void submit()}
          disabled={busy || !props.draft.trim()}
          className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CalendarClock className="w-4 h-4" />
          )}{" "}
          جدولة
        </button>
        {error && (
          <p role="alert" className="text-xs text-destructive text-center">
            {error}
          </p>
        )}
        {ok && (
          <p role="status" className="text-xs text-primary text-center">
            {ok}
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="space-y-1.5" aria-label="الرسائل المجدولة">
            {rows.map((r) => (
              <li key={r.id} className="glass rounded-2xl p-2.5 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[0.625rem] text-muted-foreground">
                    {new Date(r.scheduled_at).toLocaleString(intlLocale(), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {STATUS[r.status]}
                  </span>
                  {r.status === "pending" && (
                    <button
                      onClick={() =>
                        void cancelScheduledRoomMessage(r.id)
                          .then(load)
                          .catch((e) => setError(roomErrorMessage(e)))
                      }
                      className="text-destructive text-[0.625rem] font-bold"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
                <p className="line-clamp-2">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
