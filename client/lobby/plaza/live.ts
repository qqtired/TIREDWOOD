// Живые реплики зазывал и строки афиши: что сейчас происходит в режиме (по статусам, которые клиент и так получает —
// ни одного нового сообщения). Чистые функции без three.js и DOM: их проверяют тесты. Реплика — не длиннее 60 знаков.
import { BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_RIDE } from '../../../shared/boat.ts';
import { FORT_MAX_HUMANS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { RC_MAX_KARTS } from '../../../shared/kart.ts';
import { RG_MAX } from '../../../shared/regatta.ts';
import { fmtAquaTime } from '../../../shared/aqua.ts';
import { TOUT_INFO, type ToutKey } from './data.ts';

/** Статусы режимов в том виде, как их хранит сцена набережной (null — режим выключен или данных нет) */
export interface LiveIn {
  /** Сколько людей сейчас в пейнтболе */
  pbHumans: number;
  fort: { phase: number; wave: number; humans: number; left: number } | null;
  skill: { n: number; max: number; phase: string; left: number } | null;
  kart: { phase: string; n: number; left: number; lap: number; laps: number } | null;
  hide: { phase: string; n: number; max: number; left?: number } | null;
  /** Регата: сбор у круга и идёт ли заезд в бухте */
  regatta: { q: { phase: string; n: number; left?: number } | null; running: boolean };
  fight: { phase: string; left: number; n: number } | null;
  boat: { ph: number; n: number; left: number } | null;
  /** Лучший результат аквапарка (первая строка доски рекордов); null — рекордов ещё нет */
  aqua: { nick: string; ms: number } | null;
}

export function emptyLive(): LiveIn {
  return { pbHumans: 0, fort: null, skill: null, kart: null, hide: null, regatta: { q: null, running: false }, fight: null, boat: null, aqua: null };
}

/** «1 желейка, 2 желейки, 5 желеек» */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}

const cut = (s: string): string => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
const fit28 = (s: string): string => (s.length > 28 ? `${s.slice(0, 27)}…` : s);

