import {
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  type Intersection,
  Box3,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector3,
  type World,
} from '@iwsdk/core';
import { CARD_H, CARD_W, PLACED_SCALE } from './card.js';
import { THEME } from './theme.js';

const THICK = 0.006;
const CHUNK = 48; // triangles per bounding box in the room's triangle soup
const _p = new Vector3();

interface Soup {
  box: Box3;
  v: Float32Array; // world-space triangles, 9 floats each
  chunks: Float32Array; // min xyz, max xyz per chunk of CHUNK triangles
  tris: number;
}

/** Ray (origin, inverse direction) against a box, only the part up to `max`. */
function rayBox(ox: number, oy: number, oz: number, ix: number, iy: number, iz: number, max: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  let t0 = 0;
  let t1 = max;
  let a = (x0 - ox) * ix;
  let b = (x1 - ox) * ix;
  if (a > b) [a, b] = [b, a];
  if (a > t0) t0 = a;
  if (b < t1) t1 = b;
  if (t0 > t1) return false;
  a = (y0 - oy) * iy;
  b = (y1 - oy) * iy;
  if (a > b) [a, b] = [b, a];
  if (a > t0) t0 = a;
  if (b < t1) t1 = b;
  if (t0 > t1) return false;
  a = (z0 - oz) * iz;
  b = (z1 - oz) * iz;
  if (a > b) [a, b] = [b, a];
  if (a > t0) t0 = a;
  if (b < t1) t1 = b;
  return t0 <= t1;
}

/** Moller-Trumbore, both faces. Distance along the (unit) direction, or -1. */
function rayTri(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-9 && det < 1e-9) return -1;
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const w = (dx * qx + dy * qy + dz * qz) * inv;
  if (w < 0 || u + w > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}
const _n = new Vector3();
const _hit: Intersection[] = [];

export type SurfaceKind = 'wall' | 'stand' | 'free';

export interface Placement {
  kind: SurfaceKind;
  p: Vector3;
  q: Quaternion;
  /** Contact point on the surface (stand and wall only). */
  at: Vector3;
  normal: Vector3;
}

export const makePlacement = (): Placement => ({
  kind: 'free',
  p: new Vector3(),
  q: new Quaternion(),
  at: new Vector3(),
  normal: new Vector3(0, 1, 0),
});

/**
 * Finds surfaces cards can snap to: any mesh with `userData.placeable === true` (the VR environments)
 * plus the real-world planes and meshes IWSDK scene understanding reports in passthrough.
 */
export class SurfaceFinder {
  private raycaster = new Raycaster();
  private meshes: Mesh[] = [];
  private mats: Material[] = [];
  private sides: number[] = [];
  private extra: Object3D[] = [];
  private seen = new Set<Object3D>();
  private boxes: Box3[] = []; // world bounds per candidate mesh: a ray segment that misses the box skips the mesh (no BVH)
  private seg = new Box3();
  private segP = new Vector3();
  private key = '';

  constructor(private world: World) {}

