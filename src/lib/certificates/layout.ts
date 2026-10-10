/**
 * تخطيط القوالب الجاهزة: يبني تصميماً من «مظهر» (الإطار والنقش والألوان والأحجام). القوالب الثمانية في
 * templates.ts تختلف بمظهرها فقط، والعناصر والمتغيّرات واحدة.
 */
import { t } from "@/lib/i18n";
import {
  defaultPage,
  make,
  newId,
  type CertElement,
  type Design,
  type FrameKind,
  type Orientation,
  type Palette,
  type PatternKind,
} from "./model";

export interface Look {
  orientation: Orientation;
  palette: Palette;
  frame: FrameKind;
  frameThickness: number;
  pattern?: { kind: PatternKind; opacity: number } | null;
  /** زخرفة فوق العنوان. */
  crest?: "medallion" | "arch" | "rosette" | "seal" | "book" | "laurel" | null;
  /** فاصل تحت الاسم. */
  divider?: boolean;
  /** شريط جانبي ملوّن (القالب العصري). */
  sideBand?: boolean;
  titleSize: number;
  nameSize: number;
  /** زخارف الأركان. */
  corners?: boolean;
  /** شعار في الرأس (يمين) مع اسم المركز بدل الشعار الوسطي (القالب الرسمي). */
  headerRow?: boolean;
}

const T = (k: string) => t(`certificates.text.${k}`);

