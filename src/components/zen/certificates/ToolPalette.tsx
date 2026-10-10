import {
  Award,
  BadgeCheck,
  Building2,
  CalendarDays,
  Frame,
  Hash,
  Heading1,
  Image as ImageIcon,
  Minus,
  PaintBucket,
  PenLine,
  QrCode,
  Shapes,
  Sparkles,
  Stamp,
  Star,
  Type,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  make,
  type CertElement,
  type Design,
  type FontSpec,
  type TextEl,
} from "@/lib/certificates/model";

/**
 * أدوات الإضافة: نص، عنوان، صورة، شعار، توقيع، ختم، شكل، خط، إطار، زخرفة، أيقونة، خلفية، QR، رقم الشهادة،
 * التاريخ، وبيانات الطالب/المركز/الحلقة/الإنجاز (نصوص بمتغيّراتها). العنصر الجديد في منتصف الصفحة.
 */
export function ToolPalette({
  design,
  onAdd,
  onBackground,
  typeName,
}: {
  design: Design;
  onAdd: (el: CertElement) => void;
  onBackground: () => void;
  typeName?: string;
}) {
  const t = useT();
  const { width: W, height: H, safe } = design.page;
  const at = (w: number, h: number) => ({
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    w,
    h,
  });
  const text = (
    txt: string,
    w: number,
    h: number,
    font: Partial<FontSpec> = {},
    extra: Partial<TextEl> = {},
  ) =>
    make.text({ ...at(w, h), text: txt, font: { align: "center", ...font } as FontSpec, ...extra });

  const tools: [string, LucideIcon, () => CertElement | null][] = [
    ["text", Type, () => text(t("certificates.el.text"), 120, 14, { size: 14 })],
    [
      "title",
      Heading1,
      () =>
        text(
          typeName ? "{{certificate.type}}" : t("certificates.preset.title"),
          200,
          22,
          { size: 34, weight: 900, color: "$primary" },
          { role: "title" },
        ),
    ],
    ["image", ImageIcon, () => make.image(at(40, 40))],
    [
      "logo",
      Award,
      () =>
        make.image({
          ...at(28, 28),
          src: "brand:logo",
          role: "logo",
          name: t("certificates.tool.logo"),
        }),
    ],
    [
      "signature",
      PenLine,
      () =>
        make.signature({
          ...at(55, 28),
          src: "brand:signature:teacher",
          label: t("certificates.sig.teacher"),
          signer: "{{teacher.name}}",
        }),
    ],
    [
      "stamp",
      Stamp,
      () =>
        make.image({
          ...at(32, 32),
          src: "brand:stamp",
          role: "stamp",
          name: t("certificates.tool.stamp"),
        }),
    ],
    ["shape", Shapes, () => make.shape(at(60, 30))],
    ["line", Minus, () => make.line(at(100, 2))],
    [
      "frame",
      Frame,
      () => make.frame({ x: safe, y: safe, w: W - 2 * safe, h: H - 2 * safe, role: "decoration" }),
    ],
    ["ornament", Sparkles, () => make.ornament({ ...at(30, 30), role: "decoration" })],
    ["icon", Star, () => make.ornament({ ...at(14, 14), ornament: "star8", role: "decoration" })],
    ["background", PaintBucket, () => null],
    ["qr", QrCode, () => make.qr({ x: W - safe - 24, y: H - safe - 24, w: 22, h: 22 })],
    [
      "number",
      Hash,
      () =>
        text(
          "{{certificate.number}}",
          60,
          6,
          { size: 9, weight: 500, color: "$muted", dir: "ltr" },
          { role: "number" },
        ),
    ],
    [
      "date",
      CalendarDays,
      () =>
        text(
          t("certificates.text.dateLine"),
          90,
          8,
          { size: 11, color: "$muted" },
          { role: "date" },
        ),
    ],
    [
      "studentData",
      User,
      () =>
        text(
          "{{student.name}}",
          180,
          20,
          { size: 30, weight: 900 },
          { role: "studentName", autoFit: { enabled: true, min: 14 } },
        ),
    ],
    [
      "centerData",
      Building2,
      () =>
        text(
          "{{center.name}}",
          140,
          10,
          { size: 14, weight: 500, color: "$primary" },
          { role: "header" },
        ),
    ],
    [
      "circleData",
      Users,
      () => text(t("certificates.text.circleLine"), 160, 9, { size: 12, color: "$muted" }),
    ],
    [
      "achievementData",
      BadgeCheck,
      () =>
        text(
          "{{achievement.description}}",
          200,
          26,
          { size: 14, lineHeight: 1.75 },
          { role: "body", autoFit: { enabled: true, min: 10 } },
        ),
    ],
  ];

  return (
    <nav
      aria-label={t("certificates.designer.tools")}
      className="shrink-0 lg:w-[88px] border-b lg:border-b-0 lg:border-e border-border/60 bg-card/60 overflow-x-auto lg:overflow-y-auto"
    >
      <ul className="flex lg:grid lg:grid-cols-1 gap-0.5 p-1.5">
        {tools.map(([key, Icon, mk]) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => {
                if (key === "background") return onBackground();
                const el = mk();
                if (el) onAdd(el);
              }}
              className="w-[72px] flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.625rem] font-bold text-foreground/80 hover:bg-primary/10 hover:text-primary"
            >
              <Icon className="w-4.5 h-4.5" aria-hidden="true" />
              <span className="leading-tight text-center">{t(`certificates.tool.${key}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
