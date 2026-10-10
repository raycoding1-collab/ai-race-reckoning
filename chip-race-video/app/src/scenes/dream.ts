// DREAM (bars 52-54, 97.5-101.25): "every model dreaming on a chip we'll never own".
// The STM field of `atom` (defocused, seen from straight above) comes into focus as a model's weight
// matrix: every lattice cell is one weight, a bump or a dent on hills of structure (heads, outlier
// features). The camera tips from top-down into a slow, dreamlike low flight over the engraved
// landscape, which breathes (four keyframe landscapes mixed on slow phases) and ripples once per
// sung word. On "own" a price tag on a string is yanked out of the frame. The last 0.6 s the
// landscape flattens and the camera returns straight down: flat engraved lines, the sheet `crack` opens on.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { lineByScene, sparkHead } from './_motifs';
import { O_W } from './crack-kit';
import { LAT, buildLattice, makeHeightTexture, splat, siteX, siteY, drawBridgeLine } from './atom-kit';
import { buildLandscape, buildGrid, VERT_TERRAIN, FRAG_TERRAIN } from './dream-terrain';
import { fenceMoves, applyFence } from './atom-fence';

const FOV = 30, D_TOP = 10 / Math.tan((FOV / 2) * Math.PI / 180);

export default class DreamScene extends Scene {
  layer = new Layer2D();
  lb = new LineBatch(64, { blend: 'add' });
  cam = new THREE.PerspectiveCamera(FOV, W / H, 1, 400);
  scene3 = new THREE.Scene();
  mat!: THREE.RawShaderMaterial;
  rips: THREE.Vector4[] = [];
  wv = new THREE.Vector4();

