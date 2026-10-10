/**
 * نداء دوال Supabase Edge من العميل (المرحلة 6.2): مسار واحد للويب ولنسخة Android، مع رسالة
 * الدالة العربية عند الخطأ. الضيف وانقطاع الإنترنت يُرفضان قبل الشبكة.
 */
import { supabase } from "@/integrations/supabase/client";
import { isGuest } from "@/lib/offline/guest";
import { isOnline } from "@/lib/network";

export class EdgeCallError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function callEdge<T>(
  fn: string,
  body: Record<string, unknown>,
  opts: { offlineMessage?: string; fallbackMessage?: string } = {},
): Promise<T> {
  if (isGuest()) throw new EdgeCallError("هذه الميزة تحتاج حساباً. سجّل الدخول لاستخدامها.");
  if (!isOnline())
    throw new EdgeCallError(opts.offlineMessage ?? "هذه الميزة تحتاج اتصالاً بالإنترنت.");
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new EdgeCallError(
      (j as { error?: string } | null)?.error ?? opts.fallbackMessage ?? "تعذّر الاتصال بالخدمة.",
      ctx?.status,
    );
  }
  return data as T;
}