/** Реплики зазывалы по статусу; пусто — говорит свои обычные. */
export function liveLines(key: ToutKey, s: LiveIn): readonly string[] {
  switch (key) {
    case 'paint':
      return s.pbHumans > 0
        ? [cut(`В бою уже ${s.pbHumans} ${plural(s.pbHumans, 'желейка', 'желейки', 'желеек')}. Присоединяйся!`), 'Встань в круг у ворот — и сразу в бой']
        : [];
    case 'fort': {
      const f = s.fort;
      if (!f) return [];
      if (f.humans >= FORT_MAX_HUMANS) return ['На стенах тесно: мест нет. Жди следующую волну'];
      if (f.humans === 0) return f.phase === FT_END ? [] : ['Никого на стенах! Заходи — нужна помощь'];
      if (f.phase === FT_WAVE) return [cut(`Волна ${f.wave}, держат ${f.humans}. Нужна помощь!`), 'Зомби прут! Бери оружие и на стену'];
      if (f.phase === FT_BREAK) return [cut(`Передышка перед волной ${f.wave + 1}. Успеешь!`)];
      if (f.phase === FT_GATHER) return [cut(`Сбор: ${f.humans} на стенах, волна через ${f.left} с`)];
      return [cut(`Итоги боя. Новая игра через ${f.left} с`)];
    }
    case 'sky': {
      const k = s.skill;
      if (!k) return [];
      if (k.n >= k.max) return ['Каланча занята. Подожди своей очереди'];
      if (k.phase === 'pre') return [cut(`Забег через ${k.left} с. Места ещё есть!`)];
      if (k.phase === 'run') return [cut(`Забег идёт: на каланче ${k.n} из ${k.max}`)];
      return k.n > 0 ? [cut(`На каланче уже ${k.n} из ${k.max}. Залезай!`)] : [];
    }
    case 'kart': {
      const k = s.kart;
      if (!k) return [];
      if (k.phase === 'count') return [cut(`Старт через ${k.left} с! Гонщиков: ${k.n} из ${RC_MAX_KARTS}`)];
      if (k.phase === 'race') return [cut(`Гонка идёт, круг ${Math.min(k.lap, k.laps)} из ${k.laps}. Смотри табло`)];
      if (k.phase === 'results') return ['Финиш! Результаты — на табло у гаража'];
      return [];
    }
    case 'hide': {
      const h = s.hide;
      if (!h) return [];
      if (h.phase === 'gather') return [cut(`Сбор в рыбном дворе: ${h.n} из ${h.max}. Нужно двое!`)];
      return ['Прячутся! Дождись окончания раунда'];
    }
    case 'regatta': {
      const r = s.regatta;
      if (r.running) return ['Регата идёт! Смотри заезд с набережной'];
      const q = r.q;
      if (q && q.phase === 'count') return [cut(`Старт через ${q.left ?? 0} с! Катера — на воду`)];
      if (q && q.n > 0) return [cut(`У круга уже ${q.n} ${plural(q.n, 'гонщик', 'гонщика', 'гонщиков')}. Встань рядом!`)];
      return [];
    }
    case 'boat': {
      const b = s.boat;
      if (!b) return [];
      if (b.ph === BP_BOARD) {
        const free = BOAT_SEATS - b.n;
        return [cut(free > 0 ? `Отплытие через ${b.left} с. Свободно мест: ${free}` : `Мест нет. Отплытие через ${b.left} с`)];
      }
      if (b.ph === BP_RIDE) return [cut(`Катер в поездке, вернётся через ${b.left} с`)];
      return [];
    }
    case 'fight': {
      const f = s.fight;
      if (!f) return [];
      if (f.phase === 'count') return [cut(`Спуск через ${f.left} с. В круге: ${f.n}`)];
      if (f.phase === 'fight') return ['Внизу идёт бой! Подойди к двери — посмотришь'];
      return [];
    }
    case 'aqua': {
      // рекорд — первой репликой, дальше его обычные подсказки
      const a = s.aqua;
      return a ? [cut(`Рекорд полосы — ${fmtAquaTime(a.ms)}, ${a.nick}. Побьёшь?`), ...TOUT_INFO.aqua.lines] : [];
    }
    case 'cafe': {
      // бариста читает афишу вслух — только те строки, где что-то идёт или набирают людей; в тишине говорит свои обычные
      const out: string[] = [];
      for (const r of agendaRows(s)) if (r.hot) out.push(cut(`${r.name}: ${r.text}`));
      return out;
    }
    default:
      return [];
  }
}

/** Порядок мест в афише и в речи бариста: как по улице — дома 2, 3, 4, дальше каланча, подвал кафе и вода */
export const AGENDA_ORDER: readonly ToutKey[] = ['paint', 'fort', 'kart', 'sky', 'fight', 'regatta', 'boat', 'aqua', 'hide'];

const AGENDA_NAME: Readonly<Record<string, string>> = {
  paint: 'Пейнтбол', fort: 'Крепость', kart: 'Картинг', sky: 'Выше облаков', fight: 'Fight Club', regatta: 'Регата', boat: 'Ласточка', aqua: 'Аквапарк', hide: 'Прятки',
};

/** Строка афиши «Сегодня в городе»: место, что в нём сейчас (до 28 знаков) и «горит» ли (что-то идёт или можно присоединиться) */
export interface AgendaRow {
  key: ToutKey;
  name: string;
  text: string;
  hot: boolean;
}

/**
 * Афиша по живым статусам, в порядке AGENDA_ORDER. Режимы, выключенные флагом сервера (статуса нет), в ней не показываются:
 * без флагов — только пейнтбол, картинг и «Ласточка».
 */
