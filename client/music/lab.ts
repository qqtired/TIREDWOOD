// Стенд песен автомата (только сервер разработки: /tools/jukebox-lab/): послушать любую песню с любого места,
// офлайн-рендер (OfflineAudioContext) — пик, громкость (RMS), низ и верх, громкость частей — и спектрограмма.
// Для скриптов проверки — window.__lab.
import { JUKE_SONGS, fmtSongTime } from '../../shared/jukebox.ts';
import { MusicPlayer } from './engine.ts';
import { compileSong, DRUM_BASE, INSTS, KITS, type CompiledSong, type SongDef } from './song.ts';
import { SONG_DEFS } from './songs.ts';

const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -120);
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Только нужные голоса (имена инструментов и наборов ударных) */
function soloSong(song: CompiledSong, names: string[]): CompiledSong {
  const keep: number[] = [];
  for (let i = 0; i < song.n; i++) {
    const v = song.voice[i];
    const name = v >= DRUM_BASE ? KITS[(v - DRUM_BASE) >> 4] : INSTS[v];
    if (names.includes(name)) keep.push(i);
  }
  const n = keep.length;
  const out: CompiledSong = { ...song, n, t: new Float64Array(n), dur: new Float32Array(n), voice: new Uint8Array(n), midi: new Uint8Array(n), vel: new Float32Array(n) };
  keep.forEach((i, j) => {
    out.t[j] = song.t[i];
    out.dur[j] = song.dur[i];
    out.voice[j] = song.voice[i];
    out.midi[j] = song.midi[i];
    out.vel[j] = song.vel[i];
  });
  return out;
}

export async function renderSong(def: SongDef, opts: { solo?: string[]; limiter?: boolean; sr?: number; from?: number; to?: number } = {}): Promise<{ buf: AudioBuffer; song: CompiledSong; ms: number }> {
  let song = compileSong(def);
  if (opts.solo) song = soloSong(song, opts.solo);
  const sr = opts.sr ?? 48000;
  const from = opts.from ?? 0;
  const to = Math.min(song.total, opts.to ?? song.total);
  const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * sr), sr);
  const p = new MusicPlayer(ctx, ctx.destination, { live: false, limiter: opts.limiter ?? false });
  const t0 = performance.now();
  p.start(song, from, 0);
  const step = 0.5;
  for (let t = step; t < to - from; t += step) {
    void ctx.suspend(t).then(() => {
      p.pump();
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return { buf, song, ms: performance.now() - t0 };
}

/** Взвешивание K (BS.1770, коэффициенты для 48 кГц): полка на верхах и срез низов — громкость «на слух» */
function kWeight(x: Float32Array): Float32Array {
  const y = new Float32Array(x.length);
  const st = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
  let src = x;
  for (const [b0, b1, b2, a1, a2] of st) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = v;
      y2 = y1;
      y1 = o;
      y[i] = o;
    }
    src = y;
  }
  return y;
}

/** Громкость по BS.1770 со стробированием (LUFS): тишину и паузы не считаем */
export function lufs(buf: AudioBuffer, upTo = Infinity): number {
  const sr = buf.sampleRate;
  const n = Math.min(buf.length, Math.floor(upTo * sr));
  const zl = kWeight(buf.getChannelData(0).subarray(0, n));
  const zr = kWeight(buf.getChannelData(1).subarray(0, n));
  const block = Math.floor(0.4 * sr);
  const hop = Math.floor(0.1 * sr);
  const ms: number[] = [];
  for (let a = 0; a + block <= n; a += hop) {
    let s = 0;
    for (let i = a; i < a + block; i++) s += zl[i] * zl[i] + zr[i] * zr[i];
    ms.push(s / block);
  }
  const L = (m: number): number => -0.691 + 10 * Math.log10(m);
  const abs = ms.filter((m) => m > 0 && L(m) > -70);
  if (!abs.length) return -120;
  const ung = L(abs.reduce((a, b) => a + b, 0) / abs.length);
  const rel = abs.filter((m) => L(m) > ung - 10);
  return L(rel.reduce((a, b) => a + b, 0) / rel.length);
}

