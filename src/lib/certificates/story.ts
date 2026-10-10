/**
 * قالب «القصة» للشهادات (1.20.0، المرحلة 4.6): صورة 1080×1920 بمقاس قصص واتساب وإنستغرام، مع QR للتحقق،
 * وإخفاء الاسم الكامل اختيارياً (الافتراضي الاسم الأول وحده: كثير ممن يشاركون قاصرون، والقرار لوليّ الأمر).
 * الرسم على canvas؛ النصوص تأتي مترجمة من المكوّن (StoryShare.tsx)، والمنطق الصافي مختبَر في story.test.ts.
 */
export const STORY_W = 1080;
export const STORY_H = 1920;

const GREEN = "#0f4d3a";
const GREEN_DEEP = "#0a3729";
const GOLD = "#d4b06a";
const PAPER = "#fbf7ee";

export type StoryInput = {
  /** العنوان الكبير: «شهادة إتمام حفظ» أو اسم نوع الشهادة. */
  title: string;
  lead: string;
  /** الاسم كما يُعرض (بعد storyName). */
  name: string;
  body: string;
  place: string | null;
  date: string | null;
  serial: string | null;
  /** رمز التحقق المنسّق للقراءة، وسطر «امسح للتحقق». */
  verifyCode: string | null;
  scanHint: string;
  brand: string;
};

/** مصفوفة QR (من مكتبة qrcode). */
export type StoryQr = { size: number; get: (row: number, col: number) => boolean | number };

/** الاسم الأول وحده حين يُخفى الاسم الكامل؛ «عبد» و«أبو» تُضمّ لما بعدها («عبد الله»). */
export function storyName(full: string, hideFull: boolean): string {
  const clean = full.trim().replace(/\s+/g, " ");
  if (!hideFull) return clean;
  const parts = clean.split(" ");
  if (parts.length > 1 && /^(عبد|أبو|ابو|أم|ام)$/.test(parts[0])) return `${parts[0]} ${parts[1]}`;
  return parts[0] ?? clean;
}

/** يقسم النص إلى أسطر لا تتجاوز العرض، بحدّ أقصى للأسطر (الأخير يُقصّ بـ«…»). */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  max: number,
  maxLines = 3,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && measure(`${last}…`) > max) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export function drawStory(
  canvas: HTMLCanvasElement,
  s: StoryInput,
  qr: StoryQr | null,
  font = "Zen Text",
) {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const f = (w: number, size: number) => `${w} ${size}px "${font}", system-ui, sans-serif`;
  const cx = STORY_W / 2;
  const max = STORY_W - 200;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // الخلفية: تدرّج أخضر وإطار ذهبي، وبطاقة ورقية في الوسط.
  const g = ctx.createLinearGradient(0, 0, 0, STORY_H);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, STORY_W - 96, STORY_H - 96);

  ctx.fillStyle = GOLD;
  ctx.font = f(700, 40);
  ctx.fillText(s.brand, cx, 170);

  const cardY = 260;
  const cardH = 1000;
  ctx.fillStyle = PAPER;
  roundRect(ctx, 90, cardY, STORY_W - 180, cardH, 48);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  roundRect(ctx, 112, cardY + 22, STORY_W - 224, cardH - 44, 36);
  ctx.stroke();

  let y = cardY + 150;
  ctx.fillStyle = GREEN;
  ctx.font = f(900, 76);
  for (const line of wrapLines((x) => ctx.measureText(x).width, s.title, max - 80, 2)) {
    ctx.fillText(line, cx, y);
    y += 92;
  }
  y += 20;
  ctx.fillStyle = "#3d4a43";
  ctx.font = f(400, 44);
  ctx.fillText(s.lead, cx, y);
  y += 130;
  ctx.fillStyle = GREEN;
  ctx.font = f(900, 104);
  for (const line of wrapLines((x) => ctx.measureText(x).width, s.name, max - 80, 2)) {
    ctx.fillText(line, cx, y);
    y += 120;
  }
  y += 30;
  ctx.fillStyle = "#1f2a24";
  ctx.font = f(700, 48);
  for (const line of wrapLines((x) => ctx.measureText(x).width, s.body, max - 80, 3)) {
    ctx.fillText(line, cx, y);
    y += 66;
  }
  if (s.place) {
    y += 20;
    ctx.fillStyle = "#2f6f5a";
    ctx.font = f(400, 40);
    for (const line of wrapLines((x) => ctx.measureText(x).width, s.place, max - 80, 2)) {
      ctx.fillText(line, cx, y);
      y += 54;
    }
  }
  if (s.date) {
    ctx.fillStyle = "#2f6f5a";
    ctx.font = f(400, 36);
    ctx.fillText(s.date, cx, cardY + cardH - 90);
  }

  // QR التحقق أسفل البطاقة.
  const box = 280;
  const qy = cardY + cardH + 80;
  if (qr) {
    const x0 = cx - box / 2;
    const cell = box / qr.size;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x0 - 24, qy - 24, box + 48, box + 48, 24);
    ctx.fill();
    ctx.fillStyle = "#1d2a24";
    for (let r = 0; r < qr.size; r++)
      for (let c = 0; c < qr.size; c++)
        if (qr.get(r, c)) ctx.fillRect(x0 + c * cell, qy + r * cell, cell + 0.5, cell + 0.5);
    ctx.fillStyle = PAPER;
    ctx.font = f(400, 34);
    ctx.fillText(s.scanHint, cx, qy + box + 64);
  }
  ctx.fillStyle = GOLD;
  ctx.font = f(400, 30);
  const tail = [s.verifyCode, s.serial].filter(Boolean).join(" · ");
  if (tail) {
    ctx.save();
    ctx.direction = "ltr";
    ctx.fillText(tail, cx, qr ? qy + box + 120 : qy + 40);
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** مصفوفة QR للحمولة، أو null إن تعذّر (تُرسم القصة بالرمز النصي وحده). */
export async function storyQr(payload: string | null): Promise<StoryQr | null> {
  if (!payload) return null;
  try {
    const QR = await import("qrcode");
    return QR.create(payload, { errorCorrectionLevel: "M" }).modules;
  } catch {
    return null;
  }
}

export async function loadStoryFonts() {
  try {
    await document.fonts?.load('900 104px "Zen Text"');
    await document.fonts?.load('400 44px "Zen Text"');
  } catch {
    /* خط النظام */
  }
}
