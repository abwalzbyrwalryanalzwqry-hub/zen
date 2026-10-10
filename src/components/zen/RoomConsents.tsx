import { useCallback, useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import {
  guardianRoomConsents,
  roomErrorMessage,
  setRoomConsent,
  type GuardianConsent,
} from "@/lib/rooms";

/** لولي الأمر: الموافقة على مشاركة أبنائه في نقاش حلقاتهم أو سحبها. */
export function RoomConsents() {
  const [rows, setRows] = useState<GuardianConsent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    guardianRoomConsents()
      .then(setRows)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  if (rows.length === 0) return null;

  const toggle = async (r: GuardianConsent) => {
    const key = `${r.halaqa_id}:${r.student_id}`;
    setBusy(key);
    setError(null);
    try {
      await setRoomConsent(r.halaqa_id, r.student_id, !r.consented);
      load();
    } catch (e) {
      setError(roomErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <MessagesSquare className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground">نقاش الحلقة</p>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">
        مجموعة نقاش يشرف عليها المعلّم. لا يدخلها ابنك إلا بموافقتك، ويمكنك سحبها متى شئت.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {rows.map((r) => {
        const key = `${r.halaqa_id}:${r.student_id}`;
        return (
          <label key={key} className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm">
              {r.student_name} · {r.halaqa_name}
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-primary"
              checked={r.consented}
              disabled={busy === key}
              onChange={() => void toggle(r)}
            />
          </label>
        );
      })}
    </div>
  );
}
