package app.zen.quran;

/**
 * آلة حالة جلسة القفل في ذاكرة العملية (1.29.0، M8): خالصة بلا Android، فتُختبر على JVM بسيناريوهات
 * مشتركة (src/test/resources/app-lock-scenarios.json) يقرؤها أيضاً المحاكي في الواجهة
 * (src/lib/app-lock-session.ts) فلا تنحرف النسختان. الساعة تُمرَّر دائماً (elapsedRealtime في الإنتاج).
 *
 * ما تحسمه هنا:
 *  - مفتوح/مقفل، ومتى يُعاد القفل: المغادرة والعودة بفترة السماح، والقفل اليدوي، وإطفاء الشاشة، والخمول.
 *  - نافذة «مصادقة جارية» (H3): شاشة رمز الجهاز نشاط مستقل يوقف نشاطنا، فلا يُقفل التطبيق بسببها. لكن
 *    الاستثناء يُمنح فقط إن كانت المصادقة ما تزال جارية عند العودة أو نجحت أثناء الغياب، لا إن أُلغيت؛
 *    والعلَم العالق (رد استدعاء لم يصل) يسقط بعد AUTH_WATCHDOG_MS، ويُصفَّر عند كل نشاط جديد (reset).
 *  - صلاحية التغيير الحساس بعد تحقق (authorize)، وتُمسح بمغادرة التطبيق وهو مقفل (M3).
 *  - إثبات «الوسيلة تعمل» قبل تفعيلها (proof)، لمرة واحدة.
 */
final class LockSession {

    /** أقصى غياب يُعدّ جزءاً من نافذة المصادقة (شاشة رمز الجهاز). */
    static final long AUTH_UI_ALLOWANCE_MS = 60_000L;
    /** مصادقة بلا نتيجة بعد هذه المدة تُعدّ منتهية (رد استدعاء ضاع بإعادة إنشاء النشاط). */
    static final long AUTH_WATCHDOG_MS = 90_000L;

    boolean unlocked = false;
    long backgroundAt = -1L;
    boolean stoppedDuringAuth = false;
    boolean authInProgress = false;
    long authStartedAt = 0L;
    /** وقت آخر نجاح مصادقة (أو -1)، لمعرفة هل نجحت أثناء الغياب. */
    long authSucceededAt = -1L;
    long authorizedUntil = 0L;
    String proofMode = null;
    long proofUntil = 0L;
    long lastInteraction = 0L;

    /** نشاط جديد (load): لا علَم مصادقة يعبر من نشاط سابق. حالة «مفتوح» تبقى ما بقيت العملية. */
    void reset() {
        authInProgress = false;
        stoppedDuringAuth = false;
        backgroundAt = -1L;
    }

    boolean authActive(long now) {
        return authInProgress && now - authStartedAt >= 0 && now - authStartedAt < AUTH_WATCHDOG_MS;
    }

    /** يبدأ مصادقة؛ false إن كانت أخرى جارية فعلاً (لا عالقة). */
    boolean beginAuth(long now) {
        if (authActive(now)) return false;
        authInProgress = true;
        authStartedAt = now;
        return true;
    }

    void endAuth(long now, boolean success) {
        authInProgress = false;
        if (success) authSucceededAt = now;
    }

    void unlock(long now) {
        unlocked = true;
        lastInteraction = now;
    }

    /** يقفل ويُسقط كل صلاحية حساسة. true إن تغيّرت الحالة. */
    boolean relock() {
        boolean changed = unlocked;
        unlocked = false;
        authorizedUntil = 0L;
        proofMode = null;
        proofUntil = 0L;
        return changed;
    }

    /** المغادرة (onStop). true إن أُقفل الآن. */
    boolean onStop(long now, boolean enabled, long grace) {
        if (!enabled) return false;
        backgroundAt = now;
        stoppedDuringAuth = authActive(now);
        if (stoppedDuringAuth) return false;
        if (!unlocked) {
            // مقفل ويغادر: لا تبقى صلاحية استعادة أو تغيير لمن يلتقط الجهاز بعده (M3).
            authorizedUntil = 0L;
            proofMode = null;
            proofUntil = 0L;
            return false;
        }
        return grace == 0L && relock();
    }

    /** العودة (onStart). true إن أُقفل الآن. */
    boolean onStart(long now, boolean enabled, long grace) {
        boolean changed = false;
        if (enabled && backgroundAt >= 0) {
            long away = now - backgroundAt;
            boolean authWindow = stoppedDuringAuth
                && (authActive(now) || authSucceededAt >= backgroundAt)
                && away >= 0
                && away < AUTH_UI_ALLOWANCE_MS;
            if (unlocked && !authWindow && AppLockPolicy.shouldRelock(away, grace)) changed = relock();
        }
        backgroundAt = -1L;
        stoppedDuringAuth = false;
        return changed;
    }

    /** «اقفل الآن» (الزر أو بلاطة الإعدادات السريعة). */
    boolean lockNow(boolean enabled) {
        return enabled && relock();
    }

    /** إطفاء الشاشة: يقفل فوراً بلا فترة سماح إن فُعّل الخيار، إلا أثناء مصادقة جارية. */
    boolean onScreenOff(long now, boolean enabled, boolean lockOnScreenOff) {
        if (!enabled || !lockOnScreenOff || authActive(now)) return false;
        return relock();
    }

    void touch(long now) {
        lastInteraction = now;
    }

    /** الخمول داخل التطبيق والتطبيق في الواجهة. */
    boolean onIdleTick(long now, boolean enabled, long idleMs) {
        if (!enabled || !unlocked || authActive(now)) return false;
        return AppLockPolicy.idleExpired(lastInteraction, now, idleMs) && relock();
    }

    boolean authorized(long now) {
        return now < authorizedUntil;
    }

    /** صلاحية تغيير حساس؛ `requireUnlocked` لتأكيد الهوية (والتطبيق مفتوح)، لا للاستعادة. */
    void authorize(long now, long windowMs, boolean requireUnlocked) {
        if (requireUnlocked && !unlocked) return;
        authorizedUntil = now + windowMs;
    }

    void clearAuthorization() {
        authorizedUntil = 0L;
    }

    void setProof(String mode, long now, long windowMs) {
        proofMode = mode;
        proofUntil = now + windowMs;
    }

    /** يستهلك الإثبات مرة واحدة. */
    boolean consumeProof(String mode, long now) {
        boolean ok = mode.equals(proofMode) && now < proofUntil;
        proofMode = null;
        proofUntil = 0L;
        return ok;
    }
}
