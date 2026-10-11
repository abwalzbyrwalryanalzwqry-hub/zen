import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installNativeShim } from "./lib/offline/native-shim";
import { createQueryClient } from "./lib/query-client";
import { areThmanyahFontsSupported, loadThmanyahFonts } from "./lib/thmanyah-fonts";

installNativeShim();

// انتظر خطوط Android قبل أول تصيير كي لا تُرسم الواجهة بخط بديل ثم تتبدل.
// لا نحجب بدء نسخة الويب، ولا فشل تحميل الخطوط؛ عند الفشل يستخدم التطبيق Zen Text.
const fontsReady = areThmanyahFontsSupported()
  ? loadThmanyahFonts().catch(() => false)
  : Promise.resolve(false);

export const getRouter = async () => {
  await fontsReady;
  const queryClient = createQueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
