import { createSystem, type World } from '@iwsdk/core';

/**
 * Dev-only "human" driver for the IWER emulated headset and hands (exposed as window.__perf).
 * Head and both hands are moved EVERY FRAME from a keyframe timeline: minimum-jerk easing, gaze leads the hands,
 * breathing and smooth noise so nothing is ever still, arcs and a small settle on reaches, pinch that closes after
 * the hand has settled, and a vertical bob while walking. Hands are aimed (target ray) at `aim`, like the Quest pinch ray.
 */
type V3 = [number, number, number];
/** World point, a point relative to the body (x right, y up, z back; yaw follows the head lazily), or a function. */
type P = V3 | { rel: V3 } | (() => V3);
export interface HandStep {
  pos?: P; // where the hand goes
  aim?: P; // where its ray points
  pinch?: number; // 0..1, applied after the hand arrives and settles
  dur?: number; // reach seconds (default 0.8)
  delay?: number; // extra delay after the gaze lead (default 0.2)
  arc?: number; // metres of upward arc (default 0.04)
}
export interface Step {
  at?: number; // absolute seconds since play()
  after?: number; // seconds after the previous step started
  head?: { lookAt?: V3 | (() => V3); pos?: V3; dur?: number; walk?: boolean };
  left?: HandStep;
  right?: HandStep;
  call?: () => unknown;
}

const mj = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t)));
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
/** Smooth value noise in -1..1, about `hz` cycles per second. */
const noise = (t: number, seed: number, hz: number) => {
  const x = t * hz;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i + seed * 17) * (1 - u) + hash(i + 1 + seed * 17) * u;
};

class Mover {
  v: number[];
  from: number[];
  to: (() => number[]) | null = null;
  t0 = 0;
  dur = 0;
  arc = 0;
  over = 0;
  private lastTo: number[] | null = null;
  constructor(init: number[]) {
    this.v = init.slice();
    this.from = init.slice();
  }
  start(now: number, delay: number, dur: number, to: () => number[], arc = 0, over = 0) {
    this.from = this.v.slice();
    this.to = to;
    this.t0 = now + delay;
    this.dur = dur;
    this.arc = arc;
    this.over = over;
  }
  progress(now: number) {
    return this.dur <= 0 ? 1 : Math.min(1, Math.max(0, (now - this.t0) / this.dur));
  }
  get busy() {
    return this.to !== null && this.progress(performance.now() / 1000) < 1;
  }
  update(now: number) {
    if (!this.to) return;
    const s = this.progress(now);
    const e = mj(s);
    let to: number[];
    try {
      to = this.to();
      this.lastTo = to;
    } catch {
      to = this.lastTo ?? this.v; // a target function may throw once its object is gone: hold the last good value
    }
    const bump = Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.55) / 0.45)));
    let len = 0;
    if (this.over) for (let i = 0; i < to.length; i++) len += (to[i] - this.from[i]) ** 2;
    len = Math.sqrt(len) || 1;
    for (let i = 0; i < to.length; i++) {
      this.v[i] = this.from[i] + (to[i] - this.from[i]) * e;
      if (this.over) this.v[i] += ((to[i] - this.from[i]) / len) * this.over * bump;
    }
    if (this.arc) this.v[1] += this.arc * Math.sin(Math.PI * s);
  }
}

interface IwerHand {
  position: { set(x: number, y: number, z: number): void };
  quaternion: { set(x: number, y: number, z: number, w: number): void };
  updatePinchValue(v: number): void;
  setPinchValueImmediate(v: number): void;
  setPin(p: null): void;
  anchorOffset(anchor: string, out?: Float32Array): ArrayLike<number>;
}
interface IwerDevice {
  position: { set(x: number, y: number, z: number): void };
  quaternion: { set(x: number, y: number, z: number, w: number): void };
  hands: { left?: IwerHand; right?: IwerHand };
  primaryInputMode: 'controller' | 'hand';
  controlMode: 'manual' | 'programmatic';
}

// Hands rest low in front of the chest. Lower than ~55 degrees below the eyes IWER treats the hand as untracked and the mesh freezes.
const REST_L: V3 = [-0.24, -0.36, -0.34];
const REST_R: V3 = [0.24, -0.36, -0.34];
const REST_AIM: V3 = [0, -0.5, -1.5];

class Performer {
  private dev: IwerDevice;
  private yaw = new Mover([0]);
  private pitch = new Mover([-0.05]);
  private headPos = new Mover([0, 1.6, 0]);
  private hp: Record<'left' | 'right', { pos: Mover; aim: Mover; pinch: Mover; seed: number; pinched: boolean }>;
  private bodyYaw = 0;
  private last = 0;
  private walkT0 = 0;
  private walking = false;
  private queue: { t: number; s: Step }[] = [];
  private t0 = 0;
  private resolve: (() => void) | null = null;
  eye: V3 = [0, 1.6, 0];
  /** Seconds the body yaw takes to follow the head: hands defined with `rel` swing behind a fast head turn instead of staying glued to the view. */
  bodyLag = 0.25;
  private active = false;

