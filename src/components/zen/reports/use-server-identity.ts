import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ReportConfig } from "@/lib/reports/config";
import { applyIdentity, fetchIdentity, identityOf, saveIdentity } from "@/lib/reports/identity";

/**
 * يربط هوية التقرير بالمركز: تُقرأ مرة عند الفتح وتُدمج في الإعدادات، وكل تعديل عليها يُحفظ للمركز بعد
 * لحظة إن كان المستخدم من طاقمه. إن تعذّر النداء (خادم أقدم أو بلا صلاحية) يبقى الحفظ على الجهاز كما قبل.
 */
export function useServerIdentity(
  halaqa: string,
  cfg: ReportConfig,
  setCfg: Dispatch<SetStateAction<ReportConfig>>,
): { canEdit: boolean } {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["report-identity", halaqa],
    queryFn: () => fetchIdentity(halaqa),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (q.data === undefined || saved.current !== null) return;
    setCfg((c) => {
      const n = q.data?.identity ? applyIdentity(c, q.data.identity) : c;
      saved.current = JSON.stringify(identityOf(n));
      return n;
    });
  }, [q.data, setCfg]);
  const key = JSON.stringify(identityOf(cfg));
  const canEdit = !!q.data?.canEdit;
  // تعديل دون اتصال يبقى في إعدادات الجهاز ويُرسل للمركز عند عودة الاتصال (1.16.0).
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const on = () => setOnline((n) => n + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
  useEffect(() => {
    if (!canEdit || saved.current === null || key === saved.current) return;
    const h = setTimeout(() => {
      void saveIdentity(halaqa, JSON.parse(key)).then((ok) => {
        if (!ok) return;
        saved.current = key;
        qc.setQueryData(["report-identity", halaqa], { identity: JSON.parse(key), canEdit });
      });
    }, 800);
    return () => clearTimeout(h);
  }, [key, canEdit, halaqa, qc, online]);
  return { canEdit };
}
