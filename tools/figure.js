'use strict';
// Isaac's head, face and body, drawn with smooth shapes on a supersampled
// canvas. Everything is parametric so the same model produces the portraits,
// the menu busts, the map sprite and the side-view battler.

const { Img, rng, mix, hex, withAlpha } = require('./raster');

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
const LIGHT = norm([-0.55, -0.65, 0.55]);

// Pen in 1x coordinates on a canvas supersampled by S.
function pen(g, S) {
  const wrap = (p) => (typeof p === 'function' ? (x, y) => p(x / S, y / S) : p);
  const sc = (pts) => pts.map(([x, y]) => [x * S, y * S]);
  return {
    g,
    ellipse: (cx, cy, rx, ry, p, rot = 0, mode) => g.ellipse(cx * S, cy * S, rx * S, ry * S, wrap(p), rot, mode),
    poly: (pts, p, mode) => g.poly(sc(pts), wrap(p), mode),
    stroke: (pts, w, p, mode) => g.stroke(sc(pts), w * S, wrap(p), mode),
    taper: (pts, w0, w1, p, mode) => g.taper(sc(pts), w0 * S, w1 * S, wrap(p), mode),
    rect: (x, y, w, h, p, mode) => g.rect(x * S, y * S, w * S, h * S, wrap(p), mode),
    shape: (x0, y0, x1, y1, inside, p, mode) =>
      g.shape(x0 * S, y0 * S, x1 * S, y1 * S, (px, py) => inside(px / S, py / S), wrap(p), mode),
    glow: (cx, cy, r, col, strength = 1, mode = 'add') =>
      g.shape((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S,
        (px, py) => Math.hypot(px / S - cx, py / S - cy) < r,
        (px, py) => {
          const d = Math.hypot(px / S - cx, py / S - cy) / r;
          return withAlpha(col, (col[3] === undefined ? 1 : col[3]) * strength * Math.pow(1 - d, 2));
        }, mode),
  };
}

// A pen drawing in a translated/rotated/scaled local frame of another pen.
function xpen(p, T) {
  const r = T.rot || 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const k = T.k || 1;
  const fwd = (x, y) => [T.ox + k * (x * c - y * s), T.oy + k * (x * s + y * c)];
  const inv = (X, Y) => {
    const dx = (X - T.ox) / k;
    const dy = (Y - T.oy) / k;
    return [dx * c + dy * s, -dx * s + dy * c];
  };
  const wrap = (paint) => (typeof paint === 'function' ? (X, Y) => {
    const q = inv(X, Y);
    return paint(q[0], q[1]);
  } : paint);
  const map = (pts) => pts.map(([x, y]) => fwd(x, y));
  return {
    ellipse: (cx, cy, rx, ry, paint, r0 = 0, mode) => {
      const q = fwd(cx, cy);
      p.ellipse(q[0], q[1], rx * k, ry * k, wrap(paint), r0 + r, mode);
    },
    poly: (pts, paint, mode) => p.poly(map(pts), wrap(paint), mode),
    stroke: (pts, w, paint, mode) => p.stroke(map(pts), w * k, wrap(paint), mode),
    taper: (pts, w0, w1, paint, mode) => p.taper(map(pts), w0 * k, w1 * k, wrap(paint), mode),
    rect: (x, y, w, h, paint, mode) => p.poly(map([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), wrap(paint), mode),
    shape: (x0, y0, x1, y1, inside, paint, mode) => {
      const cs = map([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
      const xs = cs.map((q) => q[0]);
      const ys = cs.map((q) => q[1]);
      p.shape(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (X, Y) => {
        const q = inv(X, Y);
        return inside(q[0], q[1]);
      }, wrap(paint), mode);
    },
    glow: (cx, cy, rad, col, strength, mode) => {
      const q = fwd(cx, cy);
      p.glow(q[0], q[1], rad * k, col, strength, mode);
    },
  };
}

function ellipsePts(cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Skin and face
// ---------------------------------------------------------------------------

const PALETTES = {
  normal: { deep: hex('#5e3c3e'), shade: hex('#a98a82'), base: hex('#e6cfc2'), hi: hex('#fbf3ec') },
  pale: { deep: hex('#4e4044'), shade: hex('#968a88'), base: hex('#d8c9c3'), hi: hex('#f8f2ee') },
  dead: { deep: hex('#36384a'), shade: hex('#7e8296'), base: hex('#bcbcc6'), hi: hex('#eaeaef') },
  demon: { deep: hex('#2a0a0e'), shade: hex('#7a3a3a'), base: hex('#b98478'), hi: hex('#ebbcae') },
};

function smoothSkin(cx, cy, rx, ry, pal) {
  return (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const r2 = nx * nx + ny * ny;
    const nz = Math.sqrt(Math.max(0, 1 - r2));
    const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    const t = Math.max(0, Math.min(1, (d + 0.3) / 1.15));
    let c = t < 0.5 ? mix(pal.deep, pal.shade, t / 0.5) : mix(pal.shade, pal.base, (t - 0.5) / 0.5);
    c = mix(c, pal.hi, Math.pow(Math.max(0, d), 16) * 0.5);
    if (r2 > 0.8) c = mix(c, pal.deep, Math.min(1, (r2 - 0.8) / 0.2) * 0.5);
    return c;
  };
}

const TEAR_BLUE = hex('#a4d4f0', 0.62);
const BLOOD = hex('#6e0a10', 0.9);
const BLOOD_DK = hex('#3e050a', 0.95);

function tearStream(p, pts, w0, w1, col) {
  p.taper(pts, w0, w1, col);
  const hl = pts.map(([x, y]) => [x - w0 * 0.22, y]);
  p.taper(hl.slice(0, -1), w0 * 0.35, w1 * 0.25, hex('#ffffff', col === TEAR_BLUE ? 0.45 : 0.18));
  const [ex, ey] = pts[pts.length - 1];
  p.ellipse(ex, ey + w1 * 0.5, w1 * 0.75, w1 * 0.95, withAlpha(col, Math.min(1, col[3] + 0.2)));
  p.ellipse(ex - w1 * 0.25, ey + w1 * 0.2, w1 * 0.22, w1 * 0.3, hex('#ffffff', 0.55));
}

function drip(p, x, y, len, w = 3) {
  p.taper([[x, y], [x - 0.6, y + len * 0.5], [x - 1.4, y + len]], w, w * 0.55, BLOOD);
  p.ellipse(x - 1.4, y + len + w * 0.3, w * 0.45, w * 0.6, BLOOD_DK);
}

function splatter(p, r, cx, cy, spread, n) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.pow(r(), 0.7) * spread;
    const s = 0.5 + r() * 2.2;
    p.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, s, s * (0.7 + r() * 0.5),
      withAlpha(r() < 0.5 ? BLOOD : BLOOD_DK, 0.6 + r() * 0.35), a);
  }
}

function bruise(p, cx, cy, rad) {
  p.ellipse(cx, cy, rad * 1.25, rad, hex('#8a8a4a', 0.10));
  p.ellipse(cx, cy, rad, rad * 0.8, hex('#5a3a5a', 0.28));
  p.ellipse(cx + 1, cy + 1, rad * 0.6, rad * 0.45, hex('#3e2050', 0.2));
}

function drawEye(p, cx, cy, side, kind, pal) {
  const rx = 12.5;
  const ry = 14.5;
  p.ellipse(cx, cy - 1, rx + 5, ry + 4, withAlpha(pal.deep, 0.18));
  if (kind !== 'demon' && kind !== 'closed') {
    p.ellipse(cx, cy + 2.5, rx + 3.4, ry + 3, hex('#b8605a', kind === 'swollen' ? 0.6 : 0.42));
  }
  if (kind === 'closed') {
    p.ellipse(cx, cy + 6, rx + 2, 5, withAlpha(pal.deep, 0.35));
    p.taper(ellipsePts(cx, cy + 1, rx, 6, 0.15 * Math.PI, 0.85 * Math.PI, 16), 2.8, 2.8, hex('#2a1a22', 0.9));
    return;
  }
  if (kind === 'swollen') {
    p.ellipse(cx, cy + 1, rx + 6, ry + 3, hex('#6a3450', 0.62));
    p.ellipse(cx - 3, cy - 4, rx * 0.6, ry * 0.4, hex('#a05a72', 0.35));
    p.taper([[cx - rx + 2, cy + 4], [cx, cy + 6], [cx + rx - 2, cy + 4]], 2.6, 2.0, hex('#1a0c12', 0.95));
    return;
  }
  let top = () => -Infinity;
  let bot = () => Infinity;
  if (kind === 'happy') bot = () => cy + ry * 0.28;
  if (kind === 'narrow') top = (x) => cy - ry * 0.3 + (x - cx) * 0.32 * side;
  const inside = (x, y, erx = rx, ery = ry) =>
    ((x - cx) * (x - cx)) / (erx * erx) + ((y - cy) * (y - cy)) / (ery * ery) <= 1 && y >= top(x) && y <= bot(x);

  if (kind === 'wide') {
    const wrx = rx + 1.5, wry = ry + 2.5;
    p.shape(cx - wrx, cy - wry, cx + wrx, cy + wry, (x, y) => inside(x, y, wrx, wry), hex('#ece4e0'));
    p.stroke([[cx - 9, cy + 3], [cx - 5, cy + 1]], 0.8, hex('#a0303a', 0.55));
    p.stroke([[cx + 9, cy - 4], [cx + 5, cy - 2]], 0.8, hex('#a0303a', 0.55));
    p.ellipse(cx, cy + 1, 4.6, 5.2, hex('#140a10'));
    p.ellipse(cx - 1.3, cy - 0.8, 1.3, 1.3, hex('#ffffff', 0.95));
    p.taper(ellipsePts(cx, cy, wrx, wry, 1.08 * Math.PI, 1.92 * Math.PI, 16), 2.0, 2.0, hex('#2a1a22', 0.85));
    return;
  }
  if (kind === 'demon') {
    p.glow(cx, cy, rx + 9, hex('#ff1a1a', 0.75));
    p.ellipse(cx, cy, rx + 1.5, ry + 1.5, hex('#050203'));
    p.ellipse(cx, cy, rx * 0.35, ry * 0.42, hex('#5a0008', 0.9));
    p.ellipse(cx - rx * 0.35, cy - ry * 0.4, 2.2, 1.8, hex('#ff5050', 0.85));
    return;
  }
  p.shape(cx - rx, cy - ry, cx + rx, cy + ry, inside, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return mix(hex('#2b1a24'), hex('#07040a'), Math.min(1, d * 1.2));
  });
  p.shape(cx - rx, cy, cx + rx, cy + ry, (x, y) =>
    inside(x, y) && ((x - cx) * (x - cx)) / (rx * rx * 0.55) + ((y - cy - ry * 0.55) * (y - cy - ry * 0.55)) / (ry * ry * 0.06) <= 1,
  hex('#7a94ac', 0.4));
  const g1 = [cx - rx * 0.35, cy - ry * 0.38];
  if (inside(g1[0], g1[1])) p.ellipse(g1[0], g1[1], rx * 0.27, ry * 0.23, hex('#ffffff', 0.95), -0.4);
  const g2 = [cx + rx * 0.33, cy + ry * 0.12];
  if (inside(g2[0], g2[1])) p.ellipse(g2[0], g2[1], rx * 0.12, ry * 0.1, hex('#ffffff', 0.8));
  const lidTop = kind === 'narrow'
    ? [[cx - rx, top(cx - rx) + 0.5], [cx + rx, top(cx + rx) + 0.5]]
    : ellipsePts(cx, cy, rx, ry, 1.08 * Math.PI, 1.92 * Math.PI, 16);
  p.taper(lidTop, 2.4, 1.6, hex('#2a1a22', 0.75));
  if (kind === 'happy') {
    p.taper([[cx - rx + 1, cy + ry * 0.3], [cx, cy + ry * 0.18], [cx + rx - 1, cy + ry * 0.3]], 2.4, 2.4, withAlpha(pal.shade, 0.9));
  }
  if (kind !== 'happy') p.ellipse(cx, cy + ry + 0.5, rx * 0.85, 2.0, hex('#bfdcef', 0.5));
}

function drawBrows(p, kind, pal) {
  const col = withAlpha(mix(pal.shade, pal.deep, 0.45), 0.8);
  const sets = {
    sad: [[[33, 50], [46, 44], [59, 39]], [[111, 50], [98, 44], [85, 39]]],
    soft: [[[34, 47], [47, 43], [59, 42]], [[110, 47], [97, 43], [85, 42]]],
    raised: [[[34, 42], [45, 34], [59, 35]], [[110, 42], [99, 34], [85, 35]]],
    angry: [[[34, 42], [47, 45], [60, 51]], [[110, 42], [97, 45], [84, 51]]],
    flat: [[[35, 48], [47, 47], [59, 47]], [[109, 48], [97, 47], [85, 47]]],
  }[kind];
  sets.forEach((pts) => p.taper(pts, 2.6, 4.0, col));
}

function drawMouth(p, kind, pal) {
  const dark = hex('#30101a');
  const lip = withAlpha(mix(pal.shade, hex('#9a4a58'), 0.35), 0.9);
  switch (kind) {
    case 'pout':
      p.ellipse(72, 107, 8, 2.4, withAlpha(pal.shade, 0.35));
      p.poly([[61, 104], [66, 100], [78, 100], [83, 104], [77, 103.4], [72, 103.2], [67, 103.4]], dark);
      p.taper([[61, 104.5], [66, 100.5], [72, 100], [78, 100.5], [83, 104.5]], 1.4, 1.4, lip);
      break;
    case 'wail':
      p.poly([[59, 103], [65, 98.5], [79, 98.5], [85, 103], [82, 110], [72, 113.5], [62, 110]], dark);
      p.ellipse(72, 109.5, 7.5, 3.0, hex('#94404c'));
      p.rect(65, 98.6, 14, 1.8, hex('#e6dcd4', 0.85));
      p.taper([[59, 103], [65, 98], [79, 98], [85, 103]], 1.6, 1.6, lip);
      break;
    case 'scream':
      p.ellipse(72, 106, 12, 13, dark);
      p.ellipse(72, 95.5, 8.5, 2.8, hex('#e6dcd4', 0.95));
      p.ellipse(72, 114, 8, 4, hex('#94404c'));
      p.taper(ellipsePts(72, 106, 12, 13, 0, Math.PI * 2, 40), 1.6, 1.6, lip);
      break;
    case 'smile':
      p.taper([[61, 101], [66, 104.5], [72, 105.5], [78, 104.5], [83, 101]], 2.4, 2.4, dark);
      p.ellipse(72, 108.5, 6, 1.6, withAlpha(pal.shade, 0.35));
      break;
    case 'grit':
      p.poly([[60, 100], [84, 100], [83, 107], [61, 107]], hex('#e2d8cf'));
      [65, 69.5, 74.5, 79].forEach((x) => p.stroke([[x, 100.5], [x, 106.5]], 0.8, hex('#8a7a74', 0.8)));
      p.stroke([[60.5, 103.5], [83.5, 103.5]], 0.8, hex('#8a7a74', 0.8));
      p.taper([[59, 100.5], [72, 99.5], [85, 100.5], [84, 107], [72, 107.8], [60, 107], [59, 100.5]], 1.8, 1.8, dark);
      break;
    case 'grin': {
      const outer = [[54, 97], [63, 103], [72, 105], [81, 103], [90, 97], [84, 107], [72, 114], [60, 107]];
      p.poly(outer, hex('#120306'));
      for (let i = 0; i < 7; i++) {
        const x = 58 + i * 4.6;
        const yTop = 99 + Math.sin(((x - 54) / 36) * Math.PI) * 5.2;
        p.poly([[x - 2.2, yTop - 0.4], [x + 2.2, yTop - 0.4], [x, yTop + 4.5]], hex('#ddd2c4'));
      }
      p.taper(outer.concat([outer[0]]), 1.4, 1.4, hex('#5a1018', 0.9));
      break;
    }
    case 'slack':
      p.ellipse(72, 104, 6.5, 4, dark);
      p.ellipse(72, 106, 4, 1.5, hex('#6a3040'));
      break;
  }
}

const FACES = [
  { name: 'crying', pal: 'normal', eyes: 'normal', brows: 'sad', mouth: 'pout', tears: TEAR_BLUE, blush: 0.26 },
  { name: 'hurt', pal: 'normal', eyes: 'normal', brows: 'sad', mouth: 'grit', tears: TEAR_BLUE, blush: 0.16, wounds: ['bruiseR', 'cut'] },
  { name: 'wounded', pal: 'pale', eyes: 'normal', leftEye: 'swollen', brows: 'sad', mouth: 'wail', tears: TEAR_BLUE, wounds: ['gash', 'splatter', 'bruiseL', 'mouthBlood'] },
  { name: 'terrified', pal: 'normal', eyes: 'wide', brows: 'raised', mouth: 'scream', tears: TEAR_BLUE, blush: 0.12 },
  { name: 'demonic', pal: 'demon', eyes: 'demon', brows: 'angry', mouth: 'grin', tears: hex('#7a0a14', 0.9), horns: true },
  { name: 'smile', pal: 'normal', eyes: 'happy', brows: 'soft', mouth: 'smile', tears: hex('#a4d4f0', 0.5), blush: 0.4 },
  { name: 'dead', pal: 'dead', eyes: 'closed', brows: 'flat', mouth: 'slack', tears: null, wounds: ['gash', 'splatter', 'mouthBlood'] },
  { name: 'determined', pal: 'normal', eyes: 'narrow', brows: 'angry', mouth: 'grit', tears: TEAR_BLUE, blush: 0.2 },
];

// Head + face in "portrait space": head centred at (72, 66), radius 56x52.
function drawHead(p, spec, seed) {
  const pal = PALETTES[spec.pal];
  const r = rng(seed);
  [[17, 1], [127, -1]].forEach(([x, s]) => {
    p.ellipse(x, 76, 9, 13, smoothSkin(x, 76, 9, 13, pal));
    p.ellipse(x + s * 1.2, 76, 4.2, 8, withAlpha(pal.shade, 0.75));
    p.ellipse(x + s * 1.8, 77, 1.8, 4.5, withAlpha(pal.deep, 0.5));
  });
  if (spec.horns) {
    [[44, 1], [100, -1]].forEach(([x, s]) => {
      p.poly([[x - 9 * s, 27], [x - 13 * s, 3], [x + 6 * s, 21]], hex('#1e0b0e'));
      p.taper([[x - 7 * s, 23], [x - 11.5 * s, 6]], 1.6, 0.6, hex('#6a3a3a', 0.8));
    });
  }
  p.ellipse(72, 66, 56, 52, smoothSkin(72, 66, 56, 52, pal));
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 46;
    const s = 0.8 + r() * 3.2;
    p.ellipse(72 + Math.cos(a) * d * 1.05, 70 + Math.sin(a) * d, s, s * (0.6 + r() * 0.6),
      hex('#3a2a22', 0.06 + r() * 0.11), a);
  }
  if (spec.blush) {
    p.ellipse(34, 95, 12, 7.5, hex('#d86a70', spec.blush));
    p.ellipse(110, 95, 12, 7.5, hex('#d86a70', spec.blush));
  }
  const w = spec.wounds || [];
  if (w.includes('bruiseR')) bruise(p, 104, 52, 11);
  if (w.includes('bruiseL')) bruise(p, 38, 95, 10);
  drawBrows(p, spec.brows, pal);
  drawEye(p, 50, 74, 1, spec.leftEye || spec.eyes, pal);
  drawEye(p, 94, 74, -1, spec.eyes, pal);
  drawMouth(p, spec.mouth, pal);
  if (spec.tears) {
    const t = spec.tears;
    if (spec.leftEye !== 'swollen') tearStream(p, [[45, 89], [44, 98], [42, 108], [41.5, 115]], 5.5, 3.6, t);
    tearStream(p, [[99, 89], [100, 98], [102, 108], [102.5, 117]], 5.5, 3.6, t);
    if (spec.eyes === 'wide') {
      [[22, 70, 2.6], [124, 66, 2.2], [18, 86, 1.8], [128, 84, 2.4]].forEach(([x, y, s]) => {
        p.ellipse(x, y, s, s * 1.3, withAlpha(t, 0.75));
        p.ellipse(x - s * 0.3, y - s * 0.4, s * 0.3, s * 0.35, hex('#ffffff', 0.6));
      });
    }
  }
  if (w.includes('cut')) {
    p.taper([[60, 33], [68, 30.5], [77, 30]], 2.2, 1.2, BLOOD_DK);
    p.taper([[61, 32.6], [68, 30.4], [76, 30]], 1.0, 0.6, hex('#a0202e', 0.9));
    drip(p, 67.5, 32, 14, 2.6);
  }
  if (w.includes('gash')) {
    p.taper([[44, 38], [58, 31], [76, 28], [88, 31]], 3.4, 1.4, BLOOD_DK);
    p.taper([[46, 37.4], [58, 31], [75, 28.4]], 1.4, 0.6, hex('#a0202e', 0.95));
    drip(p, 56, 33, 20, 3.4);
    drip(p, 72, 30, 34, 3.0);
    drip(p, 84, 31, 12, 2.2);
  }
  if (w.includes('splatter')) splatter(p, r, 92, 44, 22, 26);
  if (w.includes('mouthBlood')) drip(p, 82, 106, 16, 3.2);
}

