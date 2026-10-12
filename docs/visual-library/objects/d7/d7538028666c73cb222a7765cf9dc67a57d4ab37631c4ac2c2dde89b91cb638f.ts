// Стенд станций радио на лодке (только сервер разработки: /tools/radio-lab/): послушать станцию с любого места потока,
// офлайн-рендер (OfflineAudioContext) — громкость (LUFS), пик, низ/верх, спектрограмма — и WAV для прослушки.
// Для скриптов проверки — window.__radio.
import { RADIO_STATIONS } from '../../shared/boatradio.ts';
import { MusicPlayer } from '../music/engine.ts';
import { drawSpectrogram, lufs } from '../music/lab.ts';
import { DRUM_BASE, INSTS, KITS, type CompiledSong } from '../music/song.ts';
import { stationFeed, type StationFeed } from './radiostream.ts';
import { STATION_DEFS } from './stations/index.ts';

const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -120);
const r1 = (x: number): number => Math.round(x * 10) / 10;

function feedOf(i: number): StationFeed {
  const st = RADIO_STATIONS[i];
  return stationFeed(STATION_DEFS[st.id], st);
}

/** Только нужные голоса (имена инструментов и наборов ударных) — громкость партий по отдельности */
function soloFeed(feed: StationFeed, names: string[]): StationFeed {
  const pick = (song: CompiledSong): CompiledSong => {
    const keep: number[] = [];
    for (let i = 0; i < song.n; i++) {
      const v = song.voice[i];
      if (names.includes(v >= DRUM_BASE ? KITS[(v - DRUM_BASE) >> 4] : INSTS[v])) keep.push(i);
    }
    const n = keep.length;
    const out: CompiledSong = { ...song, n, t: new Float64Array(n), dur: new Float32Array(n), voice: new Uint8Array(n), midi: new Uint8Array(n), vel: new Float32Array(n), from: new Uint8Array(n) };
    keep.forEach((i, j) => {
      out.t[j] = song.t[i]; out.dur[j] = song.dur[i]; out.voice[j] = song.voice[i]; out.midi[j] = song.midi[i]; out.vel[j] = song.vel[i]; out.from[j] = song.from[i];
    });
    return out;
  };
  return { ...feed, block: (k) => pick(feed.block(k)) };
}

