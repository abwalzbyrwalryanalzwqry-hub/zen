/**
 * موافقة الذكاء الاصطناعي النصّي (جاهزية المستودع العام، N-03): المساعد، ومدرّب «محاسبتي»، وميزات القرآن،
 * وتلخيص المحادثات، وتعليل خطة الحفظ — كلها ترسل نصاً إلى مزوّد خارجي.
 *
 * الخادم هو الحَكَم (`ai_access_denial` في دوال Edge): بلا موافقة يرفض، وللقاصر يرفض دائماً (القرار 0011).
 * هنا لتجربة الاستخدام فقط: `ensureTextAiConsent()` يسأل مرة واحدة قبل أول طلب بدل أن يصطدم المستخدم بالرفض.
 * يسأل عبر مضيف واحد مركَّب في التخطيط المحمي (`TextAiConsentHost`)، فلا تحتاج كل شاشة حوارها الخاص.
 */
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { isGuest } from "@/lib/offline/guest";

type Row = {
  text_ai?: boolean | null;
  text_ai_effective?: boolean | null;
  minor?: boolean | null;
  has_guardian?: boolean | null;
} | null;

export type TextAiState = {
  /** موافقة صاحب الحساب. */
  own: boolean;
  /** هل يعمل فعلاً (موافقته وليس قاصراً). */
  effective: boolean;
  minor: boolean;
  hasGuardian: boolean;
};

export function textAiState(row: Row): TextAiState {
  const own = row?.text_ai === true;
  return {
    own,
    // قبل نشر الترحيل لا يعيد الخادم الحقل: نعدّه غير نافذ فنسأل، والخادم القديم لا يرفض.
    effective: row?.text_ai_effective === true,
    minor: row?.minor === true,
    hasGuardian: row?.has_guardian === true,
  };
}

let cached: TextAiState | null = null;
let watching = false;

function watchAuth() {
  if (watching) return;
  watching = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "TOKEN_REFRESHED") cached = null;
  });
}

export async function getTextAiState(force = false): Promise<TextAiState> {
  watchAuth();
  if (cached && !force) return cached;
  const { data, error } = await supabase.rpc("my_ai_consent");
  if (error) throw error;
  cached = textAiState(data as Row);
  return cached;
}

export async function setTextAiConsent(on: boolean, adult: boolean): Promise<TextAiState> {
  const { data, error } = await rpc("set_text_ai_consent", { _on: on, _age_13_plus: adult });
  if (error) throw new Error(error.message);
  cached = textAiState(data as Row);
  return cached;
}

type Host = (st: TextAiState) => Promise<boolean>;
let host: Host | null = null;

/** يركّبه `TextAiConsentHost`؛ يعيد دالة الفكّ. */
export function registerTextAiHost(h: Host): () => void {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}

/** true = امضِ (موافقة نافذة، أو تعذّر السؤال فيحسم الخادم). false = رفض المستخدم أو هو قاصر. */
export async function ensureTextAiConsent(): Promise<boolean> {
  if (isGuest()) return true;
  let st: TextAiState;
  try {
    st = await getTextAiState();
  } catch {
    return true;
  }
  if (st.effective) return true;
  if (!host) return true;
  return host(st);
}

export const TEXT_AI_DECLINED = "تحتاج هذه الميزة موافقتك على استعمال الذكاء الاصطناعي.";

/** للاختبارات وعند تبديل الحساب. */
export function resetTextAiCache(): void {
  cached = null;
}
