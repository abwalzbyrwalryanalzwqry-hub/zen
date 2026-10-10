// ============================================================
// زِن — تصدير ملف نصي (JSON) من تطبيق Android
// ------------------------------------------------------------
// يمرّ بـ saveFile في src/lib/native-file.ts: في التطبيق يُكتب الملف
// في ذاكرة التطبيق المؤقتة ثم يُفتح مربع المشاركة ليحفظه المستخدم
// (الملفات، Drive…) أو يرسله. خارج التطبيق تنزيل عادي.
// ============================================================

import { saveFile, type SaveOutcome } from "@/lib/native-file";

export type ExportOutcome = SaveOutcome;

export async function exportTextFile(
  fileName: string,
  content: string,
  opts: { mime?: string; title?: string } = {},
): Promise<ExportOutcome> {
  const blob = new Blob([content], { type: opts.mime ?? "application/json" });
  return saveFile(fileName, blob, { title: opts.title ?? "زِن" });
}