  /** Re-collect candidates. `extra` are objects from scene-understanding entities. Cheap enough to run about once a second. */
  refresh(extra: Iterable<Object3D | undefined>, signature = '') {
    // the candidate list only changes with the room or the scene-understanding set: skip the scene walk otherwise
    if (signature && signature === this.key) return;
    this.key = signature;
    this.meshes.length = 0;
    this.boxes.length = 0;
    this.mats.length = 0;
    this.sides.length = 0;
    this.seen.clear();
    const add = (o: Object3D) =>
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh || this.seen.has(m)) return;
        this.seen.add(m);
        this.meshes.push(m);
        this.boxes.push(worldBox(m));
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (!this.mats.includes(mat)) this.mats.push(mat);
        }
      });
    this.world.scene.traverse((o) => {
      if (o.userData?.placeable === true) add(o);
    });
    for (const o of extra) if (o) add(o);
  }

  // Every mesh of the active environment (placeable or not), used to find open space and decor in front of walls.
  // Rooms are static, so their triangles are copied once into world space and grouped in chunks of consecutive
  // triangles with a bounding box each (a flat BVH-free grid): a short ray only touches a few chunks.
  private envRoot: Object3D | null = null;
  private soups: Soup[] = [];
  private envOther: Mesh[] = []; // skinned / instanced meshes: the generic raycaster handles those
  private envOtherBoxes: Box3[] = [];
  private envMats: Material[] = [];
  private envSides: number[] = [];

  private buildEnv(root: Object3D) {
    this.envRoot = root;
    this.soups.length = 0;
    this.envOther.length = 0;
    this.envOtherBoxes.length = 0;
    this.envMats.length = 0;
    root.updateWorldMatrix(true, true);
    root.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      if (m.raycast !== Mesh.prototype.raycast && !(m as { isSkinnedMesh?: boolean }).isSkinnedMesh && !(m as { isInstancedMesh?: boolean }).isInstancedMesh) return; // light shafts and the like opt out of raycasts
      if ((m as { isSkinnedMesh?: boolean }).isSkinnedMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh) {
        this.envOther.push(m);
        this.envOtherBoxes.push(worldBox(m));
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!this.envMats.includes(mat)) this.envMats.push(mat);
        return;
      }
      const idx = g.index;
      const tris = Math.floor((idx ? idx.count : pos.count) / 3);
      const v = new Float32Array(tris * 9);
      for (let t = 0; t < tris; t++) {
        for (let k = 0; k < 3; k++) {
          _p.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(m.matrixWorld);
          v[t * 9 + k * 3] = _p.x;
          v[t * 9 + k * 3 + 1] = _p.y;
          v[t * 9 + k * 3 + 2] = _p.z;
        }
      }
      const nc = Math.ceil(tris / CHUNK);
      const chunks = new Float32Array(nc * 6);
      const box = new Box3();
      for (let c2 = 0; c2 < nc; c2++) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        const end = Math.min(tris, (c2 + 1) * CHUNK) * 9;
        for (let i = c2 * CHUNK * 9; i < end; i += 3) {
          const x = v[i], y = v[i + 1], z = v[i + 2];
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
        chunks.set([x0, y0, z0, x1, y1, z1], c2 * 6);
        box.min.min(_p.set(x0, y0, z0));
        box.max.max(_p.set(x1, y1, z1));
      }
      if (tris) this.soups.push({ box, v, chunks, tris });
    });
  }

  /** Distance to the nearest environment geometry along a ray, capped at max. Both faces count. Optionally writes the contact point and a normal facing the ray origin. */
  envClear(root: Object3D | null, origin: Vector3, dir: Vector3, max: number, outAt?: Vector3, outN?: Vector3): number {
    if (!root) return max;
    if (root !== this.envRoot) this.buildEnv(root);
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const ix = dx !== 0 ? 1 / dx : Infinity, iy = dy !== 0 ? 1 / dy : Infinity, iz = dz !== 0 ? 1 / dz : Infinity;
    let best = max;
    let bt = -1; // soup triangle that gave `best`
    let bs: Soup | null = null;
    for (const sp of this.soups) {
      const bx = sp.box;
      if (!rayBox(ox, oy, oz, ix, iy, iz, best, bx.min.x, bx.min.y, bx.min.z, bx.max.x, bx.max.y, bx.max.z)) continue;
      const ch = sp.chunks;
      for (let c = 0, nc = ch.length / 6; c < nc; c++) {
        const o = c * 6;
        if (!rayBox(ox, oy, oz, ix, iy, iz, best, ch[o], ch[o + 1], ch[o + 2], ch[o + 3], ch[o + 4], ch[o + 5])) continue;
        const end = Math.min(sp.tris, (c + 1) * CHUNK);
        for (let t = c * CHUNK; t < end; t++) {
          const k = t * 9;
          const v = sp.v;
          const t0 = rayTri(ox, oy, oz, dx, dy, dz, v[k], v[k + 1], v[k + 2], v[k + 3], v[k + 4], v[k + 5], v[k + 6], v[k + 7], v[k + 8]);
          if (t0 > 0 && t0 < best) [best, bt, bs] = [t0, t, sp];
        }
      }
    }
    if (outAt && outN && bs) {
      const v = bs.v;
      const k = bt * 9;
      outAt.set(ox + dx * best, oy + dy * best, oz + dz * best);
      _n.set(v[k + 3] - v[k], v[k + 4] - v[k + 1], v[k + 5] - v[k + 2]);
      outN.set(v[k + 6] - v[k], v[k + 7] - v[k + 1], v[k + 8] - v[k + 2]);
      outN.crossVectors(_n, outN).normalize();
      if (outN.dot(dir) > 0) outN.negate();
    }
    if (this.envOther.length) {
      this.raycaster.set(origin, dir);
      this.raycaster.near = 0;
      this.raycaster.far = best;
      this.segment(origin, dir, 0, best);
      for (let i = 0; i < this.envMats.length; i++) {
        this.envSides[i] = this.envMats[i].side;
        this.envMats[i].side = DoubleSide;
      }
      for (let k = 0; k < this.envOther.length; k++) {
        if (!this.envOtherBoxes[k].intersectsBox(this.seg)) continue;
        _hit.length = 0;
        this.raycaster.intersectObject(this.envOther[k], false, _hit);
        for (const h of _hit) {
          if (h.distance >= best) continue;
          best = h.distance;
          if (outAt && outN && h.face) {
            outAt.copy(h.point);
            outN.copy(h.face.normal).transformDirection(this.envOther[k].matrixWorld);
            if (outN.dot(dir) > 0) outN.negate();
          }
        }
      }
      for (let i = 0; i < this.envMats.length; i++) this.envMats[i].side = this.envSides[i] as typeof DoubleSide;
      _hit.length = 0;
    }
    return best;
  }

  /** Bounds of the ray segment [near, far], padded a little: meshes whose box misses it cannot be hit. */
  private segment(o: Vector3, d: Vector3, near: number, far: number) {
    this.seg.min.copy(o).addScaledVector(d, near);
    this.seg.max.copy(this.seg.min);
    this.segP.copy(o).addScaledVector(d, far);
    this.seg.expandByPoint(this.segP);
    this.seg.min.subScalar(0.02);
    this.seg.max.addScalar(0.02);
  }

  get count() {
    return this.meshes.length;
  }

  /**
   * Nearest surface along a ray whose distance lies in [min, max]. Back faces count (rooms are often one-sided meshes).
   * Writes the contact point and a normal facing the ray origin.
   */
  cast(origin: Vector3, dir: Vector3, min: number, max: number, outAt: Vector3, outN: Vector3): number {
    if (!this.meshes.length) return -1;
    this.raycaster.set(origin, dir);
    this.raycaster.near = Math.max(0, min);
    this.raycaster.far = max;
    for (let i = 0; i < this.mats.length; i++) {
      this.sides[i] = this.mats[i].side;
      this.mats[i].side = DoubleSide;
    }
    this.segment(origin, dir, Math.max(0, min), max);
    let best = -1;
    for (let k = 0; k < this.meshes.length; k++) {
      if (!this.boxes[k].intersectsBox(this.seg)) continue;
      const m = this.meshes[k];
      _hit.length = 0;
      this.raycaster.intersectObject(m, false, _hit);
      for (const h of _hit) {
        if (best >= 0 && h.distance >= best) continue;
        if (!h.face) continue;
        _n.copy(h.face.normal).transformDirection(m.matrixWorld);
        if (_n.dot(dir) > 0) _n.negate();
        best = h.distance;
        outAt.copy(h.point);
        outN.copy(_n);
      }
    }
    for (let i = 0; i < this.mats.length; i++) this.mats[i].side = this.sides[i] as typeof DoubleSide;
    _hit.length = 0;
    return best;
  }
}

