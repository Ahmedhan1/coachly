#!/usr/bin/env node
// Synthesizes the demo video's music: an upbeat 116 BPM track (kick, clap, hats, pumping bass, pad, plucked arpeggio)
// over Am – F – C – G. Generated from code, so there is nothing to license. Writes a 44.1 kHz 16-bit stereo WAV.
// Usage: node tools/demo-video/music.mjs <out.wav> <seconds>
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'music.wav';
const seconds = Number(process.argv[3] ?? 60);
const SR = 44_100;
const BPM = 116;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const N = Math.ceil(seconds * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Am, F, C, G: root (bass octave) and chord tones.
const CHORDS = [
  { root: 45, tones: [57, 60, 64] },
  { root: 41, tones: [53, 57, 60] },
  { root: 48, tones: [55, 60, 64] },
  { root: 43, tones: [55, 59, 62] },
];

let seed = 7;
const noise = () => {
  seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
  return seed / 0x3fffffff - 1;
};

function add(start, dur, gain, pan, sample) {
  const s0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(dur * SR), N - s0);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < n; i++) {
    const v = sample(i / SR);
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

const kick = (t) => Math.sin(2 * Math.PI * (45 * t + (75 / 18) * (1 - Math.exp(-18 * t)))) * Math.exp(-7 * t);
function hat() {
  let prev = 0;
  return (t) => {
    const n = noise();
    const hp = n - prev;
    prev = n;
    return hp * Math.exp(-45 * t);
  };
}
function clap() {
  let lp = 0;
  return (t) => {
    lp += 0.35 * (noise() - lp);
    const bursts = t < 0.03 ? 0.6 + 0.4 * Math.sin(t * 900) : 1;
    return lp * bursts * Math.exp(-16 * t);
  };
}
const saw = (f, t, harmonics) => {
  let v = 0;
  for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
  return v;
};
const pad = (f) => (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t) + 0.15 * Math.sin(2 * Math.PI * f * 0.997 * t)) * Math.min(1, t / 0.25);
const pluck = (f) => (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-9 * t);

const bars = Math.ceil(seconds / BAR);
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
for (let bar = 0; bar < bars; bar++) {
  const chord = CHORDS[bar % 4];
  const t0 = bar * BAR;
  const intro = bar < 2;
  const outro = bar >= bars - 1;
  for (const tone of chord.tones) add(t0, BAR + 0.05, 0.05, 0, pad(midi(tone)));
  for (let beat = 0; beat < 4; beat++) {
    const tb = t0 + beat * BEAT;
    if (!intro && !outro) add(tb, 0.45, 0.85, 0, kick);
    if (!intro && (beat === 1 || beat === 3)) add(tb, 0.3, 0.32, 0.1, clap());
    add(tb + BEAT / 2, 0.12, intro ? 0.05 : 0.11, -0.25, hat());
    if (!intro) add(tb + BEAT / 2, BEAT / 2, 0.16, 0, (t) => saw(midi(chord.root), t, 6) * Math.exp(-5 * t) * Math.min(1, t / 0.01));
  }
  for (let s = 0; s < 8; s++) {
    const tone = chord.tones[ARP[s]] + 12;
    add(t0 + s * (BEAT / 2), 0.4, intro ? 0.06 : 0.09, s % 2 ? 0.35 : -0.35, pluck(midi(tone)));
  }
}

// Sidechain-style pump on everything but the kick feel: duck the mix right after each beat.
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const sinceBeat = t % BEAT;
  const duck = t < 2 * BAR ? 1 : 1 - 0.35 * Math.exp(-sinceBeat * 10);
  L[i] *= duck;
  R[i] *= duck;
}

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.89 / (peak || 1);
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.tanh(L[i] * gain) * 32_767), i * 4);
  data.writeInt16LE(Math.round(Math.tanh(R[i] * gain) * 32_767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(out, Buffer.concat([header, data]));
console.log(`wrote ${out}: ${seconds.toFixed(1)} s at ${BPM} BPM`);
