/**
 * تراخيص المكتبات المشحونة داخل التطبيق (تحليل «المزيد» GAP-08). يتحقق `licenses.test.ts` أن كل اعتماد في
 * `package.json` (عدا أدوات البناء) مذكور هنا، فلا تُنسى مكتبة جديدة. مصادر المحتوى (نص القرآن والتفسير
 * والتلاوات) في `/mushaf/sources`.
 */
export type License = { name: string; license: string; url: string };

export const BUILD_ONLY = new Set([
  "@tailwindcss/vite",
  "@tanstack/router-plugin",
  "vite-tsconfig-paths",
  "@capacitor/android",
]);

export const LICENSES: License[] = [
  { name: "React", license: "MIT", url: "https://react.dev" },
  { name: "TanStack Router / Start", license: "MIT", url: "https://tanstack.com/router" },
  { name: "TanStack Query", license: "MIT", url: "https://tanstack.com/query" },
  { name: "Supabase JS", license: "MIT", url: "https://github.com/supabase/supabase-js" },
  { name: "Capacitor", license: "MIT", url: "https://capacitorjs.com" },
  {
    name: "Capacitor Keep Awake",
    license: "MIT",
    url: "https://github.com/capacitor-community/keep-awake",
  },
  {
    name: "Capacitor ML Kit Barcode Scanning",
    license: "Apache-2.0",
    url: "https://capawesome.io/docs/sdks/capacitor/mlkit/barcode-scanning",
  },
  { name: "Radix UI Dialog", license: "MIT", url: "https://radix-ui.com/primitives" },
  { name: "Tailwind CSS", license: "MIT", url: "https://tailwindcss.com" },
  { name: "tw-animate-css", license: "MIT", url: "https://github.com/Wombosvideo/tw-animate-css" },
  { name: "tailwind-merge", license: "MIT", url: "https://github.com/dcastil/tailwind-merge" },
  { name: "clsx", license: "MIT", url: "https://github.com/lukeed/clsx" },
  { name: "Lucide", license: "ISC", url: "https://lucide.dev" },
  { name: "Adhan", license: "MIT", url: "https://github.com/batoulapps/adhan-js" },
  { name: "fflate", license: "MIT", url: "https://github.com/101arrowz/fflate" },
  { name: "node-qrcode", license: "MIT", url: "https://github.com/soldair/node-qrcode" },
  { name: "Recharts", license: "MIT", url: "https://github.com/recharts/recharts" },
  { name: "Sonner", license: "MIT", url: "https://sonner.emilkowal.ski" },
  {
    name: "write-excel-file",
    license: "MIT",
    url: "https://gitlab.com/catamphetamine/write-excel-file",
  },
];

/** اسم الحزمة ← اسمها في القائمة (للاختبار). */
export const PACKAGE_TO_LICENSE: Record<string, string> = {
  react: "React",
  "react-dom": "React",
  "@tanstack/react-router": "TanStack Router / Start",
  "@tanstack/react-start": "TanStack Router / Start",
  "@tanstack/react-query": "TanStack Query",
  "@supabase/supabase-js": "Supabase JS",
  "@capacitor/core": "Capacitor",
  "@capacitor/app": "Capacitor",
  "@capacitor/filesystem": "Capacitor",
  "@capacitor/network": "Capacitor",
  "@capacitor/push-notifications": "Capacitor",
  "@capacitor/share": "Capacitor",
  "@capacitor/status-bar": "Capacitor",
  "@capacitor-community/keep-awake": "Capacitor Keep Awake",
  "@capacitor-mlkit/barcode-scanning": "Capacitor ML Kit Barcode Scanning",
  "@radix-ui/react-dialog": "Radix UI Dialog",
  tailwindcss: "Tailwind CSS",
  "tw-animate-css": "tw-animate-css",
  "tailwind-merge": "tailwind-merge",
  clsx: "clsx",
  "lucide-react": "Lucide",
  adhan: "Adhan",
  fflate: "fflate",
  qrcode: "node-qrcode",
  recharts: "Recharts",
  sonner: "Sonner",
  "write-excel-file": "write-excel-file",
};
