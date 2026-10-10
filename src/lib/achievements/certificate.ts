import { localDayKey } from "@/lib/local-day";
import { juzOrdinal, type Certificate } from "./index";
import { saveFile } from "@/lib/native-file";
import { certQrPayload, formatVerifyCode } from "./verify";
import { AR_LATN } from "@/lib/i18n";

/** مصفوفة QR (من مكتبة qrcode) تُرسم مربعات على اللوحة. */
export type QrMatrix = { size: number; get: (row: number, col: number) => boolean | number };

/**
 * شهادة إتمام الجزء صورةً (PNG) تُرسم على canvas في المتصفح.
 * لا تُصدَر إلا للشهادة المعتمدة من المعلّم. لا نص قرآني في الشهادة.
 */

export const CERT_W = 1600;
export const CERT_H = 1130;

const GREEN = "#0f4d3a";
const GREEN_SOFT = "#2f6f5a";
const GOLD = "#b8903c";
const PAPER = "#fbf7ee";
const INK = "#1f2a24";

export type CertificateText = {
  title: string;
  lead: string;
  name: string;
  body: string;
  place: string | null;
  note: string | null;
  teacher: string;
  date: string;
  serial: string;
};

export function formatArabicDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  try {
    return new Intl.DateTimeFormat(AR_LATN, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return localDayKey(d);
  }
}

export function certificateText(c: Certificate): CertificateText {
  const place = [c.halaqa_name, c.center_name].filter(Boolean).join(" — ");
  return {
    title: "شهادة إتمام حفظ",
    lead: "يسرّنا أن نشهد بأن",
    name: c.student_name,
    body: `قد أتمّ بفضل الله حفظ الجزء ${juzOrdinal(c.juz)} من القرآن الكريم`,
    place: place || null,
    note: c.teacher_note,
    teacher: c.teacher_name ?? "المعلّم",
    date: formatArabicDate(c.decided_at),
    serial: c.serial,
  };
}

function frame(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CERT_W, CERT_H);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 18;
  ctx.strokeRect(40, 40, CERT_W - 80, CERT_H - 80);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.strokeRect(70, 70, CERT_W - 140, CERT_H - 140);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(84, 84, CERT_W - 168, CERT_H - 168);
  // زخرفة الأركان: معيّنات ذهبية.
  const corners: [number, number][] = [
    [84, 84],
    [CERT_W - 84, 84],
    [84, CERT_H - 84],
    [CERT_W - 84, CERT_H - 84],
  ];
  ctx.fillStyle = GOLD;
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.lineTo(x + 26, y);
    ctx.lineTo(x, y + 26);
    ctx.lineTo(x - 26, y);
    ctx.closePath();
    ctx.fill();
  }
}

function divider(ctx: CanvasRenderingContext2D, y: number) {
  const cx = CERT_W / 2;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 260, y);
  ctx.lineTo(cx - 24, y);
  ctx.moveTo(cx + 24, y);
  ctx.lineTo(cx + 260, y);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cx, y - 12);
  ctx.lineTo(cx + 12, y);
  ctx.lineTo(cx, y + 12);
  ctx.lineTo(cx - 12, y);
  ctx.closePath();
  ctx.fill();
}

