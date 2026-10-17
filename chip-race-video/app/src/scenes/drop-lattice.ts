// The die-dive lattice shared by drop's last 0.47 s and node1's first 0.23 s (the handoff must match pixel for pixel).
// Needs uniforms: vec2 uC (screen centre px), float uDieZoom, float uPitch (70). Zoom 90 -> fins 58.3 px apart, gates 175 px apart.
export const DIE_PITCH = 70;
export const DIE_ZOOM_END = 90;
export const DIE_DIVE_GLSL = /* glsl */ `
// zoom into one die: wafer -> die -> blocks -> fins and gates (node1 opens on this lattice)
vec3 dieDive(vec2 px) {
  float Z = uDieZoom;
  vec2 q = (px - uC) / Z;                 // reticle units, die centre at origin
  float P = uPitch;
  vec3 col = C_INK;
  float lane = 0.0;
  // die lanes
  vec2 g0 = abs(fract(q / P + 0.5) - 0.5) * P * Z;
  float d0 = min(g0.x, g0.y);
  col += C_SIGNAL * 0.55 * (1.0 - smoothstep(0.6, 1.7, d0));
  // die interior fill, slightly raised
  vec2 cell = floor(q / P + 0.5);
  float inside = step(max(abs(q.x - cell.x * P), abs(q.y - cell.y * P)), P * 0.5 - 1.0 / Z);
  col += C_BLOOD * 0.10 * inside * (0.5 + hash12(cell));
  // blocks (P/6), cells (P/36)
  float s1 = P / 6.0, s2 = P / 36.0, s3 = P / 108.0;
  float a1 = smoothstep(7.0, 32.0, s1 * Z), a2 = smoothstep(7.0, 30.0, s2 * Z);
  vec2 g1 = abs(fract(q / s1 + 0.5) - 0.5) * s1 * Z;
  col += C_SIGNAL * 0.40 * a1 * (1.0 - smoothstep(0.6, 1.6, min(g1.x, g1.y)));
  vec2 g2 = abs(fract(q / s2 + 0.5) - 0.5) * s2 * Z;
  col += C_SIGNAL * 0.32 * a2 * (1.0 - smoothstep(0.6, 1.5, min(g2.x, g2.y)));
  // fins (vertical, pitch s3) and gates (horizontal bars, pitch s2)
  float a3 = smoothstep(4.0, 22.0, s3 * Z);
  float fx = abs(fract(q.x / s3 + 0.5) - 0.5) * s3 * Z;
  float finW = 0.22 * s3 * Z;
  float fin = 1.0 - smoothstep(finW - 0.7, finW + 0.7, fx);
  float gy = abs(fract(q.y / s2 + 0.5) - 0.5) * s2 * Z;
  float gateW = 0.30 * s2 * Z;
  float gate = 1.0 - smoothstep(gateW - 0.8, gateW + 0.8, gy);
  col = mix(col, col + C_SIGNAL * 0.9 * fin, a3);
  col = mix(col, col * 0.35 + C_BLOOD * 0.9 * gate + C_SIGNAL * 0.25 * gate * fin, a3 * gate);
  return col;
}

`;
