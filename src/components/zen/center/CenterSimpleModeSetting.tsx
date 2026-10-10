import { useEffect, useState } from "react";
import { LayoutList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { myManagedCenters } from "@/lib/center";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";

/**
 * «الوضع المبسّط لمعلّمي المركز» (1.19.0): يفعّله منشئ المركز أو مديره (set_center_teacher_simple_mode)، فيصير
 * الافتراضي لكل معلّم «تلقائي» في المركز. على نمط CenterChatSettings.
 */
export function CenterSimpleModeSetting({ centerId }: { centerId: string }) {
  usePagesDict();
  const t = useT();
  const [canManage, setCanManage] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const centers = await myManagedCenters().catch(() => []);
      const me = centers.find((c) => c.center_id === centerId);
      const ok = me?.role === "owner" || me?.role === "manager";
      if (!alive || !ok) return;
      setCanManage(true);
      const { data } = await supabase
        .from("centers")
        .select("teacher_simple_mode")
        .eq("id", centerId)
        .maybeSingle();
      if (alive) setOn(data?.teacher_simple_mode === true);
    })();
    return () => {
      alive = false;
    };
  }, [centerId]);

  if (!canManage) return null;
  const toggle = async () => {
    setBusy(true);
    const { error } = await rpc("set_center_teacher_simple_mode", { _center: centerId, _on: !on });
    setBusy(false);
    if (error) return void toast.error(t("settings.display.simple.saveFailed"));
    setOn(!on);
  };
  return (
    <div className="glass-strong rounded-3xl p-4 space-y-2" data-testid="center-simple-mode">
      <div className="flex items-center gap-2">
        <LayoutList className="w-4 h-4 text-primary" aria-hidden="true" />
        <p id="center-simple" className="text-sm font-bold text-foreground flex-1">
          {t("settings.display.simple.centerTitle")}
        </p>
        <button
          role="switch"
          aria-checked={on}
          aria-labelledby="center-simple"
          onClick={() => void toggle()}
          disabled={busy}
          className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-60 ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "start-0.5" : "start-[1.375rem]"}`}
          />
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("settings.display.simple.centerHint")}
      </p>
    </div>
  );
}
