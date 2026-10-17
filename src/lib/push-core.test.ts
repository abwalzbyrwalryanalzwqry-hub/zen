import { describe, expect, it, vi } from "vitest";
import { dispatchPlan, dispatchPush, safeEqual, type ClaimedPush } from "./push-core";
import type { FcmServiceAccount } from "./fcm.server";

describe("مرسِل الإشعارات في Edge (المرحلة 6.4)", () => {
  it("سرّ المجدول يُقارن كاملاً", () => {
    expect(safeEqual("s3cret-value", "s3cret-value")).toBe(true);
    expect(safeEqual("s3cret-value", "s3cret-valuX")).toBe(false);
    expect(safeEqual("s3cret", "s3cret-value")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("المجدول دفعة كبيرة بتذكيرات إلا إن طُلب غير ذلك، والمستخدم دفعة صغيرة بلا تذكيرات", () => {
    expect(dispatchPlan("cron", {})).toEqual({ limit: 100, reminders: true });
    expect(dispatchPlan("cron", { reminders: false })).toEqual({ limit: 100, reminders: false });
    expect(dispatchPlan("kick", { reminders: true })).toEqual({ limit: 20, reminders: false });
  });

  it("Android فقط: يرسل لرموز FCM ويتجاهل اشتراكات المتصفح القديمة، ويختم كل صف", async () => {
    const rows: ClaimedPush[] = [
      {
        id: "p1",
        user_id: "u1",
        category: "wird",
        title: "الورد",
        body: null,
        url: "/today",
        subscriptions: [
          { endpoint: "https://web.push/x", p256dh: "k", auth: "a" },
          { token: "t-ok", platform: "android" },
          { token: "t-gone", platform: "android" },
        ],
      },
      {
        id: "p2",
        user_id: "u2",
        category: "general",
        title: "عام",
        body: "x",
        url: "/",
        subscriptions: [],
      },
    ];
    const finished: [string, string[], string[]][] = [];
    const store = {
      enqueueReminders: vi.fn(async () => undefined),
      claim: vi.fn(async () => rows),
      finish: async (id: string, d: string[], g: string[]) => void finished.push([id, d, g]),
    };
    const sendNative = vi.fn(async (tokens: string[], _msg: { tag: string }) =>
      tokens.map((token) => ({
        token,
        ok: token === "t-ok",
        gone: token === "t-gone",
        status: 200,
      })),
    );
    const sum = await dispatchPush(store, {} as FcmServiceAccount, {
      reminders: true,
      sendNative,
    });
    expect(store.enqueueReminders).toHaveBeenCalledOnce();
    expect(sendNative).toHaveBeenCalledOnce();
    expect(sendNative.mock.calls[0][0]).toEqual(["t-ok", "t-gone"]);
    expect(sendNative.mock.calls[0][1]).toMatchObject({ tag: "zen-daily-memorization" });
    expect(finished).toEqual([
      ["p1", ["t-ok"], ["t-gone"]],
      ["p2", [], []],
    ]);
    expect(sum).toEqual({ claimed: 2, delivered: 1, gone: 1, failed: 0 });
  });

  it("قفل التطبيق 1.29.0 (M6): الرمز الخاص يتلقى نصاً عاماً بخصوصية PRIVATE، وغيره النص كاملاً", async () => {
    const rows: ClaimedPush[] = [
      {
        id: "p1",
        user_id: "u1",
        category: "messages",
        title: "رسالة من الأستاذ أحمد",
        body: "موعد التسميع غداً",
        url: "/messages/1",
        subscriptions: [
          { token: "t-open", platform: "android", private: false },
          { token: "t-hidden", platform: "android", private: true },
        ],
      },
    ];
    const store = {
      enqueueReminders: vi.fn(async () => undefined),
      claim: vi.fn(async () => rows),
      finish: vi.fn(async () => undefined),
    };
    const sendNative = vi.fn(async (tokens: string[], _msg: Record<string, unknown>) =>
      tokens.map((token) => ({ token, ok: true, gone: false, status: 200 })),
    );
    const sum = await dispatchPush(store, {} as FcmServiceAccount, { sendNative });
    expect(sendNative).toHaveBeenCalledTimes(2);
    expect(sendNative.mock.calls[0][0]).toEqual(["t-open"]);
    expect(sendNative.mock.calls[0][1]).toMatchObject({ title: "رسالة من الأستاذ أحمد" });
    expect(sendNative.mock.calls[0][1]).not.toHaveProperty("private");
    expect(sendNative.mock.calls[1][0]).toEqual(["t-hidden"]);
    expect(sendNative.mock.calls[1][1]).toEqual({
      title: "زِن",
      body: "لديك إشعار جديد",
      url: "/messages/1",
      tag: "messages",
      private: true,
    });
    expect(JSON.stringify(sendNative.mock.calls[1][1])).not.toContain("أحمد");
    expect(store.finish).toHaveBeenCalledWith("p1", ["t-open", "t-hidden"], []);
    expect(sum.delivered).toBe(2);
  });

  it("عطل في صف أو في ختمه لا يوقف بقية الدفعة، ومعرّف التنبيه يصل إلى الحمولة", async () => {
    const rows: ClaimedPush[] = [
      {
        id: "a",
        user_id: "u1",
        category: "general",
        title: "1",
        body: null,
        url: "/",
        subscriptions: [{ token: "t-a", platform: "android" }],
        notification_id: "n-a",
      },
      {
        id: "b",
        user_id: "u2",
        category: "general",
        title: "2",
        body: null,
        url: "/",
        subscriptions: [{ token: "t-b", platform: "android" }],
      },
      {
        id: "c",
        user_id: "u3",
        category: "general",
        title: "3",
        body: null,
        url: "/",
        subscriptions: [{ token: "t-c", platform: "android" }],
      },
    ];
    const finished: string[] = [];
    const store = {
      enqueueReminders: vi.fn(async () => undefined),
      claim: vi.fn(async () => rows),
      finish: async (id: string) => {
        if (id === "c") throw new Error("db down");
        finished.push(id);
      },
    };
    const sendNative = vi.fn(async (tokens: string[], _msg: { nid?: string | null }) => {
      if (tokens[0] === "t-b") throw new Error("network");
      return tokens.map((token) => ({ token, ok: true, gone: false, status: 200 }));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sum = await dispatchPush(store, {} as FcmServiceAccount, { sendNative });
    warn.mockRestore();
    err.mockRestore();
    expect(sum).toEqual({ claimed: 3, delivered: 2, gone: 0, failed: 1 });
    expect(finished).toEqual(["a"]);
    expect(sendNative.mock.calls[0][1].nid).toBe("n-a");
    expect(sendNative.mock.calls[1][1]).not.toHaveProperty("nid");
  });
});
