import { useAsync } from "@/hooks/use-async";
import { getAchievements } from "@/lib/achievements";

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function useAchievements(studentId: string | null | undefined) {
  const q = useAsync(studentId ? `achievements:${studentId}` : null, () =>
    getAchievements(studentId as string),
  );
  return {
    data: q.data ?? null,
    err: q.error ? errText(q.error, "تعذّر تحميل الإنجازات") : null,
    reload: q.reload,
  };
}
