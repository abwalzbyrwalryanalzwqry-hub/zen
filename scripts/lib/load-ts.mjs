// تحميل وحدة TypeScript من src/lib في سكربتات Node (تقييم المساعد والتسميع). كان ai-eval.mjs يستعمل esbuild وهو
// غير مثبّت منذ Vite 8 (rolldown بدلاً منه)، فكان `npm run ai:eval` يفشل قبل أن يبدأ.
import { rolldown } from "rolldown";

export async function loadTs(entry) {
  const bundle = await rolldown({ input: entry, platform: "node", logLevel: "silent" });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  return import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"));
}
