package app.zen.quran;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** قواعد قفل التطبيق (AppLockPolicy) على JVM: مدد الانتظار، والإقلاع، وفترة السماح، وقبول PIN. */
public class AppLockPolicyTest {

    @Test
    public void noDelayBeforeFifthFailure() {
        for (int f = 0; f < AppLockPolicy.FREE_ATTEMPTS; f++) assertEquals(0L, AppLockPolicy.lockoutDurationMs(f));
        assertEquals(5, AppLockPolicy.attemptsBeforeDelay(0));
        assertEquals(1, AppLockPolicy.attemptsBeforeDelay(4));
        assertEquals(0, AppLockPolicy.attemptsBeforeDelay(9));
    }

    @Test
    public void delaysGrowAndAreCappedNeverPermanent() {
        assertEquals(30_000L, AppLockPolicy.lockoutDurationMs(5));
        assertEquals(60_000L, AppLockPolicy.lockoutDurationMs(6));
        assertEquals(120_000L, AppLockPolicy.lockoutDurationMs(7));
        assertEquals(300_000L, AppLockPolicy.lockoutDurationMs(8));
        assertEquals(900_000L, AppLockPolicy.lockoutDurationMs(9));
        assertEquals(1_800_000L, AppLockPolicy.lockoutDurationMs(10));
        // السقف يتكرر ولا يصير قفلاً نهائياً مهما كثرت المحاولات.
        assertEquals(1_800_000L, AppLockPolicy.lockoutDurationMs(10_000));
        long prev = 0;
        for (int f = 0; f < 20; f++) {
            long d = AppLockPolicy.lockoutDurationMs(f);
            assertTrue(d >= prev);
            assertTrue(d <= 30 * 60_000L);
            prev = d;
        }
    }

    @Test
    public void remainingUsesMonotonicClock() {
        assertEquals(0L, AppLockPolicy.remainingLockoutMs(1000, 0, 3, 3, 5000));
        assertEquals(20_000L, AppLockPolicy.remainingLockoutMs(1000, 30_000, 3, 3, 11_000));
        assertEquals(0L, AppLockPolicy.remainingLockoutMs(1000, 30_000, 3, 3, 40_000));
    }

    @Test
    public void rebootOrClockResetRestartsTheWaitInsteadOfClearingIt() {
        assertEquals(AppLockPolicy.RESTART, AppLockPolicy.remainingLockoutMs(1000, 30_000, 3, 4, 2000));
        assertEquals(AppLockPolicy.RESTART, AppLockPolicy.remainingLockoutMs(50_000, 30_000, 3, 3, 10));
    }

    @Test
    public void graceOptionsAndRelock() {
        assertTrue(AppLockPolicy.isAllowedGrace(0));
        assertTrue(AppLockPolicy.isAllowedGrace(30_000));
        assertTrue(AppLockPolicy.isAllowedGrace(60_000));
        assertTrue(AppLockPolicy.isAllowedGrace(300_000));
        assertFalse(AppLockPolicy.isAllowedGrace(86_400_000L));
        assertFalse(AppLockPolicy.isAllowedGrace(-1));
        assertTrue(AppLockPolicy.shouldRelock(0, 0));
        assertTrue(AppLockPolicy.shouldRelock(10, 0));
        assertFalse(AppLockPolicy.shouldRelock(29_999, 30_000));
        assertTrue(AppLockPolicy.shouldRelock(30_000, 30_000));
        assertTrue(AppLockPolicy.shouldRelock(-5, 300_000));
    }

    @Test
    public void pinRules() {
        assertNull(AppLockPolicy.pinProblem("3719"));
        assertNull(AppLockPolicy.pinProblem("8264"));
        assertNull(AppLockPolicy.pinProblem("193746"));
        assertEquals("length", AppLockPolicy.pinProblem(null));
        assertEquals("length", AppLockPolicy.pinProblem("123"));
        assertEquals("length", AppLockPolicy.pinProblem("1234567"));
        assertEquals("digits", AppLockPolicy.pinProblem("12a4"));
        assertEquals("digits", AppLockPolicy.pinProblem("١٢٣٤"));
        assertEquals("weak", AppLockPolicy.pinProblem("0000"));
        assertEquals("weak", AppLockPolicy.pinProblem("999999"));
        assertEquals("weak", AppLockPolicy.pinProblem("1234"));
        assertEquals("weak", AppLockPolicy.pinProblem("456789"));
        assertEquals("weak", AppLockPolicy.pinProblem("4321"));
        assertEquals("weak", AppLockPolicy.pinProblem("890123"));
        // 1.29.0 (L2): الأنماط الدورية والسنوات وأشهر الرموز المسرَّبة.
        assertEquals("weak", AppLockPolicy.pinProblem("1212"));
        assertEquals("weak", AppLockPolicy.pinProblem("121212"));
        assertEquals("weak", AppLockPolicy.pinProblem("123123"));
        assertEquals("weak", AppLockPolicy.pinProblem("1950"));
        assertEquals("weak", AppLockPolicy.pinProblem("1999"));
        assertEquals("weak", AppLockPolicy.pinProblem("2030"));
        assertNull(AppLockPolicy.pinProblem("1949"));
        assertNull(AppLockPolicy.pinProblem("2031"));
        assertEquals("weak", AppLockPolicy.pinProblem("2580"));
        assertEquals("weak", AppLockPolicy.pinProblem("0852"));
        assertEquals("weak", AppLockPolicy.pinProblem("1122"));
        assertEquals("weak", AppLockPolicy.pinProblem("147258"));
        assertEquals("weak", AppLockPolicy.pinProblem("112233"));
        assertNull(AppLockPolicy.pinProblem("124578"));
        assertNull(AppLockPolicy.pinProblem("1213"));
    }

    @Test
    public void graceFromJsonAcceptsBridgeNumbers() {
        assertEquals(Long.valueOf(30_000L), AppLockPolicy.graceFromJson(Integer.valueOf(30_000)));
        assertEquals(Long.valueOf(0L), AppLockPolicy.graceFromJson(Integer.valueOf(0)));
        assertEquals(Long.valueOf(300_000L), AppLockPolicy.graceFromJson(Long.valueOf(300_000L)));
        assertEquals(Long.valueOf(60_000L), AppLockPolicy.graceFromJson(Double.valueOf(60_000d)));
        assertNull(AppLockPolicy.graceFromJson(Integer.valueOf(12_345)));
        assertNull(AppLockPolicy.graceFromJson(Double.valueOf(30_000.5)));
        assertNull(AppLockPolicy.graceFromJson("30000"));
        assertNull(AppLockPolicy.graceFromJson(null));
    }

    @Test
    public void idleOptionsAndExpiry() {
        assertEquals(Long.valueOf(0L), AppLockPolicy.idleFromJson(0));
        assertEquals(Long.valueOf(300_000L), AppLockPolicy.idleFromJson(300_000));
        assertEquals(Long.valueOf(900_000L), AppLockPolicy.idleFromJson(900_000.0));
        assertNull(AppLockPolicy.idleFromJson(120_000));
        assertNull(AppLockPolicy.idleFromJson("300000"));
        assertNull(AppLockPolicy.idleFromJson(300_000.5));
        assertFalse(AppLockPolicy.idleExpired(0, 10_000_000, 0));
        assertFalse(AppLockPolicy.idleExpired(0, 299_999, 300_000));
        assertTrue(AppLockPolicy.idleExpired(0, 300_000, 300_000));
        assertTrue(AppLockPolicy.idleExpired(5_000, 4_000, 300_000));
    }
}
