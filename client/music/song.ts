// Маленький нотный формат песен автомата и его сборка в плоский список нот (типизированные массивы — без выделений
// во время игры). Песня — части (вступление, куплет, припев…) и порядок их исполнения; в части — аккорды по тактам
// и партии: мелодия нотами, бас ступенями аккорда, аккомпанемент ритмом, арпеджио, пэд, ударные сеткой.
// Ошибка в нотах (такт не сходится) — исключение с указанием места: песни проверяет тест.
import { JUKE_SONGS, type JukeSong } from '../../shared/jukebox.ts';
import { degree, noteMidi, parseChord, voicing, type Chord } from './theory.ts';

/** boom — «808»: глубокий саб с глайдами (нота с «>» скользит из прошлой) */
export const INSTS = ['epiano', 'bass', 'sub', 'tuba', 'nylon', 'guitar', 'mando', 'pad', 'strings', 'accordion', 'whistle', 'square', 'pulse', 'tri', 'bell', 'marimba', 'lead', 'boom'] as const;
export type Inst = typeof INSTS[number];
export const KITS = ['pop', 'lofi', 'brush', 'chip', 'synth', 'surf', 'trap'] as const;
export type Kit = typeof KITS[number];
/** Ударные: бочка, малый, хлопок, закрытый и открытый хэт, шейкер, римшот, том низкий и средний, тарелка, щётка, треск пластинки */
export const DRUMS = ['k', 's', 'c', 'h', 'o', 'p', 'r', 't', 'm', 'y', 'w', 'v'] as const;
export type DrumKey = typeof DRUMS[number];
/** Номер голоса ударных: 32 + набор × 16 + звук */
export const DRUM_BASE = 32;
export const drumVoice = (kit: number, d: number): number => DRUM_BASE + kit * 16 + d;

interface PartBase {
  /** Громкость нот партии 0…1 (акценты и тихие — от неё) */
  vel?: number;
  /** Доля длины ноты (стаккато < 1) */
  len?: number;
}
export type Part =
  | (PartBase & { i: Inst; mel: string; oct?: number })
  | (PartBase & { i: Inst; bass: string; lo?: number })
  | (PartBase & { i: Inst; comp: string; n?: number; lo?: number; hi?: number; strum?: number })
  | (PartBase & { i: Inst; arp: string; n?: number; lo?: number; hi?: number })
  | (PartBase & { i: Inst; pad: true; n?: number; lo?: number; hi?: number })
  | (PartBase & {
    kit: Kit;
    /** Сетки по тактам (шаги: «x» удар, «X» акцент, «o» тихо, «.» пусто; «|» — следующий такт, по кругу) */
    drums: Partial<Record<DrumKey, string>>;
    /** Первый такт части и последний (сбивка): названные звуки заменяют обычную сетку на этот такт */
    first?: Partial<Record<DrumKey, string>>;
    fill?: Partial<Record<DrumKey, string>>;
  });

export interface Section {
  /** Аккорды: такты через «|», внутри такта поровну или «C:3 G:1» (доли); «%» — как в прошлом такте */
  chords: string;
  parts: Part[];
}

export interface SongDef {
  id: string;
  /** Тональность для проверки нот: «C», «Am» */
  key: string;
  /** Свинг: насколько опаздывает слабая доля (доля от единицы свинга) и единица в долях: 0,5 — восьмые, 0,25 — шестнадцатые */
  swing?: number;
  swingUnit?: number;
  /** Общая громкость песни (подогнана по офлайн-замеру: все песни примерно одинаково громкие) */
  gain: number;
  /** Реверберация: доля «зала» и длина хвоста, с */
  reverb: { wet: number; decay: number };
  /** Эхо: задержка в долях, повторы, доля; on — каким инструментам (без — солирующим) */
  echo?: { beats: number; feedback: number; wet: number; on?: Inst[] };
  /** Хорус (две плывущие задержки, разведённые по сторонам): мс задержки, глубина мс, частота Гц, доля; on — кому */
  chorus?: { ms: number; depth: number; rate: number; wet: number; on: Inst[] };
  /** Громкость инструментов и ударных */
  mix: Partial<Record<Inst | Kit, number>>;
  sections: Record<string, Section>;
  form: string[];
}

