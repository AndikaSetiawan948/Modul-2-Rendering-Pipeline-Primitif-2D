/* Module 2 -- the library-side render: Rumah Gadang Tinggal Raja floor plan with Three.js. */
import * as THREE from "three";

const W = 800, H = 600;
const canvas = document.getElementById("c");

// --- match raster.mjs exactly: no retina scaling, explicit size ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x121216, 1);

// an orthographic camera in PIXEL space, y-down to match the framebuffer
const camera = new THREE.OrthographicCamera(0, W, 0, H, -10, 10);
const scene = new THREE.Scene();

// viridis 5-step ramp -- identical to plan.mjs CATEGORY_RGB
const CATEGORY = {
  wall:   0x440154,
  cella:  0x3b528b,
  stair:  0x21918c,
  shrine: 0x5ec962,
  axis:   0xfde725,
};
const MARKER = { wall: "■", cella: "◆", stair: "▲", shrine: "●", axis: "‖" };
const LABEL = {
  wall:   "wall (Dinding & Ruang Tengah)",
  cella:  "cella (Kamar Tidur)",
  stair:  "stair (Tangga Masuk)",
  shrine: "shrine (Anjuang Kiri/Kanan)",
  axis:   "axis (Sumbu Simetri)",
};

let plan, world2screen, group;

function makeWorldToScreen(p) {
  const s = p.scale_px_per_m, [ox, oy] = p.origin_m;
  return ([xm, ym]) => [Math.round((xm + ox) * s), Math.round(H - 1 - (ym + oy) * s)];
}

function build(fillSilhouette) {
  if (group) scene.remove(group);
  group = new THREE.Group();

  if (fillSilhouette && plan.silhouette) {
    const shape = new THREE.Shape();
    plan.silhouette.points.map(world2screen).forEach(([x, y], i) => {
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe6ecf5, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geo, mat));
  }

  for (const pl of plan.polylines) {
    const pts = pl.points.map(world2screen).map(([x, y]) => new THREE.Vector3(x, y, 1));
    if (pl.closed) pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: CATEGORY[pl.category] ?? 0xffffff });
    group.add(new THREE.Line(geo, mat));
  }
  scene.add(group);
  renderer.render(scene, camera);
}

function buildLegend() {
  const rows = document.getElementById("rows");
  rows.innerHTML = "";
  for (const [cat, hex] of Object.entries(CATEGORY)) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      `<span class="swatch" style="background:#${hex.toString(16).padStart(6, "0")}"></span>` +
      `<span class="marker">${MARKER[cat]}</span><span>${LABEL[cat] || cat}</span>`;
    rows.appendChild(row);
  }
}

function exportPPM() {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const body = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const src = ((H - 1 - y) * W + x) * 4, dst = (y * W + x) * 3;
      body[dst] = px[src]; body[dst + 1] = px[src + 1]; body[dst + 2] = px[src + 2];
    }
  const header = new TextEncoder().encode(`P6\n${W} ${H}\n255\n`);
  const blob = new Blob([header, body], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "plan_three.ppm";
  a.click();
}

function applyFilters() {
  const wrap = document.getElementById("wrap");
  wrap.classList.toggle("cvd-deuteranopia", document.getElementById("cvd").checked);
  wrap.classList.toggle("cvd-protanopia", document.getElementById("cvd2").checked);
}

async function loadPlanData() {
  for (const url of ["../myplan.json", "./myplan.json", "../pusaka_plan.json"]) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  throw new Error("Could not fetch myplan.json");
}

loadPlanData()
  .then((p) => {
    plan = p;
    world2screen = makeWorldToScreen(plan);
    buildLegend();
    build(document.getElementById("fill").checked);
    document.getElementById("fill").addEventListener("change", (e) => build(e.target.checked));
    document.getElementById("cvd").addEventListener("change", applyFilters);
    document.getElementById("cvd2").addEventListener("change", applyFilters);
    document.getElementById("export").addEventListener("click", exportPPM);
  })
  .catch((err) => {
    document.getElementById("view").insertAdjacentHTML(
      "beforeend",
      `<p style="color:#f66">Could not load floor plan: ${err.message}. Copy <code>myplan.json</code> into <code>web/</code> or run <code>npx serve .</code> from root.</p>`
    );
  });