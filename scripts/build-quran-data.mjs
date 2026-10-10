#!/usr/bin/env node
/**
 * يبني ملف نص المصحف المرجعي لمحرّك الاختبارات: src/data/quran-uthmani.json
 * مع بصمة SHA-256 في src/data/quran-integrity.json
 *
 * لماذا ملف محلي؟ محرّك الاختبارات يجب أن يعمل دون اتصال، وأن يكون نص السؤال
 * والإجابة مأخوذاً من مصدر واحد قابل للتحقق ببصمة. جلب الآيات من الشبكة عند كل
 * سؤال يعني: لا اختبار دون إنترنت، ولا ضمان أن النص لم يتغيّر بين سؤال وآخر.
 *
 * التشغيل: node scripts/build-quran-data.mjs [--offline path/to/quran.json]
 *
 * القاعدة: هذا السكربت لا يُعيد كتابة أي حرف قرآني. العمليتان الوحيدتان هما:
 *   1. حذف علامة BOM إن وُجدت.
 *   2. فصل البسملة عن الآية الأولى (بحذف كلماتها الأربع) في السور التي تُصدَّر
 *      بها في هذه النسخة، ما عدا الفاتحة (البسملة آية فيها) والتوبة (لا بسملة).
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://api.alquran.cloud/v1/quran/quran-uthmani";
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** تطبيع للمقارنة فقط — لا يُكتب إلى ملف البيانات. */
function normalize(text) {
  let t = text.replace(DIACRITICS, "");
  for (const [from, to] of [
    ["\u0671", "ا"],
    ["\u0622", "ا"],
    ["\u0623", "ا"],
    ["\u0625", "ا"],
    ["\u0649", "ي"],
    ["\u0629", "ه"],
  ]) {
    t = t.replaceAll(from, to);
  }
  return t.replace(/\s+/g, " ").trim();
}

const BASMALA = normalize("بسم الله الرحمن الرحيم");
const BASMALA_WORDS = BASMALA.split(" ").length;

async function loadSource() {
  const offlineFlag = process.argv.indexOf("--offline");
  if (offlineFlag !== -1) {
    return JSON.parse(await readFile(process.argv[offlineFlag + 1], "utf8"));
  }
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`فشل جلب المصدر: ${res.status}`);
  return await res.json();
}

/** أسماء السور وأعداد آياتها من ملف المشروع، لضمان تطابق الأسماء المعروضة. */
async function surahMeta() {
  const ts = await readFile(join(ROOT, "src/lib/quran-meta.ts"), "utf8");
  const meta = new Map();
  for (const m of ts.matchAll(/\{ n: (\d+), name: "([^"]+)", ayahs: (\d+) \}/g)) {
    meta.set(Number(m[1]), { name: m[2], ayahs: Number(m[3]) });
  }
  if (meta.size !== 114) throw new Error(`عدد السور في quran-meta.ts = ${meta.size}`);
  return meta;
}

const raw = await loadSource();
const meta = await surahMeta();

const surahs = [];
const juzStarts = new Map();
let basmalaStripped = 0;

for (const surah of raw.data.surahs) {
  const n = surah.number;
  const ayahs = [];
  for (const ayah of surah.ayahs) {
    let text = ayah.text
      .replace(/^\uFEFF/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (ayah.numberInSurah === 1 && n !== 1 && n !== 9 && normalize(text).startsWith(BASMALA)) {
      text = text.split(" ").slice(BASMALA_WORDS).join(" ").trim();
      basmalaStripped += 1;
    }
    ayahs.push(text);
    if (!juzStarts.has(ayah.juz)) juzStarts.set(ayah.juz, [n, ayah.numberInSurah]);
  }
  const info = meta.get(n);
  if (!info) throw new Error(`سورة ${n} غير موجودة في quran-meta.ts`);
  if (ayahs.length !== info.ayahs) {
    throw new Error(`سورة ${info.name}: ${ayahs.length} آية بينما المتوقع ${info.ayahs}`);
  }
  surahs.push({ n, name: info.name, ayahs });
}

const totalAyahs = surahs.reduce((sum, s) => sum + s.ayahs.length, 0);
if (surahs.length !== 114) throw new Error(`عدد السور ${surahs.length}`);
if (totalAyahs !== 6236) throw new Error(`عدد الآيات ${totalAyahs} بينما المتوقع 6236`);
if (juzStarts.size !== 30) throw new Error(`عدد الأجزاء ${juzStarts.size}`);
if (basmalaStripped !== 112) throw new Error(`بسملة مفصولة في ${basmalaStripped} سورة بدل 112`);

const data = {
  edition: "quran-uthmani",
  source: SOURCE,
  retrieved: new Date().toISOString().slice(0, 10),
  totalAyahs,
  juzStarts: Array.from({ length: 30 }, (_, i) => juzStarts.get(i + 1)),
  surahs,
};

const blob = JSON.stringify(data);
const sha256 = createHash("sha256").update(blob, "utf8").digest("hex");

await writeFile(join(ROOT, "src/data/quran-uthmani.json"), blob, "utf8");
await writeFile(
  join(ROOT, "src/data/quran-integrity.json"),
  JSON.stringify(
    {
      file: "src/data/quran-uthmani.json",
      sha256,
      edition: data.edition,
      source: SOURCE,
      retrieved: data.retrieved,
      surahs: 114,
      totalAyahs,
      basmalaPolicy:
        "البسملة مفصولة عن الآية الأولى في 112 سورة؛ الفاتحة تحتفظ بها كآية، والتوبة بلا بسملة.",
      note: "نص المصحف المرجعي لمحرّك الاختبارات. أي تعديل على الملف يُفشل اختبار سلامة النص عمداً.",
      rebuild: "node scripts/build-quran-data.mjs",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`✅ ${surahs.length} سورة · ${totalAyahs} آية · sha256=${sha256}`);
