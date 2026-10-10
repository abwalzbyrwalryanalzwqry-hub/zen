package app.zen.quran;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** H1 (1.29.0): تصنيف رد Supabase Auth وتحليله في Java، دون شبكة. */
public class AccountVerifierTest {

    private static final String ID = "4f1c2a9e-0b7d-4e36-9a51-2c8f6d3b7e10";

    @Test
    public void successNeedsAValidUserId() {
        String ok = "{\"access_token\":\"x\",\"user\":{\"id\":\"" + ID + "\",\"email\":\"a@b.c\"}}";
        assertEquals(AccountVerifier.OK, AccountVerifier.classify(200, ok));
        assertEquals(ID, AccountVerifier.parseUserId(ok));
        assertEquals("x", AccountVerifier.parseAccessToken(ok));
        assertEquals(AccountVerifier.SERVER, AccountVerifier.classify(200, "{\"user\":{\"id\":\"not-a-uuid\"}}"));
        assertEquals(AccountVerifier.SERVER, AccountVerifier.classify(200, "<html>"));
        assertNull(AccountVerifier.parseUserId(null));
    }

    @Test
    public void errorsAreClassified() {
        assertEquals(AccountVerifier.BAD_CREDENTIALS,
            AccountVerifier.classify(400, "{\"error\":\"invalid_grant\",\"error_description\":\"Invalid login credentials\"}"));
        assertEquals(AccountVerifier.BAD_CREDENTIALS, AccountVerifier.classify(400, "{\"code\":\"invalid_credentials\"}"));
        assertEquals(AccountVerifier.RATE_LIMITED, AccountVerifier.classify(429, "{}"));
        assertEquals(AccountVerifier.SERVER, AccountVerifier.classify(500, "{}"));
        assertEquals(AccountVerifier.SERVER, AccountVerifier.classify(400, "{\"error\":\"other\"}"));
    }

    @Test
    public void inputsAreValidated() {
        assertTrue(AccountVerifier.validUserId(ID));
        assertFalse(AccountVerifier.validUserId("1234"));
        assertTrue(AccountVerifier.validEmail("u@zen.app"));
        assertFalse(AccountVerifier.validEmail("no-at"));
        assertFalse(AccountVerifier.validEmail("a@b@c"));
        assertFalse(AccountVerifier.validEmail("a b@c"));
        assertTrue(AccountVerifier.validBase("https://abc.supabase.co"));
        assertFalse(AccountVerifier.validBase("http://abc.supabase.co"));
        assertFalse(AccountVerifier.validBase("https://abc.supabase.co/path"));
        assertFalse(AccountVerifier.validBase(""));
        // بلا إعداد: لا محاولة شبكة أصلاً.
        assertEquals(AccountVerifier.CONFIG, AccountVerifier.verify("", "k", "u@zen.app", "p").code);
        assertEquals(AccountVerifier.BAD_CREDENTIALS, AccountVerifier.verify("https://abc.supabase.co", "k", "bad", "p").code);
    }
}