export interface CompiledSong {
  def: SongDef;
  meta: JukeSong;
  /** Секунд в доле, длина без хвоста и с хвостом */
  beat: number;
  length: number;
  total: number;
  n: number;
  t: Float64Array;
  dur: Float32Array;
  voice: Uint8Array;
  midi: Uint8Array;
  vel: Float32Array;
  /** Глайд: из какой ноты скользит (MIDI), 0 — без глайда */
  from: Uint8Array;
  /** Самая длинная нота, с (вошёл посреди песни — длинные ноты, начатые раньше, подхватываем) */
  maxDur: number;
  /** Для проверки и подсказок: аккорды по времени (с) и части */
  chords: Array<{ t: number; beats: number; chord: Chord }>;
  sections: Array<{ name: string; bar: number; bars: number }>;
  /** Только мелодия (для проверки по нотам): время, длина в долях, MIDI, доля в такте */
  melody: Array<{ t: number; beats: number; midi: number; beatInBar: number; part: Inst }>;
}

interface Ev { t: number; dur: number; voice: number; midi: number; vel: number; from: number }

const EPS = 1e-6;

/** Детерминированный «человеческий» разброс: от id песни */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Такты через «|»; «%» — как прошлый такт */
function bars(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split('|')) {
    const b = raw.trim();
    out.push(b === '%' && out.length ? out[out.length - 1] : b);
  }
  return out;
}

function tokens(bar: string): string[] {
  return bar.split(/\s+/).filter(Boolean);
}

/** «c5/1.5!» → нота, длина в долях, громкость */
function noteToken(tok: string, where: string): { head: string; beats: number; acc: number } {
  const m = /^([^/]+)\/([\d.]+)([!?]?)$/.exec(tok);
  if (!m) throw new Error(`${where}: не понял «${tok}»`);
  const beats = Number(m[2]);
  if (!(beats > 0)) throw new Error(`${where}: длина «${tok}»`);
  return { head: m[1], beats, acc: m[3] === '!' ? 1.18 : m[3] === '?' ? 0.62 : 1 };
}

