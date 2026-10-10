/**
 * ترجمة خفيفة (المرحلة 13.1) بلا مكتبة: قاموس JSON لكل لغة بمفاتيح منقّطة، والعربية الافتراضية
 * ومضمّنة في الحزمة، والبقية تُحمَّل عند الطلب. اللغة واتجاهها (rtl/ltr) يُطبَّقان على <html>،
 * ويُحفظان على الجهاز. نص المصحف والأذكار لا يمرّ من هنا أبداً (لا يُترجم).
 *
 *   t("nav.today")                 ⇒ «اليوم»
 *   t("nav.unread", { n: 3 })      ⇒ «3 رسالة غير مقروءة»
 *   const t = useT()               ⇒ في المكوّنات (يُعاد الرسم عند تغيير اللغة)
 */
import { useSyncExternalStore } from "react";
import ar from "@/locales/ar.json";

export type Locale = "ar";
/**
 * العربية وحدها (1.35.0): حُذفت الإنجليزية وقواميسها بقرار المالك، كما حُذفت الأردية والإندونيسية في
 * 1.11.1. بنية t() والقواميس باقية لأن النصوص مركزية فيها، وإضافة لغة لاحقاً = قاموس ومحمِّل هنا.
 */
export const LOCALES: { code: Locale; dir: "rtl" | "ltr" }[] = [{ code: "ar", dir: "rtl" }];
export const DEFAULT_LOCALE: Locale = "ar";

/**
 * اللغات الجاهزة للعرض (H8). قاموس en كامل لمفاتيحها، لكن أغلب الشاشات ما زالت بنصوص عربية
 * مكتوبة مباشرة (src/locales/legacy-arabic-files.json)، فاختيار لغة أخرى يعطي واجهة نصفها عربي.
 * تُضاف اللغة هنا حين تفرغ تلك القائمة؛ وحتى ذلك يُخفى منتقي اللغة ويُعاد المختار سابقاً إلى العربية.
 */
export const READY_LOCALES: readonly Locale[] = ["ar"];
export const isReadyLocale = (l: unknown): l is Locale =>
  typeof l === "string" && (READY_LOCALES as readonly string[]).includes(l);
export const availableLocales = () => LOCALES.filter((l) => isReadyLocale(l.code));
export const LOCALE_KEY = "zen-locale";
/**
 * وسم Intl للنصوص العربية دائماً (مستندات الطباعة والتصدير والشهادات وتسميات «اليوم/أمس»): عربي بأرقام
 * لاتينية صراحةً. «ar» المجرّد يعطي أرقاماً عربية-هندية في WebView القديم (ICU أقدم من CLDR 42) ولاتينية في
 * الحديث، فيختلف شكل الأرقام بين الأجهزة.
 */
export const AR_LATN = "ar-u-nu-latn";

type Dict = { [k: string]: string | Dict };
const loaders: Partial<Record<Locale, () => Promise<{ default: Dict }>>> = {};
const dicts: Partial<Record<Locale, Dict>> = { ar: ar as Dict };
/**
 * قواميس ميزات كسولة (كالتقارير): تُحمَّل مع شاشتها ولا تدخل الحزمة الأولى، وتُبحث بعد القاموس الرئيسي.
 * مفاتيحها في src/locales/<ميزة>/ar.json.
 */
const extras: Partial<Record<Locale, Dict[]>> = {};

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.code === v);
}

export function dirOf(l: Locale): "rtl" | "ltr" {
  return LOCALES.find((x) => x.code === l)?.dir ?? "rtl";
}

function lookup(d: Dict | undefined, key: string): string | undefined {
  let node: string | Dict | undefined = d;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** نص المفتاح باللغة الحالية، ثم العربية، ثم المفتاح نفسه (يظهر فوراً في الاختبارات إن نُسي). */
function find(l: Locale, key: string): string | undefined {
  const hit = lookup(dicts[l], key);
  if (hit !== undefined) return hit;
  for (const d of extras[l] ?? []) {
    const x = lookup(d, key);
    if (x !== undefined) return x;
  }
  return undefined;
}

/** يضيف قاموس ميزة للغة (مرة واحدة لكل كائن) ويعيد رسم المكوّنات. */
export function extendDict(l: Locale, d: Dict): void {
  const list = (extras[l] ??= []);
  if (list.includes(d)) return;
  list.push(d);
  listeners.forEach((f) => f());
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const s = find(current, key) ?? find("ar", key) ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * عدد بصيغة الجمع الصحيحة للغة (تحليل «المزيد» I18N-04): `{key}.{one|two|few|many|other}` حسب
 * `Intl.PluralRules`، وإن غابت الصيغة فـ `{key}.other`. القاموسان بمفاتيح واحدة، فتُكتب في كلٍّ
 * الصيغ نفسها (one/two/few/other) وتكرّر اللغات التي لا تفرّق بينها نصّ other.
 *
 *   plural("units.days", 7) ⇒ «7 أيام»، plural("units.days", 1) ⇒ «يوم واحد»
 */
export function plural(key: string, n: number, vars?: Record<string, string | number>): string {
  const form = pluralRules(current).select(n);
  const v = { n, ...vars };
  const has = (k: string) => find(current, k) ?? find("ar", k);
  return t(has(`${key}.${form}`) ? `${key}.${form}` : `${key}.other`, v);
}

const rulesCache = new Map<Locale, Intl.PluralRules>();
function pluralRules(l: Locale): Intl.PluralRules {
  let r = rulesCache.get(l);
  if (!r) rulesCache.set(l, (r = new Intl.PluralRules(l)));
  return r;
}

/**
 * وسم Intl للغة الواجهة (I18N-03): الأرقام لاتينية كما في بقية التطبيق، والأسماء (الشهور والأيام) بلغة
 * الواجهة بدل «ar» المكتوبة في كل صفحة.
 */
export function intlLocale(l: Locale = current): string {
  return `${l}-u-nu-latn`;
}

export function getLocale(): Locale {
  return current;
}

function apply(l: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l;
  document.documentElement.dir = dirOf(l);
}

/** يبدّل اللغة: يحمّل قاموسها إن لزم، ويطبّق الاتجاه، ويحفظ الاختيار. */
export async function setLocale(l: Locale): Promise<void> {
  if (!isLocale(l)) return;
  if (!dicts[l]) {
    const load = loaders[l];
    if (!load) return;
    dicts[l] = (await load()).default;
  }
  current = l;
  apply(l);
  try {
    localStorage.setItem(LOCALE_KEY, l);
  } catch {
    /* تخزين غير متاح */
  }
  listeners.forEach((f) => f());
}

/** عند بدء التطبيق: اللغة المحفوظة إن وُجدت. */
export async function initLocale(): Promise<void> {
  let saved: string | null;
  try {
    saved = localStorage.getItem(LOCALE_KEY);
  } catch {
    saved = null;
  }
  if (isReadyLocale(saved) && saved !== current) await setLocale(saved);
  else {
    // لغة محفوظة لم تعد معروضة (H8): العربية، ويُمسح الاختيار القديم.
    if (saved && !isReadyLocale(saved)) {
      try {
        localStorage.removeItem(LOCALE_KEY);
      } catch {
        /* لا شيء */
      }
    }
    apply(current);
  }
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** اللغة الحالية في مكوّن React (يُعاد الرسم عند تغييرها). */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}

/** دالة الترجمة في مكوّن React. */
export function useT(): typeof t {
  useLocale();
  return t;
}

/** للاختبارات: يسجّل قاموساً للغة. */
export function __registerDict(l: string, d: Dict) {
  (dicts as Record<string, Dict>)[l] = d;
}
