'use strict';
// Synthesizes the mod's sound effects and encodes them with ffmpeg.
// Writes audio/se/Isaac_*.ogg (+ .m4a for platforms without Ogg).
// Usage: node tools/build-audio.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { rng } = require('./raster');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'mod', 'www', 'audio', 'se');

function buffer(sec) {
  return new Float32Array(Math.ceil(sec * SR));
}

function lowpass(fc) {
  let y = 0;
  return (x, f = fc) => {
    const a = 1 - Math.exp((-2 * Math.PI * f) / SR);
    y += a * (x - y);
    return y;
  };
}

function highpass(fc) {
  const lp = lowpass(fc);
  return (x) => x - lp(x);
}

// RBJ band-pass (constant 0 dB peak gain).
function bandpass(f0, q) {
  const w0 = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function normalize(buf, peak = 0.9) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / m) * peak;
  // 4ms fade in/out to avoid clicks
  const f = Math.floor(SR * 0.004);
  for (let i = 0; i < f && i < buf.length; i++) {
    buf[i] *= i / f;
    buf[buf.length - 1 - i] *= i / f;
  }
  return buf;
}

const SOUNDS = {
  // Short wet "pew" when a tear is fired.
  Isaac_Tear() {
    const b = buffer(0.2);
    const noise = rng(11);
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const f = 480 + 1100 * Math.exp(-t * 45);
      ph += (2 * Math.PI * f) / SR;
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 22);
      b[i] = (Math.sin(ph) + 0.25 * Math.sin(ph * 2)) * env + (noise() - 0.5) * 0.15 * Math.exp(-t * 90);
    }
    return normalize(b, 0.8);
  },

  // Splash on impact.
  Isaac_Splash() {
    const b = buffer(0.4);
    const noise = rng(23);
    const lp = lowpass(5000);
    const blips = [0.02, 0.07, 0.11, 0.16].map((t0, k) => ({ t0, f: 1300 + k * 260 }));
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let v = lp((noise() - 0.5) * 2, 600 + 5200 * Math.exp(-t * 14)) * Math.exp(-t * 9);
      for (const bl of blips) {
        const tt = t - bl.t0;
        if (tt > 0 && tt < 0.05) v += Math.sin(2 * Math.PI * (bl.f - tt * 9000) * tt) * Math.exp(-tt * 70) * 0.35;
      }
      b[i] = v;
    }
    return normalize(b, 0.75);
  },

  // Brimstone wind-up: rising demonic rumble.
  Isaac_BrimCharge() {
    const b = buffer(0.9);
    const noise = rng(31);
    const lp = lowpass(300);
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const f = 45 + 160 * Math.pow(t / 0.9, 1.6);
      ph += (2 * Math.PI * f) / SR;
      const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
      const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * (8 + t * 24) * t);
      const env = Math.pow(t / 0.9, 1.4);
      b[i] = Math.tanh((saw * 0.8 + lp((noise() - 0.5) * 3)) * 2.2) * env * trem;
    }
    return normalize(b, 0.8);
  },

  // The beam itself.
  Isaac_Brimstone() {
    const b = buffer(1.7);
    const noise = rng(37);
    const lp = lowpass(900);
    const hp = highpass(3000);
    let p1 = 0, p2 = 0, p3 = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const wob = 1 + 0.04 * Math.sin(2 * Math.PI * 7 * t);
      p1 += (2 * Math.PI * 55 * wob) / SR;
      p2 += (2 * Math.PI * 82.7 * wob) / SR;
      p3 += (2 * Math.PI * 111.3) / SR;
      const saw = (p) => 2 * ((p / (2 * Math.PI)) % 1) - 1;
      const body = saw(p1) + 0.7 * saw(p2) + 0.5 * saw(p3);
      const n = (noise() - 0.5) * 2;
      const fc = 400 + 1400 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5.5 * t));
      const v = lp(body * 0.6 + n * 0.5, fc) + hp(n) * 0.18;
      const env = Math.min(1, t / 0.015) * (t < 1.0 ? 1 : Math.exp(-(t - 1.0) * 5));
      b[i] = Math.tanh(v * 2.6) * env;
    }
    return normalize(b, 0.85);
  },

  // Heartbeat thump + chime.
  Isaac_Heart() {
    const b = buffer(1.0);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let v = 0;
      for (const t0 of [0, 0.17]) {
        const tt = t - t0;
        if (tt > 0) v += Math.sin(2 * Math.PI * (70 - tt * 60) * tt) * Math.exp(-tt * 28) * 0.9;
      }
      const tc = t - 0.08;
      if (tc > 0) {
        const e = Math.exp(-tc * 3.2);
        v += (Math.sin(2 * Math.PI * 784 * tc) * 0.35 + Math.sin(2 * Math.PI * 1176 * tc) * 0.22 +
          Math.sin(2 * Math.PI * 1568 * tc) * 0.12) * e;
      }
      b[i] = v;
    }
    return normalize(b, 0.75);
  },

  Isaac_Fuse() {
    const b = buffer(0.55);
    const noise = rng(41);
    const hp = highpass(2500);
    const crack = rng(43);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let v = hp((noise() - 0.5) * 2) * 0.5;
      if (crack() < 0.0016) v += (crack() - 0.5) * 4;
      b[i] = v * Math.min(1, t / 0.02) * (t > 0.45 ? Math.max(0, 1 - (t - 0.45) / 0.1) : 1);
    }
    return normalize(b, 0.5);
  },

  Isaac_Explosion() {
    const b = buffer(1.5);
    const noise = rng(47);
    const lp = lowpass(8000);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const n = lp((noise() - 0.5) * 2, 250 + 7000 * Math.exp(-t * 6));
      const thump = Math.sin(2 * Math.PI * (48 - t * 20) * t) * Math.exp(-t * 6);
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 2.6);
      b[i] = Math.tanh((n * 1.6 + thump * 1.2) * env * 2.5);
    }
    return normalize(b, 0.9);
  },

  // Gulp.
  Isaac_Pill() {
    const b = buffer(0.4);
    const noise = rng(53);
    const bp = bandpass(700, 4);
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let v = 0;
      if (t < 0.03) v += bp((noise() - 0.5) * 2) * Math.exp(-t * 120) * 2.5;
      const tg = t - 0.06;
      if (tg > 0) {
        ph += (2 * Math.PI * (300 - Math.min(tg, 0.15) * 1100)) / SR;
        v += Math.sin(ph) * Math.exp(-tg * 14) * Math.min(1, tg / 0.01);
      }
      b[i] = v;
    }
    return normalize(b, 0.7);
  },

  // A die tumbling on stone.
  Isaac_Dice() {
    const b = buffer(0.75);
    const noise = rng(59);
    const bp = bandpass(3200, 2.5);
    const hits = [0, 0.13, 0.24, 0.33, 0.4, 0.45, 0.49];
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let v = 0;
      hits.forEach((t0, k) => {
        const tt = t - t0;
        if (tt > 0 && tt < 0.04) {
          const a = Math.pow(0.78, k);
          v += ((noise() - 0.5) * 2 * Math.exp(-tt * 260) * 1.4 + Math.sin(2 * Math.PI * 1100 * tt) * Math.exp(-tt * 180)) * a;
        }
      });
      b[i] = bp(v) * 2 + v * 0.3;
    }
    return normalize(b, 0.7);
  },

  // A child's sob: glottal pulse train through vowel formants.
  Isaac_Cry() {
    return voice(1.7, [
      { t0: 0.0, t1: 0.34, f0: 520, f1: 470 },
      { t0: 0.42, t1: 0.6, f0: 540, f1: 500 },
      { t0: 0.7, t1: 1.6, f0: 560, f1: 380 },
    ], 61);
  },

  Isaac_Hurt() {
    return voice(0.45, [{ t0: 0.0, t1: 0.38, f0: 640, f1: 400 }], 67);
  },
};

