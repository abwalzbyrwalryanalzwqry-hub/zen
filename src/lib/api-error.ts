/**
 * خطأ قراءة من الخادم (تدقيق 1.3). كانت دوال هذا الملف تتجاهل `error` وتعيد قائمة فارغة، فيرى المستخدم
 * «لا يوجد سجل» عند انقطاع الشبكة أو رفض الصلاحية ويظن أن بياناته ضاعت. الدوال الجديدة والمعدَّلة ترمي
 * `ApiError`، والشاشة تعرض حالة الخطأ وزر «أعد المحاولة» (`QueryError`).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** يرمي عند وجود خطأ، ويعيد البيانات (أو `fallback` إن كانت null). */
export function unwrap<T>(
  res: { data: T | null; error: { message: string; code?: string } | null },
  fallback: T,
): T {
  if (res.error) throw new ApiError(res.error.message, res.error.code);
  return res.data ?? fallback;
}

export type ApiErrorLike = { message: string; code?: string };
