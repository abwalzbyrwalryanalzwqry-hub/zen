/**
 * حفظ الملفات وطباعتها داخل تطبيق Android (المرحلة 6.11).
 *
 * في WebView لا يعمل `<a download>` برابط Blob، ولا `window.open` ولا `window.print`، فكانت تقارير
 * المركز والطالب، وتصدير Excel، وتصدير بياناتي، والشهادات لا تُحفظ في التطبيق. هنا:
 * - `saveFile`: يكتب الملف في ذاكرة التطبيق المؤقتة ثم يفتح مربع المشاركة (الملفات، Drive، واتساب…).
 * - `printHtml`: يفتح مربع الطباعة الأصلي في Android (ومنه «حفظ بتنسيق PDF») عبر المكوّن `ZenPrint`
 *   في `android/app/src/main/java/app/zen/quran/ZenPrintPlugin.java`.
 * خارج التطبيق (اختبارات E2E والتطوير في المتصفح) يعود إلى التنزيل والطباعة المعتادين.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type SaveOutcome = "shared" | "downloaded" | "cancelled";

type ZenPrint = { print(opts: { html: string; name: string }): Promise<void> };
const ZenPrint = registerPlugin<ZenPrint>("ZenPrint");

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** اسم ملف آمن لنظام الملفات: بلا فواصل مسار ولا رموز ممنوعة، مع الإبقاء على العربية. */
export function safeFileName(name: string): string {
  const clean = name
    // eslint-disable-next-line no-control-regex -- محارف التحكم ممنوعة في أسماء الملفات
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s]+$/g, "")
    .slice(0, 120);
  return clean || "zen";
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** يحفظ الملف: مربع المشاركة في التطبيق، وتنزيل عادي خارجه. */
export async function saveFile(
  fileName: string,
  blob: Blob,
  opts: { title?: string } = {},
): Promise<SaveOutcome> {
  const name = safeFileName(fileName);
  const title = opts.title ?? "زِن";
  if (isNative()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const path = `zen-export/${name}`;
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: await blobToBase64(blob),
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    try {
      await Share.share({ title, files: [uri], dialogTitle: title });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** يزيل أمر الطباعة التلقائي من صفحة تقرير (مربع الطباعة الأصلي يُفتح من التطبيق نفسه). */
export function stripAutoPrint(html: string): string {
  return html.replace(/(?:<|\\u003C)script>[^]*?window\.print\(\)[^]*?(?:<|\\u003C)\/script>/g, "");
}

/**
 * يطبع صفحة HTML كاملة: في التطبيق مربع الطباعة الأصلي («حفظ بتنسيق PDF»)، وخارجه نافذة جديدة
 * تطبع نفسها. `target` نافذة فُتحت قبل انتظار البيانات حتى لا يحجبها المتصفح (خارج التطبيق فقط).
 */
export async function printHtml(html: string, name: string, target?: Window | null): Promise<void> {
  if (isNative()) {
    target?.close();
    await ZenPrint.print({ html: stripAutoPrint(html), name: safeFileName(name) });
    return;
  }
  const w = target ?? window.open("", "_blank");
  if (!w) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    window.location.href = URL.createObjectURL(blob);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** نافذة الطباعة تُفتح قبل الانتظار خارج التطبيق فقط؛ في التطبيق لا نوافذ. */
export function preopenPrintWindow(): Window | null {
  return isNative() ? null : window.open("", "_blank");
}
