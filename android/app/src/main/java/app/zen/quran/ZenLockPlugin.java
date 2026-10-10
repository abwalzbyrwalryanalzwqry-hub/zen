package app.zen.quran;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Mac;

/**
 * قفل التطبيق (src/lib/app-lock.ts). هذه الطبقة هي نقطة التحكّم، لا الواجهة:
 *
 *  - حالة القفل في ذاكرة العملية (LockSession) ولا تُفتح إلا بنجاح فعلي: رمز PIN صحيح يُتحقق منه هنا،
 *    أو توقيع مفتاح البصمة داخل BiometricPrompt (BioKey)، أو نجاح مصادقة الجهاز. الإلغاء لا يفتح.
 *  - موت العملية أو إعادة تشغيل التطبيق = مقفل دائماً.
 *  - فترة السماح بساعة رتيبة (elapsedRealtime)، والقفل أيضاً بإطفاء الشاشة، وبالخمول، وبـ«اقفل الآن»
 *    (زر في الواجهة وبلاطة الإعدادات السريعة ZenLockTileService) — 1.29.0.
 *  - غطاء أصلي فوق WebView من لحظة القفل حتى ترسم الواجهة شاشة القفل، ويُخفي محتوى WebView عن قارئ الشاشة
 *    ما دام ظاهراً (M5)، وتُخفى نوافذ التطبيقات العائمة فوق شاشة القفل في Android 12+.
 *  - رمز PIN لا يُخزَّن (PinVault). المحاولات الخاطئة تُسجَّل قبل التحقق (LockAttempts) مع انتظار تصاعدي.
 *  - الاستعادة بالحساب: كلمة المرور يتحقق منها Java لدى Supabase ويُقارن المعرّف بمالك القفل (AccountVerifier).
 *  - الاستعادة بقفل الجهاز خيار (deviceRecovery): مغلق افتراضياً لمن ربط حساباً.
 *  - لا شيء من الرمز أو كلمة المرور في السجلات أو رسائل الخطأ. ملف zen_lock خارج النسخ الاحتياطي.
 *
 * لا يلمس هذا الملف بيانات المستخدم أبداً: الإيقاف وإعادة الضبط والاستعادة تمسح مواد القفل وحدها.
 */
@CapacitorPlugin(name = "ZenLock")
// commit() مقصود: عدّاد المحاولات وحالة القفل تُكتب على القرص قبل الرد، فلا يتجاوزها إنهاء العملية فوراً.
@SuppressLint("ApplySharedPref")
public class ZenLockPlugin extends Plugin {

    static final String PREFS = "zen_lock";
    static final String K_ENABLED = "enabled";
    private static final String K_METHOD = "method";
    private static final String K_GRACE = "grace_ms";
    private static final String K_BIO = "bio_with_pin";
    private static final String K_HIDE = "hide_recents";
    private static final String K_OWNER_ID = "owner_id";
    private static final String K_OWNER_EMAIL = "owner_email";
    private static final String K_DEVICE_RECOVERY = "device_recovery";
    private static final String K_IDLE = "idle_ms";
    private static final String K_SCREEN_OFF = "lock_screen_off";
    static final String K_PRIVATE_NOTIF = "private_notifications";
    private static final String K_QURAN_OPEN = "quran_while_locked";
    private static final String K_LOG_COUNT = "fails_since_unlock";
    private static final String K_LOG_LAST = "last_fail_at";

    static final String METHOD_PIN = "pin";
    static final String METHOD_DEVICE = "device";

    /** نافذة التحقق قبل تغيير حساس (إيقاف، تغيير الوسيلة أو الرمز). */
    private static final long CONFIRM_WINDOW_MS = 2 * 60_000L;
    /** نافذة إعداد وسيلة جديدة بعد الاستعادة. */
    private static final long RECOVERY_WINDOW_MS = 5 * 60_000L;
    /** صلاحية إثبات أن وسيلة النظام تعمل (قبل تفعيلها). */
    private static final long ENROLL_PROOF_MS = 60_000L;
    private static final long IDLE_TICK_MS = 15_000L;

    // حالة الجلسة في العملية: تبقى عبر إعادة إنشاء النشاط، وتضيع (= مقفل) بموت العملية.
    private static final Object LOCK = new Object();
    private static final LockSession SESSION = new LockSession();
    /** عمليات PIN والشبكة خارج خيط الجسر (M7). خيط واحد: لا تحققان متزامنان من الرمز. */
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static volatile ZenLockPlugin sActive;
    private static boolean sScreenReceiver = false;

    private View cover;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable idleTick = this::idleTick;

    // ───────────── دورة الحياة ─────────────

    @Override
    public void load() {
        synchronized (LOCK) {
            SESSION.reset();
        }
        sActive = this;
        registerScreenOff(getContext());
        applyPrivacy();
        if (isLocked()) showCover();
        WORK.execute(() -> vault().cleanupOrphans());
    }

    @Override
    protected void handleOnDestroy() {
        if (sActive == this) sActive = null;
        main.removeCallbacks(idleTick);
    }

