/**
 * Dummy OG card generator (PLACEHOLDER art — regenerate after the real logo).
 * Pure Node, zero dependencies: paints a 1200×630 brand-gradient card with a
 * geometric "A" badge and writes `apps/web/public/og.png`.
 *
 * No fonts are rasterized here (that needs canvas/sharp) — when the final
 * logo + wordmark land, replace this with a proper export and keep the same
 * output path so metadata never changes.
 *
 * Usage: node scripts/seo/generate-og.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1200;
const H = 630;

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// Brand gradient: near-black violet → vivid violet (matches globals.css).
const TOP = [23, 18, 38];
const BOTTOM = [91, 33, 182];

const buf = Buffer.alloc(W * H * 3);
const at = (x, y) => (y * W + x) * 3;

for (let y = 0; y < H; y++) {
  const base = mix(TOP, BOTTOM, y / (H - 1));
  for (let x = 0; x < W; x++) {
    // Soft glow, top-right.
    const dx = (x - 980) / 620;
    const dy = (y - 90) / 620;
    const glow = Math.max(0, 1 - dx * dx - dy * dy) * 0.35;
    const i = at(x, y);
    buf[i] = Math.min(255, base[0] + 139 * glow);
    buf[i + 1] = Math.min(255, base[1] + 92 * glow);
    buf[i + 2] = Math.min(255, base[2] + 246 * glow);
  }
}

function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  const cx = Math.min(Math.max(x, rx + r), rx + rw - r);
  const cy = Math.min(Math.max(y, ry + r), ry + rh - r);
  const ddx = x - cx;
  const ddy = y - cy;
  return (
    x >= rx && x < rx + rw && y >= ry && y < ry + rh && ddx * ddx + ddy * ddy <= r * r
  );
}

// White badge, left-center.
const BX = 150;
const BY = 195;
const BS = 240;
const BR = 52;
for (let y = BY; y < BY + BS; y++) {
  for (let x = BX; x < BX + BS; x++) {
    if (inRoundedRect(x, y, BX, BY, BS, BS, BR)) {
      const i = at(x, y);
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
    }
  }
}

// Geometric "A": two diagonal bars + crossbar, brand violet.
const VIOLET = [91, 33, 182];
const bar = (px, py) => {
  // Left diagonal: x drifts right as y grows (apex top-center of badge).
  const left = Math.abs(px - (BX + BS / 2 - (py - BY - 40) * 0.42)) < 17 && py > BY + 40 && py < BY + 200;
  const right = Math.abs(px - (BX + BS / 2 + (py - BY - 40) * 0.42)) < 17 && py > BY + 40 && py < BY + 200;
  const cross = py > BY + 138 && py < BY + 166 && px > BX + 62 && px < BX + BS - 62;
  return left || right || cross;
};
for (let y = BY; y < BY + BS; y++) {
  for (let x = BX; x < BX + BS; x++) {
    if (inRoundedRect(x, y, BX, BY, BS, BS, BR) && bar(x, y)) {
      const i = at(x, y);
      buf[i] = VIOLET[0];
      buf[i + 1] = VIOLET[1];
      buf[i + 2] = VIOLET[2];
    }
  }
}

// Gold accent rule under the badge.
for (let y = BY + BS + 36; y < BY + BS + 48; y++) {
  for (let x = BX; x < BX + 220; x++) {
    const i = at(x, y);
    buf[i] = 212;
    buf[i + 1] = 160;
    buf[i + 2] = 60;
  }
}

// Right-side "wordmark" placeholder: three rounded text-line bars.
const lines = [
  { x: 460, y: 220, w: 560, h: 44 },
  { x: 460, y: 288, w: 420, h: 44 },
  { x: 460, y: 380, w: 300, h: 20 },
];
for (const ln of lines) {
  for (let y = ln.y; y < ln.y + ln.h; y++) {
    for (let x = ln.x; x < ln.x + ln.w; x++) {
      const r = Math.min(22, ln.h / 2);
      if (inRoundedRect(x, y, ln.x, ln.y, ln.w, ln.h, r)) {
        const i = at(x, y);
        const dim = ln.h <= 20;
        buf[i] = dim ? 200 : 255;
        buf[i + 1] = dim ? 190 : 255;
        buf[i + 2] = dim ? 220 : 255;
      }
    }
  }
}

// Encode: 8-bit truecolor, filter 0 per scanline.
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'apps', 'web', 'public', 'og.png');
writeFileSync(out, png);
console.log(`og.png written: ${(png.length / 1024).toFixed(0)} KB → ${out}`);
