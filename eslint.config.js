import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// تدقيق 2026-10 (1.1): «اليوم» بتوقيت المستخدم. قصّ ISO يعطي يوم UTC؛ استعمل `@/lib/local-day`.
// الاستثناء الموثَّق (حساب أيام صرف بـ UTC، أو يوم UTC كما يعدّه الخادم) يأخذ تعليق تعطيل بسببه.
const DAY_RULES = [
  {
    selector:
      "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
    message:
      "toISOString().slice() يعطي يوم UTC لا يوم المستخدم. استعمل localDayKey/addLocalDays من @/lib/local-day.",
  },
  {
    selector: "CallExpression[callee.property.name='slice'][callee.object.property.name=/_at$/]",
    message: "قصّ طابع *_at يعطي يوم UTC. استعمل localDayOf من @/lib/local-day.",
  },
  // فحص 2026-10 (P1-3): «ar» المجرّد يعطي أرقاماً مختلفة بين إصدارات WebView. واجهة مترجمة: intlLocale()،
  // ونص عربي دائماً (طباعة، تصدير، شهادة): AR_LATN. المصحف بأرقامه العربية-الهندية يستعمل toArabicDigits.
  {
    selector:
      "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] > Literal.arguments:first-child[value='ar']",
    message:
      "لا تستعمل «ar» مجرّداً: intlLocale() للواجهة أو AR_LATN من @/lib/i18n للنص العربي دائماً.",
  },
  {
    selector:
      "NewExpression[callee.object.name='Intl'] > Literal.arguments:first-child[value='ar']",
    message:
      "لا تستعمل «ar» مجرّداً: intlLocale() للواجهة أو AR_LATN من @/lib/i18n للنص العربي دائماً.",
  },
  {
    selector:
      "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] > Identifier.arguments:first-child[name='undefined']",
    message: "لغة الجهاز لا لغة الواجهة: استعمل intlLocale() من @/lib/i18n.",
  },
];

/**
 * تحليل «المزيد» (السبب الجذري 3): كتابة Supabase بـ `await` دون قراءة `error` تبتلع الفشل فتبدو ناجحة.
 * مطبّقة على ملفات القسم أولاً، وتتّسع بالتدريج.
 */
const UNCHECKED_WRITE = {
  selector:
    "ExpressionStatement > AwaitExpression > CallExpression[callee.type='MemberExpression'][callee.property.name=/^(eq|in|match|neq|insert|update|upsert|delete)$/]",
  message: "نتيجة كتابة Supabase مهملة: اقرأ `{ error }` وارمِه أو اعرضه (تحليل «المزيد»).",
};

/**
 * تدقيق أكتوبر 2026 (المرحلة 4): localStorage يرمي حين يُعطَّل التخزين أو يمتلئ، وكان نداؤه المباشر في أول عرض
 * يُسقط التطبيق. الكود الجديد يستعمل `@/lib/storage`. القائمة أدناه هي الملفات القديمة وقت التدقيق، وتُحذف منها كلما
 * نُقل ملف، ولا يُضاف إليها.
 */
const LEGACY_LOCAL_STORAGE = [
  "src/components/zen/home/OnboardingCards.tsx",
  "src/hooks/chat/use-chat-ai.ts",
  "src/hooks/useSession.ts",
  "src/integrations/supabase/client.ts",
  "src/integrations/supabase/previewAuthStorage.ts",
  "src/lib/a11y.ts",
  "src/lib/account-sync.ts",
  "src/lib/account.ts",
  "src/lib/app-lock-push.ts",
  "src/lib/auth.ts",
  "src/lib/auth/sign-out.ts",
  "src/lib/certificates/preprinted.ts",
  "src/lib/chat-media-outbox.ts",
  "src/lib/chat-outbox.ts",
  "src/lib/chat-search.ts",
  "src/lib/daily-offline.ts",
  "src/lib/daily-record-api.ts",
  "src/lib/daily-record-assist.ts",
  "src/lib/daily-record-cache.ts",
  "src/lib/exam/storage.ts",
  "src/lib/feature-flags.ts",
  "src/lib/first-use-tips.ts",
  "src/lib/halaqa-register.ts",
  "src/lib/i18n.ts",
  "src/lib/last-reason.ts",
  "src/lib/muhasaba/reminder.ts",
  "src/lib/muhasaba/storage.ts",
  "src/lib/notify/device.ts",
  "src/lib/offline/cache-policy.ts",
  "src/lib/offline/guest.ts",
  "src/lib/offline/stored-session.ts",
  "src/lib/onboarding.ts",
  "src/lib/perf-mode.ts",
  "src/lib/prayer.ts",
  "src/lib/quran/activity.ts",
  "src/lib/quran/bookmarks.ts",
  "src/lib/quran/khatmah-plan.ts",
  "src/lib/quran/reader-state.ts",
  "src/lib/quran/reading-history.ts",
  "src/lib/quran/reading-prefs.ts",
  "src/lib/quran/reading-sync.ts",
  "src/lib/quran/recitation-offline.ts",
  "src/lib/quran/recitations.ts",
  "src/lib/quran/review-outbox.ts",
  "src/lib/quran/search-service.ts",
  "src/lib/quran/tafsir-service.ts",
  "src/lib/recent-accounts.ts",
  "src/lib/reminders.ts",
  "src/lib/reports/config.ts",
  "src/lib/reports/favorites.ts",
  "src/lib/reports/offline.ts",
  "src/lib/simple-mode.ts",
  "src/lib/usage.ts",
  "src/lib/whats-new.ts",
  "src/lib/zen-stories.ts",
  "src/routes/__root.tsx",
  "src/routes/_authed.mushaf.records.tsx",
  "src/routes/_authed.mushaf.tafsir.tsx",
];

