#!/usr/bin/env node
// تقييم دقة التسميع الآلي (تدقيق أكتوبر 2026، المرحلة 3). يشغّل مسار الخادم نفسه (runTranscribe: تفريغ أعمى
// ← مقارنة بالنص الموثَّق) على تسجيلات حقيقية موسومة بحكم معلّم متقن، ويطبّق بوابة القبول:
// اكتشاف ≥ 90% وإنذار كاذب ≤ 10% على 20 حالة فأكثر (src/lib/recitation-eval.ts).
//
//   GEMINI_API_KEY=… node scripts/recitation-eval.mjs [--manifest ai-eval/recitation/manifest.jsonl] [--out report.json]
//   node scripts/recitation-eval.mjs --self-test   # المقارنة وحدها على أخطاء مزروعة، بلا صوت ولا شبكة
//
// صيغة السطر في manifest.jsonl:
//   {"id":"r01","file":"audio/r01.webm","surah":"الإخلاص","from":1,"to":4,"hasError":true,"note":"حذف «أحد»"}
import { loadTs as load } from "./lib/load-ts.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};

const ev = await load("src/lib/recitation-eval.ts");
const core = await load("src/lib/recitation-core.ts");
const provider = await load("src/lib/ai-provider-core.ts");
const quranFile = JSON.parse(readFileSync("src/data/quran-uthmani.json", "utf8"));
const pct = (x) => `${Math.round(x * 1000) / 10}%`;

function report(sum, verdicts, selfTest = false) {
  console.log(
    `\nالحالات: ${sum.cases} (بأخطاء ${sum.withErrors}، سليمة ${sum.clean}) · الاكتشاف ${pct(sum.detection)} · الإنذار الكاذب ${pct(sum.falseAlarm)}`,
  );
  if (sum.missed.length) console.log(`  أخطاء لم تُكتشف: ${sum.missed.join("، ")}`);
  if (sum.falseAlarms.length) console.log(`  إنذارات كاذبة: ${sum.falseAlarms.join("، ")}`);
  const out = opt("--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ summary: sum, verdicts }, null, 2));
  }
  console.log(
    selfTest
      ? sum.pass
        ? "✅ المقارنة تكشف كل خطأ مزروع بلا إنذار كاذب (هذا لا يقيّم التفريغ الصوتي)."
        : "❌ المقارنة معطوبة."
      : sum.pass
        ? "✅ تجاوز بوابة القبول: يمكن تفعيل التحليل الآلي."
        : "❌ لم يتجاوز بوابة القبول: يبقى التسميع «تسجيل وإرسال للمعلّم» فقط.",
  );
  process.exit(sum.pass ? 0 : 1);
}

if (flag("--self-test")) {
  const verdicts = [];
  const kinds = ["delete", "substitute", "repeat", "swap"];
  for (let s = 77; s < 114; s++) {
    const ref = quranFile.surahs[s].ayahs.slice(0, 3).join(" ");
    const n = ref.split(" ").length;
    verdicts.push(
      ev.gradeRecitation({ id: `${s}-ok`, hasError: false, reference: ref, transcript: ref }),
    );
    kinds.forEach((k, j) =>
      verdicts.push(
        ev.gradeRecitation({
          id: `${s}-${k}`,
          hasError: true,
          reference: ref,
          transcript: ev.plantError(ref, k, (j * 3 + s) % n),
        }),
      ),
    );
  }
  report(ev.summarizeEval(verdicts), verdicts, true);
}

const env = process.env;
if (provider.providersFromEnv(env).filter((p) => p.audio).length === 0) {
  console.log(
    "⏭️  لا مزوّد يقبل الصوت (GEMINI_API_KEY / OPENAI_API_KEY / LOVABLE_API_KEY): تخطٍّ.",
  );
  process.exit(flag("--require-key") ? 1 : 0);
}
const manifest = opt("--manifest", "ai-eval/recitation/manifest.jsonl");
if (!existsSync(manifest)) {
  console.log(`⏭️  لا ملف ${manifest} بعد. انظر ai-eval/recitation/README.md.`);
  process.exit(flag("--require-key") ? 1 : 0);
}
const base = dirname(manifest);
const cases = readFileSync(manifest, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("//"))
  .map((l) => JSON.parse(l));

const quran = { surahs: quranFile.surahs.map((x) => ({ name: x.name, ayahs: x.ayahs })) };
const verdicts = [];
for (const c of cases) {
  const deps = {
    loadSession: async () => ({
      id: c.id,
      student_id: "eval",
      surah_name: c.surah,
      from_ayah: c.from,
      to_ayah: c.to,
      audio_path: c.file,
    }),
    teachesStudent: async () => false,
    hasAudioConsent: async () => true,
    downloadAudio: async (p) => new Uint8Array(readFileSync(join(base, p))),
    consumeQuota: async () => ({ allowed: true }),
    refundQuota: async () => {},
    complete: async (messages) =>
      (await provider.chatCompleteWith(messages, env, { timeoutMs: 90_000 })).text,
    save: async () => {},
    quran: async () => quran,
  };
  try {
    const r = await core.runTranscribe(deps, "eval", c.id);
    const v = ev.gradeRecitation({
      id: c.id,
      hasError: !!c.hasError,
      reference: r.reference,
      transcript: r.transcript,
    });
    verdicts.push({ ...v, transcript: r.transcript });
    console.log(
      `${v.flagged === v.hasError ? "✓" : "✗"} ${c.id} (${v.score}%)${c.note ? " — " + c.note : ""}`,
    );
  } catch (e) {
    console.log(`⚠️  ${c.id}: ${e instanceof Error ? e.message : e}`);
    verdicts.push({ id: c.id, hasError: !!c.hasError, flagged: false, score: 0 });
  }
}
report(ev.summarizeEval(verdicts), verdicts);
