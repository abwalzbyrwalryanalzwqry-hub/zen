import { memo, useRef, useState, type PointerEvent } from "react";
import { BookOpen, Check, CloudOff, MessageSquareText, Star } from "lucide-react";
import { useT } from "@/lib/i18n";
import { colorFor, initialOf } from "@/lib/zen-api";
import type { DayStudent, AttendanceStatus } from "@/lib/daily-record";
import { segmentsText } from "@/lib/daily-record-text";
import { AttendanceControl } from "./attendance-ui";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/** مسافة السحب الأفقي التي تسجّل الغياب أو الاستئذان، وزمن الضغط المطوّل للتحديد. */
const SWIPE_PX = 72;
const LONG_PRESS_MS = 480;

function Avatar({ id, name, avatar }: { id: string; name: string; avatar: string | null }) {
  const url = avatar && /^https?:\/\//.test(avatar) ? avatar : null;
  return (
    <div
      aria-hidden="true"
      className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${colorFor(id)} text-white text-sm font-black flex items-center justify-center overflow-hidden`}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initialOf(name)}
    </div>
  );
}

/**
 * صف طالب مضغوط في السجل اليومي (1.14.0، نحو 64px بدل بطاقة من 5 أسطر): الصورة والاسم وسطر واحد (إنجاز اليوم،
 * أو آخر حفظ، أو سبب الغياب)، والحضور بلمسة في الطرف. لمس الاسم يفتح نصف شاشة الطالب.
 * - السحب نحو نهاية السطر «غائب»، ونحو بدايته «مستأذن» (مع «تراجع» في الإشعار).
 * - الضغط المطوّل يبدأ التحديد المتعدد؛ وفي وضع التحديد اللمس يحدّد بدل الفتح.
 * - «لم يُرسل» على الصف ما دام له شيء في صندوق الإرسال بلا اتصال.
 */
export const StudentDayCard = memo(function StudentDayCard({
  s,
  writable,
  onAttendance,
  onOpen,
  pending = false,
  selecting = false,
  selected = false,
  onSelect,
  onSwipe,
}: {
  s: DayStudent;
  writable: boolean;
  onAttendance: (student: string, status: AttendanceStatus | null) => void;
  onOpen: (student: string) => void;
  pending?: boolean;
  selecting?: boolean;
  selected?: boolean;
  /** يبدأ التحديد بالضغط المطوّل، أو يبدّل التحديد في وضعه. */
  onSelect?: (student: string) => void;
  onSwipe?: (student: string, status: "absent" | "excused") => void;
}) {
  const t = useT();
  const [dx, setDx] = useState(0);
  const g = useRef<{ x: number; y: number; id: number; axis: "x" | "y" | null } | null>(null);
  const press = useRef<number | null>(null);
  const longFired = useRef(false);
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current);
    press.current = null;
  };
  const down = (e: PointerEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest("[data-attendance]")) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
    longFired.current = false;
    if (onSelect && !selecting)
      press.current = window.setTimeout(() => {
        longFired.current = true;
        onSelect(s.student_id);
      }, LONG_PRESS_MS);
  };
  const move = (e: PointerEvent<HTMLLIElement>) => {
    const p = g.current;
    if (!p || p.id !== e.pointerId) return;
    const mx = e.clientX - p.x;
    const my = e.clientY - p.y;
    if (!p.axis && Math.hypot(mx, my) > 8) {
      p.axis = Math.abs(mx) > Math.abs(my) * 1.5 ? "x" : "y";
      cancelPress();
      // يبقى السحب للصف حتى الرفع ولو خرج الإصبع عنه.
      if (p.axis === "x") e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (p.axis === "x" && writable && onSwipe && !selecting) setDx(mx);
  };
  const up = () => {
    cancelPress();
    const p = g.current;
    g.current = null;
    // نقرة تلي السحب (بالفأرة) لا تفتح اللوحة.
    if (p?.axis) longFired.current = true;
    if (p?.axis === "x" && Math.abs(dx) >= SWIPE_PX && onSwipe) {
      // نحو نهاية السطر (يسار في RTL) غائب، ونحو بدايته مستأذن.
      const towardEnd = rtl ? dx < 0 : dx > 0;
      onSwipe(s.student_id, towardEnd ? "absent" : "excused");
    }
    setDx(0);
  };
  const swipeTo = dx === 0 ? null : (rtl ? dx < 0 : dx > 0) ? "absent" : "excused";
  const today = [
    s.memorize && `${t("dailyRecord.card.memorizedToday")}: ${segmentsText(s.memorize.segments)}`,
    s.review && `${t("dailyRecord.card.reviewedToday")}: ${segmentsText(s.review.segments)}`,
  ].filter(Boolean) as string[];
  const away = s.status === "absent" || s.status === "excused";
  const sub = today.length
    ? today.join(" · ")
    : away && s.reason
      ? t("dailyRecord.card.reason", { reason: s.reason })
      : `${t("dailyRecord.card.lastMemorize")}: ${
          s.last_memorize ? segmentsText([s.last_memorize]) : t("dailyRecord.card.none")
        }`;
  return (
    <li
      data-student={s.student_id}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => onSelect && e.preventDefault()}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      className={`relative glass rounded-2xl ps-1.5 pe-1 py-1 flex items-center gap-1.5 touch-pan-y select-none ${
        s.member === false ? "opacity-70" : ""
      } ${selected ? "ring-2 ring-primary" : ""} ${dx ? "" : "transition-transform motion-reduce:transition-none"}`}
    >
      {swipeTo && Math.abs(dx) > 16 && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 ${dx > 0 === rtl ? "start-full ms-2" : "end-full me-2"} flex items-center text-xs font-bold whitespace-nowrap ${
            Math.abs(dx) >= SWIPE_PX ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {t(`dailyRecord.attendance.${swipeTo}`)}
        </span>
      )}
      {selecting && (
        <span
          aria-hidden="true"
          className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center ${
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}
        >
          {selected && <Check className="w-4 h-4" />}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          if (longFired.current) return void (longFired.current = false);
          if (selecting) onSelect?.(s.student_id);
          else onOpen(s.student_id);
        }}
        aria-pressed={selecting ? selected : undefined}
        aria-label={[
          t("dailyRecord.card.open", { name: s.name }),
          s.status ? t(`dailyRecord.attendance.${s.status}`) : t("dailyRecord.summary.unmarked"),
          ...today,
          s.evaluation ? t("dailyRecord.card.evaluated") : null,
          s.note ? t("dailyRecord.card.hasNote") : null,
          s.absences_30d > 0 ? t("dailyRecord.card.absences", { n: s.absences_30d }) : null,
          pending ? t("dailyRecord.card.pending") : null,
        ]
          .filter(Boolean)
          .join(t("dailyRecord.finish.listSep"))}
        className="flex-1 min-w-0 min-h-12 flex items-center gap-2 text-start rounded-xl active:scale-[0.99] transition motion-reduce:transition-none"
      >
        <Avatar id={s.student_id} name={s.name} avatar={s.avatar} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold truncate text-foreground">{s.name}</p>
            {s.member === false && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs font-bold text-muted-foreground">
                {t("dailyRecord.card.moved")}
              </span>
            )}
            {pending && <CloudOff className="w-3 h-3 shrink-0 text-gold-ink" aria-hidden="true" />}
            {s.evaluation && <Star className="w-3 h-3 shrink-0 text-gold-ink" aria-hidden="true" />}
            {s.note && (
              <MessageSquareText
                className="w-3 h-3 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {s.absences_30d >= 3 && (
              <span className="shrink-0 rounded-full bg-destructive/12 px-1.5 text-xs font-bold text-destructive tabular-nums">
                {s.absences_30d}
              </span>
            )}
          </div>
          <p
            className={`text-xs truncate ${today.length ? "text-primary font-medium" : "text-muted-foreground"}`}
          >
            {today.length > 0 && (
              <BookOpen className="inline w-3 h-3 me-0.5 align-[-2px]" aria-hidden="true" />
            )}
            {sub}
          </p>
        </div>
      </button>
      {!selecting && (
        <div data-attendance className="contents">
          <AttendanceControl
            compact
            name={s.name}
            value={s.status}
            disabled={!writable}
            onChange={(st) => onAttendance(s.student_id, st)}
          />
        </div>
      )}
    </li>
  );
});
