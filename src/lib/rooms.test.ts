import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  defaultScheduleValue,
  messageActions,
  scheduleTimeError,
  roomErrorMessage,
  roomVoicePath,
  roomTitle,
  sortRooms,
  validateRoomMessage,
  type RoomMessage,
  type RoomSummary,
} from "./rooms";

const msg = (over: Partial<RoomMessage> = {}): RoomMessage => ({
  id: "m",
  sender_id: "s",
  sender_name: "بلال",
  sender_is_mod: false,
  content: "نص",
  deleted: false,
  pinned: false,
  created_at: "2026-09-27T10:00:00Z",
  mine: false,
  reported_by_me: false,
  ...over,
});

const room = (over: Partial<RoomSummary> = {}): RoomSummary => ({
  room_id: "r",
  halaqa_id: "h",
  halaqa_name: "حلقة الفجر",
  kind: "announcements",
  enabled: true,
  role: "reader",
  can_post: false,
  last_message: null,
  last_at: null,
  unread: 0,
  ...over,
});

describe("validateRoomMessage", () => {
  it("يرفض الفارغ والمسافات", () => {
    expect(validateRoomMessage("")).not.toBeNull();
    expect(validateRoomMessage("   ")).not.toBeNull();
  });
  it("يرفض ما تجاوز 2000 حرف ويقبل الحد", () => {
    expect(validateRoomMessage("a".repeat(2001))).not.toBeNull();
    expect(validateRoomMessage("a".repeat(2000))).toBeNull();
  });
  it("يقيس بعد حذف المسافات الطرفية", () => {
    expect(validateRoomMessage("  " + "a".repeat(2000) + "  ")).toBeNull();
  });
});

describe("roomTitle", () => {
  it("يميّز الإعلانات من النقاش", () => {
    expect(roomTitle(room())).toBe("إعلانات حلقة الفجر");
    expect(roomTitle(room({ kind: "discussion" }))).toBe("نقاش حلقة الفجر");
  });
});

describe("messageActions", () => {
  it("العضو يبلّغ عن رسالة غيره ولا يحذفها", () => {
    expect(messageActions(msg(), "member")).toEqual({
      report: true,
      delete: false,
      pin: false,
      mute: false,
    });
  });
  it("العضو يحذف رسالته ولا يبلّغ عنها", () => {
    const a = messageActions(msg({ mine: true }), "member");
    expect(a.delete).toBe(true);
    expect(a.report).toBe(false);
  });
  it("لا بلاغ مكرر", () => {
    expect(messageActions(msg({ reported_by_me: true }), "reader").report).toBe(false);
  });
  it("المشرف يحذف ويثبّت ويكتم الطالب لا المشرف", () => {
    expect(messageActions(msg(), "mod")).toMatchObject({ delete: true, pin: true, mute: true });
    expect(messageActions(msg({ sender_is_mod: true }), "mod").mute).toBe(false);
    expect(messageActions(msg({ mine: true }), "mod").mute).toBe(false);
  });
  it("لا إجراءات على رسالة محذوفة", () => {
    expect(messageActions(msg({ deleted: true, content: null }), "mod")).toEqual({
      report: false,
      delete: false,
      pin: false,
      mute: false,
    });
  });
});

describe("sortRooms", () => {
  it("غير المقروء أولاً ثم الأحدث", () => {
    const rs = sortRooms([
      room({ room_id: "old", last_at: "2026-09-01T00:00:00Z" }),
      room({ room_id: "new", last_at: "2026-09-20T00:00:00Z" }),
      room({ room_id: "unread", last_at: "2026-08-01T00:00:00Z", unread: 2 }),
      room({ room_id: "empty" }),
    ]);
    expect(rs.map((r) => r.room_id)).toEqual(["unread", "new", "old", "empty"]);
  });
  it("لا يعدّل المصفوفة الأصلية", () => {
    const input = [room({ room_id: "a" }), room({ room_id: "b", unread: 1 })];
    sortRooms(input);
    expect(input[0].room_id).toBe("a");
  });
});

describe("roomErrorMessage", () => {
  it("يترجم الأخطاء المعروفة", () => {
    expect(roomErrorMessage(new Error("muted"))).toContain("مؤقتاً");
    expect(roomErrorMessage(new Error("rate limit"))).toContain("دقيقة");
    expect(roomErrorMessage(new Error("contact info"))).toContain("أرقام الهواتف");
    expect(roomErrorMessage({ message: "announcements are for teachers only" })).toContain(
      "للمعلّم",
    );
  });
  it("رسالة عامة لغير المعروف", () => {
    expect(roomErrorMessage(new Error("xyz"))).toBe("تعذّر إتمام العملية.");
  });
});

describe("جدولة رسائل الغرف (9.5)", () => {
  it("الوقت الافتراضي بعد ساعة مقرّباً لربع الساعة", () => {
    expect(defaultScheduleValue(new Date(2026, 8, 29, 10, 7))).toBe("2026-09-29T11:15");
    expect(defaultScheduleValue(new Date(2026, 8, 29, 23, 50))).toBe("2026-09-30T01:00");
  });
  it("نافذة الوقت", () => {
    const now = new Date(2026, 8, 29, 10, 0).getTime();
    expect(scheduleTimeError("", now)).toBe("اختر التاريخ والوقت.");
    expect(scheduleTimeError("2026-09-29T10:01", now)).toContain("دقيقتين");
    expect(scheduleTimeError("2026-11-29T10:00", now)).toContain("30 يوماً");
    expect(scheduleTimeError("2026-09-29T18:00", now)).toBeNull();
  });
  it("رسائل أخطاء الجدولة", () => {
    expect(roomErrorMessage(new Error("TOO_MANY_SCHEDULED"))).toContain("20");
  });
});

describe("roomVoicePath (9.7)", () => {
  it("يبني المسار {room}/{sender}/{id}.ext بحسب نوع الملف", () => {
    expect(roomVoicePath("r", "u", "audio/webm", "a")).toBe("r/u/a.webm");
    expect(roomVoicePath("r", "u", "audio/mp4", "a")).toBe("r/u/a.m4a");
    expect(roomVoicePath("r", "u", "audio/ogg;codecs=opus", "a")).toBe("r/u/a.ogg");
  });
  it("رسائل الخطأ الصوتية بالعربية", () => {
    expect(roomErrorMessage(new Error("VOICE_NOT_ALLOWED"))).toContain("موافقة وليّ أمرك");
    expect(roomErrorMessage(new Error("VOICE_LENGTH"))).toContain("60");
  });
});
