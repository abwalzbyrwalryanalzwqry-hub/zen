/**
 * اختبار ترحيلات قاعدة البيانات على PostgreSQL حقيقي.
 *
 * يُشغّل نسخة PostgreSQL مضمّنة (embedded-postgres)، يبني فيها الحد الأدنى من
 * بيئة Supabase (مخططات auth و storage، ودوال auth.uid، وجداول المستخدمين
 * والحاويات، ونشر realtime) من bootstrap.sql، ثم يُنفّذ كل ترحيلات
 * supabase/migrations بالترتيب، ثم يُشغّل اختبارات السلوك في checks.sql.
 *
 * التشغيل:  npm run test:db
 *
 * قيمته: يمسك أخطاء الترحيلات وثغرات سياسات RLS قبل الوصول إلى قاعدة الإنتاج،
 * بدل اكتشافها بعد supabase db push.
 */
import EmbeddedPostgresModule from "embedded-postgres";

const EmbeddedPostgres = EmbeddedPostgresModule.default ?? EmbeddedPostgresModule;
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.join(TESTS_DIR, "..", "migrations");
const DATA_DIR = path.join(os.tmpdir(), `zen-pgtest-${process.pid}`);

(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: Number(process.env.TEST_PG_PORT || 55432),
    persistent: false,
    // كقاعدة Supabase: UTF8 (تحتاجه normalize() في توحيد أسماء المستخدمين).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (m) => {
      if (process.env.PG_DEBUG) console.log("[pg]", String(m).trim());
    },
    onError: (m) => {
      if (process.env.PG_DEBUG) console.log("[pg-err]", String(m).trim());
    },
  });

  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();

  let failed = 0;

  const run = async (label, sql) => {
    try {
      await client.query(sql);
      console.log(`✅ ${label}`);
      return true;
    } catch (e) {
      failed++;
      const pos = e.position ? ` (position ${e.position})` : "";
      console.log(`❌ ${label}\n   ${e.message}${pos}${e.hint ? `\n   hint: ${e.hint}` : ""}`);
      return false;
    }
  };

  console.log("=== تهيئة بيئة شبيهة بـ Supabase ===");
  await run("bootstrap", fs.readFileSync(path.join(TESTS_DIR, "bootstrap.sql"), "utf8"));
  await run(
    "جداول مساعدة للاختبار",
    `CREATE TABLE IF NOT EXISTS public._check_log (msg text);
     GRANT ALL ON public._check_log TO authenticated;
     CREATE TABLE IF NOT EXISTS public._t (code text);
     GRANT ALL ON public._t TO authenticated;`,
  );

  console.log("\n=== الترحيلات ===");
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const before = failed;
  for (const f of files) {
    await run(f, fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
  }
  const migrationsFailed = failed - before;
  console.log(`\n${files.length - migrationsFailed}/${files.length} ترحيل نجح`);

  if (migrationsFailed === 0) {
    console.log("\n=== اختبارات السلوك ===");
    const checks = fs.readFileSync(path.join(TESTS_DIR, "checks.sql"), "utf8");
    for (const block of checks.split("-- @@")) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const [nameLine, ...rest] = trimmed.split("\n");
      try {
        const res = await client.query(rest.join("\n"));
        const all = Array.isArray(res) ? res : [res];
        const withRows = all.filter((r) => r.rows && r.rows.length);
        const rows = withRows.length ? withRows[withRows.length - 1].rows : [];
        const bad = JSON.stringify(rows).match(
          /ALLOWED!|REUSED!|STUDENT_MARKED|OUTSIDER_MARKED|FAILED|LEAKED!/,
        );
        if (bad) {
          failed++;
          console.log(`❌ ${nameLine}  ⇒ ${JSON.stringify(rows)}`);
        } else {
          console.log(`✅ ${nameLine}  ⇒ ${JSON.stringify(rows)}`);
        }
      } catch (e) {
        failed++;
        console.log(`❌ ${nameLine}\n   ${e.message}${e.where ? `\n   where: ${e.where}` : ""}`);
      }
    }
  }

  // ملفات تحقق الإنتاج (supabase/verify): تُجرَّب هنا كي لا يفشل أول تشغيل لها على الإنتاج.
  if (migrationsFailed === 0) {
    const VERIFY_DIR = path.join(TESTS_DIR, "..", "verify");
    const verify = fs.existsSync(VERIFY_DIR)
      ? fs
          .readdirSync(VERIFY_DIR)
          .filter((f) => f.endsWith(".sql"))
          .sort()
      : [];
    if (verify.length) console.log("\n=== ملفات تحقق الإنتاج ===");
    for (const f of verify)
      await run(`verify/${f}`, fs.readFileSync(path.join(VERIFY_DIR, f), "utf8"));
  }

  await client.end();
  await pg.stop();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  if (failed > 0) {
    console.log(`\n❌ فشل ${failed} اختباراً.`);
    process.exit(1);
  }
  console.log("\n✅ كل اختبارات قاعدة البيانات نجحت.");
})().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
