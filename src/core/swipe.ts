// Swipe-to-reveal gesture math (offsets are negative: content shifted left).
export const SWIPE_OPEN = 80; // width of the revealed action, px
const LOCK = 8; // movement before deciding horizontal vs vertical
const SNAP = 40; // release past this opens the row

/** Axis decision from the movement since touch start; null until it is clear. */
export function lockAxis(dx: number, dy: number): 'h' | 'v' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
}

/** Content offset while dragging: follows 1:1 from where the row started, clamped to -80..0. */
export const swipeOffset = (start: number, dx: number) => Math.min(0, Math.max(-SWIPE_OPEN, start + dx));

/** Where the row rests after release. */
export const settleOffset = (offset: number) => (offset <= -SNAP ? -SWIPE_OPEN : 0);
