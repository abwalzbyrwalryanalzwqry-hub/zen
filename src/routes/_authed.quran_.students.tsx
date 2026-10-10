import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * كانت صفحة «طلابي» ثانية بنفس العنوان (فحص الأقسام T4). صارت تبويب «الطلاب» في /teacher،
 * ويبقى هذا المسار للروابط القديمة والإشعارات المحفوظة فيحوّل إليه.
 */
export const Route = createFileRoute("/_authed/quran_/students")({
  beforeLoad: () => {
    throw redirect({ to: "/teacher", search: { tab: "students" }, replace: true });
  },
});
