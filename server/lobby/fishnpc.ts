// Дед Семён у пристани и Саня на баркасе (fisheco): один разговор на двоих — задания, лавка (рюкзаки, блёсны, пиво, эль,
// водка, бубен дождя) и продажа улова из рюкзака. Сервер проверяет близость к тому, с кем говоришь, цену, уровень рыбалки и
// готовность задания. Чужие действия (перевоз Сани — модуль баркаса) подключаются через register, не трогая этот файл.
import { FISH_NPC_USE, FISH_NPCS, type FishNpcId } from '../../shared/fishplaces.ts';
import { ALE_PRICE, BEER_PRICE, RAIN_DRUM_PRICE, VODKA_PRICE, questNeed } from '../../shared/fishprogress.ts';
import { BAGS, LURES, VODKA } from '../../shared/fishshop.ts';
import { FISH_NPC_ACTIONS, type FishNpcAction, type ServerMsg } from '../../shared/messages.ts';
import type { Profiles } from '../profiles.ts';
import type { Profile } from '../store.ts';

/** Кто говорит: куда ответить, профиль, где стоит, ключ для лимита частоты */
export interface NpcWho {
  key: string;
  profile: Profile;
  x: number;
  y: number;
  z: number;
  send(msg: ServerMsg): void;
}

/** Что нужно от комнаты */
export interface FishNpcHost {
  now(): number;
  /** Лимит частоты: true — можно */
  limit(key: string): boolean;
  /** Жетоны и профиль поменялись: показать игроку, доске почёта */
  changed(who: NpcWho): void;
  /** Бубен дождя: 'busy' — идёт большое событие, 'on' — дождь уже идёт, 'off' — можно звать */
  rainState(): 'busy' | 'on' | 'off';
  startRain(): void;
}

export interface NpcCtx {
  npc: FishNpcId;
  who: NpcWho;
  prof: Profile;
  /** Сообщение игрока как есть: поля проверяет обработчик */
  msg: Readonly<Record<string, unknown>>;
}

/** Ответ обработчика: текст для окна (и закрыть ли окно), ничего — просто обновить окно */
export type NpcResult = string | { message?: string; open?: boolean } | void;
export type NpcHandler = (ctx: NpcCtx) => NpcResult;

const SAY: Record<FishNpcId, string> = {
  semyon: 'Подойди к Деду Семёну на пристани', sanya: 'Подойди к Сане на баркасе', ignat: 'Подойди к смотрителю Игнату на крыльце',
};

export class FishNpc {
  private readonly host: FishNpcHost;
  private readonly profiles: Profiles;
  private readonly extra = new Map<FishNpcAction, NpcHandler>();

  constructor(host: FishNpcHost, profiles: Profiles) {
    this.host = host;
    this.profiles = profiles;
  }

  /** Своё действие в разговоре (например, перевоз Сани): обработчик вызывается после проверки близости и лимита. */
  register(action: FishNpcAction, handler: NpcHandler): void {
    this.extra.set(action, handler);
  }

  /** Стоит ли игрок у этого рыбака (у Сани — только если баркас есть на карте) */
  near(npc: FishNpcId, x: number, y: number, z: number): boolean {
    const u = FISH_NPC_USE[npc];
    return !!u && Math.hypot(x - u.x, z - u.z) <= u.r + .5 && Math.abs(y - u.y) < 2;
  }

  /** Окно разговора: обновить или открыть с сообщением */
  reply(who: NpcWho, npc: FishNpcId, message?: string, open = true, sold?: { n: number; coins: number }): void {
    who.send({
      t: 'fishNpc', npc, progress: { ...who.profile.fishing, bag: who.profile.fishing.bag.map((f) => ({ ...f })) }, now: this.host.now(), open,
      ...(message ? { message } : {}), ...(sold ? { sold } : {}),
    });
  }

