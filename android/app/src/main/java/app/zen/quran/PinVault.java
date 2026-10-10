package app.zen.quran;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * مواد رمز PIN (1.29.0): PBKDF2 بملح فريد ثم HMAC بمفتاح Android Keystore غير قابل للاستخراج.
 *
 *  - H2: لكل رمز مفتاح باسم جديد (zen_app_lock_pin_<وقت>) يُحفظ اسمه مع المادة في commit واحد، ولا يُحذف
 *    المفتاح السابق إلا بعد نجاح الحفظ. فشل في المنتصف يترك الرمز القديم صالحاً بدل قفل بلا رمز يعمل.
 *    الاسم القديم الثابت (zen_app_lock_pin) يبقى مقروءاً لمن أعدّ رمزه في 1.28.0.
 *  - L4: StrongBox إن وُجد (Android 9+)، وإلا Keystore العادي. setUnlockedDeviceRequired غير مستعمل عمداً:
 *    على جهاز بلا قفل شاشة آمن يجعل المفتاح غير صالح، فيُقفل المستخدم خارج تطبيقه (docs/APP_LOCK.md).
 *  - L3: فحص فعلي لـ Keystore (توليد مفتاح تجريبي وحذفه) مرة واحدة في العملية.
 *  - M7: الاشتقاق عبر PinKdf.derive (تنفيذ النظام الأسرع حين يطابق). كل الاستدعاءات من خيط خلفي.
 *
 * هذه الطبقة لا تكتب «مفعّل» ولا الوسيلة: المستدعي يضمّ {@link Material} إلى commit إعداداته نفسه.
 */
@SuppressLint("ApplySharedPref")
final class PinVault {

    static final String LEGACY_ALIAS = "zen_app_lock_pin";
    private static final String PROBE_ALIAS = "zen_app_lock_probe";
    static final String K_SALT = "pin_salt";
    static final String K_ITER = "pin_iter";
    static final String K_TAG = "pin_tag";
    static final String K_LEN = "pin_len";
    static final String K_ALIAS = "pin_key_alias";
    private static final byte[] TAG_CONTEXT = "zen-app-lock-v1".getBytes(StandardCharsets.UTF_8);

    private static volatile Boolean sUsable;

    private final Context ctx;
    private final SharedPreferences prefs;
    private final SecureRandom random = new SecureRandom();

    PinVault(Context ctx, SharedPreferences prefs) {
        this.ctx = ctx.getApplicationContext();
        this.prefs = prefs;
    }

    /** مادة رمز جديد جاهزة للحفظ؛ مفتاحها مولَّد فعلاً في Keystore. */
    static final class Material {
        final String alias;
        final String salt;
        final int iter;
        final String tag;
        final int len;

        Material(String alias, String salt, int iter, String tag, int len) {
            this.alias = alias;
            this.salt = salt;
            this.iter = iter;
            this.tag = tag;
            this.len = len;
        }
    }

    boolean hasMaterial() {
        return prefs.getString(K_SALT, null) != null && prefs.getString(K_TAG, null) != null && prefs.getInt(K_ITER, 0) > 0;
    }

    /** اسم المفتاح الحالي (القديم الثابت لمواد 1.28.0)، أو null بلا مادة. */
    String currentAlias() {
        if (!hasMaterial()) return null;
        String a = prefs.getString(K_ALIAS, null);
        return a != null ? a : LEGACY_ALIAS;
    }

    /** ينشئ مفتاحاً جديداً ويحسب المادة؛ لا يلمس الإعدادات ولا المفتاح الحالي. */
    Material prepare(String pin) throws Exception {
        String alias = LEGACY_ALIAS + "_" + System.currentTimeMillis();
        char[] chars = pin.toCharArray();
        byte[] dk = null;
        try {
            byte[] salt = new byte[PinKdf.SALT_BYTES];
            random.nextBytes(salt);
            int iter = PinKdf.DEFAULT_ITERATIONS;
            dk = PinKdf.derive(chars, salt, iter, PinKdf.KEY_BYTES);
            SecretKey key = generate(alias);
            byte[] tag = tag(key, dk);
            return new Material(alias, b64(salt), iter, b64(tag), pin.length());
        } catch (Exception e) {
            deleteAlias(alias);
            throw e;
        } finally {
            Arrays.fill(chars, '\0');
            if (dk != null) Arrays.fill(dk, (byte) 0);
        }
    }

