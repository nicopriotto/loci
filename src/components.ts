import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** A concept card. Visual state lives in card.ts (CardView). */
export const Card = createComponent('Card', {
  index: { type: Types.Int8, default: 0 },
  conceptId: { type: Types.String, default: '' },
});

export default defineComponents([Card]);
