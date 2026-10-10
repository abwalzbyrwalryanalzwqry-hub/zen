/**
 * تلميحات الاستعمال الأول (1.19.0، المرحلة 3): سطر واحد يشرح إيماءة لا تُكتشف وحدها (سحب بطاقة الطالب، وشبكة
 * الآيات، ومصمّم الشهادة). يظهر حتى يُغلقه المستخدم ثم لا يعود.
 *
 * 1.21.1: لكل حساب لا لكل جهاز — المفتاح `zen-tips-seen:<userId>`، فحسابان على جهاز واحد (معلّم وابنه) لكلٍّ
 * تلميحاته، وما أُغلق يُحفظ أيضاً في بيانات الحساب (`user_metadata.tips_seen`، أفضل جهد) فلا يعود على جهاز آخر.
 * دون حساب (الضيف) يبقى المفتاح القديم `zen-tips-seen`.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export type TipId = "swipe" | "ayahGrid" | "designer";
export const TIPS_KEY = "zen-tips-seen";
export const tipsKey = (userId?: string | null) => (userId ? `${TIPS_KEY}:${userId}` : TIPS_KEY);

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function seenTips(userId?: string | null, remote?: unknown): Set<string> {
  let local: string[] = [];
  try {
    local = asList(JSON.parse(localStorage.getItem(tipsKey(userId)) ?? "[]"));
  } catch {
    /* تالف أو غير متاح */
  }
  return new Set([...local, ...asList(remote)]);
}

export function markTipSeen(id: TipId, userId?: string | null, remote?: unknown): Set<string> {
  const s = seenTips(userId, remote);
  s.add(id);
  try {
    localStorage.setItem(tipsKey(userId), JSON.stringify([...s]));
  } catch {
    /* التخزين غير متاح */
  }
  return s;
}

/** يحفظ القائمة في بيانات الحساب إن تغيّرت؛ دون اتصال أو عند الخطأ تبقى النسخة المحلية وحدها. */
async function syncRemote(seen: Set<string>, remote: unknown): Promise<void> {
  const before = new Set(asList(remote));
  if ([...seen].every((x) => before.has(x))) return;
  try {
    await supabase.auth.updateUser({ data: { tips_seen: [...seen] } });
  } catch {
    /* أفضل جهد */
  }
}

/** [ظاهر؟، إغلاق]. */
export function useFirstUseTip(id: TipId): [boolean, () => void] {
  const { session, guest } = useSession();
  const userId = guest ? null : (session?.user.id ?? null);
  const remote = session?.user.user_metadata?.tips_seen;
  const [dismissed, setDismissed] = useState(false);
  const show = !dismissed && !seenTips(userId, remote).has(id);
  return [
    show,
    () => {
      const s = markTipSeen(id, userId, remote);
      setDismissed(true);
      if (userId) void syncRemote(s, remote);
    },
  ];
}
