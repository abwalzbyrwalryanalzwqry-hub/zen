import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  markRoomRead,
  roomErrorMessage,
  roomInfo,
  roomMessages,
  roomReadStats,
  type RoomInfo,
  type RoomMessage,
  type RoomReadStats,
} from "@/lib/rooms";

/**
 * بيانات غرفة مفتوحة: معلوماتها ورسائلها (الأحدث + الأقدم المحمّلة يدوياً) وإحصاء القراءة للمشرف،
 * مع قناة لحظية مرشَّحة بمعرّف الغرفة. فُصل من صفحة الغرفة (M5) دون تغيير في السلوك.
 */
export function useRoomFeed(
  roomId: string,
  scrollRef: RefObject<HTMLDivElement | null>,
  onError: (msg: string) => void,
) {
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [latest, setLatest] = useState<RoomMessage[]>([]);
  const [readStats, setReadStats] = useState<RoomReadStats | null>(null);
  // الرسائل الأقدم المحمّلة يدوياً تبقى عند تحديث الصفحة الأحدث (البند R2).
  const [older, setOlder] = useState<RoomMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messages = useMemo(() => {
    const ids = new Set(latest.map((m) => m.id));
    return [...older.filter((m) => !ids.has(m.id)), ...latest];
  }, [older, latest]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  // سلسلة وعود لا async: كل setState داخل ردّ النداء، فيصحّ استدعاؤها من الأثر مباشرة (M12).
  const refresh = useCallback(
    () =>
      Promise.all([roomInfo(roomId), roomMessages(roomId)])
        .then(([i, m]) => {
          setInfo(i);
          setLatest(m);
          if (i.role === "mod" && i.kind === "announcements")
            roomReadStats(roomId)
              .then(setReadStats)
              .catch(() => undefined);
          setHasOlder((h) => h || m.length >= 50);
          markRoomRead(roomId).catch(() => undefined);
        })
        .catch(() => setDenied(true))
        .finally(() => setLoading(false)),
    [roomId],
  );

  // غرفة أخرى في المكوّن نفسه (تغيّر المعامل): تحميل من جديد — أثناء العرض لا في الأثر (M12).
  const [feedFor, setFeedFor] = useState(roomId);
  if (feedFor !== roomId) {
    setFeedFor(roomId);
    setLoading(true);
    setDenied(false);
  }

  useEffect(() => {
    refresh();
    // سياسة القراءة (can_read_room) تسري على البث، فلا يصل إلا ما يحق للمستخدم رؤيته.
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prev = el?.scrollHeight ?? 0;
    try {
      const page = await roomMessages(roomId, first.created_at);
      setHasOlder(page.length >= 50);
      setOlder((o) => [...page, ...o]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prev;
      });
    } catch (e) {
      onError(roomErrorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  };

  return {
    info,
    latest,
    messages,
    readStats,
    hasOlder,
    loadingOlder,
    loading,
    denied,
    refresh,
    loadOlder,
  };
}
