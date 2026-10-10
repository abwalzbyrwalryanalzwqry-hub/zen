/**
 * فاصل بين المعلومات («صفحة ٢ | الجزء ١»). كان «·» بجانب الأرقام العربية يُقرأ صفراً («٠»)،
 * فصار خطاً عمودياً رفيعاً لا يشبه أي رقم، ولا يُقرأ لقارئات الشاشة.
 */
export function Sep() {
  return (
    <span
      aria-hidden="true"
      className="mx-2 inline-block h-[0.85em] w-px translate-y-[0.1em] bg-current opacity-35"
    />
  );
}
