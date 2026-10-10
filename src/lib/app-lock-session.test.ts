import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLockSession } from "./app-lock-session";

/*
 * السيناريوهات المشتركة نفسها التي يشغّلها LockSessionScenarioTest على LockSession.java: إن انحرفت المحاكاة
 * (التي يعتمدها e2e) عن Java فشل أحد الطرفين.
 */
type Step = {
  op: string;
  t: number;
  enabled?: boolean;
  grace?: number;
  success?: boolean;
  lockOnScreenOff?: boolean;
  idleMs?: number;
  window?: number;
  requireUnlocked?: boolean;
  mode?: string;
  expect?: { result?: boolean; unlocked?: boolean; authorized?: boolean };
};
type Scenario = { name: string; steps: Step[] };

const file = join(__dirname, "../../android/app/src/test/resources/app-lock-scenarios.json");
const { scenarios } = JSON.parse(readFileSync(file, "utf8")) as { scenarios: Scenario[] };

function run(sc: Scenario) {
  const s = createLockSession();
  sc.steps.forEach((st, i) => {
    const on = st.enabled ?? true;
    let result: boolean | undefined;
    switch (st.op) {
      case "unlock":
        s.unlock(st.t);
        break;
      case "relock":
        result = s.relock();
        break;
      case "stop":
        result = s.onStop(st.t, on, st.grace!);
        break;
      case "start":
        result = s.onStart(st.t, on, st.grace!);
        break;
      case "beginAuth":
        result = s.beginAuth(st.t);
        break;
      case "endAuth":
        s.endAuth(st.t, st.success!);
        break;
      case "reset":
        s.reset();
        break;
      case "lockNow":
        result = s.lockNow(on);
        break;
      case "screenOff":
        result = s.onScreenOff(st.t, on, st.lockOnScreenOff!);
        break;
      case "touch":
        s.touch(st.t);
        break;
      case "idle":
        result = s.onIdleTick(st.t, on, st.idleMs!);
        break;
      case "authorize":
        s.authorize(st.t, st.window!, st.requireUnlocked!);
        break;
      case "setProof":
        s.setProof(st.mode!, st.t, st.window!);
        break;
      case "consumeProof":
        result = s.consumeProof(st.mode!, st.t);
        break;
      default:
        throw new Error(`${sc.name}: عملية مجهولة ${st.op}`);
    }
    const ex = st.expect;
    if (!ex) return;
    const at = `${sc.name} — الخطوة ${i + 1} (${st.op})`;
    if (ex.result !== undefined) expect(result, `${at}: result`).toBe(ex.result);
    if (ex.unlocked !== undefined) expect(s.state.unlocked, `${at}: unlocked`).toBe(ex.unlocked);
    if (ex.authorized !== undefined)
      expect(s.authorized(st.t), `${at}: authorized`).toBe(ex.authorized);
  });
}

describe("جلسة القفل: السيناريوهات المشتركة مع Java", () => {
  it("ملف السيناريوهات موجود وغير فارغ", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(15);
  });
  for (const sc of scenarios) it(sc.name, () => run(sc));
});
