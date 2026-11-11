import { THEME } from './theme.js';

type Pt = [number, number];
interface Stroke {
  pts: Pt[];
  len: number;
  start: number;
  fill?: string;
}

/** Deterministic wobble so every doodle looks hand drawn but identical between draws. */
function wob(i: number) {
  return Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 7.233) * 0.5;
}

function line(a: Pt, b: Pt, n = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = i === 0 || i === n ? 0 : wob(a[0] * 0.13 + b[1] * 0.07 + i);
    out.push([a[0] + (b[0] - a[0]) * t + w * 1.4, a[1] + (b[1] - a[1]) * t + w * 1.4]);
  }
  return out;
}

function poly(...p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length - 1; i++) out.push(...line(p[i], p[i + 1]).slice(i ? 1 : 0));
  return out;
}

function arch(cx: number, base: number, w: number, h: number): Pt[] {
  const pts: Pt[] = [[cx - w / 2, base]];
  pts.push([cx - w / 2, base - h + w / 2]);
  for (let i = 1; i < 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    pts.push([cx + Math.cos(a) * (w / 2), base - h + w / 2 + Math.sin(a) * (w / 2)]);
  }
  pts.push([cx + w / 2, base - h + w / 2], [cx + w / 2, base]);
  return pts;
}

function crenels(x0: number, x1: number, y: number, step: number, up: number): Pt[] {
  const pts: Pt[] = [[x0, y]];
  let x = x0;
  let hi = true;
  while (x < x1 - 0.1) {
    const nx = Math.min(x1, x + step);
    if (hi) pts.push([x, y - up], [nx, y - up]);
    else pts.push([x, y], [nx, y]);
    x = nx;
    hi = !hi;
    if (x < x1 - 0.1) pts.push([x, hi ? y : y - up]);
  }
  pts.push([x1, y]);
  return pts;
}

function build(strokes: { pts: Pt[]; fill?: string }[]): { list: Stroke[]; total: number } {
  let total = 0;
  const list = strokes.map((s) => {
    let len = 0;
    for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
    const o = { ...s, len, start: total };
    total += len;
    return o;
  });
  return { list, total };
}

// Castle in a 512 x 512 box, ground at y = 440.
const P = THEME.pastels;
const castle = build([
  { pts: poly([40, 442], [472, 442]) },
  // central keep
  { pts: [...poly([158, 442], [158, 262]), ...crenels(158, 354, 262, 28, 26).slice(1), ...poly([354, 262], [354, 442]).slice(1)], fill: THEME.butter },
  // left tower with cone roof
  { pts: poly([74, 442], [74, 214], [150, 214], [150, 442]), fill: THEME.sky },
  { pts: poly([62, 214], [112, 128], [162, 214], [62, 214]), fill: THEME.rose },
  // right tower
  { pts: poly([362, 442], [362, 214], [438, 214], [438, 442]), fill: THEME.sky },
  { pts: poly([350, 214], [400, 128], [450, 214], [350, 214]), fill: THEME.rose },
  // flags
  { pts: poly([112, 128], [112, 84]) },
  { pts: poly([112, 84], [148, 96], [112, 108]), fill: THEME.mint },
  { pts: poly([400, 128], [400, 84]) },
  { pts: poly([400, 84], [436, 96], [400, 108]), fill: THEME.lilac },
  // gate and windows
  { pts: arch(256, 442, 70, 96), fill: THEME.paperDeep },
  { pts: arch(112, 330, 26, 50) },
  { pts: arch(400, 330, 26, 50) },
  { pts: arch(256, 330, 24, 44) },
]);

function strokePath(g: CanvasRenderingContext2D, pts: Pt[], upTo = pts.length) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < upTo; i++) g.lineTo(pts[i][0], pts[i][1]);
}

/**
 * Draw the castle into a 512 box scaled to `size`, drawing itself in as p goes 0..1:
 * ink strokes first, one after another, then the flat pastel fills.
 */
export function drawCastle(g: CanvasRenderingContext2D, x: number, y: number, size: number, p: number, lineW = THEME.line * 1.7) {
  g.save();
  g.translate(x, y);
  g.scale(size / 512, size / 512);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = lineW * (512 / size);
  const strokeP = Math.min(1, p / 0.8);
  const fillP = Math.max(0, (p - 0.75) / 0.25);
  if (fillP > 0) {
    g.globalAlpha = fillP;
    for (const s of castle.list) {
      if (!s.fill) continue;
      g.fillStyle = s.fill;
      strokePath(g, s.pts);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  g.strokeStyle = THEME.ink;
  const drawn = strokeP * castle.total;
  for (const s of castle.list) {
    const d = Math.min(s.len, Math.max(0, drawn - s.start));
    if (d <= 0) continue;
    g.setLineDash([d, 1e6]);
    strokePath(g, s.pts);
    g.stroke();
  }
  g.setLineDash([]);
  g.restore();
}

/** Gate centre in the castle's 0..1 box (for dealing cards out of it). */
export const CASTLE_GATE: Pt = [0.5, 0.82];

/** A small tower with a flag, drawn flat inside a box of `size` at (x, y). */
export function drawTower(g: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string) {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 3.2;
  g.strokeStyle = THEME.ink;
  g.fillStyle = fill;
  const body = [...poly([26, 98], [26, 38]), ...crenels(26, 74, 38, 16, 10).slice(1), ...poly([74, 38], [74, 98]).slice(1)];
  strokePath(g, body);
  g.fill();
  g.stroke();
  strokePath(g, poly([20, 98], [80, 98]));
  g.stroke();
  strokePath(g, arch(50, 98, 18, 30));
  g.fillStyle = THEME.paper;
  g.fill();
  g.stroke();
  strokePath(g, poly([50, 28], [50, 4]));
  g.stroke();
  strokePath(g, poly([50, 4], [72, 11], [50, 18]));
  g.fillStyle = THEME.paper;
  g.fill();
  g.stroke();
  g.restore();
}

/** Castle standing on a ground line, with the "loci" wordmark below it, in a 512 x 512 canvas. */
export function drawWordmark(g: CanvasRenderingContext2D) {
  g.clearRect(0, 0, 512, 512);
  drawCastle(g, 86, 0, 340, 1, 3.4);
  g.fillStyle = THEME.ink;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `700 128px ${THEME.fontDisplay}`;
  g.fillText('loci', 256, 478);
}
