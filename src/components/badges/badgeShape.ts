/** Octagonal badge geometry — shared by UI + PNG export */

export const BADGE_W = 300;
export const BADGE_H = 440;

/** clip-path polygon (CSS %) */
export const BADGE_CLIP_CSS =
  'polygon(50% 0%, 88% 6%, 100% 50%, 88% 94%, 50% 100%, 12% 94%, 0% 50%, 12% 6%)';

/** SVG polygon points for viewBox 0 0 300 440 */
export const BADGE_POINTS = '150,6 264,32 292,220 264,408 150,434 36,408 8,220 36,32';

export const BADGE_POINTS_INNER = '150,14 256,36 280,220 256,400 150,422 44,400 20,220 44,36';

/** Canvas coordinates for 680×920 export */
export function badgeOctagonPoints(w: number, h: number): [number, number][] {
  const cx = w / 2;
  return [
    [cx, 28],
    [w - 52, 78],
    [w - 26, h / 2],
    [w - 52, h - 78],
    [cx, h - 28],
    [52, h - 78],
    [26, h / 2],
    [52, 78],
  ];
}

export function traceOctagon(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][]
) {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}
