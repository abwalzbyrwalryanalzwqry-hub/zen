-- ════════════════════════════════════════════════════════════════════════════
-- دقة الإدخال (1.18.0، المرحلة 2 من خطة التطوير؛ docs/DAILY_RECORD.md «التدقيق ودقة الإدخال»)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) سجل تعديلات ما بعد الإغلاق: كل تعديل على يوم سبق إغلاقه (أُعيد فتحه ثم عُدّل، أو حضور بالرمز بعده) يُحفظ
--    بمن وأين ومتى وما قبله وما بعده، لكل طالب في كل عملية. لا تُعاد كتابة دوال السجل: محفّزات على الجداول
--    الأصلية نفسها (attendance، halaqa_register_entries، recitation_sessions، recitation_assessments) تلتقط
--    حالة الطالب في اليوم قبل أول تغيير في المعاملة وبعد آخر تغيير، فتشمل كل دالة قائمة أو قادمة.
--    «سبق إغلاقه» = عمود جديد first_completed_at يُضبط عند أول إغلاق ولا يُمسح عند إعادة الفتح.
--    وإعادة الفتح وإعادة الإغلاق تُسجَّلان حدثين على اليوم.
-- 2) مراقب الأنماط غير المعتادة (daily_record_anomalies): أكثر من 5 صفحات حفظ في يوم، و«ممتاز» مع خطأ،
--    وحضور كامل 30 يوماً، وإغلاق بعد منتصف الليل متكرر، وطالب يحضر بلا تسميع أسابيع، وتعديلات بعد الإغلاق.
--    تحذيرات للمراجعة لا أحكام؛ ومنها جودة الإدخال لكل حلقة في لوحة المركز (center_record_quality).
-- 3) عيّنة تدقيق أسبوعية للمشرف: 5 سجلات طلاب عشوائية ثابتة طوال الأسبوع لكل حلقة، يؤكدها أو يعلّم عليها.
-- إضافات فقط: جدولان، وعمود، ومحفّزات، ودوال قراءة. لا تُمسّ دوال الكتابة ولا البيانات القائمة.
-- التراجع:
--   DROP TRIGGER daily_audit_before ON public.attendance; DROP TRIGGER daily_audit_after ON public.attendance;
--   (وكذلك على halaqa_register_entries وrecitation_sessions وrecitation_assessments)،
--   DROP TRIGGER daily_record_first_close ON public.halaqa_daily_records;
--   DROP TRIGGER daily_record_reopen_audit ON public.halaqa_daily_records;
--   DROP FUNCTION public.daily_record_audit_list, public.daily_record_anomalies, public.center_record_quality,
--     public.audit_sample, public.review_audit_sample, private.daily_audit_touch, private.daily_audit_snapshot,
--     private.daily_audit_trg_attendance, private.daily_audit_trg_entries, private.daily_audit_trg_sessions,
--     private.daily_audit_trg_assessments, private.daily_record_close_trg, private.daily_record_audit_trg,
--     private.ayah_page, private.is_center_reviewer;
--   DROP TABLE public.daily_record_reviews, public.daily_record_audit;
--   ALTER TABLE public.halaqa_daily_records DROP COLUMN first_completed_at;
-- الفحص: supabase/tests/checks.sql (153–155).

-- ─────────── رقم الصفحة (مطابق لـ PAGE_STARTS في src/lib/quran/structure-data.ts؛ يحرسه record-audit.test.ts) ───────────

