import type { Setting } from '../palaces.js';

/** VR places: SEM's built-in procedural rooms (MIT). Pure data so the Studio can import it cheaply. */
export type RoomId = Exclude<Setting, 'home'>;

export const ROOM_IDS: RoomId[] = ['sunlit_living_room', 'kitchen', 'bedroom', 'home_office', 'music_studio', 'open_studio'];

export const ROOM_INFO: Record<RoomId, { name: string; blurb: string }> = {
  sunlit_living_room: { name: 'Sunlit living room', blurb: 'A bright room with a sofa, shelves and wall art.' },
  kitchen: { name: 'Kitchen', blurb: 'Counters, a table and cupboards to hang ideas on.' },
  bedroom: { name: 'Bedroom', blurb: 'A calm room with a bed, a dresser and a window.' },
  home_office: { name: 'Home office', blurb: 'A desk, a bookshelf and a quiet corner.' },
  music_studio: { name: 'Music studio', blurb: 'Instruments, panels and a big mixing desk.' },
  open_studio: { name: 'Open studio', blurb: 'A wide, airy loft with lots of wall.' },
};

export const isRoom = (s: string): s is RoomId => (ROOM_IDS as string[]).includes(s);
