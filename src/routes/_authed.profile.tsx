import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * «الحساب» صار `/account` (تحليل «المزيد» §7.4). يبقى هذا المسار للروابط القديمة والإشعارات المحفوظة،
 * ويحفظ الوسم (`#zen-login-security` من تنبيه تغيير كلمة المرور).
 */
export const Route = createFileRoute("/_authed/profile")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/account", hash: location.hash || undefined, replace: true });
  },
});
