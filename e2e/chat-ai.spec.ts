import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * المحادثات والمساعد (المرحلة 5 من خارطة المحادثات): الرد والتفاعلات وبطاقات الآيات ووصف الطرف
 * الآخر، ثم المساعد بمحادثات محفوظة وربط الآيات بالمصحف والتقييم وعرض الحصة.
 */
const CHAT = "c0000000-0000-4000-8000-000000000001";
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

test("المحادثة: وصف المعلّم، وبطاقة الآية، والرد، والتفاعل", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      chats: [{ id: CHAT, participants: [STUDENT.id, TEACHER.id], created_at: iso(100) }],
      profiles: [{ id: TEACHER.id, name: TEACHER.name, avatar: null, role: "teacher" }],
      messages: [
        {
          id: "m2",
          chat_id: CHAT,
          sender_id: TEACHER.id,
          content: "البقرة 255",
          type: "text",
          status: "seen",
          created_at: iso(5),
        },
        {
          id: "m1",
          chat_id: CHAT,
          sender_id: TEACHER.id,
          content: "احفظ آية الكرسي",
          type: "text",
          status: "seen",
          created_at: iso(6),
        },
      ],
      message_reactions: [],
      chat_mutes: [],
    },
    rpc: {
      chat_context: {
        participant: true,
        supervisor: false,
        can_post: true,
        student_pair: false,
        peer_id: TEACHER.id,
        peer_kind: "teacher",
        peer_avatar: null,
        blocked_by_me: false,
        members: [
          { id: STUDENT.id, name: STUDENT.name },
          { id: TEACHER.id, name: TEACHER.name },
        ],
      },
      toggle_reaction: true,
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, `/chats/${CHAT}`);

  await expect(page.getByText("احفظ آية الكرسي")).toBeVisible();
  await expect(page.getByText("معلّم", { exact: true })).toBeVisible();
  // فاصل اليوم: الرسائل قبل دقائق، فقد تكون «أمس» إن شُغّل الاختبار بعد منتصف الليل بقليل (CI بتوقيت UTC).
  await expect(page.getByText(/^(اليوم|أمس)$/).first()).toBeVisible();
  // بطاقة الآية: النص من المصحف المضمَّن لا من الرسالة.
  await expect(page.getByText("سورة البقرة · الآية 255")).toBeVisible();
  await expect(page.getByText(/﴿٢٥٥﴾/).first()).toBeVisible();

  // الرد على رسالة.
  await page.getByText("احفظ آية الكرسي").click();
  await page.getByRole("button", { name: "رد", exact: true }).click();
  await expect(page.getByText("رد على: احفظ آية الكرسي")).toBeVisible();
  await page.getByLabel("نص الرسالة").fill("إن شاء الله");
  await page.getByLabel("نص الرسالة").press("Enter");
  await expect
    .poll(() => calls.find((c) => c.method === "POST" && c.path === "/rest/v1/messages")?.body)
    .toMatchObject({ content: "إن شاء الله", reply_to: "m1", chat_id: CHAT });

  // التفاعل.
  await page.getByText("احفظ آية الكرسي").click();
  await page.getByRole("button", { name: "تفاعل 🤲" }).click();
  await expect
    .poll(() => calls.find((c) => c.path === "/rest/v1/rpc/toggle_reaction")?.body)
    .toMatchObject({ _id: "m1", _emoji: "🤲" });
});

test("المساعد: محادثة محفوظة، وآيات من المصحف، وتقييم، وحصة متبقية", async ({ page, context }) => {
  const asked: string[] = [];
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      ai_conversations: [{ id: "conv1", title: "الفاتحة", updated_at: iso(60) }],
      ai_messages: [],
    },
    rpc: { my_ai_usage: 3, rate_ai_message: null },
    // المساعد في الويب يمرّ بدالة Edge «zen-ai» كما في Android (المرحلة 6.5).
    functions: {
      "zen-ai": (body: unknown) => {
        asked.push(JSON.stringify(body));
        return {
          conversationId: "conv1",
          messageId: "am1",
          text: "## معنى الفاتحة\n- **الحمد** لله وحده\n[[الفاتحة:1-2]]",
          remaining: 116,
        };
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");

  await expect(page.getByText("بقي لك 117 من 120 سؤالاً اليوم")).toBeVisible();
  await page.getByLabel("سؤالك للمساعد").fill("اشرح الفاتحة");
  await page.getByLabel("سؤالك للمساعد").press("Enter");

  await expect(page.getByText("معنى الفاتحة")).toBeVisible();
  await expect(page.locator("strong", { hasText: "الحمد" })).toBeVisible();
  await expect(page.getByText("سورة الفاتحة · الآيات 1–2")).toBeVisible();
  await expect(page.getByText(/﴿١﴾ .*﴿٢﴾/).first()).toBeVisible();
  await expect(page.getByText("بقي لك 116 من 120 سؤالاً اليوم")).toBeVisible();
  expect(asked[0]).toContain("اشرح الفاتحة");

  await page.getByRole("button", { name: "رد مفيد" }).click();
  await expect
    .poll(() => calls.find((c) => c.path === "/rest/v1/rpc/rate_ai_message")?.body)
    .toMatchObject({ _id: "am1", _rating: 1 });

  // المحادثات السابقة.
  await page.getByRole("button", { name: "المحادثات السابقة" }).click();
  await expect(page.getByText("الفاتحة", { exact: true })).toBeVisible();
});
