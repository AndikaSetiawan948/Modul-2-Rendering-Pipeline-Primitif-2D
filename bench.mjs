/* Module 2 -- forward (rasterise the polylines) vs backward (for every screen
 * pixel, distance-test every segment) drawing of the plan, at zoom 1x and 10x.
 *
 * This is the "decision defended with a prediction" task: write your expected
 * ordering FIRST (Lab 3), then run this and reconcile. Absolute ms vary by
 * machine; the RATIO and its direction are the result.
 *
 *   node bench.mjs [--w 800 --h 600 --iters 20]
 */
import { loadPlan, makeWorldToScreen } from "./plan.mjs";
import { Framebuffer, lineBresenham } from "./raster.mjs";

const val = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : d;
};
const W = val("--w", 800), H = val("--h", 600), ITERS = val("--iters", 20);
const plan = loadPlan("myplan.json");

// flatten the plan into screen-space segments at a given zoom
function segmentsAtZoom(zoom) {
  const w2s = makeWorldToScreen(plan, H);
  const segs = [];
  for (const pl of plan.polylines) {
    const pts = pl.points.map(([x, y]) => {
      const [sx, sy] = w2s([x, y]);
      return [(sx - W / 2) * zoom + W / 2, (sy - H / 2) * zoom + H / 2];
    });
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    if (pl.closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
  }
  return segs;
}

const forward = (fb, segs) => {
  for (const [a, b] of segs) lineBresenham(a[0] | 0, a[1] | 0, b[0] | 0, b[1] | 0, fb, [255, 255, 255]);
};

const backward = (fb, segs) => {
  // for each pixel, light it if within 0.75 px of any segment
  for (let y = 0; y < fb.h; y++)
    for (let x = 0; x < fb.w; x++) {
      const px = x + 0.5, py = y + 0.5;
      for (const [a, b] of segs) {
        const vx = b[0] - a[0], vy = b[1] - a[1];
        const wx = px - a[0], wy = py - a[1];
        const L2 = vx * vx + vy * vy || 1e-9;
        let t = (wx * vx + wy * vy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = wx - t * vx, dy = wy - t * vy;
        if (dx * dx + dy * dy <= 0.5625) { fb.set(x, y, [255, 255, 255]); break; }
      }
    }
};

function time(fn, segs) {
  fn(new Framebuffer(W, H), segs); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) fn(new Framebuffer(W, H), segs);
  return (performance.now() - t0) / ITERS;
}

console.log(`plan segments: ${segmentsAtZoom(1).length}   framebuffer ${W}x${H}   iters ${ITERS}`);
console.log(`${"zoom".padEnd(8)}${"forward (ms)".padEnd(16)}${"backward (ms)".padEnd(16)}ratio (bwd/fwd)`);
for (const zoom of [1, 10]) {
  const segs = segmentsAtZoom(zoom);
  const f = time(forward, segs);
  const b = time(backward, segs);
  console.log(`${String(zoom + "x").padEnd(8)}${f.toFixed(3).padEnd(16)}${b.toFixed(3).padEnd(16)}${(b / f).toFixed(1)}x`);
}
console.log("\nInterpret: forward cost tracks total segment length (pixels drawn);");
console.log("backward cost tracks pixels x segments and is ~flat in zoom.");
