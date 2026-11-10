import { Box3, MathUtils, Matrix4, Object3D, type PerspectiveCamera, Quaternion, Vector3 } from '@iwsdk/core';

/** Vertical extent of the view at distance d for a vertical fov in degrees. */
export const visHeight = (fovDeg: number, d: number) => 2 * d * Math.tan((fovDeg * Math.PI) / 360);

/** Aspect used for fitting. Kept in a conservative band so a square eye buffer and a wide desktop view both fit. */
export const viewAspect = (cam: PerspectiveCamera) => (Number.isFinite(cam.aspect) ? Math.min(1.4, Math.max(1, cam.aspect)) : 1.3);

/** Look direction -> a unit vector with the same yaw and a clamped pitch, tilted `down` radians below it. */
export function dirFromGaze(look: Vector3, down: number, out: Vector3, yawBias = 0, pitchMax = 0.45, pitchMin = -pitchMax) {
  const yaw = Math.atan2(look.x, -look.z) + yawBias;
  const pitch = MathUtils.clamp(Math.asin(MathUtils.clamp(look.y, -1, 1)), pitchMin, pitchMax) - down;
  const c = Math.cos(pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

export interface RigEnv {
  /** Distance to the nearest room geometry along a ray, capped at max. */
  clear(origin: Vector3, dir: Vector3, max: number): number;
}

export interface RigOptions {
  /** Distance from the head, metres. */
  dist: number;
  /** Radians below the centre of view. */
  down?: number;
  /** Fraction of the vertical view the object should fill. */
  fill: number;
  /** Fraction of the horizontal view it may fill. */
  fillW?: number;
  /** Never scale above this. */
  maxScale?: number;
  /** Upright billboard (panels) or fully facing the head (focus card). */
  yawOnly?: boolean;
  /** Angle from the centre of view past which the rig starts to follow, radians. */
  deadzone?: number;
  /** Use the camera's real field of view and aspect (from its projection) instead of the comfortable cap. */
  realFov?: boolean;
  /** Drawn over everything: never moved for room geometry. */
  noEnv?: boolean;
  /** Largest pitch of the gaze the rig follows, radians (default 0.45). */
  pitchMax?: number;
  /** Lowest pitch of the gaze the rig follows, radians (default -pitchMax). */
  pitchMin?: number;
  /** Farthest the rig may lag behind the gaze in yaw while gliding, radians: it never leaves the comfortable view. */
  edge?: number;
  /** Seconds the user must stay out of the deadzone before the rig glides back. */
  delay?: number;
}

const _box = new Box3();
const _size = new Vector3();
const _ctr = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _p = new Vector3();
const _t = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Body-locked tag-along for anything the user has to read. It spawns centred in the current view at a comfortable
 * distance, is scaled to fit inside the view with margins, is pulled in front of room geometry, and only glides back to
 * the centre after the user has looked away (outside `deadzone`) for `delay` seconds, so small head movements never move it.
 */
export class ViewRig {
  readonly dir = new Vector3(0, 0, -1);
  readonly want = new Vector3(0, 0, -1);
  readonly pos = new Vector3();
  readonly quat = new Quaternion();
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);
  scale = 0.1;
  curD: number;
  gliding = false;
  private away = 0;
  private yawBias = 0;
  private clearAt = -9;
  private targetD: number;
  private base = { w: 0, h: 0, cy: 0, ok: false };
  private frames = 0;
  private started = false;
  readonly o: Required<RigOptions>;
  private scaled = false;

  /** True once the object has been measured (panels lay out asynchronously). */
  get ready() {
    return this.base.ok && this.stable >= 3;
  }
  private stable = 0;
  private lastH = 0;

  constructor(
    public obj: Object3D | null,
    o: RigOptions,
  ) {
    this.o = { realFov: false, noEnv: false, down: 0, fillW: 0.8, maxScale: 1, yawOnly: true, pitchMax: 0.45, deadzone: (18 * Math.PI) / 180, delay: 0.5, edge: (24 * Math.PI) / 180, ...o, pitchMin: o.pitchMin ?? -(o.pitchMax ?? 0.45) };
    this.curD = this.targetD = o.dist;
  }

  /** Jump to the centre of the current view. */
  snap(look: Vector3) {
    dirFromGaze(look, this.o.down, this.dir, this.yawBias, this.o.pitchMax, this.o.pitchMin);
    this.want.copy(this.dir);
    this.gliding = false;
    this.away = 0;
    this.started = false;
    this.clearAt = -9;
  }

  private measure() {
    const obj = this.obj;
    if (!obj) return;
    _q.copy(obj.quaternion);
    obj.quaternion.identity();
    obj.updateMatrixWorld(true);
    _box.makeEmpty().setFromObject(obj);
    obj.quaternion.copy(_q);
    obj.updateMatrixWorld(true);
    if (_box.isEmpty()) return;
    _box.getSize(_size);
    _box.getCenter(_ctr);
    const s = Math.max(1e-6, obj.scale.x);
    if (_size.y / s > 0.05 && _size.x / s > 0.05 && Number.isFinite(_size.y)) {
      this.base.w = _size.x / s;
      this.base.h = _size.y / s;
      this.base.cy = (_ctr.y - obj.position.y) / s;
      this.base.ok = true;
      // layout is settled once the measured size stops changing (it is async: fonts, children)
      this.stable = Math.abs(this.base.h - this.lastH) < 0.01 * this.base.h ? this.stable + 1 : 0;
      this.lastH = this.base.h;
    }
  }

  /** Set the size the rig fits against directly (objects that are not measurable). */
  setBase(w: number, h: number) {
    this.base.w = w;
    this.base.h = h;
    this.base.cy = 0;
    this.base.ok = true;
    this.frames = 999;
    this.stable = 99;
  }

  update(dt: number, now: number, eye: Vector3, look: Vector3, cam: PerspectiveCamera, env: RigEnv | null) {
    const o = this.o;
    dirFromGaze(look, o.down, this.want, this.yawBias, o.pitchMax, o.pitchMin);
    if (!this.started) {
      this.started = true;
      this.dir.copy(this.want);
    }
    const ang = this.dir.angleTo(dirFromGaze(look, o.down, _t, 0, o.pitchMax, o.pitchMin));
    if (!this.gliding) {
      this.away = ang > o.deadzone ? this.away + dt : 0;
      if (this.away > o.delay) this.gliding = true;
    }
    if (this.gliding) {
      this.dir.lerp(this.want, 1 - Math.exp(-dt * 3.5)).normalize();
      if (this.dir.angleTo(this.want) < 0.04) {
        this.gliding = false;
        this.away = 0;
      }
    }
    // never lag more than `edge` behind the gaze in yaw (no env bias): the panel stays inside the comfortable view
    {
      const yl = Math.atan2(look.x, -look.z);
      const yd = Math.atan2(this.dir.x, -this.dir.z);
      let d = yd - yl;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      if (this.yawBias === 0 && Math.abs(d) > o.edge) {
        const hl = Math.hypot(this.dir.x, this.dir.z);
        const ny = yl + Math.sign(d) * o.edge;
        this.dir.x = Math.sin(ny) * hl;
        this.dir.z = -Math.cos(ny) * hl;
      }
    }

    // never inside the room's geometry: pull in front of what a ray from the head hits, or turn to a free bearing
    if (env && !o.noEnv && now - this.clearAt > 0.3) {
      this.clearAt = now;
      const need = o.dist + 0.12;
      const hit = env.clear(eye, this.dir, need);
      this.targetD = hit < need ? Math.max(0.42, hit - 0.12) : o.dist;
      if (hit < 0.5 && !o.noEnv) {
        for (let i = 1; i <= 8; i++) {
          const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45;
          dirFromGaze(look, o.down, _t, this.yawBias + off, o.pitchMax, o.pitchMin);
          if (env.clear(eye, _t, need) >= need) {
            this.yawBias += off;
            this.gliding = true;
            break;
          }
        }
      } else if (this.yawBias !== 0) {
        dirFromGaze(look, o.down, _t, 0, o.pitchMax, o.pitchMin);
        if (env.clear(eye, _t, need) >= need) {
          this.yawBias = 0;
          this.gliding = true;
        }
      }
    } else if (!env || o.noEnv) this.targetD = o.dist;
    this.curD += (this.targetD - this.curD) * (1 - Math.exp(-dt * 5));

    // basis of the view direction
    this.right.crossVectors(this.dir, UP);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.right, this.dir).normalize();

    // keep re-measuring while the layout settles (fonts, async children)
    if (this.obj && (this.frames < 120 || this.frames % 45 === 0)) this.measure();
    this.frames++;

    let fov = Math.min(cam.fov || 60, 60); // comfortable vertical field, whatever the headset offers
    let asp = viewAspect(cam);
    if (o.realFov) {
      const e = cam.projectionMatrix.elements;
      if (e[5] > 0 && e[0] > 0) {
        fov = Math.min(76, Math.max(45, (2 * Math.atan(1 / e[5]) * 180) / Math.PI)); // 76: what the flat preview shows of the eye buffer
        asp = Math.min(1.6, e[5] / e[0]);
      }
    }
    const vh = visHeight(fov, this.curD);
    const vw = vh * asp;
    if (this.base.ok) {
      const s = Math.min((o.fill * vh) / this.base.h, (o.fillW * vw) / this.base.w, o.maxScale);
      if (this.scaled) this.scale += (s - this.scale) * (1 - Math.exp(-dt * 8));
      else {
        this.scale = s;
        this.scaled = true;
      }
    }

    this.pos.copy(eye).addScaledVector(this.dir, this.curD);
    if (o.yawOnly) {
      _p.set(eye.x - this.pos.x, 0, eye.z - this.pos.z);
      if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
      _m.lookAt(_t.set(0, 0, 0), _p.negate(), UP); // object +Z toward the head
      this.quat.setFromRotationMatrix(_m);
    } else {
      _m.makeBasis(this.right, this.up, _t.copy(this.dir).negate());
      this.quat.setFromRotationMatrix(_m);
    }
    if (this.obj) {
      this.obj.quaternion.copy(this.quat);
      this.obj.scale.setScalar(this.scale);
      // centre the visual bounds, not the object origin, on the view axis
      this.obj.position.copy(this.pos);
      this.obj.position.y -= this.base.cy * this.scale;
    }
  }
}

/** Real vertical fov in degrees from a camera's projection (falls back to 70). */
export function realFov(cam: PerspectiveCamera) {
  const e = cam.projectionMatrix.elements;
  return e[5] > 0 ? Math.min(76, Math.max(45, (2 * Math.atan(1 / e[5]) * 180) / Math.PI)) : 70;
}
