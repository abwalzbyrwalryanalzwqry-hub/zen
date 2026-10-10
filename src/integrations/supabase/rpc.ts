import { supabase } from "./client";
import type { Database } from "./types";

type Fns = Database["public"]["Functions"];

/** أسماء دوال قاعدة البيانات المعروفة من الأنواع المولَّدة (`npm run gen:types`). */
export type RpcName = keyof Fns;
export type RpcArgs<F extends RpcName> = Fns[F] extends { Args: infer A } ? A : never;
export type RpcReturns<F extends RpcName> = Fns[F] extends { Returns: infer R } ? R : never;

/**
 * نداء دالة قاعدة بيانات باسم ووسائط مُتحقَّق منها وقت الترجمة: خطأ في اسم الدالة أو
 * اسم وسيط يُكتشف في `npm run typecheck` بدل أن يظهر للمستخدم خطأً من PostgREST.
 */
export function rpc<F extends RpcName>(fn: F, args?: RpcArgs<F>) {
  return supabase.rpc(fn, (args ?? {}) as never);
}
