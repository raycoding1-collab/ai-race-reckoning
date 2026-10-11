// Edit diet, luma lock: a per-frame exposure table (30 fps, from frame n0) that flattens a luma bump or dip the frame's content makes on its own
// (line aliasing in a fast dolly, a posterised band sweeping through, tiles flipping). Measured with exposure 1 against a smoothed version of the
// same luma curve, so a 1-3 frame excursion (which reads as a flash) becomes a plain ramp. An empty table is exposure 1.
// Re-measure a table if the content it flattens changes. exposure = (target / measured) ^ 2.2 (linear light, display gamma).
export const lumaLock = (table: readonly number[], n0: number, t: number): number => table[Math.round(t * 30) - n0] ?? 1;
