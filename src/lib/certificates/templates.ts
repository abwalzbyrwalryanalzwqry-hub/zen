/**
 * القوالب الثمانية الجاهزة (قوالب النظام). تصاميم رسمية هادئة بزخارف هندسية إسلامية متجهة، لا صور ولا
 * رموز تعبيرية. كلها تقرأ من هوية المركز (brand:logo، brand:stamp، brand:signature:*) ولوحته، ومن
 * المتغيّرات، فيصلح القالب الواحد لكل نوع: العنوان {{certificate.type}} والنص {{achievement.description}}
 * (نص النوع الشرطي). نسخ قالب نظام إلى المركز يجعله قالباً قابلاً للتعديل بنسخه.
 */
import { t } from "@/lib/i18n";
import type { Design, Palette } from "./model";
import { build } from "./layout";

export type GalleryCategory =
  | "luxury"
  | "official"
  | "islamic"
  | "simple"
  | "modern"
  | "quran"
  | "achievement"
  | "thanks"
  | "excellence";

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "luxury",
  "official",
  "islamic",
  "simple",
  "modern",
  "quran",
  "achievement",
  "thanks",
  "excellence",
];

export interface SystemTemplate {
  key: string;
  categories: GalleryCategory[];
  /** الأنواع التي يُقترح لها أولاً (لا يمنع غيرها). */
  types: string[];
  build: () => Design;
}

const GREEN_GOLD: Palette = {
  primary: "#1f5d46",
  accent: "#b08d57",
  ink: "#1d2a24",
  paper: "#fbf8f1",
  muted: "#5f6f66",
};

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: "royal_islamic",
    categories: ["luxury", "islamic"],
    types: ["quran_complete", "juz_complete", "distinction"],
    build: () =>
      build({
        orientation: "landscape",
        palette: { ...GREEN_GOLD, primary: "#17483a", paper: "#fbf7ee" },
        frame: "royal",
        frameThickness: 1.6,
        pattern: { kind: "girih", opacity: 0.07 },
        crest: "medallion",
        divider: true,
        titleSize: 34,
        nameSize: 30,
      }),
  },
  {
    key: "classic_quran",
    categories: ["quran", "islamic", "official"],
    types: ["memorization", "surah_complete", "juz_complete"],
    build: () =>
      build({
        orientation: "landscape",
        palette: GREEN_GOLD,
        frame: "islamic",
        frameThickness: 1.2,
        crest: "book",
        divider: true,
        titleSize: 32,
        nameSize: 28,
      }),
  },
  {
    key: "elegant_minimal",
    categories: ["simple"],
    types: ["participation", "attendance", "appreciation"],
    build: () =>
      build({
        orientation: "landscape",
        palette: {
          primary: "#2b3a33",
          accent: "#a88b5c",
          ink: "#22302a",
          paper: "#ffffff",
          muted: "#6d7a73",
        },
        frame: "minimal",
        frameThickness: 0.8,
        divider: true,
        titleSize: 30,
        nameSize: 28,
      }),
  },
  {
    key: "modern_achievement",
    categories: ["modern", "achievement"],
    types: ["achievement", "memorization", "revision"],
    build: () =>
      build({
        orientation: "landscape",
        palette: {
          primary: "#1d5c55",
          accent: "#c09a5b",
          ink: "#1b2726",
          paper: "#fdfcf8",
          muted: "#5d6d6a",
        },
        frame: "corners",
        frameThickness: 1.4,
        sideBand: true,
        crest: "laurel",
        titleSize: 32,
        nameSize: 30,
      }),
  },
  {
    key: "official_center",
    categories: ["official"],
    types: ["course_complete", "attendance", "perseverance", "special"],
    build: () =>
      build({
        orientation: "landscape",
        palette: {
          primary: "#1f4f45",
          accent: "#9c8456",
          ink: "#1f2a27",
          paper: "#ffffff",
          muted: "#5b6a65",
        },
        frame: "double",
        frameThickness: 1,
        headerRow: true,
        titleSize: 30,
        nameSize: 28,
      }),
  },
  {
    key: "premium_gold",
    categories: ["luxury", "excellence"],
    types: ["distinction", "excellence", "appreciation"],
    build: () =>
      build({
        orientation: "landscape",
        palette: {
          primary: "#2a2a24",
          accent: "#b48a3c",
          ink: "#22211d",
          paper: "#fbf6e9",
          muted: "#6b6455",
        },
        frame: "gold",
        frameThickness: 1.4,
        corners: true,
        crest: "rosette",
        divider: true,
        titleSize: 34,
        nameSize: 30,
      }),
  },
  {
    key: "quran_completion",
    categories: ["quran", "islamic", "luxury"],
    types: ["quran_complete", "juz_complete"],
    build: () =>
      build({
        orientation: "portrait",
        palette: { ...GREEN_GOLD, primary: "#164a3b" },
        frame: "islamic",
        frameThickness: 1.4,
        pattern: { kind: "stars", opacity: 0.05 },
        crest: "arch",
        divider: true,
        titleSize: 30,
        nameSize: 28,
      }),
  },
  {
    key: "student_excellence",
    categories: ["excellence", "achievement", "thanks"],
    types: ["excellence", "distinction", "appreciation"],
    build: () =>
      build({
        orientation: "landscape",
        palette: { ...GREEN_GOLD, primary: "#24533f", paper: "#fcfaf4" },
        frame: "classic",
        frameThickness: 1.2,
        pattern: { kind: "lattice", opacity: 0.05 },
        crest: "seal",
        divider: true,
        titleSize: 34,
        nameSize: 30,
      }),
  },
  {
    // 1.26.0 (الفكرة 7): الإجازة — نص الإسناد والرواية بدل نص النوع، وتوقيع الشيخ المجيز (توقيع المعلّم).
    key: "ijazah_classic",
    categories: ["quran", "luxury", "islamic"],
    types: ["ijazah"],
    build: () =>
      ijazah(
        build({
          orientation: "portrait",
          palette: { ...GREEN_GOLD, primary: "#17483a", paper: "#fbf7ee" },
          frame: "gold",
          frameThickness: 1.4,
          pattern: { kind: "girih", opacity: 0.05 },
          crest: "book",
          divider: true,
          titleSize: 32,
          nameSize: 28,
        }),
      ),
  },
];

/** يحوّل قالباً عاماً إلى إجازة: سطر التقديم ونص الإسناد، وصفة الموقّع الأول «الشيخ المجيز». */
function ijazah(d: Design): Design {
  return {
    ...d,
    elements: d.elements.map((e) => {
      if (e.type === "text" && e.text === "{{achievement.description}}")
        return { ...e, text: t("certificates.text.ijazahBody"), h: e.h * 1.6 };
      if (e.type === "text" && e.text === t("certificates.text.presents"))
        return { ...e, text: t("certificates.text.ijazahPresents") };
      if (e.type === "signature" && e.src === "brand:signature:teacher")
        return { ...e, label: t("certificates.sig.sheikh") };
      return e;
    }),
  };
}

export const systemTemplate = (key: string) => SYSTEM_TEMPLATES.find((s) => s.key === key) ?? null;
export const systemTemplateName = (key: string) => t(`certificates.tpl.${key}.name`);
