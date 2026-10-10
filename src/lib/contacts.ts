/**
 * جهات «محادثة جديدة» مجمَّعة بصلتها (فحص الأقسام C6). الصلة من الخادم (`my_chat_contacts_detailed`)
 * لا من `profiles.role` الذي يصف وليّ الأمر «طالباً». إن لم تُنشر الدالة بعد نعود إلى القائمة القديمة بلا صلة.
 */
import { rpc } from "@/integrations/supabase/rpc";
import { listChatContacts } from "@/lib/zen-api";
import { normalizeArabic } from "@/lib/teacher-board";

export const RELATIONS = [
  "my_teacher",
  "my_student",
  "student_guardian",
  "child_teacher",
  "classmate",
  "colleague",
  "other",
] as const;
export type Relation = (typeof RELATIONS)[number];

export type Contact = {
  id: string;
  name: string;
  avatar: string | null;
  relation: Relation;
  /** اسم الابن لوليّ الأمر أو لمعلّم الابن. */
  via: string | null;
};

const asRelation = (v: unknown): Relation =>
  RELATIONS.includes(v as Relation) ? (v as Relation) : "other";

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await rpc("my_chat_contacts_detailed");
  if (!error) {
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      avatar: (r.avatar as string | null) ?? null,
      relation: asRelation(r.relation),
      via: (r.via as string | null) ?? null,
    }));
  }
  // الدالة غير منشورة بعد (PGRST202 / 404): القائمة القديمة نفسها، بلا تجميع.
  const old = await listChatContacts();
  return old.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar ?? null,
    relation: "other" as const,
    via: null,
  }));
}

/** مجموعات بترتيب RELATIONS، بلا مجموعة فارغة، مع البحث بالاسم أو باسم الابن. */
export function groupContacts(list: Contact[], q = ""): { relation: Relation; items: Contact[] }[] {
  const n = normalizeArabic(q);
  const hit = (c: Contact) =>
    !n || normalizeArabic(c.name).includes(n) || normalizeArabic(c.via ?? "").includes(n);
  return RELATIONS.map((relation) => ({
    relation,
    items: list.filter((c) => c.relation === relation && hit(c)),
  })).filter((g) => g.items.length > 0);
}
