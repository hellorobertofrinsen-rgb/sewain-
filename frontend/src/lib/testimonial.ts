import type { Crop } from "@/src/components/CropEditor";

// Builds one shareable testimonial image (web canvas): unit photo on top, the
// tenant's photo and name, the cropped chat screenshots, and the agent's footer.
// Everything is drawn locally; nothing is uploaded.

export type TestimonialInput = {
  unitPhoto?: string | null; // object/data URL
  clientPhoto?: string | null;
  clientName: string;
  subtitle: string; // "Tenant · Unit A-12"
  heading: string; // "Kata tenant kami"
  shots: { uri: string; crop: Crop }[];
  agentName: string;
  agentLine: string; // agency · phone
  brand: string; // "via SewAIn"
};

const W = 1080;
const PAD = 56;
const BLUE = "#2457D6";
const BG = "#EEF3FC";
const INK = "#16181D";
const GREY = "#5B6270";
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw `img` so it covers the box (like CSS object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

export async function composeTestimonial(input: TestimonialInput): Promise<string> {
  const [unit, client, ...shots] = await Promise.all([
    input.unitPhoto ? loadImage(input.unitPhoto).catch(() => null) : Promise.resolve(null),
    input.clientPhoto ? loadImage(input.clientPhoto).catch(() => null) : Promise.resolve(null),
    ...input.shots.map((s) => loadImage(s.uri)),
  ]);

  // Layout pass: every screenshot fills the content width, capped so a tall crop
  // doesn't turn into a scroll.
  const inner = W - PAD * 2;
  const cardPad = 24;
  const shotBoxes = input.shots.map((s) => {
    const maxW = inner - cardPad * 2;
    const scale = Math.min(maxW / s.crop.w, 900 / s.crop.h, 3);
    return { w: s.crop.w * scale, h: s.crop.h * scale };
  });
  const heroH = unit ? 560 : 300;
  const avatar = 176;
  const headerH = avatar / 2 + 24 + 54 + 42 + 44; // below the hero edge: avatar half, name, subtitle, gap
  const headingH = 56;
  const shotsH = shotBoxes.reduce((a, b) => a + b.h + cardPad * 2 + 28, 0);
  const footerH = 190;
  const H = Math.round(heroH + headerH + headingH + shotsH + 24 + footerH);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Hero: unit photo, or a plain blue band with the unit name when there is none.
  if (unit) {
    drawCover(ctx, unit, 0, 0, W, heroH);
    const g = ctx.createLinearGradient(0, heroH - 200, 0, heroH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, heroH - 200, W, 200);
  } else {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, W, heroH);
  }

  // Tenant avatar straddling the hero edge.
  const cx = W / 2;
  const cy = heroH;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatar / 2 + 10, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(22,24,29,0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatar / 2, 0, Math.PI * 2);
  ctx.clip();
  if (client) drawCover(ctx, client, cx - avatar / 2, cy - avatar / 2, avatar, avatar);
  else {
    ctx.fillStyle = "#DCE6FB";
    ctx.fillRect(cx - avatar / 2, cy - avatar / 2, avatar, avatar);
    ctx.fillStyle = BLUE;
    ctx.font = `700 76px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((input.clientName.trim()[0] || "?").toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  let y = heroH + avatar / 2 + 24;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(fitText(ctx, input.clientName, inner), cx, y);
  y += 54;
  ctx.fillStyle = GREY;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(fitText(ctx, input.subtitle, inner), cx, y);
  y += 42 + 44;

  // Heading with a short rule on each side.
  ctx.fillStyle = BLUE;
  ctx.font = `700 28px ${FONT}`;
  const head = input.heading.toUpperCase();
  const hw = ctx.measureText(head).width;
  ctx.fillText(head, cx, y);
  ctx.fillRect(cx - hw / 2 - 72, y + 16, 48, 3);
  ctx.fillRect(cx + hw / 2 + 24, y + 16, 48, 3);
  y += headingH;

  // Screenshots, each in a white rounded card.
  shots.forEach((img, i) => {
    const box = shotBoxes[i];
    const crop = input.shots[i].crop;
    const cw = box.w + cardPad * 2;
    const ch = box.h + cardPad * 2;
    const x = (W - cw) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(22,24,29,0.08)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, cw, ch, 28);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x + cardPad, y + cardPad, box.w, box.h, 14);
    ctx.clip();
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, x + cardPad, y + cardPad, box.w, box.h);
    ctx.restore();
    y += ch + 28;
  });
  y += 24;

  // Footer: the agent.
  const fy = H - footerH;
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, fy, W, footerH);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(fitText(ctx, input.agentName, W - PAD * 2 - 220), PAD, fy + 48);
  if (input.agentLine) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = `500 29px ${FONT}`;
    ctx.fillText(fitText(ctx, input.agentLine, W - PAD * 2 - 220), PAD, fy + 102);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(input.brand, W - PAD, fy + footerH - 60);

  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
