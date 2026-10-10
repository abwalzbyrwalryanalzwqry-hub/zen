/**
 * التسميع المباشر (8.4) — منطق خالص: تجميع المقاطع بترتيبها ومطابقتها تراكمياً على الجهاز.
 * المقطع يعود من الخادم نصاً فقط (القاعدة «النموذج يسمع، والمطابقة تحكم»).
 */
import { alignRecitation, type Alignment } from "@/lib/quran/align";

export const CHUNK_MS = 6_000;
/** سقف جلسة واحدة: 10 دقائق (100 مقطع) حتى لا تُستنفد الحصة اليومية بجلسة منسية. */
export const MAX_CHUNKS = 100;

export interface LiveState {
  /** نصوص المقاطع بترتيب تسجيلها (المقطع المعلّق undefined). */
  chunks: Array<string | undefined>;
  failed: number;
}

export const initialLive = (): LiveState => ({ chunks: [], failed: 0 });

export function addPending(s: LiveState): { state: LiveState; index: number } {
  return { state: { ...s, chunks: [...s.chunks, undefined] }, index: s.chunks.length };
}

export function resolveChunk(s: LiveState, index: number, text: string | null): LiveState {
  const chunks = s.chunks.slice();
  chunks[index] = text ?? "";
  return { chunks, failed: s.failed + (text === null ? 1 : 0) };
}

/** النص المسموع حتى أول مقطع معلّق (لا قفز فوق مقطع لم يصل بعد). */
export function heardSoFar(s: LiveState): string {
  const out: string[] = [];
  for (const c of s.chunks) {
    if (c === undefined) break;
    if (c) out.push(c);
  }
  return out.join(" ");
}

export function liveAlignment(reference: string, s: LiveState, finished: boolean): Alignment {
  return alignRecitation(reference, heardSoFar(s), { partial: !finished });
}

export function mimeToFormat(mime: string): string {
  if (/ogg/.test(mime)) return "ogg";
  if (/mp4|m4a|aac/.test(mime)) return "m4a";
  if (/wav/.test(mime)) return "wav";
  return "webm";
}

export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
