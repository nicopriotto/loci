import {
  createSystem,
  DistanceGrabbable,
  Entity,
  Grabbed,
  GrabSystem,
  Group,
  CanvasTexture,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  MovementMode,
  Object3D,
  PanelDocument,
  PanelUI,
  PokeInteractable,
  Pressed,
  Matrix4,
  Quaternion,
  RayInteractable,
  UIKitDocument,
  Vector3,
  VisibilityState,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import * as audio from './audio.js';
import { CARD_H, CARD_W, PLACED_SCALE, createCard, setOnCardLand, viewOf } from './card.js';
import { Card } from './components.js';
import { getActivePalace } from './palaces.js';
import { type Deck, getPendingDeck, loadDeck, resolveImage } from './deck.js';
import { drawWordmark } from './doodle.js';
import { createBurst, createCastleDraw, createDim, createGuideArrow, createHint, createThread } from './fx.js';
import { ViewRig, type RigOptions, realFov, visHeight, viewAspect } from './view.js';
import { installHands } from './hands.js';
import { applySetting, currentEnvironment } from './envs/index.js';
import { createGhost, facingQuat, makePlacement, poseOnSurface, type Placement, SurfaceFinder } from './place.js';
import {
  clearState,
  emptyState,
  grade,
  isDue,
  loadState,
  saveState,
  type State,
} from './srs.js';

interface PokeEl {
  matrixWorld: Matrix4;
  displayed?: { value: boolean };
  setProperties(p: object): void;
  addEventListener(type: string, fn: () => void): void;
}

/** View-fitted panels spawn level at eye height: the gaze pitch they follow is clamped to -10..+5 degrees. */
/** The focus card and its buttons follow the gaze pitch up to 40 degrees, no further. */
const FOCUS_PITCH = 0.7;
const LEVEL_UP = (5 * Math.PI) / 180;
const LEVEL_DOWN = (-10 * Math.PI) / 180;

export type Phase = 'onboarding' | 'generating' | 'placing' | 'review' | 'done';

const DEMO_DECK_ID = 'cells';
const THICK_OFF = 0.007; // a flat card centre sits this far off its surface (see place.ts)
// Review rules: you have to go to the card and look at it before it will reveal.
const NEAR_DIST = 1.3; // metres from the head to the card
const LOOK_COS = Math.cos((12 * Math.PI) / 180); // within 12 degrees of the gaze
const HINT_DIST = 2.8; // "Come closer" shows between NEAR_DIST and this, only for cards in front of you
const HINT_COS = Math.cos((40 * Math.PI) / 180);
const INK_BTN = { hover: '#46444F', down: '#6E6A78', base: '#2B2A33' };
const QUIET_BTN = { hover: '#F1EADF', down: '#E4DBCC', base: '#FBF7F0' };
const FILL_TIME = 1.2;
// A card you cannot walk up to (behind furniture, across the room) opens after you keep looking at it this long.
const FAR_DIST = 14;
const FAR_WAIT = 3.5;
const POKE_FRONT = 0.012; // metres: a fingertip this close to a button surface (or through it) presses it
const POKE_PINCH = 0.09; // a pinch with the fingertip this close to a button presses it, even if the ray is ignored
const THINK_TIME = 2.5;
// Demo spread: [degrees from forward (right positive), distance m, height relative to head]
const SPREAD: [number, number, number][] = [
  [-78, 1.15, 0.3], // left wall, high
  [-55, 1.0, -0.15], // left wall
  [-28, 0.8, 0.05],
  [0, 1.0, -1.0], // on the coffee table
  [-5, 1.2, 0.4], // above the sofa
  [28, 0.8, -0.1],
  [52, 1.0, 0.25], // right, high
  [72, 1.25, -0.25], // near the TV
];

export class LociSystem extends createSystem({
  cards: { required: [Card] },
  grabbed: { required: [Card, Grabbed] },
  pressed: { required: [Card, Pressed] },
  hovered: { required: [Card, Hovered] },
  planes: { required: [XRPlane] },
  rmeshes: { required: [XRMesh] },
  panels: { required: [PanelUI, PanelDocument] },
}) {
  phase: Phase = 'onboarding';
  private epoch = 0;
  private now = 0;
  private deckId = DEMO_DECK_ID;
  private state: State = emptyState(DEMO_DECK_ID);
  private deck: Deck | null = null;
  private tmp: Entity[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private waiters = new Map<number, (d: UIKitDocument) => void>();
  private thinking: ReturnType<typeof createCastleDraw> | null = null;
  private genT0 = 0;
  private hint: { setProperties(p: object): void } | null = null;
  private hintAt = 0;
  private hintGap = -1;
  private dotProps = { gap: 22 };
  private reanchorAt = 0;
  private doneShown = false;
  // review
  private pending = new Set<string>();
  private tried = new Set<string>();
  private stats = { got: 0, missed: 0 };
  private revealed: Entity | null = null;
  private autoCard: Entity | null = null;
  private rate: Entity | null = null;
  // geometry helpers (allocated once)
  private eye = new Vector3();
  private look = new Vector3();
  private head = new Vector3();
  private fwd = new Vector3(0, 0, -1);
  private right = new Vector3(1, 0, 0);
  private v = new Vector3();
  private thread!: ReturnType<typeof createThread>;
  private burst!: ReturnType<typeof createBurst>;
  private handL = new Vector3();
  private handR = new Vector3();
  private pts: Vector3[] = [];
  // placement
  private surfaces!: SurfaceFinder;
  private ghost!: ReturnType<typeof createGhost>;
  private arrow!: ReturnType<typeof createGuideArrow>;
  private pl = makePlacement();
  private plFor: Entity | null = null;
  private surfAt = -9;
  private up = new Vector3(0, 1, 0);
  private wallT = new Vector3();
  private wallN = new Vector3();
  private wallC = new Vector3();
  private fitPre2 = new Vector3();
  private fitPre = new Vector3();
  private fitT = new Vector3();
  private fitN = new Vector3();
  private fitD = new Vector3();
  private fitO = new Vector3();
  private envSeen: object | null = null;
  private envKey = 0;
  private rayO = new Vector3();
  private rayD = new Vector3();
  private rayQ = new Quaternion();
  private hitAt = new Vector3();
  private hitN = new Vector3();
  private guideId = '';
  private grabSys: GrabSystem | null = null;
  // view-fitted UI
  private rigs: ViewRig[] = [];
  private hud!: ReturnType<typeof createHint>;
  private dim!: ReturnType<typeof createDim>;
  private focus: { e: Entity; rig: ViewRig; panel: { e: Entity; rig: ViewRig } | null; review: boolean; elsewhere: number } | null = null;
  private focusEnd = -9;
  private demoBusy = false;
  private demoQueued = 0;
  private grabStart = new Map<Entity, { t: number; p: Vector3 }>();
  private pitch = 0;
  // buttons with a direct poke / near-pinch path next to the ray path (see updatePokes)
  private buttons: { e: Entity; el: PokeEl; key: string; fn: () => void; prev: [number, number]; born: number }[] = [];
  private firedAt = new Map<string, number>();
  private tip = new Vector3();
  private pokeM = new Matrix4();
  private pokeO = new Vector3();
  private pokeN = new Vector3();
  private pokeL = new Vector3();
  private building: Promise<void> | null = null;
  private farId = '';
  private farT = 0;
  private revealAt = 0;
  private lastVis: VisibilityState = VisibilityState.NonImmersive;
  private lastSolveP = new Vector3();
  private lastSolveAt = -9;
  private toastUntil = 0;
  private toastAt = -99;
  private hudOn = false;
  private hudText = 'Come closer';
  private eraseUntil = 0;
  private placeHintUntil = 0;
  private envIface = {
    clear: (o: Vector3, d: Vector3, max: number) => this.surfaces.envClear(currentEnvironment()?.root ?? null, o, d, max),
  };

  init() {
    this.thread = createThread(this.world);
    this.burst = createBurst(this.world);
    installHands(this.world);
    this.surfaces = new SurfaceFinder(this.world);
    this.ghost = createGhost(this.world);
    this.arrow = createGuideArrow(this.world);
    this.hud = createHint(this.world, 'Come closer');
    this.dim = createDim(this.world);
    // every listener below is torn down with the system (HMR / re-created world), so none stacks up
    const cf = this.cleanupFuncs;
    cf.push(
      () => this.burst.dispose(),
      () => this.thread.dispose(),
      () => this.ghost.dispose(),
      () => this.arrow.dispose(),
      () => this.hud.dispose(),
      () => this.dim.dispose(),
      () => setOnCardLand(() => undefined),
    );
    setOnCardLand((root) => {
      this.burst.emit(root.position, 14, 0.45);
      audio.tick();
    });
    cf.push(
      this.queries.panels.subscribe('qualify', (e) => {
        const r = this.waiters.get(e.index);
        this.waiters.delete(e.index);
        r?.(e.getValue(PanelDocument, 'document') as UIKitDocument);
      }),
    );
    cf.push(
      this.queries.grabbed.subscribe('qualify', (e) => {
        audio.unlock();
        audio.lift();
        this.grabStart.set(e, { t: this.now, p: e.object3D!.position.clone() });
      }),
    );
    cf.push(this.queries.grabbed.subscribe('disqualify', (e) => this.onRelease(e)));
    cf.push(this.queries.pressed.subscribe('qualify', (e) => {
      viewOf(e).press();
      audio.press();
      if (this.phase === 'review' && !this.autoCard) this.tryReveal(e);
      if (this.phase === 'placing') {
        if (this.focus?.e === e) this.exitFocus();
        else if (!this.focus) {
          // a poke: if no grab starts within a moment it was a click
          const ep = this.epoch;
          this.after(0.12, () => ep === this.epoch && e.active && !this.queries.grabbed.entities.has(e) && this.enterFocus(e, false));
        }
      }
    }));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vis) => {
        audio.unlock();
        // only entering a session re-spawns the start panel: a blur (system menu) and back must not rebuild the flow
        if (this.lastVis === VisibilityState.NonImmersive && vis !== VisibilityState.NonImmersive) this.reanchorAt = this.now + 0.8;
        this.lastVis = vis;
      }),
    );
    // the studio chose another palace: reload its state (a stale state would be saved over the new palace)
    const onStudioDone = () => this.go('onboarding');
    window.addEventListener('loci:studio-done', onStudioDone);
    this.cleanupFuncs.push(() => window.removeEventListener('loci:studio-done', onStudioDone));
    this.readHead();
    this.go('onboarding');
  }

  // ---------- frame loop ----------

  private readHead() {
    const cam = this.world.camera;
    cam.updateWorldMatrix(true, false);
    cam.getWorldPosition(this.eye);
    cam.getWorldDirection(this.look);
  }

  update(dt: number) {
    this.now += dt;
    this.readHead();
    if (this.reanchorAt && this.now >= this.reanchorAt) {
      this.reanchorAt = 0;
      if (this.phase === 'onboarding') this.go('onboarding');
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.now >= this.timers[i].at) this.timers.splice(i, 1)[0].fn();
    }
    this.player.raySpaces.left.getWorldPosition(this.handL);
    this.player.raySpaces.right.getWorldPosition(this.handR);
    for (const e of this.queries.cards.entities) {
      const o = e.object3D!;
      const hand = this.handL.distanceToSquared(o.position) < this.handR.distanceToSquared(o.position) ? this.handL : this.handR;
      const cv = viewOf(e);
      cv.placed = !!this.state.poses[e.getValue(Card, 'conceptId')!];
      cv.tick(o, this.now, dt, this.queries.grabbed.entities.has(e), this.queries.hovered.entities.has(e), this.eye, hand);
    }
    this.updateRigs(dt);
    this.updatePokes();
    this.updateCarry(dt);
    this.thread.update(dt);
    this.burst.update(dt);
    this.thinking?.update(this.now - this.genT0);
    if (this.hint && this.now - this.hintAt > 0.045) {
      // two dots close on each other like a pinch, hold, then open again (about 22 Hz: UIKit lays out on every change)
      this.hintAt = this.now;
      const c = (this.now % 2.2) / 2.2;
      const k = c < 0.45 ? c / 0.45 : c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4;
      const gap = Math.round(24 - 22 * (1 - (1 - k) ** 3));
      if (gap !== this.hintGap) {
        this.hintGap = gap;
        this.dotProps.gap = gap;
        this.hint.setProperties(this.dotProps);
      }
    }
    this.hudOn = false;
    if (this.phase === 'review' && !this.revealed) this.updateGaze(dt);
    else this.arrow.update(null, dt, this.now);
    if (this.phase === 'placing' && this.now < this.placeHintUntil) {
      if (this.queries.grabbed.entities.size) this.placeHintUntil = 0;
      else if (!this.focus) {
        this.hudOn = true;
        this.hudText = 'Pinch a card to place it';
      }
    }
    const toast = this.now < this.toastUntil;
    this.hud.show(toast || (this.hudOn && !this.focus), dt, toast ? 'Not saved: storage is full' : this.hudText);
  }

  /** Save the open palace. If the browser refuses (storage full) say so once, so lost placements are never a surprise. */
  private persist() {
    if (!saveState(this.state) && this.now - this.toastAt > 20) {
      this.toastAt = this.now;
      this.toastUntil = this.now + 4;
      audio.soft();
    }
  }

  // ---------- view-fitted UI ----------

  private updateRigs(dt: number) {
    const cam = this.world.camera;
    const env = currentEnvironment() ? this.envIface : null;
    for (const r of this.rigs) {
      r.update(dt, this.now, this.eye, this.look, cam, r.o.dist <= 0.55 ? null : env);
      if (r.obj) r.obj.visible = r.ready && !(this.hideDonePill && r === this.doneRig);
    }
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const o = this.overlays[i];
      if (!o.g.parent) this.overlays.splice(i, 1);
      else if (this.now < o.until || this.now - o.at > 0.4) {
        o.at = this.now;
        o.apply();
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      const u = Math.min(1, (this.now - l.t0) / 0.2);
      const o = l.p.rig.obj;
      if (u >= 1 || !o || !l.p.e.active) {
        this.leaving.splice(i, 1);
        this.dropPanel(l.p);
      } else o.scale.multiplyScalar(1 - 0.45 * u * u * (3 - 2 * u));
    }
    const f = this.focus;
    if (f?.panel?.rig.obj) {
      // buttons appear only once the card has arrived in the focus view (and are gone as soon as it leaves)
      // fully opaque at once (never inherits the dim); only a quick scale-in
      const k = Math.min(1, Math.max(0, (viewOf(f.e).focusAmt - 0.8) / 0.12));
      const o = f.panel.rig.obj;
      o.visible = f.panel.rig.ready && k > 0.02;
      o.scale.multiplyScalar(0.85 + 0.15 * k);
    }
    if (f) {
      // the card follows the head like its buttons do (it used to stay where it flew in and clipped when the head pitched)
      f.rig.update(dt, this.now, this.eye, this.look, cam, null);
      const v = viewOf(f.e);
      v.focusP.copy(f.rig.pos);
      v.focusQ.copy(f.rig.quat);
      v.focusS = f.rig.scale;
      // pinching anywhere else closes a card opened just to read it
      if (!f.review) {
        for (const h of ['left', 'right'] as const) {
          if (this.input.xr.getSelectState(h).start && !f.elsewhere) f.elsewhere = this.now + 0.25;
        }
        if (f.elsewhere && this.now >= f.elsewhere) this.exitFocus();
      }
    }
    this.dim.update(!!f, dt);
  }

  /** Angle for an offset given in fractions of the real vertical view at the focus distance. */
  private focusDown(frac: number) {
    return Math.atan(frac * 2 * Math.tan((realFov(this.world.camera) * Math.PI) / 360));
  }

  /** Fly a card from its world spot to the centre of the view, drawn over everything. */
  private enterFocus(e: Entity, review: boolean) {
    if (this.focus || this.now - this.focusEnd < 0.3 || !e.active) return;
    const v = viewOf(e);
    const root = e.object3D!;
    if (!v.anchored) v.lock(root.position, root.quaternion);
    const rig = new ViewRig(null, { dist: 0.5, down: this.focusDown(-0.07), fill: 0.6, fillW: 0.7, realFov: true, noEnv: true, yawOnly: false, pitchMax: FOCUS_PITCH, deadzone: (5 * Math.PI) / 180, delay: 0.15, maxScale: 3 });
    rig.setBase(CARD_W, CARD_H);
    rig.snap(this.look);
    rig.update(0.016, this.now, this.eye, this.look, this.world.camera, null);
    v.focusP.copy(rig.pos);
    v.focusQ.copy(rig.quat);
    v.focusS = rig.scale;
    this.focus = { e, rig, panel: null, review, elsewhere: 0 };
    if (!review && e.hasComponent(DistanceGrabbable)) {
      this.release(e);
      e.removeComponent(DistanceGrabbable);
    }
    v.focusOn = true;
    v.setProgress(0); // the recall ring never sits on the focus card
    audio.lift();
    this.burst.emit(rig.pos, 20, 0.5);
    void this.focusPanel(e, review);
  }

  private async focusPanel(e: Entity, review: boolean) {
    const ep = this.epoch;
    const f = this.focus; // identity of THIS focus: the same card can be closed and reopened while the panel loads
    // The buttons sit slightly nearer the head than the card, so neither a ray nor a fingertip can reach the card first.
    const p = await this.panel('actions', { dist: 0.46, down: this.focusDown(0.34), fill: 0.13, fillW: 0.7, maxScale: 0.6, realFov: true, noEnv: true, pitchMax: FOCUS_PITCH, deadzone: (5 * Math.PI) / 180, delay: 0.15 }, true);
    if (!p) return;
    if (ep !== this.epoch || !f || this.focus !== f) {
      this.dropPanel(p);
      return;
    }
    f.panel = p;
    const ids = review ? ['btn-got', 'btn-missed'] : ['btn-back'];
    for (const id of ids) p.doc.getElementById(id)?.setProperties({ display: 'flex' });
    if (review) {
      this.button(p, 'btn-got', () => this.grade(e, true), INK_BTN);
      this.button(p, 'btn-missed', () => this.grade(e, false), QUIET_BTN);
    } else this.button(p, 'btn-back', () => this.exitFocus(), QUIET_BTN);
  }

  /** Release a card another hand may still hold (before its grab component goes away). */
  private release(e: Entity) {
    if (!this.queries.grabbed.entities.has(e)) return;
    this.grabSys ??= this.world.getSystem(GrabSystem) ?? null;
    this.grabSys?.forceRelease(e);
  }

  /**
   * A button that works three ways: a ray click (UIKit event), a fingertip touching it, and a pinch made with the
   * fingertip right at it (the hand ray is dropped when the hand is that close). All three share one debounce.
   */
  private button(p: { e: Entity; doc: UIKitDocument }, id: string, fn: () => void, hover?: { hover: string; down: string; base: string }) {
    const el = p.doc.getElementById(id) as unknown as PokeEl | undefined;
    if (!el) return;
    const key = `${p.e.index}:${id}`;
    const fire = () => {
      if (this.now - (this.firedAt.get(key) ?? -9) < 0.6) return;
      this.firedAt.set(key, this.now);
      audio.press();
      // press flash (uikit's own active state can stick after a fingertip poke, so it is not used)
      if (hover) {
        el.setProperties({ backgroundColor: hover.down });
        const ep = this.epoch;
        this.after(0.16, () => ep === this.epoch && el.setProperties({ backgroundColor: hover.base }));
      }
      fn();
    };
    el.addEventListener('click', fire);
    if (hover) el.setProperties({ hover: { backgroundColor: hover.hover } });
    this.buttons.push({ e: p.e, el, key, fn: fire, prev: [-1, -1], born: this.now });
  }

  /** Fingertip contact and near-pinch for the buttons of live panels. Allocation free. */
  private updatePokes() {
    if (!this.buttons.length) return;
    for (const side of ['left', 'right'] as const) {
      const tipSpace = this.player.indexTipSpaces?.[side];
      if (!tipSpace) continue;
      tipSpace.getWorldPosition(this.tip);
      const pinch = this.input.xr.getSelectState(side).start;
      const i = side === 'left' ? 0 : 1;
      for (const b of this.buttons) {
        const root = b.e.object3D;
        if (!root?.visible || !b.e.active || b.el.displayed?.value === false) {
          b.prev[i] = -1;
          continue;
        }
        if (root.position.distanceToSquared(this.tip) > 0.4) {
          b.prev[i] = -1;
          continue;
        }
        const mw = b.el.matrixWorld;
        this.pokeO.setFromMatrixPosition(mw);
        this.pokeN.setFromMatrixColumn(mw, 2).normalize();
        const d = this.pokeL.copy(this.tip).sub(this.pokeO).dot(this.pokeN);
        this.pokeM.copy(mw).invert();
        this.pokeL.copy(this.tip).applyMatrix4(this.pokeM); // x, y in the element's unit square
        const inside = Math.abs(this.pokeL.x) < 0.56 && Math.abs(this.pokeL.y) < 0.62;
        const wasFront = b.prev[i] > POKE_FRONT;
        b.prev[i] = inside ? d : -1;
        if (!inside || this.now - b.born < 0.5) continue; // a hand resting where a panel appears never presses it
        if (wasFront && d <= POKE_FRONT && d > -0.1) b.fn();
        else if (pinch && Math.abs(d) < POKE_PINCH) b.fn();
      }
    }
  }

  private dropPanel(p: { e: Entity; rig: ViewRig }) {
    this.rigs = this.rigs.filter((r) => r !== p.rig);
    this.overlays = this.overlays.filter((o) => o.g !== p.rig.obj);
    this.tmp = this.tmp.filter((x) => x !== p.e);
    this.buttons = this.buttons.filter((b) => b.e !== p.e);
    if (p.e.active) p.e.dispose();
  }

  /** Panels that are shrinking away (about 200 ms) instead of vanishing in one frame. */
  private leaving: { p: { e: Entity; rig: ViewRig }; t0: number }[] = [];

  private fadePanel(p: { e: Entity; rig: ViewRig }) {
    this.buttons = this.buttons.filter((b) => b.e !== p.e); // no longer pressable
    this.leaving.push({ p, t0: this.now });
  }

  /** Fly the focused card back to its exact world pose. The anchor was never touched. */
  private exitFocus() {
    const f = this.focus;
    if (!f) return;
    this.focus = null;
    this.focusEnd = this.now;
    viewOf(f.e).focusOn = false;
    if (f.panel) this.fadePanel(f.panel);
    audio.tick();
    if (!f.review) {
      const ep = this.epoch;
      this.after(0.7, () => {
        if (ep === this.epoch && f.e.active && !f.e.hasComponent(DistanceGrabbable)) {
          f.e.addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget, rotate: false, scale: false });
        }
      });
    }
  }

  // ---------- carrying: surface snap preview ----------

  private updateCarry(dt: number) {
    let e: Entity | null = null;
    for (const g of this.queries.grabbed.entities) e = g;
    if (!e || this.phase !== 'placing') {
      this.ghost.hide();
      this.plFor = null;
      return;
    }
    if (this.now - this.surfAt > 1) {
      this.surfAt = this.now;
      const extra: (Object3D | undefined)[] = [];
      // real-world surfaces only matter in passthrough ('home'); VR settings tag their own meshes placeable
      if ((getActivePalace()?.setting ?? 'home') === 'home') {
        for (const p of this.queries.planes.entities) extra.push(p.object3D);
        for (const m of this.queries.rmeshes.entities) extra.push(m.object3D);
      }
      // the candidate list is cached: it is rebuilt only when the room or the scene-understanding set changes
      const root = currentEnvironment()?.root ?? null;
      if (root !== this.envSeen) [this.envSeen, this.envKey] = [root, this.envKey + 1];
      this.surfaces.refresh(extra, `${this.envKey}:${extra.length}`);
    }
    const root = e.object3D!;
    const v = viewOf(e);
    // the snap solve (rays against the room) only reruns when the card moved or a tenth of a second passed
    if (this.plFor !== e || this.now - this.lastSolveAt > 0.1 || root.position.distanceToSquared(this.lastSolveP) > 2.5e-5) {
      this.solvePlacement(e, true);
      this.lastSolveAt = this.now;
      this.lastSolveP.copy(root.position);
    }
    const pl = this.pl;
    this.plFor = e;
    v.carryTarget ??= new Quaternion();
    v.carryTarget.copy(pl.q);
    this.ghost.show(pl, e.getValue(Card, 'index')!, dt);
  }

  /** Where would this card land? Writes this.pl: a snap onto a wall, table or shelf, else free in the air facing the head. */
  private solvePlacement(e: Entity, held: boolean) {
    const root = e.object3D!;
    const pl = this.pl;
    this.grabSys ??= this.world.getSystem(GrabSystem) ?? null;
    const hand = held ? (this.grabSys?.getHolderHand(e) ?? null) : null;
    // Candidate rays, first one that gives a usable surface wins (a ray that only grazes a cushion or a curved
    // edge must not block the ones after it): 1. along the holding hand's ray (the card rides this ray),
    // 2. from the head through the card, 3. straight down onto a table, shelf or ledge just under the card.
    let ok = false;
    if (hand) {
      const rs = this.player.raySpaces[hand];
      rs.getWorldPosition(this.rayO);
      rs.getWorldQuaternion(this.rayQ);
      this.rayD.set(0, 0, -1).applyQuaternion(this.rayQ);
      const d = this.rayO.distanceTo(root.position);
      ok = this.surfaces.cast(this.rayO, this.rayD, Math.max(0, d - 0.25), d + 0.5, this.hitAt, this.hitN) >= 0 && poseOnSurface(this.hitAt, this.hitN, this.eye, pl);
    }
    if (!ok) {
      this.rayD.copy(root.position).sub(this.eye);
      const d = this.rayD.length();
      this.rayD.divideScalar(d || 1);
      ok = this.surfaces.cast(this.eye, this.rayD, Math.max(0, d - 0.25), d + 0.45, this.hitAt, this.hitN) >= 0 && poseOnSurface(this.hitAt, this.hitN, this.eye, pl);
    }
    if (!ok) {
      this.rayD.set(0, -1, 0);
      ok = this.surfaces.cast(root.position, this.rayD, 0, 0.5, this.hitAt, this.hitN) >= 0 && poseOnSurface(this.hitAt, this.hitN, this.eye, pl);
    }
    if (!ok) {
      // free in the air: exactly where it is, upright, facing the user
      pl.kind = 'free';
      pl.p.copy(root.position);
      facingQuat(pl.p, this.eye, pl.q);
    }
    // Decoration (banners, window frames) is not placeable but is drawn in front of walls: never hide a card behind it.
    const env = currentEnvironment();
    if (env && pl.kind !== 'free') {
      this.rayD.copy(pl.p).sub(this.eye);
      const dist = this.rayD.length();
      this.rayD.divideScalar(dist || 1);
      const t = this.surfaces.envClear(env.root, this.eye, this.rayD, dist - 0.012, this.hitAt, this.hitN);
      if (t < dist - 0.012) poseOnSurface(this.hitAt, this.hitN, this.eye, pl);
    }
    if (env && pl.kind === 'wall') this.fitWall(env.root, pl);
    this.fitPlacement(e, pl);
  }

  /** True when the whole card face rests on one surface (all four corners touch it), so it neither hangs off the edge of a TV or frame nor sinks into it. */
  private wallSupported(root: Object3D, pl: Placement) {
    const n = this.fitN.set(0, 0, 1).applyQuaternion(pl.q);
    const t = this.fitT.set(1, 0, 0).applyQuaternion(pl.q);
    const want = 0.06 + THICK_OFF; // corner ray starts 6 cm out and the card sits THICK_OFF off its surface
    this.fitD.copy(n).negate();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        this.fitO.copy(pl.p).addScaledVector(t, sx * ((CARD_W * PLACED_SCALE) / 2 - 0.005)).addScaledVector(this.up, sy * ((CARD_H * PLACED_SCALE) / 2 - 0.005)).addScaledVector(n, 0.06);
        if (Math.abs(this.surfaces.envClear(root, this.fitO, this.fitD, 0.2) - want) > 0.012) return false;
      }
    }
    return true;
  }

  /** A card half on a TV (or frame) and half on the wall behind it: slide it to the nearest spot where it sits fully on one surface. */
  private fitWall(root: Object3D, pl: Placement) {
    if (this.wallSupported(root, pl)) return;
    this.fitPre2.copy(pl.p);
    const t = this.wallT.set(1, 0, 0).applyQuaternion(pl.q);
    const n = this.wallN.set(0, 0, 1).applyQuaternion(pl.q);
    for (let step = 1; step <= 10; step++) {
      for (let k = 0; k < 4; k++) {
        const s = 0.04 * step;
        // up, down, along the wall both ways
        this.wallC.copy(this.fitPre2).addScaledVector(k < 2 ? this.up : t, (k % 2 ? -1 : 1) * s);
        this.fitO.copy(this.wallC).addScaledVector(n, 0.3);
        this.fitD.copy(n).negate();
        const c = this.surfaces.envClear(root, this.fitO, this.fitD, 0.6, this.hitAt, this.hitN);
        if (c >= 0.6 || this.hitN.dot(n) < 0.9) continue;
        pl.p.copy(this.hitAt).addScaledVector(n, THICK_OFF);
        if (this.wallSupported(root, pl)) {
          pl.at.copy(this.hitAt);
          return;
        }
      }
    }
    pl.p.copy(this.fitPre2); // nowhere better: keep the first pose
  }

  /**
   * Keep a landing pose clear of walls, furniture and the cards already placed: slide it sideways (and up or down on
   * a wall) until the card's footprint is free. A few small iterations, no allocation.
   */
  private fitPlacement(e: Entity, pl: Placement) {
    const env = currentEnvironment();
    const cw = CARD_W * PLACED_SCALE;
    const ch = CARD_H * PLACED_SCALE;
    const halfW = cw / 2 + 0.015;
    const halfH = ch / 2 + 0.01;
    this.fitPre.copy(pl.p);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.fitT.set(1, 0, 0).applyQuaternion(pl.q);
      this.fitN.set(0, 0, 1).applyQuaternion(pl.q);
      for (const o of this.queries.cards.entities) {
        if (o === e || !this.state.poses[o.getValue(Card, 'conceptId')!]) continue;
        this.fitD.copy(o.object3D!.position).sub(pl.p);
        if (Math.abs(this.fitD.y) >= ch + 0.02 || Math.abs(this.fitD.dot(this.fitN)) > 0.12) continue;
        const along = this.fitD.dot(this.fitT);
        if (Math.abs(along) >= cw + 0.02) continue;
        pl.p.addScaledVector(this.fitT, (cw + 0.025 - Math.abs(along)) * (along > 0 ? -1 : 1));
        moved = true;
      }
      if (env) {
        for (const sgn of [-1, 1]) {
          this.fitO.copy(pl.p).addScaledVector(this.fitN, 0.04);
          this.fitD.copy(this.fitT).multiplyScalar(sgn);
          const c = this.surfaces.envClear(env.root, this.fitO, this.fitD, halfW);
          if (c < halfW) {
            pl.p.addScaledVector(this.fitT, -sgn * (halfW - c));
            moved = true;
          }
        }
        if (pl.kind === 'wall') {
          for (const sgn of [-1, 1]) {
            this.fitO.copy(pl.p).addScaledVector(this.fitN, 0.04);
            this.fitD.set(0, sgn, 0);
            const c = this.surfaces.envClear(env.root, this.fitO, this.fitD, halfH);
            if (c < halfH) {
              pl.p.y -= sgn * (halfH - c);
              moved = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    if (pl.kind === 'stand' && !pl.p.equals(this.fitPre)) {
      // slid along a table: it must still have something under it, else stay where it was
      this.fitD.set(0, -1, 0);
      const found = this.surfaces.cast(this.fitO.copy(pl.p), this.fitD, 0, ch / 2 + 0.1, this.hitAt, this.hitN);
      if (found < 0 || Math.abs(this.hitAt.y - pl.at.y) > 0.06) pl.p.copy(this.fitPre);
    }
    pl.at.add(this.fitD.copy(pl.p).sub(this.fitPre));
  }

  /** The pending card that comes next in path order. */
  private nextCard(): Entity | null {
    let next: Entity | null = null;
    for (const e of this.queries.cards.entities) {
      if (!this.pending.has(e.getValue(Card, 'conceptId')!)) continue;
      if (!next || e.getValue(Card, 'index')! < next.getValue(Card, 'index')!) next = e;
    }
    return next;
  }

  /** Capture only: seconds of steady looking before a far card opens, and a switch to hide the "Come closer" hint and the guide arrow. */
  farWait = FAR_WAIT;
  hideHints = false;

  private updateGaze(dt: number) {
    // Reveal rule: head within NEAR_DIST of the card AND looking at it (LOOK_COS). Demo key 5 bypasses it via autoCard.
    // Escape hatch: a card you cannot get close to opens after FAR_WAIT seconds of steady looking.
    let best: Entity | null = this.autoCard;
    let bestCos = LOOK_COS;
    let hintOn = false;
    let farBest: Entity | null = null;
    let farCos = LOOK_COS;
    for (const e of this.queries.cards.entities) {
      if (!this.pending.has(e.getValue(Card, 'conceptId')!)) continue;
      const vw = viewOf(e);
      if (vw.focused) continue; // still flying back from the focus view: not reveal-able yet
      this.v.copy(e.object3D!.position).sub(this.eye);
      const dist = this.v.length();
      const c = this.v.dot(this.look) / (dist || 1);
      const near = dist <= NEAR_DIST;
      if (!near && dist <= HINT_DIST && c > HINT_COS) hintOn = true;
      if (!this.autoCard && near && c > bestCos) [best, bestCos] = [e, c];
      else if (!near && dist <= FAR_DIST && c > farCos) [farBest, farCos] = [e, c];
    }
    if (!best && farBest) {
      const id = farBest.getValue(Card, 'conceptId')!;
      this.farT = id === this.farId ? this.farT + dt : 0;
      this.farId = id;
      if (this.farT > this.farWait) best = farBest;
      hintOn = true;
      this.hudText = this.farT > 1.2 ? 'Keep looking to open' : 'Come closer';
    } else {
      this.farT = 0;
      this.farId = '';
      this.hudText = 'Come closer';
    }
    for (const e of this.queries.cards.entities) {
      if (!this.pending.has(e.getValue(Card, 'conceptId')!)) continue;
      const v = viewOf(e);
      if (v.progress >= 1 && e === best) continue;
      const p = e === best ? v.progress + dt / FILL_TIME : v.progress - dt * 2.5;
      v.setProgress(Math.min(1, Math.max(0, p)));
    }
    const ready = !this.autoCard && !!best && viewOf(best).progress >= 1;
    this.hudOn = ready || (hintOn && !best && !this.hideHints);
    if (ready) this.hudText = 'Pinch to open';
    // guidance: arrow at the edge of view toward the next card, and the path brightening toward it
    const next = this.nextCard();
    const id = next?.getValue(Card, 'conceptId') ?? '';
    if (id !== this.guideId) {
      this.guideId = id;
      if (next && !this.hideHints) {
        const sorted = [...this.queries.cards.entities]
          .filter((c) => !this.demoThreadIds || this.demoThreadIds.includes(c.getValue(Card, 'conceptId')!))
          .sort((x, y) => x.getValue(Card, 'index')! - y.getValue(Card, 'index')!);
        const i = sorted.indexOf(next);
        this.thread.guide(i, this.v.set(this.head.x, this.head.y - 0.55, this.head.z));
      } else this.thread.guide(-1, null);
    }
    this.arrow.update(next && !this.hideHints ? next.object3D!.position : null, dt, this.now);
  }

  // ---------- phase machine ----------

  go(phase: Phase) {
    this.epoch++;
    const ep = this.epoch;
    this.phase = phase;
    for (const e of this.tmp) if (e.active) e.dispose();
    this.tmp.length = 0;
    this.leaving.length = 0;
    this.rigs.length = 0;
    this.focus = null;
    this.demoBusy = false;
    this.demoQueued = 0;
    this.grabStart.clear();
    for (const e of this.queries.cards.entities) viewOf(e).focusOn = false;
    this.timers.length = 0;
    this.thinking = null;
    this.hint = null;
    this.thread.show(phase === 'placing' || phase === 'review'); // it used to only ever hide, so after the generating phase the path never showed again
    this.ghost.hide();
    this.rate = null;
    this.revealed = null;
    this.autoCard = null;
    this.doneShown = false;
    this.guideId = '';
    this.buttons.length = 0;
    this.waiters.clear();
    const enter = {
      onboarding: () => this.enterOnboarding(),
      generating: () => this.enterGenerating(),
      placing: () => this.enterPlacing(),
      review: () => this.enterReview(),
      done: () => this.enterDone(),
    }[phase];
    // The room of the active palace has to exist before anything is placed in the view (panels keep out of its walls,
    // anchor() looks for open space in it). No-op when the setting did not change.
    applySetting(this.world).then(
      () => ep === this.epoch && void enter(),
      () => ep === this.epoch && void enter(),
    );
  }

  private sleep(s: number) {
    return new Promise<void>((r) => this.timers.push({ at: this.now + s, fn: r }));
  }

  private async enterOnboarding() {
    const ep = this.epoch;
    const saved = loadState();
    const pending = getPendingDeck();
    const hasSaved =
      !!saved && Object.keys(saved.poses).length > 0 && (!pending || pending.id === saved.deckId);
    if (hasSaved) this.deckId = saved.deckId;
    else this.deckId = pending?.id ?? DEMO_DECK_ID;
    this.state = hasSaved ? saved : emptyState(this.deckId);
    // writes belong to the palace that is open now, whatever becomes active later
    this.state.palaceId = getActivePalace()?.id ?? this.state.palaceId;
    this.disposeCards();
    this.anchor();
    const p = await this.panel('onboarding', { dist: 0.85, fill: 1.0, fillW: 0.75, noEnv: true, pitchMax: LEVEL_UP, pitchMin: LEVEL_DOWN });
    if (!p || ep !== this.epoch) return;
    const doc = p.doc;
    void this.addWordmark(p.e);
    this.hint = doc.getElementById('dots');
    // wire the buttons first: nothing below may leave the panel dead
    let mode: 'review' | 'new' = hasSaved ? 'review' : 'new';
    this.button(p, 'primary', () => (mode === 'review' ? this.go('review') : this.go('generating')), INK_BTN);
    this.button(p, 'secondary', () => this.confirmStartOver(doc, 'secondary-label', 'secondary'), QUIET_BTN);
    if (!hasSaved) {
      doc.getElementById('primary-label')?.setProperties({ text: pending ? 'Enter your palace' : 'Try the demo deck' });
      const n = pending?.count ?? 8;
      doc.getElementById('primary-sub')?.setProperties({
        text: `${pending?.title ?? 'Inside the Cell'}, ${n} concepts`,
      });
    }
    if (hasSaved) {
      let due = 0;
      try {
        const deck = await loadDeck(this.state.deckId);
        due = deck.concepts.filter((c) => isDue(this.state, c.id)).length;
      } catch {
        // the deck was removed: offer the demo deck instead of a dead panel
        if (ep !== this.epoch) return;
        mode = 'new';
        this.deckId = DEMO_DECK_ID;
        this.state = emptyState(DEMO_DECK_ID);
        this.state.palaceId = getActivePalace()?.id;
        doc.getElementById('tagline')?.setProperties({ text: 'This deck is missing.', color: '#2B2A33' });
        doc.getElementById('primary-label')?.setProperties({ text: 'Try the demo deck' });
        doc.getElementById('primary-sub')?.setProperties({ text: 'Inside the Cell, 8 concepts' });
        return;
      }
      if (ep !== this.epoch) return;
      doc.getElementById('tagline')?.setProperties({
        text: due ? `Today's review: ${due} card${due === 1 ? '' : 's'}` : 'All caught up for today',
        color: '#2B2A33',
      });
      doc.getElementById('primary-label')?.setProperties({ text: due ? 'Start review' : 'Review anyway' });
      doc.getElementById('primary-sub')?.setProperties({ display: 'none' });
      doc.getElementById('secondary')?.setProperties({ display: 'flex' });
    }
  }

  /**
   * "Start over" erases placements and progress, so it asks twice: the first press turns the button rose and asks,
   * the second one (within 4 s) does it. A missed pinch can never wipe a palace.
   */
  private confirmStartOver(doc: UIKitDocument, labelId: string, boxId: string) {
    const label = doc.getElementById(labelId);
    const box = doc.getElementById(boxId);
    if (this.now < this.eraseUntil) {
      this.eraseUntil = 0;
      this.newPalace(true);
      return;
    }
    this.eraseUntil = this.now + 4;
    audio.soft();
    label?.setProperties({ text: 'Erase and start over?' });
    const ep = this.epoch;
    this.after(0.2, () => ep === this.epoch && this.eraseUntil > 0 && box?.setProperties({ backgroundColor: '#F4C7C3' })); // after the press flash
    this.after(4, () => {
      if (ep !== this.epoch || this.now < this.eraseUntil - 0.01 || !this.eraseUntil) return;
      this.eraseUntil = 0;
      label?.setProperties({ text: 'Start over' });
      box?.setProperties({ backgroundColor: '#FBF7F0' });
    });
  }

  /** Castle doodle and wordmark, parented to the panel so they billboard and scale with it. */
  private async addWordmark(panel: Entity) {
    await document.fonts.load('700 128px "Bricolage Grotesque"').catch(() => undefined);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    drawWordmark(c.getContext('2d')!);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(2.6, 2.6),
      new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    mesh.raycast = () => undefined;
    const obj = panel.object3D!;
    const topLocal = 2.1; // the onboarding root is a fixed 420 units tall
    mesh.position.set(0, topLocal + 0.15, 0.02);
    mesh.renderOrder = 5;
    obj.add(mesh);
  }

  private async enterGenerating() {
    const ep = this.epoch;
    this.disposeCards();
    this.anchor();
    // load first: a missing deck must not wipe the palace, and falls back to the demo deck instead of hanging
    let deck: Deck;
    try {
      deck = await loadDeck(this.deckId);
    } catch {
      this.deckId = DEMO_DECK_ID;
      deck = await loadDeck(DEMO_DECK_ID);
    }
    if (ep !== this.epoch) return;
    this.deck = deck;
    const palaceId = this.state.palaceId;
    this.state = emptyState(this.deckId);
    this.state.palaceId = palaceId;
    this.persist();
    const castlePos = this.at(0.85, 0, 0, new Vector3());
    this.thinking = createCastleDraw(this.world, castlePos, this.eye);
    const orbPos = this.thinking.gate.clone();
    this.tmp.push(this.thinking.entity);
    this.genT0 = this.now;
    const built = this.buildCards(deck, orbPos);
    await Promise.all([built, this.sleep(THINK_TIME)]);
    if (ep !== this.epoch || !this.queries.cards.entities.size) return;
    const q = new Quaternion();
    const n = deck.concepts.length;
    for (const e of this.queries.cards.entities) {
      const i = e.getValue(Card, 'index')!;
      const to = this.fanPos(i, n, new Vector3());
      this.faceQuat(to, q);
      e.object3D!.quaternion.copy(q);
      viewOf(e).fly = { from: orbPos, to, start: this.now + i * 0.13, dur: 0.9 };
      this.after(i * 0.13, () => audio.deal());
    }
    await this.sleep(n * 0.13 + 1.1);
    if (ep === this.epoch) this.go('placing');
  }

  private enterPlacing() {
    for (const e of this.queries.cards.entities) {
      viewOf(e).setFace(false);
      viewOf(e).setProgress(0);
      viewOf(e).setDim(false);
      e.object3D!.visible = true;
      if (!e.hasComponent(DistanceGrabbable)) {
        // Distance grab: a ray from the hand/gaze picks the card and it follows the ray end point.
        e.addComponent(DistanceGrabbable, {
          movementMode: MovementMode.MoveFromTarget,
          rotate: false,
          scale: false,
        });
      }
    }
    if (Object.keys(this.state.poses).length) this.showDone();
    else this.placeHintUntil = this.now + 12; // first visit: say what to do, until the first card is picked up
  }

  /** Capture only: hide the "Done placing" pill (set from the dev console / recording scripts). */
  hideDonePill = false;
  private doneRig: ViewRig | null = null;

  private async showDone() {
    if (this.doneShown) return;
    this.doneShown = true;
    const ep = this.epoch;
    // calm tag-along: it only follows after the gaze has stayed well away from it for a while (a big deadzone), and slowly
    const p = await this.panel('actions', { dist: 0.85, down: 0.47, fill: 0.14, fillW: 0.55, maxScale: 0.5, deadzone: (38 * Math.PI) / 180, delay: 1.5 });
    if (!p || ep !== this.epoch) return;
    this.doneRig = p.rig;
    p.doc.getElementById('btn-done')?.setProperties({ display: 'flex' });
    this.button(p, 'btn-done', () => {
      // Unmoved cards keep their fan pose so the whole palace restores.
      for (const e of this.queries.cards.entities) {
        const r = e.object3D!;
        this.state.poses[e.getValue(Card, 'conceptId')!] ??= {
          p: r.position.toArray() as [number, number, number],
          q: r.quaternion.toArray() as [number, number, number, number],
        };
      }
      this.persist();
      this.go('review');
    }, INK_BTN);
  }

  private async enterReview() {
    const ep = this.epoch;
    this.anchor();
    await this.ensureCards();
    if (ep !== this.epoch) return;
    const all = [...this.queries.cards.entities];
    let ids = all.map((e) => e.getValue(Card, 'conceptId')!).filter((id) => isDue(this.state, id));
    if (!ids.length) ids = all.map((e) => e.getValue(Card, 'conceptId')!);
    this.pending = new Set(ids);
    this.refreshThread(false);
    this.tried.clear();
    this.stats = { got: 0, missed: 0 };
    all.sort((a, b) => a.getValue(Card, 'index')! - b.getValue(Card, 'index')!);
    all.forEach((e, i) => {
      const v = viewOf(e);
      // review uses exactly the placed poses
      const pose = this.state.poses[e.getValue(Card, 'conceptId')!];
      if (pose) {
        const r = e.object3D!;
        r.position.fromArray(pose.p);
        r.quaternion.fromArray(pose.q);
        v.lock(r.position, r.quaternion);
      }
      this.release(e);
      e.removeComponent(DistanceGrabbable);
      if (!e.hasComponent(PokeInteractable)) e.addComponent(PokeInteractable); // direct poke or pinch in reach
      e.object3D!.visible = this.pending.has(e.getValue(Card, 'conceptId')!);
      v.setDim(false);
      v.setBadge(null);
      v.setFace(true); // never a frame of the front: it would spoil the recall
      v.setProgress(0);
    });
  }

  /** Capture only: how large the end panel may grow (0.25 is the shipped size). */
  endMaxScale = 0.25;
  /** Capture only: fraction of the view height the end panel fills (0.62 is the shipped value). */
  endFill = 0.62;

  private async enterDone() {
    const ep = this.epoch;
    this.anchor();
    // wait until every card has finished flying back, so nothing passes in front of the panel
    for (let i = 0; i < 40 && (this.focus || [...this.queries.cards.entities].some((c) => viewOf(c).focused)); i++) await this.sleep(0.1);
    if (ep !== this.epoch) return;
    this.anchor();
    const p = await this.panel('end', { dist: 0.9, fill: this.endFill, fillW: 0.7, maxScale: this.endMaxScale, noEnv: true, pitchMax: LEVEL_UP, pitchMin: LEVEL_DOWN }, true);
    if (!p || ep !== this.epoch) return;
    p.doc.getElementById('got-n')?.setProperties({ text: String(this.stats.got) });
    p.doc.getElementById('miss-n')?.setProperties({ text: String(this.stats.missed) });
    this.button(p, 'again', () => this.go('review'), INK_BTN);
    this.button(p, 'over', () => this.confirmStartOver(p.doc, 'over-label', 'over'), QUIET_BTN);
    audio.chime();
  }

  // ---------- placing ----------

  private onRelease(e: Entity) {
    const started = this.grabStart.get(e);
    this.grabStart.delete(e);
    if (this.phase !== 'placing' || this.focus?.e === e || !e.active) return;
    const root = e.object3D!;
    const v = viewOf(e);
    v.carryTarget = null;
    // a pinch released without dragging the card is a click: open it in the focus view, leave its world pose alone
    if (started && this.now - started.t < 0.9 && root.position.distanceTo(started.p) < 0.05) {
      this.plFor = null;
      this.ghost.hide();
      this.enterFocus(e, false);
      return;
    }
    // the preview from the last carried frame is the landing pose
    const pl = this.pl;
    // a second card carried with the other hand has no preview of its own: solve it now
    if (this.plFor !== e) this.solvePlacement(e, false);
    this.plFor = null;
    v.glideTo(root, pl.p, pl.q, this.now, 0.3); // a visible, soft landing (it was 0.16 s)
    v.thump();
    this.burst.emit(pl.p, 24, 0.5);
    audio.thud();
    audio.sparkle();
    this.ghost.hide();
    this.state.poses[e.getValue(Card, 'conceptId')!] = {
      p: pl.p.toArray() as [number, number, number],
      q: pl.q.toArray() as [number, number, number, number],
    };
    this.persist();
    this.refreshThread();
    void this.showDone();
  }

  // ---------- review ----------

  private tryReveal(e: Entity) {
    const id = e.getValue(Card, 'conceptId')!;
    if (this.revealed || !this.pending.has(id) || viewOf(e).progress < 1) return;
    void this.reveal(e);
  }

  private async reveal(e: Entity) {
    const ep = this.epoch;
    this.revealed = e;
    this.revealAt = this.now;
    this.farT = 0; // a far dwell is spent once it opens: the same card must be looked at again to reopen
    this.farId = '';
    viewOf(e).setBadge(null);
    viewOf(e).flipTo(false);
    viewOf(e).setProgress(0);
    audio.flip();
    this.after(0.35, audio.chime);
    this.after(0.45, () => this.burst.emit(e.object3D!.position, 64, 1.25));
    await this.sleep(0.6);
    // wait until no other card is still flying home and the focus lockout is over, so the focus view always takes
    for (let i = 0; i < 50 && (this.focus || this.now - this.focusEnd < 0.32 || [...this.queries.cards.entities].some((c) => c !== e && viewOf(c).focused)); i++) await this.sleep(0.1);
    if (ep !== this.epoch) return;
    // the revealed card is the focus view: Got it / Missed sit directly under it
    this.enterFocus(e, true);
    if (this.focus?.e !== e) {
      // the focus view did not open: never leave the review stuck on a half-revealed card
      this.revealed = null;
      viewOf(e).flipTo(true);
    }
  }

  private grade(e: Entity, got: boolean) {
    if (this.revealed !== e) return;
    const id = e.getValue(Card, 'conceptId')!;
    grade(this.state, id, got);
    this.persist();
    if (!this.tried.has(id)) {
      this.tried.add(id);
      this.stats[got ? 'got' : 'missed']++;
    }
    this.rate = null;
    this.revealed = null;
    const v = viewOf(e);
    this.exitFocus();
    v.setBadge(got ? 'got' : 'missed');
    this.after(0.25, () => viewOf(e).flipTo(true));
    if (!got) audio.soft();
    else audio.tick();
    if (got) {
      this.pending.delete(id);
      v.setDim(true);
    }
    if (!this.pending.size) {
      const ep = this.epoch;
      void this.sleep(1.2).then(() => ep === this.epoch && this.go('done'));
    }
  }

  // ---------- cards ----------

  private async idle() {
    while (this.building) await this.building.catch(() => undefined);
  }

  /** Build the deck's cards. Serialised (never two builds at once) and dropped if the phase changed meanwhile. */
  private async buildCards(deck: Deck, from: Vector3) {
    await this.idle();
    const ep = this.epoch;
    const run = (async () => {
      const made = await Promise.all(
        deck.concepts.map((c, i) => {
          const cut = c.cutout
            ? /^(data:|https?:\/\/|blob:)/i.test(c.cutout)
              ? c.cutout
              : deck.base + c.cutout
            : deck.base
              ? `${deck.base}cut/${c.id}.png`
              : null;
          return createCard(this.world, c, i, resolveImage(deck, c), cut);
        }),
      );
      if (ep !== this.epoch) {
        // the flow moved on while the images decoded: these cards would be zombies
        for (const e of made) e.dispose({ disposeResources: true });
        return;
      }
      made.forEach((e, i) => {
        if (e.object3D!.userData.hasCutout) deck.concepts[i].cutout ??= `cut/${deck.concepts[i].id}.png`;
        e.object3D!.position.copy(from);
        e.object3D!.visible = false;
      });
    })();
    const tracked = run.finally(() => {
      if (this.building === tracked) this.building = null;
    });
    this.building = tracked;
    await tracked;
  }

  /** Make sure cards exist at their saved poses (used when entering review from storage). */
  private async ensureCards() {
    await this.idle();
    if (this.queries.cards.entities.size) return;
    const ep = this.epoch;
    let deck: Deck;
    try {
      deck = await loadDeck(this.state.deckId);
    } catch {
      deck = await loadDeck(DEMO_DECK_ID);
    }
    if (ep !== this.epoch) return;
    this.deck = deck;
    await this.buildCards(deck, this.at(0.5, 0, -0.3, new Vector3()));
    if (ep !== this.epoch) return;
    const q = new Quaternion();
    const n = deck.concepts.length;
    for (const e of this.queries.cards.entities) {
      const i = e.getValue(Card, 'index')!;
      const pose = this.state.poses[e.getValue(Card, 'conceptId')!];
      const root = e.object3D!;
      if (pose) {
        root.position.fromArray(pose.p);
        root.quaternion.fromArray(pose.q);
      } else {
        this.fanPos(i, n, root.position);
        root.quaternion.copy(this.faceQuat(root.position, q));
      }
      viewOf(e).lock(root.position, root.quaternion);
      root.visible = true;
    }
  }

  private disposeCards() {
    for (const e of [...this.queries.cards.entities]) e.dispose({ disposeResources: true });
  }

  /** Clear everything and start over from the onboarding panel. */
  newPalace(generate = false) {
    clearState(this.state.palaceId);
    const palaceId = this.state.palaceId;
    this.state = emptyState(this.deckId);
    this.state.palaceId = palaceId;
    this.disposeCards();
    this.go(generate ? 'generating' : 'onboarding');
  }

  // ---------- spatial helpers ----------

  /**
   * Remember the head position and a flat forward direction. Inside a VR environment this is the open bearing
   * nearest to where the user looks, so panels and the card fan never spawn inside furniture or a throne.
   */
  private anchor() {
    this.head.copy(this.eye);
    this.fwd.set(this.look.x, 0, this.look.z);
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const env = currentEnvironment();
    if (env) {
      const base = Math.atan2(this.fwd.x, -this.fwd.z); // yaw of the gaze, 0 = -Z
      let bestA = base;
      let bestS = -1;
      let pick = false;
      const probe = new Vector3();
      const dir = new Vector3();
      const score = (a: number) => {
        let sc = 9;
        for (const off of [-0.7, -0.35, 0, 0.35, 0.7]) {
          for (const dy of [0.3, 0, -0.3]) { // card height range only: a table or island below the cards does not block
            dir.set(Math.sin(a + off), 0, -Math.cos(a + off));
            probe.set(this.head.x, this.head.y + dy, this.head.z);
            sc = Math.min(sc, this.surfaces.envClear(env.root, probe, dir, 2.2));
          }
        }
        return sc;
      };
      // try the gaze first, then fan out in 15 degree steps, alternating sides
      for (let i = 0; i < 24 && !pick; i++) {
        const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
        const sc = score(a);
        if (sc > bestS) [bestS, bestA] = [sc, a];
        if (sc >= 1.3) pick = true; // the fan is 0.85 m out, so 1.3 m of free space in front is enough
      }
      this.fwd.set(Math.sin(bestA), 0, -Math.cos(bestA));
    }
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    this.pitch = Math.max(-0.3, Math.min(0.3, Math.asin(this.look.y)));
  }

  /** Point relative to the anchored head: forward, right, up. */
  private at(f: number, r: number, up: number, out: Vector3) {
    out.copy(this.head).addScaledVector(this.fwd, f).addScaledVector(this.right, r);
    out.y = this.head.y + up + Math.tan(this.pitch) * f;
    return out;
  }

  /** Two gently curved rows of four, 0.6 m away, within about 30 degrees of forward. */
  private fanPos(i: number, n: number, out: Vector3) {
    const perRow = Math.ceil(n / 2);
    const col = i % perRow;
    // 0.85 m away, within +-21 degrees and two rows tall: always inside the field of view
    const a = ((col / Math.max(1, perRow - 1)) * 2 - 1) * ((21 * Math.PI) / 180);
    const row = i < perRow ? 0.13 : -0.17;
    return this.at(Math.cos(a) * 0.85, Math.sin(a) * 0.85, row, out);
  }

  /** Capture only: restrict the path thread to these concept ids (null = every card). */
  demoThreadIds: string[] | null = null;

  /** Rebuild the path thread through the cards in concept order. */
  private refreshThread(animate = true) {
    const sorted = [...this.queries.cards.entities]
      .filter((e) => !this.demoThreadIds || this.demoThreadIds.includes(e.getValue(Card, 'conceptId')!))
      .sort((a, b) => a.getValue(Card, 'index')! - b.getValue(Card, 'index')!);
    this.pts = sorted.map((e) => {
      const pose = this.state.poses[e.getValue(Card, 'conceptId')!];
      const p = pose ? new Vector3().fromArray(pose.p) : e.object3D!.position.clone();
      // sit inside the card's slab, a hair off the surface: the card hides the thread where it lands, and between cards the dotted line runs just in front of the wall (it used to sit 3 cm inside the wall and never showed)
      if (pose) this.v.set(0, 0, 0.012).applyQuaternion(this.rayQ.fromArray(pose.q));
      else this.v.set(0, 0, 0);
      return p.add(this.v);
    });
    this.thread.set(this.pts, animate);
  }

  /** Upright rotation whose +Z turns toward the user's head (yaw only: cards never tilt or lean). */
  private faceQuat(pos: Vector3, out: Quaternion) {
    return facingQuat(pos, this.eye, out);
  }

  private after(s: number, fn: () => void) {
    this.timers.push({ at: this.now + s, fn });
  }

  /**
   * Spawn a UIKitML panel centred in the current view: fitted inside the field of view, kept out of room geometry,
   * and lazily following the head (see ViewRig). `overlay` draws it over everything (focus view buttons).
   */
  private async panel(file: string, o: RigOptions, overlay = false) {
    const ep = this.epoch;
    const g = new Group();
    g.scale.setScalar(0.1);
    g.visible = false;
    const rig = new ViewRig(g, o);
    rig.snap(this.look);
    g.position.copy(this.eye).addScaledVector(rig.dir, o.dist);
    const e = this.world.createTransformEntity(g);
    this.tmp.push(e);
    this.rigs.push(rig);
    const doc = new Promise<UIKitDocument>((res) => this.waiters.set(e.index, res));
    e.addComponent(PanelUI, { config: `${import.meta.env.BASE_URL}ui/${file}.uikitml` });
    e.addComponent(RayInteractable).addComponent(PokeInteractable);
    const d = await doc;
    if (ep !== this.epoch) return null;
    if (overlay) this.overlayPanel(g, d);
    return { e, doc: d, rig };
  }

  /** Draw a panel over everything, ignoring the depth buffer, for as long as it lives. */
  private overlayPanel(g: Group, doc: UIKitDocument) {
    doc.rootElement.setProperties({ depthTest: false, renderOrder: 6500 } as never);
    const each = (o: Object3D) => {
      const m = (o as Mesh).material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
      if (!m) return;
      o.renderOrder = 6500;
      for (const x of Array.isArray(m) ? m : [m]) x.depthTest = false;
    };
    const apply = () => g.traverse(each);
    apply();
    // UIKit adds meshes lazily (a button turned on with display:flex): keep claiming them for as long as the panel lives
    this.overlays.push({ g, apply, until: this.now + 3, at: this.now });
  }
  private overlays: { g: Group; apply: () => void; until: number; at: number }[] = [];

  // ---------- demo director ----------

  /** Place every card in a spread around the user, facing them. */
  async demoAutoPlace() {
    await this.idle();
    if (this.phase !== 'placing' || !this.queries.cards.entities.size) {
      if (!this.queries.cards.entities.size) {
        const palaceId = this.state.palaceId;
        this.disposeCards();
        this.state = emptyState(this.deckId);
        this.state.palaceId = palaceId;
        this.anchor();
        const deck = await loadDeck(this.deckId);
        this.deck = deck;
        await this.idle();
        if (!this.queries.cards.entities.size) await this.buildCards(deck, this.at(0.5, 0, -0.3, new Vector3()));
      }
      this.go('placing');
    }
    this.anchor();
    const q = new Quaternion();
    let i = 0;
    for (const e of this.queries.cards.entities) {
      const [deg, dist, up] = SPREAD[e.getValue(Card, 'index')! % SPREAD.length];
      const a = (deg * Math.PI) / 180;
      const to = this.at(Math.cos(a) * dist, Math.sin(a) * dist, up, new Vector3());
      this.faceQuat(to, q);
      const v = viewOf(e);
      v.fly = { from: e.object3D!.position.clone(), to, start: this.now + i * 0.08, dur: 0.9, toQ: q.clone() };
      e.object3D!.visible = true;
      this.state.poses[e.getValue(Card, 'conceptId')!] = {
        p: to.toArray() as [number, number, number],
        q: q.toArray() as [number, number, number, number],
      };
      i++;
    }
    this.persist();
    this.refreshThread();
    void this.showDone();
  }

  /** Demo key 5: fill the ring, flip, mark got it. */
  async demoRevealNext() {
    if (this.phase !== 'review') return;
    // key 5 in quick succession queues: two focus animations never overlap
    if (this.demoBusy || this.autoCard || this.revealed) {
      this.demoQueued = Math.min(this.demoQueued + 1, 4);
      return;
    }
    const ep = this.epoch;
    let next: Entity | null = null;
    for (const e of this.queries.cards.entities) {
      if (!this.pending.has(e.getValue(Card, 'conceptId')!)) continue;
      if (!next || e.getValue(Card, 'index')! < next.getValue(Card, 'index')!) next = e;
    }
    if (!next) return;
    this.demoBusy = true;
    try {
      this.autoCard = next;
      await this.sleep(FILL_TIME + 0.2);
      if (ep !== this.epoch) return;
      this.autoCard = null;
      await this.reveal(next);
      await this.sleep(3.2); // long enough to read the focused card
      if (ep === this.epoch) this.grade(next, true);
      await this.sleep(0.9); // let it fly back before the next one
    } finally {
      this.demoBusy = false;
      if (ep === this.epoch && this.demoQueued > 0) {
        this.demoQueued--;
        void this.demoRevealNext();
      }
    }
  }

  async demoReview() {
    if (!this.state.poses || !Object.keys(this.state.poses).length) {
      await this.demoAutoPlace();
      await this.sleep(1.6);
    }
    this.go('review');
  }
}
