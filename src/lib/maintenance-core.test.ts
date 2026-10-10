import { describe, expect, it } from "vitest";
import {
  purgeOldAudio,
  type AudioCandidate,
  type MaintenanceStore,
  maintenanceSecret,
} from "./maintenance-core";

function fake(rows: AudioCandidate[], failing: string[] = []) {
  const calls = { days: 0, removed: [] as string[][], marked: [] as string[][] };
  const store: MaintenanceStore = {
    async audioCandidates(days, limit) {
      calls.days = days;
      return rows.slice(0, limit);
    },
    async removeObjects(paths) {
      calls.removed.push(paths);
      return paths.filter((p) => !failing.includes(p));
    },
    async markPurged(ids) {
      calls.marked.push(ids);
    },
  };
  return { store, calls };
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, audio_path: `u/${i}.m4a` }));

describe("حذف التسجيلات القديمة (المرحلة 2.2)", () => {
  it("يحذف على دفعات من 100 ويعلّم ما حُذف فقط", async () => {
    const { store, calls } = fake(rows(150), ["u/3.m4a"]);
    const sum = await purgeOldAudio(store, 90, 200);
    expect(calls.removed.map((c) => c.length)).toEqual([100, 50]);
    expect(sum).toEqual({ candidates: 150, removed: 149, marked: 149 });
    expect(calls.marked.flat()).not.toContain("s3");
  });

  it("لا يقلّ عن 30 يوماً مهما كان الإعداد", async () => {
    const { store, calls } = fake([]);
    await purgeOldAudio(store, 1);
    expect(calls.days).toBe(30);
  });

  it("لا شيء ⇒ لا نداءات حذف", async () => {
    const { store, calls } = fake([]);
    expect(await purgeOldAudio(store)).toEqual({ candidates: 0, removed: 0, marked: 0 });
    expect(calls.removed).toEqual([]);
  });
});

describe("سرّ دالة الصيانة (P1-04)", () => {
  it("MAINTENANCE_SECRET متى ضُبط يلغي قبول سرّ الإشعارات", () => {
    expect(maintenanceSecret({ MAINTENANCE_SECRET: "m", PUSH_DISPATCH_SECRET: "p" })).toEqual({
      secret: "m",
      legacy: false,
    });
  });
  it("قبل ضبطه: سرّ الإشعارات مؤقتاً مع تعليم legacy", () => {
    expect(maintenanceSecret({ PUSH_DISPATCH_SECRET: "p" })).toEqual({ secret: "p", legacy: true });
  });
  it("بلا أي سرّ: لا قبول", () => {
    expect(maintenanceSecret({})).toEqual({ secret: null, legacy: false });
  });
});