  handle(who: NpcWho, msg: Readonly<Record<string, unknown>>): void {
    const prof = who.profile;
    const npc: FishNpcId = typeof msg.npc === 'string' && (FISH_NPCS as readonly string[]).includes(msg.npc) ? msg.npc as FishNpcId : 'semyon';
    const action = FISH_NPC_ACTIONS.find((a) => a === msg.a);
    this.profiles.refreshFishing(prof);
    const near = this.near(npc, who.x, who.y, who.z);
    if (!this.host.limit(who.key)) {
      this.reply(who, npc, 'Подожди секунду', near);
      return;
    }
    if (!near) {
      this.reply(who, npc, SAY[npc], false);
      return;
    }
    if (!action) {
      this.reply(who, npc, 'Выбери задание, товар или рыбу');
      return;
    }
    const custom = this.extra.get(action);
    if (custom) {
      const r = custom({ npc, who, prof, msg });
      this.host.changed(who);
      if (typeof r === 'string') this.reply(who, npc, r);
      else this.reply(who, npc, r?.message, r?.open ?? true);
      return;
    }
    // у Игната на острове в лавке только напитки (и «На большую землю»): снасти и бубен дождя — у Семёна и Сани
    if (npc === 'ignat' && (action === 'buy' || action === 'rain')) {
      this.reply(who, npc, action === 'rain' ? 'Бубен дождя — у Семёна на пристани' : 'Снасти — у Семёна и Сани, у меня только напитки');
      return;
    }
    let message: string | undefined;
    let sold: { n: number; coins: number } | undefined;
    switch (action) {
      case 'open':
        this.reply(who, npc);
        return;
      case 'beer': {
        const r = this.profiles.buyFishBeer(prof);
        message = r === 'ok' ? 'Рыбацкое пиво действует 10 минут' : r === 'active' ? 'Пиво уже действует — дождись окончания'
          : r === 'ale' ? 'Эль крепче пива — пиво поверх эля не наливаю'
          : r === 'lord' ? 'Пиво подводного владыки крепче — поверх него не наливаю' : `Пиво стоит ${BEER_PRICE} жетонов`;
        break;
      }
      case 'ale': {
        const r = this.profiles.buyFishAle(prof);
        message = r === 'ok' ? 'Рыбацкий эль действует 10 минут' : r === 'active' ? 'Эль уже действует — дождись окончания'
          : r === 'lord' ? 'Пиво подводного владыки крепче — поверх него не наливаю' : `Эль стоит ${ALE_PRICE} жетонов`;
        break;
      }
      case 'vodka': {
        const r = this.profiles.buyFishVodka(prof);
        message = r === 'ok' ? `Водка рыбацкая действует 10 минут: зона на ${Math.round((1 - (VODKA.zone ?? 1)) * 100)} % меньше, рыба дёргает быстрее — зато эпик, легенды, мифик и царь морей клюют вдвое чаще`
          : r === 'active' ? 'Водка уже действует — дождись окончания' : `Водка стоит ${VODKA_PRICE} жетонов`;
        break;
      }
      case 'rain': {
        const state = this.host.rainState();
        if (state === 'busy') message = 'Сейчас идёт большое событие. Бубен дождя — после его окончания.';
        else if (state === 'on') message = 'Дождь уже идёт';
        else if (!this.profiles.spend(prof, RAIN_DRUM_PRICE)) message = `Бубен дождя стоит ${RAIN_DRUM_PRICE} жетонов`;
        else {
          this.host.startRain();
          message = 'Пошёл дождь — виды дождя, редкие и выше, вместе с царём морей, клюют в полтора раза чаще!';
        }
        break;
      }
      case 'claim': {
        const r = this.profiles.claimFishQuest(prof);
        message = r.ok ? `Задание выполнено: +${r.reward} жетонов` : `Для задания поймай ${questNeed(prof.fishing.questsDone)} рыб`;
        break;
      }
      case 'rod':
        message = this.profiles.equipFishRod(prof, msg.rod) ? 'Удочка выбрана' : 'Эта удочка ещё не заработана';
        break;
      case 'buy': {
        const r = this.profiles.buyFishGear(prof, msg.item);
        if (!r) message = 'Такого в лавке нет';
        else {
          const lvl = [...BAGS, ...LURES].find((g) => g.name === r.name)?.level ?? 0;
          // рюкзак — «твой», блесна — «твоя»
          const yours = LURES.some((g) => g.name === r.name) ? 'твоя' : 'твой';
          message = r.state === 'ok' ? `${r.name} — ${yours}!` : r.state === 'owned' ? `${r.name} уже есть` : r.state === 'better' ? 'У тебя уже есть лучше'
            : r.state === 'level' ? `${r.name} — с ${lvl}-го уровня рыбалки` : 'Не хватает жетонов';
        }
        break;
      }
      case 'sell':
      case 'sellAll': {
        if (action === 'sell' && !Number.isSafeInteger(msg.n)) { message = 'Выбери рыбу'; break; }
        sold = this.profiles.sellFish(prof, action === 'sell' ? msg.n as number : undefined);
        message = sold.n === 0 ? (prof.fishing.bag.length ? 'Этой рыбы уже нет в рюкзаке' : 'Рюкзак пуст')
          : sold.n === 1 && action === 'sell' ? `Продано: +${sold.coins} 🪙` : `Продано рыб: ${sold.n}, +${sold.coins} 🪙`;
        break;
      }
      default:
        this.reply(who, npc, 'Здесь так нельзя');
        return;
    }
    this.host.changed(who);
    this.reply(who, npc, message, true, sold);
  }

  /** Отпустить рыбу из рюкзака — где угодно */
  release(who: NpcWho, n: unknown): void {
    const prof = who.profile;
    if (!this.host.limit(who.key)) return;
    const ok = this.profiles.releaseFish(prof, n);
    who.send({ t: 'fishProgress', progress: { ...prof.fishing, bag: prof.fishing.bag.map((f) => ({ ...f })) }, now: this.host.now() });
    if (ok) this.host.changed(who);
  }
}
