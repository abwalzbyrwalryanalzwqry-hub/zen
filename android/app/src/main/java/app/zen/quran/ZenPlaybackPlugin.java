package app.zen.quran;

import android.content.Context;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** M14: جسر ZenPlaybackService إلى الواجهة (src/lib/native-playback.ts). */
@CapacitorPlugin(name = "ZenPlayback")
public class ZenPlaybackPlugin extends Plugin {

    @Override
    public void load() {
        ZenPlaybackService.listener = action -> {
            JSObject o = new JSObject();
            o.put("action", action);
            notifyListeners("action", o, true);
        };
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "");
        String subtitle = call.getString("subtitle", "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Context ctx = getContext();
        try {
            ZenPlaybackService running = ZenPlaybackService.instance;
            if (running != null) {
                running.apply(title, subtitle, playing);
            } else if (playing) {
                ContextCompat.startForegroundService(
                    ctx, ZenPlaybackService.updateIntent(ctx, title, subtitle, true));
            }
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("playback_service_unavailable", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        ZenPlaybackService running = ZenPlaybackService.instance;
        if (running != null) running.shutdown();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        ZenPlaybackService running = ZenPlaybackService.instance;
        if (running != null) running.shutdown();
        ZenPlaybackService.listener = null;
        super.handleOnDestroy();
    }
}
