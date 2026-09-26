import { deflateSync } from 'node:zlib';

/**
 * Dependency-free placeholder diagram: a light grid with a filled square, a
 * circle outline and a diagonal — enough for seeded visual-reasoning
 * questions to render a real image instead of a dead key. PNG is assembled
 * by hand (signature + IHDR + IDAT + IEND) so seeds and backfills never pull
 * in an imaging library.
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]!) >>> 0]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

type RGB = [number, number, number];

const BG: RGB = [248, 250, 252];
const GRID: RGB = [203, 213, 225];
const INDIGO: RGB = [79, 70, 229];
const ROSE: RGB = [225, 29, 72];
const EMERALD: RGB = [5, 150, 105];

export interface PlaceholderOptions {
  width?: number;
  height?: number;
}

/** Render the diagram to raw RGB rows (filter byte 0 + pixels per row). */
function rasterize(width: number, height: number): Buffer {
  const rows: Buffer[] = [];
  const cx = Math.floor(width * 0.68);
  const cy = Math.floor(height * 0.5);
  const radius = Math.floor(Math.min(width, height) * 0.22);
  const sqX0 = Math.floor(width * 0.12);
  const sqY0 = Math.floor(height * 0.28);
  const sqSize = Math.floor(Math.min(width, height) * 0.3);
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      let pixel: RGB = BG;
      if (x % 40 === 0 || y % 40 === 0) {
        pixel = GRID;
      }
      if (x >= sqX0 && x < sqX0 + sqSize && y >= sqY0 && y < sqY0 + sqSize) {
        pixel = INDIGO;
      }
      const dist = Math.hypot(x - cx, y - cy);
      if (Math.abs(dist - radius) < 3) {
        pixel = ROSE;
      }
      if (Math.abs(y - Math.floor((height / width) * x)) < 2) {
        pixel = EMERALD;
      }
      const offset = 1 + x * 3;
      row[offset] = pixel[0];
      row[offset + 1] = pixel[1];
      row[offset + 2] = pixel[2];
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

/** Standalone PNG bytes for a generated placeholder diagram. */
export function generatePlaceholderPng(options: PlaceholderOptions = {}): Buffer {
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8) {
    throw new Error('Placeholder dimensions must be integers >= 8.');
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rasterize(width, height))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
