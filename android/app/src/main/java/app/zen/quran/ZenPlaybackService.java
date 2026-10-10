package app.zen.quran;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

/**
 * M14: خدمة أمامية (mediaPlayback) تُبقي التلاوة مستمرة حين تُطفأ الشاشة أو يُغلق التطبيق إلى الخلفية،
 * مع إشعار وشاشة قفل فيهما: السابق، تشغيل/إيقاف مؤقت، التالي.
 *
 * الصوت نفسه يبقى في WebView (عنصر الصوت الواحد في use-recitation-player.ts)؛ الخدمة لا تشغّل صوتاً،
 * بل ترفع أولوية العملية فلا يوقفها النظام، وتنقل ضغطات الإشعار إلى الواجهة عبر ZenPlaybackPlugin.
 * بلا مكتبات إضافية: MediaSession وNotification.MediaStyle من إطار أندرويد نفسه.
 */
public class ZenPlaybackService extends Service {

    static final String CHANNEL = "zen-playback";
    static final int NOTIFICATION_ID = 7301;
    static final String ACTION_UPDATE = "app.zen.quran.playback.UPDATE";
    static final String ACTION_PLAY = "app.zen.quran.playback.PLAY";
    static final String ACTION_PAUSE = "app.zen.quran.playback.PAUSE";
    static final String ACTION_NEXT = "app.zen.quran.playback.NEXT";
    static final String ACTION_PREV = "app.zen.quran.playback.PREV";
    static final String ACTION_STOP = "app.zen.quran.playback.STOP";

    interface Listener {
        void onAction(String action);
    }

    static volatile Listener listener;
    static volatile ZenPlaybackService instance;

    private MediaSession session;
    private String title = "";
    private String subtitle = "";
    private boolean playing = false;
    private boolean foreground = false;

    static Intent updateIntent(Context ctx, String title, String subtitle, boolean playing) {
        return new Intent(ctx, ZenPlaybackService.class)
            .setAction(ACTION_UPDATE)
            .putExtra("title", title)
            .putExtra("subtitle", subtitle)
            .putExtra("playing", playing);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        ensureChannel();
        session = new MediaSession(this, "ZenRecitation");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("prev"); }
            @Override public void onStop() { emit("stop"); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_UPDATE.equals(action)) {
            apply(
                intent.getStringExtra("title"),
                intent.getStringExtra("subtitle"),
                intent.getBooleanExtra("playing", false)
            );
        } else if (ACTION_PLAY.equals(action)) {
            emit("play");
        } else if (ACTION_PAUSE.equals(action)) {
            emit("pause");
        } else if (ACTION_NEXT.equals(action)) {
            emit("next");
        } else if (ACTION_PREV.equals(action)) {
            emit("prev");
        } else if (ACTION_STOP.equals(action)) {
            emit("stop");
            shutdown();
        } else if (!foreground) {
            // أُعيد إنشاؤها بلا أمر معروف: لا شيء يُعرض، فلا تبقى معلّقة.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** يحدّث الإشعار وحالة الجلسة؛ أمامية أثناء التشغيل، وقابلة للإزالة عند الإيقاف المؤقت. */
    void apply(String t, String s, boolean isPlaying) {
        title = t != null ? t : "";
        subtitle = s != null ? s : "";
        playing = isPlaying;
        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
            .build());
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
            | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());
        Notification n = build();
        try {
            if (playing) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, n);
                }
                foreground = true;
            } else {
                if (foreground) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        stopForeground(STOP_FOREGROUND_DETACH);
                    } else {
                        stopForeground(false);
                    }
                    foreground = false;
                }
                manager().notify(NOTIFICATION_ID, n);
            }
        } catch (RuntimeException e) {
            // أندرويد 12+ قد يرفض بدء الخدمة الأمامية من الخلفية؛ يبقى الإشعار عادياً والتلاوة كما هي.
            manager().notify(NOTIFICATION_ID, n);
        }
    }

    void shutdown() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        foreground = false;
        manager().cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private Notification build() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL)
            : new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        b.setSmallIcon(R.drawable.ic_stat_zen)
            .setColor(getColor(R.color.zen_notification))
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(playing)
            .setShowWhen(false)
            .setVisibility(ZenLockPlugin.privateNotifications(this)
                ? Notification.VISIBILITY_PRIVATE
                : Notification.VISIBILITY_PUBLIC)
            .setContentIntent(PendingIntent.getActivity(this, 0, open, flags()))
            .setDeleteIntent(service(ACTION_STOP, 5))
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, getString(R.string.playback_prev), service(ACTION_PREV, 1)).build())
            .addAction(playing
                ? new Notification.Action.Builder(
                    android.R.drawable.ic_media_pause, getString(R.string.playback_pause), service(ACTION_PAUSE, 2)).build()
                : new Notification.Action.Builder(
                    android.R.drawable.ic_media_play, getString(R.string.playback_play), service(ACTION_PLAY, 3)).build())
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, getString(R.string.playback_next), service(ACTION_NEXT, 4)).build())
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        if (ZenLockPlugin.privateNotifications(this)) {
            // قفل التطبيق 1.29.0 (M6): على شاشة قفل الجهاز يظهر «زِن — تلاوة جارية» بأدوات التحكم، لا اسم السورة.
            Notification.Builder pub = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
            pub.setSmallIcon(R.drawable.ic_stat_zen)
                .setColor(getColor(R.color.zen_notification))
                .setContentTitle(getString(R.string.playback_private_title))
                .setContentText(getString(R.string.playback_private_text))
                .setShowWhen(false);
            b.setPublicVersion(pub.build());
        }
        return b.build();
    }

    private PendingIntent service(String action, int code) {
        Intent i = new Intent(this, ZenPlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, i, flags());
    }

    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private NotificationManager manager() {
        return (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.playback_channel_desc));
        ch.setShowBadge(false);
        manager().createNotificationChannel(ch);
    }

    private static void emit(String action) {
        Listener l = listener;
        if (l != null) l.onAction(action);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // إغلاق التطبيق من قائمة التطبيقات الأخيرة يُنهي WebView ومعه الصوت؛ لا إشعار يتيم.
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
