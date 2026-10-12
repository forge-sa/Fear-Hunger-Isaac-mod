'use strict';
// Tiny software rasterizer + PNG encoder (no dependencies).
// Colors are [r, g, b, a] with r/g/b in 0..255 and a in 0..1.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 4);
  }

  // Alpha-composite one pixel (straight alpha, source-over).
  blend(x, y, c, cover = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const sa = (c[3] === undefined ? 1 : c[3]) * cover;
    if (sa <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    const da = d[i + 3];
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    const k = da * (1 - sa);
    d[i] = (c[0] * sa + d[i] * k) / oa;
    d[i + 1] = (c[1] * sa + d[i + 1] * k) / oa;
    d[i + 2] = (c[2] * sa + d[i + 2] * k) / oa;
    d[i + 3] = oa;
  }

  // Additive light (keeps alpha at least as strong as the light).
  add(x, y, c, cover = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (c[3] === undefined ? 1 : c[3]) * cover;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    const da = d[i + 3];
    for (let k = 0; k < 3; k++) {
      d[i + k] = Math.min(255, (d[i + k] * da + c[k] * a) / Math.max(da, a, 1e-6));
    }
    d[i + 3] = Math.min(1, Math.max(da, a));
  }

  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = c[3] === undefined ? 1 : c[3];
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }

  // Generic shape fill: inside(px, py) tested at pixel centers inside bbox.
  // paint is a color or fn(px, py) -> color.
  shape(x0, y0, x1, y1, inside, paint, mode = 'blend') {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.w - 1, Math.ceil(x1));
    y1 = Math.min(this.h - 1, Math.ceil(y1));
    const fn = typeof paint === 'function' ? paint : null;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        if (!inside(px, py)) continue;
        const c = fn ? fn(px, py) : paint;
        if (!c) continue;
        if (mode === 'add') this.add(x, y, c);
        else if (mode === 'set') this.set(x, y, c);
        else this.blend(x, y, c);
      }
    }
  }

  ellipse(cx, cy, rx, ry, paint, rot = 0, mode) {
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const r = Math.max(rx, ry);
    this.shape(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    }, paint, mode);
  }

  rect(x, y, w, h, paint, mode) {
    this.shape(x, y, x + w - 1, y + h - 1, (px, py) =>
      px >= x && px < x + w && py >= y && py < y + h, paint, mode);
  }

  poly(pts, paint, mode) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    this.shape(x0, y0, x1, y1, (px, py) => pointInPoly(px, py, pts), paint, mode);
  }

  // Thick polyline (round caps), painted once per pixel.
  stroke(pts, width, paint, mode) {
    const r = width / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    this.shape(x0 - r - 1, y0 - r - 1, x1 + r + 1, y1 + r + 1, (px, py) => {
      for (let i = 0; i < pts.length - 1; i++) {
        if (segDist(px, py, pts[i], pts[i + 1]) <= r) return true;
      }
      return pts.length === 1 && Math.hypot(px - pts[0][0], py - pts[0][1]) <= r;
    }, paint, mode);
  }

  // Tapered stroke along a polyline: width goes from w0 to w1.
  taper(pts, w0, w1, paint, mode) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = lens[lens.length - 1] || 1;
    const rmax = Math.max(w0, w1) / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    this.shape(x0 - rmax - 1, y0 - rmax - 1, x1 + rmax + 1, y1 + rmax + 1, (px, py) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [d, t] = segDistT(px, py, pts[i], pts[i + 1]);
        const u = (lens[i] + t * (lens[i + 1] - lens[i])) / total;
        if (d <= (w0 + (w1 - w0) * u) / 2) return true;
      }
      return false;
    }, paint, mode);
  }

  blit(src, dx, dy, opts = {}) {
    const op = opts.opacity === undefined ? 1 : opts.opacity;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c[3] <= 0) continue;
        const tx = opts.flipX ? dx + src.w - 1 - x : dx + x;
        if (opts.mode === 'add') this.add(tx, dy + y, c, op);
        else this.blend(tx, dy + y, c, op);
      }
    }
  }

  // Box-filter downscale by an integer factor (alpha-weighted).
  downsample(f) {
    const out = new Img(Math.floor(this.w / f), Math.floor(this.h / f));
    const n = f * f;
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let yy = 0; yy < f; yy++) {
          for (let xx = 0; xx < f; xx++) {
            const i = ((y * f + yy) * this.w + (x * f + xx)) * 4;
            const al = this.d[i + 3];
            r += this.d[i] * al;
            g += this.d[i + 1] * al;
            b += this.d[i + 2] * al;
            a += al;
          }
        }
        if (a > 0) out.set(x, y, [r / a, g / a, b / a, a / n]);
      }
    }
    return out;
  }

  scaleNearest(f) {
    const out = new Img(this.w * f, this.h * f);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const c = this.get(Math.floor(x / f), Math.floor(y / f));
        if (c[3] > 0) out.set(x, y, c);
      }
    }
    return out;
  }

  // 1px outline around opaque pixels (pixel-art style).
  outline(color, threshold = 0.5) {
    const out = this.clone();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) >= threshold) continue;
        if (this.alpha(x - 1, y) >= threshold || this.alpha(x + 1, y) >= threshold ||
            this.alpha(x, y - 1) >= threshold || this.alpha(x, y + 1) >= threshold) {
          out.set(x, y, color);
        }
      }
    }
    return out;
  }

  // Map every pixel through fn(c, x, y) -> c.
  map(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c[3] <= 0) continue;
        const n = fn(c, x, y);
        if (n) this.set(x, y, n);
      }
    }
    return this;
  }

  clone() {
    const out = new Img(this.w, this.h);
    out.d.set(this.d);
    return out;
  }

  toPNG() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const row = y * (this.w * 4 + 1);
      raw[row] = 0;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        const o = row + 1 + x * 4;
        const a = this.d[i + 3];
        if (a <= 0.002) continue;
        raw[o] = clamp255(this.d[i]);
        raw[o + 1] = clamp255(this.d[i + 1]);
        raw[o + 2] = clamp255(this.d[i + 2]);
        raw[o + 3] = clamp255(a * 255);
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, this.toPNG());
  }
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDistT(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)), t];
}

function segDist(px, py, a, b) {
  return segDistT(px, py, a, b)[0];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

// Deterministic PRNG so the generated art is reproducible.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    (a[3] === undefined ? 1 : a[3]) + ((b[3] === undefined ? 1 : b[3]) - (a[3] === undefined ? 1 : a[3])) * t,
  ];
}

function hex(h, a = 1) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function withAlpha(c, a) {
  return [c[0], c[1], c[2], a];
}

module.exports = { Img, rng, mix, hex, withAlpha };
