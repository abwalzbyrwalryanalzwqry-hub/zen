import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// كل مسار له مسارات أبناء (ملف «a.b» و«a.b.c») يجب أن يعرض <Outlet />، وإلا ظهرت صفحة الأب بدل
// الابن (كما حدث لـ«طلابي» وملف الطالب تحت /quran). للصفحات المستقلة استعمل «a_.c».
describe("تداخل المسارات", () => {
  it("كل أب يعرض Outlet", () => {
    const dir = "src/routes";
    const names = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => f.slice(0, -4));
    const broken = names.filter(
      (n) =>
        names.some((k) => k.startsWith(n + ".")) &&
        !readFileSync(`${dir}/${n}.tsx`, "utf8").includes("Outlet"),
    );
    expect(broken).toEqual([]);
  });
});
