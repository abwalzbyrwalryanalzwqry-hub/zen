#!/usr/bin/env bash
# قياس الأداء على جهاز Android حقيقي موصول بـ adb (المرحلة 0 من خطة 1.17، docs/PERFORMANCE.md).
# الاستخدام: scripts/perf-device.sh [عدد مرات البدء البارد، الافتراضي 5]
# يطبع: زمن البدء البارد (am start -W)، وإحصاءات الإطارات (gfxinfo) بعد تمرير آلي، والذاكرة (meminfo).
set -euo pipefail
PKG=app.zen.quran
RUNS=${1:-5}
command -v adb >/dev/null || { echo "adb غير موجود"; exit 1; }
adb get-state >/dev/null || { echo "لا جهاز موصول"; exit 1; }
echo "الجهاز: $(adb shell getprop ro.product.model) · Android $(adb shell getprop ro.build.version.release) · ذاكرة $(adb shell cat /proc/meminfo | awk '/MemTotal/{printf "%.1fGB", $2/1048576}')"
echo "— البدء البارد (${RUNS} مرات):"
for i in $(seq 1 "$RUNS"); do
  adb shell am force-stop "$PKG"
  sleep 1
  adb shell am start -W -n "$PKG/.MainActivity" | awk -F: '/TotalTime/{gsub(/ /,"",$2); print "  " $2 "ms"}'
  sleep 3
done
echo "— التمرير: افتح السجل اليومي لحلقة كبيرة الآن ثم اضغط Enter"
read -r _
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
W=$(adb shell wm size | awk -F'[ x]' '{print $3}'); H=$(adb shell wm size | awk -F'[ x]' '{print $4}')
for i in $(seq 1 10); do adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/4)) 250; done
for i in $(seq 1 10); do adb shell input swipe $((W/2)) $((H/4)) $((W/2)) $((H*3/4)) 250; done
adb shell dumpsys gfxinfo "$PKG" | grep -E "Total frames|Janky frames|50th|90th|95th|99th" | sed 's/^/  /'
echo "— الذاكرة:"
adb shell dumpsys meminfo "$PKG" | grep -E "TOTAL PSS|TOTAL RSS|Native Heap|Graphics" | head -5 | sed 's/^/  /'
