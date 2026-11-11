/**
 * LOCI design system: "a little castle of memory".
 * Pastel, flat, minimal, hand-drawn ink doodles. Shared by the Studio (CSS vars) and the 3D app.
 * Anti-AI-look rules: no gradients, no glows, no glass blur, no gradient or italic accent text,
 * no uppercase tracked micro labels, no sparkle emoji. Flat fills + one ink line weight.
 */
export const THEME = {
  paper: '#FBF7F0', // backgrounds, panels, cards
  paperDeep: '#F1EADF', // subtle fills, pressed states
  ink: '#2B2A33', // text, outlines, doodles, primary buttons
  inkSoft: '#6E6A78', // secondary text
  rose: '#F4C7C3',
  butter: '#F7E3A1',
  mint: '#C8E6D0',
  sky: '#C7DDF2',
  lilac: '#DCCFF0',
  /** Per-card mat color, cycled by concept index. */
  pastels: ['#F4C7C3', '#F7E3A1', '#C8E6D0', '#C7DDF2', '#DCCFF0'] as const,
  line: 2, // ink outline width in px at 1x
  radius: 18,
  fontDisplay: '"Bricolage Grotesque", system-ui, sans-serif',
  fontBody: '"Figtree", system-ui, sans-serif',
} as const;
