import { createRecitationSession, uploadRecitationAudio } from "@/lib/zen-lms";

/** رفع تسجيل التسميع الذاتي وإنشاء جلسة «تدريب» له (مشترك بين التحليل الآلي والإرسال المباشر للمعلّم). */
export async function uploadPractice(
  userId: string,
  rec: { blob: Blob; seconds: number },
  range: { surahName: string; from: number; to: number },
): Promise<string> {
  const path = await uploadRecitationAudio(userId, rec.blob);
  return createRecitationSession({
    student_id: userId,
    surah_name: range.surahName,
    from_ayah: range.from,
    to_ayah: range.to,
    kind: "review",
    audio_path: path,
    duration_seconds: rec.seconds,
    status: "practice",
  });
}
