package app.zen.quran;

/**
 * قواعد قفل التطبيق النقية (بلا Android)، فتُختبر على JVM مباشرة (AppLockPolicyTest):
 *  - مدد الانتظار بعد محاولات PIN الخاطئة: تصاعدية، بسقف، ولا قفل نهائي أبداً.
 *  - حساب المتبقي من الانتظار بساعة رتيبة (elapsedRealtime) مع رقم الإقلاع: تغيير وقت الجهاز لا
 *    يقصّره، وإعادة التشغيل تعيد مدة الانتظار كاملة من جديد بدل أن تلغيها.
 *  - فترة السماح المسموحة وقرار إعادة القفل بعد العودة من الخلفية.
 *  - قبول رمز PIN: أرقام فقط، من 4 إلى 6، ولا رموز بديهية (0000، 1234، 654321)، ولا الأنماط المتكررة
 *    (1212، 123123) ولا السنوات (1950–2030) ولا أشهر الرموز المسرَّبة (2580، 1122…) — 1.29.0 (L2).
 *  - فترة الخمول داخل التطبيق قبل القفل (1.29.0): معطّلة افتراضياً، أو 5، أو 10، أو 15 دقيقة.
 *
 * المنطق نفسه في src/lib/app-lock-core.ts (pinProblem) لتوجيه المستخدم قبل الإرسال، والحسم هنا.
 */
public final class AppLockPolicy {

    private AppLockPolicy() {}

    /** محاولات خاطئة متتالية بلا انتظار قبل أول تأخير. */
    public static final int FREE_ATTEMPTS = 5;

    /** المدد بعد المحاولة الخامسة الخاطئة ثم كل محاولة تالية؛ الأخيرة سقف يتكرّر. */
    static final long[] LOCKOUT_STEPS_MS = {
        30_000L, 60_000L, 2 * 60_000L, 5 * 60_000L, 15 * 60_000L, 30 * 60_000L,
    };

    /** فترات السماح المتاحة للمستخدم: فوراً، 30 ثانية، دقيقة، 5 دقائق. */
    public static final long[] GRACE_OPTIONS_MS = { 0L, 30_000L, 60_000L, 5 * 60_000L };

    public static final int PIN_MIN = 4;
    public static final int PIN_MAX = 6;

    /** مدد القفل بعد الخمول داخل التطبيق: 0 = معطّل. */
    public static final long[] IDLE_OPTIONS_MS = { 0L, 5 * 60_000L, 10 * 60_000L, 15 * 60_000L };

    /**
     * أشهر الرموز التي لا تلتقطها القواعد العامة (التكرار، والتسلسل، والنمط الدوري، والسنوات): من دراسات
     * الرموز المسرَّبة، ومنها خطوط لوحة الهاتف (2580، 0852، 147258…). القائمة نفسها في app-lock-core.ts.
     */
    static final String[] COMMON_PINS = {
        "1122", "2580", "0852", "1004", "6969", "5683", "2468", "1357", "7777", "1123", "1987",
        "0007", "1001", "2001", "1110", "0911", "1100", "8520", "1470", "3690", "0123",
        "112233", "111222", "000111", "159753", "147258", "258369", "789456", "456789", "520520",
        "147852", "963852", "753951", "102030", "101010", "112211", "123321", "100200",
    };

    /** مدة الانتظار بعد `failures` محاولة خاطئة متتالية (0 قبل الحد). */
    public static long lockoutDurationMs(int failures) {
        if (failures < FREE_ATTEMPTS) return 0L;
        int tier = failures - FREE_ATTEMPTS;
        return LOCKOUT_STEPS_MS[Math.min(tier, LOCKOUT_STEPS_MS.length - 1)];
    }

    /** المحاولات المتبقية قبل أول انتظار (0 بعده). */
    public static int attemptsBeforeDelay(int failures) {
        return Math.max(0, FREE_ATTEMPTS - failures);
    }

