#!/usr/bin/env node
// يتحقق أن نسخ دوال Edge في supabase/functions/_shared مطابقة حرفياً لأصولها في src (المرحلة 6.2).
// الأصل هو المرجع دائماً: عدّله ثم شغّل `node scripts/check-shared-mirror.mjs --write`.
import { copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIRRORS = [
  ["src/lib/ai-core.ts", "supabase/functions/_shared/ai-core.ts"],
  ["src/lib/ai-refs-core.ts", "supabase/functions/_shared/ai-refs-core.ts"],
  ["src/lib/ai-provider-core.ts", "supabase/functions/_shared/ai-provider-core.ts"],
  ["src/lib/recitation-core.ts", "supabase/functions/_shared/recitation-core.ts"],
  ["src/lib/tools-core.ts", "supabase/functions/_shared/tools-core.ts"],
  ["src/lib/push-core.ts", "supabase/functions/_shared/push-core.ts"],
  ["src/lib/fcm.server.ts", "supabase/functions/_shared/fcm.server.ts"],
  ["src/lib/tajweed-diff.ts", "supabase/functions/_shared/tajweed-diff.ts"],
  ["src/lib/quran-meta.ts", "supabase/functions/_shared/quran-meta.ts"],
  ["src/lib/edge-http.ts", "supabase/functions/_shared/edge-http.ts"],
  ["src/lib/maintenance-core.ts", "supabase/functions/_shared/maintenance-core.ts"],
  ["src/lib/ai-access.ts", "supabase/functions/_shared/ai-access.ts"],
  ["src/data/quran-uthmani.json", "supabase/functions/_shared/quran-uthmani.json"],
  ["src/data/quran-integrity.json", "supabase/functions/_shared/quran-integrity.json"],
];

// التشغيل المباشر فقط؛ الاستيراد (من الاختبارات) يأخذ القائمة دون فحص.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = process.argv.includes("--write");
  const stale = [];
  for (const [src, copy] of MIRRORS) {
    const a = readFileSync(join(ROOT, src));
    let b = null;
    try {
      b = readFileSync(join(ROOT, copy));
    } catch {
      /* غير موجودة */
    }
    if (b && a.equals(b)) continue;
    if (write) copyFileSync(join(ROOT, src), join(ROOT, copy));
    else stale.push(`${copy} ≠ ${src}`);
  }
  if (stale.length) {
    console.error(
      `نسخ Edge غير مطابقة. شغّل: node scripts/check-shared-mirror.mjs --write\n- ${stale.join("\n- ")}`,
    );
    process.exit(1);
  }
  console.log(write ? "نُسخت ملفات Edge المشتركة." : `نسخ Edge مطابقة (${MIRRORS.length}).`);
}
