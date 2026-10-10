import { it, vi, expect } from "vitest";
const calls: string[] = [];
vi.mock("@/integrations/supabase/rpc", () => ({
  rpc: (fn: string) => {
    calls.push(fn);
    return Promise.resolve({ data: 1, error: null });
  },
}));
import { lazyRpc } from "@/integrations/supabase/lazy";
it("نداءات متزامنة كلها تصل عبر استيراد واحد", async () => {
  await Promise.all(Array.from({ length: 5 }, () => lazyRpc("am_app_owner" as never)));
  expect(calls).toHaveLength(5);
});
