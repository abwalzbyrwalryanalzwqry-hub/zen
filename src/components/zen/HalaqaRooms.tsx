import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { useNow } from "@/hooks/useNow";
import { useEffect, useState } from "react";
import { Megaphone, MessagesSquare } from "lucide-react";
import { timeAgo } from "@/lib/zen-api";
import { subscribeLive } from "@/lib/realtime-hub";
import { useSession } from "@/hooks/useSession";
import { myRooms, roomTitle, sortRooms, type RoomSummary } from "@/lib/rooms";

/** قسم «حلقاتي» أعلى قائمة المحادثات: إعلانات الحلقات ونقاشاتها. */
/** `unreadOnly`: مرشّح «غير مقروءة» في قائمة المحادثات. */
export function HalaqaRooms({ unreadOnly = false }: { unreadOnly?: boolean } = {}) {
  const t = useT();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const { userId } = useSession();
  useNow(); // «منذ…» تتحدّث كل دقيقة

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      myRooms()
        .then((r) => !cancelled && setRooms(sortRooms(r)))
        .catch(() => undefined);
    void load();
    // تحديث لحظي لآخر رسالة وغير المقروء (البند R4). سياسة القراءة تسري على البث.
    let t: ReturnType<typeof setTimeout> | undefined;
    // من المحور المشترك بمرشّح غرفي فقط (M6)، لا من جدول room_messages كله.
    const off = userId
      ? subscribeLive(userId, (e) => {
          if (e.kind !== "room_message") return;
          clearTimeout(t);
          t = setTimeout(load, 400);
        })
      : () => undefined;
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      off();
    };
  }, [userId]);

  const shown = unreadOnly ? rooms.filter((r) => r.unread > 0) : rooms;
  if (shown.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="px-2 text-[0.6875rem] text-muted-foreground mb-1">{t("rooms.title")}</p>
      {shown.map((r) => {
        const Icon = r.kind === "announcements" ? Megaphone : MessagesSquare;
        return (
          <Link
            key={r.room_id}
            to="/rooms/$roomId"
            params={{ roomId: r.room_id }}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-accent/60 transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white shrink-0">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline gap-2">
                <p
                  className={`text-sm truncate ${r.unread > 0 ? "font-black" : "font-medium"} text-foreground`}
                >
                  {roomTitle(r)}
                </p>
                {r.last_at && (
                  <span className="text-[0.625rem] text-muted-foreground shrink-0">
                    {timeAgo(r.last_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-xs truncate text-muted-foreground">
                  {r.last_message ??
                    (r.kind === "announcements" ? t("rooms.noAnn") : t("rooms.noMsg"))}
                </p>
                {r.unread > 0 && (
                  <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[0.625rem] font-bold flex items-center justify-center">
                    {r.unread > 99 ? "99+" : r.unread}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
      <div className="mt-2 border-t border-border/40" />
    </div>
  );
}
