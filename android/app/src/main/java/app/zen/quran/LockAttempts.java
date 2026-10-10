package app.zen.quran;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;

/**
 * عدّاد محاولات خاطئة على القرص مع انتظار تصاعدي (AppLockPolicy). نسختان: رمز PIN (المفاتيح التاريخية
 * fails/lock_*) وكلمة مرور الحساب للاستعادة (rec_*)، فلا يُستهلك أحدهما بالآخر.
 *
 * M4 (1.29.0): المحاولة تُسجَّل قبل التحقق ({@link #begin})، فإنهاء العملية أثناء الاشتقاق لا يمنح محاولة
 * مجانية؛ وتُلغى ({@link #rollback}) إن تعذّر التحقق لسبب لا ذنب للمستخدم فيه (Keystore أو الشبكة).
 */
@SuppressLint("ApplySharedPref")
final class LockAttempts {

    interface Clock {
        long now();

        int boot();
    }

    private final SharedPreferences p;
    private final Clock clock;
    private final String kFails;
    private final String kStart;
    private final String kDur;
    private final String kBoot;

    LockAttempts(SharedPreferences p, Clock clock, String prefix) {
        this.p = p;
        this.clock = clock;
        String pre = prefix == null ? "" : prefix;
        this.kFails = pre + "fails";
        this.kStart = pre + "lock_start";
        this.kDur = pre + "lock_dur";
        this.kBoot = pre + "lock_boot";
    }

    /** لقطة للتراجع. */
    static final class Snapshot {
        final boolean had;
        final int fails;
        final long start;
        final long dur;
        final int boot;

        Snapshot(boolean had, int fails, long start, long dur, int boot) {
            this.had = had;
            this.fails = fails;
            this.start = start;
            this.dur = dur;
            this.boot = boot;
        }
    }

    int fails() {
        return p.getInt(kFails, 0);
    }

    /** المتبقي من الانتظار؛ بعد إعادة تشغيل الجهاز يبدأ الانتظار كاملاً من جديد. */
    long remaining() {
        long dur = p.getLong(kDur, 0L);
        if (dur <= 0) return 0L;
        long now = clock.now();
        int boot = clock.boot();
        long left = AppLockPolicy.remainingLockoutMs(p.getLong(kStart, 0L), dur, p.getInt(kBoot, -2), boot, now);
        if (left == AppLockPolicy.RESTART) {
            p.edit().putLong(kStart, now).putInt(kBoot, boot).commit();
            return dur;
        }
        return left;
    }

    /** يسجّل محاولة قبل التحقق. يعيد لقطة للتراجع، أو null إن فشل الحفظ (فلا يُتحقق). */
    Snapshot begin() {
        Snapshot s = new Snapshot(p.contains(kFails), fails(), p.getLong(kStart, 0L), p.getLong(kDur, 0L), p.getInt(kBoot, -2));
        int f = s.fails + 1;
        boolean ok = p.edit()
            .putInt(kFails, f)
            .putLong(kStart, clock.now())
            .putLong(kDur, AppLockPolicy.lockoutDurationMs(f))
            .putInt(kBoot, clock.boot())
            .commit();
        return ok ? s : null;
    }

    void rollback(Snapshot s) {
        if (s == null) return;
        SharedPreferences.Editor e = p.edit();
        if (!s.had) {
            e.remove(kFails).remove(kStart).remove(kDur).remove(kBoot);
        } else {
            e.putInt(kFails, s.fails).putLong(kStart, s.start).putLong(kDur, s.dur).putInt(kBoot, s.boot);
        }
        e.commit();
    }

    boolean reset() {
        return p.edit().remove(kFails).remove(kStart).remove(kDur).remove(kBoot).commit();
    }
}