const dummy = new Object3D();

/** World-space bounds of a mesh at this moment (rooms are static; scene-understanding meshes are re-collected when they change). */
function worldBox(m: Mesh): Box3 {
  m.updateWorldMatrix(true, false);
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  return new Box3().copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).expandByScalar(0.05); // padded: props may sway
}

/** Upright pose facing the head, yaw only. */
export function facingQuat(p: Vector3, head: Vector3, out: Quaternion) {
  dummy.position.copy(p);
  dummy.up.set(0, 1, 0);
  dummy.lookAt(head.x, p.y, head.z);
  return out.copy(dummy.quaternion);
}

/** Turn a surface contact into a card pose: flush and upright on a wall, standing and facing the user on a horizontal surface. */
export function poseOnSurface(at: Vector3, normal: Vector3, head: Vector3, out: Placement): boolean {
  out.at.copy(at);
  out.normal.copy(normal);
  if (normal.y > 0.75) {
    out.kind = 'stand';
    out.p.set(at.x, at.y + (CARD_H * PLACED_SCALE) / 2 + 0.002, at.z);
    facingQuat(out.p, head, out.q);
    return true;
  }
  if (Math.abs(normal.y) < 0.35) {
    out.kind = 'wall';
    _n.set(normal.x, 0, normal.z).normalize();
    out.p.copy(at).addScaledVector(_n, THICK / 2 + 0.004);
    dummy.position.copy(out.p);
    dummy.up.set(0, 1, 0);
    dummy.lookAt(out.p.x + _n.x, out.p.y, out.p.z + _n.z);
    out.q.copy(dummy.quaternion);
    return true;
  }
  return false;
}

