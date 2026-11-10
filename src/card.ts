import {
  CanvasTexture,
  Color,
  DoubleSide,
  Entity,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  Shape,
  SRGBColorSpace,
  Vector3,
  World,
} from '@iwsdk/core';
import * as audio from './audio.js';
import { Card } from './components.js';
import type { Concept } from './deck.js';
import { drawTower } from './doodle.js';
import { THEME } from './theme.js';

export const CARD_W = 0.2;
export const CARD_H = 0.26;
/** A card resting at its spot (placed in the room) is drawn this much larger than the fan, so it still reads from across the room. */
export const PLACED_SCALE = 2.8;
const THICK = 0.006;
const CW = 640;
const CH = 832;
const PX = CARD_W / CW; // metres per canvas pixel
// Image window inside the pastel mat (canvas pixels).
const WIN = { x: 62, y: 62, w: 516, h: 430 };
const WIN_CY = (CH / 2 - (WIN.y + WIN.h / 2)) * PX;
const MARGIN = 64;
const CUT_W = WIN.w + 2 * MARGIN;
const CUT_H = WIN.h + 2 * MARGIN;
const DISPLAY = THEME.fontDisplay;
const BODY = THEME.fontBody;
const INK = THEME.ink;
const LW = 5; // ink outline width in card pixels
const REST_POP = 0.016; // how far the cutout floats in front of the image (metres)

const ease3 = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pastel = (i: number) => THEME.pastels[i % THEME.pastels.length];

// scratch objects, never allocated per frame
const _v = new Vector3();
const _q = new Quaternion();

/** Underdamped spring on purpose: everything overshoots a little. */
/** Seconds the card takes to fly from the focus view back to its spot. */
const FOCUS_RETURN = 0.55;

class Spring {
  x: number;
  v = 0;
  constructor(
    x: number,
    public k = 160,
    public c = 14,
  ) {
    this.x = x;
  }
  step(target: number, dt: number) {
    this.v += (this.k * (target - this.x) - this.c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function texture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].replace(/[ ,.;:]*$/, '') + '...';
  }
  return lines;
}

async function loadImg(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous'; // remote images must not taint the canvas
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 ? img : null;
  } catch {
    return null;
  }
}

/** Draw an image "cover" style into a rectangle. */
function cover(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}

function inkRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, lw = LW) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.stroke();
}

function drawFront(concept: Concept, index: number, img: HTMLImageElement | null, cut: HTMLImageElement | null) {
  const [c, g] = canvas(CW, CH);
  g.lineJoin = 'round';
  // paper card with an ink outline
  inkRect(g, LW / 2, LW / 2, CW - LW, CH - LW, 40, THEME.paper);
  // pastel mat
  inkRect(g, 28, 28, CW - 56, 500, 26, pastel(index));
  // image window with rounded corners and an ink outline
  g.save();
  g.beginPath();
  g.roundRect(WIN.x, WIN.y, WIN.w, WIN.h, 16);
  g.clip();
  if (img) {
    cover(g, img, WIN.x, WIN.y, WIN.w, WIN.h);
    if (cut) {
      // Dim the subject in the base image so the floating cutout reads as lifted out of it.
      const [tc, tg] = canvas(WIN.w, WIN.h);
      cover(tg, cut, 0, 0, WIN.w, WIN.h);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = 'rgba(43,42,51,0.35)';
      tg.fillRect(0, 0, WIN.w, WIN.h);
      g.drawImage(tc, WIN.x, WIN.y);
    }
  } else {
    g.fillStyle = THEME.paperDeep;
    g.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    g.fillStyle = INK;
    g.font = `700 240px ${DISPLAY}`;
    g.textAlign = 'center';
    g.fillText((concept.title[0] ?? '?').toLowerCase(), CW / 2, WIN.y + WIN.h * 0.75);
  }
  g.restore();
  inkRect(g, WIN.x, WIN.y, WIN.w, WIN.h, 16);

  // number, title, explanation
  const px = 44;
  const pw = CW - 88;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = `700 30px ${DISPLAY}`;
  const no = `#${index + 1}`;
  g.fillText(no, px, 584);
  const nw = g.measureText(no).width;
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.setLineDash([2, 9]);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(px + nw + 14, 575);
  g.lineTo(px + pw, 575);
  g.stroke();
  g.setLineDash([]);

  let size = 62;
  do g.font = `700 ${size}px ${DISPLAY}`;
  while (g.measureText(concept.title).width > pw && (size -= 2) >= 42);
  let title = [concept.title];
  if (g.measureText(concept.title).width > pw) {
    size = 50;
    g.font = `700 ${size}px ${DISPLAY}`;
    title = wrap(g, concept.title, pw, 2);
  }
  const lh = size * 1.04;
  const ty = 590 + 8 + size * 0.85;
  title.forEach((l, i) => g.fillText(l, px, ty + i * lh));

  const y0 = ty + (title.length - 1) * lh + 40;
  let ex = 40;
  let lines: string[];
  do {
    g.font = `500 ${ex}px ${BODY}`;
    lines = wrap(g, concept.explanation, pw, 9);
  } while (lines.length > 2 && (ex -= 1) >= 26);
  g.font = `500 ${ex}px ${BODY}`;
  lines = wrap(g, concept.explanation, pw, 2);
  g.fillStyle = THEME.inkSoft;
  lines.forEach((l, i) => g.fillText(l, px, y0 + i * (ex + 9)));
  return texture(c);
}

