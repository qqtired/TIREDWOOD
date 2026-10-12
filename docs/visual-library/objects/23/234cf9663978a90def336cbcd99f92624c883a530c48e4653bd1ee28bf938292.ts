// Погода у клиента: сервер прислал событие дождя ({el, dur, seed, k}) — здесь его сила по времени (shared/weather.ts),
// шторм маяка поверх (его силу ставит Storm3D), плавные переходы и молнии по расписанию. Без three.js: картинку
// рисуют world.ts (небо, свет, туман), rain.ts (капли, лужи) и skyfx.ts (молнии, радуга).
import { TICK_RATE } from '../../shared/constants.ts';
import { emptySample, rainAt, rainEvent, rainPlan, rainStrikes, stormSample, type RainEvent, type RainPlan, type RainWire, type Strike } from '../../shared/weather.ts';

/** Не быстрее стольких долей в секунду: тучи собираются и расходятся, дождь, сумрак и ветер */
const RATE = { overcastUp: 1 / 6, overcastDown: 1 / 22, rainUp: 1 / 3, rainDown: 1 / 5, dark: 1 / 2, wind: 1 / 3, thunder: 1 / 2 };
/** Мокнет за столько секунд, сохнет за столько */
const WET_IN = 30;
const WET_OUT = 80;
/** Радуга после дождя (если по плану): через сколько секунд после конца и сколько стоит */
const RAINBOW_AFTER = 7;
const RAINBOW_HOLD = 45;
/** Молния, которую проспали (вкладка спала), — не догоняем */
const STALE = 1.5;

function toward(v: number, target: number, up: number, down: number, dt: number): number {
  return v < target ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt);
}

export class WeatherState {
  /** Идёт ли дождь (так сказал сервер) */
  on = false;
  /** Сглаженное (0…1): тучи, сила дождя, сумрак сверх обычного дождя, ветер, гроза, мокрая плитка */
  overcast = 0;
  rain = 0;
  dark = 0;
  wind = 0;
  thunder = 0;
  wet = 0;
  /** Шторм маяка поверх погоды: сила (0…1), есть ли свет в городе, радуга после него */
  storm = 0;
  lampsOn = true;
  stormRainbow = false;
  private ev: RainEvent | null = null;
  private plan: RainPlan | null = null;
  /** Начало события по часам клиента, с */
  private t0 = 0;
  private strikes: Strike[] = [];
  private next = 0;
  private rainbowAt = -Infinity;
  private readonly a = emptySample();
  private readonly b = emptySample();

  /** Погода от сервера; now — часы клиента (с). instant — только вошли: сразу, без перехода. */
  set(on: boolean, instant: boolean, wx: RainWire | null | undefined, now: number): void {
    const was = this.on;
    this.on = on;
    if (on) {
      // старый сервер без события — ровный дождь без конца
      const w: RainWire = wx ?? { el: 0, dur: 0, seed: 1, k: 0 };
      const ev = rainEvent(w);
      const same = this.ev !== null && this.ev.seed === ev.seed && this.ev.k === ev.k && this.ev.dur === ev.dur;
      if (!same || !wx) {
        this.ev = ev;
        this.plan = rainPlan(ev);
        this.strikes = rainStrikes(ev, this.plan);
      }
      this.t0 = now - Math.max(0, w.el) / TICK_RATE;
      const t = now - this.t0;
      this.next = 0;
      while (this.next < this.strikes.length && this.strikes[this.next].t <= t) this.next++;
      this.rainbowAt = -Infinity;
    } else {
      if (was && !instant && this.plan?.rainbow) this.rainbowAt = now + RAINBOW_AFTER;
      this.ev = this.plan = null;
      this.strikes = [];
      this.next = 0;
    }
    if (instant) {
      this.target(now);
      const s = this.a;
      this.overcast = s.overcast;
      this.rain = s.rain;
      this.dark = s.dark;
      this.wind = s.wind;
      this.thunder = s.thunder;
      this.wet = on && s.rain > 0.12 ? 1 : 0;
    }
  }

  /** Куда идти сейчас (без сглаживания): дождь по плану и шторм поверх */
  private target(now: number): void {
    const s = this.a;
    if (this.on && this.ev && this.plan) rainAt(this.ev, this.plan, Math.min(now - this.t0, this.plan.dur), s);
    else s.rain = s.overcast = s.dark = s.wind = s.thunder = 0;
    if (this.storm > 0) {
      const b = stormSample(this.storm, this.b);
      s.rain = Math.max(s.rain, b.rain);
      s.overcast = Math.max(s.overcast, b.overcast);
      s.dark = Math.max(s.dark, b.dark);
      s.wind = Math.max(s.wind, b.wind);
      s.thunder = Math.max(s.thunder, b.thunder);
    }
  }

  /** Кадр: всё плавно к цели; молнии, чьё время пришло, — в fire. true — погода заметно сменилась. */
  step(dt: number, now: number, fire: (s: Strike) => void): boolean {
    this.target(now);
    const s = this.a;
    const prev = this.overcast + this.rain + this.dark + this.wind + this.wet;
    this.overcast = toward(this.overcast, s.overcast, RATE.overcastUp, RATE.overcastDown, dt);
    this.rain = toward(this.rain, s.rain, RATE.rainUp, RATE.rainDown, dt);
    this.dark = toward(this.dark, s.dark, RATE.dark, RATE.dark, dt);
    this.wind = toward(this.wind, s.wind, RATE.wind, RATE.wind, dt);
    this.thunder = toward(this.thunder, s.thunder, RATE.thunder, RATE.thunder, dt);
    const wetting = this.rain > 0.12;
    this.wet = toward(this.wet, wetting ? 1 : 0, 1 / WET_IN, 1 / WET_OUT, dt);
    if (this.on && this.ev) {
      const t = now - this.t0;
      while (this.next < this.strikes.length && this.strikes[this.next].t <= t) {
        const st = this.strikes[this.next++];
        if (t - st.t < STALE) fire(st);
      }
    }
    return Math.abs(this.overcast + this.rain + this.dark + this.wind + this.wet - prev) > 1e-4;
  }

  /** Насколько видна радуга сейчас (0…1): после шторма — сразу, после дождя — когда выйдет солнце. */
  rainbow(now: number): number {
    if (this.stormRainbow) return 1;
    if (now < this.rainbowAt || now > this.rainbowAt + RAINBOW_HOLD) return 0;
    return Math.max(0, Math.min(1, 1.4 * (1 - this.overcast) - 0.3));
  }

  /** Расписание молний на within секунд вперёд: in — через сколько секунд (для других модулей, например баркаса). */
  upcoming(now: number, within: number): Array<Strike & { in: number }> {
    if (!this.on || !this.ev) return [];
    const t = now - this.t0;
    const out: Array<Strike & { in: number }> = [];
    for (let i = this.next; i < this.strikes.length && this.strikes[i].t <= t + within; i++) out.push({ ...this.strikes[i], in: this.strikes[i].t - t });
    return out;
  }

  /** Для отладки (__opus.state): коротко */
  debug(): Record<string, unknown> {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      on: this.on, overcast: r(this.overcast), rain: r(this.rain), dark: r(this.dark), wind: r(this.wind), wet: r(this.wet), storm: r(this.storm),
      plan: this.plan && { dur: this.plan.dur, storm: this.plan.storm, rainbow: this.plan.rainbow }, strikes: this.strikes.length, next: this.next,
    };
  }
}