CREATE OR REPLACE FUNCTION private.ayah_page(_surah integer, _ayah integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM unnest(ARRAY[
    1001, 2001, 2006, 2017, 2025, 2030, 2038, 2049, 2058, 2062, 2070, 2077, 2084, 2089, 2094, 2102,
    2106, 2113, 2120, 2127, 2135, 2142, 2146, 2154, 2164, 2170, 2177, 2182, 2187, 2191, 2197, 2203,
    2211, 2216, 2220, 2225, 2231, 2234, 2238, 2246, 2249, 2253, 2257, 2260, 2265, 2270, 2275, 2282,
    2283, 3001, 3010, 3016, 3023, 3030, 3038, 3046, 3053, 3062, 3071, 3078, 3084, 3092, 3101, 3109,
    3116, 3122, 3133, 3141, 3149, 3154, 3158, 3166, 3174, 3181, 3187, 3195, 4001, 4007, 4012, 4015,
    4020, 4024, 4027, 4034, 4038, 4045, 4052, 4060, 4066, 4075, 4080, 4087, 4092, 4095, 4102, 4106,
    4114, 4122, 4128, 4135, 4141, 4148, 4155, 4163, 4171, 4176, 5003, 5006, 5010, 5014, 5018, 5024,
    5032, 5037, 5042, 5046, 5051, 5058, 5065, 5071, 5077, 5083, 5090, 5096, 5104, 5109, 5114, 6001,
    6009, 6019, 6028, 6036, 6045, 6053, 6060, 6069, 6074, 6082, 6091, 6095, 6102, 6111, 6119, 6125,
    6132, 6138, 6143, 6147, 6152, 6158, 7001, 7012, 7023, 7031, 7038, 7044, 7052, 7058, 7068, 7074,
    7082, 7088, 7096, 7105, 7121, 7131, 7138, 7144, 7150, 7156, 7160, 7164, 7171, 7179, 7188, 7196,
    8001, 8009, 8017, 8026, 8034, 8041, 8046, 8053, 8062, 8070, 9001, 9007, 9014, 9021, 9027, 9032,
    9037, 9041, 9048, 9055, 9062, 9069, 9073, 9080, 9087, 9094, 9100, 9107, 9112, 9118, 9123, 10001,
    10007, 10015, 10021, 10026, 10034, 10043, 10054, 10062, 10071, 10079, 10089, 10098, 10107, 11006, 11013, 11020,
    11029, 11038, 11046, 11054, 11063, 11072, 11082, 11089, 11098, 11109, 11118, 12005, 12015, 12023, 12031, 12038,
    12044, 12053, 12064, 12070, 12079, 12087, 12096, 12104, 13001, 13006, 13014, 13019, 13029, 13035, 13043, 14006,
    14011, 14019, 14025, 14034, 14043, 15001, 15016, 15032, 15052, 15071, 15091, 16007, 16015, 16027, 16035, 16043,
    16055, 16065, 16073, 16080, 16088, 16094, 16103, 16111, 16119, 17001, 17008, 17018, 17028, 17039, 17050, 17059,
    17067, 17076, 17087, 17097, 17105, 18005, 18016, 18021, 18028, 18035, 18046, 18054, 18062, 18075, 18084, 18098,
    19001, 19012, 19026, 19039, 19052, 19065, 19077, 19096, 20013, 20038, 20052, 20065, 20077, 20088, 20099, 20114,
    20126, 21001, 21011, 21025, 21036, 21045, 21058, 21073, 21082, 21091, 21102, 22001, 22006, 22016, 22024, 22031,
    22039, 22047, 22056, 22065, 22073, 23001, 23018, 23028, 23043, 23060, 23075, 23090, 23105, 24001, 24011, 24021,
    24028, 24032, 24037, 24044, 24054, 24059, 24062, 25003, 25012, 25021, 25033, 25044, 25056, 25068, 26001, 26020,
    26040, 26061, 26084, 26112, 26137, 26160, 26184, 26207, 27001, 27014, 27023, 27036, 27045, 27056, 27064, 27077,
    27089, 28006, 28014, 28022, 28029, 28036, 28044, 28051, 28060, 28071, 28078, 28085, 29007, 29015, 29024, 29031,
    29039, 29046, 29053, 29064, 30006, 30016, 30025, 30033, 30042, 30051, 31001, 31012, 31020, 31029, 32001, 32012,
    32021, 33001, 33007, 33016, 33023, 33031, 33036, 33044, 33051, 33055, 33063, 34001, 34008, 34015, 34023, 34032,
    34040, 34049, 35004, 35012, 35019, 35031, 35039, 35045, 36013, 36028, 36041, 36055, 36071, 37001, 37025, 37052,
    37077, 37103, 37127, 37154, 38001, 38017, 38027, 38043, 38062, 38084, 39006, 39011, 39022, 39032, 39041, 39048,
    39057, 39068, 39075, 40008, 40017, 40026, 40034, 40041, 40050, 40059, 40067, 40078, 41001, 41012, 41021, 41030,
    41039, 41047, 42001, 42011, 42016, 42023, 42032, 42045, 42052, 43011, 43023, 43034, 43048, 43061, 43074, 44001,
    44019, 44040, 45001, 45014, 45023, 45033, 46006, 46015, 46021, 46029, 47001, 47012, 47020, 47030, 48001, 48010,
    48016, 48024, 48029, 49005, 49012, 50001, 50016, 50036, 51007, 51031, 51052, 52015, 52032, 53001, 53027, 53045,
    54007, 54028, 54050, 55017, 55041, 55068, 56017, 56051, 56077, 57004, 57012, 57019, 57025, 58001, 58007, 58012,
    58022, 59004, 59010, 59017, 60001, 60006, 60012, 61006, 62001, 62009, 63005, 64001, 64010, 65001, 65006, 66001,
    66008, 67001, 67013, 67027, 68016, 68043, 69009, 69035, 70011, 70040, 71011, 72001, 72014, 73001, 73020, 74018,
    74048, 75020, 76006, 76026, 77020, 78001, 78031, 79016, 80001, 81001, 82001, 83007, 83035, 85001, 86001, 87016,
    89001, 89024, 91001, 92015, 95001, 97001, 98008, 100010, 103001, 106001, 109001, 112001
  ]) AS k WHERE k <= _surah * 1000 + _ayah;
$$;
REVOKE ALL ON FUNCTION private.ayah_page(integer, integer) FROM PUBLIC, anon, authenticated;

-- ─────────── المشرف أو إدارة المركز (يراجعان العيّنة) ───────────

CREATE OR REPLACE FUNCTION private.is_center_reviewer(_uid uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL AND _center IS NOT NULL AND (
    public.manages_center(_uid, _center)
    OR EXISTS (SELECT 1 FROM public.center_staff s
                WHERE s.center_id = _center AND s.user_id = _uid AND s.role = 'supervisor'));
$$;
REVOKE ALL ON FUNCTION private.is_center_reviewer(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─────────── «سبق إغلاقه» ───────────

ALTER TABLE public.halaqa_daily_records ADD COLUMN IF NOT EXISTS first_completed_at timestamptz;
COMMENT ON COLUMN public.halaqa_daily_records.first_completed_at IS
  'أول إغلاق لليوم؛ لا يُمسح عند إعادة الفتح. ما يُعدَّل بعده يُسجَّل في daily_record_audit.';
UPDATE public.halaqa_daily_records
   SET first_completed_at = coalesce(completed_at, locked_at, updated_at)
 WHERE first_completed_at IS NULL AND status IN ('completed', 'locked');

-- ─────────── الجداول ───────────

CREATE TABLE IF NOT EXISTS public.daily_record_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- بلا مفتاح أجنبي: يبقى الأثر إن حُذف اليوم (المحذوفة مؤخراً).
  record_id uuid NOT NULL,
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('edit', 'reopen', 'recomplete')),
  before jsonb,
  after jsonb,
  txid bigint NOT NULL DEFAULT txid_current(),
  at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.daily_record_audit IS
  'تعديلات السجل اليومي بعد إغلاقه: قبل وبعد لكل طالب في كل عملية، وإعادة الفتح والإغلاق. docs/DAILY_RECORD.md';
CREATE UNIQUE INDEX IF NOT EXISTS daily_record_audit_tx_student
  ON public.daily_record_audit (txid, record_id, student_id) WHERE action = 'edit';
CREATE INDEX IF NOT EXISTS daily_record_audit_halaqa_idx ON public.daily_record_audit (halaqa_id, at DESC);
CREATE INDEX IF NOT EXISTS daily_record_audit_student_idx ON public.daily_record_audit (student_id, at DESC);
CREATE INDEX IF NOT EXISTS daily_record_audit_actor_idx ON public.daily_record_audit (actor_id);
ALTER TABLE public.daily_record_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_record_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_record_audit TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_record_reviews (
  record_id uuid NOT NULL REFERENCES public.halaqa_daily_records(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ok boolean NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_id, student_id)
);
COMMENT ON TABLE public.daily_record_reviews IS 'مراجعة المشرف لعيّنة التدقيق الأسبوعية: سليم أو يحتاج تصحيحاً، مع ملاحظة.';
CREATE INDEX IF NOT EXISTS daily_record_reviews_reviewer_idx ON public.daily_record_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS daily_record_reviews_student_idx ON public.daily_record_reviews (student_id);
ALTER TABLE public.daily_record_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_record_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_record_reviews TO service_role;

-- ─────────── اللقطة والالتقاط ───────────

/** حالة الطالب في اليوم بما يُدقَّق: الحضور وسببه، والحفظ والمراجعة بدرجتهما وخطئهما، والتقييم والملاحظة. */
CREATE OR REPLACE FUNCTION private.daily_audit_snapshot(_record uuid, _halaqa uuid, _date date, _student uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'status', a.status,
    'reason', a.reason,
    'note', e.note,
    'evaluation', CASE WHEN e.eval_overall IS NULL AND e.eval_tajweed IS NULL
                            AND e.eval_pronunciation IS NULL AND e.eval_behavior IS NULL THEN NULL
                       ELSE jsonb_build_object('overall', e.eval_overall, 'tajweed', e.eval_tajweed,
                                               'pronunciation', e.eval_pronunciation, 'behavior', e.eval_behavior) END,
    'memorize', private.daily_kind_json(_record, _student, 'memorize'),
    'review', private.daily_kind_json(_record, _student, 'review')))
    FROM (SELECT 1) one
    LEFT JOIN public.attendance a ON a.student_id = _student AND a.halaqa_id = _halaqa AND a.session_date = _date
    LEFT JOIN public.halaqa_register_entries e
           ON e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = _student;
$$;
REVOKE ALL ON FUNCTION private.daily_audit_snapshot(uuid, uuid, date, uuid) FROM PUBLIC, anon, authenticated;

/**
 * يُستدعى من المحفّزات. قبل أول تغيير في المعاملة: صف «edit» بلقطة «قبل»؛ وبعد كل تغيير: تُحدَّث «بعد».
 * لا شيء ليوم لم يُغلق قط (الإدخال العادي في يومه لا يُسجَّل).
 */
CREATE OR REPLACE FUNCTION private.daily_audit_touch(_record uuid, _student uuid, _after boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
BEGIN
  IF _record IS NULL OR _student IS NULL THEN RETURN; END IF;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE id = _record;
  IF rec.id IS NULL OR rec.first_completed_at IS NULL THEN RETURN; END IF;
  -- حذف متتالٍ (الحلقة أو الطالب يُحذفان): لا أثر لما يُحذف كله.
  IF NOT EXISTS (SELECT 1 FROM public.halaqat WHERE id = rec.halaqa_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _student) THEN
    RETURN;
  END IF;
  IF NOT _after THEN
    INSERT INTO public.daily_record_audit (record_id, halaqa_id, record_date, student_id, actor_id, action, before)
    VALUES (rec.id, rec.halaqa_id, rec.record_date, _student, (SELECT auth.uid()), 'edit',
            private.daily_audit_snapshot(rec.id, rec.halaqa_id, rec.record_date, _student))
    ON CONFLICT (txid, record_id, student_id) WHERE action = 'edit' DO NOTHING;
  ELSE
    UPDATE public.daily_record_audit
       SET after = private.daily_audit_snapshot(rec.id, rec.halaqa_id, rec.record_date, _student), at = now()
     WHERE txid = txid_current() AND record_id = rec.id AND student_id = _student AND action = 'edit';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_audit_touch(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.daily_audit_trg_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.attendance := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF r.halaqa_id IS NOT NULL THEN
    PERFORM private.daily_audit_touch(d.id, r.student_id, TG_WHEN = 'AFTER')
       FROM public.halaqa_daily_records d
      WHERE d.halaqa_id = r.halaqa_id AND d.record_date = r.session_date AND d.first_completed_at IS NOT NULL;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.daily_audit_trg_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.halaqa_register_entries := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  PERFORM private.daily_audit_touch(d.id, r.student_id, TG_WHEN = 'AFTER')
     FROM public.halaqa_daily_records d
    WHERE d.halaqa_id = r.halaqa_id AND d.record_date = r.session_date AND d.first_completed_at IS NOT NULL;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.daily_audit_trg_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.recitation_sessions := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF r.daily_record_id IS NOT NULL THEN
    PERFORM private.daily_audit_touch(r.daily_record_id, r.student_id, TG_WHEN = 'AFTER');
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.daily_audit_trg_assessments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.recitation_assessments := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  PERFORM private.daily_audit_touch(s.daily_record_id, s.student_id, TG_WHEN = 'AFTER')
     FROM public.recitation_sessions s
    WHERE s.id = r.session_id AND s.daily_record_id IS NOT NULL;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_audit_trg_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.daily_audit_trg_entries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.daily_audit_trg_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.daily_audit_trg_assessments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS daily_audit_before ON public.attendance;
CREATE TRIGGER daily_audit_before BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_attendance();
DROP TRIGGER IF EXISTS daily_audit_after ON public.attendance;
CREATE TRIGGER daily_audit_after AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_attendance();
DROP TRIGGER IF EXISTS daily_audit_before ON public.halaqa_register_entries;
CREATE TRIGGER daily_audit_before BEFORE INSERT OR UPDATE OR DELETE ON public.halaqa_register_entries
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_entries();
DROP TRIGGER IF EXISTS daily_audit_after ON public.halaqa_register_entries;
CREATE TRIGGER daily_audit_after AFTER INSERT OR UPDATE OR DELETE ON public.halaqa_register_entries
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_entries();
DROP TRIGGER IF EXISTS daily_audit_before ON public.recitation_sessions;
CREATE TRIGGER daily_audit_before BEFORE INSERT OR UPDATE OR DELETE ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_sessions();
DROP TRIGGER IF EXISTS daily_audit_after ON public.recitation_sessions;
CREATE TRIGGER daily_audit_after AFTER INSERT OR UPDATE OR DELETE ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_sessions();
DROP TRIGGER IF EXISTS daily_audit_before ON public.recitation_assessments;
CREATE TRIGGER daily_audit_before BEFORE INSERT OR UPDATE OR DELETE ON public.recitation_assessments
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_assessments();
DROP TRIGGER IF EXISTS daily_audit_after ON public.recitation_assessments;
CREATE TRIGGER daily_audit_after AFTER INSERT OR UPDATE OR DELETE ON public.recitation_assessments
  FOR EACH ROW EXECUTE FUNCTION private.daily_audit_trg_assessments();

-- ─────────── أول إغلاق، وإعادة الفتح والإغلاق ───────────

CREATE OR REPLACE FUNCTION private.daily_record_close_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'locked') AND NEW.first_completed_at IS NULL THEN
    NEW.first_completed_at := coalesce(NEW.completed_at, NEW.locked_at, now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_record_close_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS daily_record_first_close ON public.halaqa_daily_records;
CREATE TRIGGER daily_record_first_close BEFORE INSERT OR UPDATE ON public.halaqa_daily_records
  FOR EACH ROW EXECUTE FUNCTION private.daily_record_close_trg();

CREATE OR REPLACE FUNCTION private.daily_record_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status = 'open' THEN
    INSERT INTO public.daily_record_audit (record_id, halaqa_id, record_date, actor_id, action, before)
    VALUES (NEW.id, NEW.halaqa_id, NEW.record_date, (SELECT auth.uid()), 'reopen',
            jsonb_build_object('completed_at', OLD.completed_at, 'completed_by', OLD.completed_by));
  ELSIF OLD.status = 'open' AND NEW.status = 'completed' AND OLD.first_completed_at IS NOT NULL THEN
    INSERT INTO public.daily_record_audit (record_id, halaqa_id, record_date, actor_id, action, after)
    VALUES (NEW.id, NEW.halaqa_id, NEW.record_date, (SELECT auth.uid()), 'recomplete',
            jsonb_build_object('completed_at', NEW.completed_at));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_record_audit_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS daily_record_reopen_audit ON public.halaqa_daily_records;
CREATE TRIGGER daily_record_reopen_audit AFTER UPDATE OF status ON public.halaqa_daily_records
  FOR EACH ROW EXECUTE FUNCTION private.daily_record_audit_trg();

-- ─────────── القراءة ───────────

/** يرى الحلقة: مديرها، أو طاقم مركزها (ومنه المشرف). */
CREATE OR REPLACE FUNCTION private.can_read_halaqa_audit(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL AND (
    private.manages_halaqa(_uid, _halaqa)
    OR EXISTS (SELECT 1 FROM public.halaqat h
                WHERE h.id = _halaqa AND h.center_id IS NOT NULL AND private.can_view_center(_uid, h.center_id)));
$$;
REVOKE ALL ON FUNCTION private.can_read_halaqa_audit(uuid, uuid) FROM PUBLIC, anon, authenticated;

/**
 * سجل التعديلات بعد الإغلاق لحلقة (أو لطالب فيها)، الأحدث أولاً. التعديل الذي لم يغيّر شيئاً لا يظهر.
 * _halaqa = NULL مع _student: ما يخص الطالب في كل حلقة يقرؤها المستدعي.
 */
CREATE OR REPLACE FUNCTION public.daily_record_audit_list(_halaqa uuid DEFAULT NULL, _student uuid DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- بلا حلقة: كل ما يخص الطالب في الحلقات التي يقرؤها المستدعي (صفحة الطالب).
  IF _halaqa IS NULL AND _student IS NULL THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  IF _halaqa IS NOT NULL AND NOT private.can_read_halaqa_audit(caller, _halaqa) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', x.id, 'at', x.at, 'halaqa_id', x.halaqa_id, 'record_date', x.record_date, 'action', x.action,
             'student_id', x.student_id, 'student_name', ps.name,
             'actor_id', x.actor_id, 'actor_name', pa.name,
             'before', x.before, 'after', x.after) ORDER BY x.at DESC, x.id DESC)
      FROM (SELECT * FROM public.daily_record_audit a
             WHERE (a.halaqa_id = _halaqa
                    OR (_halaqa IS NULL AND private.can_read_halaqa_audit(caller, a.halaqa_id)))
               AND (_student IS NULL OR a.student_id = _student)
               AND (a.action <> 'edit' OR a.before IS DISTINCT FROM a.after)
             ORDER BY a.at DESC, a.id DESC
             LIMIT greatest(1, least(coalesce(_limit, 50), 200))) x
      LEFT JOIN public.profiles ps ON ps.id = x.student_id
      LEFT JOIN public.profiles pa ON pa.id = x.actor_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.daily_record_audit_list(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_audit_list(uuid, uuid, integer) TO authenticated;

/**
 * أنماط غير معتادة في آخر _days يوماً (7..90) لحلقة. كل بند: code، وstudent_id/student_name إن خصّ طالباً،
 * وdate إن خصّ يوماً، وdetail. الرموز:
 *   pages_spike           حفظ أكثر من 5 صفحات في يوم
 *   perfect_with_mistakes «ممتاز» (الدرجة 5) مع نوع خطأ
 *   perfect_attendance    حاضر في كل أيام السجل (12 يوماً على الأقل)
 *   late_close            إغلاق اليوم بعد منتصف ليله 3 مرات أو أكثر (على الحلقة)
 *   no_recitation         حضر 5 أيام أو أكثر في آخر 21 يوماً ولا حفظ ولا مراجعة فيها
 *   edits_after_close     تعديلات بعد الإغلاق (على الحلقة)
 */
CREATE OR REPLACE FUNCTION public.daily_record_anomalies(_halaqa uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  days integer := greatest(7, least(coalesce(_days, 30), 90));
  today date := public.zen_today();
  since date := public.zen_today() - (greatest(7, least(coalesce(_days, 30), 90)) - 1);
  tz text := coalesce(private.caller_timezone(), 'Asia/Aden');
  items jsonb := '[]'::jsonb;
  n_records integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.can_read_halaqa_audit(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;

  SELECT count(*) INTO n_records FROM public.halaqa_daily_records d
   WHERE d.halaqa_id = _halaqa AND d.record_date BETWEEN since AND today;

  -- أكثر من 5 صفحات حفظ في يوم (الصفحات المختلفة لكل المقاطع).
  items := items || coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', 'pages_spike', 'student_id', x.student_id, 'student_name', p.name,
                                        'date', x.record_date, 'detail', jsonb_build_object('pages', x.pages))
                     ORDER BY x.record_date DESC)
      FROM (SELECT d.record_date, s.student_id,
                   count(DISTINCT pg.page) AS pages
              FROM public.halaqa_daily_records d
              JOIN public.recitation_sessions s ON s.daily_record_id = d.id AND s.kind = 'memorize'
              CROSS JOIN LATERAL generate_series(private.ayah_page(private.surah_no(s.surah_name), s.from_ayah),
                                                 private.ayah_page(private.surah_no(s.surah_name), s.to_ayah)) AS pg(page)
             WHERE d.halaqa_id = _halaqa AND d.record_date BETWEEN since AND today
             GROUP BY d.record_date, s.student_id
            HAVING count(DISTINCT pg.page) > 5) x
      LEFT JOIN public.profiles p ON p.id = x.student_id), '[]'::jsonb);

  -- «ممتاز» مع خطأ مسجَّل.
  items := items || coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', 'perfect_with_mistakes', 'student_id', x.student_id, 'student_name', p.name,
                                        'date', x.record_date, 'detail', jsonb_build_object('kind', x.kind, 'error_type', x.err))
                     ORDER BY x.record_date DESC)
      FROM (SELECT DISTINCT ON (d.record_date, s.student_id, s.kind) d.record_date, s.student_id, s.kind,
                   ra.errors -> 0 ->> 'type' AS err
              FROM public.halaqa_daily_records d
              JOIN public.recitation_sessions s ON s.daily_record_id = d.id
              JOIN public.recitation_assessments ra ON ra.session_id = s.id
             WHERE d.halaqa_id = _halaqa AND d.record_date BETWEEN since AND today
               AND ra.score >= public.grade_to_score(5)
               AND coalesce(ra.errors -> 0 ->> 'type', 'none') <> 'none'
             ORDER BY d.record_date, s.student_id, s.kind) x
      LEFT JOIN public.profiles p ON p.id = x.student_id), '[]'::jsonb);

  -- حضور كامل في كل أيام السجل (12 يوماً على الأقل): للتأكد فقط.
  IF n_records >= 12 THEN
    items := items || coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', 'perfect_attendance', 'student_id', hs.student_id, 'student_name', p.name,
                                          'detail', jsonb_build_object('days', n_records)))
        FROM public.halaqa_students hs
        LEFT JOIN public.profiles p ON p.id = hs.student_id
       WHERE hs.halaqa_id = _halaqa
         AND (SELECT count(*) FROM public.halaqa_daily_records d
                JOIN public.attendance a ON a.halaqa_id = d.halaqa_id AND a.session_date = d.record_date
                                        AND a.student_id = hs.student_id AND a.status = 'present'
               WHERE d.halaqa_id = _halaqa AND d.record_date BETWEEN since AND today) = n_records), '[]'::jsonb);
  END IF;

  -- إغلاق بعد منتصف ليل اليوم، متكرر.
  items := items || coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', 'late_close',
                                        'detail', jsonb_build_object('count', x.n, 'dates', x.dates)))
      FROM (SELECT count(*) AS n, jsonb_agg(d.record_date ORDER BY d.record_date DESC) AS dates
              FROM public.halaqa_daily_records d
             WHERE d.halaqa_id = _halaqa AND d.record_date BETWEEN since AND today
               AND d.first_completed_at IS NOT NULL
               AND (d.first_completed_at AT TIME ZONE tz)::date > d.record_date) x
     WHERE x.n >= 3), '[]'::jsonb);

  -- يحضر بلا تسميع: 5 أيام حضور أو أكثر في آخر 21 يوماً ولا حفظ ولا مراجعة.
  items := items || coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', 'no_recitation', 'student_id', x.student_id, 'student_name', p.name,
                                        'detail', jsonb_build_object('present_days', x.n, 'last', x.last_recitation)))
      FROM (SELECT hs.student_id,
                   (SELECT count(*) FROM public.attendance a
                     WHERE a.halaqa_id = _halaqa AND a.student_id = hs.student_id
                       AND a.status IN ('present', 'late') AND a.session_date BETWEEN today - 20 AND today) AS n,
                   (SELECT max(s.session_date) FROM public.recitation_sessions s
                     WHERE s.student_id = hs.student_id AND s.kind IN ('memorize', 'review')) AS last_recitation
              FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa) x
      LEFT JOIN public.profiles p ON p.id = x.student_id
     WHERE x.n >= 5 AND (x.last_recitation IS NULL OR x.last_recitation < today - 20)), '[]'::jsonb);

  -- تعديلات بعد الإغلاق.
  items := items || coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', 'edits_after_close',
                                        'detail', jsonb_build_object('count', x.n, 'days', x.d)))
      FROM (SELECT count(*) AS n, count(DISTINCT a.record_id) AS d FROM public.daily_record_audit a
             WHERE a.halaqa_id = _halaqa AND a.action = 'edit' AND a.before IS DISTINCT FROM a.after
               AND a.at >= (since::timestamp AT TIME ZONE tz)) x
     WHERE x.n > 0), '[]'::jsonb);

  RETURN jsonb_build_object('halaqa_id', _halaqa, 'days', days, 'from', since, 'to', today,
                            'records', n_records, 'items', items);