function drawBack(index: number) {
  const [c, g] = canvas(CW, CH);
  g.lineJoin = 'round';
  inkRect(g, LW / 2, LW / 2, CW - LW, CH - LW, 40, pastel(index));
  // inner dashed frame
  g.save();
  g.setLineDash([3, 14]);
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.beginPath();
  g.roundRect(30, 30, CW - 60, CH - 60, 26);
  g.stroke();
  g.restore();
  drawTower(g, CW / 2 - 95, 52, 190, THEME.paper); // large enough to still read as a tower from across the room
  // paper disk holding the number, the recall ring sits on it
  g.beginPath();
  g.arc(CW / 2, 480, 150, 0, Math.PI * 2);
  g.fillStyle = THEME.paper;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.font = `700 190px ${DISPLAY}`;
  g.fillText(`${index + 1}`, CW / 2, 480 + 190 * 0.35);
  g.font = `700 36px ${DISPLAY}`;
  g.fillText('loci', CW / 2, 760);
  return texture(c);
}

/** The cutout layer (as a sticker with an ink outline) and its flat contact shadow, cropped like the image window. */
function drawCutout(img: HTMLImageElement) {
  const [c, g] = canvas(CUT_W, CUT_H);
  const [sil, sg] = canvas(CUT_W, CUT_H);
  cover(sg, img, MARGIN, MARGIN, WIN.w, WIN.h);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = INK;
  sg.fillRect(0, 0, CUT_W, CUT_H);
  // sticker outline: the ink silhouette stamped around in a ring
  const R = 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.drawImage(sil, Math.cos(a) * R, Math.sin(a) * R);
  }
  cover(g, img, MARGIN, MARGIN, WIN.w, WIN.h);
  const [sc, shg] = canvas(CUT_W, CUT_H);
  shg.globalAlpha = 0.28;
  shg.drawImage(sil, 7, 12);
  return { fg: texture(c), shadow: texture(sc) };
}

const badgeTex: Partial<Record<'got' | 'missed', CanvasTexture>> = {};
/** Round pastel stamp with an ink check (mint) or cross (rose), drawn on the back after a recall answer. */
function badgeTexture(kind: 'got' | 'missed') {
  if (!badgeTex[kind]) {
    const [c, g] = canvas(128, 128);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = kind === 'got' ? THEME.mint : THEME.rose;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 11;
    g.beginPath();
    if (kind === 'got') {
      g.moveTo(36, 66);
      g.lineTo(56, 85);
      g.lineTo(93, 44);
    } else {
      g.moveTo(42, 42);
      g.lineTo(86, 86);
      g.moveTo(86, 42);
      g.lineTo(42, 86);
    }
    g.stroke();
    badgeTex[kind] = texture(c);
  }
  return badgeTex[kind]!;
}

