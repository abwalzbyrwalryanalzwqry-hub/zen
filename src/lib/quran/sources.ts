// ============================================================
// زِن — مصادر قسم المصحف وتراخيصها (منقولة من منار)
// ------------------------------------------------------------
// كل بيانات القرآن في التطبيق من مصادر مفتوحة يشترط أغلبها ذكر
// المصدر ورابطه داخل التطبيق (ترخيص Tanzil خصوصاً). هذه القائمة
// هي المرجع الوحيد: صفحة «المصادر والتراخيص» تعرضها كما هي.
// ============================================================

import { TAFSIR_EDITIONS } from "@/lib/quran/tafsir-service";
import { RECITATION_SOURCE_URL } from "@/lib/quran/recitations";
import { MAQASID_SOURCE } from "@/lib/quran/surah-maqasid";

export interface SourceItem {
  titleAr: string;
  /** ما يُستعمل من المصدر في التطبيق. */
  usedForAr: string;
  byAr: string;
  licenseAr: string;
  url: string;
  /** نص الإسناد كما يطلبه المصدر، إن وُجد. */
  notice?: string;
}

export interface SourceGroup {
  titleAr: string;
  items: SourceItem[];
}

/** نص إشعار الحقوق كما يطلب Tanzil إدراجه (https://tanzil.net/docs/text_license). */
export const TANZIL_NOTICE = [
  "Tanzil Quran Text",
  "Copyright (C) 2007-2021 Tanzil Project",
  "License: Creative Commons Attribution 3.0",
  "",
  "This copy of the Quran text is carefully produced, highly verified and continuously monitored by a group of specialists in Tanzil Project.",
  "",
  "TERMS OF USE:",
  "- Permission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT ALLOWED.",
  "- This Quran text can be used in any website or application, provided that its source (Tanzil Project) is clearly indicated, and a link is made to tanzil.net to enable users to keep track of changes.",
  "- This copyright notice shall be included in all verbatim copies of the text, and shall be reproduced appropriately in all files derived from or containing substantial portion of this text.",
  "",
  "Please check updates at: http://tanzil.net/updates/",
].join("\n");

export const SOURCES: SourceGroup[] = [
  {
    titleAr: "نص القرآن الكريم",
    items: [
      {
        titleAr: "مشروع تنزيل (Tanzil)",
        usedForAr:
          "النص العثماني لكل الآيات، وحدود الصفحات والأجزاء والأحزاب. يُعرض النص كما هو دون تغيير.",
        byAr: "Tanzil Project — عبر واجهة alquran.cloud",
        licenseAr: "المشاع الإبداعي، نسب المصنَّف ٣٫٠ (CC BY 3.0)، ولا يجوز تعديل النص",
        url: "https://tanzil.net",
        notice: TANZIL_NOTICE,
      },
      {
        titleAr: "تخطيط مصحف المدينة (١٥ سطراً)",
        usedForAr: "توزيع الكلمات على أسطر صفحات المصحف في وضع المصحف.",
        byAr: "Quran.com (بيانات الطبعة الأولى V1)",
        licenseAr: "يُذكر المصدر وفق شروط Quran.com",
        url: "https://api-docs.quran.foundation",
      },
      {
        titleAr: "خط حفص العثماني",
        usedForAr: "رسم المصحف وعلامات الآيات في وضع المصحف. الملف مضمّن دون تعديل.",
        byAr: "مجمع الملك فهد لطباعة المصحف الشريف (KFGQPC)",
        licenseAr: "رخصة المجمع المرفقة مع الخط",
        url: "/fonts/KFGQPC-FONT-LICENSE.txt",
      },
    ],
  },
  {
    titleAr: "التفسير",
    items: [
      ...TAFSIR_EDITIONS.map<SourceItem>((e) => ({
        titleAr: e.nameAr,
        usedForAr:
          e.slug === "ar-tafsir-muyassar"
            ? "تفسير كل آية، ومقدّمة كل سورة (تسمية السورة ومن مقاصدها) كما وردت في نسخة الميسّر الرقمية، مضمّناً ليعمل بدون إنترنت."
            : "تفسير كل آية في شاشة التفسير، مضمّناً في التطبيق ليعمل بدون إنترنت.",
        byAr:
          e.slug === "ar-tafsir-muyassar"
            ? `${e.authorAr} لطباعة المصحف الشريف (الطبعة الثانية، مزيدة ومنقّحة) — عبر مكتبة QUL (Tarteel)`
            : `${e.authorAr} — عبر مكتبة QUL (Tarteel)`,
        licenseAr: "يُنقل كما هو، ويُذكر المصدر وفق شروط المكتبة",
        url: e.sourceUrl,
      })),
      {
        titleAr: "من مقاصد السورة",
        usedForAr: "سطر «من مقاصد السورة» في بطاقة كل سورة.",
        byAr: `${MAQASID_SOURCE.nameAr} — ${MAQASID_SOURCE.authorAr}، عبر موسوعة القرآن الكريم`,
        licenseAr: "يُنقل كما هو، ويُذكر المصدر وفق شروط الموسوعة",
        url: MAQASID_SOURCE.url,
      },
    ],
  },
  {
    titleAr: "الخطوط",
    items: [
      {
        titleAr: "Amiri Quran",
        usedForAr: "خط بديل لنص القرآن. الملف مضمّن دون تعديل.",
        byAr: "The Amiri Project Authors",
        licenseAr: "رخصة SIL المفتوحة للخطوط 1.1 (OFL)، نصّها مرفق مع الخط",
        url: "/fonts/OFL-Amiri.txt",
      },
      {
        titleAr: "Noto Naskh Arabic",
        usedForAr: "خط بديل لنص القرآن. الملف مضمّن دون تعديل.",
        byAr: "The Noto Project Authors",
        licenseAr: "رخصة SIL المفتوحة للخطوط 1.1 (OFL)، نصّها مرفق مع الخط",
        url: "/fonts/OFL-NotoNaskhArabic.txt",
      },
      {
        titleAr: "Scheherazade New",
        usedForAr: "خط بديل لنص القرآن. الملف مضمّن دون تعديل.",
        byAr: "SIL Global",
        licenseAr: "رخصة SIL المفتوحة للخطوط 1.1 (OFL)، نصّها مرفق مع الخط",
        url: "/fonts/OFL-ScheherazadeNew.txt",
      },
      {
        titleAr: "Markazi Text",
        usedForAr: "خط الواجهة والعناوين والتقارير والشهادات. الملف مضمّن دون تعديل.",
        byAr: "Borna Izadpanah (Google Fonts)",
        licenseAr: "رخصة SIL المفتوحة للخطوط 1.1 (OFL)، نصّها مرفق مع الخط",
        url: "/fonts/OFL-MarkaziText.txt",
      },
    ],
  },
  {
    titleAr: "التلاوات",
    items: [
      {
        titleAr: "EveryAyah",
        usedForAr: "ملفات التلاوة آية آية لكل القرّاء، بثاً أو تحميلاً للاستماع بدون إنترنت.",
        byAr: "everyayah.com",
        licenseAr: "يُذكر المصدر وفق شروط الموقع",
        url: RECITATION_SOURCE_URL,
      },
    ],
  },
];
