// Модель игрока для способностей (10.10, прототип): тот же «обычный» / «опытный» из test/fishbot.ts (реакция, шум, отвлечения,
// подмотка у дна, отпускание у верха), плюс:
// - чернила: рыбу под ними не видно — игрок ведёт зону к месту, где видел её последний раз, а если катушка трещит (рыба в
//   зоне) — старается держать зону на месте; чернила стекают сверху — рыбу выше их края снова видно;
// - мини-шкала: кнопка ведёт зону мини-шкалы к мелкой рыбе (своя история глаза, реакция та же);
// - разлом шкалы: видит новые края (цель — в пределах шкалы сейчас);
// - зубы: не наезжает на зуб, если видит его заранее (за 12 тиков движения зоны);
// - пелена: в стене тумана рыбы не видно (как под чернилами), в полосе — бледная тень (шум глаза ×1,5);
// - хлыст: удар сбивает «привычку» — своя зона видна глазами с реакцией, пока не придёт в себя (время реакции);
// - зубы острые или мерцают — цель не ближе края зуба + ползоны + 4 %; тупые — едет как обычно;
// - кемпер (camp): за рыбой не гоняется — держит зону у дна (1) или у верха (−1) и подматывает, чтобы леска не провисла.
// Без способности в манере — ход бота бит в бит как playReel из test/fishbot.ts (тот же генератор и порядок решений).
import { REEL_BAR, abilityView, reelStart, reelStep, type Reel, type ReelStyle } from '../../shared/fishreel.ts';
import { makeRng } from '../../shared/math.ts';
import type { Play, Skill } from '../../test/fishbot.ts';
import { TAUT_TICKS } from '../../shared/fishreel.ts';

export interface Play2 extends Play {
  /** Сработала ли способность (дошла до действия) */
  fired: boolean;
  /** Ловля после срабатывания (тики от начала действия до итога) */
  after: number;
  /** Мини-шкала: сколько тиков ушло на мелких рыб; сколько поймано */
  minionTicks: number;
  minions: number;
  /** Улов в момент срабатывания и в конце действия, доли */
  pAt: number;
  pEnd: number;
}

export interface Opts2 {
  /** Кемпер: 1 — держит зону у дна, −1 — у верха; 0 — играет */
  camp?: number;
  /** Игрок не видит чернил (читер или «как будто без способности») */
  seeThroughInk?: boolean;
}

