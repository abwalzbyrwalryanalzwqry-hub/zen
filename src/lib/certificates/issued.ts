/**
 * رسم شهادة صادرة من لقطتها المجمّدة (cert_get): التصميم كما كان يوم الإصدار، والقيم المحفوظة، والصور
 * المحفوظة، وQR من رمز التحقق. لا يُعاد الحساب من البيانات الحالية — تعديل القالب أو سجل الطالب لاحقاً لا يغيّرها.
 * الملغاة تُطبع بعلامة «ملغاة» واضحة.
 */
import { t } from "@/lib/i18n";
import type { CertDetail } from "./api";
import { certificateFileBase } from "./export";
import { fitDesign, type Measurer } from "./fit";
import { color, normalizeDesign } from "./model";
import { esc, renderPage, type AssetData } from "./render";
import { qrSvg, verifyLink } from "./qr";

export interface IssuedPage {
  html: string;
  size: { width: number; height: number };
  fileBase: string;
  title: string;
  shareText: string;
  link: string | null;
}

export async function renderIssued(d: CertDetail, measure?: Measurer | null): Promise<IssuedPage> {
  const design = normalizeDesign(d.design);
  const vars = d.snapshot?.vars ?? {};
  const assets: Record<string, AssetData> = {};
  for (const a of d.assets ?? [])
    assets[`asset:${a.id}`] = { data_url: a.data_url, width: a.width, height: a.height };
  const code = d.verify_code;
  const qr = design.elements.find((e) => e.type === "qr");
  const svg =
    code && qr && qr.type === "qr"
      ? await qrSvg(
          verifyLink(code),
          color(qr.color, design.palette),
          color(qr.background, design.palette),
        )
      : null;
  const fit = measure ? fitDesign(design, vars, measure, false) : { fitted: {} };
  let { html } = renderPage(design, {
    vars,
    assets,
    qrSvg: svg,
    fitted: fit.fitted,
    uid: d.id.slice(0, 8),
  });
  if (d.status === "revoked")
    html = html.replace(
      /<\/div>$/,
      `<div class="cert-void">${esc(t("certificates.status.revoked"))}</div></div>`,
    );
  const number = d.certificate_number ?? "";
  const year = (d.issue_date ?? d.created_at).slice(0, 4);
  const typeName = d.type_name ?? d.snapshot?.type.name ?? "";
  const link = code ? verifyLink(code) : null;
  return {
    html,
    size: { width: design.page.width, height: design.page.height },
    fileBase: certificateFileBase(d.student_name, number || year),
    title: `${typeName} — ${d.student_name}`,
    shareText: t("certificates.view.shareText", {
      type: typeName,
      name: d.student_name,
      number,
      link: link ?? "",
    }),
    link,
  };
}

/** يجلب تفاصيل عدة شهائد بتوازٍ محدود (للتصدير الجماعي). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R>,
) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
