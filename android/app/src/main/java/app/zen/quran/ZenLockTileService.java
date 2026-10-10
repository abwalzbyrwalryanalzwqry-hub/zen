package app.zen.quran;

import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * بلاطة «اقفل زِن» في الإعدادات السريعة (1.29.0): ضغطة واحدة تقفل التطبيق فوراً قبل إعطاء الهاتف لغيرك،
 * بلا فتح التطبيق. لا تفتح القفل أبداً، ولا تعمل إن لم يكن القفل مفعّلاً (تظهر غير متاحة).
 */
public class ZenLockTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        update();
    }

    @Override
    public void onClick() {
        super.onClick();
        ZenLockPlugin.lockFromOutside(this);
        update();
    }

    private void update() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean on = getSharedPreferences(ZenLockPlugin.PREFS, MODE_PRIVATE).getBoolean(ZenLockPlugin.K_ENABLED, false);
        boolean locked = ZenLockPlugin.lockedNow(this);
        t.setLabel(getString(R.string.lock_tile_label));
        t.setState(!on ? Tile.STATE_UNAVAILABLE : locked ? Tile.STATE_INACTIVE : Tile.STATE_ACTIVE);
        if (Build.VERSION.SDK_INT >= 29) {
            t.setSubtitle(getString(!on ? R.string.lock_tile_off : locked ? R.string.lock_tile_locked : R.string.lock_tile_unlocked));
        }
        t.updateTile();
    }

    /** يطلب من النظام تحديث البلاطة بعد تغيّر الحالة من داخل التطبيق. */
    static void refresh(Context ctx) {
        if (ctx == null) return;
        try {
            TileService.requestListeningState(ctx, new ComponentName(ctx, ZenLockTileService.class));
        } catch (Exception ignored) {
            // البلاطة غير مضافة: لا شيء.
        }
    }
}
