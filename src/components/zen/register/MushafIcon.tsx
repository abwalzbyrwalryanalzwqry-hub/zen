/**
 * أيقونة «مصحف مفتوح» بخطوط ناعمة: دفّتان مذهّبتان، وأسطر الصفحتين، وشريط علامة يتدلّى من الوسط.
 * تأخذ لونها من currentColor (الإطار) ومن --gold (الشريط والحلية) فتتبع سمة التطبيق في الوضعين.
 */
export function MushafIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* الدفّتان */}
      <path d="M16 9.5C13.2 7.4 9.4 6.6 4.5 7v16.2c4.9-.4 8.7.4 11.5 2.5 2.8-2.1 6.6-2.9 11.5-2.5V7c-4.9-.4-8.7.4-11.5 2.5Z" />
      <path d="M16 9.5v16.2" />
      {/* أسطر الصفحتين */}
      <path
        d="M7.5 11.2c2-.1 3.9.2 5.6.9M7.5 14.4c2-.1 3.9.2 5.6.9M7.5 17.6c2-.1 3.9.2 5.6.9"
        opacity={0.55}
      />
      <path
        d="M24.5 11.2c-2-.1-3.9.2-5.6.9M24.5 14.4c-2-.1-3.9.2-5.6.9M24.5 17.6c-2-.1-3.9.2-5.6.9"
        opacity={0.55}
      />
      {/* شريط العلامة والحلية الذهبية */}
      <path d="M16 25.7v3.3l1.4-1.2 1.4 1.2v-3.9" stroke="var(--gold)" />
      <path
        d="M16 3.2l1 1.6 1.8.2-1.3 1.2.3 1.8-1.8-.9-1.8.9.3-1.8L13.2 5l1.8-.2 1-1.6Z"
        fill="var(--gold)"
        stroke="var(--gold)"
        strokeWidth={0.8}
      />
    </svg>
  );
}
