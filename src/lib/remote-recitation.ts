/**
 * التسميع غير المتزامن عن بُعد (1.21.0، المرحلة 5.3؛ supabase/migrations/20261211100000_fees_remote_recitation.sql):
 * المعلّم يرسل مقطعاً لطلاب حلقته، والطالب يسجّل التلاوة كاملة ويرسلها، والمعلّم يعلّم الأخطاء على شبكة الآيات
 * فتدخل سجل اليوم للحلقة (remote_review). الصوت في حاوية recitations القائمة بمجلد الطالب. المنطق الصافي
 * مختبَر في remote-recitation.test.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { RECITATION_BUCKET } from "@/lib/zen-lms";
import { t } from "@/lib/i18n";

export type RemoteStatus = "assigned" | "submitted" | "reviewed" | "cancelled";
export type MistakeType = "hifz" | "tajweed" | "tashkeel" | "waqf";
export type Mistake = { ayah: number; type: MistakeType };

export type RemoteItem = {
  id: string;
  halaqa_id?: string;
  halaqa_name: string;
  teacher_name?: string | null;
  student_id?: string;
  student_name?: string;
  kind: "memorize" | "review";
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  instructions: string | null;
  due_date: string | null;
  status: RemoteStatus;
  audio_path: string | null;
  duration_seconds: number | null;
  submitted_at: string | null;
  grade: number | null;
  mistakes: Mistake[];
  teacher_note: string | null;
  reviewed_at: string | null;
  record_date?: string | null;
  created_at: string;
};

export const MISTAKE_TYPES: readonly MistakeType[] = ["hifz", "tajweed", "tashkeel", "waqf"];

const ERR = [
  "NOT_YOUR_HALAQA",
  "INVALID_RANGE",
  "STUDENT_NOT_IN_HALAQA",
  "INVALID_DATE",
  "ALREADY_REVIEWED",
  "INVALID_AUDIO",
  "INVALID_DURATION",
  "NOT_SUBMITTED",
  "INVALID_GRADE",
  "INVALID_MISTAKES",
  "RECORD_COMPLETED",
  "RECORD_LOCKED",
  "STUDENT_NOT_PRESENT",
] as const;

export function remoteError(e: unknown, fallback: "load" | "save" = "save"): string {
  const msg =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  const code = ERR.find((k) => msg.includes(k));
  return code ? t(`remote.err.${code}`) : t(`remote.err.${fallback}`);
}

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>, kind: "load" | "save") {
  const { data, error } = await p;
  if (error) throw new Error(remoteError(error, kind));
  return data as T;
}

export const myRemote = () =>
  call<RemoteItem[]>(rpc("my_remote_recitations"), "load").then((r) => r ?? []);
export const teacherRemoteQueue = () =>
  call<RemoteItem[]>(rpc("teacher_remote_queue"), "load").then((r) => r ?? []);

export const assignRemote = (input: {
  halaqaId: string;
  students: string[];
  kind: "memorize" | "review";
  surah: string;
  from: number;
  to: number;
  instructions: string | null;
  due: string | null;
}) =>
  call<number>(
    rpc("remote_assign", {
      _halaqa: input.halaqaId,
      _students: input.students,
      _kind: input.kind,
      _surah: input.surah,
      _from: input.from,
      _to: input.to,
      _instructions: input.instructions as string,
      _due: input.due as string,
    }),
    "save",
  );

export const cancelRemote = (id: string) => call<null>(rpc("remote_cancel", { _id: id }), "save");

export async function submitRemote(
  item: Pick<RemoteItem, "id">,
  userId: string,
  blob: Blob,
  seconds: number,
): Promise<void> {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = remoteAudioPath(userId, item.id, ext);
  const { error } = await supabase.storage
    .from(RECITATION_BUCKET)
    .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw new Error(t("remote.err.upload"));
  await call<null>(
    rpc("remote_submit", { _id: item.id, _path: path, _seconds: Math.max(1, Math.round(seconds)) }),
    "save",
  );
}

export const reviewRemote = (id: string, grade: number, mistakes: Mistake[], note: string | null) =>
  call<{ record_date: string }>(
    rpc("remote_review", {
      _id: id,
      _grade: grade,
      _mistakes: mistakes as never,
      _note: note as string,
    }),
    "save",
  );

export async function remoteAudioUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(RECITATION_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ─────────── منطق صافٍ ───────────

export function remoteAudioPath(userId: string, id: string, ext: string, now = Date.now()) {
  return `${userId}/remote/${id}-${now}.${ext}`;
}

/** لمسة على آية في الشبكة: بلا خطأ ← حفظ ← تجويد ← تشكيل ← وقف ← بلا خطأ. */
export function cycleMistake(list: Mistake[], ayah: number): Mistake[] {
  const cur = list.find((m) => m.ayah === ayah);
  const rest = list.filter((m) => m.ayah !== ayah);
  if (!cur) return [...rest, { ayah, type: "hifz" as const }].sort((a, b) => a.ayah - b.ayah);
  const i = MISTAKE_TYPES.indexOf(cur.type);
  if (i === MISTAKE_TYPES.length - 1) return rest;
  return [...rest, { ayah, type: MISTAKE_TYPES[i + 1] }].sort((a, b) => a.ayah - b.ayah);
}

/** عدد الأخطاء لكل نوع (للملخص فوق الشبكة). */
export function mistakeCounts(list: Mistake[]): Record<MistakeType, number> {
  const out = { hifz: 0, tajweed: 0, tashkeel: 0, waqf: 0 };
  for (const m of list) out[m.type] += 1;
  return out;
}

/** درجة مقترحة من الأخطاء نسبةً لطول المقطع (يبقى للمعلّم أن يغيّرها): 0 ⇒ 5، وحتى 10% ⇒ 4، وحتى 25% ⇒ 3، ثم 2. */
export function suggestGrade(mistakes: number, ayahs: number): number {
  if (mistakes <= 0) return 5;
  const r = mistakes / Math.max(1, ayahs);
  if (r <= 0.1) return 4;
  if (r <= 0.25) return 3;
  return 2;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
