import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, LocateFixed, Moon } from "lucide-react";
import { SettingRow, SettingsShell } from "@/components/zen/settings/SettingsShell";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { Switch } from "@/components/zen/more/Switch";
import { useMinuteClock, usePrayerSettings } from "@/hooks/usePrayerSettings";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import {
  CITIES,
  formatTime,
  METHODS,
  PRAYER_KEYS,
  prayerTimes,
  roundCoord,
  savePrayerSettings,
  type MethodKey,
  type PrayerSettings,
} from "@/lib/prayer";

export const Route = createFileRoute("/_authed/settings_/prayer")({
  head: () => ({ meta: [{ title: tStatic("meta.settingsPrayer") }] }),
  component: PrayerSettingsPage,
});

/** مواقيت الصلاة: تُحسب على الجهاز وتُحفظ فوراً عند كل تغيير. تعمل للضيف أيضاً. */
function PrayerSettingsPage() {
  const t = useT();
  const current = usePrayerSettings();
  const now = useMinuteClock();
  const [locating, setLocating] = useState(false);
  const myLocation = t("settings.prayer.myLocation");
  const s: PrayerSettings = current ?? {
    lat: CITIES[0].lat,
    lng: CITIES[0].lng,
    place: CITIES[0].name,
    method: "UmmAlQura",
    hanafiAsr: false,
  };
  const set = (patch: Partial<PrayerSettings>) => savePrayerSettings({ ...s, ...patch });

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.error(t("settings.prayer.noGeo"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({
          lat: roundCoord(pos.coords.latitude),
          lng: roundCoord(pos.coords.longitude),
          place: myLocation,
        });
      },
      () => {
        setLocating(false);
        toast.error(t("settings.prayer.geoDenied"));
      },
      { maximumAge: 3600_000, timeout: 15_000 },
    );
  };

  const times = prayerTimes(s, now);
  const cityValue = CITIES.find((c) => c.lat === s.lat && c.lng === s.lng)?.name ?? "";

  return (
    <SettingsShell title={t("settings.prayer.title")} fallback="/more">
      <SettingsSection id="prayer" variant="card" title={t("settings.prayer.title")}>
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-gold" aria-hidden="true" />
          <p className="flex-1 text-xs text-muted-foreground">{t("settings.prayer.local")}</p>
        </div>
        <label className="block text-xs text-muted-foreground space-y-1">
          <span className="block">{t("settings.prayer.city")}</span>
          <select
            value={cityValue}
            onChange={(e) => {
              const c = CITIES.find((x) => x.name === e.target.value);
              if (c) set({ lat: c.lat, lng: c.lng, place: c.name });
            }}
            className="w-full min-h-11 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground"
          >
            {!cityValue && <option value="">{s.place || myLocation}</option>}
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="w-full min-h-11 rounded-xl bg-muted/60 text-sm font-semibold text-foreground flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="w-4 h-4" aria-hidden="true" />
          )}
          {t("settings.prayer.locate")}
        </button>
        <label className="block text-xs text-muted-foreground space-y-1">
          <span className="block">{t("settings.prayer.method")}</span>
          <select
            value={s.method}
            onChange={(e) => set({ method: e.target.value as MethodKey })}
            className="w-full min-h-11 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground"
          >
            {METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {t(`settings.prayer.methods.${m.key}`)}
              </option>
            ))}
          </select>
        </label>
        <SettingRow
          id="zen-hanafi"
          label={t("settings.prayer.hanafi")}
          control={
            <Switch
              labelledBy="zen-hanafi"
              on={s.hanafiAsr}
              onChange={(v) => set({ hanafiAsr: v })}
            />
          }
        />
        <ol aria-label={t("settings.prayer.times")} className="grid grid-cols-5 gap-1 text-center">
          {PRAYER_KEYS.map((k) => (
            <li key={k} className="rounded-2xl bg-muted/50 py-2">
              <span className="block text-xs text-muted-foreground">
                {t(`settings.prayer.names.${k}`)}
              </span>
              <span className="block text-xs font-bold text-foreground">
                {formatTime(times[k])}
              </span>
            </li>
          ))}
        </ol>
        {!current && (
          <button
            type="button"
            onClick={() => savePrayerSettings(s)}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
          >
            {t("settings.prayer.adopt", { place: s.place })}
          </button>
        )}
      </SettingsSection>
    </SettingsShell>
  );
}
