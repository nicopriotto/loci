/**
 * All recorded-footage facts in one place (source seconds). Swap a clip by editing this file only:
 * every speed, cut and anchor in vr.tsx / studio.tsx is computed from these numbers plus the section
 * durations and word times in vo.json.
 */
export const FOOTAGE = {
  cold: {src: 'v4-pan-open', from: 0, to: 10.5},
  // onboarding, castle draws, cards fly out; the fan is settled (source 7.75 s) when "front" is spoken, then eases to 8.2 s
  enter: {src: 'v4-generate', from: 2.6, settle: 7.75, to: 8.2},
  place: {
    src: 'v4-place',
    card1: {from: 1.2, to: 4.4}, // card 1 (grab 1.96, release 4.20) plays at 1x
    rest: {from: 4.4, to: 34.9}, // cards 2..8 on one continuous ramp, ends on the placed path
    cuts: [] as [number, number][],
    maxRate: 6,
  },
  review: {
    src: 'v4-review',
    open: [5.98, 13.63, 21.16, 28.69, 36.07, 43.36, 50.86, 58.27],
    press: [9.17, 16.85, 24.39, 31.83, 39.22, 46.51, 54.01, 61.50], // card 1,2 Got it; 3 Missed; 6 Missed
    // where the fingertip lands, in 1920x1080 px: card 1 Got it, card 2 Got it, card 3 Missed
    tap: [[822, 792], [870, 788], [1042, 804]] as [number, number][],
  },
  done: {src: 'v4-done', from: 0, len: 7.5},
  close: {src: 'v4-pan-close', from: 0, to: 10.5},
  studio: {
    pdf: {src: 'v4-s-pdf', len: 7.13}, // keeps the loading moment, no cuts
    type: {src: 'v4-s-type', from: 0.4, to: 7.7},
    ai: {src: 'v4-s-ai', from: 0.4, firstImage: 7.1, len: 13.13},
    upload: {src: 'v4-s-upload', drop: 2.0, len: 3.93},
    // tile selections in the room picker: Kitchen, Bedroom, Sunlit living room, then the Build click
    room: {src: 'v4-s-room', kitchen: 1.4, bedroom: 3.4, sunlit: 5.2, build: 6.8, len: 8.6},
  },
};
