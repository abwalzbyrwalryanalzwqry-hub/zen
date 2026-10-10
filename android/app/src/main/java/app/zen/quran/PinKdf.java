package app.zen.quran;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * اشتقاق مفتاح رمز PIN: PBKDF2-HMAC-SHA256 (RFC 8018) بملح عشوائي فريد لكل رمز.
 *
 * مكتوب هنا بدل SecretKeyFactory("PBKDF2WithHmacSHA256") لأن الأخير غير موجود قبل Android 8 (API 26)
 * والتطبيق يدعم من API 24، وكي يُختبر على JVM بمتجهات RFC (PinKdfTest). الناتج لا يُخزَّن كما هو:
 * يُمرَّر بعدها على مفتاح HMAC غير قابل للاستخراج في Android Keystore (ZenLockPlugin)، فنسخ ملف
 * الإعدادات وحده لا يكفي لتخمين رمز قصير دون اتصال.
 */
public final class PinKdf {

    private PinKdf() {}

    /** تكرارات افتراضية؛ تُحفظ مع كل رمز فيمكن رفعها لاحقاً دون كسر الرموز القديمة. */
    public static final int DEFAULT_ITERATIONS = 60_000;
    public static final int SALT_BYTES = 16;
    public static final int KEY_BYTES = 32;

    public static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int dkLen)
        throws GeneralSecurityException {
        if (iterations < 1 || dkLen < 1) throw new IllegalArgumentException("bad params");
        byte[] pw = toUtf8(password);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            // HMAC يرفض مفتاحاً فارغاً في SecretKeySpec؛ PIN لا يكون فارغاً، والاختبار يغطي الحالات الأخرى.
            mac.init(new SecretKeySpec(pw, "HmacSHA256"));
            int hLen = mac.getMacLength();
            int blocks = (dkLen + hLen - 1) / hLen;
            byte[] out = new byte[dkLen];
            byte[] u = new byte[hLen];
            byte[] t = new byte[hLen];
            for (int i = 1; i <= blocks; i++) {
                mac.update(salt);
                mac.update(new byte[] { (byte) (i >>> 24), (byte) (i >>> 16), (byte) (i >>> 8), (byte) i });
                mac.doFinal(u, 0);
                System.arraycopy(u, 0, t, 0, hLen);
                for (int c = 1; c < iterations; c++) {
                    mac.update(u);
                    mac.doFinal(u, 0);
                    for (int k = 0; k < hLen; k++) t[k] ^= u[k];
                }
                int off = (i - 1) * hLen;
                System.arraycopy(t, 0, out, off, Math.min(hLen, dkLen - off));
            }
            Arrays.fill(u, (byte) 0);
            Arrays.fill(t, (byte) 0);
            return out;
        } finally {
            Arrays.fill(pw, (byte) 0);
        }
    }

    /**
     * الاشتقاق المستعمَل فعلاً (1.29.0، M7): تنفيذ النظام `PBKDF2WithHmacSHA256` (Conscrypt المصرّفة في Android 8+،
     * أسرع بمرات من HMAC المكتوب بـ Java) إن وُجد وطابق متجه اختبار معروفاً، وإلا {@link #pbkdf2}. الناتج واحد في
     * الحالتين (المعيار نفسه، ورمز PIN أرقام ASCII)، فالرموز المحفوظة من قبل تبقى صالحة.
     */
    public static byte[] derive(char[] password, byte[] salt, int iterations, int dkLen)
        throws GeneralSecurityException {
        if (platformOk()) {
            try {
                return platform(password, salt, iterations, dkLen);
            } catch (GeneralSecurityException | RuntimeException e) {
                // يُسقط إلى التنفيذ الخالص أدناه.
            }
        }
        return pbkdf2(password, salt, iterations, dkLen);
    }

    private static volatile Boolean sPlatformOk;

    /** فحص مرة واحدة: تنفيذ النظام يطابق التنفيذ الخالص على مدخل معروف (بأرقام مثل PIN). */
    static boolean platformOk() {
        Boolean ok = sPlatformOk;
        if (ok != null) return ok;
        boolean r;
        try {
            byte[] salt = "zen-kdf-selftest".getBytes(StandardCharsets.UTF_8);
            char[] pin = { '4', '7', '1', '9', '0', '3' };
            r = MessageDigest.isEqual(platform(pin, salt, 3, KEY_BYTES), pbkdf2(pin, salt, 3, KEY_BYTES));
        } catch (GeneralSecurityException | RuntimeException e) {
            r = false;
        }
        sPlatformOk = r;
        return r;
    }

    private static byte[] platform(char[] password, byte[] salt, int iterations, int dkLen)
        throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, dkLen * 8);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    /** مقارنة بزمن ثابت. */
    public static boolean equal(byte[] a, byte[] b) {
        return a != null && b != null && MessageDigest.isEqual(a, b);
    }

    private static byte[] toUtf8(char[] chars) {
        ByteBuffer bb = StandardCharsets.UTF_8.encode(CharBuffer.wrap(chars));
        byte[] out = new byte[bb.remaining()];
        bb.get(out);
        if (bb.hasArray()) Arrays.fill(bb.array(), (byte) 0);
        return out;
    }
}
