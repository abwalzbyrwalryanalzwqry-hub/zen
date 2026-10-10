import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// المرحلة 6.5: نسخة Android بلا خادم ويب، فأي دالة خادم في الواجهة ميزة معطّلة في التطبيق.
// كل ما يحتاج صلاحية أو مفتاحاً يمرّ بدالة Supabase Edge عبر `callEdge` (HANDOFF القاعدة 32).
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("مسار واحد للويب وAndroid", () => {
  // `src/integrations/supabase` يولّده Lovable (فيه عميل مفتاح الخدمة ووسيط المصادقة لدوال الخادم)،
  // ولا يستورده شيء من الواجهة؛ الفحص الثاني يضمن ذلك.
  const all = files("src").filter(
    (f) => !f.endsWith(".test.ts") && !f.startsWith(join("src", "integrations")),
  );

  it("لا دوال خادم (createServerFn) ولا مسارات API في الواجهة", () => {
    const hits = all.filter((f) =>
      /\b(createServerFn|createServerFileRoute)\s*\(|from\s+["']@tanstack\/react-start\/server["']/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(hits).toEqual([]);
  });

  it("لا استيراد لملفات .server ولا لعميل مفتاح الخدمة من الواجهة", () => {
    const hits = all.filter((f) =>
      /from\s+["'][^"']*(client\.server|ai-provider\.server|ai-quota\.server)["']|import\(\s*["'][^"']*\.server["']\s*\)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(hits).toEqual([]);
  });
});
