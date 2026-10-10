/**
 * الزخارف والإطارات الهندسية الإسلامية مرسومة برمجياً (SVG متجه)، فتبقى حادة في PDF بأي دقة ولا تحتاج
 * صوراً مرفوعة: نجمة ثمانية، وردة، ميدالية، فاصل، ركنية، محراب، غصنا غار، مصحف مفتوح، ختم. الإطارات تُرسم
 * بوحدات المليمتر نفسها (viewBox = أبعاد العنصر) فتثبت سماكة الخطوط مهما تغيّر حجم الإطار.
 */
import type { FrameKind, OrnamentKind, PatternKind } from "./model";

const f = (n: number) => Math.round(n * 100) / 100;

/** نجمة ثمانية (مربعان متداخلان) مركزها (cx,cy) ونصف قطرها r. */
function star8(cx: number, cy: number, r: number, inner = 0.42): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * (1 - inner) + r * inner * 0.62;
    pts.push(`${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`);
  }
  return pts.join(" ");
}

function rosettePaths(cx: number, cy: number, r: number, petals: number): string {
  let d = "";
  for (let i = 0; i < petals; i++) {
    const a = ((Math.PI * 2) / petals) * i;
    const x = cx + r * 0.5 * Math.cos(a);
    const y = cy + r * 0.5 * Math.sin(a);
    d += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.5)}"/>`;
  }
  return d;
}

