/**
 * الصورة الشخصية (تحليل «المزيد» GAP-08). تُصغَّر على الجهاز إلى مربع 256px بصيغة WebP (أو JPEG إن لم يدعمها
 * المتصفح) قبل الرفع، فلا تخرج الصورة الأصلية ولا بيانات EXIF (الموقع، الجهاز) من الهاتف.
 * المسار `{uid}/{عشوائي}.webp` في حاوية `avatars` العامة، والرابط العام يُحفظ في `profiles.avatar`
 * الذي تعرضه بطاقات الحلقة والمحادثات. الصورة القديمة تُحذف بعد نجاح الجديدة.
 */
import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const PUBLIC_MARKER = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

export class AvatarError extends Error {
  constructor(public code: "type" | "size" | "decode" | "upload" | "save") {
    super(code);
  }
}

/** مسار الملف داخل الحاوية من رابطه العام، أو null إن لم يكن من حاويتنا ولا من مجلد هذا المستخدم. */
export function ownAvatarPath(url: string | null | undefined, uid: string): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARKER);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split(/[?#]/)[0]);
  return path.startsWith(`${uid}/`) && !path.includes("..") ? path : null;
}

/** رابط صورة يصلح للعرض (http/https فقط، فلا `javascript:` ولا `data:` من قيم قديمة). */
export function displayableAvatar(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function newAvatarPath(uid: string, ext: "webp" | "jpg"): string {
  const rand = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${uid}/${id}.${ext}`;
}

/** قصّ مربّع من الوسط (الحساب منفصل ليُختبر بلا Canvas). */
export function centerSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

async function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

export async function resizeAvatar(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  if (!/^image\//.test(file.type)) throw new AvatarError("type");
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new AvatarError("size");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new AvatarError("decode");
  }
  const { sx, sy, side } = centerSquare(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AvatarError("decode");
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bmp.close?.();
  const webp = await toBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpg = await toBlob(canvas, "image/jpeg");
  if (!jpg) throw new AvatarError("decode");
  return { blob: jpg, ext: "jpg" };
}

async function saveAvatarUrl(uid: string, url: string | null) {
  const { error } = await supabase.from("profiles").update({ avatar: url }).eq("id", uid);
  if (error) throw new AvatarError("save");
}

/** يرفع الصورة ويحفظ رابطها، ثم يحذف القديمة (إن كانت من حاويتنا). يعيد الرابط الجديد. */
export async function uploadAvatar(
  uid: string,
  file: File,
  oldUrl: string | null,
): Promise<string> {
  const { blob, ext } = await resizeAvatar(file);
  const path = newAvatarPath(uid, ext);
  const store = supabase.storage.from(AVATAR_BUCKET);
  const { error } = await store.upload(path, blob, {
    contentType: ext === "webp" ? "image/webp" : "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new AvatarError("upload");
  const url = store.getPublicUrl(path).data.publicUrl;
  try {
    await saveAvatarUrl(uid, url);
  } catch (e) {
    await store.remove([path]).catch(() => undefined);
    throw e;
  }
  const old = ownAvatarPath(oldUrl, uid);
  if (old) await store.remove([old]).catch(() => undefined);
  return url;
}

export async function removeAvatar(uid: string, url: string | null): Promise<void> {
  await saveAvatarUrl(uid, null);
  const path = ownAvatarPath(url, uid);
  if (path)
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([path])
      .catch(() => undefined);
}