function voice(sec, sobs, seed) {
  const b = buffer(sec);
  const noise = rng(seed);
  const formants = [[880, 6, 1.0], [1350, 8, 0.6], [2900, 10, 0.25]].map(([f, q, g]) => ({ bp: bandpass(f, q), g }));
  const breath = bandpass(2200, 1.2);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const s = sobs.find((x) => t >= x.t0 && t < x.t1 + 0.05);
    let src = 0;
    let env = 0;
    if (s) {
      const u = Math.min(1, (t - s.t0) / (s.t1 - s.t0));
      const vib = 1 + 0.035 * Math.sin(2 * Math.PI * 6.5 * t) + 0.02 * Math.sin(2 * Math.PI * 13 * t);
      const f = (s.f0 + (s.f1 - s.f0) * u) * vib;
      ph += f / SR;
      const frac = ph % 1;
      src = 1 - 2 * frac;  // sawtooth ~ glottal pulse
      env = Math.min(1, (t - s.t0) / 0.03) * (t > s.t1 ? Math.max(0, 1 - (t - s.t1) / 0.05) : 1);
      env *= 0.8 + 0.2 * Math.sin(Math.PI * u);
    }
    let v = 0;
    for (const fm of formants) v += fm.bp(src) * fm.g;
    v += breath((noise() - 0.5) * 2) * 0.12 * env;
    b[i] = v * env;
  }
  return normalize(b, 0.7);
}

function wav(buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'isaacse-'));
  try {
    for (const [name, fn] of Object.entries(SOUNDS)) {
      const w = path.join(tmp, name + '.wav');
      fs.writeFileSync(w, wav(fn()));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'libvorbis', '-q:a', '5', path.join(OUT, name + '.ogg')]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'aac', '-b:a', '96k', path.join(OUT, name + '.m4a')]);
      console.log('wrote audio/se/' + name + '.{ogg,m4a}');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
