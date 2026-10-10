package app.zen.quran;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/** بديل اختبار قالب Capacitor (كان يتوقع com.getcapacitor.app ولم يُشغَّل قبل 1.29.0). */
@RunWith(AndroidJUnit4.class)
public class AppContextInstrumentedTest {
    @Test
    public void packageName() {
        Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("app.zen.quran", ctx.getPackageName());
    }
}