function drawFace(spec, seed) {
  const S = 4;
  const g = new Img(144 * S, 144 * S);
  const p = pen(g, S);
  const pal = PALETTES[spec.pal];
  if (spec.horns) p.glow(72, 64, 72, hex('#a00010', 0.5));
  p.ellipse(72, 172, 60, 48, smoothSkin(72, 172, 60, 48, pal));
  p.taper([[40, 136], [60, 131]], 1.4, 0.6, withAlpha(pal.deep, 0.25));
  p.taper([[104, 136], [84, 131]], 1.4, 0.6, withAlpha(pal.deep, 0.25));
  p.ellipse(72, 119, 17, 6, withAlpha(pal.deep, 0.4));
  drawHead(p, spec, seed);
  return g.downsample(S);
}

// ---------------------------------------------------------------------------
// Full body. Figure space: feet at (0, 0), top of the head near y = -100.
// ---------------------------------------------------------------------------

const RAG = hex('#4a4038');
const RAG_DK = hex('#2a231e');

const HEAD = { x: 0, y: -79, rx: 21, ry: 20 };

function defaultPose() {
  return {
    dx: 0, dy: 0, lean: 0, crouch: 0,
    head: { dx: 0, dy: 0, tilt: 0 },
    armL: [-3, 21], armR: [3, 21],
    footL: [0, 0], footR: [0, 0],
    tearsFly: 0, glow: null, eyesClosed: false, expression: 0,
  };
}

