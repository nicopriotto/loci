import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  World,
} from '@iwsdk/core';
import { CASTLE_GATE, drawCastle } from './doodle.js';
import { THEME } from './theme.js';

const INK = new Color(THEME.ink);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease3 = (t: number) => 1 - (1 - t) ** 3;

const CASTLE_SIZE = 0.46; // metres

/**
 * A castle doodle that draws itself line by line, then fills with flat pastels and fades.
 * Cards are dealt out of its gate (see `gate`).
 */
export function createCastleDraw(world: World, pos: Vector3, eye: Vector3) {
  const group = new Group();
  group.position.copy(pos);
  group.lookAt(eye.x, pos.y, eye.z);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
  const mesh = new Mesh(new PlaneGeometry(CASTLE_SIZE, CASTLE_SIZE), mat);
  mesh.raycast = () => undefined;
  group.add(mesh);
  const entity: Entity = world.createTransformEntity(group);
  group.updateMatrixWorld(true);
  // gate position in world space, where the cards come out
  const gate = new Vector3((CASTLE_GATE[0] - 0.5) * CASTLE_SIZE, (0.5 - CASTLE_GATE[1]) * CASTLE_SIZE, 0.01);
  group.localToWorld(gate);
  let last = -1;
  const update = (t: number) => {
    // quantised: about 25 redraws and uploads instead of one per frame
    const p = Math.round(clamp01(t / 2.1) * 50) / 50;
    if (p !== last) {
      last = p;
      g.clearRect(0, 0, 512, 512);
      drawCastle(g, 0, 0, 512, p, 6);
      tex.needsUpdate = true;
    }
    mesh.scale.setScalar(0.92 + 0.08 * ease3(clamp01(t / 0.6)));
    mat.opacity = t < 2.5 ? 1 : clamp01(1 - (t - 2.5) / 0.4);
  };
  return { entity, update, gate };
}

/**
 * Dashed ink path through the cards in concept order, like a treasure map. It draws itself in, then flows slowly.
 * `guide(i, from)` brightens the leg that leads to card i (from the previous card, or from `from` for the first).
 */
export function createThread(world: World) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.roundRect(2, 0, 34, 8, 4);
  g.fill();
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  const tex2 = tex.clone();
  tex2.wrapS = RepeatWrapping;
  tex2.needsUpdate = true;
  const mk = (map: CanvasTexture, opacity: number) =>
    new MeshBasicMaterial({ map, color: INK, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const mat = mk(tex, 0.85);
  const mesh = new Mesh(new BufferGeometry(), mat);
  mesh.visible = false;
  mesh.raycast = () => undefined;
  const entity = world.createTransformEntity(mesh, { persistent: true });
  const glow = new Mesh(new BufferGeometry(), mk(tex2, 1)); // the leg toward the next card, drawn bolder
  glow.visible = false;
  glow.raycast = () => undefined;
  glow.renderOrder = 1;
  const glowEntity = world.createTransformEntity(glow, { persistent: true });
  const RADIAL = 5;
  let grow = 1;
  let indexCount = 0;
  let speed = 0.25;
  let pts: Vector3[] = [];
  let want = true;
  const set = (points: Vector3[], animate = true) => {
    pts = points;
    mesh.geometry.dispose();
    glow.visible = false;
    mesh.visible = want && points.length > 1;
    if (points.length < 2) return;
    const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.4);
    const seg = points.length * 16;
    mesh.geometry = new TubeGeometry(curve, seg, 0.0042, RADIAL, false);
    indexCount = seg * RADIAL * 6;
    tex.repeat.x = curve.getLength() / 0.045;
    grow = animate ? 0 : 1;
    speed = animate ? 1.6 : 0.25;
    mesh.geometry.setDrawRange(0, animate ? 0 : indexCount);
  };
  return {
    entity,
    set,
    /** Dim the whole path and light the leg that ends at card `i` (concept order). `from` starts the leg when i is 0. */
    guide(i: number, from: Vector3 | null) {
      glow.geometry.dispose();
      if (i < 0 || i >= pts.length) {
        glow.visible = false;
        mat.opacity = 0.85;
        return;
      }
      const leg = i > 0 ? [pts[i - 1], pts[i]] : from ? [from.clone(), pts[0]] : null;
      if (!leg) {
        glow.visible = false;
        return;
      }
      const curve = new CatmullRomCurve3(leg, false, 'catmullrom', 0.4);
      glow.geometry = new TubeGeometry(curve, 24, 0.0042, RADIAL, false);
      tex2.repeat.x = curve.getLength() / 0.045;
      mat.opacity = 0.3;
      glow.visible = want;
    },
    show(v: boolean) {
      want = v;
      mesh.visible = v && mesh.geometry.getAttribute('position') !== undefined;
      if (!v) glow.visible = false;
    },
    dispose() {
      for (const e of [entity, glowEntity]) if (e.active) e.dispose({ disposeResources: true });
      tex.dispose();
      tex2.dispose();
    },
    update(dt: number) {
      tex.offset.x -= dt * speed;
      tex2.offset.x -= dt * 0.5;
      if (speed > 0.25) speed = Math.max(0.25, speed - dt * 1.0);
      if (grow < 1) {
        grow = Math.min(1, grow + dt / 0.9);
        const n = Math.floor((indexCount * ease3(grow)) / (RADIAL * 6)) * RADIAL * 6;
        mesh.geometry.setDrawRange(0, n);
      }
    },
  };
}

