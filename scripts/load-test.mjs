#!/usr/bin/env node
/**
 * اختبار الحمل (المرحلة 14.4) على PostgreSQL مضمّن بالترحيلات نفسها:
 * مركز واحد فيه 20 حلقة و500 طالب، وسجل حلقات 14 يوماً (عبر record_halaqa_session نفسه) وحضور 60 يوماً،
 * ثم يقيس زمن تنفيذ:
 *   • center_dashboard(center, 30)   — مدير المركز
 *   • record_halaqa_session(…, 25)   — معلّم يسجّل حلقة كاملة (يُتراجع عنها بعد القياس)
 *   • my_today_queue()               — طالب
 * الهدف: p95 ≤ 100 مللي ثانية لكلٍّ منها (يُغيَّر بـ --target). يخرج بـ 1 إن تجاوزه أحدها.
 *
 *   npm run test:load            node scripts/load-test.mjs --students 500 --halaqat 20 --runs 40
 */
import EmbeddedPostgresModule from "embedded-postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const EmbeddedPostgres = EmbeddedPostgresModule.default ?? EmbeddedPostgresModule;
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const STUDENTS = opt("--students", 500);
const HALAQAT = opt("--halaqat", 20);
const RUNS = opt("--runs", 40);
const TARGET = opt("--target", 100);

const TESTS = path.join("supabase", "tests");
const MIG = path.join("supabase", "migrations");
const DATA_DIR = path.join(os.tmpdir(), `zen-load-${process.pid}`);

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: Number(process.env.LOAD_PG_PORT || 55433),
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});