export function agendaRows(s: LiveIn): AgendaRow[] {
  const rows: AgendaRow[] = [];
  const row = (key: ToutKey, text: string, hot: boolean): void => {
    rows.push({ key, name: AGENDA_NAME[key] ?? key, text, hot });
  };
  for (const key of AGENDA_ORDER) {
    switch (key) {
      case 'paint':
        row(key, s.pbHumans > 0 ? `в бою ${s.pbHumans} ${plural(s.pbHumans, 'желейка', 'желейки', 'желеек')}` : 'пусто — заходи первым', s.pbHumans > 0);
        break;
      case 'fort': {
        const f = s.fort;
        if (!f) break;
        if (f.humans >= FORT_MAX_HUMANS) row(key, 'на стенах тесно · мест нет', true);
        else if (f.humans === 0) row(key, 'на стенах пусто — зови', false);
        else if (f.phase === FT_WAVE) row(key, `волна ${f.wave} · держат ${f.humans}`, true);
        else if (f.phase === FT_BREAK) row(key, `передышка · волна ${f.wave + 1}`, true);
        else if (f.phase === FT_GATHER) row(key, `сбор · волна через ${f.left} с`, true);
        else row(key, 'итоги боя', true);
        break;
      }
      case 'kart': {
        const k = s.kart;
        if (k && k.phase === 'count') row(key, `старт через ${k.left} с · ${k.n} из ${RC_MAX_KARTS}`, true);
        else if (k && k.phase === 'race') row(key, `гонка · круг ${Math.min(k.lap, k.laps)} из ${k.laps}`, true);
        else if (k && k.phase === 'results') row(key, 'финиш · итоги на табло', true);
        else row(key, 'трасса свободна', false);
        break;
      }
      case 'sky': {
        const k = s.skill;
        if (!k) break;
        if (k.n >= k.max) row(key, 'каланча занята', true);
        else if (k.phase === 'pre') row(key, `забег через ${k.left} с · ${k.n} из ${k.max}`, true);
        else if (k.phase === 'run') row(key, `забег идёт · ${k.n} из ${k.max}`, true);
        else row(key, k.n > 0 ? `на каланче ${k.n} из ${k.max}` : 'каланча свободна', k.n > 0);
        break;
      }
      case 'fight': {
        const f = s.fight;
        if (!f) break;
        if (f.phase === 'count') row(key, `спуск через ${f.left} с · в круге ${f.n}`, true);
        else if (f.phase === 'fight') row(key, 'внизу идёт бой', true);
        else row(key, f.n > 0 ? `в круге ${f.n} · ждут бой` : 'в подвале тихо', f.n > 0);
        break;
      }
      case 'regatta': {
        const r = s.regatta;
        if (!r.q && !r.running) break;
        if (r.running) row(key, 'идёт заезд в бухте', true);
        else if (r.q && r.q.phase === 'count') row(key, `старт через ${r.q.left ?? 0} с · ${r.q.n} из ${RG_MAX}`, true);
        else if (r.q && r.q.n > 0) row(key, `у круга ${r.q.n} из ${RG_MAX} · ждём ещё`, true);
        else row(key, 'бухта свободна', false);
        break;
      }
      case 'boat': {
        const b = s.boat;
        if (b && b.ph === BP_BOARD) row(key, BOAT_SEATS - b.n > 0 ? `отплытие через ${b.left} с · мест ${BOAT_SEATS - b.n}` : `мест нет · через ${b.left} с`, true);
        else if (b && b.ph === BP_RIDE) row(key, `в поездке · ещё ${b.left} с`, true);
        else row(key, 'катер свободен · жми E', false);
        break;
      }
      case 'aqua': {
        // в аквапарке время у каждого своё — «горящим» он не бывает, в строке — рекорд полосы
        const a = s.aqua;
        row(key, a ? fit28(`рекорд ${fmtAquaTime(a.ms)} · ${a.nick}`) : 'рекордов нет — будь первым', false);
        break;
      }
      case 'hide': {
        const h = s.hide;
        if (!h) break;
        if (h.phase === 'gather') row(key, h.n > 0 ? `сбор ${h.n} из ${h.max} · нужно двое` : 'во дворе никого', h.n > 0);
        else row(key, 'идёт раунд', true);
        break;
      }
      default:
        break;
    }
  }
  return rows;
}

