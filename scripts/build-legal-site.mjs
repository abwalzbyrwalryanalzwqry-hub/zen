#!/usr/bin/env node
// يولّد الصفحات القانونية العامة الثابتة من src/content/legal.ts (تدقيق أكتوبر 2026، المرحلة 2.1).
// Google Play يشترط رابطاً عاماً لسياسة الخصوصية ولطلب حذف الحساب، وزِن بلا نشر ويب (القاعدة 33)،
// فهذه صفحات HTML ثابتة فقط (بلا JavaScript ولا خطوط خارجية) تُنشر بسير «الصفحات القانونية».
//
//   node scripts/build-legal-site.mjs --contact support@example.org [--out dist-legal]
//
// البريد إلزامي: صفحة الحذف بلا وسيلة تواصل ترفضها مراجعة Play.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { LEGAL_DOCS } = await import(join(ROOT, "src/content/legal.ts"));
const { verifyPage } = await import(join(ROOT, "scripts/verify-page.mjs"));

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const contact = (arg("--contact") ?? process.env.LEGAL_CONTACT_EMAIL ?? "").trim();
const out = resolve(ROOT, arg("--out") ?? "dist-legal");

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
  console.error("❌ بريد التواصل مطلوب: --contact you@example.org (أو LEGAL_CONTACT_EMAIL).");
  process.exit(1);
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const CSS = `body{margin:0;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:#0f1a17;color:#e8efe9;line-height:1.9}
main{max-width:42rem;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:1.6rem;margin:0 0 .25rem}
.updated{color:#9fb3aa;font-size:.85rem;margin:0 0 1.5rem}section{background:#16241f;border-radius:1rem;padding:1rem 1.25rem;margin:0 0 1rem}
h2{font-size:1.05rem;color:#7fd1a8;margin:0 0 .4rem}p{margin:0}nav{display:flex;gap:1rem;flex-wrap:wrap;margin:0 0 1.5rem}
a{color:#e5c07b}footer{color:#9fb3aa;font-size:.85rem;margin-top:2rem}`;

const nav = LEGAL_DOCS.map((d) => `<a href="${d.slug}.html">${esc(d.title)}</a>`).join("");

function page(doc) {
  const sections = doc.sections
    .map((s) => `<section><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p></section>`)
    .join("\n");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} — زِن</title>
<meta name="description" content="${esc(doc.description)}">
<style>${CSS}</style>
</head>
<body><main>
<nav>${nav}</nav>
<h1>${esc(doc.title)}</h1>
<p class="updated">آخر تحديث: ${esc(doc.updated)}</p>
${sections}
<footer>للتواصل وطلبات البيانات والحذف: <a href="mailto:${esc(contact)}">${esc(contact)}</a></footer>
</main></body>
</html>
`;
}

mkdirSync(out, { recursive: true });
for (const doc of LEGAL_DOCS) writeFileSync(join(out, `${doc.slug}.html`), page(doc));
writeFileSync(
  join(out, "index.html"),
  page({
    slug: "index",
    title: "زِن — الصفحات القانونية",
    description: "سياسة الخصوصية وشروط الاستخدام وحذف الحساب لتطبيق زِن.",
    updated: LEGAL_DOCS[0].updated,
    sections: LEGAL_DOCS.map((d) => ({ title: d.title, body: d.description })),
  }),
);
// صفحة التحقق العام (1.23.0): verify/?code=… — رابط QR الشهائد حين يُضبط VITE_PUBLIC_VERIFY_URL في البناء.
// عنوان Supabase ومفتاحه العام من البيئة أو من .env (منشوران أصلاً في التطبيق).
const dotenv = existsSync(join(ROOT, ".env"))
  ? Object.fromEntries(
      readFileSync(join(ROOT, ".env"), "utf8")
        .split("\n")
        .map((l) => /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l.trim()))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};
const sbUrl = process.env.VITE_SUPABASE_URL ?? dotenv.VITE_SUPABASE_URL;
const sbKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? dotenv.VITE_SUPABASE_PUBLISHABLE_KEY;
if (sbUrl && sbKey) {
  mkdirSync(join(out, "verify"), { recursive: true });
  writeFileSync(join(out, "verify", "index.html"), verifyPage({ url: sbUrl, key: sbKey, contact }));
} else {
  console.warn(
    "⚠️ لا VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY: لم تُولَّد صفحة التحقق العام.",
  );
}
// GitHub Pages: بلا Jekyll.
writeFileSync(join(out, ".nojekyll"), "");
console.log(`✅ ${LEGAL_DOCS.length + 1} صفحات في ${out}`);