let rimTex: CanvasTexture | null = null;
/** Thick ink outline that fades in over the card's thin one on hover and grab. */
function rimTexture() {
  if (!rimTex) {
    const [c, g] = canvas(CW, CH);
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 14;
    g.beginPath();
    g.roundRect(7, 7, CW - 14, CH - 14, 38);
    g.stroke();
    rimTex = texture(c);
  }
  return rimTex;
}

let rippleTex: CanvasTexture | null = null;
function rippleTexture() {
  if (!rippleTex) {
    const [c, g] = canvas(128, 128);
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    rippleTex = texture(c);
  }
  return rippleTex;
}

let shadowTex: CanvasTexture | null = null;
/** Flat offset shadow shape behind the card (hard edge, no blur). */
function shadowTexture() {
  if (!shadowTex) {
    const [c, g] = canvas(CW, CH);
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.roundRect(0, 0, CW, CH, 40);
    g.fill();
    shadowTex = texture(c);
  }
  return shadowTex;
}

function roundedShape(w: number, h: number, r: number) {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Called once when a dealt card finishes flying. */
export let onCardLand: ((root: Object3D) => void) | null = null;
export const setOnCardLand = (fn: (root: Object3D) => void) => (onCardLand = fn);

/** Visual state and animation of one card. The root object is owned by the grab system. */
export class CardView {
  readonly pivot = new Group();
  readonly shadow: Mesh;
  readonly front: MeshBasicMaterial;
  readonly back: MeshBasicMaterial;
  private readonly shadowMat: MeshBasicMaterial;
  private readonly ring: Mesh;
  private readonly ringCtx: CanvasRenderingContext2D;
  private readonly ringTex: CanvasTexture;
  private readonly rippleMat: MeshBasicMaterial;
  private readonly ripple: Mesh;
  private readonly badge: Mesh;
  private readonly badgeMat: MeshBasicMaterial;
  private readonly rimMat: MeshBasicMaterial;
  private readonly cut: { fg: Mesh; shadow: Mesh; fgMat: MeshBasicMaterial; shMat: MeshBasicMaterial } | null = null;
  private readonly seed = Math.random() * 10;
  private sScale = new Spring(1, 170, 13);
  private sFlip = new Spring(0, 120, 14);
  private sHover = new Spring(0, 130, 18);
  private sGrab = new Spring(0, 150, 15);
  private sPull = new Spring(0, 110, 15);
  private sSquish = new Spring(0, 420, 22);
  private sPop = new Spring(0, 150, 9);
  private sTiltX = new Spring(0, 120, 16);
  private sTiltY = new Spring(0, 120, 16);
  private sSway = new Spring(0, 90, 11);
  private sPitch = new Spring(0, 90, 11);
  private flipTo_ = 0;
  private flipStart = -1;
  private flipFrom = 0;
  private drawn = -1;
  private now = 0;
  private rippleStart = -9;
  private wasHover = false;
  private px = 0;
  private py = 0;
  private pz = 0;
  private hasPrev = false;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private popStart = -1;
  private pull = 0;
  faceBack = false;
  /** Set by the app while the card has a place in the room; it then eases up to PLACED_SCALE (and back to 1 while carried). */
  placed = false;
  private restS = 1;
  progress = 0;
  /** The card's world-locked pose. Once set, the root is pinned here every frame (except while held, flying or gliding). */
  readonly anchorP = new Vector3();
  readonly anchorQ = new Quaternion();
  anchored = false;
  /** Orientation the carried card eases toward (the placement preview), or null to keep what it had. */
  carryTarget: Quaternion | null = null;
  private readonly carryQ = new Quaternion();
  private wasHeld = false;
  private glide: { p0: Vector3; q0: Quaternion; p1: Vector3; q1: Quaternion; t0: number; dur: number } | null = null;
  readonly hint: Mesh;
  private readonly hintMat: MeshBasicMaterial;
  private sHint = new Spring(0, 140, 16);
  private hintOn = false;
  /** Focus view: the card flies from its world pose to this pose and scale, drawn over everything. The anchor is never touched. */
  focusOn = false;
  readonly focusP = new Vector3();
  readonly focusQ = new Quaternion();
  focusS = 1;
  private sFocus = new Spring(0, 110, 15);
  /** Return flight from the focus view: time-based ease-out (not the spring), so the card settles softly onto its wall spot. */
  private focusWas = false;
  private leaveT0 = -1;
  private leaveFrom = 0;
  private overlay: { mesh: Mesh; mat: MeshBasicMaterial; dt: boolean; dw: boolean; tr: boolean; ro: number }[] | null = null;
  fly: { from: Vector3; to: Vector3; start: number; dur: number; toQ?: Quaternion; q0?: Quaternion } | null = null;

  constructor(frontTex: CanvasTexture, backTex: CanvasTexture, cutout: { fg: CanvasTexture; shadow: CanvasTexture } | null) {
    const bs = 0.0015;
    // the card's thin edge is flat ink, so it reads as part of the outline when tilted
    const slab = new Mesh(
      new ExtrudeGeometry(roundedShape(CARD_W - 2 * bs, CARD_H - 2 * bs, 0.0125), {
        depth: THICK - 0.003,
        bevelEnabled: false,
        curveSegments: 10,
      }),
      new MeshBasicMaterial({ color: new Color(INK), toneMapped: false }),
    );
    slab.geometry.translate(0, 0, -(THICK - 0.003) / 2);
    const plane = new PlaneGeometry(CARD_W, CARD_H);
    const mat = (map: CanvasTexture) =>
      new MeshBasicMaterial({ map, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.front = mat(frontTex);
    this.back = mat(backTex);
    const zf = THICK / 2 + 0.0004;
    const frontMesh = new Mesh(plane, this.front);
    frontMesh.position.z = zf;
    const backMesh = new Mesh(plane, this.back);
    backMesh.position.z = -zf;
    backMesh.rotation.y = Math.PI;

    this.rimMat = new MeshBasicMaterial({
      map: rimTexture(),
      color: new Color(INK),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const rimF = new Mesh(plane, this.rimMat);
    rimF.position.z = zf + 0.0004;
    const rimB = new Mesh(plane, this.rimMat);
    rimB.position.z = -zf - 0.0004;
    rimB.rotation.y = Math.PI;

    this.rippleMat = new MeshBasicMaterial({
      map: rippleTexture(),
      color: new Color(INK),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.ripple = new Mesh(new PlaneGeometry(0.12, 0.12), this.rippleMat);
    this.ripple.position.z = zf + 0.0012;
    this.ripple.visible = false;

    const [rc, rg] = canvas(256, 256);
    this.ringCtx = rg;
    this.ringTex = texture(rc);
    this.ring = new Mesh(
      new PlaneGeometry(0.11, 0.11),
      new MeshBasicMaterial({
        map: this.ringTex,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    this.ring.position.set(0, (CH / 2 - 480) * PX, -zf - 0.0006);
    this.ring.rotation.y = Math.PI;
    this.ring.visible = false;

    // answer stamp, top right as seen from the back (the back mesh is turned half a revolution, so x is mirrored)
    this.badgeMat = new MeshBasicMaterial({ transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.badge = new Mesh(new PlaneGeometry(116 * PX, 116 * PX), this.badgeMat);
    this.badge.position.set(-(CW - 100 - CW / 2) * PX, (CH / 2 - 100) * PX, -zf - 0.0008);
    this.badge.rotation.y = Math.PI;
    this.badge.visible = false;
    this.badge.raycast = () => undefined;

    this.pivot.add(slab, frontMesh, backMesh, rimF, rimB, this.ripple, this.ring, this.badge);

    if (cutout) {
      const w = CUT_W * PX;
      const h = CUT_H * PX;
      const shMat = new MeshBasicMaterial({ map: cutout.shadow, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
      const shadow = new Mesh(new PlaneGeometry(w, h), shMat);
      shadow.position.set(0, WIN_CY, zf + 0.0008);
      const fgMat = new MeshBasicMaterial({ map: cutout.fg, transparent: true, depthWrite: false, toneMapped: false });
      const fg = new Mesh(new PlaneGeometry(w, h), fgMat);
      fg.position.set(0, WIN_CY, zf + REST_POP);
      fg.renderOrder = 2;
      shadow.raycast = fg.raycast = () => undefined;
      this.pivot.add(shadow, fg);
      this.cut = { fg, shadow, fgMat, shMat };
    }

    // "Come closer" pill above the card, shown while approaching in review
    const [hc, hg] = canvas(320, 80);
    hg.lineJoin = 'round';
    inkRect(hg, 3, 3, 314, 74, 37, THEME.paper, 5);
    hg.fillStyle = INK;
    hg.font = `700 38px ${DISPLAY}`;
    hg.textAlign = 'center';
    hg.textBaseline = 'middle';
    hg.fillText('Come closer', 160, 42);
    this.hintMat = new MeshBasicMaterial({ map: texture(hc), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide });
    this.hint = new Mesh(new PlaneGeometry(0.2, 0.05), this.hintMat);
    this.hint.position.set(0, CARD_H / 2 + 0.05, 0.008);
    this.hint.visible = false;
    this.hint.renderOrder = 3;
    this.hint.raycast = () => undefined;

    // flat hard offset shadow behind the card
    this.shadowMat = new MeshBasicMaterial({
      map: shadowTexture(),
      color: new Color(INK),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadow = new Mesh(new PlaneGeometry(CARD_W, CARD_H), this.shadowMat);
    this.shadow.position.z = -0.008;
    this.shadow.renderOrder = -1;
    this.shadow.raycast = () => undefined;
  }

  /** Draw the whole card over the world (no depth test) while it is in the focus view, and put it back after. */
  private setOverlay(root: Object3D, on: boolean) {
    if (on && !this.overlay) {
      this.overlay = [];
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const mat = m as MeshBasicMaterial;
          this.overlay!.push({ mesh, mat, dt: mat.depthTest, dw: mat.depthWrite, tr: mat.transparent, ro: mesh.renderOrder });
          mat.depthTest = false;
          mat.depthWrite = false;
          mat.transparent = true;
          mesh.renderOrder += 5000;
        }
      });
    } else if (!on && this.overlay) {
      for (const r of this.overlay) {
        r.mat.depthTest = r.dt;
        r.mat.depthWrite = r.dw;
        r.mat.transparent = r.tr;
        r.mesh.renderOrder = r.ro;
      }
      this.overlay = null;
    }
  }

  /** 0 at the world spot, 1 once it has arrived in the focus view. */
  get focusAmt() {
    return this.sFocus.x;
  }

  get focused() {
    return this.focusOn || !!this.overlay;
  }

  /** Pin the card to a world pose from now on. */
  lock(p: Vector3, q: Quaternion) {
    this.anchorP.copy(p);
    this.anchorQ.copy(q);
    this.anchored = true;
    this.glide = null;
  }

  /** Ease the root to a pose, then lock it there. */
  glideTo(root: Object3D, p: Vector3, q: Quaternion, now: number, dur = 0.16) {
    this.anchorP.copy(p);
    this.anchorQ.copy(q);
    this.anchored = true;
    this.glide = { p0: root.position.clone(), q0: root.quaternion.clone(), p1: p.clone(), q1: q.clone(), t0: now, dur };
  }

  setHint(on: boolean) {
    this.hintOn = on;
  }

  /** Flip to the back (true) or the front (false), with an optional delay. */
  flipTo(back: boolean, delay = 0) {
    this.faceBack = back;
    this.flipFrom = this.sFlip.x;
    this.flipTo_ = back ? Math.PI : 0;
    this.flipStart = this.now + delay;
    this.popStart = back ? -1 : this.flipStart + 0.28;
    if (back) this.setProgress(0);
    else this.sPop.x = 0; // the subject pops out of the frame after the flip lands
  }

  /** Check (got it) or cross (missed) on the back of the card, or null for none. */
  setBadge(kind: 'got' | 'missed' | null) {
    this.badge.visible = !!kind;
    if (kind) {
      this.badgeMat.map = badgeTexture(kind);
      this.badgeMat.needsUpdate = true;
    }
  }

  /** Snap to a face without animating. */
  setFace(back: boolean) {
    this.faceBack = back;
    this.sFlip.x = this.flipFrom = this.flipTo_ = back ? Math.PI : 0;
    this.sFlip.v = 0;
    this.flipStart = -1;
    this.popStart = -1;
  }

  /** Ease the card toward the viewer and enlarge it (used while a card is revealed). */
  setPull(on: boolean) {
    this.pull = on ? 1 : 0;
    if (on) this.sScale.v += 3.2; // pop
  }

  setDim(dim: boolean) {
    this.front.color.setScalar(dim ? 0.55 : 1);
    this.back.color.setScalar(dim ? 0.55 : 1);
    this.cut?.fgMat.color.setScalar(dim ? 0.55 : 1);
  }

  /** Quick squish with a ripple, for a press or poke. */
  press() {
    this.sSquish.x = 1;
    this.sSquish.v = 0;
    this.rippleStart = this.now;
  }

  /** A little settle impulse after release or landing. */
  thump(strength = 1) {
    this.sScale.v -= 2.4 * strength;
  }

  /** Ink "try to recall" ring on the back, 0..1. */
  setProgress(p: number) {
    this.progress = p;
    this.ring.visible = p > 0.001 && this.faceBack && !this.focused;
    // redrawn in 1/40 steps (a 256 px canvas upload each time), never per frame
    const q = Math.round(p * 40) / 40;
    if (q === this.drawn) return;
    this.drawn = q;
    p = q;
    const g = this.ringCtx;
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    g.lineWidth = 22;
    g.strokeStyle = 'rgba(43,42,51,0.12)';
    g.beginPath();
    g.arc(128, 128, 108, 0, Math.PI * 2);
    g.stroke();
    if (p > 0) {
      g.strokeStyle = INK;
      g.beginPath();
      g.arc(128, 128, 108, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.stroke();
    }
    this.ringTex.needsUpdate = true;
  }

  /** Per frame. `hand` is the nearest ray origin (world) or null. Nothing here allocates. */
  tick(root: Object3D, now: number, dt0: number, held: boolean, hovered: boolean, eye: Vector3, hand: Vector3 | null) {
    this.now = now;
    const dt = Math.min(dt0, 1 / 30);
    const f = this.fly;
    let flyE = 1;
    if (held && !this.wasHeld) this.carryQ.copy(root.quaternion);
    this.wasHeld = held;
    this.restS += ((this.placed && !held ? PLACED_SCALE : 1) - this.restS) * (1 - Math.exp(-dt * 7));
    const rs = this.restS;
    let fo: number;
    if (this.focusOn) {
      this.leaveT0 = -1;
      fo = this.sFocus.step(1, dt);
    } else {
      if (this.focusWas) {
        this.leaveT0 = now;
        this.leaveFrom = Math.min(1.05, Math.max(0, this.sFocus.x));
      }
      if (this.leaveT0 >= 0) {
        const u = clamp01((now - this.leaveT0) / FOCUS_RETURN);
        fo = this.leaveFrom * 0.5 * (1 + Math.cos(Math.PI * u)); // ease in-out: seen in perspective a plain ease-out looks like a snap, because the card is tiny on screen as soon as it is a metre away
        this.sFocus.x = fo;
        this.sFocus.v = 0;
        if (u >= 1) this.leaveT0 = -1;
      } else fo = this.sFocus.step(0, dt);
    }
    this.focusWas = this.focusOn;
    const focusing = this.anchored && (this.focusOn || Math.abs(fo) > 0.002 || Math.abs(this.sFocus.v) > 0.01);
    if (focusing) {
      this.setOverlay(root, true);
      const k = Math.min(1.05, Math.max(0, fo));
      root.position.lerpVectors(this.anchorP, this.focusP, k);
      root.position.y += Math.sin(Math.PI * Math.min(1, k)) * 0.04;
      root.quaternion.slerpQuaternions(this.anchorQ, this.focusQ, Math.min(1, k));
      root.scale.setScalar(rs + (this.focusS - rs) * k);
    } else if (this.overlay) {
      this.setOverlay(root, false);
      root.scale.setScalar(rs);
      root.position.copy(this.anchorP);
      root.quaternion.copy(this.anchorQ);
    } else if (held) {
      // carried: the grab moves the position, we ease the orientation toward the preview
      this.glide = null;
      if (this.carryTarget) this.carryQ.slerp(this.carryTarget, 1 - Math.exp(-dt * 12));
      root.quaternion.copy(this.carryQ);
      root.scale.setScalar(rs);
    } else if (f) {
      const t = clamp01((now - f.start) / f.dur);
      flyE = ease3(t);
      root.visible = now >= f.start;
      root.position.lerpVectors(f.from, f.to, flyE);
      root.position.y += Math.sin(Math.PI * t) * 0.1;
      if (f.toQ) {
        f.q0 ??= root.quaternion.clone();
        root.quaternion.slerpQuaternions(f.q0, f.toQ, flyE);
      }
      root.scale.setScalar(0.25 + 0.75 * flyE);
      if (t >= 1) {
        this.fly = null;
        root.scale.setScalar(rs);
        this.lock(f.to, f.toQ ?? root.quaternion);
        this.thump(1.2);
        onCardLand?.(root);
      }
    } else if (this.glide) {
      const g = this.glide;
      const t = clamp01((now - g.t0) / g.dur);
      const e = ease3(t);
      root.position.lerpVectors(g.p0, g.p1, e);
      root.quaternion.slerpQuaternions(g.q0, g.q1, e);
      root.scale.setScalar(rs);
      if (t >= 1) this.glide = null;
    } else if (this.anchored) {
      // world-locked: nothing may move the card but its own anchor
      root.position.copy(this.anchorP);
      root.quaternion.copy(this.anchorQ);
      root.scale.setScalar(rs);
    }
    const hint = this.sHint.step(this.hintOn ? 1 : 0, dt);
    this.hint.visible = hint > 0.01;
    this.hintMat.opacity = clamp01(hint);
    this.hint.scale.setScalar(0.85 + 0.15 * clamp01(hint));

    let lift = 0;
    if (this.flipStart >= 0 && now >= this.flipStart) {
      this.sFlip.step(this.flipTo_, dt);
      const span = Math.abs(this.flipTo_ - this.flipFrom) || 1;
      lift = Math.sin(Math.PI * clamp01(Math.abs(this.sFlip.x - this.flipFrom) / span));
      if (Math.abs(this.sFlip.x - this.flipTo_) < 0.002 && Math.abs(this.sFlip.v) < 0.02) {
        this.sFlip.x = this.flipTo_;
        this.sFlip.v = 0;
        this.flipStart = -1;
      }
    }
    const angle = this.sFlip.x;

    if (hovered && !this.wasHover) audio.hover();
    this.wasHover = hovered;
    const hov = this.sHover.step(hovered && !held ? 1 : 0, dt);
    const grab = this.sGrab.step(held ? 1 : 0, dt);
    const pull = this.sPull.step(this.pull, dt);
    const sq = this.sSquish.step(0, dt);

    // tilt toward the hand
    let tx = 0;
    let ty = 0;
    if (hovered && !held && hand && !this.faceBack) {
      _v.copy(hand);
      root.worldToLocal(_v);
      const lz = Math.max(0.15, Math.abs(_v.z));
      ty = clamp(Math.atan2(_v.x, lz) * 0.3, -0.09, 0.09);
      tx = clamp(-Math.atan2(_v.y, lz) * 0.3, -0.09, 0.09);
    }
    const tiltX = this.sTiltX.step(tx, dt);
    const tiltY = this.sTiltY.step(ty, dt);

    // carried: sway and lag from the root's own velocity
    if (held && this.hasPrev && dt0 > 0) {
      const k = 1 - Math.exp(-dt0 * 12);
      this.vx += ((root.position.x - this.px) / dt0 - this.vx) * k;
      this.vy += ((root.position.y - this.py) / dt0 - this.vy) * k;
      this.vz += ((root.position.z - this.pz) / dt0 - this.vz) * k;
    } else {
      this.vx *= 0.85;
      this.vy *= 0.85;
      this.vz *= 0.85;
    }
    this.px = root.position.x;
    this.py = root.position.y;
    this.pz = root.position.z;
    this.hasPrev = held;
    _v.set(this.vx, this.vy, this.vz).applyQuaternion(_q.copy(root.quaternion).invert());
    const sway = this.sSway.step(held ? clamp(-_v.x * 0.9, -0.35, 0.35) : 0, dt);
    const pitch = this.sPitch.step(held ? clamp(_v.y * 0.7, -0.25, 0.25) : 0, dt);

    const breathe = Math.sin(now * 1.4 + this.seed);
    const p = this.pivot;
    p.rotation.set(
      Math.sin(now * 1.1 + this.seed * 2) * 0.012 + tiltX + pitch,
      angle + tiltY,
      Math.sin(now * 0.9 + this.seed) * 0.015 + sway + (f ? (1 - flyE) * -Math.PI * 4 : 0),
    );
    p.position.set(
      -_v.x * 0.03 * grab,
      Math.sin(now * 1.3 + this.seed) * 0.005 + lift * 0.02 + grab * 0.012 - _v.y * 0.03 * grab,
      lift * 0.07 + pull * 0.26 + grab * 0.03 + hov * 0.012,
    );
    const target = 1 + pull * 0.36 + grab * 0.06 + hov * 0.03 + lift * 0.05 + breathe * 0.006;
    p.scale.setScalar(this.sScale.step(target, dt) * (1 - 0.04 * sq));

    // outline thickens on hover/grab; the flat shadow steps further away as the card lifts
    this.rimMat.opacity = clamp01(0.9 * hov + grab + 0.6 * pull);
    const off = 0.004 + 0.006 * hov + 0.012 * grab + 0.008 * pull;
    this.shadow.position.set(off, -off, -0.008);
    this.shadowMat.opacity = 0.14 + 0.04 * (grab + pull);

    const rt = (now - this.rippleStart) / 0.55;
    if (rt >= 0 && rt < 1) {
      this.ripple.visible = true;
      this.ripple.scale.setScalar(0.5 + 1.8 * ease3(rt));
      this.rippleMat.opacity = 0.8 * (1 - rt);
    } else this.ripple.visible = false;

    // 2.5D cutout layer
    const cut = this.cut;
    if (cut) {
      let target2 = 1;
      if (this.faceBack || this.fly || (this.flipStart >= 0 && this.popStart < 0)) target2 = 0;
      else if (this.popStart >= 0 && now < this.popStart) target2 = 0;
      const pop = this.sPop.step(target2, dt);
      _v.copy(eye);
      root.worldToLocal(_v);
      const dz = Math.max(0.2, _v.z);
      const ex = clamp(_v.x / dz, -0.9, 0.9);
      const ey = clamp((_v.y - WIN_CY) / dz, -0.9, 0.9);
      cut.fg.position.set(-ex * 0.01 * pop, WIN_CY - ey * 0.01 * pop + Math.sin(now * 1.6 + this.seed) * 0.0012 * pop, THICK / 2 + 0.0004 + 0.0012 + REST_POP * pop);
      cut.fg.scale.setScalar(1 + 0.07 * Math.max(0, pop));
      cut.shadow.position.set(ex * 0.004 * pop, WIN_CY + ey * 0.004 * pop - 0.0015 * pop, THICK / 2 + 0.0012);
      cut.shMat.opacity = clamp01(pop);
    }
  }
}

export const viewOf = (e: Entity) => e.object3D!.userData.view as CardView;

/** Build a card entity. Awaits the fonts, the concept image and the optional cutout. */
export async function createCard(
  world: World,
  concept: Concept,
  index: number,
  imageUrl: string,
  cutoutUrl: string | null,
): Promise<Entity> {
  await Promise.all([
    document.fonts.load(`700 62px "Bricolage Grotesque"`),
    document.fonts.load(`500 25px Figtree`),
  ]).catch(() => undefined);
  const [img, cut] = await Promise.all([loadImg(imageUrl), loadImg(cutoutUrl)]);
  const cutout = cut ? drawCutout(cut) : null;
  const view = new CardView(drawFront(concept, index, img, cut), drawBack(index), cutout);
  const root = new Group();
  root.add(view.shadow, view.pivot, view.hint);
  root.userData.view = view;
  root.userData.hasCutout = !!cutout;
  // Parented to the scene root (not the level), so nothing but the card's own anchor decides where it is.
  return world
    .createTransformEntity(root, { persistent: true })
    .addComponent(Card, { index, conceptId: concept.id })
    .addComponent(RayInteractable);
}