END;
$$;
REVOKE ALL ON FUNCTION public.daily_record_anomalies(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_anomalies(uuid, integer) TO authenticated;

/** جودة الإدخال لكل حلقة في المركز (لوحة المركز): الأيام، والتعديلات بعد الإغلاق، والإغلاق المتأخر، والتنبيهات. */
CREATE OR REPLACE FUNCTION public.center_record_quality(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  out jsonb := '[]'::jsonb;
  h record;
  a jsonb;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.can_view_center(caller, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  FOR h IN SELECT hq.id, hq.name, (SELECT p.name FROM public.profiles p WHERE p.id = hq.teacher_id) AS teacher_name
             FROM public.halaqat hq WHERE hq.center_id = _center ORDER BY hq.name LOOP
    a := public.daily_record_anomalies(h.id, _days);
    out := out || jsonb_build_array(jsonb_build_object(
      'halaqa_id', h.id, 'name', h.name, 'teacher_name', h.teacher_name, 'records', a -> 'records',
      'edits_after_close', coalesce((SELECT (i -> 'detail' ->> 'count')::integer FROM jsonb_array_elements(a -> 'items') i
                                      WHERE i ->> 'code' = 'edits_after_close'), 0),
      'late_closes', coalesce((SELECT (i -> 'detail' ->> 'count')::integer FROM jsonb_array_elements(a -> 'items') i
                                WHERE i ->> 'code' = 'late_close'), 0),
      'warnings', (SELECT count(*) FROM jsonb_array_elements(a -> 'items') i
                    WHERE i ->> 'code' NOT IN ('edits_after_close', 'perfect_attendance'))));
  END LOOP;
  RETURN jsonb_build_object('center_id', _center, 'days', greatest(7, least(coalesce(_days, 30), 90)), 'halaqat', out);
END;
$$;
REVOKE ALL ON FUNCTION public.center_record_quality(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_record_quality(uuid, integer) TO authenticated;

-- ─────────── عيّنة التدقيق الأسبوعية ───────────

/**
 * 5 سجلات طلاب من أيام الحلقة المغلقة في الأيام السبعة الماضية، عشوائية وثابتة طوال الأسبوع (الترتيب بـ md5 مع
 * بداية الأسبوع)، مع لقطة كل سجل ومراجعته إن وُجدت. للمشرف وإدارة المركز وحدهما.
 */
CREATE OR REPLACE FUNCTION public.audit_sample(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
  today date := public.zen_today();
  week date := date_trunc('week', public.zen_today())::date;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL OR NOT private.is_center_reviewer(caller, h.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN jsonb_build_object('halaqa_id', _halaqa, 'week', week, 'items', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'record_id', x.record_id, 'date', x.record_date, 'student_id', x.student_id, 'student_name', p.name,
             'entry', private.daily_audit_snapshot(x.record_id, _halaqa, x.record_date, x.student_id),
             'review', (SELECT jsonb_build_object('ok', r.ok, 'note', r.note, 'at', r.at, 'reviewer_name', pr.name)
                          FROM public.daily_record_reviews r LEFT JOIN public.profiles pr ON pr.id = r.reviewer_id
                         WHERE r.record_id = x.record_id AND r.student_id = x.student_id))
             ORDER BY x.record_date DESC, p.name)
      FROM (SELECT d.id AS record_id, d.record_date, a.student_id
              FROM public.halaqa_daily_records d
              JOIN public.attendance a ON a.halaqa_id = d.halaqa_id AND a.session_date = d.record_date
             WHERE d.halaqa_id = _halaqa AND d.status IN ('completed', 'locked')
               AND d.record_date BETWEEN today - 7 AND today - 1
             ORDER BY md5(week::text || d.id::text || a.student_id::text)
             LIMIT 5) x
      LEFT JOIN public.profiles p ON p.id = x.student_id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.audit_sample(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_sample(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_audit_sample(_record uuid, _student uuid, _ok boolean, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  c uuid;
  n text := nullif(trim(_note), '');
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _ok IS NULL THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  IF n IS NOT NULL AND char_length(n) > 500 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE id = _record;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;
  SELECT center_id INTO c FROM public.halaqat WHERE id = rec.halaqa_id;
  IF NOT private.is_center_reviewer(caller, c) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT _ok AND n IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  INSERT INTO public.daily_record_reviews (record_id, student_id, reviewer_id, ok, note)
  VALUES (_record, _student, caller, _ok, n)
  ON CONFLICT (record_id, student_id) DO UPDATE
    SET reviewer_id = EXCLUDED.reviewer_id, ok = EXCLUDED.ok, note = EXCLUDED.note, at = now();
  -- «يحتاج تصحيحاً» يصل إلى معلّم الحلقة.
  IF NOT _ok THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT hq.teacher_id, 'record_review', 'مراجعة سجل', coalesce((SELECT p.name FROM public.profiles p WHERE p.id = _student), '') ||
           ' — ' || to_char(rec.record_date, 'YYYY-MM-DD') || ': ' || n,
           '/teacher/register?halaqa=' || hq.id || '&date=' || to_char(rec.record_date, 'YYYY-MM-DD')
      FROM public.halaqat hq WHERE hq.id = rec.halaqa_id AND hq.teacher_id IS NOT NULL AND hq.teacher_id <> caller;
  END IF;
  RETURN jsonb_build_object('record_id', _record, 'student_id', _student, 'ok', _ok, 'note', n);
END;
$$;
REVOKE ALL ON FUNCTION public.review_audit_sample(uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_audit_sample(uuid, uuid, boolean, text) TO authenticated;