  constructor(dev: IwerDevice) {
    this.dev = dev;
    dev.primaryInputMode = 'hand';
    const h = (rest: V3, seed: number) => ({ pos: new Mover(this.rel(rest)), aim: new Mover(this.rel(REST_AIM)), pinch: new Mover([0]), seed, pinched: false });
    this.hp = { left: h(REST_L, 1), right: h(REST_R, 2) };
    this.last = performance.now() / 1000;
  }

  /** Point relative to the body (x right, y up, z back) in world space. */
  private rel(p: V3): V3 {
    const c = Math.cos(this.bodyYaw);
    const s = Math.sin(this.bodyYaw);
    const [x, y, z] = p;
    return [this.headPos.v[0] + x * c + z * s, this.headPos.v[1] + y, this.headPos.v[2] - x * s + z * c];
  }
  private res(p: P): () => number[] {
    if (typeof p === 'function') return p;
    if (Array.isArray(p)) return () => p;
    return () => this.rel(p.rel);
  }

  /** Hide (or show) the IWER dev UI overlays (hand panels, gizmos); the room itself stays. */
  hideUI(hide = true) {
    const u = (this.dev as unknown as { devui?: { devUICanvas?: HTMLElement; devUIContainer?: HTMLElement } }).devui;
    for (const el of [u?.devUICanvas, u?.devUIContainer]) if (el) el.style.display = hide ? 'none' : '';
  }

  /** Snap everything to a pose (use before play). */
  reset(pos: V3, lookAt: V3) {
    this.active = true;
    const [y, p] = this.angles(pos, lookAt);
    this.headPos.v = [...pos];
    this.headPos.to = null;
    this.yaw.v = [y];
    this.yaw.to = null;
    this.pitch.v = [p];
    this.pitch.to = null;
    this.bodyYaw = y;
    for (const k of ['left', 'right'] as const) {
      const h = this.hp[k];
      h.pos.v = this.rel(k === 'left' ? REST_L : REST_R);
      h.pos.to = () => this.rel(k === 'left' ? REST_L : REST_R);
      h.aim.v = this.rel(REST_AIM);
      h.aim.to = () => this.rel(REST_AIM);
      h.pinch.v = [0];
      h.pinch.to = null;
    }
  }

  private angles(from: number[], at: number[]): [number, number] {
    const dx = at[0] - from[0];
    const dy = at[1] - from[1];
    const dz = at[2] - from[2];
    return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }

  play(steps: Step[]): Promise<void> {
    this.active = true;
    this.t0 = performance.now() / 1000;
    let t = 0;
    this.queue = steps.map((s) => {
      t = s.at ?? t + (s.after ?? 0);
      return { t, s };
    });
    return new Promise((res) => (this.resolve = res));
  }

  private fire(s: Step, now: number) {
    const hd = s.head;
    if (hd) {
      const dur = hd.dur ?? 0.7;
      if (hd.lookAt) {
        const eyeAt = hd.pos ?? this.headPos.v;
        const tgt = typeof hd.lookAt === 'function' ? hd.lookAt() : hd.lookAt;
        const [ty, tp] = this.angles(eyeAt, tgt);
        let dy = ty - this.yaw.v[0];
        dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
        const yawT = this.yaw.v[0] + dy;
        this.yaw.start(now, 0, dur, () => [yawT]);
        this.pitch.start(now, 0.04, dur * 0.9, () => [tp]);
      }
      if (hd.pos) {
        const p = hd.pos;
        const d = Math.hypot(p[0] - this.headPos.v[0], p[2] - this.headPos.v[2]);
        this.headPos.start(now, 0, hd.dur ?? Math.max(0.8, d / 0.9), () => p);
        this.walking = !!hd.walk;
        this.walkT0 = now;
      }
    }
    for (const k of ['left', 'right'] as const) {
      const hs = s[k];
      if (!hs) continue;
      const h = this.hp[k];
      const delay = hs.delay ?? 0.2; // the head starts at the step start, hands follow
      const dur = hs.dur ?? 0.8;
      if (hs.pos) h.pos.start(now, delay, dur, this.res(hs.pos), hs.arc ?? 0.04, 0.01);
      if (hs.aim) h.aim.start(now, delay, dur * 0.9, this.res(hs.aim));
      if (hs.pinch !== undefined) {
        const v = hs.pinch;
        const arrive = hs.pos ? delay + dur + 0.2 : delay; // arrive, settle ~200 ms, then close
        h.pinch.start(now, arrive, 0.15, () => [v]);
      }
    }
    if (s.call) void Promise.resolve().then(s.call);
  }

