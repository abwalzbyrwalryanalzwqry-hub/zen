/**
 * فحص الشهادة قبل الإصدار: لكل طالب قائمة بنود (سليم/تنبيه/مانع). أي مانع يوقف الإصدار:
 * متغيّر لا يُقرأ، نص مقصوص، عنصر خارج الورقة، صورة إلزامية ناقصة، طالب خارج الحلقة، أو عدم الاستحقاق
 * (إلا بتجاوز إداري مسجَّل).
 */
import { t } from "@/lib/i18n";
import { FONT_FAMILY, FONT_WEIGHTS, isTextual, type CertElement, type Design } from "./model";
import type { ElementIssue } from "./render";
import type { Eligibility } from "./eligibility";

export type CheckLevel = "ok" | "warn" | "error";
export interface CheckItem {
  key: string;
  level: CheckLevel;
  text: string;
  elementId?: string;
}

export interface CheckInput {
  design: Design;
  /** نتائج الرسم (المتغيّرات والصور الناقصة). */
  issues: ElementIssue[];
  /** عناصر يفيض نصها بعد الملاءمة. */
  overflow: string[];
  studentInHalaqa: boolean;
  hasCenter: boolean;
  hasHalaqa: boolean;
  hasTemplate: boolean;
  eligibility: Eligibility | null;
  override: boolean;
  fontsReady: boolean;
  qrOk: boolean;
}

/** الصندوق المحيط بعد الدوران (مم). */
export function bounds(e: CertElement) {
  const r = (Math.abs(e.rotation % 180) * Math.PI) / 180;
  const w = Math.abs(e.w * Math.cos(r)) + Math.abs(e.h * Math.sin(r));
  const h = Math.abs(e.w * Math.sin(r)) + Math.abs(e.h * Math.cos(r));
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function outsidePage(d: Design): { outside: string[]; unsafe: string[] } {
  const outside: string[] = [];
  const unsafe: string[] = [];
  const { width: W, height: H, safe } = d.page;
  for (const e of d.elements) {
    if (e.hidden) continue;
    const b = bounds(e);
    const tol = 0.5;
    if (b.x < -tol || b.y < -tol || b.x + b.w > W + tol || b.y + b.h > H + tol) outside.push(e.id);
    else if (
      e.role !== "decoration" &&
      e.type !== "frame" &&
      (b.x < safe - tol ||
        b.y < safe - tol ||
        b.x + b.w > W - safe + tol ||
        b.y + b.h > H - safe + tol)
    )
      unsafe.push(e.id);
  }
  return { outside, unsafe };
}

const label = (d: Design, id: string) => {
  const e = d.elements.find((x) => x.id === id);
  return e?.name || (e ? t(`certificates.el.${e.type}`) : id);
};

export function checkCertificate(i: CheckInput): { ok: boolean; items: CheckItem[] } {
  const items: CheckItem[] = [];
  const add = (key: string, level: CheckLevel, text: string, elementId?: string) =>
    items.push({ key, level, text, elementId });
  const d = i.design;

  add(
    "student",
    i.studentInHalaqa ? "ok" : "error",
    t(i.studentInHalaqa ? "certificates.check.student" : "certificates.check.studentMissing"),
  );
  add(
    "circle",
    i.hasHalaqa ? "ok" : "error",
    t(i.hasHalaqa ? "certificates.check.circle" : "certificates.check.circleMissing"),
  );
  add(
    "center",
    i.hasCenter ? "ok" : "error",
    t(i.hasCenter ? "certificates.check.center" : "certificates.check.centerMissing"),
  );
  add(
    "template",
    i.hasTemplate ? "ok" : "error",
    t(i.hasTemplate ? "certificates.check.template" : "certificates.check.templateMissing"),
  );

  const badVars = i.issues.filter((x) => x.missing.length || x.unknown.length);
  if (badVars.length)
    for (const b of badVars)
      add(
        "vars",
        "error",
        `${t("certificates.check.unreadableVar")} (${[...b.missing, ...b.unknown].join("، ")})`,
        b.id,
      );
  else add("vars", "ok", t("certificates.check.vars"));

  const badFont = d.elements.some(
    (e) => isTextual(e) && (e.font.family !== FONT_FAMILY || !FONT_WEIGHTS.includes(e.font.weight)),
  );
  add(
    "fonts",
    badFont ? "warn" : i.fontsReady ? "ok" : "warn",
    t(
      badFont
        ? "certificates.check.fontFallback"
        : i.fontsReady
          ? "certificates.check.fonts"
          : "certificates.check.fontsLoading",
    ),
  );

  const { outside, unsafe } = outsidePage(d);
  if (outside.length)
    for (const id of outside)
      add("outside", "error", t("certificates.check.outside", { name: label(d, id) }), id);
  else add("outside", "ok", t("certificates.check.inside"));
  for (const id of unsafe)
    add("safe", "warn", t("certificates.check.unsafe", { name: label(d, id) }), id);

  if (i.overflow.length)
    for (const id of i.overflow)
      add("clip", "error", t("certificates.check.clipped", { name: label(d, id) }), id);
  else add("clip", "ok", t("certificates.check.noClip"));

  const missingImg = i.issues.filter((x) => x.missingImage);
  if (missingImg.length)
    for (const m of missingImg)
      add("image", "error", t("certificates.check.imageMissing", { name: label(d, m.id) }), m.id);
  else add("image", "ok", t("certificates.check.images"));

  const hasQr = d.elements.some((e) => e.type === "qr" && !e.hidden);
  add(
    "qr",
    !hasQr ? "warn" : i.qrOk ? "ok" : "error",
    t(
      !hasQr
        ? "certificates.check.noQr"
        : i.qrOk
          ? "certificates.check.qr"
          : "certificates.check.qrFailed",
    ),
  );
  add("number", "ok", t("certificates.check.number"));

  if (i.eligibility && !i.eligibility.manual) {
    if (i.eligibility.eligible) add("eligible", "ok", t("certificates.check.eligible"));
    else if (i.override) add("eligible", "warn", t("certificates.check.override"));
    else add("eligible", "error", t("certificates.check.notEligible"));
  }

  const ok = !items.some((x) => x.level === "error");
  if (ok) add("ready", "ok", t("certificates.check.ready"));
  return { ok, items };
}
