import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetNativePlayback,
  onNativePlaybackAction,
  syncNativePlayback,
  type NativePlaybackAction,
} from "./native-playback";

describe("التلاوة في الخلفية (M14)", () => {
  beforeEach(() => __resetNativePlayback());

  it("يعكس الحالة على الإشعار دون تكرار، وnull يُنهي الخدمة", async () => {
    const plugin = { update: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const s = { title: "سورة الفاتحة · الآية ١", subtitle: "الحصري", playing: true };
    syncNativePlayback(s, plugin, true);
    syncNativePlayback({ ...s }, plugin, true);
    expect(plugin.update).toHaveBeenCalledTimes(1);
    syncNativePlayback({ ...s, playing: false }, plugin, true);
    expect(plugin.update).toHaveBeenCalledTimes(2);
    syncNativePlayback(null, plugin, true);
    expect(plugin.stop).toHaveBeenCalledTimes(1);
  });

  it("لا شيء على الويب", () => {
    const plugin = { update: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    syncNativePlayback({ title: "x", subtitle: "y", playing: true }, plugin, false);
    expect(plugin.update).not.toHaveBeenCalled();
    expect(onNativePlaybackAction(() => {}, { addListener: vi.fn() }, false)).toBeTypeOf(
      "function",
    );
  });

  it("ينقل ضغطات الإشعار ويُزال المستمع عند الإلغاء", async () => {
    let fire: (d: { action: NativePlaybackAction }) => void = () => {};
    const remove = vi.fn(async () => {});
    const plugin = {
      addListener: vi.fn(async (_e: "action", cb: typeof fire) => {
        fire = cb;
        return { remove };
      }),
    };
    const got: NativePlaybackAction[] = [];
    const off = onNativePlaybackAction((a) => got.push(a), plugin, true);
    await Promise.resolve();
    fire({ action: "next" });
    fire({ action: "pause" });
    expect(got).toEqual(["next", "pause"]);
    off();
    expect(remove).toHaveBeenCalled();
  });
});
