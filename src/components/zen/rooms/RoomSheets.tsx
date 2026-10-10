import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  discussionSettings,
  openReports,
  resolveReports,
  roomErrorMessage,
  setDiscussion,
  setRoomConsent,
  type DiscussionSettings,
  type OpenReport,
} from "@/lib/rooms";

export function ActionBtn(props: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`glass rounded-full px-2.5 py-1 text-[0.6875rem] flex items-center gap-1 ${
        props.danger ? "text-destructive" : "text-foreground"
      }`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

export function SheetFrame(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 bg-black/40 flex items-end" onClick={props.onClose}>
      <div
        className="glass-strong w-full rounded-t-3xl p-5 max-h-[75%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black">{props.title}</h2>
          <button onClick={props.onClose} aria-label="إغلاق" className="p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function ReportsSheet(props: { roomId: string; onClose: () => void; onChange: () => void }) {
  const [rows, setRows] = useState<OpenReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    openReports(props.roomId)
      .then(setRows)
      .catch((e) => setError(roomErrorMessage(e)));
  }, [props.roomId]);
  useEffect(load, [load]);

  const resolve = async (id: string, del: boolean) => {
    try {
      await resolveReports(id, del);
      load();
      props.onChange();
    } catch (e) {
      setError(roomErrorMessage(e));
    }
  };

  return (
    <SheetFrame title="البلاغات المفتوحة" onClose={props.onClose}>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {rows === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">لا بلاغات مفتوحة.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.message_id} className="glass rounded-2xl p-3">
              <p className="text-[0.6875rem] text-muted-foreground">
                {r.sender_name} · {r.reports} بلاغ
              </p>
              <p className="text-sm my-1 whitespace-pre-wrap break-words">{r.content}</p>
              {r.reasons.length > 0 && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  الأسباب: {r.reasons.join("، ")}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => resolve(r.message_id, false)}
                  className="flex-1 rounded-xl py-1.5 text-xs glass"
                >
                  إبقاء الرسالة
                </button>
                <button
                  onClick={() => resolve(r.message_id, true)}
                  className="flex-1 rounded-xl py-1.5 text-xs bg-destructive text-white"
                >
                  حذف الرسالة
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SheetFrame>
  );
}

export function SettingsSheet(props: { halaqaId: string; onClose: () => void }) {
  const [s, setS] = useState<DiscussionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    discussionSettings(props.halaqaId)
      .then(setS)
      .catch((e) => setError(roomErrorMessage(e)));
  }, [props.halaqaId]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(roomErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetFrame title="إعدادات نقاش الحلقة" onClose={props.onClose}>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {!s ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
      ) : (
        <div className="space-y-4">
          <Toggle
            label="تفعيل مجموعة النقاش"
            hint="يكتب فيها الطلاب ويشرف عليها المعلّم."
            checked={s.enabled}
            disabled={busy}
            onChange={(v) => act(() => setDiscussion(props.halaqaId, v, s.consent_required))}
          />
          <Toggle
            label="اشتراط موافقة ولي الأمر"
            hint="لا يدخل الطالب النقاش حتى يوافق وليّ أمره."
            checked={s.consent_required}
            disabled={busy}
            onChange={(v) => act(() => setDiscussion(props.halaqaId, s.enabled, v))}
          />
          {s.consent_required && s.members.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2">الطلاب والموافقات</p>
              <div className="space-y-1.5">
                {s.members.map((m) => (
                  <div
                    key={m.student_id}
                    className="flex items-center justify-between glass rounded-xl px-3 py-2"
                  >
                    <span className="text-sm">{m.name}</span>
                    {m.consented ? (
                      <span className="text-[0.6875rem] text-primary">موافَق</span>
                    ) : m.has_guardian ? (
                      <span className="text-[0.6875rem] text-muted-foreground">
                        بانتظار ولي الأمر
                      </span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(() => setRoomConsent(props.halaqaId, m.student_id, true))
                        }
                        className="text-[0.6875rem] px-2 py-1 rounded-lg bg-primary text-primary-foreground"
                      >
                        السماح
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[0.625rem] text-muted-foreground mt-2">
                يوافق المعلّم فقط عن الطالب الذي لا وليّ أمر مربوطاً بحسابه.
              </p>
            </div>
          )}
        </div>
      )}
    </SheetFrame>
  );
}

export function Toggle(props: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-medium">{props.label}</span>
        <span className="block text-[0.6875rem] text-muted-foreground">{props.hint}</span>
      </span>
      <input
        type="checkbox"
        className="w-5 h-5 accent-primary"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}
