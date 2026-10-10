package app.zen.quran;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.print.ZenPdfWriter;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * مربع الطباعة الأصلي في Android لصفحة HTML (تقارير المركز والطالب). منه يختار المستخدم
 * «حفظ بتنسيق PDF» أو طابعة. لا يلمس الشبكة: الصفحة نصّ مولَّد في التطبيق بلا روابط خارجية.
 * يناديه `printHtml` في src/lib/native-file.ts.
 */
@CapacitorPlugin(name = "ZenPrint")
public class ZenPrintPlugin extends Plugin {

    // يبقى مرجع الصفحة حتى ينتهي الطباعة، وإلا قد تُجمع قبل أن يقرأها مربع الطباعة.
    private WebView printView;

    @PluginMethod
    public void print(PluginCall call) {
        final String html = call.getString("html");
        final String name = call.getString("name", "zen");
        if (html == null || html.isEmpty()) {
            call.reject("لا محتوى للطباعة");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(false);
            final boolean[] started = { false };
            view.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView v, String url) {
                    if (started[0]) return;
                    started[0] = true;
                    PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    if (pm == null) {
                        call.reject("الطباعة غير متاحة على هذا الجهاز");
                        return;
                    }
                    PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(name);
                    pm.print(name, adapter, new PrintAttributes.Builder().build());
                    call.resolve();
                }
            });
            printView = view;
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    // مرجع صفحة التصدير إلى PDF حتى تكتمل الكتابة.
    private WebView pdfView;

    /**
     * يكتب صفحة HTML (تقرير بصفحات A4 جاهزة وخطوط مضمّنة) ملفَّ PDF في الذاكرة المؤقتة للتطبيق ويعيد
     * رابطه للمشاركة. هوامش الصفحة صفر لأن الهوامش جزء من تصميم الصفحة نفسها (@page margin: 0).
     */
    @PluginMethod
    public void toPdf(PluginCall call) {
        final String html = call.getString("html");
        final String name = call.getString("name", "zen-report");
        final boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        // قياس مخصّص بالمليمتر (شهادة A5 أو قياس حر من استوديو الشهائد). بلا قياس: A4 كما في التقارير.
        final Double widthMm = call.getDouble("widthMm");
        final Double heightMm = call.getDouble("heightMm");
        if (html == null || html.isEmpty()) {
            call.reject("لا محتوى للتصدير");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(false);
            final boolean[] started = { false };
            view.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView v, String url) {
                    if (started[0]) return;
                    started[0] = true;
                    // مهلة قصيرة ليكتمل فك الخطوط المضمّنة قبل التخطيط.
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        File dir = new File(getContext().getCacheDir(), "zen-export");
                        if (!dir.exists() && !dir.mkdirs()) {
                            call.reject("تعذّر تجهيز مجلد التصدير");
                            return;
                        }
                        final File out = new File(dir, name + ".pdf");
                        PrintAttributes.MediaSize size;
                        if (widthMm != null && heightMm != null && widthMm >= 50 && heightMm >= 50
                                && widthMm <= 1000 && heightMm <= 1000) {
                            // MediaSize بأجزاء الألف من البوصة (mils).
                            int w = (int) Math.round(widthMm / 25.4 * 1000);
                            int h = (int) Math.round(heightMm / 25.4 * 1000);
                            size = new PrintAttributes.MediaSize("zen_" + w + "x" + h, "Zen", w, h);
                        } else {
                            size = landscape
                                ? PrintAttributes.MediaSize.ISO_A4.asLandscape()
                                : PrintAttributes.MediaSize.ISO_A4;
                        }
                        PrintAttributes attrs = new PrintAttributes.Builder()
                            .setMediaSize(size)
                            .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(name);
                        ZenPdfWriter.write(adapter, attrs, out, new ZenPdfWriter.Done() {
                            @Override
                            public void ok() {
                                pdfView = null;
                                JSObject ret = new JSObject();
                                ret.put("uri", Uri.fromFile(out).toString());
                                call.resolve(ret);
                            }

                            @Override
                            public void fail(String message) {
                                pdfView = null;
                                call.reject("تعذّر إنشاء PDF: " + message);
                            }
                        });
                    }, 400);
                }
            });
            pdfView = view;
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
