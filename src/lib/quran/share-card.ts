// ============================================================
// Zen — Quran Module
// Ayah share cards: canvas-rendered artwork + native sharing
// ------------------------------------------------------------
// Everything is drawn locally with the bundled Quran font, so a
// card can be produced and shared without any connection.
// ============================================================

import { toArabicDigits } from "./format";
export * from "./share-io";

export type ShareTheme = "night" | "emerald" | "light";
export type ShareSize = "square" | "story" | "post";

export const SHARE_THEMES: { key: ShareTheme; label: string }[] = [
  { key: "night", label: "ليلي" },
  { key: "emerald", label: "زمرّدي" },
  { key: "light", label: "فاتح" },
];

export const SHARE_SIZES: { key: ShareSize; label: string; w: number; h: number }[] = [
  { key: "square", label: "مربّع", w: 1080, h: 1080 },
  { key: "story", label: "ستوري", w: 1080, h: 1920 },
  { key: "post", label: "عريض", w: 1200, h: 675 },
];

export interface ShareCardInput {
  text: string;
  surahNameAr: string;
  ayahFrom: number;
  ayahTo: number;
  theme: ShareTheme;
  size: ShareSize;
  /** Optional short tafsir line under the ayah. */
  note?: string;
}

/* ألوان زِن: ليلي أخضر عميق (gradient-night)، زمردي من الأخضر الأساسي، وفاتح بورق زِن الدافئ. */
const PALETTE: Record<
  ShareTheme,
  { from: string; to: string; ink: string; muted: string; gold: string; frame: string }
> = {
  night: {
    from: "#0A1A14",
    to: "#153A2B",
    ink: "#F7F3EA",
    muted: "rgba(247,243,234,0.68)",
    gold: "#E3BD5B",
    frame: "rgba(227,189,91,0.55)",
  },
  emerald: {
    from: "#0F3B27",
    to: "#1F7A4D",
    ink: "#F7F3EA",
    muted: "rgba(247,243,234,0.72)",
    gold: "#F0D78C",
    frame: "rgba(240,215,140,0.55)",
  },
  light: {
    from: "#FCF8EF",
    to: "#F1E9D6",
    ink: "#173226",
    muted: "rgba(23,50,38,0.66)",
    gold: "#8A6412",
    frame: "rgba(138,100,18,0.5)",
  },
};

const QURAN_FONT = '"Amiri Quran", "Scheherazade New", serif';
const UI_FONT = '"Zen Text", "Noto Naskh Arabic", system-ui, sans-serif';

/** Makes sure the webfonts are ready before measuring or drawing. */
export async function ensureShareFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`400 64px ${QURAN_FONT}`, "بِسْمِ"),
      document.fonts.load(`500 32px ${UI_FONT}`, "زِن"),
      document.fonts.ready,
    ]);
  } catch {
    /* fall back to whatever is available */
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Decorative eight-point star, drawn as a light watermark. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a1 = (Math.PI / 4) * i;
    const a2 = a1 + Math.PI / 8;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const x2 = cx + Math.cos(a2) * r * 0.45;
    const y2 = cy + Math.sin(a2) * r * 0.45;
    if (i === 0) ctx.moveTo(x1, y1);
    else ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
  ctx.stroke();
}

function zenMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const hex = (radius: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.07);
  hex(r);
  hex(r * 0.58);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Draws the card onto a canvas at full resolution. */