/** Сыграть одно вываживание по новым правилам: способности, мини-шкала, чернила. */
export function playReel2(style: ReelStyle, seed: number, skill: Skill, rngSeed = seed ^ 0x5bd1e995, drunk = false, o: Opts2 = {}): Play2 {
  const r = reelStart(style, seed, drunk);
  const me = makeRng(rngSeed);
  const hist: number[] = [];
  // своя зона: обычно игрок чувствует её сразу (привычка); под ветром привычка врёт — видит глазами, с реакцией
  const zh: number[] = [];
  const zvh: number[] = [];
  let mhist: number[] = [];
  let lastMinion = -1;
  const toggles: number[] = [];
  let held = false;
  let away = 0;
  let tautTap = skill.tautTap;
  let lastSeen = r.f;
  let fired = false;
  let firedAt = 0;
  let minionTicks = 0;
  let pAt = 0;
  let pEnd = 0;
  // крепкая леска (уровень): «обычный» ждёт надпись — она позже на столько же; «опытный» подматывает заранее, как всегда
  const longer = r.c.slack - TAUT_TICKS;
  const slackTap = skill.slackTap > TAUT_TICKS ? skill.slackTap + longer : skill.slackTap;
  if (tautTap > TAUT_TICKS) tautTap += longer;
  while (r.done === 0) {
    if (r.taut > r.c.slack) tautTap = skill.tautLearn;
    const v = abilityView(r);
    if (v && v.phase === 2 && !fired) {
      fired = true;
      firedAt = r.t;
      pAt = r.p;
    }
    if (fired && v && v.phase === 3 && pEnd === 0) pEnd = r.p;
    const mini = v?.minion ?? null;
    if (mini && r.ab) {
      if (r.ab.n !== lastMinion) {
        lastMinion = r.ab.n;
        mhist = [];
      }
      mhist.push(r.ab.sub!.f);
      minionTicks++;
    }
    // глаз: что видно на главной шкале (под чернилами рыбы нет — запоминаем, где видели)
    const inkTop = v && v.id === 'ink' && !o.seeThroughInk ? v.ink : 0;
    const span = r.hi - r.lo;
    const fy = (r.f - r.lo) / span;
    const inWall = !!v && v.wall.length > 0 && !o.seeThroughInk && fy >= v.wall[0] && fy <= v.wall[1];
    let pale = false;
    if (v && v.fog.length && !o.seeThroughInk) for (let k = 0; k < v.fog.length; k += 2) if (fy >= v.fog[k] && fy <= v.fog[k + 1]) pale = true;
    const visible = (inkTop <= 0 || r.f > r.lo + inkTop * span) && !inWall;
    if (visible) lastSeen = r.f;
    hist.push(visible ? r.f : lastSeen);
    zh.push(r.z);
    zvh.push(r.zv);
    if (away > 0) away--;
    else if (me() * skill.lapseEvery < 1) away = Math.round(skill.lapse * (0.5 + me()));
    else if (r.t % skill.period === 0) {
      let h: boolean;
      if (o.camp) {
        // кемпер: зона прижата к своему краю (накрывает его); у дна подматывает, у верха — отпускает
        const want = o.camp > 0 ? r.lo + r.zone / 2 : r.hi - r.zone / 2;
        const c = r.z + r.zone / 2;
        h = c < want ? r.zv < 300 : r.zv < -300;
        if (r.rest >= slackTap) h = true;
        if (r.taut >= tautTap) h = false;
      } else if (mini && r.ab?.sub) {
        const sub = r.ab.sub;
        const d = skill.delay + Math.round((me() * 2 - 1) * skill.jitter);
        const i = Math.max(0, mhist.length - 1 - d);
        const j = Math.max(0, i - 4);
        const vel = (mhist[i] - mhist[j]) / Math.max(1, i - j);
        const seen = mhist[i] + vel * skill.lead + (me() * 2 - 1) * skill.noise;
        const err = Math.min(REEL_BAR, Math.max(0, seen)) - (sub.z + sub.zone / 2);
        const want = Math.max(-skill.vmax, Math.min(skill.vmax, err / skill.k));
        h = sub.zv < want;
      } else {
        const d = skill.delay + Math.round((me() * 2 - 1) * skill.jitter);
        const i = Math.max(0, hist.length - 1 - d);
        const j = Math.max(0, i - 4);
        const blind = !visible;
        const vel = blind ? 0 : (hist[i] - hist[j]) / Math.max(1, i - j);
        const seen = hist[i] + vel * skill.lead + (me() * 2 - 1) * skill.noise * (pale ? 1.5 : 1);
        // под ветром своя зона — как её видно с реакцией (где была d тиков назад)
        const windy = r.wind !== 0 || (!!v && v.struckAt >= 0 && r.t - v.struckAt <= skill.delay);
        const zi = windy ? Math.max(0, zh.length - 1 - d) : zh.length - 1;
        const myZ = zh[zi];
        const myV = zvh[zi];
        let aim = Math.min(r.hi, Math.max(r.lo, seen));
        // зубы: цель — не ближе края зуба + ползоны + запас (за рыбой в зубы не идёт)
        if (v && v.teeth.length && v.toothState > 0) {
          const gap = span * 0.04;
          const mid = r.z + r.zone / 2;
          for (let t = 0; t < v.teeth.length; t += 2) {
            const a = r.lo + v.teeth[t] * span;
            const b = r.lo + v.teeth[t + 1] * span;
            if (mid >= (a + b) / 2) aim = Math.max(aim, b + r.zone / 2 + gap);
            else aim = Math.min(aim, a - r.zone / 2 - gap);
          }
        }
        let err = aim - (myZ + r.zone / 2);
        // вслепую: катушка трещит — держать зону, где есть
        if (blind && r.inZone) err = 0;
        let want = Math.max(-skill.vmax, Math.min(skill.vmax, err / skill.k));
        // зубы: видит заранее — не едет на них
        if (v && v.teeth.length && v.toothState > 0) {
          const ahead = r.z + r.zv * 20;
          for (let t = 0; t < v.teeth.length; t += 2) {
            const a = r.lo + v.teeth[t] * span;
            const b = r.lo + v.teeth[t + 1] * span;
            if (ahead < b && ahead + r.zone > a) want = r.z + r.zone / 2 < (a + b) / 2 ? -skill.vmax : skill.vmax;
          }
        }
        h = (myV < want || r.rest >= slackTap) && r.taut < tautTap;
      }
      if (h !== held) {
        held = h;
        toggles.push(r.t);
      }
    }
    reelStep(r, held);
  }
  if (fired && pEnd === 0) pEnd = r.p;
  return {
    caught: r.done === 1, err: r.err, ticks: r.t, toggles, fired, after: fired ? r.t - firedAt : 0, minionTicks, minions: r.ab?.id === 'herring' ? r.ab.n : 0,
    pAt: pAt / 40_000, pEnd: pEnd / 40_000,
  };
}

export interface Stats2 {
  p: number;
  /** Средняя длина боя (поймал), с */
  caughtS: number;
  /** Доля боёв, где способность сработала */
  fired: number;
  /** Поймал / сработала: успех после способности */
  pAfter: number;
  /** Мини-шкала: средняя длина на бой (с), пойманных селёдок в среднем */
  minionS: number;
  minions: number;
  /** Средний улов до и после способности */
  pAt: number;
  pEnd: number;
  /** Сколько длилось после срабатывания до итога (с) */
  afterS: number;
}

/** Статистика по n сидам (те же, что у reelStats в test/fishbot.ts) */
export function stats2(style: ReelStyle, skill: Skill, n: number, seed0 = 1, o: Opts2 = {}, drunk = false): Stats2 {
  let caught = 0, ct = 0, fired = 0, caughtAfter = 0, mt = 0, mn = 0, pa = 0, pe = 0, af = 0;
  for (let i = 0; i < n; i++) {
    const seed = (seed0 + i * 2654435761) | 0;
    const x = playReel2(style, seed, skill, seed ^ 0x5bd1e995, drunk, o);
    if (x.caught) { caught++; ct += x.ticks; }
    if (x.fired) {
      fired++;
      if (x.caught) caughtAfter++;
      mt += x.minionTicks;
      mn += x.minions;
      pa += x.pAt;
      pe += x.pEnd;
      af += x.after;
    }
  }
  return {
    p: caught / n, caughtS: caught ? ct / caught / 60 : 0, fired: fired / n, pAfter: fired ? caughtAfter / fired : 0,
    minionS: fired ? mt / fired / 60 : 0, minions: fired ? mn / fired : 0, pAt: fired ? pa / fired : 0, pEnd: fired ? pe / fired : 0, afterS: fired ? af / fired / 60 : 0,
  };
}

export type { Reel };
