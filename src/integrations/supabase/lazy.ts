import type { RpcArgs, RpcName } from "./rpc";

/**
 * عميل Supabase كسولاً (1.16.0): الوحدات التي تُحمَّل مع شاشة البداية (الجلسة، القياس، سجل الأخطاء) تطلبه
 * بهذا بدل الاستيراد المباشر، فلا يدخل الحزمة الأولى (نحو 54KB gzip) ويُرسم التطبيق قبل تحليله. يبدأ
 * تحميله فور أول طلب، وتعيده كل الطلبات التالية من الذاكرة.
 */
let loading: Promise<typeof import("./client")> | null = null;
let loadingRpc: Promise<typeof import("./rpc")> | null = null;
const load = () => (loading ??= import("./client"));
// وعد واحد لكل وحدة: النداءات المتزامنة تنتظره نفسه بدل استيراد لكل نداء.
const loadRpc = () => (loadingRpc ??= import("./rpc"));

export async function lazySupabase() {
  return (await load()).supabase;
}

export async function lazyRpc<F extends RpcName>(fn: F, args?: RpcArgs<F>) {
  const { rpc } = await loadRpc();
  return rpc(fn, args);
}