/**
 * Small ink arrow glued to the edge of the view that points at an off-screen target.
 * Child of the camera so it needs no per-frame transform maths beyond one world-to-local.
 */
export function createGuideArrow(world: World) {
  const shape = new Shape();
  shape.moveTo(0, 0.022);
  shape.lineTo(0.02, -0.014);
  shape.lineTo(0.007, -0.008);
  shape.lineTo(0.007, -0.024);
  shape.lineTo(-0.007, -0.024);
  shape.lineTo(-0.007, -0.008);
  shape.lineTo(-0.02, -0.014);
  shape.closePath();
  const geo = new ShapeGeometry(shape);
  const rim = new Mesh(geo, new MeshBasicMaterial({ color: new Color(THEME.paper), depthTest: false, transparent: true, toneMapped: false }));
  rim.scale.setScalar(1.45);
  rim.renderOrder = 1999;
  const arrow = new Mesh(geo, new MeshBasicMaterial({ color: INK, depthTest: false, transparent: true, toneMapped: false }));
  arrow.renderOrder = 2000;
  const holder = new Group();
  holder.add(rim, arrow);
  const SIZE = 1.9;
  holder.visible = false;
  holder.traverse((o) => (o.raycast = () => undefined));
  world.camera.add(holder);
  const local = new Vector3();
  let amt = 0;
  return {
    /** `target` in world space or null. Shows only when the target is outside the central view. */
    update(target: Vector3 | null, dt: number, t: number) {
      let want = 0;
      if (target) {
        local.copy(target);
        world.camera.worldToLocal(local);
        const off = Math.atan2(Math.hypot(local.x, local.y), -local.z); // angle from the view axis
        if (off > 0.62 || local.z > 0) {
          want = 1;
          let x = local.x;
          let y = local.y;
          const l = Math.hypot(x, y);
          if (l < 1e-4) {
            x = 0;
            y = -1;
          } else {
            x /= l;
            y /= l;
          }
          const pulse = 1 + Math.sin(t * 5) * 0.06;
          holder.position.set(x * 0.3, y * 0.17, -0.8);
          holder.rotation.z = Math.atan2(y, x) - Math.PI / 2;
          holder.scale.setScalar(pulse * SIZE);
        }
      }
      amt += (want - amt) * (1 - Math.exp(-dt * 12));
      holder.visible = amt > 0.04;
    },
    dispose() {
      world.camera.remove(holder);
      geo.dispose();
    },
  };
}