export interface SongStats {
  id: string;
  seconds: number;
  renderMs: number;
  peakDb: number;
  rmsDb: number;
  /** Громкость «на слух» (LUFS, стробированная) */
  lufs: number;
  /** Самые громкие 3 секунды */
  loudDb: number;
  /** Низ (<150 Гц) и верх (>4 кГц) относительно всего */
  lowDb: number;
  highDb: number;
  clips: number;
  sections: string;
  notes: number;
  maxPoly: number;
}

export function analyze(buf: AudioBuffer, song: CompiledSong, ms: number): SongStats {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const n = Math.min(L.length, Math.floor(song.length * sr));
  let peak = 0;
  let sum = 0;
  let clips = 0;
  let lowS = 0;
  let highS = 0;
  const aL = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  const aH = 1 - Math.exp((-2 * Math.PI * 4000) / sr);
  let lp = 0;
  let lp4 = 0;
  const win = Math.floor(sr * 3);
  const hop = sr;
  const winSums: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const m = (L[i] + R[i]) * 0.5;
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) clips++;
    const e = (L[i] * L[i] + R[i] * R[i]) * 0.5;
    sum += e;
    acc += e;
    lp += aL * (m - lp);
    lp4 += aH * (m - lp4);
    lowS += lp * lp;
    const h = m - lp4;
    highS += h * h;
    if ((i + 1) % hop === 0) {
      winSums.push(acc);
      acc = 0;
    }
  }
  let loud = 0;
  const per = win / hop;
  for (let i = 0; i + per <= winSums.length; i++) {
    let s = 0;
    for (let j = 0; j < per; j++) s += winSums[i + j];
    loud = Math.max(loud, s / win);
  }
  const rms = Math.sqrt(sum / n);
  const sec = song.sections.map((s) => {
    const a = Math.floor(s.bar * song.meta.meter * song.beat * sr);
    const b = Math.min(n, Math.floor((s.bar + s.bars) * song.meta.meter * song.beat * sr));
    let e = 0;
    for (let i = a; i < b; i++) e += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    return `${s.name} ${r1(db(Math.sqrt(e / Math.max(1, b - a))))}`;
  });
  // сколько нот звучит сразу (с хвостом отпускания) — нагрузка
  const ends: number[] = [];
  let maxPoly = 0;
  for (let i = 0; i < song.n; i++) {
    const t = song.t[i];
    for (let j = ends.length - 1; j >= 0; j--) if (ends[j] <= t) ends.splice(j, 1);
    ends.push(t + song.dur[i] + 0.3);
    if (ends.length > maxPoly) maxPoly = ends.length;
  }
  return {
    id: song.def.id, seconds: r1(song.total), renderMs: Math.round(ms), peakDb: r1(db(peak)), rmsDb: r1(db(rms)), lufs: r1(lufs(buf, song.length)), loudDb: r1(db(Math.sqrt(loud))),
    lowDb: r1(db(Math.sqrt(lowS / n)) - db(rms)), highDb: r1(db(Math.sqrt(highS / n)) - db(rms)), clips, sections: sec.join(' · '), notes: song.n, maxPoly,
  };
}

