/**
 * Setting illustrations for the Studio: ink outlines on flat pastel fills, same hand-drawn
 * line as the castle doodles. Colors come from CSS classes (f-rose, f-sky, ...) in studio.css.
 */
import type { Setting } from '../palaces.js';
import { ROOM_IDS, ROOM_INFO, type RoomId } from '../envs/rooms.js';

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">';

const HOME = `${OPEN}
  <path d="M10 130 C60 131 150 129 230 130"/>
  <rect class="f-paper" x="48" y="14" width="36" height="46" rx="4" transform="rotate(-7 66 37)"/>
  <rect class="f-rose" x="54" y="20" width="24" height="26" rx="2" transform="rotate(-7 66 37)"/>
  <path d="M60 52 L72 50" stroke-width="1.8"/>
  <rect class="f-sky" x="150" y="26" width="58" height="64" rx="4"/>
  <path d="M179 26 V90 M150 58 H208" stroke-width="1.8"/>
  <path class="f-rose" d="M142 22 H158 V98 C150 100 146 96 142 98 Z"/>
  <path class="f-rose" d="M200 22 H216 V98 C212 96 206 100 200 98 Z"/>
  <ellipse class="f-lilac" cx="66" cy="132" rx="54" ry="7"/>
  <path class="f-butter" d="M34 86 C34 66 40 62 62 62 C84 62 90 66 90 86 V112 H34 Z"/>
  <path class="f-butter" d="M24 98 C24 90 36 90 38 98 V120 H24 Z M86 98 C88 90 100 90 100 98 V120 H86 Z"/>
  <path class="f-butter" d="M34 98 H90 V122 H34 Z"/>
  <path d="M34 122 V130 M90 122 V130"/>
  <path d="M120 130 V68"/>
  <path class="f-lilac" d="M107 68 L133 68 L127 44 L113 44 Z"/>
  <path d="M112 130 H128"/>
  <path d="M176 130 L180 108 H200 L204 130 Z" class="f-rose"/>
  <path class="f-mint" d="M190 108 C176 98 178 84 188 80 C190 90 194 96 190 108 Z M190 108 C204 98 208 88 200 80 C196 90 192 96 190 108 Z"/>
</svg>`;

const HOME_DOODLE = HOME;
const TINTS = ['lilac', 'mint', 'rose', 'butter', 'sky', 'lilac'];

export const SETTING_INFO: Record<Setting, { name: string; blurb: string; tint: string }> = {
  home: { name: 'My space', blurb: 'Your real room, through passthrough.', tint: 'sky' },
  ...(Object.fromEntries(ROOM_IDS.map((id, i) => [id, { ...ROOM_INFO[id], tint: TINTS[i] }])) as Record<RoomId, { name: string; blurb: string; tint: string }>),
};

/** Doodle for My space, a screenshot thumbnail (public/settings/<id>.jpg) for every VR room. */
export function settingArt(setting: Setting): string {
  return `<img src="${import.meta.env.BASE_URL}settings/${setting}.jpg" alt="" loading="lazy" width="320" height="240" />`;
}
