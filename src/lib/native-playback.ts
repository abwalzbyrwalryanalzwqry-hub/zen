/**
 * M14: تلاوة في الخلفية بخدمة أندرويد أمامية (ZenPlaybackService) وأدوات تحكم في الإشعار وشاشة القفل.
 * الصوت يبقى عنصر الصوت الواحد في WebView؛ الخدمة تُبقي العملية حيّة وتعيد ضغطات الإشعار إلى هنا.
 * على الويب أو بلا المكوّن الأصلي: لا شيء (MediaSession في المتصفح يبقى كما هو).
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativePlaybackAction = "play" | "pause" | "next" | "prev" | "stop";
export type NativePlaybackState = { title: string; subtitle: string; playing: boolean };

interface ZenPlaybackPlugin {
  update(state: NativePlaybackState): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: "action",
    cb: (d: { action: NativePlaybackAction }) => void,
  ): Promise<PluginListenerHandle>;
}

const ZenPlayback = registerPlugin<ZenPlaybackPlugin>("ZenPlayback");

export function nativePlaybackSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("ZenPlayback");
}

let last = "";

/** يعكس حالة المشغّل على الإشعار؛ null يُنهي الخدمة. لا يكرّر الطلب نفسه. */
export function syncNativePlayback(
  state: NativePlaybackState | null,
  plugin: Pick<ZenPlaybackPlugin, "update" | "stop"> = ZenPlayback,
  supported = nativePlaybackSupported(),
): void {
  if (!supported) return;
  const key = state ? JSON.stringify(state) : "";
  if (key === last) return;
  last = key;
  void (state ? plugin.update(state) : plugin.stop()).catch(() => {
    last = "";
  });
}

export function onNativePlaybackAction(
  cb: (a: NativePlaybackAction) => void,
  plugin: Pick<ZenPlaybackPlugin, "addListener"> = ZenPlayback,
  supported = nativePlaybackSupported(),
): () => void {
  if (!supported) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let dead = false;
  void plugin
    .addListener("action", (d) => cb(d.action))
    .then((h) => {
      if (dead) void h.remove();
      else handle = h;
    })
    .catch(() => undefined);
  return () => {
    dead = true;
    void handle?.remove();
  };
}

/** للاختبارات فقط. */
export function __resetNativePlayback(): void {
  last = "";
}