/** own — описание песни не из каталога автомата (тема фермы: client/farm/audio/theme.ts) */
export function compileSong(def: SongDef, own?: JukeSong): CompiledSong {
  const meta = own ?? JUKE_SONGS.find((s) => s.id === def.id);
  if (!meta) throw new Error(`песни «${def.id}» нет в каталоге`);
  const beat = 60 / meta.bpm;
  const meter = meta.meter;
  const r = rng(def.id);
  const events: Ev[] = [];
  const chords: CompiledSong['chords'] = [];
  const sections: CompiledSong['sections'] = [];
  const melody: CompiledSong['melody'] = [];
  const swing = def.swing ?? 0;
  const unit = def.swingUnit ?? 0.5;
  /** Время (с) по такту и доле в нём — со свингом */
  const at = (bar: number, b: number): number => {
    let pos = b;
    if (swing > 0) {
      const k = pos / unit;
      const ki = Math.round(k);
      if (Math.abs(k - ki) < 1e-4 && ki % 2 === 1) pos += swing * unit;
    }
    return (bar * meter + pos) * beat;
  };
  const push = (t: number, durBeats: number, voice: number, midi: number, vel: number, human = true, from = 0): void => {
    const jitter = human ? (r() - 0.5) * 0.008 : 0;
    const v = Math.min(1, Math.max(0.05, vel * (human ? 0.94 + r() * 0.12 : 1)));
    events.push({ t: Math.max(0, t + jitter), dur: durBeats * beat, voice, midi, vel: v, from });
  };

  let bar0 = 0;
  for (const name of def.form) {
    const sec = def.sections[name];
    if (!sec) throw new Error(`${def.id}: нет части «${name}»`);
    const where = `${def.id}/${name}`;
    // аккорды по тактам
    const cbars = bars(sec.chords);
    const nb = cbars.length;
    const timeline: Array<{ bar: number; b: number; beats: number; chord: Chord }> = [];
    let last: Array<{ chord: Chord; beats: number | null }> = [];
    cbars.forEach((cb, i) => {
      let items: Array<{ chord: Chord; beats: number | null }>;
      if (cb === '%') items = last;
      else items = tokens(cb).map((tk) => {
        const [c, b] = tk.split(':');
        return { chord: parseChord(c), beats: b ? Number(b) : null };
      });
      if (!items.length) throw new Error(`${where}: пустой такт аккордов ${i + 1}`);
      const fixed = items.reduce((a, it) => a + (it.beats ?? 0), 0);
      const free = items.filter((it) => it.beats === null).length;
      const each = free ? (meter - fixed) / free : 0;
      let b = 0;
      for (const it of items) {
        const len = it.beats ?? each;
        timeline.push({ bar: bar0 + i, b, beats: len, chord: it.chord });
        b += len;
      }
      if (Math.abs(b - meter) > 1e-3) throw new Error(`${where}: аккорды такта ${i + 1} — ${b} долей из ${meter}`);
      last = items;
    });
    for (const c of timeline) chords.push({ t: at(c.bar, c.b), beats: c.beats, chord: c.chord });
    /** Аккорд в такте bar на доле b (абсолютные такты) */
    const chordAt = (bar: number, b: number): Chord => {
      let found = timeline[0].chord;
      for (const c of timeline) if (c.bar < bar || (c.bar === bar && c.b <= b + EPS)) found = c.chord;
      return found;
    };

    for (const part of sec.parts) {
      const pv = part.vel ?? 0.8;
      if ('drums' in part) {
        const kit = KITS.indexOf(part.kit);
        const keys = new Set<DrumKey>([...Object.keys(part.drums), ...Object.keys(part.first ?? {}), ...Object.keys(part.fill ?? {})] as DrumKey[]);
        for (const key of keys) {
          const d = DRUMS.indexOf(key);
          if (d < 0) throw new Error(`${where}: ударного «${key}» нет`);
          const gb = part.drums[key] !== undefined ? bars(part.drums[key]!) : null;
          for (let i = 0; i < nb; i++) {
            const special = i === nb - 1 && part.fill?.[key] !== undefined ? part.fill[key]! : i === 0 && part.first?.[key] !== undefined ? part.first[key]! : null;
            if (special === null && !gb) continue;
            const g = (special ?? gb![i % gb!.length]).replace(/\s+/g, '');
            const per = g.length / meter;
            if (!Number.isInteger(per)) throw new Error(`${where}: сетка «${key}» — ${g.length} шагов на ${meter} доли`);
            for (let s = 0; s < g.length; s++) {
              const ch = g[s];
              if (ch === '.' || ch === '-') continue;
              const vel = ch === 'X' ? 1 : ch === 'x' ? 0.8 : ch === 'o' ? 0.45 : -1;
              if (vel < 0) throw new Error(`${where}: в сетке «${key}» знак «${ch}»`);
              push(at(bar0 + i, s / per), 0.25, drumVoice(kit, d), 0, vel * pv);
            }
          }
        }
        continue;
      }
      const inst = INSTS.indexOf(part.i);
      const lenK = part.len ?? 0.92;
      if ('mel' in part) {
        const mb = bars(part.mel);
        if (mb.length !== nb) throw new Error(`${where}: мелодия ${part.i} — ${mb.length} тактов, а аккордов ${nb}`);
        const shift = (part.oct ?? 0) * 12;
        let prev: Ev | null = null;
        let lastMidi = 0;
        mb.forEach((mbar, i) => {
          let b = 0;
          for (const tk of tokens(mbar)) {
            const nt = noteToken(tk, `${where} такт ${i + 1}`);
            const { beats, acc } = nt;
            // «>c2/1» — скользнуть в ноту из прошлой (808)
            const glide = nt.head.startsWith('>');
            const head = glide ? nt.head.slice(1) : nt.head;
            if (head === 'r') { prev = null; b += beats; continue; }
            if (head === '~') {
              if (!prev) throw new Error(`${where} такт ${i + 1}: «~» без ноты`);
              prev.dur += beats * beat;
              const mm = melody[melody.length - 1];
              if (mm) mm.beats += beats;
              b += beats;
              continue;
            }
            const midi = noteMidi(head) + shift;
            if (glide && !lastMidi) throw new Error(`${where} такт ${i + 1}: глайд «${tk}» без прошлой ноты`);
            push(at(bar0 + i, b), beats * lenK, inst, midi, pv * acc, true, glide ? lastMidi : 0);
            prev = events[events.length - 1];
            lastMidi = midi;
            melody.push({ t: at(bar0 + i, b), beats, midi, beatInBar: b, part: part.i });
            b += beats;
          }
          if (Math.abs(b - meter) > 1e-3) throw new Error(`${where}: мелодия ${part.i}, такт ${i + 1} — ${b} долей из ${meter}`);
        });
        continue;
      }
      if ('bass' in part) {
        const lo = part.lo ?? 28;
        const place = (pc: number): number => lo + ((pc - lo) % 12 + 12) % 12;
        const pb = bars(part.bass);
        for (let i = 0; i < nb; i++) {
          let b = 0;
          for (const tk of tokens(pb[i % pb.length])) {
            const { head, beats, acc } = noteToken(tk, `${where} бас`);
            if (head !== 'r') {
              const c = chordAt(bar0 + i, b);
              let midi: number;
              if (head === '>' || head === '^') {
                const endBar = b + beats >= meter - EPS ? bar0 + i + 1 : bar0 + i;
                const endB = b + beats >= meter - EPS ? 0 : b + beats;
                const next = endBar < bar0 + nb ? chordAt(endBar, endB) : c;
                midi = place(next.bass) + (head === '>' ? -1 : 0);
              } else {
                const m = /^(b?#?\d)([',]*)$/.exec(head);
                if (!m) throw new Error(`${where} бас: «${head}»`);
                const oct = (m[2].match(/'/g)?.length ?? 0) - (m[2].match(/,/g)?.length ?? 0);
                midi = m[1] === '1' ? place(c.bass) : place(c.root) + degree(c, m[1]);
                midi += oct * 12;
              }
              push(at(bar0 + i, b), beats * lenK, inst, midi, pv * acc);
            }
            b += beats;
          }
          if (Math.abs(b - meter) > 1e-3) throw new Error(`${where}: бас, такт ${i + 1} — ${b} долей из ${meter}`);
        }
        continue;
      }
      if ('pad' in part) {
        // тот же аккорд в соседних тактах — одна долгая нота, без нового вступления
        let prevV: number[] | null = null;
        for (let k = 0; k < timeline.length; k++) {
          const c = timeline[k];
          let beats = c.beats;
          while (k + 1 < timeline.length && timeline[k + 1].chord.name === c.chord.name) beats += timeline[++k].beats;
          const v = voicing(c.chord, part.n ?? 4, part.lo ?? 52, part.hi ?? 74, prevV);
          prevV = v;
          for (const m of v) push(at(c.bar, c.b), beats + 0.06, inst, m, pv, false);
        }
        continue;
      }
      const isComp = 'comp' in part;
      const pat = bars(isComp ? part.comp : part.arp);
      const n = part.n ?? 4;
      const lo = part.lo ?? (isComp ? 55 : 60);
      const hi = part.hi ?? (isComp ? 76 : 84);
      let prevV: number[] | null = null;
      let prevChord: Chord | null = null;
      for (let i = 0; i < nb; i++) {
        let b = 0;
        let strike = 0;
        for (const tk of tokens(pat[i % pat.length])) {
          const { head, beats, acc } = noteToken(tk, `${where} ${isComp ? 'аккомпанемент' : 'арпеджио'}`);
          if (head !== 'r') {
            const c = chordAt(bar0 + i, b);
            if (c !== prevChord || !prevV) { prevV = voicing(c, n, lo, hi, prevV); prevChord = c; }
            const t = at(bar0 + i, b);
            if (isComp) {
              const k = head === 'X' ? 1.15 : head === 'o' ? 0.55 : head === 'x' ? 1 : -1;
              if (k < 0) throw new Error(`${where} аккомпанемент: «${head}»`);
              const strum = 'strum' in part ? (part.strum ?? 0) : 0;
              const up = strum > 0 && Math.abs(b - Math.round(b)) > 0.01;
              const order = up ? [...prevV].reverse() : prevV;
              order.forEach((m, j) => push(t + j * strum, beats * lenK, inst, m, pv * k * acc * (up ? 0.85 : 1)));
              strike++;
            } else {
              const m = /^(\d)([',]*)$/.exec(head);
              if (!m) throw new Error(`${where} арпеджио: «${head}»`);
              const idx = Number(m[1]);
              const oct = (m[2].match(/'/g)?.length ?? 0) - (m[2].match(/,/g)?.length ?? 0);
              const base = prevV[idx % prevV.length] + 12 * Math.floor(idx / prevV.length);
              push(t, beats * lenK, inst, base + oct * 12, pv * acc);
            }
          }
          b += beats;
        }
        if (Math.abs(b - meter) > 1e-3) throw new Error(`${where}: ${isComp ? 'аккомпанемент' : 'арпеджио'}, такт ${i + 1} — ${b} долей из ${meter}`);
      }
    }
    sections.push({ name, bar: bar0, bars: nb });
    bar0 += nb;
  }
  if (bar0 !== meta.bars) throw new Error(`${def.id}: ${bar0} тактов, а в каталоге ${meta.bars}`);
  events.sort((a, b) => a.t - b.t);
  const n = events.length;
  const out: CompiledSong = {
    def, meta, beat, length: meta.bars * meter * beat, total: meta.bars * meter * beat + meta.tail, n,
    t: new Float64Array(n), dur: new Float32Array(n), voice: new Uint8Array(n), midi: new Uint8Array(n), vel: new Float32Array(n),
    from: new Uint8Array(n), maxDur: 0, chords, sections, melody,
  };
  events.forEach((e, i) => {
    out.t[i] = e.t;
    out.dur[i] = e.dur;
    out.voice[i] = e.voice;
    out.midi[i] = Math.max(0, Math.min(127, e.midi));
    out.vel[i] = e.vel;
    out.from[i] = Math.max(0, Math.min(127, e.from));
    if (e.dur > out.maxDur) out.maxDur = e.dur;
  });
  return out;
}
