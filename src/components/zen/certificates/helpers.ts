/** دوال مشتركة لشاشات الاستوديو (خارج ملفات المكوّنات ليبقى التحديث السريع سليماً). */
import { certApi, type TemplateRow } from "@/lib/certificates/api";
import { exportCertificatePdf } from "@/lib/certificates/export";
import { domMeasurer } from "@/lib/certificates/fit";
import { mapLimit, renderIssued } from "@/lib/certificates/issued";
import { normalizeDesign, type CertElement, type Design } from "@/lib/certificates/model";
import type { TemplatePick } from "@/lib/certificates/resolve";
import { SYSTEM_TEMPLATES, systemTemplateName } from "@/lib/certificates/templates";

/** تنزيل PDF من لقطة الشهادة المحفوظة (ما صدر بالضبط). */
export async function downloadCertificate(id: string) {
  const d = await certApi.get(id);
  const r = await renderIssued(d, domMeasurer());
  await exportCertificatePdf([r.html], r.size, r.fileBase, r.title);
}

export const STEP_KEYS = ["prepare", "data", "design", "file", "done"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** يجمع شهائد الدفعة الصادرة في ملف واحد من لقطاتها المحفوظة (ما صدر بالضبط). */
export async function batchPages(ids: string[], onStep?: (s: StepKey) => void) {
  onStep?.("data");
  // M6 (1.25.0): دفعات من 50 بطلب واحد لكل دفعة بدل طلب لكل شهادة.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const details = (await mapLimit(chunks, 2, (c) => certApi.getMany(c))).flat();
  onStep?.("design");
  const measure = domMeasurer();
  const pages = await mapLimit(details, 4, (d) => renderIssued(d, measure));
  return pages;
}

export interface GalleryItem {
  pick: TemplatePick;
  name: string;
  desc: string;
  categories: string[];
  design: Design;
  row?: TemplateRow;
}

export function galleryItems(
  rows: TemplateRow[],
  t: (k: string) => string,
  showArchived = false,
): GalleryItem[] {
  const center = rows
    .filter((r) => showArchived || !r.archived)
    .map((r) => ({
      pick: { kind: "center", id: r.id } as const,
      name: r.name,
      desc: r.description ?? "",
      categories: r.categories ?? [],
      design: normalizeDesign(r.design),
      row: r,
    }));
  const system = SYSTEM_TEMPLATES.map((s) => ({
    pick: { kind: "system", key: s.key } as const,
    name: systemTemplateName(s.key),
    desc: t(`certificates.tpl.${s.key}.desc`),
    categories: s.categories as string[],
    design: s.build(),
  }));
  return [...center, ...system];
}

export function condLabel(
  t: (k: string, v?: Record<string, string | number>) => string,
  kind: string,
  need: number | null,
  actual?: number | null,
) {
  const k = `certificates.cond.${kind}`;
  const s = t(k, { need: need ?? "", actual: actual == null ? "—" : Math.round(actual * 10) / 10 });
  return s === k
    ? t("certificates.cond.unknown")
    : actual === undefined
      ? s.replace(/\s*\([^)]*\)\s*$/, "")
      : s;
}

/** صفات الموقّع الجاهزة (مذكّر ومؤنّث وصيغة محايدة)؛ مفاتيحها في certificates.sig.*. */
export const SIGNER_PRESETS = [
  "teacher",
  "teacherF",
  "supervisor",
  "supervisorF",
  "director",
  "directorF",
  "administration",
] as const;

/** اسم العنصر للطبقات و«التعديل السريع»: اسمه، أو أول النص، أو نوعه. */
export function layerLabel(e: CertElement, t: (k: string) => string) {
  if (e.name) return e.name;
  if (e.type === "text")
    return e.text.replace(/\s+/g, " ").slice(0, 28) || t("certificates.el.text");
  return t(`certificates.el.${e.type}`);
}