    /**
     * المتبقي من الانتظار. `start` و`now` من elapsedRealtime، و`storedBoot`/`boot` رقم الإقلاع.
     * يعيد {@link #RESTART} إن تغيّر الإقلاع أو رجعت الساعة (أُعيد تشغيل الجهاز): على المستدعي أن يبدأ
     * المدة كاملة من الآن ويحفظ ذلك، فلا تُلغى المدة بإعادة التشغيل.
     */
    public static long remainingLockoutMs(long start, long duration, int storedBoot, int boot, long now) {
        if (duration <= 0) return 0L;
        if (storedBoot != boot || now < start) return RESTART;
        long left = start + duration - now;
        return left > 0 ? left : 0L;
    }

    public static final long RESTART = -1L;

    /**
     * فترة السماح من وسيط الجسر: أي رقم صحيح (Integer أو Long أو Double بلا كسور) من الخيارات المسموحة،
     * وإلا null.
     */
    public static Long graceFromJson(Object v) {
        if (!(v instanceof Number)) return null;
        double d = ((Number) v).doubleValue();
        if (d != Math.rint(d)) return null;
        long g = (long) d;
        return isAllowedGrace(g) ? g : null;
    }

    public static boolean isAllowedGrace(long graceMs) {
        for (long g : GRACE_OPTIONS_MS) if (g == graceMs) return true;
        return false;
    }

    /** مدة الخمول من وسيط الجسر بالقواعد نفسها، وإلا null. */
    public static Long idleFromJson(Object v) {
        if (!(v instanceof Number)) return null;
        double d = ((Number) v).doubleValue();
        if (d != Math.rint(d)) return null;
        long g = (long) d;
        return isAllowedIdle(g) ? g : null;
    }

    public static boolean isAllowedIdle(long idleMs) {
        for (long g : IDLE_OPTIONS_MS) if (g == idleMs) return true;
        return false;
    }

    /** بعد غياب `awayMs` في الخلفية: هل يُطلب القفل؟ فترة 0 تعني القفل فور المغادرة. */
    public static boolean shouldRelock(long awayMs, long graceMs) {
        if (awayMs < 0) return true; // ساعة غير متّسقة: الأسلم القفل
        return awayMs >= graceMs;
    }

    /** null إن كان الرمز مقبولاً، وإلا سبب الرفض: "length" أو "digits" أو "weak". */
    public static String pinProblem(String pin) {
        if (pin == null) return "length";
        int n = pin.length();
        if (n < PIN_MIN || n > PIN_MAX) return "length";
        for (int i = 0; i < n; i++) {
            char c = pin.charAt(i);
            if (c < '0' || c > '9') return "digits";
        }
        boolean same = true;
        boolean up = true;
        boolean down = true;
        for (int i = 1; i < n; i++) {
            int prev = pin.charAt(i - 1) - '0';
            int cur = pin.charAt(i) - '0';
            if (cur != prev) same = false;
            if (cur != (prev + 1) % 10) up = false;
            if (cur != (prev + 9) % 10) down = false;
        }
        if (same || up || down) return "weak";
        if (periodic(pin, 2) || periodic(pin, 3)) return "weak";
        if (n == 4) {
            int year = Integer.parseInt(pin);
            if (year >= 1950 && year <= 2030) return "weak";
        }
        for (String c : COMMON_PINS) if (c.equals(pin)) return "weak";
        return null;
    }

    /** نمط دوري بطول `p` يتكرر مرتين على الأقل ويغطي الرمز كله (1212، 121212، 123123). */
    static boolean periodic(String pin, int p) {
        int n = pin.length();
        if (n % p != 0 || n / p < 2) return false;
        for (int i = p; i < n; i++) if (pin.charAt(i) != pin.charAt(i - p)) return false;
        return true;
    }

    /** بعد غياب المستخدم داخل التطبيق `idleMs`: هل يُقفل؟ 0 = معطّل. */
    public static boolean idleExpired(long lastInteraction, long now, long idleMs) {
        if (idleMs <= 0) return false;
        if (now < lastInteraction) return true; // ساعة غير متّسقة: الأسلم القفل
        return now - lastInteraction >= idleMs;
    }
}
