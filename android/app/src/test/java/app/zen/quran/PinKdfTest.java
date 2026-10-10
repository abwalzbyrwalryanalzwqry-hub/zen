package app.zen.quran;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

/** PBKDF2-HMAC-SHA256 بمتجهات RFC 7914 §11 ومتجهات معروفة لـ PBKDF2-SHA256. */
public class PinKdfTest {

    private static byte[] hex(String s) {
        s = s.replace(" ", "");
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return out;
    }

    private static byte[] salt(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    public void rfc7914Vector1() throws Exception {
        byte[] dk = PinKdf.pbkdf2("passwd".toCharArray(), salt("salt"), 1, 64);
        assertArrayEquals(
            hex("55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc"
                + "49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783"),
            dk);
    }

    @Test
    public void knownVectorsSingleBlock() throws Exception {
        assertArrayEquals(
            hex("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"),
            PinKdf.pbkdf2("password".toCharArray(), salt("salt"), 1, 32));
        assertArrayEquals(
            hex("ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"),
            PinKdf.pbkdf2("password".toCharArray(), salt("salt"), 2, 32));
        assertArrayEquals(
            hex("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a"),
            PinKdf.pbkdf2("password".toCharArray(), salt("salt"), 4096, 32));
    }

    @Test
    public void rfc7914Vector2MultiBlock() throws Exception {
        byte[] dk = PinKdf.pbkdf2("Password".toCharArray(), salt("NaCl"), 80000, 64);
        assertArrayEquals(
            hex("4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56"
                + "a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d"),
            dk);
    }

    @Test
    public void saltAndPinChangeTheKeyAndCompareIsStrict() throws Exception {
        byte[] a = PinKdf.pbkdf2("2580".toCharArray(), salt("s1"), 1000, 32);
        byte[] b = PinKdf.pbkdf2("2580".toCharArray(), salt("s2"), 1000, 32);
        byte[] c = PinKdf.pbkdf2("2581".toCharArray(), salt("s1"), 1000, 32);
        byte[] a2 = PinKdf.pbkdf2("2580".toCharArray(), salt("s1"), 1000, 32);
        assertTrue(PinKdf.equal(a, a2));
        assertFalse(PinKdf.equal(a, b));
        assertFalse(PinKdf.equal(a, c));
        assertFalse(PinKdf.equal(a, null));
    }

    @Test
    public void deriveMatchesPureImplementationAndRfcVector() throws Exception {
        // 1.29.0 (M7): تنفيذ النظام يُعتمد فقط إن طابق التنفيذ الخالص؛ والرموز المحفوظة سابقاً تبقى صالحة.
        assertTrue(PinKdf.platformOk());
        assertArrayEquals(
            hex("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a"),
            PinKdf.derive("password".toCharArray(), salt("salt"), 4096, 32));
        for (String pin : new String[] { "3719", "8264", "194736", "000000" }) {
            assertArrayEquals(
                PinKdf.pbkdf2(pin.toCharArray(), salt("zen"), 2000, 32),
                PinKdf.derive(pin.toCharArray(), salt("zen"), 2000, 32));
        }
    }
}