/** يقصّ النص ليتّسع للعرض المتاح. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export function drawCertificate(
  canvas: HTMLCanvasElement,
  c: Certificate,
  font = "Zen Text",
  qr: QrMatrix | null = null,
) {
  const t = certificateText(c);
  canvas.width = CERT_W;
  canvas.height = CERT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("المتصفح لا يدعم الرسم.");
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const f = (w: number, size: number) => `${w} ${size}px "${font}", system-ui, sans-serif`;
  const cx = CERT_W / 2;
  const max = CERT_W - 320;

  frame(ctx);

  ctx.fillStyle = GOLD;
  ctx.font = f(700, 30);
  ctx.fillText("زِن · رفيقك في حفظ القرآن", cx, 160);

  ctx.fillStyle = GREEN;
  ctx.font = f(900, 92);
  ctx.fillText(t.title, cx, 270);
  divider(ctx, 350);

  ctx.fillStyle = INK;
  ctx.font = f(400, 40);
  ctx.fillText(t.lead, cx, 430);

  ctx.fillStyle = GREEN;
  ctx.font = f(900, 80);
  ctx.fillText(fit(ctx, t.name, max), cx, 525);

  ctx.fillStyle = INK;
  ctx.font = f(700, 42);
  ctx.fillText(fit(ctx, t.body, max), cx, 625);

  let y = 700;
  if (t.place) {
    ctx.fillStyle = GREEN_SOFT;
    ctx.font = f(400, 34);
    ctx.fillText(fit(ctx, t.place, max), cx, y);
    y += 60;
  }
  if (t.note) {
    ctx.fillStyle = GREEN_SOFT;
    ctx.font = f(400, 30);
    ctx.fillText(fit(ctx, `«${t.note}»`, max), cx, y);
  }

  // التوقيع والتاريخ.
  ctx.font = f(400, 28);
  ctx.fillStyle = GREEN_SOFT;
  ctx.fillText("المعلّم", CERT_W - 380, 880);
  ctx.fillText("التاريخ", 380, 880);
  ctx.fillStyle = INK;
  ctx.font = f(700, 34);
  ctx.fillText(fit(ctx, t.teacher, 420), CERT_W - 380, 930);
  ctx.fillText(t.date, 380, 930);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CERT_W - 560, 965);
  ctx.lineTo(CERT_W - 200, 965);
  ctx.moveTo(200, 965);
  ctx.lineTo(560, 965);
  ctx.stroke();

  // ختم دائري.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, 920, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, 920, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.font = f(900, 30);
  ctx.fillText("معتمدة", cx, 920);

  ctx.fillStyle = GREEN_SOFT;
  ctx.font = f(400, 22);
  ctx.fillText(
    c.verify_code
      ? `الرقم التسلسلي: ${t.serial} · رمز التحقق: ${formatVerifyCode(c.verify_code)}`
      : `الرقم التسلسلي: ${t.serial}`,
    cx,
    1030,
  );

  // QR التحقق في الزاوية العليا (10.2): يُمسح من «تحقّق من شهادة» في تطبيق زن.
  if (qr) {
    const box = 130;
    const x0 = 132;
    const y0 = 124;
    const cell = box / qr.size;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0 - 8, y0 - 8, box + 16, box + 16);
    ctx.fillStyle = INK;
    for (let r = 0; r < qr.size; r++)
      for (let col = 0; col < qr.size; col++)
        if (qr.get(r, col)) ctx.fillRect(x0 + col * cell, y0 + r * cell, cell + 0.5, cell + 0.5);
    ctx.fillStyle = GREEN_SOFT;
    ctx.font = f(400, 20);
    ctx.fillText("امسح للتحقق في تطبيق زن", x0 + box / 2, y0 + box + 30);
  }
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("تعذّر إنشاء الصورة."))), "image/png"),
  );
}

export async function certificateBlob(c: Certificate): Promise<Blob> {
  if (c.status !== "approved") throw new Error("الشهادة لم تُعتمد بعد.");
  try {
    await document.fonts?.load('900 80px "Zen Text"');
    await document.fonts?.load('400 40px "Zen Text"');
  } catch {
    /* يُكمَل بخط النظام */
  }
  let qr: QrMatrix | null = null;
  if (c.verify_code) {
    try {
      const QR = await import("qrcode");
      qr = QR.create(certQrPayload(c.verify_code), { errorCorrectionLevel: "M" }).modules;
    } catch {
      /* تُصدَر بالرمز النصي وحده */
    }
  }
  const canvas = document.createElement("canvas");
  drawCertificate(canvas, c, "Zen Text", qr);
  return toBlob(canvas);
}

export function certificateFileName(c: Pick<Certificate, "juz" | "serial">): string {
  return `zen-certificate-juz${c.juz}-${c.serial}.png`;
}

/** مشاركة عبر مربع المشاركة (الأصلي في تطبيق Android)، وإلا تنزيل الصورة. */
export async function shareCertificate(c: Certificate): Promise<"shared" | "downloaded"> {
  const blob = await certificateBlob(c);
  const r = await saveFile(certificateFileName(c), blob, { title: "شهادة إتمام حفظ" });
  return r === "downloaded" ? "downloaded" : "shared";
}
