/**
 * INTEGRATION NOTE (for app.ts)
 * -----------------------------
 * One call, once, right after World.create(...) resolves (already wired in src/index.ts):
 *
 *     import { applySetting } from './envs/index.js';
 *     applySetting(world);                 // env of getActivePalace(); 'home' (passthrough) removes any env
 *
 * When the active palace changes without a reload:  applySetting(world, palace.setting)  (async, returns a Promise).
 *
 * VR settings are IWER SEM's built-in rooms (GLTS scripts, MIT), one lazy chunk per room. The room is opaque
 * and fully encloses the viewer (origin on the floor, facing -Z), so it covers passthrough and the emulator's own room.
 * Placement: raycast against `getPlaceables(env)`: every visible mesh of a wall or furniture surface
 * (userData.xrPlane = wall, table, desk, shelf, wall art, ...) carries userData.placeable = true.
 */
import { type Object3D, type World, createSystem } from '@iwsdk/core';
import * as THREE from '@iwsdk/core';
import { GLTSLoader } from '@drawcall/glts';
import { type Setting, getActivePalace } from '../palaces.js';
import { type RoomId, isRoom } from './rooms.js';

export { ROOM_IDS, ROOM_INFO, isRoom, type RoomId } from './rooms.js';

/** The viewer stands at the origin facing -Z, on open floor. */
export const ENV_SPAWN = { position: [0, 0, 0] as [number, number, number] };

const sources: Record<RoomId, () => Promise<{ default: string }>> = {
  sunlit_living_room: () => import('@iwer/sem/rooms/sunlit_living_room.js'),
  kitchen: () => import('@iwer/sem/rooms/kitchen.js'),
  bedroom: () => import('@iwer/sem/rooms/bedroom.js'),
  home_office: () => import('@iwer/sem/rooms/home_office.js'),
  music_studio: () => import('@iwer/sem/rooms/music_studio.js'),
  open_studio: () => import('@iwer/sem/rooms/open_studio.js'),
};

/** Labels of surfaces a card can hang on or sit on. Floor, ceiling, doors and windows are left out. */
const SURFACES = new Set(['wall', 'wall art', 'table', 'desk', 'shelf', 'couch', 'bed', 'screen', 'other']);

export interface Environment {
  setting: RoomId;
  root: Object3D;
  dispose(): void;
}

interface Updatable extends Object3D {
  update?: (delta: number) => void;
}

let current: Environment | null = null;
let live: Updatable | null = null;
let token = 0;
let latestWant: Setting = 'home';
/** One in-flight load per room: concurrent applySetting calls share it instead of decoding the room twice. */
const pending = new Map<RoomId, Promise<Environment>>();
let systemRegistered = false;

/** Per-frame driver for GLTS onFrame callbacks (animated props). */
const EnvSystem = class extends createSystem({}) {
  update(delta: number) {
    live?.update?.(Math.min(delta, 0.1));
  }
};

function tag(root: Object3D) {
  root.traverse((o) => {
    const label = o.userData.xrPlane;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const lbl = typeof label === 'string' ? label : label === true ? 'other' : '';
    if (lbl && SURFACES.has(lbl)) o.userData.placeable = true;
  });
}

async function loadRoom(world: World, id: RoomId): Promise<Environment> {
  const src = (await sources[id]()).default;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/plain' }));
  // Scripts import 'three': hand them the app's own instance so nothing is fetched from a CDN.
  const loader = new GLTSLoader(new THREE.LoadingManager(), { modules: { three: THREE } });
  try {
    const scene = await loader.loadAsync(url);
    tag(scene);
    const entity = world.createTransformEntity(scene as unknown as Object3D);
    return {
      setting: id,
      root: scene as unknown as Object3D,
      dispose() {
        if (live === (scene as unknown)) live = null;
        try {
          scene.dispose();
        } finally {
          loader.dispose();
          entity.dispose();
        }
      },
    };
  } catch (e) {
    loader.dispose();
    throw e;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Show the room for `setting` (default: the active palace's), replacing the previous one. 'home' removes it. */
export async function applySetting(world: World, setting?: Setting): Promise<Environment | null> {
  const want: Setting = setting ?? getActivePalace()?.setting ?? 'home';
  if (!systemRegistered) {
    systemRegistered = true;
    world.registerSystem(EnvSystem);
  }
  const mine = ++token;
  latestWant = want;
  if (current && current.setting === want) return current;
  current?.dispose();
  current = null;
  live = null;
  if (!isRoom(want)) return null;
  let load = pending.get(want);
  if (!load) {
    load = loadRoom(world, want);
    pending.set(want, load);
    const done = () => pending.delete(want);
    load.then(done, done);
  }
  const env = await load;
  if (mine !== token) {
    // A newer call won: it adopts this room if it wants it too, otherwise nobody does and it is released.
    const now = current as Environment | null;
    if (now?.setting === want) return now;
    if (latestWant !== want && !pending.has(want)) env.dispose();
    return null;
  }
  current = env;
  live = env.root as unknown as Updatable;
  return env;
}

export function getPlaceables(env: { root: Object3D }): Object3D[] {
  const out: Object3D[] = [];
  env.root.traverse((o: Object3D) => {
    if (o.userData.placeable) out.push(o);
  });
  return out;
}

export const currentEnvironment = (): Environment | null => current;
