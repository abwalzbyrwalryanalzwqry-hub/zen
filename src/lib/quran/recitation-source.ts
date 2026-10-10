// مصدر ملف الآية: المحمّل على الجهاز أولاً ثم البث (من محرّك التلاوة).
import { ayahAudioUrl, type Reciter } from "./recitations";
import { localAyahSrc, markPlayed } from "./recitation-offline";

/** مقاطعة التشغيل بتحميل مصدر جديد ليست خطأً حقيقياً. */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function resolveSrc(
  reciter: Reciter,
  surah: number,
  ayah: number,
): { src: string; offline: boolean } {
  const local = localAyahSrc(reciter.folder, surah, ayah);
  if (local) {
    markPlayed(reciter.folder, surah);
    return { src: local, offline: true };
  }
  return { src: ayahAudioUrl(reciter, surah, ayah), offline: false };
}
