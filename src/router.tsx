import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installNativeShim } from "./lib/offline/native-shim";
import { createQueryClient } from "./lib/query-client";
import { loadThmanyahFonts } from "./lib/thmanyah-fonts";

installNativeShim();

// خطوط ثمانية: تُحمّل داخل حزمة Android/Capacitor فقط، ولا تُحمّل في نسخة الويب العامة.
void loadThmanyahFonts().catch(() => {
  // فشل تحميل الخط لا يجب أن يعطّل بدء التطبيق؛ تبقى خطوط النظام بديلاً.
});

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