  override init() {
    const lat = buildLattice(7);
    applyFence(lat.data, lat.amp, fenceMoves(lat.amp));
    const hTex = makeHeightTexture(lat.data);
    const bTex = buildLandscape();
    for (let i = 0; i < 9; i++) this.rips.push(new THREE.Vector4(0, 0, -99, 0));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT_TERRAIN, fragmentShader: FRAG_TERRAIN, side: THREE.DoubleSide,
      uniforms: {
        uH: { value: hTex }, uHsize: { value: new THREE.Vector2(LAT.tw, LAT.th) }, uB: { value: bTex }, uW: { value: this.wv },
        uT: { value: 0 }, uMorph: { value: 0 }, uBlur: { value: 18 }, uFlat: { value: 0 }, uHS: { value: 2.4 }, uBump: { value: 0.6 }, uBeat: { value: 0 },
        uRip: { value: this.rips }, uCam: { value: new THREE.Vector3() }, uCoarse: { value: 0 }, uFog: { value: 60 },
      },
    });
    const mesh = new THREE.Mesh(buildGrid(), this.mat);
    mesh.frustumCulled = false;
    this.scene3.add(mesh);
  }

  /** Camera target and spherical pose at local time lt. */
  private pose(lt: number, T: number) {
    const tilt = ease.inOutCubic(prog(lt, 0.2, 1.75));
    const back = ease.inOutCubic(prog(lt, T - 0.85, T - 0.1));
    const k = tilt * (1 - back);
    const pitch = lerp(89.6, 27, k) * Math.PI / 180;
    const D = lerp(D_TOP, 21, k);
    const yaw = 0.16 * Math.sin(lt * 0.62) * k;
    const target = new THREE.Vector3(lerp(0, 1.6 * Math.sin(lt * 0.5), k), 0.5 * k, lerp(10, 4.5 - 1.5 * lt, k));
    return { pitch, D, yaw, target, k };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, lt = f.lt, T = this.ctx.end - this.ctx.start;
    const line = lineByScene(lyrics, 'dream');
    const { pitch, D, yaw, target, k } = this.pose(lt, T);
    this.cam.position.set(
      target.x + D * Math.cos(pitch) * Math.sin(yaw), target.y + D * Math.sin(pitch), target.z + D * Math.cos(pitch) * Math.cos(yaw));
    // the beat swells the whole thing a hair
    const kick = f.a.kick, snare = f.a.snare;
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(target);
    this.cam.updateMatrixWorld(); this.cam.updateProjectionMatrix();

    const morph = ease.inOutCubic(prog(lt, 0.1, 1.5));
    const flat = ease.inOutCubic(prog(lt, T - 0.85, T - 0.25));
    const u = this.mat.uniforms;
    u.uT!.value = t;
    u.uMorph!.value = morph;
    u.uBlur!.value = 18 * (1 - ease.outCubic(prog(lt, 0, 0.5)));
    u.uFlat!.value = flat;
    u.uHS!.value = 1.9 * (1 + 0.07 * Math.sin(t * 1.1));
    u.uBump!.value = 0.4;
    u.uBeat!.value = 0.5 * kick + 0.3 * snare;
    u.uCoarse!.value = morph * (1 - flat);
    u.uFog!.value = 40;
    u.uCam!.value.copy(this.cam.position);
    // breathing: four landscapes on slow, different phases
    const w = [0.55, 0.40, 0.30, 0.25].map((b, i) => b + 0.38 * Math.sin(t * (0.62 + 0.21 * i) + i * 1.9));
    this.wv.set(w[0]!, w[1]!, w[2]!, w[3]!);
    // a ripple per sung word, born ahead of the camera
    line.words.forEach((wd: any, i: number) => {
      const r = this.rips[i]!;
      const tg = this.pose(wd.start - this.ctx.start, T).target;
      r.set(tg.x + 18 + (hash(i, 4) - 0.5) * 16, tg.z - 3 - 9 * hash(i, 8), wd.start, (i % 2 ? -1 : 1) * (0.55 + 0.4 * hash(i, 2)));
    });

    renderer.setRenderTarget(out);
    renderer.clear();
    renderer.render(this.scene3, this.cam);

    // the stress point `crack` opens on: a hot spark at the shield's notch as the sheet goes flat
    const kS = smoothstep(T - 0.45, T - 0.02, lt);
    if (kS > 0.001) {
      this.lb.clear();
      sparkHead(this.lb, 960 + O_W.x, 540 + O_W.y, t, 0.1 + 0.4 * kS, 0.1 + 0.7 * kS);
      this.lb.render(renderer, out);
    }

    // ---- type and the tag
    const Lr = this.layer; Lr.clear();
    const c = Lr.ctx;
    const ui = 1 - smoothstep(T - 0.5, T - 0.2, lt);
    c.save();
    c.globalAlpha = ui;
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.5); c.textBaseline = 'alphabetic';
    c.fillText('FIG. 10 · W[ℓ=31] · 1 CELL = 1 WEIGHT · 36 × 64 SHOWN OF 8,192 × 28,672', 96, 70);
    c.letterSpacing = '0px';
    this.drawTag(c, t, line);
    drawBridgeLine(c, line, t, { x: W / 2, y: 984, size: 62, align: 'center', dim: 0.32, lead: 0.3 });
    c.restore();
    comp.draw(renderer, Lr.upload(), out);

    return { bloom: 0.6, bloomThreshold: 0.8, vignette: 0.45, ca: 0.35, zoom: 1 + 0.006 * (kick + snare * 0.6) };
  }

  /** The price tag: dangles in on "never", is yanked away on "own". */
  private drawTag(c: CanvasRenderingContext2D, t: number, line: any) {
    const never = line.words.find((w: any) => /never/i.test(w.w)), own = line.words.find((w: any) => /own/i.test(w.w));
    if (!never || !own) return;
    const tin = ease.outBack(prog(t, never.start - 0.15, never.start + 0.5), 1.2);
    const slip = ease.inBack(prog(t, own.start, own.start + 0.6), 1.9);
    if (tin <= 0 || slip >= 1) return;
    const ax = 1560, ay = lerp(-260, 70, tin) - 900 * slip;      // where the string hangs from
    const sway = 0.14 * Math.sin((t - never.start) * 3.1) * (1 - prog(t, never.start, own.start)) + 0.6 * slip * (1 - slip);
    const L = 190;
    c.save();
    c.translate(ax, ay); c.rotate(sway);
    c.strokeStyle = rgba('bone', 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, -600); c.lineTo(0, L); c.stroke();
    c.translate(0, L);
    const w = 236, h = 150;
    c.beginPath();
    c.moveTo(-w / 2 + 22, -h / 2); c.lineTo(w / 2 - 22, -h / 2); c.lineTo(w / 2, -h / 2 + 22); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.lineTo(-w / 2, -h / 2 + 22); c.closePath();
    c.fillStyle = rgba('bone', 0.94); c.fill();
    c.strokeStyle = rgba('ink', 1); c.lineWidth = 1.2;
    c.beginPath(); c.arc(0, -h / 2 + 18, 6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = rgba('ink', 1);
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(600), 12); c.letterSpacing = '2px';
    c.fillText('TITLE · 1 ACCELERATOR', -w / 2 + 18, -h / 2 + 48);
    c.font = font(F.mono(500), 11); c.letterSpacing = '1px';
    c.fillText('OWNER', -w / 2 + 18, -h / 2 + 72); c.fillText('——', -w / 2 + 84, -h / 2 + 72);
    c.fillText('STATUS', -w / 2 + 18, -h / 2 + 90); c.fillText('LEASED', -w / 2 + 84, -h / 2 + 90);
    c.font = font(F.archivo(100, 800), 38); c.letterSpacing = '0px';
    c.fillText('$30,000', -w / 2 + 18, h / 2 - 16);
    // barcode
    for (let i = 0; i < 18; i++) c.fillRect(w / 2 - 74 + i * 3.4, h / 2 - 40, 1 + (i * 7 % 3) * 0.7, 24);
    c.restore();
  }
}
