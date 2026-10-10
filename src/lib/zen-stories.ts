// قصص الأنبياء: الأنواع والقراءة والتقدّم (M5: من zen-lms.ts دون تغيير السلوك؛ يُعاد تصديرها منه).

import { supabase } from "@/integrations/supabase/client";
import { readLocalJson, writeLocalJson } from "@/lib/storage";

const db = supabase;

/** `n` رقم السورة (اختياري؛ القصص القديمة بالاسم فقط). */
export type StoryAyah = { surah: string; n?: number; from: number; to: number };
/** `explain` سبب الإجابة الصحيحة مع موضعها من القرآن (اختياري). */
export type StoryQuizItem = { q: string; options: string[]; answer: number; explain?: string };
export type StorySource = { title: string; url: string };

export type Story = {
  id: string;
  prophet: string;
  title: string;
  intro: string;
  timeline: string[];
  ayat: StoryAyah[];
  vocabulary: { word: string; meaning: string }[];
  quiz: StoryQuizItem[];
  sort_order: number;
  /* حقول القسم الموسَّع (ترحيل 20261201100000)؛ اختيارية حتى تعمل القصص التي يضيفها المعلّمون بدونها. */
  slug?: string | null;
  people?: string;
  place?: string;
  mentions?: number | null;
  ulul_azm?: boolean;
  lessons?: string[];
  sources?: StorySource[];
};

export type StoryProgress = {
  story_id: string;
  last_step: number;
  quiz_score: number | null;
  completed: boolean;
};

/**
 * تقدّم القصص المضمَّنة (seed-) على الجهاز: لا صف لها على الخادم، فيُحفظ محلياً حتى يرى الضيف
 * ومن بلا اتصال أين توقّف وما أتمّه.
 */
const LOCAL_PROGRESS_KEY = "zen.stories.progress.v1";

export function localStoryProgress(): StoryProgress[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_PROGRESS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as StoryProgress[]) : [];
  } catch {
    return [];
  }
}

function saveLocalStoryProgress(p: {
  story_id: string;
  last_step: number;
  quiz_score?: number | null;
  completed?: boolean;
}) {
  try {
    const list = localStoryProgress();
    const old = list.find((x) => x.story_id === p.story_id);
    const next: StoryProgress = {
      story_id: p.story_id,
      last_step: p.last_step,
      quiz_score: p.quiz_score ?? old?.quiz_score ?? null,
      completed: p.completed ?? old?.completed ?? false,
    };
    globalThis.localStorage?.setItem(
      LOCAL_PROGRESS_KEY,
      JSON.stringify([...list.filter((x) => x.story_id !== p.story_id), next]),
    );
  } catch {
    /* التخزين غير متاح: لا شيء يُحفظ */
  }
}

/** الاسم المعتمد للقصة بين النسختين: slug إن وُجد، وإلا المعرّف. */
export const storyKey = (s: Pick<Story, "id" | "slug">) => s.slug || s.id;

/* ─────────── Stories ─────────── */

/**
 * قصص الأنبياء مضمَّنة في التطبيق أيضاً (M13): `public/data/stories/seed.json` نسخة من القصص الأساسية
 * (ترحيل 20260906005126) بمعرّفات `seed-{ترتيب}`. تُعرض حين لا تصل قائمة الخادم (أول فتح بلا اتصال
 * أو وضع الضيف). قائمة الخادم تغلب حين تصل، لأن المعلّمين قد يضيفون قصصاً أو يعدّلونها.
 */
export const SEED_STORIES_URL = "/data/stories/seed.json";
export const isSeedStory = (id: string) => id.startsWith("seed-");
let seedCache: Promise<Story[]> | null = null;

export function seedStories(fetcher: typeof fetch = fetch): Promise<Story[]> {
  seedCache ??= fetcher(SEED_STORIES_URL)
    .then((r) => (r.ok ? (r.json() as Promise<{ stories?: Story[] }>) : { stories: [] }))
    .then((j) => (Array.isArray(j.stories) ? j.stories : []))
    .catch(() => {
      seedCache = null;
      return [];
    });
  return seedCache;
}

/**
 * نسخة الجهاز من قائمة الخادم كاملةً (1.35.0): نص كل قصة يُحفظ عند أول وصول للقائمة، فتُقرأ القصص كلها بلا
 * اتصال، حتى التي لم تُفتح من قبل. كان فتح قصة بلا اتصال يطلبها من الخادم بمعرّفها فيفشل ولا يظهر نصها.
 */
export const STORIES_LOCAL_KEY = "zen-stories-v1";

export async function listStories(): Promise<Story[]> {
  try {
    const { data, error } = await db
      .from("stories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data && data.length) {
      writeLocalJson(STORIES_LOCAL_KEY, data);
      return data as unknown as Story[];
    }
  } catch {
    /* بلا اتصال: نسخة الجهاز ثم النسخة المضمَّنة */
  }
  const local = readLocalJson<Story[]>(STORIES_LOCAL_KEY, []);
  return Array.isArray(local) && local.length ? local : seedStories();
}

/**
 * قصة بمعرّفها: من الخادم، وإلا من نسخة الجهاز، وإلا من النسخة المضمَّنة بالاسم المعتمد (slug)، لأن قصص
 * الخادم الأساسية هي نفسها المضمَّنة بمعرّفات مختلفة.
 */
export async function getStory(id: string): Promise<Story | null> {
  if (isSeedStory(id)) return (await seedStories()).find((s) => s.id === id) ?? null;
  try {
    const { data, error } = await db.from("stories").select("*").eq("id", id).maybeSingle();
    if (!error && data) return data as unknown as Story;
  } catch {
    /* بلا اتصال */
  }
  return offlineStory(id);
}

export async function offlineStory(id: string): Promise<Story | null> {
  const local = readLocalJson<Story[]>(STORIES_LOCAL_KEY, []);
  const hit = Array.isArray(local) ? local.find((s) => s.id === id) : undefined;
  if (hit?.timeline?.length) return hit;
  const seed = await seedStories();
  const key = hit ? storyKey(hit) : id;
  return seed.find((s) => storyKey(s) === key || s.id === id) ?? hit ?? null;
}

export async function saveStoryProgress(input: {
  user_id: string;
  story_id: string;
  last_step: number;
  quiz_score?: number | null;
  completed?: boolean;
}) {
  // قصة من النسخة المضمَّنة لا صف لها في stories، فيُحفظ تقدّمها على الجهاز فقط.
  if (isSeedStory(input.story_id)) return saveLocalStoryProgress(input);
  await db.from("story_progress").upsert(input, { onConflict: "user_id,story_id" });
}

export async function listStoryProgress(userId: string): Promise<StoryProgress[]> {
  const { data } = await db.from("story_progress").select("*").eq("user_id", userId);
  return (data as StoryProgress[]) ?? [];
}
