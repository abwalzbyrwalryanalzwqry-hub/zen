/**
 * ملفات التصدير المؤقتة (1.17.0، المرحلة 1).
 *
 * التقارير والشهائد وExcel وتصدير البيانات تُكتب في `cache/zen-export` على الجهاز ثم تُفتح ورقة المشاركة
 * (`native-file.ts`، و`ZenPrintPlugin.java` لـ PDF). لم يكن شيء يحذفها، فتتراكم عند المشرف الذي يصدر عشرات
 * الشهائد. الآن: يُحذف عند كل تشغيل ما مضى عليه أكثر من يوم (المشاركة تنتهي في دقائق)، وتعرضها شاشة
 * «التنزيلات والتخزين» مع زر حذف.
 *
 * الملف لا يُرفع إلى الخادم؛ ما يُحذف هنا نسخة محلية يمكن تصديرها مجدداً.
 */
import { isNative } from "@/lib/native-file";

export const EXPORT_DIR = "zen-export";
/** عمر الملف الذي يُحذف عند التشغيل. */
export const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ExportFile = { name: string; size: number; mtime: number };

/** ما يُحذف من القائمة: الأقدم من الحد (القرار وحده، للاختبار). */
export function staleExports(
  files: readonly ExportFile[],
  now: number,
  maxAge = EXPORT_MAX_AGE_MS,
): ExportFile[] {
  return files.filter((f) => !(f.mtime > 0) || now - f.mtime > maxAge);
}

export function exportTotals(files: readonly ExportFile[]): { count: number; bytes: number } {
  return { count: files.length, bytes: files.reduce((s, f) => s + (f.size || 0), 0) };
}

async function fs() {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, dir: Directory.Cache };
}

export async function listExports(): Promise<ExportFile[]> {
  if (!isNative()) return [];
  try {
    const { Filesystem, dir } = await fs();
    const { files } = await Filesystem.readdir({ path: EXPORT_DIR, directory: dir });
    return files
      .filter((f) => f.type === "file")
      .map((f) => ({ name: f.name, size: Number(f.size) || 0, mtime: Number(f.mtime) || 0 }));
  } catch {
    return []; // المجلد غير موجود بعد
  }
}

async function remove(names: readonly string[]): Promise<number> {
  if (!names.length) return 0;
  const { Filesystem, dir } = await fs();
  let n = 0;
  for (const name of names) {
    try {
      await Filesystem.deleteFile({ path: `${EXPORT_DIR}/${name}`, directory: dir });
      n++;
    } catch {
      /* حُذف أو مفتوح الآن */
    }
  }
  return n;
}

/** يحذف ما تجاوز يوماً. يُستدعى عند التشغيل في وقت الفراغ. */
export async function pruneExports(now = Date.now()): Promise<number> {
  const files = await listExports();
  return remove(staleExports(files, now).map((f) => f.name));
}

/** يحذف كل ملفات التصدير (من شاشة التخزين). */
export async function clearExports(): Promise<number> {
  const files = await listExports();
  return remove(files.map((f) => f.name));
}
