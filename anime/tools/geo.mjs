// Projects the world map and the pins in src/data/map.json into SVG paths.
// Writes src/data/geo.json, which build.py reads. Run once after editing pins:
//   npm install d3-geo@3 topojson-client@3 world-atlas@2   (in any scratch folder)
//   NODE_PATH=<that folder>/node_modules node anime/tools/geo.mjs
// The map is centred on Japan (longitude 150°E), the way Japanese school atlases are.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const d3 = require("d3-geo");
const topojson = require("topojson-client");
const land = require("world-atlas/land-110m.json");
const countries = require("world-atlas/countries-110m.json");

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
const spec = JSON.parse(readFileSync(join(dataDir, "map.json"), "utf8"));

const W = 1000, H = 520;
const projection = d3.geoNaturalEarth1().rotate([-150, 0]);
const sphere = { type: "Sphere" };
projection.fitExtent([[6, 6], [W - 6, H - 6]], sphere);
const path = d3.geoPath(projection).digits(1);

const landGeo = topojson.feature(land, land.objects.land);
const countryGeo = topojson.feature(countries, countries.objects.countries);
const japan = countryGeo.features.find((f) => f.properties.name === "Japan");

const graticule = d3.geoGraticule().step([30, 30])();
const origin = projection([spec.origin.lon, spec.origin.lat]);

const pins = spec.pins.map((p) => {
  const [x, y] = projection([p.lon, p.lat]);
  // great-circle arc from Tokyo, sampled and projected; split where the antimeridian cuts it
  const interp = d3.geoInterpolate([spec.origin.lon, spec.origin.lat], [p.lon, p.lat]);
  const pts = Array.from({ length: 49 }, (_, i) => projection(interp(i / 48)));
  let d = "", prev = null;
  for (const pt of pts) {
    if (!prev || Math.abs(pt[0] - prev[0]) > W / 3) d += `M${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
    else d += `L${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
    prev = pt;
  }
  return { id: p.id, x: +x.toFixed(1), y: +y.toFixed(1), arc: d };
});

const out = {
  width: W,
  height: H,
  sphere: path(sphere),
  graticule: path(graticule),
  land: path(landGeo),
  japan: path(japan),
  origin: { x: +origin[0].toFixed(1), y: +origin[1].toFixed(1) },
  pins,
};
writeFileSync(join(dataDir, "geo.json"), JSON.stringify(out));
console.log("geo.json", JSON.stringify(out).length, "bytes,", pins.length, "pins");