/** زخرفة في مربع 100×100 تُمدّ داخل العنصر محافظةً على نسبتها. */
export function ornamentSvg(kind: OrnamentKind, c1: string, c2: string): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
  let body = "";
  switch (kind) {
    case "star8":
      body = `<polygon points="${star8(50, 50, 48)}" fill="none" stroke="${c1}" stroke-width="2"/>
<polygon points="${star8(50, 50, 34)}" fill="${c2}" fill-opacity="0.12" stroke="${c2}" stroke-width="1.2"/>
<circle cx="50" cy="50" r="6" fill="${c1}"/>`;
      break;
    case "rosette":
      body = `<g fill="none" stroke="${c1}" stroke-width="1.1">${rosettePaths(50, 50, 44, 12)}</g>
<circle cx="50" cy="50" r="46" fill="none" stroke="${c2}" stroke-width="1.6"/>
<circle cx="50" cy="50" r="8" fill="${c2}"/>`;
      break;
    case "medallion": {
      let dots = "";
      for (let i = 0; i < 32; i++) {
        const a = ((Math.PI * 2) / 32) * i;
        dots += `<circle cx="${f(50 + 45 * Math.cos(a))}" cy="${f(50 + 45 * Math.sin(a))}" r="1.3"/>`;
      }
      body = `<g fill="${c1}">${dots}</g>
<circle cx="50" cy="50" r="40" fill="none" stroke="${c1}" stroke-width="1.6"/>
<circle cx="50" cy="50" r="36" fill="none" stroke="${c2}" stroke-width="0.8"/>
<polygon points="${star8(50, 50, 32)}" fill="${c2}" fill-opacity="0.14" stroke="${c1}" stroke-width="1.4"/>
<polygon points="${star8(50, 50, 16)}" fill="${c1}"/>`;
      break;
    }
    case "divider":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 20" preserveAspectRatio="none" width="100%" height="100%">
<path d="M0 10 L170 10" stroke="${c1}" stroke-width="1"/><path d="M230 10 L400 10" stroke="${c1}" stroke-width="1"/>
<path d="M150 10 L185 6 L200 0 L215 6 L250 10 L215 14 L200 20 L185 14 Z" fill="${c2}" fill-opacity="0.18" stroke="${c1}" stroke-width="1"/>
<circle cx="200" cy="10" r="3" fill="${c1}"/><circle cx="140" cy="10" r="1.6" fill="${c1}"/><circle cx="260" cy="10" r="1.6" fill="${c1}"/></svg>`;
    case "corner":
      body = `<g fill="none" stroke="${c1}" stroke-width="1.6" stroke-linecap="round">
<path d="M4 96 L4 20 Q4 4 20 4 L96 4"/><path d="M12 96 L12 26 Q12 12 26 12 L96 12" stroke="${c2}" stroke-width="0.9"/>
<path d="M20 40 Q20 20 40 20"/><path d="M28 60 Q28 28 60 28" stroke="${c2}" stroke-width="0.9"/></g>
<polygon points="${star8(20, 20, 9)}" fill="${c2}"/>`;
      break;
    case "arch":
      body = `<g fill="none" stroke="${c1}" stroke-width="1.6"><path d="M10 98 L10 45 Q10 15 50 3 Q90 15 90 45 L90 98"/>
<path d="M18 98 L18 47 Q18 22 50 11 Q82 22 82 47 L82 98" stroke="${c2}" stroke-width="0.9"/></g>
<polygon points="${star8(50, 34, 8)}" fill="${c2}"/>`;
      break;
    case "laurel": {
      let leaves = "";
      for (let i = 0; i < 7; i++) {
        const y = 86 - i * 11;
        const x = 26 + i * 1.8;
        leaves += `<ellipse cx="${f(x - 6)}" cy="${f(y)}" rx="7" ry="2.8" transform="rotate(-35 ${f(x - 6)} ${f(y)})"/>`;
        leaves += `<ellipse cx="${f(100 - x + 6)}" cy="${f(y)}" rx="7" ry="2.8" transform="rotate(35 ${f(100 - x + 6)} ${f(y)})"/>`;
      }
      body = `<g fill="${c1}" fill-opacity="0.85">${leaves}</g>
<path d="M30 94 Q16 60 32 14 M70 94 Q84 60 68 14" fill="none" stroke="${c2}" stroke-width="1.2"/>`;
      break;
    }
    case "book":
      body = `<g fill="none" stroke="${c1}" stroke-width="1.6" stroke-linejoin="round">
<path d="M50 30 Q30 20 8 24 L8 78 Q30 74 50 84 Q70 74 92 78 L92 24 Q70 20 50 30 Z"/><path d="M50 30 L50 84"/>
<path d="M16 34 Q32 31 44 37 M16 46 Q32 43 44 49 M16 58 Q32 55 44 61 M56 37 Q68 31 84 34 M56 49 Q68 43 84 46 M56 61 Q68 55 84 58" stroke="${c2}" stroke-width="0.9"/></g>
<polygon points="${star8(50, 14, 7)}" fill="${c2}"/>`;
      break;
    case "seal": {
      let ticks = "";
      for (let i = 0; i < 48; i++) {
        const a = ((Math.PI * 2) / 48) * i;
        ticks += `<path d="M${f(50 + 44 * Math.cos(a))} ${f(50 + 44 * Math.sin(a))} L${f(50 + 48 * Math.cos(a))} ${f(50 + 48 * Math.sin(a))}"/>`;
      }
      body = `<g stroke="${c1}" stroke-width="1">${ticks}</g>
<circle cx="50" cy="50" r="42" fill="${c2}" fill-opacity="0.08" stroke="${c1}" stroke-width="1.6"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="${c1}" stroke-width="0.8" stroke-dasharray="2 2"/>
<polygon points="${star8(50, 50, 22)}" fill="none" stroke="${c1}" stroke-width="1.4"/>`;
      break;
    }
    case "crescentStar":
      body = `<path d="M62 12 A40 40 0 1 0 62 88 A32 32 0 1 1 62 12 Z" fill="${c1}"/>
<polygon points="${star8(70, 50, 12)}" fill="${c2}"/>`;
      break;
  }
  return `${open}${body}</svg>`;
}

/** إطار بأبعاد العنصر (مم). t سماكة الخط الأساسي. uid يفرّق تعريفات SVG حين تجتمع شهادات في ملف. */
export function frameSvg(
  kind: FrameKind,
  w: number,
  h: number,
  c1: string,
  c2: string,
  t: number,
  uid: string,
): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none" width="100%" height="100%">`;
  const rect = (i: number, stroke: string, sw: number, extra = "") =>
    `<rect x="${f(i)}" y="${f(i)}" width="${f(Math.max(0, w - 2 * i))}" height="${f(Math.max(0, h - 2 * i))}" fill="none" stroke="${stroke}" stroke-width="${f(sw)}"${extra}/>`;
  const corners = (inset: number, size: number, color: string) =>
    [
      [inset, inset],
      [w - inset, inset],
      [inset, h - inset],
      [w - inset, h - inset],
    ]
      .map(([x, y]) => `<polygon points="${star8(x, y, size)}" fill="${color}"/>`)
      .join("");
  const half = t / 2;
  switch (kind) {
    case "minimal":
      return `${open}${rect(half, c1, t * 0.5)}</svg>`;
    case "double":
      return `${open}${rect(half, c1, t)}${rect(t * 3, c1, t * 0.5)}${corners(t * 3, t * 2.2, c2)}</svg>`;
    case "classic":
      return `${open}${rect(half, c1, t)}${rect(t * 2.6, c2, t * 0.35)}${rect(t * 3.6, c2, t * 0.2)}</svg>`;
    case "corners": {
      const L = Math.min(w, h) * 0.16;
      const p = (x: number, y: number, dx: number, dy: number) =>
        `<path d="M${f(x)} ${f(y + dy * L)} L${f(x)} ${f(y)} L${f(x + dx * L)} ${f(y)}" fill="none" stroke="${c1}" stroke-width="${f(t)}" stroke-linecap="square"/>
<path d="M${f(x + dx * t * 2.4)} ${f(y + dy * L * 0.7)} L${f(x + dx * t * 2.4)} ${f(y + dy * t * 2.4)} L${f(x + dx * L * 0.7)} ${f(y + dy * t * 2.4)}" fill="none" stroke="${c2}" stroke-width="${f(t * 0.4)}"/>`;
      return `${open}${p(half, half, 1, 1)}${p(w - half, half, -1, 1)}${p(half, h - half, 1, -1)}${p(w - half, h - half, -1, -1)}${corners(t * 5, t * 1.6, c2)}</svg>`;
    }
    case "islamic": {
      const band = t * 5;
      const s = band * 0.9;
      const pat = `<pattern id="isl-${uid}" width="${f(s)}" height="${f(s)}" patternUnits="userSpaceOnUse">
<polygon points="${star8(s / 2, s / 2, s * 0.42)}" fill="none" stroke="${c2}" stroke-width="${f(t * 0.22)}"/></pattern>`;
      const inner = `M${f(band)} ${f(band)} H${f(w - band)} V${f(h - band)} H${f(band)} Z`;
      const outer = `M0 0 H${f(w)} V${f(h)} H0 Z`;
      return `${open}<defs>${pat}</defs><path d="${outer} ${inner}" fill-rule="evenodd" fill="url(#isl-${uid})"/>
${rect(half, c1, t)}${rect(band, c1, t * 0.6)}${rect(band + t * 1.6, c2, t * 0.25)}${corners(band / 2, band * 0.75, c1)}</svg>`;
    }
    case "royal": {
      const band = t * 4;
      const inner = `M${f(band)} ${f(band)} H${f(w - band)} V${f(h - band)} H${f(band)} Z`;
      const outer = `M0 0 H${f(w)} V${f(h)} H0 Z`;
      return `${open}<path d="${outer} ${inner}" fill-rule="evenodd" fill="${c1}"/>
${rect(band * 0.5, c2, t * 0.3, ' stroke-dasharray="0.6 0.9"')}${rect(band + t, c2, t * 0.45)}${rect(band + t * 2.2, c2, t * 0.2)}
${corners(band / 2, band * 0.9, c2)}</svg>`;
    }
    case "gold": {
      const g = `<linearGradient id="gold-${uid}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c2}"/><stop offset="0.5" stop-color="#e9d8a6"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
      return `${open}<defs>${g}</defs>${rect(half, `url(#gold-${uid})`, t)}${rect(t * 2.4, `url(#gold-${uid})`, t * 0.45)}
${rect(t * 3.4, c1, t * 0.18)}${corners(t * 2.4, t * 2.6, `url(#gold-${uid})`)}</svg>`;
    }
  }
}

/** نقش خلفية الصفحة (شفافية خفيفة) مكرّر على الورقة كلها. */
export function patternSvg(
  kind: PatternKind,
  w: number,
  h: number,
  c: string,
  opacity: number,
  uid: string,
): string {
  if (kind === "none") return "";
  const s = kind === "dots" ? 6 : 14;
  let tile: string;
  if (kind === "girih")
    tile = `<polygon points="${star8(s / 2, s / 2, s * 0.46)}" fill="none" stroke="${c}" stroke-width="0.25"/>
<polygon points="${star8(0, 0, s * 0.2)}" fill="none" stroke="${c}" stroke-width="0.2"/>
<polygon points="${star8(s, s, s * 0.2)}" fill="none" stroke="${c}" stroke-width="0.2"/>`;
  else if (kind === "stars")
    tile = `<polygon points="${star8(s / 2, s / 2, s * 0.22)}" fill="${c}"/>`;
  else if (kind === "lattice")
    tile = `<path d="M0 ${s / 2} L${s / 2} 0 L${s} ${s / 2} L${s / 2} ${s} Z" fill="none" stroke="${c}" stroke-width="0.25"/>`;
  else tile = `<circle cx="${s / 2}" cy="${s / 2}" r="0.45" fill="${c}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="100%" height="100%" preserveAspectRatio="none" style="opacity:${f(opacity)}">
<defs><pattern id="pat-${uid}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>
<rect width="100%" height="100%" fill="url(#pat-${uid})"/></svg>`;
}