    @Override
    protected void handleOnStop() {
        main.removeCallbacks(idleTick);
        boolean changed;
        synchronized (LOCK) {
            changed = SESSION.onStop(now(), enabled(), grace());
        }
        if (changed) onRelocked();
    }

    @Override
    protected void handleOnStart() {
        boolean changed;
        synchronized (LOCK) {
            changed = SESSION.onStart(now(), enabled(), grace());
        }
        // الغطاء عند قفل جديد فقط: إن كانت شاشة القفل مرسومة أصلاً فهي الظاهرة، ولا شيء في الواجهة يزيل غطاءً
        // يُضاف فوقها عند كل عودة (عطل في 1.28.0: شاشة البداية تبقى فوق شاشة القفل بعد العودة من الخلفية).
        if (changed) onRelocked();
        scheduleIdle();
    }

    /** من MainActivity.onUserInteraction: كل لمسة تؤجّل قفل الخمول. */
    static void userInteraction() {
        synchronized (LOCK) {
            SESSION.touch(SystemClock.elapsedRealtime());
        }
    }

    /** «اقفل الآن» من خارج الواجهة (بلاطة الإعدادات السريعة). true إن أُقفل. */
    static boolean lockFromOutside(Context ctx) {
        boolean on = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(K_ENABLED, false);
        boolean changed;
        synchronized (LOCK) {
            changed = SESSION.lockNow(on);
        }
        ZenLockPlugin p = sActive;
        if (changed && p != null) p.onRelocked();
        return changed;
    }

    static boolean lockedNow(Context ctx) {
        boolean on = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(K_ENABLED, false);
        synchronized (LOCK) {
            return on && !SESSION.unlocked;
        }
    }

    /** إشعارات خاصة (نص مخفي على شاشة القفل): القفل مفعّل والخيار غير مُطفأ. */
    static boolean privateNotifications(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.getBoolean(K_ENABLED, false) && p.getBoolean(K_PRIVATE_NOTIF, true);
    }

