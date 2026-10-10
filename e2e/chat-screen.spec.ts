import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 7.6: تقسيم شاشة المحادثة بلا تغيير سلوك. يمرّ على الأجزاء المنقولة غير المغطاة في
// chat-ai.spec: الكتم والحظر في الرأس، وتعديل رسالتي وحذفها من قائمة الرسالة، والإبلاغ، ومنطقة الكتابة.
const CHAT = "c0000000-0000-4000-8000-000000000002";
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

test("المحادثة: الكتم والحظر والتعديل والحذف والإبلاغ", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      chats: [{ id: CHAT, participants: [STUDENT.id, TEACHER.id], created_at: iso(100) }],
      profiles: [{ id: TEACHER.id, name: TEACHER.name, avatar: null, role: "teacher" }],
      messages: [
        {
          id: "t1",
          chat_id: CHAT,
          sender_id: TEACHER.id,
          content: "راجع سورة الملك",
          type: "text",
          status: "seen",
          created_at: iso(3),
        },
        {
          id: "s1",
          chat_id: CHAT,
          sender_id: STUDENT.id,
          content: "حفظت الصفحة",
          type: "text",
          status: "sent",
          created_at: iso(1),
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
      set_chat_mute: null,
      set_user_block: null,
      edit_message: null,
      delete_message: null,
      report_message: null,
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, `/chats/${CHAT}`);
  await expect(page.getByText("راجع سورة الملك")).toBeVisible();
  const rpcCall = (name: string) =>
    calls.find((c) => c.method === "POST" && c.path === `/rest/v1/rpc/${name}`)?.body;

  // الرأس: الكتم.
  await page.getByRole("button", { name: "كتم الإشعارات" }).click();
  await expect(page.getByText("كُتمت الإشعارات أسبوعاً.")).toBeVisible();
  await expect(page.getByRole("button", { name: "إلغاء الكتم" })).toBeVisible();
  expect(rpcCall("set_chat_mute")).toMatchObject({ _chat_id: CHAT, _hours: 168 });

  // تعديل رسالتي من قائمتها.
  await page.getByText("حفظت الصفحة").click();
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.getByText("تعديل: حفظت الصفحة")).toBeVisible();
  await expect(page.getByLabel("نص الرسالة")).toHaveValue("حفظت الصفحة");
  await page.getByLabel("نص الرسالة").fill("حفظت الصفحتين");
  await page.getByLabel("نص الرسالة").press("Enter");
  await expect(page.getByText("حفظت الصفحتين")).toBeVisible();
  await expect(page.getByText(/مُعدَّلة/)).toBeVisible();
  expect(rpcCall("edit_message")).toMatchObject({ _id: "s1", _content: "حفظت الصفحتين" });

  // حذفها.
  await page.getByText("حفظت الصفحتين").click();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText("رسالة محذوفة")).toBeVisible();
  expect(rpcCall("delete_message")).toMatchObject({ _id: "s1" });

  // الإبلاغ عن رسالة الطرف الآخر.
  await page.getByText("راجع سورة الملك").click();
  await page.getByRole("button", { name: "إبلاغ", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "إبلاغ", exact: true }).click();
  await expect(page.getByText("وصل البلاغ. شكراً لك، سيراجعه المشرف.")).toBeVisible();

  // الحظر.
  await page.getByRole("button", { name: "حظر المستخدم" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "حظر", exact: true }).click();
  await expect(page.getByText("تم الحظر.")).toBeVisible();
  expect(rpcCall("set_user_block")).toMatchObject({ _user: TEACHER.id, _blocked: true });
});

test("المحادثة: البحث داخلها، والردود السريعة، والمسودة المحفوظة", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      chats: [{ id: CHAT, participants: [STUDENT.id, TEACHER.id], created_at: iso(100) }],
      profiles: [{ id: TEACHER.id, name: TEACHER.name, avatar: null, role: "teacher" }],
      messages: [
        {
          id: "t1",
          chat_id: CHAT,
          sender_id: TEACHER.id,
          content: "راجع سورة الملك",
          type: "text",
          status: "seen",
          created_at: iso(3),
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
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, `/chats/${CHAT}`);
  await expect(page.getByText("راجع سورة الملك")).toBeVisible();

  await page.getByRole("button", { name: "البحث في المحادثة" }).click();
  await page.getByLabel("ابحث في الرسائل…").fill("الملك");
  await expect(page.getByText("1 من 1")).toBeVisible();
  await expect(page.locator("mark", { hasText: "الملك" })).toBeVisible();
  await page.getByRole("button", { name: "إغلاق البحث" }).click();
  await expect(page.locator("mark")).toHaveCount(0);

  await page.getByRole("button", { name: "جزاك الله خيراً" }).click();
  await expect(page.getByLabel("نص الرسالة")).toHaveValue("جزاك الله خيراً");
  await page.reload();
  await expect(page.getByLabel("نص الرسالة")).toHaveValue("جزاك الله خيراً");
});
