package app.zen.quran;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.KeyStore;
import java.util.Collections;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * خزنة PIN على Android Keystore الحقيقي (محاكي CI: .github/workflows/android-instrumented.yml).
 * يغطي ما لا تصل إليه اختبارات JVM: توليد المفتاح، والتحقق، وتبديل الرمز بمفتاح جديد قبل حذف القديم،
 * وتنظيف المفاتيح اليتيمة، وفقدان المفتاح ⇒ null (PIN_UNAVAILABLE لا «رمز خاطئ»).
 */
@RunWith(AndroidJUnit4.class)
public class PinVaultInstrumentedTest {

    private SharedPreferences prefs;
    private PinVault vault;

    @Before
    public void setUp() {
        Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        prefs = ctx.getSharedPreferences("zen_lock_vault_test", Context.MODE_PRIVATE);
        prefs.edit().clear().commit();
        vault = new PinVault(ctx, prefs);
        vault.retainOnly("");
    }

    @After
    public void tearDown() {
        prefs.edit().clear().commit();
        vault.retainOnly("");
    }

    @Test
    public void keystoreIsUsable() {
        assertTrue(vault.usable());
    }

    @Test
    public void writeThenCheck() throws Exception {
        PinVault.Material m = vault.prepare("3719");
        SharedPreferences.Editor e = prefs.edit();
        PinVault.write(e, m);
        assertTrue(e.commit());
        assertEquals(Boolean.TRUE, vault.check("3719"));
        assertEquals(Boolean.FALSE, vault.check("3718"));
        assertEquals(Boolean.FALSE, vault.check("12"));
        assertEquals(m.alias, vault.currentAlias());
    }

    @Test
    public void changePinKeepsOnlyNewKey() throws Exception {
        PinVault.Material a = vault.prepare("3719");
        SharedPreferences.Editor e = prefs.edit();
        PinVault.write(e, a);
        e.commit();
        Thread.sleep(2);
        PinVault.Material b = vault.prepare("846201");
        // قبل الحفظ: القديم ما زال صالحاً (الانقطاع هنا لا يفقد الرمز).
        assertEquals(Boolean.TRUE, vault.check("3719"));
        e = prefs.edit();
        PinVault.write(e, b);
        e.commit();
        vault.retainOnly(b.alias);
        assertEquals(Boolean.TRUE, vault.check("846201"));
        assertEquals(Boolean.FALSE, vault.check("3719"));
        assertFalse(aliases().contains(a.alias));
        assertTrue(aliases().contains(b.alias));
    }

    @Test
    public void orphanFromInterruptedChangeIsRemoved() throws Exception {
        PinVault.Material a = vault.prepare("3719");
        SharedPreferences.Editor e = prefs.edit();
        PinVault.write(e, a);
        e.commit();
        Thread.sleep(2);
        PinVault.Material orphan = vault.prepare("846201");
        vault.cleanupOrphans();
        assertFalse(aliases().contains(orphan.alias));
        assertEquals(Boolean.TRUE, vault.check("3719"));
    }

    @Test
    public void missingKeyIsUnavailableNotWrong() throws Exception {
        PinVault.Material a = vault.prepare("3719");
        SharedPreferences.Editor e = prefs.edit();
        PinVault.write(e, a);
        e.commit();
        PinVault.deleteAlias(a.alias);
        assertNull(vault.check("3719"));
    }

    private static java.util.List<String> aliases() throws Exception {
        KeyStore ks = PinVault.keystore();
        return Collections.list(ks.aliases());
    }
}