export default tseslint.config(
  {
    // ملفات مُولَّدة لا تُحرَّر يدوياً (مكتوب فيها «automatically generated. Do not edit»)
    ignores: [
      "dist",
      "dist-native",
      ".output",
      ".vinxi",
      "android",
      "ios",
      "playwright-report",
      "test-results",
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/auth-attacher.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // ESLint 10 و react-hooks 7 (M12): قاعدتا الخطّافات الأساسيتان، ثم قواعد React Compiler على مراحل.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // المرحلة الأولى (2026-10): القواعد التي يمرّ بها الكود كاملاً اليوم صارت أخطاء كي لا تتراجع.
      "react-hooks/static-components": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/globals": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/unsupported-syntax": "error",
      "react-hooks/config": "error",
      "react-hooks/gating": "error",
      "react-hooks/incompatible-library": "error",
      // المرحلة الثانية: 71 مخالفة أُصلحت. الأنماط المعتمدة: useAsync / useCachedResource للتحميل،
      // useLatest لمراجع «آخر قيمة»، useNow للوقت في العرض، وتعديل الحالة أثناء العرض عند تغيّر الخصائص.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      // تدقيق 2026-10 (1.1): «اليوم» بتوقيت المستخدم. قصّ ISO يعطي يوم UTC؛ استعمل `@/lib/local-day`.
      // الاستثناء الموثَّق (حساب أيام صرف بـ UTC، أو يوم UTC كما يعدّه الخادم) يأخذ تعليق تعطيل بسببه.
      "no-restricted-syntax": ["error", ...DAY_RULES],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // ملفات مسارات TanStack Router تصدّر `Route` وتعرّف مكوّنها محلياً، ومُلحق الموجّه يتولّى التحديث السريع لها.
    // eslint-plugin-react-refresh 0.5 صار يبلّغ عن هذا النمط الصحيح (108 تحذيراً كاذباً)، فتُستثنى منه.
    files: ["src/routes/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: [
      "src/routes/_authed.more.tsx",
      "src/routes/_authed.profile.tsx",
      "src/routes/_authed.settings*.tsx",
      "src/routes/_authed.account*.tsx",
      "src/routes/_authed.centers.tsx",
      "src/routes/_authed.notifications.tsx",
      "src/routes/_authed.storage.tsx",
      "src/components/zen/more/**",
      "src/components/zen/AccountSettings.tsx",
      "src/components/zen/LoginSecuritySettings.tsx",
      "src/hooks/useProfile.ts",
      "src/lib/account.ts",
      "src/lib/push.ts",
      "src/lib/zen-lms.ts",
      "src/lib/zen-halaqat-api.ts",
    ],
    rules: { "no-restricted-syntax": ["error", ...DAY_RULES, UNCHECKED_WRITE] },
  },
  {
    // الاختبارات تبني تواريخ مرجعية بـ UTC عمداً.
    files: ["**/*.test.{ts,tsx}", "e2e/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "src/lib/storage.ts", ...LEGACY_LOCAL_STORAGE],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "localStorage",
          message: "استعمل readLocal/writeLocal من @/lib/storage (لا يرمي).",
        },
        { object: "window", property: "localStorage", message: "استعمل @/lib/storage." },
      ],
    },
  },
  eslintPluginPrettier,
);
