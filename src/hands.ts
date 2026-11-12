import {
  AnimatedHand,
  BackSide,
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type VisualConstructor,
  type VisualImplementation,
  Vector3,
  type World,
} from '@iwsdk/core';
import { THEME } from './theme.js';

// IWSDK's own rigged hand mesh (AnimatedHand), restyled: opaque matte warm skin plus a hair-thin ink outline.
// No procedural geometry and no forearm; the skinned mesh follows the tracked joints.
const SKIN = '#DC9B76';
const INK = new Color(THEME.ink);

const skin = new MeshStandardMaterial({
  color: new Color(SKIN).multiplyScalar(0.66), // the room lights read bright; this lands near the intended skin tone on screen
  emissive: new Color(SKIN),
  emissiveIntensity: 0.22, // a hand turned away from the lights (toward a dark TV) must never go dark: it keeps a skin-tone floor
  roughness: 0.8,
  metalness: 0,
  transparent: true, // transparent pass (opacity 1) so the hands stay above the focus view's paper veil
  opacity: 1,
  depthWrite: true,
});

// Wrist fade: AnimatedHand.init() stores each vertex's bind-pose distance to the wrist joint (metres) in `wristDist`.
// Alpha ramps up over that distance so the mesh dissolves into the air instead of ending in a flat cut. A faint warm
// rim (view-angle based) keeps the matte skin from reading flat.
const FADE_FROM = 0.018;
const FADE_TO = 0.075;
// Near-camera fade, per hand: a hand whose wrist is closer to the eyes than NEAR_FROM is gone, one beyond NEAR_TO is
// untouched. The in-between is a screen-space dither (alpha hash) on opaque pixels, not partial alpha, so overlapping
// fingers never turn into a ghostly translucent hand. `uNear` is 0..1 and set per hand each frame.
const NEAR_FROM = 0.17;
const NEAR_TO = 0.24; // narrow band: the dither is only on screen while a hand sweeps through it
const DITHER = `if (uNear < 0.999 && uNear <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;`;
const patchSkin = (sh: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> }, u: { value: number }) => {
  sh.uniforms.uNear = u;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float wristDist;\nvarying float vWristDist;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWristDist = wristDist;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vWristDist;\nuniform float uNear;')
    .replace(
      '#include <opaque_fragment>',
      `float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
      outgoingLight += vec3(0.09, 0.05, 0.03) * rim;
      float wristFade = smoothstep(${FADE_FROM.toFixed(3)}, ${FADE_TO.toFixed(3)}, vWristDist);
      diffuseColor.a *= wristFade;
      if (diffuseColor.a < 0.02) discard;
      ${DITHER}
      #include <opaque_fragment>`,
    );
};

const outline = new ShaderMaterial({
  uniforms: { thickness: { value: 0.0007 }, ink: { value: INK }, uNear: { value: 1 } },
  vertexShader: `
    #include <common>
    #include <skinning_pars_vertex>
    uniform float thickness;
    attribute float wristDist;
    varying float vWristDist;
    void main() {
      #include <skinbase_vertex>
      #include <beginnormal_vertex>
      #include <skinnormal_vertex>
      #include <defaultnormal_vertex>
      vec3 transformed = position + normal * thickness;
      #include <skinning_vertex>
      vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mv;
      vWristDist = wristDist;
    }`,
  fragmentShader: `
    uniform vec3 ink;
    varying float vWristDist;
    uniform float uNear;
    void main() {
      // the ink shell sits behind the skin, so it must only appear once the skin is opaque; otherwise it shows as a dark smear
      float a = smoothstep(${FADE_TO.toFixed(3)}, ${(FADE_TO + 0.03).toFixed(3)}, vWristDist);
      if (a < 0.02) discard;
      ${DITHER}
      gl_FragColor = vec4(ink, a);
    }`,
  side: BackSide,
  transparent: true,
  depthWrite: true,
});

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const _ringP = new Vector3();
const _headP = new Vector3();
let headCam: Object3D | null = null;

/** The stock skinned hand with a solid skin material, and an ink ring on the index tip that tightens as the pinch closes. */
export class LociHand extends AnimatedHand {
  static assetKeyPrefix = 'loci-hand';
  private ring!: Sprite;
  private ringMat!: SpriteMaterial;
  private nearU = { value: 1 };
  private wrist: Object3D | null = null;

  init() {
    super.init(); // frustum culling off, scale, wristDist attribute, base mesh + outline clone
    const meshes: SkinnedMesh[] = [];
    this.model.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && meshes.push(o as SkinnedMesh));
    // the stock init leaves two skinned meshes under one parent: the body, then the fading outline copy
    meshes.forEach((m, i) => {
      m.frustumCulled = false;
      if (i === 0) {
        const sm = skin.clone();
        sm.onBeforeCompile = (sh) => patchSkin(sh, this.nearU);
        m.material = sm;
      } else {
        const om = outline.clone();
        om.uniforms = { thickness: om.uniforms.thickness, ink: om.uniforms.ink, uNear: this.nearU };
        m.material = om;
      }
      m.renderOrder = i === 0 ? 6001 : 6000;
      m.raycast = () => undefined;
    });

    this.ringMat = new SpriteMaterial({ map: ringTexture(), color: INK, transparent: true, depthTest: false, toneMapped: false });
    this.ring = new Sprite(this.ringMat);
    this.ring.renderOrder = 6100;
    this.ring.raycast = () => undefined;
    this.model.getObjectByName('index-finger-tip')?.add(this.ring);
    this.wrist = this.model.getObjectByName('wrist') ?? null;
  }

  update() {
    super.update();
    if (!this.ring) return;
    const p = this.xrInput?.getPinchStrength() ?? 0;
    const near = p > 0.97;
    const r = 0.05 - 0.036 * p;
    this.ring.scale.setScalar(near ? r * 1.4 : r);
    let k = 1;
    if (headCam) {
      (this.wrist ?? this.ring).getWorldPosition(_ringP);
      const d = _ringP.distanceTo(headCam.getWorldPosition(_headP));
      k = Math.min(1, Math.max(0, (d - NEAR_FROM) / (NEAR_TO - NEAR_FROM)));
    }
    this.nearU.value = k;
    this.ringMat.opacity = (near ? 0.35 : 0.2 + 0.8 * p) * k;
    this.ring.visible = p > 0.02 && k > 0.02;
  }
}

/** Swap both hands to the solid skin look. Safe to call before a session starts. */
export function installHands(world: World) {
  headCam = world.camera;
  for (const side of ['left', 'right'] as const) {
    world.input.xr.visualAdapters.hand[side].updateVisualImplementation(
      LociHand as unknown as VisualConstructor<VisualImplementation>,
    );
  }
}