function flatTexture(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Small flat confetti in the pastels: discs and squiggles that pop out and fall. No glow.
 * A ring buffer of particles, each with its own life: a new burst never moves or cuts short the ones still falling.
 */
export function createBurst(world: World) {
  const N = 96; // per kind
  const LIFE = 1.2;
  const disc = flatTexture((g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.fill();
  });
  const squig = flatTexture((g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(8, 38);
    g.bezierCurveTo(18, 6, 28, 6, 32, 32);
    g.bezierCurveTo(36, 58, 46, 58, 56, 26);
    g.stroke();
  });
  const pastels = THEME.pastels.map((h) => new Color(h));
  const mk = (map: CanvasTexture, size: number) => {
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 4);
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N); // seconds left, 0 = free
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 4));
    const mat = new PointsMaterial({ size, map, vertexColors: true, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.raycast = () => undefined;
    const entity = world.createTransformEntity(pts);
    return { pos, col, vel, life, geo, mat, pts, entity, next: 0 };
  };
  const sets = [mk(disc, 0.018), mk(squig, 0.03)];
  let alive = 0;
  return {
    /** Up to 32 pieces per kind per burst; speed scales the spread. */
    emit(at: Vector3, n = 24, speed = 1) {
      n = Math.min(32, n);
      for (const s of sets) {
        for (let k = 0; k < n; k++) {
          const i = s.next;
          s.next = (s.next + 1) % N;
          s.pos[i * 3] = at.x;
          s.pos[i * 3 + 1] = at.y;
          s.pos[i * 3 + 2] = at.z;
          const a = Math.random() * Math.PI * 2;
          const b = Math.random() * 1.2 - 0.2;
          const sp = (0.25 + Math.random() * 0.4) * speed;
          s.vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
          s.vel[i * 3 + 1] = Math.sin(b) * sp + 0.2 * speed;
          s.vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
          const c = pastels[(Math.random() * pastels.length) | 0];
          s.col[i * 4] = c.r;
          s.col[i * 4 + 1] = c.g;
          s.col[i * 4 + 2] = c.b;
          s.col[i * 4 + 3] = 1;
          s.life[i] = LIFE;
        }
        s.pts.visible = true;
      }
      alive = LIFE;
    },
    update(dt: number) {
      if (alive <= 0) return;
      alive -= dt;
      const drag = 1 - dt * 1.8;
      for (const s of sets) {
        for (let i = 0; i < N; i++) {
          const l = s.life[i];
          if (l <= 0) continue;
          const j = i * 3;
          s.pos[j] += s.vel[j] * dt;
          s.pos[j + 1] += s.vel[j + 1] * dt;
          s.pos[j + 2] += s.vel[j + 2] * dt;
          s.vel[j] *= drag;
          s.vel[j + 1] = s.vel[j + 1] * drag - 0.5 * dt;
          s.vel[j + 2] *= drag;
          const nl = l - dt;
          s.life[i] = nl > 0 ? nl : 0;
          s.col[i * 4 + 3] = nl > 0.35 ? 1 : Math.max(0, nl / 0.35); // dead pieces stay at alpha 0 (alphaTest drops them)
        }
        s.geo.attributes.position.needsUpdate = true;
        s.geo.attributes.color.needsUpdate = true;
        if (alive <= 0) s.pts.visible = false;
      }
    },
    dispose() {
      for (const s of sets) {
        if (s.entity.active) s.entity.dispose({ disposeResources: true });
      }
    },
  };
}

/** Pill drawn over everything at a fixed spot in the view (head-locked): short hints that must always be readable. */
export function createHint(world: World, text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  let shown = '';
  const draw = (t: string) => {
    if (t === shown) return;
    shown = t;
    g.clearRect(0, 0, 512, 128);
    g.lineJoin = 'round';
    g.beginPath();
    g.roundRect(5, 5, 502, 118, 59);
    g.fillStyle = THEME.paper;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = THEME.ink;
    g.stroke();
    g.fillStyle = THEME.ink;
    g.font = `700 52px ${THEME.fontDisplay}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 256, 68, 460);
    tex.needsUpdate = true;
  };
  draw(text);
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  // 0.3 m wide at 0.8 m: about 21 degrees of the view, well inside any headset's field of view
  const mesh = new Mesh(new PlaneGeometry(0.3, 0.075), mat);
  mesh.position.set(0, -0.38, -0.8); // below the card fan (its lower row reaches -0.30 at 0.85 m)
  mesh.renderOrder = 3000;
  mesh.visible = false;
  mesh.raycast = () => undefined;
  world.camera.add(mesh);
  let a = 0;
  return {
    /** Fade in or out. Pass `label` to change the text (redrawn only when it differs). */
    show(on: boolean, dt: number, label?: string) {
      if (label) draw(label);
      a += ((on ? 1 : 0) - a) * (1 - Math.exp(-dt * 10));
      mat.opacity = a;
      mesh.visible = a > 0.02;
    },
    get visible() {
      return a > 0.02;
    },
    dispose() {
      world.camera.remove(mesh);
      mesh.geometry.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

/** Flat paper veil that dims the world behind a focused card (no blur, no glow). Head-locked and always covers the view. */
export function createDim(world: World) {
  const mat = new MeshBasicMaterial({ color: new Color(THEME.paper), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(6, 6), mat);
  mesh.position.set(0, 0, -0.7);
  mesh.renderOrder = 4000;
  mesh.visible = false;
  mesh.raycast = () => undefined;
  world.camera.add(mesh);
  let a = 0;
  return {
    update(on: boolean, dt: number) {
      a += ((on ? 0.7 : 0) - a) * (1 - Math.exp(-dt * (on ? 8 : 5))); // lifts a little slower than it falls, in step with the card flying home
      mat.opacity = a;
      mesh.visible = a > 0.01;
    },
    dispose() {
      world.camera.remove(mesh);
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