/** Быстрое преобразование Фурье (на месте), размер — степень двойки */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Волна сверху, спектрограмма снизу (частоты по логарифму 50 Гц…16 кГц), границы частей */
export function drawSpectrogram(buf: AudioBuffer, song: CompiledSong, canvas: HTMLCanvasElement): void {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#16120e';
  g.fillRect(0, 0, W, H);
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const n = L.length;
  const top = 90;
  // волна: пик и RMS по столбцам
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x * n) / W);
    const b = Math.floor(((x + 1) * n) / W);
    let pk = 0;
    let e = 0;
    for (let i = a; i < b; i++) {
      const v = (L[i] + R[i]) * 0.5;
      pk = Math.max(pk, Math.abs(v));
      e += v * v;
    }
    const rms = Math.sqrt(e / Math.max(1, b - a));
    g.fillStyle = pk >= 0.99 ? '#ff4040' : '#7a6650';
    g.fillRect(x, top / 2 - pk * (top / 2), 1, pk * top);
    g.fillStyle = '#e8c48c';
    g.fillRect(x, top / 2 - rms * (top / 2), 1, rms * top);
  }
  const N = 2048;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const rows = H - top;
  const img = g.createImageData(W, rows);
  const fLo = Math.log(50);
  const fHi = Math.log(16000);
  for (let x = 0; x < W; x++) {
    const c = Math.floor((x * n) / W);
    for (let i = 0; i < N; i++) {
      const k = c - N / 2 + i;
      const v = k >= 0 && k < n ? (L[k] + R[k]) * 0.5 : 0;
      re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < rows; y++) {
      const f = Math.exp(fHi - ((fHi - fLo) * y) / (rows - 1));
      const bin = Math.min(N / 2 - 1, Math.round((f * N) / sr));
      const mag = Math.hypot(re[bin], im[bin]) / (N / 4);
      const d = Math.max(0, Math.min(1, (db(mag) + 100) / 85));
      const o = (y * W + x) * 4;
      img.data[o] = Math.min(255, d * 2 * 255);
      img.data[o + 1] = Math.min(255, Math.max(0, d * 2 - 0.6) * 255);
      img.data[o + 2] = Math.min(255, Math.max(0, d * 1.5 - 1) * 510 + d * 60);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, top);
  g.font = '12px system-ui';
  for (const s of song.sections) {
    const x = Math.round(((s.bar * song.meta.meter * song.beat) / (n / sr)) * W);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(x, 0, 1, H);
    g.fillText(s.name, x + 3, 12);
  }
  g.fillStyle = '#fff';
  g.fillText(`${song.meta.title} · ${song.meta.mood}`, 6, H - 6);
}

// ------------------------------------------------------------ страница

let live: { ctx: AudioContext; p: MusicPlayer } | null = null;

function play(id: string, from = 0): void {
  const def = SONG_DEFS[id];
  if (!def) return;
  if (!live) {
    const ctx = new AudioContext();
    live = { ctx, p: new MusicPlayer(ctx, ctx.destination, { live: true }) };
  }
  void live.ctx.resume();
  live.p.start(compileSong(def), from);
}

function stop(): void {
  live?.p.stop();
}

async function check(id: string, opts: { solo?: string[]; limiter?: boolean; png?: boolean } = {}): Promise<SongStats & { png?: string }> {
  const { buf, song, ms } = await renderSong(SONG_DEFS[id], opts);
  const st = analyze(buf, song, ms);
  const canvas = document.querySelector<HTMLCanvasElement>('#spec');
  if (opts.png !== false && canvas) {
    drawSpectrogram(buf, song, canvas);
    return { ...st, png: canvas.toDataURL('image/png') };
  }
  return st;
}

declare global {
  interface Window { __lab: unknown }
}
window.__lab = { check, play, stop, ids: () => Object.keys(SONG_DEFS), compile: (id: string) => compileSong(SONG_DEFS[id]) };

const list = document.querySelector('#list');
if (list) {
  JUKE_SONGS.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'song';
    const has = !!SONG_DEFS[s.id];
    row.innerHTML = `<span>${s.emoji}</span><span><b>${i + 1}. ${s.title}</b> <small>· ${s.mood} · ${s.bpm} уд/мин</small></span>`;
    const mk = (text: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.textContent = text;
      b.disabled = !has;
      b.onclick = fn;
      row.append(b);
    };
    mk('▶ Играть', () => play(s.id));
    mk('с середины', () => play(s.id, 40));
    mk('■', stop);
    list.append(row);
  });
  const now = document.querySelector('#now')!;
  setInterval(() => {
    const p = live?.p;
    const s = p?.current;
    now.textContent = s ? `${s.meta.title}: ${fmtSongTime(p!.time)} / ${fmtSongTime(s.total)}` : '—';
  }, 250);
  document.querySelector('#check')?.addEventListener('click', async () => {
    const out = document.querySelector('#stats')!;
    out.textContent = 'считаю…';
    const rows: string[] = [];
    for (const id of Object.keys(SONG_DEFS)) {
      const st = await check(id);
      rows.push(`${st.id.padEnd(8)} пик ${st.peakDb} дБ · ${st.lufs} LUFS · RMS ${st.rmsDb} · громче всего ${st.loudDb} · низ ${st.lowDb} · верх ${st.highDb} · клиппинг ${st.clips} · ${st.notes} нот, до ${st.maxPoly} сразу\n    ${st.sections}`);
      out.textContent = rows.join('\n');
    }
  });
}
