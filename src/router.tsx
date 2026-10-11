import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installNativeShim } from "./lib/offline/native-shim";
import { createQueryClient } from "./lib/query-client";
import { areThmanyahFontsSupported, loadThmanyahFonts } from "./lib/thmanyah-fonts";

installNativeShim();

// لا نغيّر عقد getRouter لدى TanStack Start؛ تحميل الخطوط اختياري وخلفي.
if (areThmanyahFontsSupported()) {
  void loadThmanyahFonts().catch(() => false);
}

export const getRouter = () => {
  const queryClient = createQueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
