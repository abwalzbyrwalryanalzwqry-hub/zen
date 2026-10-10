/**
 * قرار نهاية السحب في نصف الشاشة (src/components/ui/sheet.tsx)، منفصل ليُختبر بلا متصفح.
 * dy بالبكسل (موجب = لأسفل)، velocity بكسل/ملّي ثانية.
 */
export type SheetRelease = "close" | "expand" | "collapse" | "stay";

const DISTANCE = 80;
const FLICK = 0.5;

export function sheetRelease(o: {
  dy: number;
  velocity: number;
  expanded: boolean;
  snap: "half" | "auto";
}): SheetRelease {
  const down = o.dy > DISTANCE || o.velocity > FLICK;
  const up = o.dy < -DISTANCE / 2 || o.velocity < -FLICK;
  if (down) return o.snap === "half" && o.expanded && o.dy < DISTANCE * 2.5 ? "collapse" : "close";
  if (up && o.snap === "half" && !o.expanded) return "expand";
  return "stay";
}