    static void write(SharedPreferences.Editor e, Material m) {
        e.putString(K_SALT, m.salt).putInt(K_ITER, m.iter).putString(K_TAG, m.tag).putInt(K_LEN, m.len).putString(K_ALIAS, m.alias);
    }

    static void clear(SharedPreferences.Editor e) {
        e.remove(K_SALT).remove(K_ITER).remove(K_TAG).remove(K_LEN).remove(K_ALIAS);
    }

    /** بعد commit ناجح: يُبقي `keep` (أو لا شيء) ويحذف كل مفتاح PIN آخر. */
    void retainOnly(String keep) {
        for (String a : pinAliases()) if (!a.equals(keep)) deleteAlias(a);
    }

    /** عند الإقلاع: مفاتيح يتيمة من عملية انقطعت بين التوليد والحفظ. */
    void cleanupOrphans() {
        retainOnly(currentAlias() == null ? "" : currentAlias());
    }

    /** true/false للمطابقة، وnull إن تعذّر التحقق (مفتاح مفقود أو مادة تالفة). */
    Boolean check(String pin) {
        String saltB = prefs.getString(K_SALT, null);
        String tagB = prefs.getString(K_TAG, null);
        int iter = prefs.getInt(K_ITER, 0);
        String alias = currentAlias();
        if (saltB == null || tagB == null || iter <= 0 || alias == null) return null;
        if (pin == null || pin.length() < AppLockPolicy.PIN_MIN || pin.length() > AppLockPolicy.PIN_MAX) return false;
        char[] chars = pin.toCharArray();
        byte[] dk = null;
        try {
            KeyStore ks = keystore();
            if (!ks.containsAlias(alias)) return null;
            SecretKey key = (SecretKey) ks.getKey(alias, null);
            if (key == null) return null;
            dk = PinKdf.derive(chars, Base64.decode(saltB, Base64.NO_WRAP), iter, PinKdf.KEY_BYTES);
            return PinKdf.equal(tag(key, dk), Base64.decode(tagB, Base64.NO_WRAP));
        } catch (Exception e) {
            return null;
        } finally {
            Arrays.fill(chars, '\0');
            if (dk != null) Arrays.fill(dk, (byte) 0);
        }
    }

    /** L3: هل يولّد Keystore مفتاح HMAC فعلاً ويستعمله؟ يُفحص مرة في العملية. */
    boolean usable() {
        Boolean u = sUsable;
        if (u != null) return u;
        boolean ok;
        try {
            SecretKey k = generatePlain(PROBE_ALIAS);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(k);
            ok = mac.doFinal(TAG_CONTEXT).length == 32;
        } catch (Exception e) {
            ok = false;
        } finally {
            deleteAlias(PROBE_ALIAS);
        }
        sUsable = ok;
        return ok;
    }

    // ───────────── داخلي ─────────────

    private SecretKey generate(String alias) throws Exception {
        if (Build.VERSION.SDK_INT >= 28 && ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)) {
            try {
                KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
                kg.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN).setIsStrongBoxBacked(true).build());
                return kg.generateKey();
            } catch (Exception e) {
                // StrongBoxUnavailableException وغيرها: Keystore العادي أدناه.
                deleteAlias(alias);
            }
        }
        return generatePlain(alias);
    }

    private static SecretKey generatePlain(String alias) throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN).build());
        return kg.generateKey();
    }

    private static byte[] tag(SecretKey key, byte[] dk) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(key);
        mac.update(TAG_CONTEXT);
        return mac.doFinal(dk);
    }

    static KeyStore keystore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return ks;
    }

    private static List<String> pinAliases() {
        try {
            List<String> out = new ArrayList<>();
            for (String a : Collections.list(keystore().aliases())) {
                if (a.equals(LEGACY_ALIAS) || a.startsWith(LEGACY_ALIAS + "_")) out.add(a);
            }
            return out;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    static void deleteAlias(String alias) {
        try {
            KeyStore ks = keystore();
            if (ks.containsAlias(alias)) ks.deleteEntry(alias);
        } catch (Exception ignored) {
            // لا مفتاح: لا شيء يُحذف.
        }
    }

    private static String b64(byte[] b) {
        return Base64.encodeToString(b, Base64.NO_WRAP);
    }
}