/** Строка на табличке конторы порта: что сейчас с катером «Ласточка» (в тех же словах, что столбик у причала) */
export function boatPlateLine(s: LiveIn): string {
  const b = s.boat;
  if (b && b.ph === BP_RIDE) return `В поездке · вернётся через ${b.left} с`;
  if (b && b.ph === BP_BOARD) {
    const free = BOAT_SEATS - b.n;
    return free > 0 ? `Отплытие через ${b.left} с · мест: ${free}` : `Мест нет · отплытие через ${b.left} с`;
  }
  return 'Катер свободен · нажми E';
}

// ------------------------------------------------------------ из статусов сцены

/** Сырые статусы набережной, как они лежат в сцене */
export interface LiveRaw {
  pbHumans: number;
  fort: LiveIn['fort'];
  skill: LiveIn['skill'];
  kart: { phase: string; n: number; lap: number; laps: number } | null;
  /** Секунд до старта картинга (между сообщениями сервера тикают сами) */
  kartLeft: number;
  /** Круг сбора пряток: GatherStatus ('idle' | 'count') или HideStatus ('gather' | 'hide' | …) */
  hide: { phase: string; n: number; max: number; left?: number } | null;
  boatrace: { phase: string; n: number; left?: number } | null;
  regattaRunning: boolean;
  fight: { phase: string; left: number; names: readonly string[] } | null;
  boat: { ph: number; at: number; n: number };
  aqua: { nick: string; ms: number } | null;
  /** Часы отрисовки, тики сервера */
  tick: number;
  tickRate: number;
}

const secs = (ticks: number, rate: number): number => Math.max(0, Math.ceil(ticks / rate));

/** Собрать статусы в LiveIn; out переиспользуется (без выделения памяти каждый кадр). */
export function fillLive(out: LiveIn, r: LiveRaw): LiveIn {
  out.pbHumans = r.pbHumans;
  out.fort = r.fort;
  out.skill = r.skill;
  if (r.kart) {
    const k = (out.kart ??= { phase: '', n: 0, left: 0, lap: 0, laps: 0 });
    k.phase = r.kart.phase;
    k.n = r.kart.n;
    k.left = r.kartLeft;
    k.lap = r.kart.lap;
    k.laps = r.kart.laps;
  } else out.kart = null;
  if (r.hide) {
    const h = (out.hide ??= { phase: '', n: 0, max: 0 });
    // у круга сбора фаза «idle»/«count» — это тоже сбор
    h.phase = r.hide.phase === 'idle' || r.hide.phase === 'count' ? 'gather' : r.hide.phase;
    h.n = r.hide.n;
    h.max = r.hide.max;
  } else out.hide = null;
  out.regatta.running = r.regattaRunning;
  if (r.boatrace) {
    const q = (out.regatta.q ??= { phase: '', n: 0 });
    q.phase = r.boatrace.phase;
    q.n = r.boatrace.n;
    q.left = r.boatrace.left;
  } else out.regatta.q = null;
  if (r.fight) {
    const f = (out.fight ??= { phase: '', left: 0, n: 0 });
    f.phase = r.fight.phase;
    f.left = r.fight.left;
    f.n = r.fight.names.length;
  } else out.fight = null;
  const b = (out.boat ??= { ph: 0, n: 0, left: 0 });
  b.ph = r.boat.ph;
  b.n = r.boat.n;
  out.aqua = r.aqua;
  b.left = r.boat.ph === BP_RIDE ? secs(r.boat.at + BOAT_RIDE_TICKS - r.tick, r.tickRate) : secs(r.boat.at - r.tick, r.tickRate);
  return out;
}
