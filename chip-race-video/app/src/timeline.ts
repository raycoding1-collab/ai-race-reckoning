// The edit (Silicon Shield): one entry per plate of docs/STORYBOARD.md. Windows are in bars of the
// song grid (128 BPM, constant), so they follow src/song.py exactly. Hard cuts where windows touch.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

/** [id, module, startBar, endBar, params?] — the end of the last entry is the song's end. */
export const PLATES: [string, string, number, number, Record<string, unknown>?][] = [
  ['sand', 'sand', 0, 4], ['tin', 'w2-shot', 4, 6], ['laser', 'w2-shot', 6, 8], ['machine', 'w3-machine', 8, 10],
  ['tons', 'tons', 10, 12], ['line', 'line', 12, 14],
  ['drop1', 'w1-wafer', 14, 16, { n: 1 }], ['node1', 'w4-nanosheet', 16, 18], ['grid1', 'grid1', 18, 20], ['down1', 'down1', 20, 22],
  ['post1', 'w11-chamber', 22, 26],
  ['hbm', 'w6-tower', 26, 28], ['smuggle', 'smuggle', 28, 30], ['island', 'island', 30, 32], ['key', 'key', 32, 34],
  ['shield', 'w7-shield', 34, 36], ['fab', 'w8-fabrail', 36, 38],
  ['drop2', 'w1-wafer', 38, 40, { n: 2 }], ['node2', 'w9-diecity', 40, 42], ['grid2', 'grid2', 42, 44], ['down2', 'down2', 44, 46],
  ['post2', 'post2', 46, 50],
  ['atom', 'atom', 50, 52], ['dream', 'w9-diecity', 52, 54, { night: true }], ['crack', 'crack', 54, 56], ['whoscrown', 'w10-wire', 56, 58],
  ['hold', 'w10-wire', 58, 62],
  ['drop3', 'w1-wafer', 62, 64, { n: 3 }], ['node3', 'w4-nanosheet', 64, 66, { recap: true }], ['grid3', 'grid3', 66, 68], ['down3', 'down3', 68, 70],
  ['outro', 'w12-stub', 70, 999],
];

export function makeTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  const bar = (b: number) => Math.min(au.duration, (b * 4 * 60) / au.bpm);
  return PLATES.map(([id, file, a, b, params]) => ({ id, load: scene(file), start: bar(a), end: bar(b), ...(params ? { params } : {}) }));
}
