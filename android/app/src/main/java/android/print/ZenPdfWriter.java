package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.IOException;

/**
 * يكتب PrintDocumentAdapter (صفحة WebView) إلى ملف PDF مباشرة، بلا مربع الطباعة. يعيش في الحزمة
 * android.print لأن مُنشئَي LayoutResultCallback وWriteResultCallback مخفيان عن SDK خارجها (عامّان وقت
 * التشغيل). الناتج PDF نصّي حقيقي بخطوطه المضمّنة، لا صورة. يناديه ZenPrintPlugin.toPdf.
 */
public final class ZenPdfWriter {

    public interface Done {
        void ok();

        void fail(String message);
    }

    private ZenPdfWriter() {}

    public static void write(
        final PrintDocumentAdapter adapter,
        final PrintAttributes attrs,
        final File out,
        final Done done
    ) {
        adapter.onStart();
        adapter.onLayout(
            null,
            attrs,
            new CancellationSignal(),
            new PrintDocumentAdapter.LayoutResultCallback() {
                @Override
                public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                    final ParcelFileDescriptor fd;
                    try {
                        fd = ParcelFileDescriptor.open(
                            out,
                            ParcelFileDescriptor.MODE_CREATE |
                            ParcelFileDescriptor.MODE_TRUNCATE |
                            ParcelFileDescriptor.MODE_READ_WRITE
                        );
                    } catch (IOException e) {
                        adapter.onFinish();
                        done.fail(String.valueOf(e.getMessage()));
                        return;
                    }
                    adapter.onWrite(
                        new PageRange[] { PageRange.ALL_PAGES },
                        fd,
                        new CancellationSignal(),
                        new PrintDocumentAdapter.WriteResultCallback() {
                            @Override
                            public void onWriteFinished(PageRange[] pages) {
                                close(fd);
                                adapter.onFinish();
                                done.ok();
                            }

                            @Override
                            public void onWriteFailed(CharSequence error) {
                                close(fd);
                                adapter.onFinish();
                                done.fail(String.valueOf(error));
                            }

                            @Override
                            public void onWriteCancelled() {
                                close(fd);
                                adapter.onFinish();
                                done.fail("cancelled");
                            }
                        }
                    );
                }

                @Override
                public void onLayoutFailed(CharSequence error) {
                    adapter.onFinish();
                    done.fail(String.valueOf(error));
                }

                @Override
                public void onLayoutCancelled() {
                    adapter.onFinish();
                    done.fail("cancelled");
                }
            },
            null
        );
    }

    private static void close(ParcelFileDescriptor fd) {
        try {
            fd.close();
        } catch (IOException ignored) {
            // لا شيء
        }
    }
}