function ghostTexture(fill: string) {
  const W = 320;
  const H = 416;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 16, 22);
  g.fillStyle = fill;
  g.fill();
  g.setLineDash([2, 14]);
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.strokeStyle = THEME.ink;
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function footTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = THEME.ink;
  g.globalAlpha = 0.18;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.setLineDash([2, 12]);
  g.lineCap = 'round';
  g.lineWidth = 5;
  g.strokeStyle = THEME.ink;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Flat pastel "ghost" of the card where it will land, with a footprint when it will stand on something. */
export function createGhost(world: World) {
  const mats = THEME.pastels.map(
    (h) =>
      new MeshBasicMaterial({
        map: ghostTexture(h),
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      }),
  );
  const card = new Mesh(new PlaneGeometry(CARD_W, CARD_H), mats[0]);
  card.renderOrder = 4;
  card.scale.setScalar(PLACED_SCALE);
  const foot = new Mesh(
    new CircleGeometry(0.075, 28),
    new MeshBasicMaterial({ map: footTexture(), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: DoubleSide }),
  );
  foot.rotation.x = -Math.PI / 2;
  foot.renderOrder = 4;
  card.raycast = foot.raycast = () => undefined;
  const root = new Object3D();
  root.visible = false;
  root.add(card);
  const footRoot = new Object3D();
  footRoot.visible = false;
  footRoot.add(foot);
  const ents = [world.createTransformEntity(root, { persistent: true }), world.createTransformEntity(footRoot, { persistent: true })];
  let shown = 0;
  return {
    /** Show the ghost for a snapped placement (index picks the card's pastel). Pass null to hide. */
    show(pl: Placement | null, index: number, dt: number) {
      const on = !!pl && pl.kind !== 'free';
      shown += ((on ? 1 : 0) - shown) * (1 - Math.exp(-dt * 18));
      root.visible = shown > 0.05;
      footRoot.visible = root.visible && !!pl && pl.kind === 'stand';
      if (!pl || !root.visible) return;
      card.material = mats[index % mats.length];
      mats[index % mats.length].opacity = 0.62 * Math.min(1, shown);
      root.position.copy(pl.p);
      root.quaternion.copy(pl.q);
      // sit just in front of the surface so it never z-fights
      root.translateZ(-THICK / 2 - 0.003);
      if (pl.kind === 'stand') {
        footRoot.position.set(pl.at.x, pl.at.y + 0.003, pl.at.z);
        footRoot.quaternion.identity();
      }
    },
    hide() {
      root.visible = false;
      footRoot.visible = false;
      shown = 0;
    },
    dispose() {
      for (const e of ents) if (e.active) e.dispose({ disposeResources: true });
    },
  };
}
