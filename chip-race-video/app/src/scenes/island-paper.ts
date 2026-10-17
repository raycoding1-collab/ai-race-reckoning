// Procedural bone paper for the paper plates (island, and the key's first frame): low-frequency clouds, hashed
// fibre segments, specks and a raking-light gradient. Beer-Lambert overprint for inks: `col *= pow(T, density)`.
export const PAPER_GLSL = /* glsl */ `
vec3 paperCol(vec2 q) {
  float cloud = fbm(q * 0.0021, 4) * 0.5 + 0.5;
  float mid = snoise(q * 0.012) * 0.5;
  float fib = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 g = q / (22.0 * (1.0 + float(k))) + float(k) * 7.3;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash12(id + float(k) * 13.0);
    vec2 d = rot2(h * 6.2832) * f;
    float fl = (1.0 - smoothstep(0.0, 0.016, abs(d.y))) * step(abs(d.x), 0.36);
    fib += fl * (h - 0.45) * step(hash12(id * 1.7), 0.55);
  }
  float speck = step(0.9985, hash12(floor(q * 0.9))) * 0.5;
  vec3 p = C_BONE * (0.935 + 0.035 * cloud + 0.012 * mid + 0.05 * fib - speck * 0.12);
  return p;
}`;
