/**
 * تحميل بيانات شاشة «المراكز والحلقات» دفعة واحدة. فُصل من الصفحة (M5) دون تغيير في الطلبات أو ترتيبها.
 */
import {
  getVisiblePhones,
  isTeacher as isTeacherCheck,
  listCenters,
  listHalaqaMembers,
  listHalaqat,
  listPendingHalaqaInvites,
  listStudents,
} from "@/lib/zen-api";
import { myManagedCenters } from "@/lib/center";

export async function loadCentersScreen(userId: string) {
  const [t, c, h, managed] = await Promise.all([
    isTeacherCheck(userId),
    listCenters(),
    listHalaqat(),
    myManagedCenters().catch(() => []),
  ]);
  const entries = await Promise.all(
    h.map(async (x) => [x.id, await listHalaqaMembers(x.id)] as const),
  );
  // الدعوات المعلّقة: قاعدة البيانات تعيدها لمدير الحلقة فقط، فيكفي طلبها للجميع.
  const inviteEntries = t
    ? await Promise.all(h.map(async (x) => [x.id, await listPendingHalaqaInvites(x.id)] as const))
    : [];
  const invitedIds = Array.from(
    new Set(inviteEntries.flatMap(([, list]) => list.map((i) => i.student_id))),
  );
  const studentNames =
    invitedIds.length > 0
      ? Object.fromEntries((await listStudents()).map((p) => [p.id, p.name]))
      : null;
  // أرقام الهواتف تُطلب بشكل منفصل: تعيدها قاعدة البيانات فقط لمعلّم الحلقة.
  const memberIds = Array.from(new Set(entries.flatMap(([, list]) => list.map((m) => m.id))));
  return {
    teacher: t,
    roles: Object.fromEntries(managed.map((m) => [m.center_id, m.role])),
    centers: c,
    halaqat: h,
    members: Object.fromEntries(entries),
    invites: Object.fromEntries(inviteEntries),
    studentNames,
    phones: await getVisiblePhones(memberIds),
  };
}
