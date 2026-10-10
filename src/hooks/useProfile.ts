import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { cleanDbError } from "@/lib/account";
import { getProfile, type Profile } from "@/lib/zen-api";

/**
 * ملف صاحب الحساب من مصدر واحد (BUG-02): «المزيد» وصفحة الحساب والحفظ تقرأ وتُبطل المفتاح نفسه،
 * فلا تبقى بطاقة «المزيد» على الاسم القديم بعد تعديله.
 */
export const profileKey = (id: string | null | undefined) => ["profile", id ?? null] as const;

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 60;

export function useProfile() {
  const { userId, guest } = useSession();
  return useQuery({
    queryKey: profileKey(userId),
    enabled: !guest && !!userId,
    staleTime: 5 * 60_000,
    queryFn: () => getProfile(userId!),
  });
}

/** يحفظ الاسم ويرمي عند رفض الخادم (BUG-01): `update` في supabase-js لا يرمي، فيُفحص `error`. */
export async function renameProfile(userId: string, name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < PROFILE_NAME_MIN || clean.length > PROFILE_NAME_MAX) {
    throw new Error("INVALID_NAME");
  }
  const { error } = await supabase.from("profiles").update({ name: clean }).eq("id", userId);
  if (error) throw new Error(cleanDbError(error.message));
  return clean;
}

export function useRenameProfile() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameProfile(userId!, name),
    onSuccess: (clean) => {
      qc.setQueryData<Profile | null>(profileKey(userId), (p) => (p ? { ...p, name: clean } : p));
      void qc.invalidateQueries({ queryKey: profileKey(userId) });
    },
  });
}
