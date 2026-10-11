// Строки живого статуса на вывесках новой набережной (PLAZA3, WP10): что сейчас происходит в режиме. Чистые функции без
// three.js и DOM — их проверяет test/plaza3-signs.test.ts. Источник — те же статусы, что у зазывал и афиши кафе
// (LiveIn из client/lobby/plaza/live.ts: клиент их и так получает, новых сообщений нет), плюс то, что сцена добавляет сама
// (занятые автоматы, рекорд «Подземелья»). Без эмодзи; регистр — как в UI («идёт заезд · 3 игрока»); одна строка до 34 знаков.
import { fmtAquaTime } from '../../../shared/aqua.ts';
import { BOAT_SEATS, BP_BOARD, BP_RIDE } from '../../../shared/boat.ts';
import { FORT_MAX_HUMANS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { wavesText } from '../../../shared/fortrecord.ts';
import { RG_MAX } from '../../../shared/regatta.ts';
import { WHEEL_PRICE } from '../../../shared/wheel.ts';
import { FE_HOME, FE_BOARD, FE_OUT, FE_AWAY, FERRY_SEATS, ferryEta } from '../../../shared/ferry.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import type { FerryStatus } from '../../../shared/messages.ts';
import { agendaRows, plural, type LiveIn } from '../plaza/live.ts';

/** Чей статус показывает вывеска (SIGN_META в signstyle.ts) */
export type StatusMode =
  | 'paint' | 'fort' | 'sky' | 'kart' | 'hide' | 'regatta' | 'boat' | 'aqua' | 'dungeon' | 'slots'
  | 'billiards' | 'cards' | 'rotunda' | 'wheel' | 'cafe' | 'semyon' | 'fishing' | 'rats' | 'wardrobe' | 'plane'
  | 'farm' | 'ferry' | 'honor' | 'online' | 'none';

/** Точка у статуса: open — свободно/открыто (зелёная), go — идёт сейчас (золотая), bad — нет мест/закрыто (красная), none — без точки */
export type SignTone = 'open' | 'go' | 'bad' | 'none';

export interface SignStatus {
  text: string;
  tone: SignTone;
}

/** То, что сцена знает, а LiveIn нет: сейчас — занятые автоматы и рекорд «Подземелья» (null — данных нет) */
export interface SignExtras {
  slots: { busy: number; total: number } | null;
  dungeon: { nick: string; waves: number } | null;
  ferry?: { status: FerryStatus; tick: number } | null;
}

export function emptyExtras(): SignExtras {
  return { slots: null, dungeon: null };
}

/** Длиннее строка не бывает: больше режется с «…» (плашка статуса рассчитана на 34 знака в самом узком щите) */
export const STATUS_MAX = 34;

const NONE: SignStatus = { text: '', tone: 'none' };

export const clock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const players = (n: number): string => `${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`;
const cut = (s: string, n = STATUS_MAX): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const nick = (s: string): string => (s.length > 10 ? `${s.slice(0, 9)}…` : s);

/** Что написано на вывесках, у которых живого статуса нет: призыв или то, что тут можно делать */
const FIXED: Readonly<Partial<Record<StatusMode, string>>> = {
  billiards: 'сыграй партию · жми E',
  cards: 'дурак и блэкджек · жми E',
  rotunda: 'пластинка на твой вкус · жми E',
  wheel: `${WHEEL_PRICE} ${plural(WHEEL_PRICE, 'жетон', 'жетона', 'жетонов')} · один оборот`,
  semyon: 'скупка рыбы · задания Семёна',
  fishing: 'удочка, мостки, маяк',
  rats: 'ставки на крыс · жми E',
  wardrobe: 'примерь обновки · жми E',
  plane: 'прогулка на гидроплане · жми E',
  farm: 'ферма за аркой · жми E',
  ferry: 'паром к баркасу · жми E',
  honor: 'топ недели · жетоны',
  online: 'кто сейчас на набережной',
};

/** Статус вывески режима mode по живым данным; пустой текст — вывеска без строки статуса или режим выключен */
export function signStatus(mode: StatusMode, s: LiveIn, x: SignExtras): SignStatus {
  switch (mode) {
    case 'ferry': {
      if (!x.ferry) return { text: FIXED.ferry ?? '', tone: 'open' };
      const { status: f, tick } = x.ferry;
      const seconds = (at: number): number => Math.max(0, Math.ceil((at - tick) / TICK_RATE));
      if (f.ph === FE_HOME) return { text: 'у причала · подойди и жми E', tone: 'open' };
      if (f.ph === FE_BOARD) {
        const free = Math.max(0, FERRY_SEATS - f.n);
        return { text: free ? `отход ${clock(seconds(f.at))} · мест: ${free}` : `мест нет · отход ${clock(seconds(f.at))}`, tone: free ? 'go' : 'bad' };
      }
      const eta = clock(Math.max(0, Math.ceil(ferryEta(f.ph, f.at, tick, false) / TICK_RATE)));
      return { text: f.ph === FE_OUT ? `к баркасу · обратно ${eta}` : f.ph === FE_AWAY ? `у баркаса · прибудет ${eta}` : `возвращается · прибудет ${eta}`, tone: 'go' };
    }
    case 'paint':
      return s.pbHumans > 0 ? { text: `идёт бой · ${players(s.pbHumans)}`, tone: 'go' } : { text: 'пусто — заходи первым', tone: 'open' };
    case 'fort': {
      const f = s.fort;
      if (!f) return NONE;
      const rec = f.rec;
      if (f.humans >= FORT_MAX_HUMANS) return { text: 'на стенах тесно · мест нет', tone: 'bad' };
      if (f.humans === 0) {
        if (f.phase === FT_END) return { text: 'итоги боя', tone: 'go' };
        return { text: rec ? cut(`рекорд ${wavesText(rec.wave)} · побей!`) : 'на стенах пусто — зови', tone: 'open' };
      }
      if (f.phase === FT_WAVE) return { text: rec?.live ? `волна ${f.wave} · бьют рекорд!` : `волна ${f.wave} · держат ${f.humans}`, tone: 'go' };
      if (f.phase === FT_BREAK) return { text: `передышка · волна ${f.wave + 1}`, tone: 'go' };
      if (f.phase === FT_GATHER) return { text: `сбор · волна через ${clock(f.left)}`, tone: 'open' };
      return { text: 'итоги боя', tone: 'go' };
    }
    case 'sky': {
      const k = s.skill;
      if (!k) return NONE;
      if (k.n >= k.max) return { text: 'каланча занята · мест нет', tone: 'bad' };
      if (k.phase === 'pre') return { text: `забег через ${clock(k.left)} · ${k.n} из ${k.max}`, tone: 'open' };
      if (k.phase === 'run') return { text: `забег идёт · ${k.n} из ${k.max}`, tone: 'go' };
      return k.n > 0 ? { text: `на каланче ${k.n} из ${k.max}`, tone: 'go' } : { text: 'каланча свободна', tone: 'open' };
    }
    case 'kart': {
      const k = s.kart;
      if (k && k.phase === 'count') return { text: `старт через ${clock(k.left)} · в круге ${k.n}`, tone: 'open' };
      if (k && k.phase === 'race') return { text: `идёт заезд · ${players(k.n)}`, tone: 'go' };
      if (k && k.phase === 'results') return { text: 'финиш · итоги на табло', tone: 'go' };
      return { text: 'трасса свободна', tone: 'open' };
    }
    case 'hide': {
      const h = s.hide;
      if (!h) return NONE;
      if (h.phase === 'gather') return { text: h.n > 0 ? `сбор ${h.n} из ${h.max} · нужно двое` : 'во дворе пусто · нужно двое', tone: 'open' };
      return { text: 'идёт раунд · прячутся', tone: 'go' };
    }
    case 'regatta': {
      const r = s.regatta;
      if (r.running) return { text: 'идёт заезд в бухте', tone: 'go' };
      const q = r.q;
      if (q && q.phase === 'count') return { text: `старт через ${clock(q.left ?? 0)} · у круга ${q.n}`, tone: 'open' };
      if (q && q.n > 0) return { text: `у круга ${q.n} из ${RG_MAX} · ждём ещё`, tone: 'open' };
      return { text: 'бухта свободна', tone: 'open' };
    }
    case 'boat': {
      const b = s.boat;
      if (b && b.ph === BP_BOARD) {
        const free = BOAT_SEATS - b.n;
        return free > 0
          ? { text: `отплытие через ${clock(b.left)} · ${free} ${plural(free, 'место', 'места', 'мест')}`, tone: 'open' }
          : { text: `мест нет · отплытие через ${clock(b.left)}`, tone: 'bad' };
      }
      if (b && b.ph === BP_RIDE) return { text: `в поездке · вернётся через ${clock(b.left)}`, tone: 'go' };
      return { text: 'катер свободен · жми E', tone: 'open' };
    }
    case 'aqua': {
      const a = s.aqua;
      return a ? { text: cut(`рекорд полосы ${fmtAquaTime(a.ms).replace(/\.\d+$/, '')} · ${nick(a.nick)}`), tone: 'open' } : { text: 'рекордов нет — будь первым', tone: 'open' };
    }
    case 'dungeon': {
      const d = x.dungeon;
      return d ? { text: cut(`рекорд ${wavesText(d.waves)} · ${nick(d.nick)}`), tone: 'open' } : { text: 'спуск соло · рекордов нет', tone: 'open' };
    }
    case 'slots': {
      const sl = x.slots;
      if (!sl) return { text: 'автоматы и аркада · жми E', tone: 'open' };
      const free = Math.max(0, sl.total - sl.busy);
      if (free === 0) return { text: 'все автоматы заняты', tone: 'bad' };
      return { text: `${free === 1 ? 'свободен' : 'свободно'} ${free} ${plural(free, 'автомат', 'автомата', 'автоматов')}`, tone: 'open' };
    }
    case 'cafe': {
      // афиша кафе: сколько мест в городе «горит» прямо сейчас
      let hot = 0;
      for (const r of agendaRows(s)) if (r.hot) hot++;
      return hot > 0 ? { text: `сегодня в городе · идёт ${hot}`, tone: 'go' } : { text: 'афиша «Сегодня в городе»', tone: 'open' };
    }
    case 'none':
      return NONE;
    default: {
      const t = FIXED[mode];
      return t ? { text: t, tone: 'open' } : NONE;
    }
  }
}

/** Ключ для сравнения: строка перерисовывается, только когда он поменялся */
export const statusKey = (st: SignStatus): string => `${st.tone}|${st.text}`;
