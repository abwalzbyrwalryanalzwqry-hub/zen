/**
 * وضع الأداء (1.17.0، المرحلة 1 من خطة التطوير؛ docs/PERFORMANCE.md).
 *
 * التمويه الخلفي (`backdrop-filter: blur`) في أصناف `glass` و`glass-strong` من أثقل عمليات التركيب على GPU
 * الأجهزة الضعيفة أثناء التمرير. وضع الأداء يضع الصنف `perf` على <html> فيستبدله styles.css بخلفية شبه
 * معتمة بالألوان نفسها، فلا يتغيّر الشكل تقريباً.
 *
 * - «تلقائي» (الافتراضي): يُفعَّل على الجهاز الضعيف وحده (`isLowEndDevice`).
 * - «مفعّل» / «متوقف»: اختيار المستخدم يعلو على الاكتشاف.
 *
 * يُطبَّق قبل أول رسم من سكربت الرأس في __root.tsx (`PERF_BOOT_SCRIPT`)، ومن هنا عند التغيير.
 */
export type PerfPreference = "auto" | "on" | "off";

export const PERF_KEY = "zen-perf";
export const PERF_PREFERENCES: readonly PerfPreference[] = ["auto", "on", "off"];

export type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent?: string;
};

/** رقم إصدار Android من سلسلة المتصفح، أو null خارج Android. */
export function androidVersion(ua: string | undefined): number | null {
  const m = /Android\s+(\d+)/i.exec(ua ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * جهاز ضعيف: ذاكرة ≤ 3GB، أو أنوية ≤ 4، أو Android ≤ 9. أي إشارة واحدة تكفي؛ وما لا يعلنه المتصفح لا يُحتسب.
 * (WebView في Android يعلن `deviceMemory` مقرّباً إلى 0.25/0.5/1/2/4/8.)
 */
export function isLowEndDevice(h: DeviceHints): boolean {
  if (typeof h.deviceMemory === "number" && h.deviceMemory > 0 && h.deviceMemory <= 3) return true;
  if (
    typeof h.hardwareConcurrency === "number" &&
    h.hardwareConcurrency > 0 &&
    h.hardwareConcurrency <= 4
  )
    return true;
  const v = androidVersion(h.userAgent);
  return v !== null && v <= 9;
}

export function parsePerfPreference(v: string | null | undefined): PerfPreference {
  return v === "on" || v === "off" ? v : "auto";
}

export function resolvePerfMode(pref: PerfPreference, h: DeviceHints): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return isLowEndDevice(h);
}

function hints(): DeviceHints {
  if (typeof navigator === "undefined") return {};
  const n = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemory: n.deviceMemory,
    hardwareConcurrency: n.hardwareConcurrency,
    userAgent: n.userAgent,
  };
}

export function getPerfPreference(): PerfPreference {
  try {
    return parsePerfPreference(localStorage.getItem(PERF_KEY));
  } catch {
    return "auto";
  }
}

/** هل وضع الأداء فعّال الآن على هذا الجهاز؟ */
export function isPerfModeActive(pref: PerfPreference = getPerfPreference()): boolean {
  return resolvePerfMode(pref, hints());
}

/** هل يُعدّ هذا الجهاز ضعيفاً؟ (لعرض «اكتُشف جهاز ضعيف» في الإعدادات.) */
export function deviceIsLowEnd(): boolean {
  return isLowEndDevice(hints());
}

export function setPerfPreference(pref: PerfPreference): boolean {
  try {
    if (pref === "auto") localStorage.removeItem(PERF_KEY);
    else localStorage.setItem(PERF_KEY, pref);
  } catch {
    /* لا شيء */
  }
  const on = isPerfModeActive(pref);
  if (typeof document !== "undefined") document.documentElement.classList.toggle("perf", on);
  return on;
}

/**
 * نسخة مصغّرة من `resolvePerfMode` تعمل قبل تحميل أي وحدة (سكربت الرأس). أي تعديل هنا يُعكس في الدوال
 * أعلاه؛ والاختبار يتحقق من تطابقهما.
 */
export const PERF_BOOT_SCRIPT =
  "var p=localStorage.getItem('zen-perf'),n=navigator,a=/Android\\s+(\\d+)/i.exec(n.userAgent||'');" +
  "if(p==='on'||(p!=='off'&&((n.deviceMemory>0&&n.deviceMemory<=3)||(n.hardwareConcurrency>0&&n.hardwareConcurrency<=4)||(a&&+a[1]<=9)))){document.documentElement.classList.add('perf')}";