export async function renderAyahCard(
  canvas: HTMLCanvasElement,
  input: ShareCardInput,
): Promise<void> {
  await ensureShareFonts();
  const spec = SHARE_SIZES.find((s) => s.key === input.size) ?? SHARE_SIZES[0];
  const { w, h } = spec;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تهيئة لوحة الرسم");
  const c = PALETTE[input.theme];

  // Background
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c.from);
  g.addColorStop(1, c.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Star watermarks
  ctx.save();
  ctx.strokeStyle = c.gold;
  ctx.globalAlpha = input.theme === "light" ? 0.1 : 0.14;
  ctx.lineWidth = 2;
  star(ctx, w * 0.12, h * 0.1, Math.min(w, h) * 0.2);
  star(ctx, w * 0.9, h * 0.92, Math.min(w, h) * 0.24);
  ctx.restore();

  // Double frame
  const pad = Math.round(Math.min(w, h) * 0.055);
  ctx.strokeStyle = c.frame;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(pad * 1.5, pad * 1.5, w - pad * 3, h - pad * 3);
  ctx.globalAlpha = 1;

  const contentWidth = w - pad * 4;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // ---- Layout budget -------------------------------------------------
  // The brand block sits at the bottom; everything else is laid out above
  // it so a long ayah can never collide with the footer.
  const markR = Math.min(w, h) * 0.035;
  const markY = h - pad * 2.1 - markR;
  const brandSize = Math.round(Math.min(w, h) * 0.03);
  const footerTop = markY - markR * 1.25;

  const refSize = Math.round(Math.min(w, h) * 0.032);
  const noteSize = Math.round(Math.min(w, h) * 0.026);
  const noteText = input.note?.trim() ?? "";

  // Ayah text — shrink until it fits the available height.
  let fontSize = Math.round(Math.min(w, h) * (input.size === "post" ? 0.062 : 0.072));
  let lines: string[] = [];
  let lineHeight = 0;
  let noteLines: string[] = [];

  const textTop = pad * 2.4;
  for (let i = 0; i < 40; i++) {
    ctx.font = `400 ${fontSize}px ${QURAN_FONT}`;
    lines = wrapLines(ctx, input.text, contentWidth);
    lineHeight = fontSize * 1.95;

    if (noteText) {
      ctx.font = `400 ${noteSize}px ${UI_FONT}`;
      noteLines = wrapLines(ctx, noteText, contentWidth * 0.92).slice(0, 3);
    } else {
      noteLines = [];
    }

    const tailHeight =
      Math.min(w, h) * 0.015 +
      refSize * 2.1 +
      (noteLines.length ? noteSize * 1.1 + noteLines.length * noteSize * 1.7 : 0);
    if (lines.length * lineHeight + tailHeight <= footerTop - textTop || fontSize <= 18) break;
    fontSize = Math.round(fontSize * 0.93);
  }

  const tailHeight =
    Math.min(w, h) * 0.015 +
    refSize * 2.1 +
    (noteLines.length ? noteSize * 1.1 + noteLines.length * noteSize * 1.7 : 0);
  const blockHeight = lines.length * lineHeight;
  const available = footerTop - textTop;
  let y = textTop + Math.max(0, (available - blockHeight - tailHeight) / 2) + lineHeight * 0.72;

  ctx.fillStyle = c.ink;
  ctx.font = `400 ${fontSize}px ${QURAN_FONT}`;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y, contentWidth);
    y += lineHeight;
  }

  // Ornamental divider
  const dividerY = y + Math.min(w, h) * 0.015;
  ctx.strokeStyle = c.gold;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.002);
  ctx.beginPath();
  ctx.moveTo(w / 2 - contentWidth * 0.18, dividerY);
  ctx.lineTo(w / 2 - Math.min(w, h) * 0.02, dividerY);
  ctx.moveTo(w / 2 + Math.min(w, h) * 0.02, dividerY);
  ctx.lineTo(w / 2 + contentWidth * 0.18, dividerY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(w / 2, dividerY, Math.min(w, h) * 0.006, 0, Math.PI * 2);
  ctx.fillStyle = c.gold;
  ctx.fill();

  // Reference line
  ctx.font = `500 ${refSize}px ${UI_FONT}`;
  ctx.fillStyle = c.gold;
  const ref =
    input.ayahFrom === input.ayahTo
      ? `سورة ${input.surahNameAr}، الآية ${toArabicDigits(input.ayahFrom)}`
      : `سورة ${input.surahNameAr}، الآيات ${toArabicDigits(input.ayahFrom)}-${toArabicDigits(input.ayahTo)}`;
  ctx.fillText(ref, w / 2, dividerY + refSize * 2.1, contentWidth);

  // Optional note
  if (noteLines.length) {
    ctx.font = `400 ${noteSize}px ${UI_FONT}`;
    ctx.fillStyle = c.muted;
    let ny = dividerY + refSize * 2.1 + noteSize * 2.4;
    for (const l of noteLines) {
      ctx.fillText(l, w / 2, ny, contentWidth);
      ny += noteSize * 1.7;
    }
  }

  // Brand footer
  zenMark(ctx, w / 2, markY, markR, c.gold);
  ctx.font = `500 ${brandSize}px ${UI_FONT}`;
  ctx.fillStyle = c.ink;
  ctx.fillText("زِن", w / 2, markY + markR * 1.9);
  ctx.font = `400 ${Math.round(brandSize * 0.72)}px ${UI_FONT}`;
  ctx.fillStyle = c.muted;
  ctx.fillText("نور يهديك في كل وقت", w / 2, markY + markR * 1.9 + brandSize * 1.25);
}

/* ---------- Milestone cards (11.4) ---------- */

/**
 * بطاقة إنجاز للمشاركة: «ختم جزء» و«سلسلة أيام». عنوان وسطر فقط، بلا درجات ولا اسم ولا
 * مقارنة، و«محاسبتي» خارجها دائماً (القاعدة 16). النص يُصاغ عند المستدعي.
 */
