package app.zen.quran;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * مفتاح البصمة (1.29.0، M1): مفتاح HMAC في Keystore لا يعمل إلا بعد مصادقة بيومترية قوية (Class 3) لكل
 * استعمال، ويُبطَل تلقائياً إن أُضيفت بصمة أو وجه جديد إلى الجهاز. فتح زِن بالبصمة صار يتطلب أن يوقّع هذا
 * المفتاح تحدياً داخل CryptoObject الممرَّر إلى BiometricPrompt، لا مجرد رد «نجح» من النافذة.
 *
 * لا علاقة له بوسيلة «قفل الجهاز» (method=device) التي تقبل رمز الجهاز أيضاً ولا مفتاح لها.
 */
final class BioKey {

    static final String ALIAS = "zen_app_lock_bio";
    private static final byte[] CHALLENGE = "zen-app-lock-bio-v1".getBytes(StandardCharsets.UTF_8);

    /** البصمات تغيّرت (أو المفتاح مفقود): يجب إعادة التفعيل بعد إدخال الرمز. */
    static final class Invalidated extends Exception {
        Invalidated() {
            super("biometric key invalidated");
        }
    }

    private BioKey() {}

    /** مفتاح جديد (يستبدل أي سابق). */
    static void create() throws Exception {
        delete();
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) {
            b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
        kg.init(b.build());
        kg.generateKey();
    }

    /** Mac مهيّأ ينتظر المصادقة، لـ BiometricPrompt.CryptoObject. */
    static Mac mac() throws Exception {
        KeyStore ks = PinVault.keystore();
        if (!ks.containsAlias(ALIAS)) throw new Invalidated();
        SecretKey key = (SecretKey) ks.getKey(ALIAS, null);
        if (key == null) throw new Invalidated();
        Mac mac = Mac.getInstance("HmacSHA256");
        try {
            mac.init(key);
        } catch (KeyPermanentlyInvalidatedException e) {
            delete();
            throw new Invalidated();
        }
        return mac;
    }

    /** بعد النجاح: المفتاح وقّع فعلاً (لا يحدث إلا بمصادقة بيومترية قوية حقيقية). */
    static boolean sign(Mac mac) {
        if (mac == null) return false;
        try {
            return mac.doFinal(CHALLENGE).length == 32;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean exists() {
        try {
            return PinVault.keystore().containsAlias(ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    static void delete() {
        PinVault.deleteAlias(ALIAS);
    }
}