export function build(look: Look): Design {
  const page = defaultPage("A4", look.orientation);
  const W = page.width;
  const H = page.height;
  const portrait = look.orientation === "portrait";
  if (look.pattern)
    page.pattern = { kind: look.pattern.kind, color: "$accent", opacity: look.pattern.opacity };
  const els: CertElement[] = [];
  const cx = (w: number) => (W - w) / 2;
  const m = 8;
  els.push(
    make.frame({
      x: m,
      y: m,
      w: W - 2 * m,
      h: H - 2 * m,
      frame: look.frame,
      thickness: look.frameThickness,
      locked: true,
      role: "decoration",
      name: T("layer.frame"),
    }),
  );
  if (look.sideBand)
    els.push(
      make.shape({
        x: W - m - 14,
        y: m,
        w: 14,
        h: H - 2 * m,
        fill: "$primary",
        stroke: "transparent",
        strokeWidth: 0,
        locked: true,
        role: "decoration",
      }),
    );
  if (look.corners) {
    const s = 22;
    const pos: [number, number, number][] = [
      [m + 4, m + 4, 0],
      [W - m - 4 - s, m + 4, 90],
      [W - m - 4 - s, H - m - 4 - s, 180],
      [m + 4, H - m - 4 - s, 270],
    ];
    for (const [x, y, r] of pos)
      els.push(
        make.ornament({
          x,
          y,
          w: s,
          h: s,
          rotation: r,
          ornament: "corner",
          role: "decoration",
          locked: true,
        }),
      );
  }
  let y = portrait ? 22 : 18;
  if (look.headerRow) {
    els.push(
      make.image({
        x: W - m - 12 - 30,
        y,
        w: 30,
        h: 24,
        src: "brand:logo",
        role: "logo",
        name: T("layer.logo"),
      }),
      make.text({
        x: m + 50,
        y: y + 2,
        w: W - 2 * m - 100,
        h: 10,
        text: "{{center.name}}",
        role: "header",
        font: { weight: 900, size: 16, color: "$primary" } as never,
      }),
      make.text({
        x: m + 50,
        y: y + 12,
        w: W - 2 * m - 100,
        h: 8,
        text: T("officialLine"),
        role: "header",
        font: { weight: 400, size: 10, color: "$muted" } as never,
      }),
      make.line({
        x: m + 14,
        y: y + 27,
        w: W - 2 * m - 28,
        h: 2,
        stroke: "$accent",
        strokeWidth: 0.35,
      }),
    );
    y += 34;
  } else {
    els.push(
      make.image({
        x: cx(28),
        y,
        w: 28,
        h: 22,
        src: "brand:logo",
        role: "logo",
        name: T("layer.logo"),
      }),
    );
    y += 24;
    els.push(
      make.text({
        x: cx(160),
        y,
        w: 160,
        h: 8,
        text: "{{center.name}}",
        role: "header",
        font: { weight: 500, size: 11, color: "$muted" } as never,
      }),
    );
    y += 10;
  }
  if (look.crest) {
    const s = portrait ? 26 : 18;
    els.push(make.ornament({ x: cx(s), y, w: s, h: s, ornament: look.crest, role: "decoration" }));
    y += s + 1;
  }
  const tw = portrait ? 170 : 220;
  els.push(
    make.text({
      x: cx(tw),
      y,
      w: tw,
      h: look.titleSize * 0.62,
      text: "{{certificate.type}}",
      role: "title",
      name: T("layer.title"),
      font: { weight: 900, size: look.titleSize, color: "$primary", lineHeight: 1.25 } as never,
      autoFit: { enabled: true, min: look.titleSize * 0.6 },
    }),
  );
  y += look.titleSize * 0.62 + 4;
  els.push(
    make.text({
      x: cx(200),
      y,
      w: 200,
      h: 9,
      text: T("presents"),
      role: "subtitle",
      font: { weight: 400, size: 12, color: "$ink" } as never,
    }),
  );
  y += 10;
  const nw = portrait ? 172 : 210;
  els.push(
    make.text({
      x: cx(nw),
      y,
      w: nw,
      h: look.nameSize * 0.6,
      text: "{{student.fullName}}",
      role: "studentName",
      name: T("layer.name"),
      font: { weight: 900, size: look.nameSize, color: "$ink", lineHeight: 1.25 } as never,
      autoFit: { enabled: true, min: 14 },
    }),
  );
  y += look.nameSize * 0.6 + 1;
  if (look.divider) {
    els.push(make.ornament({ x: cx(90), y, w: 90, h: 5, ornament: "divider", role: "decoration" }));
    y += 7;
  }
  const bw = portrait ? 168 : 220;
  const bh = portrait ? 30 : 22;
  els.push(
    make.text({
      x: cx(bw),
      y,
      w: bw,
      h: bh,
      text: "{{achievement.description}}",
      role: "body",
      name: T("layer.body"),
      font: { weight: 400, size: 13, color: "$ink", lineHeight: 1.75 } as never,
      autoFit: { enabled: true, min: 10 },
    }),
    make.text({
      x: cx(bw),
      y: y + bh + 1,
      w: bw,
      h: 8,
      text: T("circleLine"),
      role: "body",
      font: { weight: 500, size: 11, color: "$muted" } as never,
      autoFit: { enabled: true, min: 8 },
    }),
  );
  y += bh + 11;
  els.push(
    make.text({
      x: cx(140),
      y,
      w: 140,
      h: 7,
      text: T("dateLine"),
      role: "date",
      font: { weight: 400, size: 10, color: "$muted" } as never,
    }),
  );
  // التواقيع والختم وQR في الأسفل.
  const sy = H - m - (portrait ? 52 : 44);
  const sw = 56;
  els.push(
    make.signature({
      x: W - m - 18 - sw - (look.sideBand ? 14 : 0),
      y: sy,
      w: sw,
      h: 28,
      src: "brand:signature:teacher",
      label: t("certificates.sig.teacher"),
      signer: "{{teacher.name}}",
      name: t("certificates.sig.teacher"),
    }),
    make.signature({
      x: m + 18 + (portrait ? 0 : 30),
      y: sy,
      w: sw,
      h: 28,
      src: "brand:signature:director",
      // «إدارة المركز» تصلح للمدير والمديرة؛ وصفة الهوية (cert_brand) تحلّ محلها عند الإصدار إن ضُبطت.
      label: t("certificates.sig.administration"),
      signer: "",
      name: t("certificates.sig.director"),
    }),
    make.image({
      x: cx(30),
      y: sy - 2,
      w: 30,
      h: 30,
      src: "brand:stamp",
      role: "stamp",
      opacity: 0.9,
      name: T("layer.stamp"),
    }),
  );
  const q = 20;
  const qx = portrait ? cx(q) : m + 16;
  const qy = portrait ? H - m - 40 : H - m - 18 - q - 5;
  els.push(
    make.qr({ x: qx, y: qy, w: q, h: q, name: "QR" }),
    make.text({
      x: qx - 8,
      y: qy + q + 0.5,
      w: q + 16,
      h: 4.5,
      text: "{{certificate.number}}",
      role: "number",
      font: { weight: 500, size: 7, color: "$muted", dir: "ltr", lineHeight: 1.2 } as never,
    }),
  );
  if (portrait) {
    // في العمودي يرتفع QR إلى منتصف الأسفل، فتتباعد التواقيع للطرفين.
    const sig = els.filter((e) => e.type === "signature");
    sig[0].y = sig[1].y = H - m - 58;
    const stamp = els.find((e) => e.role === "stamp");
    if (stamp) stamp.y = H - m - 64;
  }
  for (const e of els) e.id = newId();
  return {
    v: 1,
    page,
    palette: look.palette,
    numbers: { digits: "arab", calendar: "gregorian" },
    elements: els,
  };
}
