// Renders the JEarn "budget ring" icon (same geometry as public/icon.svg) to PNGs, using only node built-ins.
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x16, 0x18, 0x26], TRACK = [0x2b, 0x27, 0x41], ARC = [0x91, 0x84, 0xd9];
const FRACTION = 0.75, SS = 3; // arc fraction, supersampling per axis

// w x h pixels; the ring is drawn as in a square icon of side `box` (default: the whole width), centred.
function render(w, h = w, box = w) {
  const cx = w / 2, cy = h / 2, r = (150 / 512) * box, half = (46 / 512) * box / 2;
  const startX = cx, startY = cy - r; // arc starts at 12 o'clock, runs clockwise
  const endAngle = -Math.PI / 2 + FRACTION * 2 * Math.PI;
  const endX = cx + r * Math.cos(endAngle), endY = cy + r * Math.sin(endAngle);
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      let rgb = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        const dist = Math.hypot(px - cx, py - cy);
        let col = BG;
        if (Math.abs(dist - r) <= half) {
          col = TRACK;
          let a = Math.atan2(py - cy, px - cx) + Math.PI / 2; // 0 at top, clockwise
          if (a < 0) a += 2 * Math.PI;
          if (a <= FRACTION * 2 * Math.PI) col = ARC;
        }
        if (Math.hypot(px - startX, py - startY) <= half || Math.hypot(px - endX, py - endY) <= half) col = ARC;
        rgb = rgb.map((v, i) => v + col[i]);
      }
      const o = y * (w * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(rgb[i] / (SS * SS));
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h = w, box = w) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(w, h, box), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(new URL(`../public/${file}`, import.meta.url), png(size));
  console.log('wrote public/' + file);
}
writeFileSync(new URL('../public/launch-750x1334.png', import.meta.url), png(750, 1334, 240)); // launch image: ring like a 240px icon
console.log('wrote public/launch-750x1334.png');
