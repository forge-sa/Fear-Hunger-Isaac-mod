'use strict';
// Generates every image the mod ships with, sized like Fear & Hunger's own:
//   img/characters/$Isaac.png   map sprite (3x4 walk cycle, 80x110 cells)
//   img/sv_actors/Isaac.png     side-view battler (9x6 motions, 230px cells)
//   img/faces/Isaac.png         8 portraits (144px)
//   img/pictures/Isaac_1..8.png main-menu busts for GALV_BustMenu (182x360)
//   img/system/IsaacIcons.png   item/skill icons (32px)
//   img/animations/IsaacFX.png  battle effects (192px cells, 5 per row)
// Usage: node tools/build-assets.js [--preview <dir>]

const path = require('path');
const { Img, rng, mix, hex, withAlpha } = require('./raster');
const {
  LIGHT, pen, xpen, ellipsePts, PALETTES, smoothSkin, FACES, drawHead, drawFace,
  drawFigure, pose, grade,
} = require('./figure');

const OUT = path.join(__dirname, '..', 'mod', 'www', 'img');

function star(cx, cy, r, inner = 0.28, points = 4, rot = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function heartPts(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([cx + x * s, cy + y * s]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Portraits and busts
// ---------------------------------------------------------------------------

function buildFaces() {
  const sheet = new Img(576, 288);
  FACES.forEach((spec, i) => {
    const face = grade(drawFace(spec, 1000 + i * 77), { seed: i + 1 });
    sheet.blit(face, (i % 4) * 144, Math.floor(i / 4) * 144);
  });
  return sheet;
}

// GALV_BustMenu draws img/pictures/<faceName>_<faceIndex + 1> in the menu.
function drawBust(spec, seed) {
  const S = 3;
  const g = new Img(182 * S, 360 * S);
  const p = pen(g, S);
  const pal = PALETTES[spec.pal];
  const k = 1.42;
  const hx = 91;
  const hy = 112;
  if (spec.horns) p.glow(hx, hy, 110, hex('#a00010', 0.45));
  // chest + round child's belly, shoulders, then arms hanging over the sides
  p.ellipse(hx, 312, 46, 96, smoothSkin(hx - 10, 290, 46, 96, pal));
  p.ellipse(hx, 236, 40, 44, smoothSkin(hx - 8, 228, 40, 44, pal));
  [-1, 1].forEach((s) => {
    p.ellipse(hx + s * 40, 222, 16, 15, smoothSkin(hx + s * 40 - 4, 218, 16, 15, pal));
  });
  [-1, 1].forEach((s) => {
    const arm = [[hx + s * 46, 222], [hx + s * 55, 288], [hx + s * 56, 340]];
    p.taper(arm.map(([x, y]) => [x - s * 9.5, y]), 2.4, 2, withAlpha(pal.deep, 0.45));
    p.taper(arm, 20, 16, smoothSkin(hx + s * 52 - 5, 280, 13, 80, pal));
    p.ellipse(hx + s * 56, 346, 9, 11, smoothSkin(hx + s * 56 - 2, 343, 9, 11, pal));
  });
  [-1, 1].forEach((s) => {
    p.taper([[hx + s * 32, 208], [hx + s * 8, 215]], 2.2, 1, withAlpha(pal.deep, 0.3));
    for (let i = 0; i < 3; i++) {
      p.taper([[hx + s * 30, 242 + i * 13], [hx + s * 15, 247 + i * 13]], 1.6, 0.6, withAlpha(pal.deep, 0.14));
    }
  });
  p.ellipse(hx + 1, 326, 2.2, 2.8, withAlpha(pal.deep, 0.55));
  p.ellipse(hx, 186, 24, 7, withAlpha(pal.deep, 0.4));
  drawHead(xpen(p, { ox: hx - 72 * k, oy: hy - 66 * k, k }), spec, seed);
  if ((spec.wounds || []).includes('splatter')) {
    const r = rng(seed + 3);
    for (let i = 0; i < 30; i++) {
      const x = hx - 30 + r() * 70;
      const y = 215 + Math.pow(r(), 0.8) * 110;
      p.ellipse(x, y, 0.8 + r() * 2.6, 0.8 + r() * 2.2, hex(r() < 0.5 ? '#6e0a10' : '#3e050a', 0.6 + r() * 0.35), r() * 3);
    }
    p.taper([[hx - 12, 205], [hx - 14, 250], [hx - 13, 300]], 4, 2, hex('#6e0a10', 0.85));
  }
  return g.downsample(S);
}

function buildBusts() {
  return FACES.map((spec, i) => grade(drawBust(spec, 1000 + i * 77), { seed: 50 + i }));
}

// ---------------------------------------------------------------------------
// Map sprite: four directions x three walk frames, 80x110 cells like the
// game's other characters, figure about 66px tall.
// ---------------------------------------------------------------------------

function walkPose(view, step) {
  const lift = (s) => (step === s ? -2.4 : 0);
  if (view === 'left') {
    return pose({
      dy: step ? -0.8 : 0,
      footL: [step * -5, lift(-1)], footR: [step * 5, lift(1)],
      armL: [-3 + step * 3.5, 20], armR: [3 - step * 3.5, 20],
    });
  }
  return pose({
    dy: step ? -0.8 : 0,
    footL: [0, lift(-1)], footR: [0, lift(1)],
    armL: [-3, 21 + step * 1.2], armR: [3, 21 - step * 1.2],
  });
}

function buildCharacter() {
  const sheet = new Img(240, 440);
  ['front', 'left', 'right', 'back'].forEach((dir, row) => {
    const view = dir === 'right' ? 'left' : dir;
    for (let f = 0; f < 3; f++) {
      const S = 4;
      const g = new Img(80 * S, 110 * S);
      const p = pen(g, S);
      p.ellipse(40, 100, 15, 4.2, hex('#000000', 0.3));
      drawFigure(xpen(p, { ox: 40, oy: 100, k: 0.66 }), view, walkPose(view, [-1, 0, 1][f]), { seed: 11 });
      const cell = grade(g.downsample(S), { seed: row * 3 + f + 1, ink: 0.85 });
      sheet.blit(cell, f * 80, row * 110, { flipX: dir === 'right' });
    }
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Side-view battler. Fear & Hunger forces side view (Olivia_OctoBattle) and
// shows the party from behind; cells are 230px, motions in MV's standard
// order (column block = motion / 6, row = motion % 6).
// ---------------------------------------------------------------------------

const MOTIONS = ['walk', 'wait', 'chant', 'guard', 'damage', 'evade', 'thrust', 'swing', 'missile',
  'skill', 'spell', 'item', 'escape', 'victory', 'dying', 'abnormal', 'sleep', 'dead'];

function battlerPose(motion, f) {
  const s = [-1, 0, 1][f];
  switch (motion) {
    case 'walk': return { view: 'back', P: walkPose('back', s) };
    case 'wait': return { view: 'back', P: pose({ dx: [0, 0.6, -0.6][f], dy: [0, -1, 0.5][f], head: { dy: [0, -1.2, 0.4][f] }, armL: [-4, 20], armR: [4, 20] }) };
    case 'chant': return { view: 'back', P: pose({ armL: [-7, 8 - f], armR: [7, 8 - f], head: { dy: 1 }, glow: hex('#9ab8e0', 0.18 + f * 0.05) }) };
    case 'guard': return { view: 'back', P: pose({ crouch: 0.25, armL: [5, -12], armR: [-5, -12], head: { dy: 2 } }) };
    case 'damage': return { view: 'back', P: pose({ lean: 0.1 + f * 0.04, dx: 6 + f * 3, armL: [-11, 12], armR: [11, 12], head: { tilt: 0.15 } }) };
    case 'evade': return { view: 'back', P: pose({ dx: [12, 20, 14][f], lean: 0.1, armL: [-6, 16], armR: [6, 16] }) };
    case 'thrust': return { view: 'back', P: pose({ lean: -0.06 * f, armL: [-12 - f * 3, 4 - f * 4], armR: [4, 20], tearsFly: f ? f * 0.5 : 0 }) };
    case 'swing': return { view: 'back', P: pose({ lean: -0.04 * f, armL: [[6, -20], [-6, -14], [-14, 2]][f], armR: [5, 19] }) };
    case 'missile': return { view: 'back', P: pose({ head: { tilt: [0.12, -0.05, -0.12][f] }, tearsFly: [0, 0.4, 1.1][f], armL: [-5, 17], armR: [5, 17], lean: [0.03, -0.03, -0.06][f] }) };
    case 'skill': return { view: 'back', P: pose({ armL: [-8, -16 - f * 2], armR: [8, -16 - f * 2], dy: -f }) };
    case 'spell': return { view: 'back', P: pose({ armL: [-10 - f, 4], armR: [10 + f, 4], head: { dy: -f * 0.5 } }) };
    case 'item': return { view: 'back', P: pose({ armL: [-6 - f, -14 - f * 2], armR: [4, 20] }) };
    case 'escape': return { view: 'left', flip: true, P: walkPose('left', s) };
    case 'victory': return { view: 'back', P: pose({ dy: [-3, -6, -3][f], armL: [-8, -20], armR: [8, -20] }) };
    case 'dying': return { view: 'back', P: pose({ crouch: 0.6, lean: 0.05, head: { dy: 4, tilt: 0.1 }, armL: [-4, 14], armR: [4, 14] }) };
    case 'abnormal': return { view: 'back', P: pose({ lean: [-0.08, 0.08, 0][f], head: { tilt: [0.2, -0.2, 0][f] }, armL: [-6, 18], armR: [6, 18] }) };
    case 'sleep': return { view: 'back', P: pose({ crouch: 0.9, head: { dy: 6, tilt: 0.25 }, armL: [-2, 10], armR: [2, 10] }) };
    case 'dead': return { view: 'back', dead: true, P: pose({ armL: [-6, 18], armR: [6, 18], crouch: 0 }) };
  }
  throw new Error('unknown motion ' + motion);
}

function battlerCell(motion, f) {
  const S = 2;
  const g = new Img(230 * S, 230 * S);
  const p = pen(g, S);
  const spec = battlerPose(motion, f);
  if (spec.dead) {
    p.ellipse(118, 212, 64 + f * 6, 9 + f, hex('#3e050a', 0.55));
    p.ellipse(115, 214, 74, 9, hex('#000000', 0.25));
    drawFigure(xpen(p, { ox: 115 + 68, oy: 204, k: 1.45, rot: -Math.PI / 2 }), spec.view, spec.P, { seed: 13 });
  } else {
    p.ellipse(115, 215, 34, 8, hex('#000000', 0.3));
    drawFigure(xpen(p, { ox: 115, oy: 214, k: 1.5 }), spec.view, spec.P, { seed: 13 });
  }
  return { img: grade(g.downsample(S), { seed: MOTIONS.indexOf(motion) * 3 + f + 1, ink: 0.85 }), flip: !!spec.flip };
}

function buildBattler() {
  const sheet = new Img(230 * 9, 230 * 6);
  MOTIONS.forEach((m, i) => {
    for (let f = 0; f < 3; f++) {
      const { img, flip } = battlerCell(m, f);
      sheet.blit(img, (Math.floor(i / 6) * 3 + f) * 230, (i % 6) * 230, { flipX: flip });
    }
  });
  return sheet;
}
// ---------------------------------------------------------------------------
// Icons (32px, 8 per row).
// ---------------------------------------------------------------------------

function teardrop(p, cx, cy, r, paint) {
  p.ellipse(cx, cy, r, r, paint);
  p.poly([[cx, cy - r * 2.05], [cx - r * 0.93, cy - r * 0.38], [cx + r * 0.93, cy - r * 0.38]], paint);
}

function radial(cx, cy, r, inner, outer) {
  return (x, y) => mix(inner, outer, Math.min(1, Math.hypot(x - cx, y - cy) / r));
}

function sphere(cx, cy, rad, base, hi, deep) {
  return (x, y) => {
    const nx = (x - cx) / rad;
    const ny = (y - cy) / rad;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    let c = d < 0.4 ? mix(deep, base, Math.max(0, d + 0.2) / 0.6) : base;
    c = mix(c, hi, Math.pow(Math.max(0, d), 14) * 0.9);
    return c;
  };
}

function die(p, cx, cy, h, n, opts = {}) {
  const rad = h * 0.3;
  const inBox = (x, y, hh) => {
    const dx = Math.max(Math.abs(x - cx) - (hh - rad), 0);
    const dy = Math.max(Math.abs(y - cy) - (hh - rad), 0);
    return dx * dx + dy * dy <= rad * rad;
  };
  p.shape(cx - h + h * 0.12, cy - h + h * 0.12, cx + h + h * 0.12, cy + h + h * 0.12,
    (x, y) => inBox(x - h * 0.1, y - h * 0.1, h), hex('#000000', 0.35));
  p.shape(cx - h, cy - h, cx + h, cy + h, (x, y) => inBox(x, y, h), (x, y) => {
    const t = ((x - cx) + (y - cy)) / (2 * h);
    return mix(hex('#fbf8f2'), hex('#bdb3a6'), Math.max(0, Math.min(1, t * 0.9 + 0.35)));
  });
  p.shape(cx - h, cy - h, cx + h, cy + h, (x, y) => inBox(x, y, h) && !inBox(x, y, h * 0.86), hex('#8a7f72', 0.55));
  const o = h * 0.52;
  const pos = {
    1: [[0, 0]],
    2: [[-o, -o], [o, o]],
    3: [[-o, -o], [0, 0], [o, o]],
    4: [[-o, -o], [o, -o], [-o, o], [o, o]],
    5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
    6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
  }[n];
  const pr = n === 1 ? h * 0.26 : h * 0.17;
  pos.forEach(([dx, dy]) => {
    p.ellipse(cx + dx, cy + dy, pr, pr, n === 1 ? hex('#a01626') : hex('#1a1214'));
    p.ellipse(cx + dx - pr * 0.3, cy + dy - pr * 0.3, pr * 0.3, pr * 0.3, hex('#ffffff', 0.25));
  });
  if (opts.outline) {
    p.shape(cx - h - 1, cy - h - 1, cx + h + 1, cy + h + 1, (x, y) => inBox(x, y, h + 0.9) && !inBox(x, y, h), hex('#2a2222'));
  }
}

function capsule(p, cx, cy, len, w, rot, colA, colB) {
  const dx = Math.cos(rot) * len * 0.5;
  const dy = Math.sin(rot) * len * 0.5;
  const nx = -Math.sin(rot);
  const ny = Math.cos(rot);
  const shade = (base) => (x, y) => {
    const t = ((x - cx) * nx + (y - cy) * ny) / (w * 0.5);
    return mix(mix(base, hex('#ffffff'), 0.45), mix(base, hex('#000000'), 0.35), (t + 1) / 2);
  };
  p.stroke([[cx - dx, cy - dy], [cx, cy]], w, shade(colA));
  p.stroke([[cx + dx, cy + dy], [cx + dx * 0.02, cy + dy * 0.02]], w, shade(colB));
  p.stroke([[cx - dx * 0.75 + nx * w * 0.22, cy - dy * 0.75 + ny * w * 0.22 - w * 0.0],
    [cx + dx * 0.7 + nx * w * 0.22, cy + dy * 0.7 + ny * w * 0.22]], w * 0.16, hex('#ffffff', 0.55));
}

function icon(drawFn) {
  const S = 4;
  const g = new Img(32 * S, 32 * S);
  drawFn(pen(g, S));
  return g.downsample(S);
}

const ICONS = [
  // 0 Tears
  (p) => {
    teardrop(p, 16, 20, 7.6, radial(13, 17, 12, hex('#d8f3ff'), hex('#2f7fd0')));
    p.ellipse(12.8, 18.6, 1.6, 2.6, hex('#ffffff', 0.85), 0.35);
  },
  // 1 Brimstone
  (p) => {
    p.taper([[4, 28], [16, 16], [28, 4]], 14, 10, hex('#ff2020', 0.3));
    p.taper([[4, 28], [16, 16], [28, 4]], 8, 6, hex('#a8001a'));
    p.taper([[4, 28], [16, 16], [28, 4]], 4, 3, hex('#ff5a5a'));
    p.taper([[4, 28], [28, 4]], 1.4, 1.0, hex('#ffe0e0'));
    p.ellipse(9, 9, 2.2, 3.0, hex('#8a0010'));
    p.ellipse(24, 25, 1.8, 2.4, hex('#8a0010'));
  },
  // 2 Yum Heart
  (p) => {
    p.poly(heartPts(16, 15.5, 0.84), radial(11, 10, 20, hex('#ff6a78'), hex('#8a0616')));
    p.ellipse(11, 10.5, 2.4, 1.6, hex('#ffffff', 0.8), -0.6);
  },
  // 3 D6
  (p) => die(p, 16, 16, 11.5, 6, { outline: true }),
  // 4 Pill
  (p) => capsule(p, 16, 16, 18, 9.5, -Math.PI / 4, hex('#f0f0f0'), hex('#3a70e0')),
  // 5 Bomb
  (p) => {
    p.ellipse(15, 19, 10, 10, sphere(15, 19, 10, hex('#5c5c66'), hex('#d0d0dc'), hex('#18181e')));
    p.rect(12.5, 7.5, 5, 3.5, hex('#3a3a42'));
    p.taper([[15, 8], [18, 4.5], [23, 3.5]], 1.8, 1.4, hex('#7a5a32'));
    p.glow(24, 3.5, 6, hex('#ffb030'), 1.4);
    p.poly(star(24, 3.5, 4.2, 0.3, 4, 0.3), hex('#fff2a0'));
  },
  // 6 Isaac
  (p) => {
    const pal = PALETTES.normal;
    p.ellipse(16, 16, 13, 12, smoothSkin(16, 16, 13, 12, pal));
    p.ellipse(11, 17, 3, 3.6, hex('#120a10'));
    p.ellipse(21, 17, 3, 3.6, hex('#120a10'));
    p.ellipse(10.2, 15.8, 0.9, 0.9, hex('#ffffff'));
    p.ellipse(20.2, 15.8, 0.9, 0.9, hex('#ffffff'));
    p.taper([[10.6, 20.5], [10, 26]], 1.6, 1.2, hex('#7ac8ff', 0.9));
    p.taper([[21.4, 20.5], [22, 26]], 1.6, 1.2, hex('#7ac8ff', 0.9));
    p.taper([[13, 24], [16, 22.6], [19, 24]], 1.2, 1.2, hex('#5a1a24'));
  },
  // 7 Bloody tear
  (p) => {
    teardrop(p, 16, 20, 7.6, radial(13, 17, 12, hex('#ff7a7a'), hex('#5a0008')));
    p.ellipse(12.8, 18.6, 1.6, 2.6, hex('#ffffff', 0.6), 0.35);
  },
];

function buildIcons() {
  const sheet = new Img(256, 32);
  ICONS.forEach((fn, i) => {
    const ic = icon(fn);
    sheet.blit(ic.outline(hex('#1a1014', 0.9), 0.35), i * 32, 0);
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Battle effects: 192px cells, 5 columns.
// ---------------------------------------------------------------------------

const C0 = 96;  // cell center

function fxCell(fn, seed) {
  const S = 2;
  const g = new Img(192 * S, 192 * S);
  fn(pen(g, S), rng(seed * 7919 + 17));
  return g.downsample(S);
}

const TEAR_IN = hex('#e2f6ff');
const TEAR_OUT = hex('#3a8fdc');

function tearFrame(k) {
  return (p, r) => {
    if (k === 0) {
      teardrop(p, C0, 104, 17, radial(C0 - 6, 98, 26, TEAR_IN, TEAR_OUT));
      p.ellipse(C0 - 6, 99, 3.6, 6, hex('#ffffff', 0.85), 0.35);
      return;
    }
    if (k === 1) {
      p.ellipse(C0, 104, 30, 13, radial(C0 - 8, 100, 32, TEAR_IN, TEAR_OUT));
      p.ellipse(C0 - 10, 100, 7, 2.5, hex('#ffffff', 0.7));
    }
    const ringR = [0, 30, 46, 64, 78][k];
    const op = [1, 0.9, 0.85, 0.6, 0.3][k];
    p.stroke(ellipsePts(C0, 106, ringR, ringR * 0.38, 0, Math.PI * 2, 56), [0, 5, 6, 4, 2.5][k],
      withAlpha(hex('#9ad6ff'), op));
    if (k >= 2) p.ellipse(C0, 106, ringR * 0.55, ringR * 0.2, hex('#bfe8ff', 0.5 * op));
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + (i / (n - 1)) * Math.PI + (r() - 0.5) * 0.3;
      const d = ringR * (0.8 + r() * 0.5) + (k - 1) * 6;
      const lift = Math.sin(-a) * [0, 10, 24, 30, 26][k];
      const x = C0 + Math.cos(a) * d;
      const y = 106 + Math.sin(a) * d * 0.45 - lift;
      const s = [0, 5, 4.4, 3.4, 2][k] * (0.7 + r() * 0.6);
      p.ellipse(x, y, s, s * 1.5, radial(x - s * 0.3, y - s * 0.3, s * 1.6, TEAR_IN, withAlpha(TEAR_OUT, op)), a + Math.PI / 2);
    }
  };
}

function heartFrame(k) {
  return (p, r) => {
    const sc = [1.6, 2.4, 2.9, 3.0, 0][k];
    const op = [0.9, 1, 1, 0.75, 0][k];
    if (sc) {
      p.glow(C0, 92, sc * 30, hex('#ff4060', 0.6 * op));
      p.poly(heartPts(C0, 92, sc), radial(C0 - sc * 8, 92 - sc * 8, sc * 30, withAlpha(hex('#ff7080'), op), withAlpha(hex('#7a0414'), op)));
      p.ellipse(C0 - sc * 6, 92 - sc * 6, sc * 2.4, sc * 1.5, hex('#ffffff', 0.75 * op), -0.6);
    }
    const ns = [0, 2, 5, 7, 9][k];
    for (let i = 0; i < ns; i++) {
      const a = r() * Math.PI * 2;
      const d = 26 + r() * (12 + k * 9);
      const x = C0 + Math.cos(a) * d;
      const y = 92 + Math.sin(a) * d * 0.8 - k * 4;
      const s = 4 + r() * 6;
      p.glow(x, y, s * 1.6, hex('#ffd0d8', 0.7));
      p.poly(star(x, y, s, 0.28, 4, r()), hex('#fff6f8', 0.95), 'add');
      if (k >= 3 && i % 2 === 0) p.poly(heartPts(x + 8, y + 10, 0.35), hex('#ff5a70', 0.85));
    }
  };
}

function beamFrame(k) {
  // Horizontal beam that tiles seamlessly every 192px.
  const thick = [6, 34, 74, 70, 26][k];
  const op = [0.85, 1, 1, 1, 0.55][k];
  const phase = [0, 0.7, 0, Math.PI, 2][k];
  return (p) => {
    const T = (x) => thick + (k >= 2 ? 7 : 2) * Math.sin((2 * Math.PI * 2 * x) / 192 + phase) +
      (k >= 2 ? 3 * Math.sin((2 * Math.PI * 5 * x) / 192 + phase * 2) : 0);
    const glowR = k >= 2 ? 26 : 12;
    p.shape(0, 0, 191.99, 191.99, () => true, (x, y) => {
      const half = T(x) / 2;
      const dy = Math.abs(y - C0);
      if (dy > half + glowR) return null;
      if (dy > half) {
        const t = 1 - (dy - half) / glowR;
        return hex('#ff1020', 0.45 * t * t * op);
      }
      const u = dy / half;
      let c;
      if (u < 0.16) c = hex('#ffe6e6');
      else if (u < 0.42) c = mix(hex('#ffb0b0'), hex('#ff3a3a'), (u - 0.16) / 0.26);
      else if (u < 0.8) c = mix(hex('#e01024'), hex('#9a0016'), (u - 0.42) / 0.38);
      else c = mix(hex('#9a0016'), hex('#4a0008'), (u - 0.8) / 0.2);
      if (k >= 1 && u > 0.38) {
        const swirl = Math.sin((2 * Math.PI * 3 * x) / 192 + y * 0.32 + phase * 3);
        if (swirl > 0.82) c = mix(c, hex('#3a0006'), 0.55);
      }
      return withAlpha(c, op);
    });
  };
}

const FIRE = [hex('#fff7c8'), hex('#ffc444'), hex('#ff6a12'), hex('#a8260a')];

function fireColor(t, a) {
  if (t < 0.3) return withAlpha(mix(FIRE[0], FIRE[1], t / 0.3), a);
  if (t < 0.6) return withAlpha(mix(FIRE[1], FIRE[2], (t - 0.3) / 0.3), a);
  return withAlpha(mix(FIRE[2], FIRE[3], Math.min(1, (t - 0.6) / 0.4)), a);
}

function bombFrame(k) {
  return (p, r) => {
    if (k === 0) {
      p.ellipse(C0, 104, 24, 24, sphere(C0, 104, 24, hex('#5c5c66'), hex('#d8d8e4'), hex('#16161c')));
      p.rect(C0 - 6, 74, 12, 8, hex('#36363e'));
      p.taper([[C0, 75], [C0 + 6, 66], [C0 + 16, 62]], 3.4, 2.6, hex('#7a5a32'));
      p.glow(C0 + 17, 61, 16, hex('#ffa020'), 1.4);
      p.poly(star(C0 + 17, 61, 11, 0.25, 4, 0.4), hex('#fff4b0'), 'add');
      return;
    }
    if (k === 1) {
      p.glow(C0, C0, 92, hex('#fff2c0'), 1.6);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r() * 0.2;
        const len = 60 + r() * 34;
        p.poly([[C0 + Math.cos(a - 0.06) * 10, C0 + Math.sin(a - 0.06) * 10],
          [C0 + Math.cos(a) * len, C0 + Math.sin(a) * len],
          [C0 + Math.cos(a + 0.06) * 10, C0 + Math.sin(a + 0.06) * 10]], hex('#fff8d8', 0.8), 'add');
      }
      p.ellipse(C0, C0, 26, 26, hex('#ffffff', 0.95));
      return;
    }
    const R = [0, 0, 56, 62, 66][k];
    const smoke = [0, 0, 0.15, 0.55, 0.85][k];
    const fireA = [0, 0, 1, 0.75, 0.25][k];
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * R * 0.55;
      const x = C0 + Math.cos(a) * d;
      const y = C0 + Math.sin(a) * d - k * 1.5;
      const br = R * (0.28 + r() * 0.3);
      if (r() < smoke) {
        const gcol = mix(hex('#2a2424'), hex('#6c6262'), r());
        p.ellipse(x, y - 4, br * 1.15, br, withAlpha(gcol, 0.5 + r() * 0.25));
      } else {
        p.ellipse(x, y, br, br * 0.92, (px, py) => fireColor(Math.hypot(px - C0, py - C0) / R, fireA));
      }
    }
    if (k === 4) {
      for (let i = 0; i < 10; i++) {
        p.ellipse(C0 + (r() - 0.5) * 140, C0 + (r() - 0.5) * 120, 1.8, 1.8, hex('#ffb040', 0.9));
      }
    }
  };
}

const PILL_COLS = [hex('#ff5a5a'), hex('#ffd84a'), hex('#5ad86a'), hex('#5ab0ff'), hex('#c07aff'), hex('#ffffff')];

function pillFrame(k) {
  return (p, r) => {
    if (k <= 1) {
      capsule(p, C0, C0, 70, 32, -Math.PI / 5, hex('#f0f0f0'), hex('#3a70e0'));
      if (k === 1) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const x = C0 + Math.cos(a) * 58;
          const y = C0 + Math.sin(a) * 50;
          p.glow(x, y, 10, hex('#ffffff', 0.7));
          p.poly(star(x, y, 8, 0.25, 4, a), hex('#ffffff', 0.95), 'add');
        }
      }
      return;
    }
    const rad = [0, 0, 36, 58, 72][k];
    const op = [0, 0, 1, 0.75, 0.4][k];
    const n = [0, 0, 18, 22, 14][k];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.6;
      const d = rad * (0.6 + 0.4 * ((i * 7) % 5) / 4);
      const x = C0 + Math.cos(a) * d;
      const y = C0 + Math.sin(a) * d;
      const col = PILL_COLS[i % PILL_COLS.length];
      const s = (k === 4 ? 3 : 6) + r() * 3;
      p.glow(x, y, s * 2, withAlpha(col, 0.6 * op));
      p.ellipse(x, y, s, s, withAlpha(col, op));
    }
  };
}

function glowFrame(col) {
  return (p) => {
    p.glow(C0, C0, 92, col, 1.2);
    p.glow(C0, C0, 40, hex('#ffffff', 0.8), 1);
  };
}

function sparkleCluster() {
  return (p, r) => {
    for (let i = 0; i < 10; i++) {
      const x = C0 + (r() - 0.5) * 120;
      const y = C0 + (r() - 0.5) * 120;
      const s = 5 + r() * 9;
      p.glow(x, y, s * 1.8, hex('#fff0c0', 0.8));
      p.poly(star(x, y, s, 0.26, 4, r()), hex('#ffffff'), 'add');
    }
  };
}

function buildFX() {
  const cells = [];
  for (let k = 0; k < 5; k++) cells.push(tearFrame(k));        // 0-4
  for (let k = 0; k < 5; k++) cells.push(heartFrame(k));       // 5-9
  for (let k = 0; k < 5; k++) cells.push(beamFrame(k));        // 10-14
  for (let k = 0; k < 5; k++) cells.push(bombFrame(k));        // 15-19
  for (let k = 0; k < 5; k++) cells.push(pillFrame(k));        // 20-24
  for (let n = 1; n <= 6; n++) cells.push((p) => die(p, C0, C0, 38, n, { outline: true }));  // 25-30
  cells.push(glowFrame(hex('#fff2b0', 0.9)));                  // 31
  cells.push(glowFrame(hex('#ff1020', 0.9)));                  // 32
  cells.push(sparkleCluster());                                // 33
  const rows = Math.ceil(cells.length / 5);
  const sheet = new Img(960, rows * 192);
  cells.forEach((fn, i) => {
    sheet.blit(fxCell(fn, i + 1), (i % 5) * 192, Math.floor(i / 5) * 192);
  });
  return sheet;
}

// ---------------------------------------------------------------------------

function previewOn(img, scale, bg) {
  const s = scale > 1 ? img.scaleNearest(scale) : img;
  const out = new Img(s.w, s.h);
  out.rect(0, 0, s.w, s.h, bg);
  out.blit(s, 0, 0);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const previewDir = args.indexOf('--preview') >= 0 ? args[args.indexOf('--preview') + 1] : null;
  const only = args.indexOf('--only') >= 0 ? args[args.indexOf('--only') + 1].split(',') : null;
  const t0 = Date.now();
  const jobs = {
    character: () => ({ 'characters/$Isaac.png': buildCharacter() }),
    battler: () => ({ 'sv_actors/Isaac.png': buildBattler() }),
    faces: () => ({ 'faces/Isaac.png': buildFaces() }),
    busts: () => {
      const out = {};
      buildBusts().forEach((img, i) => { out['pictures/Isaac_' + (i + 1) + '.png'] = img; });
      return out;
    },
    icons: () => ({ 'system/IsaacIcons.png': buildIcons() }),
    fx: () => ({ 'animations/IsaacFX.png': buildFX() }),
  };
  const outputs = {};
  for (const [name, job] of Object.entries(jobs)) {
    if (only && only.indexOf(name) < 0) continue;
    Object.assign(outputs, job());
  }
  for (const [rel, img] of Object.entries(outputs)) {
    img.save(path.join(OUT, rel));
    console.log('wrote img/' + rel + ' (' + img.w + 'x' + img.h + ')');
  }
  if (previewDir) {
    const bg = hex('#d8d4cc');
    const save = (rel, name, scale) => outputs[rel] && previewOn(outputs[rel], scale, bg).save(path.join(previewDir, name));
    save('characters/$Isaac.png', 'char.png', 2);
    save('sv_actors/Isaac.png', 'battler.png', 1);
    save('faces/Isaac.png', 'faces.png', 1);
    save('system/IsaacIcons.png', 'icons.png', 4);
    save('animations/IsaacFX.png', 'fx.png', 1);
    if (outputs['pictures/Isaac_1.png']) {
      const strip = new Img(182 * 8, 360);
      for (let i = 0; i < 8; i++) strip.blit(outputs['pictures/Isaac_' + (i + 1) + '.png'], i * 182, 0);
      previewOn(strip, 1, bg).save(path.join(previewDir, 'busts.png'));
    }
    console.log('previews in ' + previewDir);
  }
  console.log('done in ' + (Date.now() - t0) + 'ms');
}

main();