function pose(over) {
  const p = defaultPose();
  for (const k of Object.keys(over || {})) {
    if (k === 'head') Object.assign(p.head, over.head);
    else p[k] = over[k];
  }
  return p;
}

function limb(p, from, to, w0, w1, pal, end) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const shade = smoothSkin(mid[0] - w0 * 0.2, mid[1], w0 * 0.8, len * 0.6, pal);
  p.taper([from, to], w0, w1, shade);
  if (end) p.ellipse(to[0] + end[0], to[1] + end[1], end[2], end[3], smoothSkin(to[0] + end[0], to[1] + end[1], end[2], end[3], pal));
}

// view: 'front' | 'back' | 'left'
function drawBody(p, view, P, opts) {
  const pal = PALETTES[opts.pal || 'normal'];
  const crouch = P.crouch || 0;
  const hipY = -31 + crouch * 13;
  const shoulderY = -54 + crouch * 13;
  const torsoY = -44 + crouch * 13;
  const side = view === 'left';
  const legFrom = (s) => [s * (side ? 2 : 5.5), hipY];
  const footAt = (s, off) => {
    const base = [s * (side ? 1.5 : 6.5) + off[0], -3 + off[1]];
    if (crouch) base[0] += s * crouch * 6;
    return base;
  };
  const kneeOut = (from, to, s) => {
    if (!crouch) return [from, to];
    const m = [(from[0] + to[0]) / 2 + s * crouch * 7, (from[1] + to[1]) / 2 - crouch * 2];
    return [from, m, to];
  };
  const leg = (s, off) => {
    const from = legFrom(s);
    const to = footAt(s, off);
    const pts = kneeOut(from, to, side ? -1 : s);
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    p.taper(pts, 8.6, 6.4, smoothSkin(from[0], (from[1] + to[1]) / 2, 6, len * 0.6, pal));
    const footDir = view === 'left' ? -3 : 0;
    p.ellipse(to[0] + footDir, to[1] + 0.5, view === 'left' ? 5 : 4.2, 2.6, smoothSkin(to[0] + footDir, to[1], 5, 3, pal));
  };
  const shoulder = (s) => [s * (side ? 3 : 11.5), shoulderY];
  const arm = (s, off) => {
    const from = shoulder(s);
    const to = [from[0] + off[0], from[1] + off[1]];
    limb(p, from, to, 6.6, 5.4, pal, [0, 1, 3.4, 3.4]);
  };

  if (side) {
    arm(1, P.armR);
    leg(1, P.footR);
  } else {
    leg(-1, P.footL);
    leg(1, P.footR);
  }
  // torso
  const trx = side ? 10.5 : 13;
  p.ellipse(0, torsoY, trx, 16, smoothSkin(-2, torsoY - 2, trx, 16, pal));
  if (view === 'front') p.ellipse(0.5, torsoY + 4, 1, 1.2, withAlpha(pal.deep, 0.5));
  if (view === 'back') p.taper([[0, shoulderY + 1], [0, torsoY + 8]], 1.6, 1, withAlpha(pal.deep, 0.3));
  // ragged loincloth
  const ry = hipY + 2;
  const rag = [[-trx - 0.5, ry - 6], [trx + 0.5, ry - 6], [trx - 1, ry + 3], [trx - 4, ry + 1.5], [trx - 6, ry + 5],
    [2, ry + 2.5], [-2, ry + 6], [-5, ry + 2], [-trx + 2, ry + 4.5], [-trx + 0.5, ry + 1]];
  p.poly(rag, (x, y) => mix(RAG, RAG_DK, Math.max(0, Math.min(1, (y - (ry - 6)) / 12 + (x + trx) / (4 * trx)))));
  p.taper([[-trx - 0.3, ry - 5.5], [trx + 0.3, ry - 5.5]], 1.2, 1.2, withAlpha(RAG_DK, 0.9));
  if (side) {
    leg(-1, P.footL);
    arm(-1, P.armL);
  } else {
    arm(-1, P.armL);
    arm(1, P.armR);
  }
}

