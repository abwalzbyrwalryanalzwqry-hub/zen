-- ════════════════════════════════════════════════════════════════════════════
-- قسم الحفظ (progress) — سلامة السجل
-- ════════════════════════════════════════════════════════════════════════════
-- كانت سياسة التحديث تسمح للطالب بتعديل تقييم معلّمه لتسجيله (rating/feedback/reviewed_by)، وبإدخال
-- تسجيل «مقيَّم» من عنده؛ وتسمح للمعلّم بتغيير ما سجّله الطالب نفسه.
-- الحارس (BEFORE INSERT/UPDATE) يفصل الدورين:
--   الطالب: يكتب المحتوى (السورة والآيات والنوع والملاحظة) ما لم يُقيَّم، ولا يكتب التقييم أبداً.
--           (الحذف يبقى لصاحبه كما كان، فحذف الحساب يحذف سجله كله.)
--   المعلّم: يكتب التقييم فقط (rating/feedback)، وreviewed_by هو المستدعي دائماً.
-- والمدى صحيح: من 1، والنهاية لا تسبق البداية، ولا تتجاوز عدد آيات السورة إن عُرف اسمها.
-- الخادم (auth.uid() = NULL) خارج الحارس كما كان.
-- التراجع: DROP TRIGGER progress_guard ON public.progress; DROP FUNCTION private.progress_guard();
-- الفحص: supabase/tests/checks.sql (141).

CREATE OR REPLACE FUNCTION private.progress_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  max_ayah integer;
BEGIN
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = caller THEN
      NEW.rating := NULL;
      NEW.feedback := NULL;
      NEW.reviewed_by := NULL;
    END IF;
  ELSIF OLD.user_id = caller THEN
    -- الطالب: التقييم لمعلّمه وحده.
    NEW.rating := OLD.rating;
    NEW.feedback := OLD.feedback;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.user_id := OLD.user_id;
    IF OLD.rating IS NOT NULL AND (
         NEW.surah_name IS DISTINCT FROM OLD.surah_name OR NEW.from_ayah IS DISTINCT FROM OLD.from_ayah
         OR NEW.to_ayah IS DISTINCT FROM OLD.to_ayah
         OR NEW.memorization_type IS DISTINCT FROM OLD.memorization_type
         OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
      RAISE EXCEPTION 'progress_reviewed' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- المعلّم: يقيّم ولا يغيّر ما سجّله الطالب.
    NEW.user_id := OLD.user_id;
    NEW.surah_name := OLD.surah_name;
    NEW.from_ayah := OLD.from_ayah;
    NEW.to_ayah := OLD.to_ayah;
    NEW.memorization_type := OLD.memorization_type;
    NEW.notes := OLD.notes;
    NEW.created_at := OLD.created_at;
    IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
      NEW.reviewed_by := caller;
    ELSE
      NEW.reviewed_by := OLD.reviewed_by;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.surah_name IS DISTINCT FROM OLD.surah_name
     OR NEW.from_ayah IS DISTINCT FROM OLD.from_ayah OR NEW.to_ayah IS DISTINCT FROM OLD.to_ayah THEN
    max_ayah := private.surah_ayahs(NEW.surah_name);
    IF NEW.from_ayah < 1 OR NEW.to_ayah < NEW.from_ayah OR (max_ayah IS NOT NULL AND NEW.to_ayah > max_ayah) THEN
      RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
    END IF;
    IF NEW.notes IS NOT NULL AND char_length(NEW.notes) > 1000 THEN
      RAISE EXCEPTION 'invalid_notes' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.progress_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS progress_guard ON public.progress;
CREATE TRIGGER progress_guard BEFORE INSERT OR UPDATE ON public.progress
  FOR EACH ROW EXECUTE FUNCTION private.progress_guard();
