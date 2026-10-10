import { useCallback, useState } from "react";
import { readSort, writeSort, type StudentSort } from "@/lib/daily-record-assist";

/** ترتيب القائمة المحفوظ لكل حلقة؛ في الشاشة لتتبعه «السابق/التالي» في لوحة الطالب أيضاً. */
export function useStudentSort(halaqa: string) {
  const [sort, setSortState] = useState<StudentSort>(() => readSort(halaqa));
  const [sortFor, setSortFor] = useState(halaqa);
  if (sortFor !== halaqa) {
    setSortFor(halaqa);
    setSortState(readSort(halaqa));
  }
  const setSort = useCallback(
    (m: StudentSort) => {
      setSortState(m);
      writeSort(halaqa, m);
    },
    [halaqa],
  );
  return [sort, setSort] as const;
}