export interface MilestoneCardInput {
  /** سطر صغير فوق العنوان، مثل «إنجاز». */
  eyebrow: string;
  headline: string;
  sub: string;
  /** رقم كبير اختياري في الوسط (عدد الأيام أو رقم الجزء) بالأرقام العربية. */
  figure?: number;
  theme: ShareTheme;
  size: ShareSize;
}

export async function renderMilestoneCard(
  canvas: HTMLCanvasElement,
  input: MilestoneCardInput,
): Promise<void> {
  await ensureShareFonts();
  const spec = SHARE_SIZES.find((s) => s.key === input.size) ?? SHARE_SIZES[0];
  const { w, h } = spec;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تهيئة لوحة الرسم");
  const c = PALETTE[input.theme];
  const m = Math.min(w, h);

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c.from);
  g.addColorStop(1, c.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = c.gold;
  ctx.globalAlpha = input.theme === "light" ? 0.1 : 0.14;
  ctx.lineWidth = 2;
  star(ctx, w * 0.12, h * 0.1, m * 0.2);
  star(ctx, w * 0.9, h * 0.92, m * 0.24);
  ctx.restore();

  const pad = Math.round(m * 0.055);
  ctx.strokeStyle = c.frame;
  ctx.lineWidth = Math.max(2, m * 0.004);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(pad * 1.5, pad * 1.5, w - pad * 3, h - pad * 3);
  ctx.globalAlpha = 1;

  const contentWidth = w - pad * 4;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const markR = m * 0.035;
  const markY = h - pad * 3.2 - markR;
  const brandSize = Math.round(m * 0.03);
  const footerTop = markY - markR * 1.25;

  const eyebrowSize = Math.round(m * 0.034);
  const figureSize = Math.round(m * (input.size === "post" ? 0.2 : 0.26));
  let headSize = Math.round(m * 0.068);
  const subSize = Math.round(m * 0.032);
  let headLines: string[] = [];
  for (let i = 0; i < 20; i++) {
    ctx.font = `700 ${headSize}px ${UI_FONT}`;
    headLines = wrapLines(ctx, input.headline, contentWidth);
    if (headLines.length <= 2 || headSize <= 24) break;
    headSize = Math.round(headSize * 0.92);
  }
  const blocks =
    eyebrowSize * 2 +
    (input.figure != null ? figureSize * 1.15 : 0) +
    headLines.length * headSize * 1.45 +
    subSize * 2.2;
  const top = pad * 2.4;
  let y = top + Math.max(0, (footerTop - top - blocks) / 2) + eyebrowSize;

  ctx.font = `500 ${eyebrowSize}px ${UI_FONT}`;
  ctx.fillStyle = c.gold;
  ctx.fillText(input.eyebrow, w / 2, y, contentWidth);
  y += eyebrowSize * 1.2;

  if (input.figure != null) {
    y += figureSize * 0.95;
    ctx.font = `800 ${figureSize}px ${UI_FONT}`;
    ctx.fillStyle = c.gold;
    ctx.fillText(toArabicDigits(input.figure), w / 2, y, contentWidth);
    y += figureSize * 0.2;
  }

  ctx.font = `700 ${headSize}px ${UI_FONT}`;
  ctx.fillStyle = c.ink;
  for (const l of headLines) {
    y += headSize * 1.3;
    ctx.fillText(l, w / 2, y, contentWidth);
  }

  const dividerY = y + subSize * 1.1;
  ctx.strokeStyle = c.gold;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1.5, m * 0.002);
  ctx.beginPath();
  ctx.moveTo(w / 2 - contentWidth * 0.14, dividerY);
  ctx.lineTo(w / 2 + contentWidth * 0.14, dividerY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = `400 ${subSize}px ${UI_FONT}`;
  ctx.fillStyle = c.muted;
  ctx.fillText(input.sub, w / 2, dividerY + subSize * 1.9, contentWidth);

  zenMark(ctx, w / 2, markY, markR, c.gold);
  ctx.font = `500 ${brandSize}px ${UI_FONT}`;
  ctx.fillStyle = c.ink;
  ctx.fillText("زِن", w / 2, markY + markR * 1.9);
  ctx.font = `400 ${Math.round(brandSize * 0.72)}px ${UI_FONT}`;
  ctx.fillStyle = c.muted;
  ctx.fillText("نور يهديك في كل وقت", w / 2, markY + markR * 1.9 + brandSize * 1.25);
}

/* ---------- Text payload ---------- */
