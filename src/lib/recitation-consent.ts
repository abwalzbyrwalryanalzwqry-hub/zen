/**
 * موافقة التحليل الآلي لصوت التسميع (تدقيق أكتوبر 2026، P0-05؛ القاصرون في القرار 0011). الخادم هو الحَكَم
 * (`zen-recitation` يرفض بلا موافقة نافذة)، وهذا للواجهة: نسأل قبل أول تحليل بدل أن يصطدم المستخدم برفض الخادم.
 *
 * النافذة (`effective`): موافقة صاحب الصوت، ومعها موافقة وليّ أمر مرتبط إن كان قاصراً (مرتبطاً بوليّ أمر، أو لم
 * يُقرّ بأن عمره 13 سنة فأكثر).
 */
import { supabase } from "@/integrations/supabase/client";

type ConsentRow = {
  recitation_audio?: boolean | null;
  recitation_effective?: boolean | null;
  age_13_plus?: boolean | null;
  minor?: boolean | null;
  has_guardian?: boolean | null;
  guardian_recitation?: boolean | null;
} | null;

export type RecitationConsentState = {
  /** موافقة صاحب الصوت نفسه. */
  own: boolean;
  /** هل يُحلَّل فعلاً (موافقته، ووليّ أمره إن كان قاصراً). */
  effective: boolean;
  adult: boolean;
  minor: boolean;
  hasGuardian: boolean;
  guardian: boolean;
};

export function consentState(row: ConsentRow): RecitationConsentState {
  const own = row?.recitation_audio === true;
  return {
    own,
    // قبل نشر ترحيل القاصرين لا يعيد الخادم الحقل: النافذة = موافقته.
    effective: row?.recitation_effective == null ? own : row.recitation_effective === true,
    adult: row?.age_13_plus === true,
    minor: row?.minor === true,
    hasGuardian: row?.has_guardian === true,
    guardian: row?.guardian_recitation === true,
  };
}

/** سطر يشرح ما ينقص الموافقة النافذة للقاصر، أو null إن لم ينقص شيء. */
export function guardianNote(s: RecitationConsentState | null): string | null {
  if (!s || !s.own || s.effective || !s.minor) return null;
  return s.hasGuardian ? "recitationConsent.waitGuardian" : "recitationConsent.linkGuardian";
}

let cached: RecitationConsentState | null = null;
let watching = false;

/** الحالة المحفوظة لحساب واحد: تُنسى عند الدخول أو الخروج أو تبديل الحساب. */
function watchAuth() {
  if (watching) return;
  watching = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "TOKEN_REFRESHED") cached = null;
  });
}

export async function getRecitationConsentState(force = false): Promise<RecitationConsentState> {
  watchAuth();
  if (cached && !force) return cached;
  const { data, error } = await supabase.rpc("my_ai_consent");
  if (error) throw error;
  cached = consentState(data as ConsentRow);
  return cached;
}

/** هل التحليل الآلي نافذ الآن؟ */
export async function getRecitationConsent(force = false): Promise<boolean> {
  return (await getRecitationConsentState(force)).effective;
}

export async function setRecitationConsent(
  on: boolean,
  adult?: boolean,
): Promise<RecitationConsentState> {
  const { data, error } = await supabase.rpc(
    "set_recitation_ai_consent",
    adult === undefined ? { _on: on } : { _on: on, _age_13_plus: adult },
  );
  if (error) throw error;
  cached = consentState(data as ConsentRow);
  return cached;
}

/** بوابة وليّ الأمر: موافقته على تحليل صوت ابن مرتبط. */
export type GuardianConsentRow = {
  student_id: string;
  recitation_audio: boolean;
  student_consent: boolean;
};

export async function listGuardianConsents(): Promise<GuardianConsentRow[]> {
  const { data, error } = await supabase.rpc("guardian_ai_consents_list");
  if (error) throw error;
  return (data ?? []) as GuardianConsentRow[];
}

export async function setGuardianConsent(student: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_guardian_recitation_consent", {
    _student: student,
    _on: on,
  });
  if (error) throw error;
  return data === true;
}

/** للاختبارات وعند تبديل الحساب. */
export function resetRecitationConsentCache(): void {
  cached = null;
}
