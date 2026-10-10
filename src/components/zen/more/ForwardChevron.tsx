import { ChevronLeft } from "lucide-react";

/**
 * سهم «إلى الأمام» لصفوف القوائم: يشير يساراً في العربية ويميناً في الاتجاه من اليسار (تحليل «المزيد» I18N-04).
 */
export function ForwardChevron({
  className = "w-4 h-4 text-muted-foreground",
}: {
  className?: string;
}) {
  return <ChevronLeft className={`${className} ltr:rotate-180`} aria-hidden="true" />;
}
