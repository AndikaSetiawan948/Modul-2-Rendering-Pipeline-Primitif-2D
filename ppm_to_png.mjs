/* Konverter otomatis semua file .ppm di folder out/ menjadi .png di folder out_png/
 * Menggunakan modul bawaan Node.js (node:zlib & node:fs) tanpa install package tambahan. */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { Framebuffer } from "./raster.mjs";

const SRC_DIR = "out";
const DST_DIR = "out_png";

// Buat folder baru out_png/ jika belum ada
mkdirSync(DST_DIR, { recursive: true });

// Tabel CRC32 standar untuk spesifikasi chunk PNG
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Fungsi encoding Framebuffer RGB ke file biner PNG
function writePNG(fb, outPath) {
  const w = fb.w, h = fb.h;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 3);
    raw[rowStart] = 0; // Filter tipe 0 (None)
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 3;
      const dstIdx = rowStart + 1 + x * 3;
      raw[dstIdx] = fb.data[srcIdx];
      raw[dstIdx + 1] = fb.data[srcIdx + 1];
      raw[dstIdx + 2] = fb.data[srcIdx + 2];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth: 8-bit
  ihdr[9] = 2; // color type: 2 (Truecolor RGB)
  const idat = deflateSync(raw);
  const pngBuf = Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(outPath, pngBuf);
}

// Fungsi perbesaran Nearest-Neighbor + garis grid untuk gambar ukuran kecil (<= 32x32)
function upscaleWithGrid(fb, scale = 32) {
  const out = new Framebuffer(fb.w * scale, fb.h * scale);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      if (x % scale === 0 || y % scale === 0) {
        out.set(x, y, [45, 45, 55]); // Garis batas piksel tipis
      } else {
        out.set(x, y, fb.get(Math.floor(x / scale), Math.floor(y / scale)));
      }
    }
  }
  return out;
}

const files = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".ppm"));
console.log(`Mengonversi ${files.length} file .ppm dari '${SRC_DIR}/' ke folder baru '${DST_DIR}/'...\n`);

for (const file of files) {
  const baseName = file.replace(/\.ppm$/i, "");
  const fb = Framebuffer.readPPM(`${SRC_DIR}/${file}`);
  const outPng = `${DST_DIR}/${baseName}.png`;
  writePNG(fb, outPng);
  console.log(`[OK] ${outPng} (${fb.w}x${fb.h} px)`);

  // Jika gambarnya sangat kecil (seperti 6x6, 10x10, 12x12), buat juga versi zoom tajamnya
  if (fb.w <= 32 && fb.h <= 32) {
    const zoomed = upscaleWithGrid(fb, 32);
    const zoomPng = `${DST_DIR}/${baseName}_zoom_tajam.png`;
    writePNG(zoomed, zoomPng);
    console.log(`  └─ [ZOOM] ${zoomPng} (${zoomed.w}x${zoomed.h} px - tajam dengan grid piksel)`);
  }
}

console.log(`\nSelesai! Semua gambar .png siap dibuka di folder '${DST_DIR}/'.`);