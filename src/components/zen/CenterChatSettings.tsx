import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { myManagedCenters } from "@/lib/center";
import { getCenterStudentDm, setCenterStudentDm } from "@/lib/chat-safety";

/**
 * إعداد المركز لمحادثات الطلاب الخاصة (القرار 1 في docs/CHAT_AI_ROADMAP.md).
 * يظهر لمنشئ المركز ومديريه فقط، والخادم يتحقق من الصلاحية (set_center_chat_settings).
 */
export function CenterChatSettings({ centerId }: { centerId: string }) {
  const [canManage, setCanManage] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const centers = await myManagedCenters().catch(() => []);
      const me = centers.find((c) => c.center_id === centerId);
      const ok = me?.role === "owner" || me?.role === "manager";
      if (!alive) return;
      setCanManage(ok);
      if (ok) setEnabled(await getCenterStudentDm(centerId));
    })();
    return () => {
      alive = false;
    };
  }, [centerId]);

  if (!canManage) return null;

  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setCenterStudentDm(centerId, !enabled);
      setEnabled(!enabled);
    } catch {
      setErr("تعذّر حفظ الإعداد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-strong rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <MessagesSquare className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground flex-1">محادثات الطلاب فيما بينهم</p>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="السماح بمحادثات الطلاب الخاصة"
          onClick={() => void toggle()}
          disabled={busy}
          className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${enabled ? "right-0.5" : "right-[1.375rem]"}`}
          />
        </button>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
        {enabled
          ? "مسموحة بين طلاب الحلقة الواحدة. يطّلع معلّم الحلقة عليها دائماً، ويُمنع تبادل الأرقام والروابط."
          : "ممنوعة (الافتراضي). يراسل الطالب معلّمه فقط، وتبقى المحادثات السابقة للقراءة."}
      </p>
      {err && <p className="text-[0.6875rem] text-destructive">{err}</p>}
    </div>
  );
}
