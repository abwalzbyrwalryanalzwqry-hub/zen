// أساس عميل zen-api المشترك بين ملفاته (M5): نوع الملف الشخصي وأعمدته المسموحة.

export type Profile = {
  id: string;
  name: string;
  avatar: string | null;
  role: "student" | "teacher";
  /** يُملأ فقط عندما يُصرَّح للمتصل برؤية الرقم (صاحبه أو معلّم حلقته). */
  phone?: string | null;
};

/**
 * أعمدة الملف الشخصي المسموح بقراءتها للعميل.
 * رقم الهاتف انتقل إلى جدول profile_contacts المحكوم بسياسة خصوصية منفصلة،
 * لذلك لا يجوز استخدام select("*") على profiles.
 */
export const PROFILE_COLUMNS = "id, name, avatar, role";
