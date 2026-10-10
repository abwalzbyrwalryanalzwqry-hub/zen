#!/usr/bin/env node
// يولّد ترحيل قصص الأنبياء من public/data/stories/seed.json حتى يبقى المصدران متطابقين.
// الاستخدام: node scripts/gen-stories-migration.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";

const SEED = "public/data/stories/seed.json";
const OUT = "supabase/migrations/20261201100000_prophet_stories.sql";
const check = process.argv.includes("--check");

const { stories } = JSON.parse(readFileSync(SEED, "utf8"));
const rows = stories.map(({ id: _id, ...s }) => s);
const json = JSON.stringify(rows);
if (json.includes("$stories$")) throw new Error("seed contains the dollar-quote tag");

const LEGACY = [
  ["قصة نوح عليه السلام", "nuh"],
  ["قصة إبراهيم عليه السلام", "ibrahim"],
  ["قصة موسى عليه السلام", "musa"],
  ["قصة يوسف عليه السلام", "yusuf"],
  ["سيرة النبي محمد ﷺ", "muhammad"],
];

const sql = `-- قسم القصص الموسَّع: قصص الأنبياء الخمسة والعشرين المذكورين في القرآن.
-- مولَّد بـ scripts/gen-stories-migration.mjs من public/data/stories/seed.json — لا تعدّله يدوياً.
--
-- 1) أعمدة إضافية اختيارية (slug للمطابقة، والقوم والمكان وعدد مرات الذكر وأولو العزم والعبر والمصادر).
-- 2) ربط القصص الخمس الأصلية بـ slug بدلاً من تكرارها، فيبقى تقدّم الطلاب (story_progress) مرتبطاً بها.
-- 3) إدراج/تحديث القصص؛ والقصة التي عدّلها معلّم (updated_at ≠ created_at) لا يُكتب فوقها.
--
-- التراجع (يدوياً عند الحاجة):
--   DELETE FROM public.stories WHERE slug IS NOT NULL AND slug NOT IN (${LEGACY.map(([, s]) => `'${s}'`).join(", ")});
--   ALTER TABLE public.stories DROP COLUMN slug, DROP COLUMN people, DROP COLUMN place, DROP COLUMN mentions,
--     DROP COLUMN ulul_azm, DROP COLUMN lessons, DROP COLUMN sources;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS people text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS place text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mentions integer,
  ADD COLUMN IF NOT EXISTS ulul_azm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_key ON public.stories (slug);

DO $$ BEGIN
  ALTER TABLE public.stories ADD CONSTRAINT stories_mentions_nonneg CHECK (mentions IS NULL OR mentions >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- الربط والإدراج لا يغيّران updated_at، فتبقى "غير معدَّلة" (updated_at = created_at) ويحدّثها ترحيل لاحق بأمان.
ALTER TABLE public.stories DISABLE TRIGGER update_stories_updated_at;

UPDATE public.stories s SET slug = v.slug
  FROM (VALUES
${LEGACY.map(([t, s]) => `    ('${t}', '${s}')`).join(",\n")}
  ) AS v(title, slug)
 WHERE s.slug IS NULL
   AND s.id = (SELECT id FROM public.stories x WHERE x.title = v.title ORDER BY x.created_at, x.id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.stories y WHERE y.slug = v.slug);

INSERT INTO public.stories AS st
  (slug, prophet, title, intro, people, place, mentions, ulul_azm, timeline, ayat, vocabulary, lessons, quiz, sources, sort_order)
SELECT d.slug, d.prophet, d.title, d.intro, d.people, d.place, d.mentions, d.ulul_azm,
       d.timeline, d.ayat, d.vocabulary, d.lessons, d.quiz, d.sources, d.sort_order
  FROM jsonb_to_recordset($stories$${json}$stories$::jsonb) AS d(
    slug text, prophet text, title text, intro text, people text, place text, mentions integer, ulul_azm boolean,
    timeline jsonb, ayat jsonb, vocabulary jsonb, lessons jsonb, quiz jsonb, sources jsonb, sort_order integer)
ON CONFLICT (slug) DO UPDATE SET
  prophet = EXCLUDED.prophet, title = EXCLUDED.title, intro = EXCLUDED.intro,
  people = EXCLUDED.people, place = EXCLUDED.place, mentions = EXCLUDED.mentions, ulul_azm = EXCLUDED.ulul_azm,
  timeline = EXCLUDED.timeline, ayat = EXCLUDED.ayat, vocabulary = EXCLUDED.vocabulary,
  lessons = EXCLUDED.lessons, quiz = EXCLUDED.quiz, sources = EXCLUDED.sources, sort_order = EXCLUDED.sort_order
WHERE st.updated_at = st.created_at;

ALTER TABLE public.stories ENABLE TRIGGER update_stories_updated_at;
`;

if (check) {
  const cur = readFileSync(OUT, "utf8");
  if (cur !== sql) {
    console.error(`${OUT} is stale — run: node scripts/gen-stories-migration.mjs`);
    process.exit(1);
  }
  console.log("stories migration up to date");
} else {
  writeFileSync(OUT, sql);
  console.log(`wrote ${OUT} (${rows.length} stories)`);
}
