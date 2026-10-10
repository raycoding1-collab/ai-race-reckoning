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
  ['sand', 'sand', 0, 4], ['tin', 'tin', 4, 6], ['laser', 'laser', 6, 8], ['machine', 'machine', 8, 10],
  ['tons', 'tons', 10, 12], ['line', 'line', 12, 14],
  ['drop1', 'drop', 14, 16, { n: 1 }], ['node1', 'node1', 16, 18], ['grid1', 'grid1', 18, 20], ['down1', 'down1', 20, 22],
  ['post1', 'post1', 22, 26],
  ['hbm', 'hbm', 26, 28], ['smuggle', 'smuggle', 28, 30], ['island', 'island', 30, 32], ['key', 'key', 32, 34],
  ['shield', 'shield', 34, 36], ['fab', 'fab', 36, 38],
  ['drop2', 'drop', 38, 40, { n: 2 }], ['node2', 'node2', 40, 42], ['grid2', 'grid2', 42, 44], ['down2', 'down2', 44, 46],
  ['post2', 'post2', 46, 50],
  ['atom', 'atom', 50, 52], ['dream', 'dream', 52, 54], ['crack', 'crack', 54, 56], ['whoscrown', 'whoscrown', 56, 58],
  ['hold', 'hold', 58, 62],
  ['drop3', 'drop', 62, 64, { n: 3 }], ['node3', 'node3', 64, 66], ['grid3', 'grid3', 66, 68], ['down3', 'down3', 68, 70],
  ['outro', 'outro', 70, 999],
];

export function makeTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  const bar = (b: number) => Math.min(au.duration, (b * 4 * 60) / au.bpm);
  return PLATES.map(([id, file, a, b, params]) => ({ id, load: scene(file), start: bar(a), end: bar(b), ...(params ? { params } : {}) }));
}
