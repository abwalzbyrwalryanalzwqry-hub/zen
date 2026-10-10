/**
 * «هل شاشة القفل ظاهرة؟» لزر الرجوع في native.ts دون إدخال وحدة القفل في الحزمة الأولى:
 * app-lock-state تسجّل الفحص عند تحميلها (في Android فقط).
 */
let probe: () => boolean = () => false;

export function setLockProbe(f: () => boolean): void {
  probe = f;
}

export function isLockShowing(): boolean {
  return probe();
}
