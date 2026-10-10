import { useCallback, useEffect, useState } from "react";
import { Loader2, Medal, Trophy, X } from "lucide-react";
import {
  decideCertificate,
  getHonorBoard,
  juzOrdinal,
  myPendingCertificates,
  setHonorBoard,
  type HonorBoard,
  type PendingCertificate,
} from "@/lib/achievements";
import { errText } from "@/components/zen/achievements/err";

/** شهادات بانتظار اعتماد المعلّم. */
export function PendingCertificatesCard() {
  const [items, setItems] = useState<PendingCertificate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    myPendingCertificates()
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  if (items.length === 0) return null;
  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    setErr(null);
    try {
      await decideCertificate(id, approve);
      await load();
    } catch (e) {
      setErr(errText(e, "تعذّر الحفظ"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="glass-strong rounded-3xl p-4">
      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Trophy className="w-4 h-4 text-primary" /> شهادات بانتظار اعتمادك
      </p>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="glass rounded-2xl px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{c.student_name}</p>
              <p className="text-[0.625rem] text-muted-foreground">
                أتمّ الجزء {juzOrdinal(c.juz)}
                {c.halaqa_name ? ` · ${c.halaqa_name}` : ""}
              </p>
            </div>
            {busy === c.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <>
                <button
                  onClick={() => decide(c.id, true)}
                  className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[0.6875rem] font-bold"
                >
                  اعتماد
                </button>
                <button
                  onClick={() => decide(c.id, false)}
                  className="h-8 w-8 rounded-xl glass flex items-center justify-center"
                  aria-label="عدم الاعتماد"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {err && <p className="text-[0.6875rem] text-destructive mt-2">{err}</p>}
    </div>
  );
}

// ─────────────────────── لوحة الشرف والتحديات ───────────────────────

export function HonorBoardCard({ halaqaId }: { halaqaId: string }) {
  const [b, setB] = useState<HonorBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(
    () =>
      getHonorBoard(halaqaId)
        .then(setB)
        .catch((e) => setErr(errText(e, "تعذّر التحميل"))),
    [halaqaId],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (err) return <p className="text-[0.6875rem] text-destructive">{err}</p>;
  if (!b || (!b.enabled && !b.can_manage)) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      await setHonorBoard(halaqaId, !b.enabled);
      await load();
    } catch (e) {
      setErr(errText(e, "تعذّر الحفظ"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Medal className="w-4 h-4 text-primary" /> لوحة الشرف
        </p>
        {b.can_manage && (
          <button
            onClick={toggle}
            disabled={busy}
            className="text-[0.6875rem] font-bold text-primary"
            aria-pressed={b.enabled}
          >
            {busy ? "…" : b.enabled ? "إيقاف" : "تفعيل"}
          </button>
        )}
      </div>
      {!b.enabled ? (
        <p className="text-[0.6875rem] text-muted-foreground">
          تعرض أيام الالتزام وعدد الأوسمة لكل طالب في آخر 30 يوماً، بلا درجات ولا نسب حضور.
        </p>
      ) : b.rows.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground">لا نشاط مسجّل في آخر 30 يوماً.</p>
      ) : (
        <ol className="space-y-1">
          {b.rows.map((r, i) => (
            <li
              key={r.student_id}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-[0.6875rem] ${
                r.is_me ? "bg-primary/10" : ""
              }`}
            >
              <span className="w-5 text-center font-black text-primary">{i + 1}</span>
              <span className="flex-1 truncate font-bold text-foreground">{r.name}</span>
              <span className="text-muted-foreground">{r.active_30} يوماً</span>
              {r.badges > 0 && <span className="text-muted-foreground">· {r.badges} وسام</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
