/**
 * بيانات الحساب (المرحلة 9): تصدير نسخة من بيانات صاحب الحساب، وحذف الحساب نهائياً.
 * متطلّب Google Play لكل تطبيق فيه تسجيل دخول، ولائحة حماية البيانات.
 */
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { saveFile } from "@/lib/native-file";
import { localDayKey } from "@/lib/local-day";
import { signOutEverywhere } from "@/lib/auth/sign-out";
import { RECENT_ACCOUNTS_KEY, otherAccounts } from "@/lib/recent-accounts";

/** العبارة التي يكتبها صاحب الحساب لتأكيد الحذف (تتحقّق منها قاعدة البيانات أيضاً). */
export const DELETE_CONFIRM_PHRASE = "احذف حسابي";

export function cleanDbError(message: string): string {
  return message.replace(/^.*?:\s*/, "").trim() || "تعذّرت العملية.";
}

/** اسم ملف التصدير: zen-export-YYYY-MM-DD.json */
export function exportFileName(now = new Date()): string {
  return `zen-export-${localDayKey(now)}.json`;
}

export async function fetchMyData(): Promise<unknown> {
  const { data, error } = await rpc("export_my_data");
  if (error) throw new Error(cleanDbError(error.message));
  return data;
}

/** يحفظ نسخة JSON من بيانات صاحب الحساب (مربع المشاركة في تطبيق Android). */
export async function downloadMyData(): Promise<void> {
  const data = await fetchMyData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  await saveFile(exportFileName(), blob, { title: "بياناتي في زِن" });
}

/** يجمع مسارات الملفات لكل حاوية كي تُحذف دفعات عبر واجهة التخزين. */
export function groupByBucket(rows: { bucket_id: string; name: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.bucket_id) ?? [];
    list.push(r.name);
    out.set(r.bucket_id, list);
  }
  return out;
}

/**
 * يحذف الحساب نهائياً. الترتيب (SEC-04):
 *  1. delete_my_account_check: الفحوص نفسها دون حذف، فلا تُمسّ الملفات إن كان الحذف سيُرفض.
 *  2. الملفات الصوتية والمرفقات (Supabase لا يسمح بحذفها من SQL).
 *  3. كل بيانات الحساب في قاعدة البيانات.
 *  4. تنظيف الجهاز: الجلسة ورمز الإشعارات والذاكرة ومفاتيح «zen-».
 */
export async function deleteMyAccount(confirm: string): Promise<void> {
  if (confirm.trim() !== DELETE_CONFIRM_PHRASE) {
    throw new Error(`اكتب «${DELETE_CONFIRM_PHRASE}» للتأكيد.`);
  }
  const { error: checkErr } = await rpc("delete_my_account_check", { _confirm: confirm.trim() });
  if (checkErr) throw new Error(cleanDbError(checkErr.message));
  const me = (await supabase.auth.getSession()).data.session?.user.id ?? null;
  // الحسابات الأخرى على الجهاز (GAP-09) تبقى بعد مسح مفاتيح «zen-»، ويُحذف مدخل هذا الحساب وحده.
  const keepRecent = otherAccounts(me);
  const { data: files, error: filesErr } = await rpc("my_storage_objects");
  if (filesErr) throw new Error(cleanDbError(filesErr.message));
  for (const [bucket, names] of groupByBucket(files ?? [])) {
    for (let i = 0; i < names.length; i += 100) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove(names.slice(i, i + 100));
      if (rmErr) throw new Error(cleanDbError(rmErr.message));
    }
  }
  const { error } = await rpc("delete_my_account", { _confirm: confirm.trim() });
  if (error) throw new Error(cleanDbError(error.message));
  await signOutEverywhere();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("zen-")) localStorage.removeItem(k);
    if (keepRecent.length) localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(keepRecent));
  } catch {
    /* تجاهل */
  }
}
