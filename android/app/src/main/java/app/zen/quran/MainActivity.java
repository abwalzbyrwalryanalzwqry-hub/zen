package app.zen.quran;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // مكوّن محلي: مربع الطباعة الأصلي («حفظ بتنسيق PDF») لتقارير المركز والطالب.
        registerPlugin(ZenPrintPlugin.class);
        // مقياس خط النظام وتقارير الأعطال بموافقة (H5 وL7).
        registerPlugin(ZenSystemPlugin.class);
        // تلاوة في الخلفية بإشعار وأدوات تحكم (M14).
        registerPlugin(ZenPlaybackPlugin.class);
        // قفل التطبيق: PIN أو مصادقة النظام، وفترة السماح، وإخفاء المعاينة (1.28.0)، والقفل بالخمول (1.29.0).
        registerPlugin(ZenLockPlugin.class);
        ZenSystemPlugin.installCrashHandler(this);
        super.onCreate(savedInstanceState);
        // H5: خط النظام لا يُتجاهل؛ يقرؤه التطبيق عبر ZenSystem.getFontScale ويحوّله إلى إعداد
        // «حجم الخط» الخاص به (ما لم يختر المستخدم حجماً بنفسه)، وهو إعداد يعيد ترتيب الواجهة.
        // لذلك يبقى تكبير WebView على 100%: تكبيره الأعمى فوق ذلك يضاعف الحجم ويخرج الواجهة عن الشاشة.
        WebSettings s = getBridge().getWebView().getSettings();
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // 1.35.0: حُذف ودجت «طابور اليوم». يُمسح ملخّصه المحفوظ من الإصدارات السابقة (بيانات المستخدم).
        deleteSharedPreferences("zen_widget");
    }

    /** قفل التطبيق (1.29.0): كل لمسة أو مفتاح يؤجّل القفل بعد الخمول. */
    @Override
    public void onUserInteraction() {
        super.onUserInteraction();
        ZenLockPlugin.userInteraction();
    }
}