    private static void registerScreenOff(Context ctx) {
        synchronized (LOCK) {
            if (sScreenReceiver) return;
            sScreenReceiver = true;
        }
        final Context app = ctx.getApplicationContext();
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) return;
                SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                boolean changed;
                synchronized (LOCK) {
                    changed = SESSION.onScreenOff(SystemClock.elapsedRealtime(), p.getBoolean(K_ENABLED, false), p.getBoolean(K_SCREEN_OFF, true));
                }
                ZenLockPlugin pl = sActive;
                if (changed && pl != null) pl.onRelocked();
            }
        };
        ContextCompat.registerReceiver(app, r, new IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void scheduleIdle() {
        main.removeCallbacks(idleTick);
        if (enabled() && idleMs() > 0) main.postDelayed(idleTick, IDLE_TICK_MS);
    }

    private void idleTick() {
        boolean changed;
        synchronized (LOCK) {
            changed = SESSION.onIdleTick(now(), enabled(), idleMs());
        }
        if (changed) onRelocked();
        scheduleIdle();
    }

    private void onRelocked() {
        showCover();
        emit(true);
        ZenLockTileService.refresh(getContext());
    }

    // ───────────── الحالة والإمكانات ─────────────

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        final Context ctx = getContext();
        WORK.execute(() -> {
            JSObject r = new JSObject();
            r.put("biometric", biometricStatus(ctx));
            r.put("deviceSecure", deviceSecure(ctx));
            r.put("pinSupported", vault().usable());
            r.put("sdk", Build.VERSION.SDK_INT);
            // Android 13+ يخفي المعاينة وحدها؛ قبله FLAG_SECURE يمنع لقطات الشاشة أيضاً.
            r.put("recentsMode", Build.VERSION.SDK_INT >= 33 ? "preview" : "secure");
            r.put("quickTile", true);
            call.resolve(r);
        });
    }

    /** الواجهة رسمت شاشة القفل: يُزال الغطاء الأصلي. والتطبيق مفتوح لا غطاء أصلاً (L6). */
    @PluginMethod
    public void hideCover(PluginCall call) {
        if (isLocked()) removeCover();
        call.resolve();
    }

    // ───────────── رمز PIN ─────────────

    /**
     * تحقّق من الرمز. `purpose`: "unlock" (يفتح التطبيق) أو "confirm" (قبل تغيير حساس في الإعدادات).
     * يعيد {ok} أو {ok:false, failures, lockoutMs, attemptsLeft} — لا يكشف شيئاً عن الرمز نفسه.
     */
    @PluginMethod
    public void verifyPin(PluginCall call) {
        final String pin = call.getString("pin", "");
        final String purpose = call.getString("purpose", "unlock");
        WORK.execute(() -> {
            SharedPreferences p = prefs();
            if (!enabled() || !METHOD_PIN.equals(p.getString(K_METHOD, null))) {
                call.reject("lock not enabled", "NOT_ENABLED");
                return;
            }
            LockAttempts attempts = pinAttempts();
            long waitMs = attempts.remaining();
            if (waitMs > 0) {
                call.resolve(failure(attempts.fails(), waitMs));
                return;
            }
            LockAttempts.Snapshot snap = attempts.begin();
            if (snap == null) {
                call.reject("storage failed", "STORAGE");
                return;
            }
            Boolean ok = vault().check(pin);
            if (ok == null) {
                attempts.rollback(snap);
                call.reject("pin unavailable", "PIN_UNAVAILABLE");
                return;
            }
            if (!ok) {
                logFailure();
                int fails = attempts.fails();
                call.resolve(failure(fails, AppLockPolicy.lockoutDurationMs(fails)));
                return;
            }
            attempts.reset();
            if ("confirm".equals(purpose)) {
                synchronized (LOCK) {
                    SESSION.authorize(now(), CONFIRM_WINDOW_MS, true);
                }
            } else {
                unlock();
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        });
    }

    /**
     * ينشئ رمزاً جديداً ويفعّل القفل به. أول تفعيل لا يحتاج تحققاً؛ أما والقفل مفعّل (تغيير الرمز أو
     * الوسيلة، أو بعد الاستعادة) فيلزم تحقق حديث. `biometric` يفعّل الفتح بالبصمة إن ثبت أنها تعمل.
     * `account` {userId, email}: يربط القفل بالحساب الحالي للاستعادة بكلمة المرور.
     */
    @PluginMethod
    public void setupPin(PluginCall call) {
        final String pin = call.getString("pin", "");
        final boolean wantBioArg = Boolean.TRUE.equals(call.getBoolean("biometric", false));
        final JSObject account = call.getObject("account", null);
        String problem = AppLockPolicy.pinProblem(pin);
        if (problem != null) {
            call.reject("invalid pin", "PIN_" + problem.toUpperCase(Locale.ROOT));
            return;
        }
        if (enabled() && !authorized()) {
            call.reject("confirmation required", "AUTH_REQUIRED");
            return;
        }
        final boolean wantBio;
        synchronized (LOCK) {
            wantBio = wantBioArg && SESSION.consumeProof("biometric", now());
        }
        WORK.execute(() -> {
            PinVault v = vault();
            PinVault.Material m;
            try {
                m = v.prepare(pin);
            } catch (Exception ex) {
                call.reject("pin setup failed", "PIN_UNAVAILABLE");
                return;
            }
            boolean first = !enabled();
            SharedPreferences.Editor e = prefs().edit().putBoolean(K_ENABLED, true).putString(K_METHOD, METHOD_PIN).putBoolean(K_BIO, wantBio);
            PinVault.write(e, m);
            if (first) firstDefaults(e);
            putAccount(e, account);
            if (!e.commit()) {
                PinVault.deleteAlias(m.alias);
                call.reject("storage failed", "STORAGE");
                return;
            }
            v.retainOnly(m.alias);
            if (!wantBio) BioKey.delete();
            pinAttempts().reset();
            finishSetup();
            call.resolve(state());
        });
    }

    // ───────────── مصادقة النظام (BiometricPrompt) ─────────────

    /**
     * يعرض نافذة المصادقة الرسمية. `mode`: "biometric" (بصمة/وجه قوية فقط مع مفتاح موقِّع، وزر «استخدام
     * الرمز») أو "device" (بصمة/وجه أو رمز قفل الجهاز). `purpose`:
     *   unlock  — فتح التطبيق المقفل بالوسيلة المعتمدة.
     *   confirm — تحقق قبل تغيير حساس والتطبيق مفتوح.
     *   recover — نسيان PIN بقفل الجهاز، إن سمح به الخيار deviceRecovery.
     *   enroll  — إثبات أن الوسيلة تعمل قبل تفعيلها (ولـ biometric: إنشاء مفتاح البصمة).
     * النتيجة {ok:true} فقط عند النجاح، وإلا {ok:false, code}.
     */
    @PluginMethod
    public void authenticate(PluginCall call) {
        final String mode = call.getString("mode", METHOD_DEVICE);
        final String purpose = call.getString("purpose", "unlock");
        final String title = clip(call.getString("title", ""), 80);
        final String subtitle = clip(call.getString("subtitle", ""), 120);
        final String negative = clip(call.getString("negative", ""), 40);
        final String reason = purposeError(mode, purpose);
        if (reason != null) {
            call.reject("not allowed", reason);
            return;
        }
        final Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            call.resolve(authFail("unavailable"));
            return;
        }
        final boolean bio = "biometric".equals(mode);
        final int authenticators = bio
            ? BiometricManager.Authenticators.BIOMETRIC_STRONG
            : BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        int can = BiometricManager.from(getContext()).canAuthenticate(authenticators);
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            call.resolve(authFail(canAuthCode(can, mode)));
            return;
        }
        Mac mac = null;
        if (bio) {
            try {
                if ("enroll".equals(purpose)) BioKey.create();
                mac = BioKey.mac();
            } catch (BioKey.Invalidated e) {
                // أُضيفت بصمة جديدة منذ التفعيل: البصمة تُطفأ، والرمز يفتح، ثم يُعاد تفعيلها.
                prefs().edit().putBoolean(K_BIO, false).commit();
                call.resolve(authFail("bio_changed"));
                return;
            } catch (Exception e) {
                call.resolve(authFail("unavailable"));
                return;
            }
        }
        synchronized (LOCK) {
            if (!SESSION.beginAuth(now())) {
                call.resolve(authFail("busy"));
                return;
            }
        }
        final Mac signer = mac;
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title.isEmpty() ? activity.getString(R.string.app_name) : title)
                    .setConfirmationRequired(false)
                    .setAllowedAuthenticators(authenticators);
                if (!subtitle.isEmpty()) b.setSubtitle(subtitle);
                if (bio) {
                    b.setNegativeButtonText(negative.isEmpty() ? activity.getString(android.R.string.cancel) : negative);
                }
                BiometricPrompt prompt = new BiometricPrompt(
                    (FragmentActivity) activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            boolean ok = true;
                            if (bio) {
                                BiometricPrompt.CryptoObject co = result.getCryptoObject();
                                ok = co != null && BioKey.sign(co.getMac());
                            }
                            endAuth(ok);
                            if (!ok) {
                                call.resolve(authFail("unavailable"));
                                return;
                            }
                            onAuthSuccess(mode, purpose);
                            JSObject r = new JSObject();
                            r.put("ok", true);
                            call.resolve(r);
                        }

                        @Override
                        public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                            endAuth(false);
                            if (bio && "enroll".equals(purpose) && !prefs().getBoolean(K_BIO, false)) BioKey.delete();
                            call.resolve(authFail(errorCode(code)));
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // بصمة/وجه غير مطابق: النافذة تبقى وتعرض رسالتها، وتُكمل المحاولة. لا نتيجة بعد.
                        }
                    }
                );
                if (bio) prompt.authenticate(b.build(), new BiometricPrompt.CryptoObject(signer));
                else prompt.authenticate(b.build());
            } catch (Exception e) {
                endAuth(false);
                call.resolve(authFail("unavailable"));
            }
        });
    }

    /** يحدد هل الغرض مسموح الآن (يُفحص هنا لا في الواجهة). */
    private String purposeError(String mode, String purpose) {
        if (!"biometric".equals(mode) && !METHOD_DEVICE.equals(mode)) return "BAD_MODE";
        boolean on = enabled();
        String method = prefs().getString(K_METHOD, null);
        boolean locked = isLocked();
        switch (purpose) {
            case "unlock":
                if (!on || !locked) return "NOT_LOCKED";
                if (METHOD_DEVICE.equals(method)) return METHOD_DEVICE.equals(mode) ? null : "BAD_MODE";
                if ("biometric".equals(mode) && prefs().getBoolean(K_BIO, false)) return null;
                return "BAD_MODE";
            case "confirm":
                if (!on || locked) return "NOT_ALLOWED";
                if (METHOD_DEVICE.equals(method)) return METHOD_DEVICE.equals(mode) ? null : "BAD_MODE";
                return "biometric".equals(mode) && prefs().getBoolean(K_BIO, false) ? null : "BAD_MODE";
            case "recover":
                return on && locked && METHOD_DEVICE.equals(mode) && deviceRecovery() ? null : "NOT_ALLOWED";
            case "enroll":
                // والتطبيق مقفل: فقط بعد استعادة ناجحة (إعداد وسيلة جديدة).
                if (on && locked && !authorized()) return "NOT_ALLOWED";
                return null;
            default:
                return "BAD_PURPOSE";
        }
    }

    private void onAuthSuccess(String mode, String purpose) {
        long now = now();
        switch (purpose) {
            case "unlock":
                pinAttempts().reset();
                unlock();
                break;
            case "confirm":
                synchronized (LOCK) {
                    SESSION.authorize(now, CONFIRM_WINDOW_MS, true);
                }
                break;
            case "recover":
                pinAttempts().reset();
                synchronized (LOCK) {
                    SESSION.authorize(now, RECOVERY_WINDOW_MS, false);
                }
                break;
            case "enroll":
                synchronized (LOCK) {
                    // لا يمنح صلاحية تغيير: من يعرف رمز الجهاز لا يحق له تجاوز PIN التطبيق بهذا المسار.
                    SESSION.setProof(mode, now, ENROLL_PROOF_MS);
                }
                break;
            default:
                break;
        }
    }

    /** تفعيل القفل بمصادقة الجهاز (بعد مصادقة enroll ناجحة). لا رمز PIN يُخزَّن. */
    @PluginMethod
    public void enableDevice(PluginCall call) {
        if (enabled() && !authorized()) {
            call.reject("confirmation required", "AUTH_REQUIRED");
            return;
        }
        boolean proof;
        synchronized (LOCK) {
            proof = SESSION.consumeProof(METHOD_DEVICE, now());
        }
        if (!proof) {
            call.reject("device auth not verified", "PROOF_REQUIRED");
            return;
        }
        boolean first = !enabled();
        SharedPreferences.Editor e = prefs().edit().putBoolean(K_ENABLED, true).putString(K_METHOD, METHOD_DEVICE).putBoolean(K_BIO, false);
        PinVault.clear(e);
        if (first) firstDefaults(e);
        putAccount(e, call.getObject("account", null));
        if (!e.commit()) {
            call.reject("storage failed", "STORAGE");
            return;
        }
        vault().retainOnly("");
        BioKey.delete();
        pinAttempts().reset();
        finishSetup();
        call.resolve(state());
    }

    /** الفتح بالبصمة مع PIN: التفعيل يحتاج مصادقة بصمة ناجحة حديثة (أنشأت المفتاح)؛ الإيقاف لا. */
    @PluginMethod
    public void setBiometric(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (!enabled() || isLocked() || !METHOD_PIN.equals(prefs().getString(K_METHOD, null))) {
            call.reject("not allowed", "NOT_ALLOWED");
            return;
        }
        boolean proof;
        synchronized (LOCK) {
            proof = !on || SESSION.consumeProof("biometric", now());
        }
        if (!proof || (on && !BioKey.exists())) {
            call.reject("biometric not verified", "PROOF_REQUIRED");
            return;
        }
        if (!prefs().edit().putBoolean(K_BIO, on).commit()) {
            call.reject("storage failed", "STORAGE");
            return;
        }
        if (!on) BioKey.delete();
        call.resolve(state());
    }

    /**
     * الخيارات، والتطبيق مفتوح فقط: graceMs، hideInRecents، idleMs، lockOnScreenOff، privateNotifications،
     * quranWhileLocked، deviceRecovery. تفعيل الاستعادة بقفل الجهاز يُضعف الحماية فيلزمه تحقق حديث.
     */
    @PluginMethod
    public void setOptions(PluginCall call) {
        if (!enabled() || isLocked()) {
            call.reject("not allowed", "NOT_ALLOWED");
            return;
        }
        JSObject d = call.getData();
        SharedPreferences.Editor e = prefs().edit();
        if (d.has("graceMs")) {
            // رقم JSON الصغير يصل Integer لا Long (PluginCall.getLong يعيد null حينها).
            Long g = AppLockPolicy.graceFromJson(d.opt("graceMs"));
            if (g == null) {
                call.reject("bad grace", "BAD_GRACE");
                return;
            }
            e.putLong(K_GRACE, g);
        }
        if (d.has("idleMs")) {
            Long g = AppLockPolicy.idleFromJson(d.opt("idleMs"));
            if (g == null) {
                call.reject("bad idle", "BAD_IDLE");
                return;
            }
            e.putLong(K_IDLE, g);
        }
        if (d.has("deviceRecovery")) {
            boolean on = Boolean.TRUE.equals(call.getBoolean("deviceRecovery", false));
            if (on && !deviceRecovery() && !authorized()) {
                call.reject("confirmation required", "AUTH_REQUIRED");
                return;
            }
            e.putBoolean(K_DEVICE_RECOVERY, on);
        }
        putBool(e, call, "hideInRecents", K_HIDE);
        putBool(e, call, "lockOnScreenOff", K_SCREEN_OFF);
        putBool(e, call, "privateNotifications", K_PRIVATE_NOTIF);
        putBool(e, call, "quranWhileLocked", K_QURAN_OPEN);
        if (!e.commit()) {
            call.reject("storage failed", "STORAGE");
            return;
        }
        synchronized (LOCK) {
            SESSION.touch(now());
        }
        applyPrivacy();
        scheduleIdle();
        call.resolve(state());
    }

    /** إيقاف القفل بعد تحقق حديث (أو بعد الاستعادة). يمسح مواد القفل وحدها، ولا يلمس بيانات التطبيق. */
    @PluginMethod
    public void disable(PluginCall call) {
        if (!enabled()) {
            call.resolve(state());
            return;
        }
        if (!authorized()) {
            call.reject("confirmation required", "AUTH_REQUIRED");
            return;
        }
        SharedPreferences.Editor e = prefs().edit().putBoolean(K_ENABLED, false).remove(K_METHOD).remove(K_BIO)
            .remove(K_OWNER_ID).remove(K_OWNER_EMAIL).remove(K_DEVICE_RECOVERY).remove(K_LOG_COUNT).remove(K_LOG_LAST);
        PinVault.clear(e);
        if (!e.commit()) {
            call.reject("storage failed", "STORAGE");
            return;
        }
        vault().retainOnly("");
        BioKey.delete();
        pinAttempts().reset();
        recoveryAttempts().reset();
        finishSetup();
        call.resolve(state());
    }

    /**
     * نسيان PIN مع حساب (H1): كلمة المرور تصل هنا، ويتحقق منها Java لدى Supabase Auth ويقارن المعرّف بمالك
     * القفل المحفوظ. عند النجاح يُسمح بإعداد وسيلة جديدة خلال نافذة قصيرة، والتطبيق يبقى مقفلاً حتى تُعدّ.
     * الأخطاء: NOT_ALLOWED، NO_ACCOUNT، LOCKED_OUT (مع lockoutMs)، BAD_CREDENTIALS، MISMATCH، NETWORK،
     * RATE_LIMITED، SERVER.
     */
    @PluginMethod
    public void grantAccountRecovery(PluginCall call) {
        final String password = call.getString("password", "");
        if (!enabled() || !isLocked()) {
            call.reject("not allowed", "NOT_ALLOWED");
            return;
        }
        final String owner = prefs().getString(K_OWNER_ID, null);
        final String email = prefs().getString(K_OWNER_EMAIL, null);
        if (owner == null || email == null) {
            call.reject("no account bound", "NO_ACCOUNT");
            return;
        }
        WORK.execute(() -> {
            LockAttempts attempts = recoveryAttempts();
            long wait = attempts.remaining();
            if (wait > 0) {
                call.reject("locked out", "LOCKED_OUT", lockoutData(wait));
                return;
            }
            LockAttempts.Snapshot snap = attempts.begin();
            if (snap == null) {
                call.reject("storage failed", "STORAGE");
                return;
            }
            AccountVerifier.Result r = AccountVerifier.verify(BuildConfig.LOCK_SUPABASE_URL, BuildConfig.LOCK_SUPABASE_KEY, email, password);
            if (AccountVerifier.OK.equals(r.code) && owner.equals(r.userId)) {
                attempts.reset();
                pinAttempts().reset();
                synchronized (LOCK) {
                    SESSION.authorize(now(), RECOVERY_WINDOW_MS, false);
                }
                call.resolve(state());
                return;
            }
            String code = AccountVerifier.OK.equals(r.code) ? "MISMATCH" : r.code;
            if ("BAD_CREDENTIALS".equals(code) || "MISMATCH".equals(code)) {
                logFailure();
                call.reject("recovery failed", code, lockoutData(AppLockPolicy.lockoutDurationMs(attempts.fails())));
            } else {
                // الشبكة أو الخادم: ليست محاولة من المستخدم.
                attempts.rollback(snap);
                call.reject("recovery failed", code);
            }
        });
    }

    /**
     * ربط القفل بالحساب الحالي (ترقية من 1.28.0، أو بعد تبديل الحساب). أول ربط يكفيه تطبيق مفتوح (المالك
     * أمام الشاشة)؛ تغيير حساب مربوط يلزمه تحقق حديث، فلا تنقل شيفرة الواجهة الاستعادة إلى حساب آخر.
     */
    @PluginMethod
    public void bindAccount(PluginCall call) {
        String id = call.getString("userId", null);
        String email = call.getString("email", null);
        if (!AccountVerifier.validUserId(id) || !AccountVerifier.validEmail(email)) {
            call.reject("bad account", "BAD_ACCOUNT");
            return;
        }
        if (!enabled() || isLocked()) {
            call.reject("not allowed", "NOT_ALLOWED");
            return;
        }
        String owner = prefs().getString(K_OWNER_ID, null);
        if (owner != null && !owner.equals(id) && !authorized()) {
            call.reject("confirmation required", "AUTH_REQUIRED");
            return;
        }
        SharedPreferences.Editor e = prefs().edit().putString(K_OWNER_ID, id).putString(K_OWNER_EMAIL, email);
        if (owner == null && !prefs().contains(K_DEVICE_RECOVERY)) e.putBoolean(K_DEVICE_RECOVERY, false);
        if (!e.commit()) {
            call.reject("storage failed", "STORAGE");
            return;
        }
        call.resolve(state());
    }

    /** «اقفل الآن». */
    @PluginMethod
    public void lockNow(PluginCall call) {
        boolean changed;
        synchronized (LOCK) {
            changed = SESSION.lockNow(enabled());
        }
        if (changed) onRelocked();
        call.resolve(state());
    }

    /** المستخدم رأى سجل المحاولات الخاطئة: يُمسح (والتطبيق مفتوح فقط). */
    @PluginMethod
    public void ackFailures(PluginCall call) {
        if (isLocked()) {
            call.reject("not allowed", "NOT_ALLOWED");
            return;
        }
        prefs().edit().remove(K_LOG_COUNT).remove(K_LOG_LAST).commit();
        call.resolve(state());
    }

    /** إعدادات الأمان في النظام (إضافة بصمة أو قفل شاشة). */
    @PluginMethod
    public void openSecuritySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no settings", "NO_SETTINGS");
        }
    }

    // ───────────── داخلي ─────────────

    private JSObject state() {
        SharedPreferences p = prefs();
        boolean on = p.getBoolean(K_ENABLED, false);
        JSObject r = new JSObject();
        r.put("enabled", on);
        r.put("method", on ? p.getString(K_METHOD, null) : null);
        r.put("locked", isLocked());
        r.put("graceMs", grace());
        r.put("biometricWithPin", on && p.getBoolean(K_BIO, false));
        r.put("hideInRecents", p.getBoolean(K_HIDE, true));
        r.put("pinLength", on && METHOD_PIN.equals(p.getString(K_METHOD, null)) ? p.getInt(PinVault.K_LEN, 0) : 0);
        r.put("failures", p.getInt("fails", 0));
        r.put("lockoutMs", pinAttempts().remaining());
        r.put("authorized", authorized());
        r.put("idleMs", idleMs());
        r.put("lockOnScreenOff", p.getBoolean(K_SCREEN_OFF, true));
        r.put("privateNotifications", p.getBoolean(K_PRIVATE_NOTIF, true));
        r.put("quranWhileLocked", on && p.getBoolean(K_QURAN_OPEN, false));
        r.put("deviceRecovery", on && deviceRecovery());
        r.put("recoveryAccount", on && p.getString(K_OWNER_ID, null) != null);
        r.put("accountEmail", on ? p.getString(K_OWNER_EMAIL, null) : null);
        r.put("ownerId", on ? p.getString(K_OWNER_ID, null) : null);
        r.put("failedSinceUnlock", on ? p.getInt(K_LOG_COUNT, 0) : 0);
        r.put("lastFailedAt", on ? p.getLong(K_LOG_LAST, 0L) : 0L);
        r.put("recoveryLockoutMs", recoveryAttempts().remaining());
        return r;
    }

    private void firstDefaults(SharedPreferences.Editor e) {
        e.putLong(K_GRACE, 0L).putBoolean(K_HIDE, true).putBoolean(K_SCREEN_OFF, true).putBoolean(K_PRIVATE_NOTIF, true)
            .putLong(K_IDLE, 0L).putBoolean(K_QURAN_OPEN, false).remove(K_OWNER_ID).remove(K_OWNER_EMAIL)
            .remove(K_DEVICE_RECOVERY).remove(K_LOG_COUNT).remove(K_LOG_LAST);
    }

    /** يربط الحساب في commit الإعداد نفسه (المستدعي تحقق من الصلاحية). */
    private void putAccount(SharedPreferences.Editor e, JSObject account) {
        if (account == null) return;
        String id = account.getString("userId");
        String email = account.getString("email");
        if (!AccountVerifier.validUserId(id) || !AccountVerifier.validEmail(email)) return;
        e.putString(K_OWNER_ID, id).putString(K_OWNER_EMAIL, email);
        if (!prefs().contains(K_DEVICE_RECOVERY)) e.putBoolean(K_DEVICE_RECOVERY, false);
    }

    private void finishSetup() {
        synchronized (LOCK) {
            SESSION.clearAuthorization();
        }
        recoveryAttempts().reset();
        unlock();
        applyPrivacy();
        scheduleIdle();
        ZenLockTileService.refresh(getContext());
    }

    private static void putBool(SharedPreferences.Editor e, PluginCall call, String arg, String key) {
        if (call.getData().has(arg)) e.putBoolean(key, Boolean.TRUE.equals(call.getBoolean(arg, false)));
    }

    private void logFailure() {
        SharedPreferences p = prefs();
        p.edit().putInt(K_LOG_COUNT, p.getInt(K_LOG_COUNT, 0) + 1).putLong(K_LOG_LAST, System.currentTimeMillis()).commit();
    }

    private JSObject failure(int fails, long waitMs) {
        JSObject r = new JSObject();
        r.put("ok", false);
        r.put("failures", fails);
        r.put("lockoutMs", waitMs);
        r.put("attemptsLeft", AppLockPolicy.attemptsBeforeDelay(fails));
        return r;
    }

    private JSObject lockoutData(long waitMs) {
        JSObject r = new JSObject();
        r.put("lockoutMs", waitMs);
        r.put("attemptsLeft", AppLockPolicy.attemptsBeforeDelay(recoveryAttempts().fails()));
        return r;
    }

    private static JSObject authFail(String code) {
        JSObject r = new JSObject();
        r.put("ok", false);
        r.put("code", code);
        return r;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private PinVault vault() {
        return new PinVault(getContext(), prefs());
    }

    private final LockAttempts.Clock clock = new LockAttempts.Clock() {
        @Override
        public long now() {
            return SystemClock.elapsedRealtime();
        }

        @Override
        public int boot() {
            return bootCount();
        }
    };

    private LockAttempts pinAttempts() {
        return new LockAttempts(prefs(), clock, "");
    }

    private LockAttempts recoveryAttempts() {
        return new LockAttempts(prefs(), clock, "rec_");
    }

    private static long now() {
        return SystemClock.elapsedRealtime();
    }

    private boolean enabled() {
        return prefs().getBoolean(K_ENABLED, false);
    }

    private long grace() {
        long g = prefs().getLong(K_GRACE, 0L);
        return AppLockPolicy.isAllowedGrace(g) ? g : 0L;
    }

    private long idleMs() {
        long g = prefs().getLong(K_IDLE, 0L);
        return AppLockPolicy.isAllowedIdle(g) ? g : 0L;
    }

    /** الاستعادة بقفل الجهاز: الافتراضي مسموح لمن لا حساب مربوطاً له، وممنوع لمن ربط حساباً (M2). */
    private boolean deviceRecovery() {
        SharedPreferences p = prefs();
        if (p.contains(K_DEVICE_RECOVERY)) return p.getBoolean(K_DEVICE_RECOVERY, false);
        return p.getString(K_OWNER_ID, null) == null;
    }

    private boolean isLocked() {
        synchronized (LOCK) {
            return enabled() && !SESSION.unlocked;
        }
    }

    private boolean authorized() {
        synchronized (LOCK) {
            return SESSION.authorized(now());
        }
    }

    private void endAuth(boolean success) {
        synchronized (LOCK) {
            SESSION.endAuth(now(), success);
        }
    }

    private void unlock() {
        boolean changed;
        synchronized (LOCK) {
            changed = !SESSION.unlocked;
            SESSION.unlock(now());
        }
        removeCover();
        if (changed) {
            emit(false);
            ZenLockTileService.refresh(getContext());
        }
    }

    private void emit(boolean locked) {
        JSObject o = new JSObject();
        o.put("locked", locked);
        notifyListeners("lockChanged", o, true);
    }

    private int bootCount() {
        try {
            return Settings.Global.getInt(getContext().getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        } catch (Exception e) {
            return -1;
        }
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static boolean deviceSecure(Context ctx) {
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    /** M1: البصمة لفتح PIN قوية فقط (Class 3)؛ ضعيفة وحدها (وجه ثنائي الأبعاد مثلاً) = weak_only. */
    private static String biometricStatus(Context ctx) {
        BiometricManager bm = BiometricManager.from(ctx);
        int strong = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (strong != BiometricManager.BIOMETRIC_SUCCESS
            && bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS) {
            return "weak_only";
        }
        return statusName(strong);
    }

    private static String statusName(int can) {
        switch (can) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "available";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "none_enrolled";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
                return "no_hardware";
            default:
                return "unavailable";
        }
    }

    private static String canAuthCode(int can, String mode) {
        if (can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            return "biometric".equals(mode) ? "no_biometrics" : "no_credential";
        }
        if (can == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE || can == BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED) {
            return "biometric".equals(mode) ? "no_hardware" : "no_credential";
        }
        return "unavailable";
    }

    private static String errorCode(int code) {
        switch (code) {
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_CANCELED:
                return "canceled";
            case BiometricPrompt.ERROR_LOCKOUT:
                return "lockout";
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return "lockout_permanent";
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
                return "no_biometrics";
            case BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL:
                return "no_credential";
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
                return "no_hardware";
            case BiometricPrompt.ERROR_TIMEOUT:
                return "timeout";
            default:
                return "unavailable";
        }
    }

    // ───────────── الغطاء وإخفاء المعاينة ─────────────

    private void showCover() {
        final Activity a = getActivity();
        if (a == null) return;
        a.runOnUiThread(() -> {
            setShielded(a, true);
            if (cover != null && cover.getParent() != null) return;
            FrameLayout v = new FrameLayout(a);
            v.setBackgroundResource(R.drawable.splash);
            v.setClickable(true);
            v.setFocusable(true);
            v.setContentDescription(a.getString(R.string.lock_cover));
            v.setElevation(1000f);
            a.addContentView(v, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            cover = v;
        });
    }

    private void removeCover() {
        final Activity a = getActivity();
        if (a == null) return;
        a.runOnUiThread(() -> {
            View v = cover;
            cover = null;
            if (v != null && v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
            // شاشة القفل في الواجهة تعمل مع قارئ الشاشة بعد إزالة الغطاء؛ النوافذ العائمة تعود حين يُفتح.
            setWebViewHidden(false);
            if (!isLocked()) setShielded(a, false);
        });
    }

    /** M5: ما دام الغطاء الأصلي ظاهراً لا يقرأ قارئ الشاشة محتوى WebView تحته. */
    private void setWebViewHidden(boolean hidden) {
        try {
            View wv = getBridge() == null ? null : getBridge().getWebView();
            if (wv != null) {
                wv.setImportantForAccessibility(hidden ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
            }
        } catch (Exception ignored) {
            // لا WebView بعد.
        }
    }

    /** M5: مقفل = لا WebView لقارئ الشاشة تحت الغطاء، ولا نوافذ تطبيقات عائمة فوق شاشة القفل (Android 12+). */
    private void setShielded(Activity a, boolean locked) {
        if (locked) setWebViewHidden(true);
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                a.getWindow().setHideOverlayWindows(locked);
            } catch (Exception ignored) {
                // الإذن HIDE_OVERLAY_WINDOWS مُعلن في البيان؛ بدونه لا شيء يتغير.
            }
        }
    }

    private void applyPrivacy() {
        final Activity a = getActivity();
        if (a == null) return;
        final boolean hide = enabled() && prefs().getBoolean(K_HIDE, true);
        a.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33) {
                a.setRecentsScreenshotEnabled(!hide);
            } else if (hide) {
                a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }
}
