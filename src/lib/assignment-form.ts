/**
 * تحقق نموذج إسناد الواجب (فحص الأقسام T12). كانت السورة نصاً حراً والنطاق بلا تحقق، فيُسند واجب لسورة
 * مكتوبة خطأً أو «من 20 إلى 5» أو آيات غير موجودة، ثم يفشل فتحه في المصحف ويُربك الطالب.
 */
import { SURAHS, type SurahMeta } from "@/lib/quran-meta";

export type RangeCheck = { ok: true; surah: SurahMeta } | { ok: false; surah: SurahMeta | null };

export function surahByName(name: string): SurahMeta | null {
  return SURAHS.find((s) => s.name === name.trim()) ?? null;
}

/** صحيح إن كانت السورة معروفة و 1 ≤ من ≤ إلى ≤ عدد آياتها، والقيمتان عددان صحيحان. */
export function checkAyahRange(surahName: string, from: number, to: number): RangeCheck {
  const surah = surahByName(surahName);
  if (!surah) return { ok: false, surah: null };
  const ints = Number.isInteger(from) && Number.isInteger(to);
  if (!ints || from < 1 || to < from || to > surah.ayahs) return { ok: false, surah };
  return { ok: true, surah };
}

/** عند تغيير السورة: يبقى النطاق إن صلح، وإلا يُقصّ إلى حدود السورة الجديدة. */
export function clampRange(surah: SurahMeta, from: number, to: number): [number, number] {
  const f = Math.min(Math.max(1, Math.trunc(from) || 1), surah.ayahs);
  const t = Math.min(Math.max(f, Math.trunc(to) || f), surah.ayahs);
  return [f, t];
}