const uuid = (prefix, n) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`.replace(/^(.{8})/, "$1");

function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  await pg.initialise();
  await pg.start();
  const db = pg.getPgClient();
  await db.connect();
  try {
    process.stdout.write("تهيئة القاعدة والترحيلات… ");
    await db.query(fs.readFileSync(path.join(TESTS, "bootstrap.sql"), "utf8"));
    for (const f of fs
      .readdirSync(MIG)
      .filter((x) => x.endsWith(".sql"))
      .sort())
      await db.query(fs.readFileSync(path.join(MIG, f), "utf8"));
    console.log("تم");

    const manager = uuid("aaaaaaaa", 1);
    const teachers = Array.from({ length: HALAQAT }, (_, i) => uuid("bbbbbbbb", i + 1));
    const students = Array.from({ length: STUDENTS }, (_, i) => uuid("cccccccc", i + 1));
    const center = uuid("dddddddd", 1);
    const halaqat = teachers.map((_, i) => uuid("eeeeeeee", i + 1));
    const per = Math.ceil(STUDENTS / HALAQAT);

    process.stdout.write(`بذر ${STUDENTS} طالب و${HALAQAT} حلقة… `);
    const t0 = performance.now();
    await db.query(
      `INSERT INTO auth.users (id, raw_user_meta_data)
       SELECT u, jsonb_build_object('name', 'مستخدم ' || i)
         FROM unnest($1::uuid[]) WITH ORDINALITY AS x(u, i)`,
      [[manager, ...teachers, ...students]],
    );
    await db.query(
      `INSERT INTO public.user_roles (user_id, role)
       SELECT u, 'teacher' FROM unnest($1::uuid[]) u ON CONFLICT DO NOTHING`,
      [[manager, ...teachers]],
    );
    await db.query(
      `INSERT INTO public.centers (id, name, created_by) VALUES ($1, 'مركز الحمل', $2)`,
      [center, manager],
    );
    await db.query(
      `INSERT INTO public.halaqat (id, center_id, name, teacher_id)
       SELECT h, $1, 'حلقة ' || i, t FROM unnest($2::uuid[], $3::uuid[]) WITH ORDINALITY AS x(h, t, i)`,
      [center, halaqat, teachers],
    );
    await db.query(
      `INSERT INTO public.halaqa_students (halaqa_id, student_id)
       SELECT ($1::uuid[])[((i - 1) / $3) + 1], s FROM unnest($2::uuid[]) WITH ORDINALITY AS x(s, i)`,
      [halaqat, students, per],
    );
    // حضور قديم (15..60 يوماً) مباشرة، ثم 14 يوماً عبر record_halaqa_session نفسه (جلسات وتقييمات وجدولة).
    await db.query(
      `INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
       SELECT hs.student_id, hs.halaqa_id, h.teacher_id, public.zen_today() - d,
              (ARRAY['present','present','present','late','absent'])[1 + (abs(hashtext(hs.student_id::text || d)) % 5)]
         FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id,
              generate_series(15, 60) d`,
    );
    const members = new Map();
    for (const h of halaqat) {
      const r = await db.query(
        `SELECT student_id FROM public.halaqa_students WHERE halaqa_id = $1`,
        [h],
      );
      members.set(
        h,
        r.rows.map((x) => x.student_id),
      );
    }
    const rowsFor = (h, day) =>
      members.get(h).map((sid, i) => ({
        student_id: sid,
        status: (i + day) % 9 === 0 ? "absent" : "present",
        surah_name: "البقرة",
        from_ayah: 1 + ((day * 5 + i) % 270),
        to_ayah: 5 + ((day * 5 + i) % 270),
        kind: day % 3 === 0 ? "review" : "memorize",
        grade: 3 + ((i + day) % 3),
      }));
    for (let day = 14; day >= 1; day--) {
      for (let k = 0; k < halaqat.length; k++) {
        await db.query("BEGIN");
        await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [teachers[k]]);
        await db.query(
          `SELECT public.record_halaqa_session($1, public.zen_today() - $2::int, $3::jsonb)`,
          [halaqat[k], day, JSON.stringify(rowsFor(halaqat[k], day))],
        );
        await db.query("COMMIT");
      }
    }
    // طابور واقعي: واجبات (معلّقة ومنجزة) ومراجعات مستحقة لكل طالب.
    await db.query(
      `INSERT INTO public.assignments (student_id, teacher_id, halaqa_id, kind, surah_name, from_ayah, to_ayah, due_date, status)
       SELECT hs.student_id, h.teacher_id, h.id, (ARRAY['memorize','review'])[1 + k % 2], 'آل عمران',
              k * 5 + 1, k * 5 + 5, public.zen_today() + (k - 3), (ARRAY['pending','done','redo','done'])[1 + k % 4]
         FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id, generate_series(0, 7) k`,
    );
    await db.query(
      `UPDATE public.review_cards SET due_date = public.zen_today() - (abs(hashtext(id::text)) % 5)
        WHERE abs(hashtext(id::text)) % 3 = 0`,
    );
    await db.query("ANALYZE");
    const counts = (
      await db.query(`SELECT (SELECT count(*) FROM public.attendance) a,
                             (SELECT count(*) FROM public.recitation_sessions) s,
                             (SELECT count(*) FROM public.recitation_assessments) r`)
    ).rows[0];
    console.log(
      `تم في ${((performance.now() - t0) / 1000).toFixed(1)} ث (حضور ${counts.a}، جلسات ${counts.s}، تقييمات ${counts.r})`,
    );

    const qn = await db.query(
      `SELECT avg(jsonb_array_length(public.today_queue_for(s)->'items'))::numeric(6,1) AS n
         FROM unnest($1::uuid[]) s`,
      [students.slice(0, 50)],
    );
    console.log(`متوسط بنود طابور اليوم للطالب: ${qn.rows[0].n}`);

    // يقيس نداءً واحداً بدور authenticated وهوية المستخدم، داخل معاملة.
    async function time(uid, sql, params, rollback = false) {
      await db.query("BEGIN");
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await db.query("SET LOCAL ROLE authenticated");
      const s = performance.now();
      await db.query(sql, params);
      const ms = performance.now() - s;
      await db.query(rollback ? "ROLLBACK" : "COMMIT");
      return ms;
    }

    const results = [];
    async function bench(name, fn) {
      await fn(0); // تسخين
      const xs = [];
      for (let i = 1; i <= RUNS; i++) xs.push(await fn(i));
      const r = { name, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs) };
      results.push(r);
      const ok = r.p95 <= TARGET;
      console.log(
        `${ok ? "✅" : "❌"} ${name.padEnd(24)} p50 ${r.p50.toFixed(1).padStart(6)} · p95 ${r.p95
          .toFixed(1)
          .padStart(6)} · أقصى ${r.max.toFixed(1).padStart(6)} مللي ثانية`,
      );
    }

    console.log(`\nالقياس (${RUNS} نداء لكلٍّ، الهدف p95 ≤ ${TARGET} مللي ثانية):`);
    await bench("center_dashboard", () =>
      time(manager, `SELECT public.center_dashboard($1, 30)`, [center]),
    );
    await bench("record_halaqa_session", (i) => {
      const k = i % halaqat.length;
      return time(
        teachers[k],
        `SELECT public.record_halaqa_session($1, public.zen_today(), $2::jsonb)`,
        [halaqat[k], JSON.stringify(rowsFor(halaqat[k], 0))],
        true,
      );
    });
    await bench("my_today_queue", (i) =>
      time(students[(i * 37) % students.length], `SELECT public.my_today_queue()`, []),
    );

    const failed = results.filter((r) => r.p95 > TARGET);
    if (process.env.LOAD_JSON)
      fs.writeFileSync(process.env.LOAD_JSON, JSON.stringify(results, null, 2));
    console.log(
      failed.length
        ? `\n❌ تجاوز الهدف: ${failed.map((r) => r.name).join("، ")}`
        : "\n✅ كل الدوال ضمن الهدف.",
    );
    return failed.length ? 1 : 0;
  } finally {
    await db.end();
    await pg.stop();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("fatal:", e.message ?? e);
    process.exit(1);
  });