/** Офлайн-рендер станции i с отрезка k0 (и сдвига внутри него) на seconds секунд; fade — плавно появиться и затихнуть */
export async function renderStation(i: number, k0: number, seconds: number, o: { solo?: string[]; sr?: number; fade?: boolean; at?: number } = {}): Promise<{ buf: AudioBuffer; feed: StationFeed; ms: number }> {
  let feed = feedOf(i);
  if (o.solo) feed = soloFeed(feed, o.solo);
  const sr = o.sr ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  if (o.fade) {
    out.gain.setValueAtTime(0, 0);
    out.gain.linearRampToValueAtTime(1, 1.5);
    out.gain.setValueAtTime(1, seconds - 2);
    out.gain.linearRampToValueAtTime(0, seconds);
  }
  // как в игре: с мягким ограничителем на выходе
  const p = new MusicPlayer(ctx, out, { live: false, limiter: true });
  const t0 = performance.now();
  p.startFeed(feed, k0 * feed.length + (o.at ?? 0), 0);
  const step = 0.5;
  for (let t = step; t < seconds; t += step) {
    void ctx.suspend(t).then(() => {
      p.pump();
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return { buf, feed, ms: performance.now() - t0 };
}

/** WAV 16 бит, стерео — base64 (скрипт проверки пишет файл) */
export function wavBase64(buf: AudioBuffer): string {
  const n = buf.length;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    data.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    data.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
  }
  const bytes = new Uint8Array(data.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface RadioStats {
  station: string;
  seconds: number;
  renderMs: number;
  peakDb: number;
  lufs: number;
  lowDb: number;
  highDb: number;
  clips: number;
  /** Громкость по отрезкам: роль и RMS, дБ */
  blocks: string;
  notes: number;
}

export function stats(buf: AudioBuffer, feed: StationFeed, k0: number, ms: number): RadioStats {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const n = L.length;
  let peak = 0;
  let sum = 0;
  let clips = 0;
  let lowS = 0;
  let highS = 0;
  let lp = 0;
  let lp4 = 0;
  const aL = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  const aH = 1 - Math.exp((-2 * Math.PI * 4000) / sr);
  for (let i = 0; i < n; i++) {
    const m = (L[i] + R[i]) * 0.5;
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) clips++;
    sum += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    lp += aL * (m - lp);
    lp4 += aH * (m - lp4);
    lowS += lp * lp;
    const h = m - lp4;
    highS += h * h;
  }
  const rms = Math.sqrt(sum / n);
  const blocks: string[] = [];
  let notes = 0;
  for (let k = k0; k * feed.length < k0 * feed.length + n / sr; k++) {
    const a = Math.floor((k - k0) * feed.length * sr);
    const b = Math.min(n, Math.floor((k - k0 + 1) * feed.length * sr));
    let e = 0;
    for (let i = a; i < b; i++) e += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    const w = feed.role(k);
    blocks.push(`${w.role}${w.key ? `(${w.key > 0 ? '+' : ''}${w.key})` : ''} ${r1(db(Math.sqrt(e / Math.max(1, b - a))))}`);
    notes += feed.block(k).n;
  }
  return {
    station: feed.def.id, seconds: r1(n / sr), renderMs: Math.round(ms), peakDb: r1(db(peak)), lufs: r1(lufs(buf)), lowDb: r1(db(Math.sqrt(lowS / n)) - db(rms)),
    highDb: r1(db(Math.sqrt(highS / n)) - db(rms)), clips, blocks: blocks.join(' · '), notes,
  };
}

/** Спектрограмма с границами отрезков (картинка для проверки на глаз) */
function spectrogram(buf: AudioBuffer, feed: StationFeed, k0: number, canvas: HTMLCanvasElement): string {
  const st = RADIO_STATIONS.find((s) => s.id === feed.def.id)!;
  const beat = 60 / st.bpm;
  const sections: CompiledSong['sections'] = [];
  for (let k = k0; (k - k0) * feed.length < buf.duration; k++) sections.push({ name: feed.role(k).role, bar: (k - k0) * 8, bars: 8 });
  const fake = { sections, beat, meta: { meter: st.meter, title: st.title, mood: st.mood } } as unknown as CompiledSong;
  drawSpectrogram(buf, fake, canvas);
  return canvas.toDataURL('image/png');
}

async function check(i: number, k0: number, seconds: number, o: { solo?: string[]; wav?: boolean; png?: boolean; fade?: boolean; at?: number } = {}): Promise<RadioStats & { wav?: string; png?: string }> {
  const { buf, feed, ms } = await renderStation(i, k0, seconds, o);
  const st = stats(buf, feed, k0, ms);
  const canvas = document.querySelector<HTMLCanvasElement>('#spec');
  return {
    ...st,
    ...(o.wav ? { wav: wavBase64(buf) } : {}),
    ...(o.png && canvas ? { png: spectrogram(buf, feed, k0, canvas) } : {}),
  };
}

/** Роли отрезков с k0 (какой отрезок где в круге) */
function roles(i: number, k0: number, count: number): string[] {
  const f = feedOf(i);
  return Array.from({ length: count }, (_, j) => { const w = f.role(k0 + j); return `${k0 + j}:${w.role}${w.key ? `(${w.key})` : ''}`; });
}

// ------------------------------------------------------------ живое прослушивание

let live: { ctx: AudioContext; p: MusicPlayer } | null = null;
function play(i: number, k0 = 0): void {
  if (!live) {
    const ctx = new AudioContext();
    live = { ctx, p: new MusicPlayer(ctx, ctx.destination, { live: true }) };
  }
  void live.ctx.resume();
  const f = feedOf(i);
  live.p.startFeed(f, k0 * f.length);
}

declare global {
  interface Window { __radio: unknown }
}
window.__radio = { check, roles, play, stop: () => live?.p.stop(), stations: RADIO_STATIONS.map((s) => s.id) };

const list = document.querySelector('#stations');
if (list) {
  RADIO_STATIONS.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'song';
    row.innerHTML = `<span>${s.emoji}</span><span><b>${s.title}</b> <small>· ${s.mood} · ${s.bpm} уд/мин</small></span>`;
    const mk = (text: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = fn;
      row.append(b);
    };
    mk('▶ С начала круга', () => play(i, 0));
    mk('с середины', () => play(i, 6));
    mk('■', () => live?.p.stop());
    list.append(row);
  });
}