function drawHeadView(p, view, P, opts) {
  const pal = PALETTES[opts.pal || 'normal'];
  const crouch = P.crouch || 0;
  const hx = HEAD.x + (P.head.dx || 0);
  const hy = HEAD.y + crouch * 13 + (P.head.dy || 0);
  const hp = xpen(p, { ox: hx, oy: hy, k: 1, rot: P.head.tilt || 0 });
  if (view === 'front') {
    const k = HEAD.rx / 56;
    const fp = xpen(hp, { ox: -72 * k, oy: -66 * k, k });
    const spec = Object.assign({}, FACES[P.expression || 0]);
    if (P.eyesClosed) Object.assign(spec, { eyes: 'closed', leftEye: null, tears: spec.tears });
    drawHead(fp, spec, opts.seed || 5);
    return;
  }
  const { rx, ry } = HEAD;
  if (view === 'back') {
    // seen from behind, turned slightly to the left
    hp.ellipse(-rx * 0.96, 2.5, 3.6, 5.2, smoothSkin(-rx * 0.96, 2.5, 3.6, 5.2, pal));
    hp.ellipse(rx * 0.97, 2.5, 3.2, 5, smoothSkin(rx * 0.97, 2.5, 3.2, 5, pal));
    hp.ellipse(0, 0, rx, ry, smoothSkin(1, -2, rx, ry, pal));
    hp.ellipse(-rx * 0.92, 2.5, 1.6, 3, withAlpha(pal.deep, 0.45));
    hp.ellipse(0, ry * 0.78, rx * 0.5, ry * 0.18, withAlpha(pal.deep, 0.35));
    const r = rng(opts.seed || 9);
    for (let i = 0; i < 14; i++) {
      hp.ellipse((r() - 0.5) * rx * 1.4, (r() - 0.6) * ry * 1.2, 0.5 + r() * 1.3, 0.4 + r() * 1, hex('#3a2a22', 0.07 + r() * 0.1), r() * 3);
    }
    // a tear running off the visible edge of the cheek
    hp.taper([[-rx * 0.86, 7], [-rx * 0.92, 12], [-rx * 0.95, 17]], 1.9, 1.3, TEAR_BLUE);
    hp.ellipse(-rx * 0.96, 18.2, 1.2, 1.5, withAlpha(TEAR_BLUE, 0.9));
    return;
  }
  // facing left
  hp.ellipse(0, 0, rx * 0.97, ry, smoothSkin(-2, -2, rx * 0.97, ry, pal));
  hp.ellipse(rx * 0.22, 2, 3.6, 5.2, smoothSkin(rx * 0.22, 2, 3.6, 5.2, pal));
  hp.ellipse(rx * 0.24, 2.2, 1.6, 3, withAlpha(pal.deep, 0.45));
  const ex = -rx * 0.58;
  hp.ellipse(ex, 2, 3.4, 4.4, hex('#b8605a', 0.4));
  if (P.eyesClosed) {
    hp.taper([[ex - 3, 2.5], [ex, 3.6], [ex + 2.6, 2.5]], 1.2, 1.2, hex('#2a1a22', 0.9));
  } else {
    hp.ellipse(ex, 1.2, 2.7, 3.9, hex('#0c070b'));
    hp.ellipse(ex - 0.9, -0.3, 0.8, 0.8, hex('#ffffff', 0.9));
  }
  hp.taper([[ex - 4.5, -5.2], [ex + 2.8, -6.6]], 0.9, 1.3, withAlpha(mix(pal.shade, pal.deep, 0.45), 0.8));
  hp.taper([[ex - 0.4, 5.5], [ex - 1.2, 10], [ex - 1.6, 14]], 1.8, 1.2, TEAR_BLUE);
  hp.ellipse(ex - 1.6, 14.8, 1.1, 1.4, withAlpha(TEAR_BLUE, 0.9));
  hp.taper([[-rx * 0.86, 11], [-rx * 0.76, 10.2], [-rx * 0.62, 11]], 1.1, 1.1, hex('#30101a'));
  hp.ellipse(-rx * 0.45, 8, 3.2, 2, hex('#d86a70', 0.25));
}