  tick() {
    if (!this.active) return;
    // IWER drops back to 'manual' (DevUI owns head and hands, so the app sees frozen poses) 30 s after the last remote-control
    // CLI call. This is the root cause of the "frozen hand" and frozen head after ~30 s: keep the performer in charge.
    if (this.dev.controlMode !== 'programmatic') this.dev.controlMode = 'programmatic';
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - this.last);
    this.last = now;
    while (this.queue.length && now - this.t0 >= this.queue[0].t) {
      try {
        this.fire(this.queue.shift()!.s, now);
      } catch (err) {
        console.error('[perf] step failed', err); // never let a bad step stall the frame loop
      }
    }
    this.yaw.update(now);
    this.pitch.update(now);
    this.headPos.update(now);
    this.bodyYaw += ((this.yaw.v[0] - this.bodyYaw) * (1 - Math.exp(-dt / this.bodyLag)));
    const e = this.headPos.v;
    // walking: bob in step with the move, only while it is actually moving
    let bob = 0;
    if (this.walking) {
      const s = this.headPos.progress(now);
      if (s >= 1) this.walking = false;
      else bob = 0.0075 * (1 - Math.cos(2 * Math.PI * 1.8 * (now - this.walkT0))) * Math.sqrt(Math.sin(Math.PI * s));
    }
    const breath = 0.002 * Math.sin(2 * Math.PI * 0.25 * now);
    const ex = e[0] + 0.002 * noise(now, 3, 0.2);
    const ey = e[1] + breath + bob;
    const ez = e[2] + 0.002 * noise(now, 4, 0.2);
    this.eye = [ex, ey, ez];
    const d = Math.PI / 180;
    const yw = this.yaw.v[0] + 0.3 * d * noise(now, 5, 0.35);
    const pt = this.pitch.v[0] + 0.3 * d * noise(now, 6, 0.3);
    const rl = 0.25 * d * noise(now, 7, 0.25);
    const c1 = Math.cos(pt / 2), s1 = Math.sin(pt / 2);
    const c2 = Math.cos(yw / 2), s2 = Math.sin(yw / 2);
    const c3 = Math.cos(rl / 2), s3 = Math.sin(rl / 2);
    this.dev.position.set(ex, ey, ez);
    this.dev.quaternion.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
    for (const k of ['left', 'right'] as const) {
      const h = this.hp[k];
      const hand = this.dev.hands[k];
      h.pos.update(now);
      h.aim.update(now);
      h.pinch.update(now);
      if (!hand) continue;
      const n = (a: number, hz: number) => noise(now, h.seed * 10 + a, hz);
      const p = [h.pos.v[0] + 0.002 * n(1, 0.4), h.pos.v[1] + 0.002 * n(2, 0.45) + breath * 0.5, h.pos.v[2] + 0.002 * n(3, 0.35)];
      const a = [h.aim.v[0] + 0.01 * n(4, 0.3), h.aim.v[1] + 0.01 * n(5, 0.3), h.aim.v[2]];
      // ray basis: -z along the aim direction, no roll
      let fx = a[0] - p[0], fy = a[1] - p[1], fz = a[2] - p[2];
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx; // right = cross(f, up)
      const rl2 = Math.hypot(rx, rz) || 1;
      rx /= rl2; rz /= rl2;
      const ux = -(rz * fy), uy = rz * fx - rx * fz, uz = rx * fy; // up = cross(right, f)
      // columns: right, up, -f
      const m00 = rx, m10 = 0, m20 = rz, m01 = ux, m11 = uy, m21 = uz, m02 = -fx, m12 = -fy, m22 = -fz;
      const tr = m00 + m11 + m22;
      let qx, qy, qz, qw;
      if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
      } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
      } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
      } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
      }
      // hand positions are the INDEX TIP (so a reach lands the fingertip on the target); the origin sits one offset behind
      const o = hand.anchorOffset('index-tip');
      const tx = qy * o[2] - qz * o[1], ty = qz * o[0] - qx * o[2], tz = qx * o[1] - qy * o[0];
      const ox = o[0] + 2 * (qw * tx + qy * tz - qz * ty);
      const oy = o[1] + 2 * (qw * ty + qz * tx - qx * tz);
      const oz = o[2] + 2 * (qw * tz + qx * ty - qy * tx);
      hand.setPin(null);
      hand.position.set(p[0] - ox, p[1] - oy, p[2] - oz);
      hand.quaternion.set(qx, qy, qz, qw);
      const pv = Math.min(1, Math.max(0, h.pinch.v[0]));
      if (pv < 0.5 && h.pinched) hand.setPinchValueImmediate(pv);
      else hand.updatePinchValue(pv);
      h.pinched = pv >= 0.5;
    }
    if (this.resolve && !this.queue.length) {
      const busy = [this.yaw, this.pitch, this.headPos, ...Object.values(this.hp).flatMap((h) => [h.pos, h.aim, h.pinch])].some((m) => m.busy);
      if (!busy) {
        const r = this.resolve;
        this.resolve = null;
        r();
      }
    }
  }
}

export function installPerformer(world: World) {
  const dev = (window as unknown as { IWER_DEVICE?: IwerDevice }).IWER_DEVICE;
  if (!dev) return;
  const perf = new Performer(dev);
  (window as unknown as { __perf: Performer }).__perf = perf;
  class PerformerSystem extends createSystem({}) {
    update() {
      perf.tick();
    }
  }
  world.registerSystem(PerformerSystem);
}
