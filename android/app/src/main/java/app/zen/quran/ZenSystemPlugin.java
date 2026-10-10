package app.zen.quran;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

/**
 * جسر صغير لإعدادات النظام (src/lib/native-system.ts):
 *  - H5: مقياس خط النظام، يحوّله التطبيق إلى إعداد «حجم الخط» الخاص به فيعيد ترتيب الواجهة
 *    (لا تكبير WebView الأعمى الذي كان يخرج الواجهة عن الشاشة).
 *  - L7: تقارير الأعطال الأصلية بموافقة صريحة فقط. عند العطل يُكتب المكدّس في ملف داخلي إن وافق
 *    المستخدم، ويقرؤه التطبيق في التشغيل التالي ويرسله إلى log_client_error ثم يحذفه.
 *    بلا خدمة خارجية ولا بيانات شخصية: نص الاستثناء وطراز الجهاز وإصدار النظام فقط.
 *  - 1.16.1: فتح إعدادات إشعارات زِن في النظام (الصوت والاهتزاز والإذن) من «الإعدادات ← التنبيهات».
 */
@CapacitorPlugin(name = "ZenSystem")
public class ZenSystemPlugin extends Plugin {

    static final String PREFS = "zen_system";
    static final String CONSENT = "crash_consent";
    static final String CRASH_FILE = "zen-last-crash.txt";
    private static final int MAX_CRASH_CHARS = 4000;

    @PluginMethod
    public void getFontScale(PluginCall call) {
        JSObject r = new JSObject();
        r.put("scale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(r);
    }

    @PluginMethod
    public void getCrashConsent(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", prefs(getContext()).getBoolean(CONSENT, false));
        call.resolve(r);
    }

    @PluginMethod
    public void setCrashConsent(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        prefs(getContext()).edit().putBoolean(CONSENT, on).apply();
        // سحب الموافقة يحذف أي تقرير لم يُرسل بعد.
        if (!on) new File(getContext().getFilesDir(), CRASH_FILE).delete();
        call.resolve();
    }

    /** يعيد آخر تقرير عطل ويحذفه (مرة واحدة). */
    @PluginMethod
    public void takeLastCrash(PluginCall call) {
        File f = new File(getContext().getFilesDir(), CRASH_FILE);
        JSObject r = new JSObject();
        if (!f.exists() || !prefs(getContext()).getBoolean(CONSENT, false)) {
            f.delete();
            r.put("crash", null);
            call.resolve(r);
            return;
        }
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) Math.min(f.length(), MAX_CRASH_CHARS * 4L)];
            int n = in.read(buf);
            r.put("crash", n > 0 ? new String(buf, 0, n, StandardCharsets.UTF_8) : null);
        } catch (Exception e) {
            r.put("crash", null);
        }
        f.delete();
        call.resolve(r);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** يُثبَّت من MainActivity: يكتب المكدّس إن وافق المستخدم ثم يترك المعالج الأصلي يكمل. */
    static void installCrashHandler(Context app) {
        final Context ctx = app.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                if (prefs(ctx).getBoolean(CONSENT, false)) {
                    StringWriter sw = new StringWriter();
                    error.printStackTrace(new PrintWriter(sw));
                    String text = "android " + android.os.Build.VERSION.RELEASE + " | "
                        + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + " | "
                        + thread.getName() + "\n" + sw;
                    if (text.length() > MAX_CRASH_CHARS) text = text.substring(0, MAX_CRASH_CHARS);
                    try (FileOutputStream out = new FileOutputStream(new File(ctx.getFilesDir(), CRASH_FILE))) {
                        out.write(text.getBytes(StandardCharsets.UTF_8));
                    }
                }
            } catch (Throwable ignored) {
                // لا يجوز أن يفشل معالج الأعطال نفسه.
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    /** إعدادات إشعارات التطبيق (أو قناة بعينها) في النظام؛ وقبل Android 8 صفحة التطبيق. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        String channel = call.getString("channel");
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(channel != null
                ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS
                : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            if (channel != null) intent.putExtra(Settings.EXTRA_CHANNEL_ID, channel);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + ctx.getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent app = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + ctx.getPackageName()));
                app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(app);
                call.resolve();
            } catch (Exception again) {
                call.reject("NO_SETTINGS");
            }
        }
    }
}