function drawTears(p, view, P) {
  if (!P.tearsFly) return;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = P.tearsFly + i * 0.55;
    const x = HEAD.x - 12 - t * 26;
    const y = HEAD.y - 6 - t * 9 + i * 3;
    const s = 3.4 - i * 0.6;
    p.ellipse(x, y, s * 1.5, s, (X, Y) => mix(hex('#e6f6ff'), hex('#4a90d0'), Math.min(1, Math.hypot(X - x + s * 0.5, Y - y + s * 0.4) / (s * 1.6))), -0.3);
    p.taper([[x + s * 1.2, y + 0.3], [x + s * 4.5, y + 1.6]], s * 1.1, 0.4, hex('#a4d4f0', 0.45));
  }
}

function drawFigure(p, view, P, opts = {}) {
  const fp = xpen(p, { ox: P.dx || 0, oy: P.dy || 0, k: 1, rot: P.lean || 0 });
  if (P.glow) fp.glow(0, -60, 70, P.glow, 1);
  drawBody(fp, view, P, opts);
  drawHeadView(fp, view, P, opts);
  drawTears(fp, view, P);
}

// ---------------------------------------------------------------------------
// Fear & Hunger look: desaturated, warm-grey, grainy, inked silhouette.
// ---------------------------------------------------------------------------

function grade(img, opts = {}) {
  const desat = opts.desat === undefined ? 0.38 : opts.desat;
  const grain = opts.grain === undefined ? 7 : opts.grain;
  const r = rng(opts.seed || 77);
  const light = [232, 224, 210];
  const dark = [30, 25, 30];
  img.map((c) => {
    const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    let o = mix(c, [L, L, L, c[3]], desat);
    const duo = mix(dark.concat([1]), light.concat([1]), L / 255);
    o = mix(o, duo, 0.22);
    const n = (r() - 0.5) * grain;
    return [
      Math.max(0, Math.min(255, (o[0] - 128) * 1.06 + 128 + n)),
      Math.max(0, Math.min(255, (o[1] - 128) * 1.06 + 128 + n)),
      Math.max(0, Math.min(255, (o[2] - 128) * 1.06 + 128 + n)),
      c[3],
    ];
  });
  if (opts.ink) return img.outline(hex('#1a1214', opts.ink), 0.45);
  return img;
}

module.exports = {
  LIGHT, pen, xpen, ellipsePts, PALETTES, smoothSkin, FACES, drawHead, drawFace,
  drawFigure, pose, defaultPose, grade, TEAR_BLUE,
};
