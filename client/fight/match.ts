// Бой «Fight Club» у клиента. Своё движение и замах — предсказание (FightPredictor: тот же stepFighter, что на сервере),
// остальные — по снимкам с интерполяцией на часах отрисовки; события сервера (удары, блоки, уклоны, захваты, броски,
// нокауты, толпа, эмоции) — брызги желе, звук и короткий визуальный акцент, толпа ревёт. Боец смотрит из глаз,
// крупные кулаки рисуются отдельно; углы взгляда берутся из свежего ввода без сглаживания.
// (зрителю — из первого ряда толпы, в итогах — облёт ринга). Фазы раунда, метки смены бобины, гаснущий свет,
// кадр-вспышка, итоги и жетоны (их решает сервер).
import * as THREE from 'three';
import { TICK_MS, TICK_RATE } from '../../shared/constants.ts';
import {
  FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2, FA_NONE, FC_FLASH_EVERY, FC_HP, FC_MODE_NAME, FC_ST_MAX, FP_END, FP_FIGHT,
  FP_INTRO, FP_PAUSE, HIT_BLOCK, HIT_BREAK, MOVES, type FcEvent, type FcMode, type FcResultRow, type FcReward, type FcRosterRow,
} from '../../shared/fight.ts';
import { FE_BLOCK, FE_FIGHTER, FE_HELD, FE_STUN, FX_HOLDING, decodeFightTail, makeFightTail } from '../../shared/fightnet.ts';
import { BTN_BLOCK, GATE_FIGHT, GATE_FROZEN, GATE_WALK, makeFighter, striking, type FightEvents, type Fighter } from '../../shared/fightsim.ts';
import { ACT_DANCE, ACT_LAUGH, ACT_NONE, ACT_TIRED, ACT_WAVE } from '../../shared/lobby.ts';
import { clamp, damp } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { PALETTE } from '../../shared/outfit.ts';
import { E_ALIVE, E_DASH, E_GROUNDED, SNAP_HAS_SELF, SNAP_SELF_RESET, decodeSnapshot, encodeInputs, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { BTN_ADS, BTN_FIRE, BTN_USE, copyState, makeInput, makeState, type Input, type PlayerState } from '../../shared/sim.ts';
import type { Sound } from '../audio.ts';
import type { Chat } from '../chat.ts';
import type { Input as InputDevice } from '../input.ts';
import { ClockSync, type Net } from '../net.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { narrowFov } from '../render/renderer.ts';
import type { MeState } from '../scene.ts';
import type { Settings } from '../settings.ts';
import { TOUCH } from '../touch.ts';
import type { FightArena } from './arena.ts';
import type { Grade } from './grade.ts';
import type { FightHud, FoeView } from './hud.ts';
import { FightPredictor } from './predict.ts';
import type { FightSfx } from './sfx.ts';
import { FightFists } from './fists.ts';
import { handsFor } from './hands.ts';
import { assistedFightYaw, fightAvatarVisible, sampleFighterEye, type FighterEye } from './presentation.ts';

export interface FightDeps {
  arena: FightArena;
  hud: FightHud;
  grade: Grade;
  sfx: FightSfx;
  effects: Effects;
  sound: Sound;
  input: InputDevice;
  settings: Settings;
  net: Net;
  chat: Chat;
  renderer: THREE.WebGLRenderer;
  me: () => MeState;
}

type V3 = [number, number, number];

/** Что было в хвосте снимка у игрока: действие и его тик (для анимации — на часах отрисовки) */
interface ActRec {
  tick: number;
  act: number;
  actT: number;
  xf: number;
}

interface View {
  id: number;
  avatar: Avatar;
  pose: AvatarPose & { valid: boolean };
  /** Последние флаги из снимка (с FE_*), здоровье, выносливость 0…1 */
  flags: number;
  hp: number;
  st: number;
  acts: ActRec[];
  actHead: number;
  /** Что показываем сейчас (для звука замаха) */
  shownAct: number;
  /** Растёкся лужицей: 0…1 */
  koK: number;
  emoteUntil: number;
  readonly hands: number[];
}

/** Эмоции зрителя (1–6): 1–4 — как на набережной, 5–6 — значки над головой (👏 😡) */
const EMOTE_ACTS = [ACT_NONE, ACT_WAVE, ACT_DANCE, ACT_TIRED, ACT_LAUGH];
const EMOTE_GAP_MS = 600;
/** Помощь пальцу только в узком секторе; доворот ограничен по скорости, мышь полностью свободна. */
const ASSIST_R = 2.3;
const ASSIST_COS = Math.cos((45 * Math.PI) / 180);

const _v = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };

export class FightMatch {
  private readonly d: FightDeps;
  private readonly clock = new ClockSync(1.6);
  private readonly predictor: FightPredictor;
  private readonly fists = new FightFists();
  private readonly eye: FighterEye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly header = makeHeader();
  private readonly selfSnap: PlayerState = makeState();
  private readonly ents: EntitySnap[] = [];
  private readonly tail = makeFightTail();
  private readonly serverF: Fighter = makeFighter();
  private readonly tracks = new Map<number, RemoteTrack>();
  private readonly views = new Map<number, View>();
  private readonly roster = new Map<number, FcRosterRow>();
  private readonly inputs: Input[] = [makeInput()];
  private readonly seen = new Set<number>();
  private readonly pending: Array<{ k: number; e: FcEvent }> = [];

  myId = 0;
  mode: FcMode = 'duel';
  ringR = 5;
  ready = false;
  phase = FP_INTRO;
  phaseEnd = 0;
  round = 0;
  readonly wins = [0, 0];
  /** Тик начала боя в этом раунде (0 — не знаем) */
  private fightStart = 0;
  private selfActive = false;
  private readonly zone = { r: 5, stage: 0, warn: false };

  // ввод
  private seq = 0;
  private acc = 0;
  private queueAvg = 1;
  private blockHeld = false;
  private blockLatch = false;
  private prevButtons = 0;
  private emoteAt = 0;

  // камера и «сок»
  private readonly camPos = new THREE.Vector3(0, 3, 6);
  private readonly camQuat = new THREE.Quaternion();
  private camInit = false;
  private curFov = 60;
  private shake = 0;
  private fovKick = 0;
  /** Своя желейка смотрела куда (плавно, если оглушён) */
  private spectatorYawSet = false;

  // события раунда
  private reelShown = 0;
  private flashAt = -1;
  private flashDone = false;
  private reward: FcReward | null = null;
  private resultsShown = false;
  private wasHeld = false;
  private time = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lastFrameMs = 0;
  private stepDist = 0;
  private readonly onBlur = (): void => {
    this.blockHeld = false;
  };

  constructor(deps: FightDeps) {
    this.d = deps;
    this.predictor = new FightPredictor(deps.arena.world);
    deps.input.scopeSens = 1 / Math.max(0.05, deps.input.adsSens * 0.8);
    deps.arena.onPop = (x, y, z) => {
      deps.sfx.pop([x, y, z]);
      deps.effects.burst(x, y, z, 0xffe6a0, 14, 3, 0, -0.6, 0, 0.018);
      deps.effects.puff(x, y, z, 0.6, 0xfff2c8, 0.25, 0, 0.8, 2.2);
    };
    deps.arena.onDrip = (x, y, z) => deps.sfx.drip([x, y, z]);
    deps.hud.onEmote = (k) => this.sendEmote(k);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('blur', this.onBlur);
    for (const v of this.views.values()) v.avatar.dispose(this.d.arena.scene);
    this.views.clear();
    this.tracks.clear();
    this.fists.dispose();
    this.d.input.scopeSens = 1;
    this.d.hud.hideResults();
    this.d.grade.flash = this.d.grade.fade = this.d.grade.desat = 0;
  }

  get spectator(): boolean {
    return !this.selfActive;
  }

  get resultsUp(): boolean {
    return this.resultsShown;
  }

  // ------------------------------------------------------------ клавиши

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const { chat, input } = this.d;
    if (code === 'KeyQ' || code === 'KeyF') {
      if (e.repeat) return false;
      this.blockHeld = down && !chat.isOpen;
      if (down && !input.blocked) this.blockLatch = true;
      return false;
    }
    if (!down || chat.isOpen || !input.locked) return false;
    if (code === 'Slash') {
      e.preventDefault();
      chat.open('/');
      return true;
    }
    const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code);
    if (k >= 0) {
      this.sendEmote(k + 1);
      return true;
    }
    return false;
  }

  private sendEmote(k: number): void {
    const now = performance.now();
    if (now - this.emoteAt < EMOTE_GAP_MS) return;
    // бойцу посреди раунда не до эмоций (сервер всё равно не пропустит)
    if (this.selfActive && this.phase === FP_FIGHT && !this.predictor.f.ko) return;
    this.emoteAt = now;
    this.d.net.send({ t: 'emote', e: k });
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(m: ServerMsg): void {
    switch (m.t) {
      case 'fcInit':
        this.onInit(m.id, m.mode, m.ring, m.phase, m.phaseEnd, m.round, m.wins, m.roster);
        break;
      case 'fcRoster':
        this.setRoster(m.roster);
        break;
      case 'fcEv':
        for (const e of m.e) this.pending.push({ k: m.k, e });
        break;
      case 'fcPhase':
        this.onPhase(m.phase, m.phaseEnd, m.round, m.wins, m.win);
        break;
      case 'fcReward':
        this.reward = { total: m.total, fight: m.fight, win: m.win, kos: m.kos, place: m.place };
        break;
      case 'fcEnd':
        this.onEnd(m.mode, m.rows);
        break;
    }
  }

  private onInit(id: number, mode: FcMode, ring: number, phase: number, phaseEnd: number, round: number, wins: number[], roster: FcRosterRow[]): void {
    this.myId = id;
    this.mode = mode;
    this.ringR = ring;
    this.predictor.ringR = ring;
    this.d.arena.setRing(ring);
    this.phase = phase;
    this.phaseEnd = phaseEnd;
    this.round = round;
    this.wins[0] = wins[0] ?? 0;
    this.wins[1] = wins[1] ?? 0;
    this.fightStart = phase === FP_INTRO ? phaseEnd : 0;
    this.ready = true;
    this.selfActive = false;
    this.spectatorYawSet = false;
    this.reward = null;
    this.resultsShown = false;
    this.flashDone = false;
    // кадр-вспышка — примерно раз в FC_FLASH_EVERY боёв, где-то в первой минуте боя
    this.flashAt = Math.random() < 1 / FC_FLASH_EVERY ? (6 + Math.random() * 30) * TICK_RATE : -1;
    this.setRoster(roster);
    const me = this.roster.get(id);
    const { hud } = this.d;
    if (me && !me.fighter) hud.centerText('FIGHT CLUB', 'ты в толпе — бойцов хватает', 2600);
    else if (phase === FP_INTRO) hud.centerText(`РАУНД ${Math.max(1, round)}`, FC_MODE_NAME[mode], 2400);
    if (phase === FP_INTRO) this.reelShown = 0;
  }

  private setRoster(list: FcRosterRow[]): void {
    this.roster.clear();
    for (const r of list) this.roster.set(r.id, r);
    const myTeam = this.roster.get(this.myId)?.team ?? -1;
    let taken = 0;
    for (const r of list) {
      if (r.slot >= 0) taken |= 1 << r.slot;
      const v = this.views.get(r.id);
      if (v) this.applyInfo(v, r, myTeam);
    }
    this.d.arena.crowd.setTaken(taken);
  }

  private applyInfo(v: View, r: FcRosterRow, myTeam: number): void {
    const team = this.mode === 'team' && r.team >= 0 ? (r.team as 0 | 1) : null;
    v.avatar.setInfo(r.id === this.myId ? '' : r.bot ? `${r.nick}` : r.nick, team, team !== null && r.team === myTeam, r.level ?? 1);
    v.avatar.setOutfit(r.o);
  }

  private onPhase(phase: number, end: number, round: number, wins: number[], win: number): void {
    const { hud, sfx, arena, grade } = this.d;
    const was = this.phase;
    this.phase = phase;
    this.phaseEnd = end;
    this.round = round;
    this.wins[0] = wins[0] ?? 0;
    this.wins[1] = wins[1] ?? 0;
    if (phase === FP_INTRO) {
      this.reelShown = 0;
      this.fightStart = end;
      grade.desat = 0;
      for (const v of this.views.values()) v.koK = 0;
      hud.centerText(`РАУНД ${round}`, this.roundSub(), 2400);
    } else if (phase === FP_FIGHT && was !== FP_FIGHT) {
      if (was !== FP_INTRO || !this.fightStart) this.fightStart = this.clock.ready ? Math.round(this.clock.estimate(performance.now())) : 0;
      hud.centerText('БОЙ!', '', 900, 'blood');
      sfx.pipe(1);
      sfx.roar(0.45);
      arena.excite(0.7);
    } else if (phase === FP_PAUSE) {
      const myTeam = this.roster.get(this.myId)?.team ?? -1;
      if (win < 0) hud.centerText('НИЧЬЯ', 'раунд переиграют', 2600);
      else if (this.mode !== 'ffa' && win === myTeam) hud.centerText('РАУНД ТВОЙ', this.scoreLine(), 2600, 'gold');
      else hud.centerText(`РАУНД — ${this.teamName(win)}`, this.scoreLine(), 2600);
      sfx.pipe(2);
    }
  }

  private roundSub(): string {
    if (this.mode === 'ffa') return 'каждый за себя — до последнего';
    if (this.wins[0] === 1 && this.wins[1] === 1) return 'решающий';
    return `${FC_MODE_NAME[this.mode]} · до двух побед`;
  }

  private scoreLine(): string {
    return `${this.wins[0]} : ${this.wins[1]}`;
  }

  /** Сторона: в дуэли — ник бойца, в 2 на 2 — «холодные» и «тёплые» */
  private teamName(team: number): string {
    if (this.mode === 'team') return team === 0 ? 'ХОЛОДНЫМ' : 'ТЁПЛЫМ';
    for (const r of this.roster.values()) if (r.fighter && r.team === team) return r.nick;
    return '?';
  }

  private onEnd(mode: FcMode, rows: FcResultRow[]): void {
    const { hud, sfx } = this.d;
    const mine = rows.find((r) => r.id === this.myId);
    let title = 'ИТОГИ';
    if (mine && mine.place > 0) title = mine.won ? 'ПОБЕДА' : mode === 'ffa' ? `${mine.place} МЕСТО` : 'ПОРАЖЕНИЕ';
    hud.showResults(mode, rows, this.myId, mine && !mine.bot ? this.reward : null, title);
    this.resultsShown = true;
    sfx.roar(0.8);
  }

  // ------------------------------------------------------------ сеть: снимки

  onSnapshot(buf: ArrayBuffer, at: number): void {
    if (!this.ready) return;
    const n = decodeSnapshot(buf, this.header, this.selfSnap, this.ents);
    if (n < 0) return;
    const h = this.header;
    if (!decodeFightTail(buf, h.tail, this.tail, this.serverF)) return;
    this.clock.addSample(h.tick, at);
    this.queueAvg += (h.queue - this.queueAvg) * 0.05;
    this.phase = h.phase;
    this.phaseEnd = h.phaseEnd;
    this.wins[0] = h.scoreA;
    this.wins[1] = h.scoreB;
    this.round = h.pickups;
    const z = this.zone;
    z.r = this.tail.zoneR;
    z.stage = this.tail.stage;
    z.warn = this.tail.warn;
    this.d.arena.setZone(z.r, z.stage, z.warn);

    this.seen.clear();
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      const row = this.tail.rows[i];
      let tr = this.tracks.get(e.id);
      if (!tr) {
        tr = new RemoteTrack(e.id);
        this.tracks.set(e.id, tr);
      }
      const v = this.view(e.id);
      // боец ушёл в толпу (или вернулся), новый раунд — прыжок через ринг: без «проезда»
      const jump = (e.flags & FE_FIGHTER) !== (v.flags & FE_FIGHTER) || Math.hypot(e.x - tr.lastX, e.z - tr.lastZ) > 2.5;
      if (jump) tr.clear();
      tr.push(h.tick, e);
      v.flags = e.flags;
      v.hp = e.hp;
      v.st = e.armor / 100;
      if (row) {
        v.actHead = (v.actHead + 1) % v.acts.length;
        const rec = v.acts[v.actHead];
        rec.tick = h.tick;
        rec.act = row.act;
        rec.actT = row.actT;
        rec.xf = row.xf;
      }
      this.seen.add(e.id);
    }
    for (const id of [...this.tracks.keys()]) {
      if (this.seen.has(id)) continue;
      this.tracks.delete(id);
      const v = this.views.get(id);
      if (v) {
        v.avatar.dispose(this.d.arena.scene);
        this.views.delete(id);
      }
    }

    const hasSelf = (h.flags & SNAP_HAS_SELF) !== 0 && this.tail.hasSelf;
    if (hasSelf) {
      copyState(this.serverF.s, this.selfSnap);
      if ((h.flags & SNAP_SELF_RESET) !== 0 || !this.selfActive) {
        this.predictor.reset(this.serverF, h.ack);
        // Новый раунд возвращает в угол: сразу смотрим на соперника, а не в сторону из прошлого раунда.
        this.d.input.yaw = this.serverF.yaw;
        this.d.input.pitch = 0;
        this.selfActive = true;
        this.camInit = false;
      } else {
        this.predictor.reconcile(h.ack, this.serverF);
      }
    } else if (this.selfActive) {
      this.selfActive = false;
      this.spectatorYawSet = false;
      this.camInit = false;
    }
  }

  private view(id: number): View {
    let v = this.views.get(id);
    if (v) return v;
    const avatar = new Avatar(id);
    avatar.addTo(this.d.arena.scene);
    v = {
      id, avatar, pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, valid: false }, flags: 0, hp: FC_HP, st: 1,
      acts: Array.from({ length: 10 }, () => ({ tick: -1, act: 0, actT: 0, xf: 0 })), actHead: 0, shownAct: 0, koK: 0, emoteUntil: 0,
      hands: [0, 0, 0, 0, 0, 0],
    };
    this.views.set(id, v);
    const r = this.roster.get(id);
    if (r) this.applyInfo(v, r, this.roster.get(this.myId)?.team ?? -1);
    return v;
  }

  /** Действие игрока на тик t (по хвостам снимков): какое и сколько тиков оно идёт. */
  private actAt(v: View, t: number, out: { act: number; actT: number; xf: number }): void {
    let best: ActRec | null = null;
    let oldest: ActRec | null = null;
    for (const r of v.acts) {
      if (r.tick < 0) continue;
      if (!oldest || r.tick < oldest.tick) oldest = r;
      if (r.tick <= t && (!best || r.tick > best.tick)) best = r;
    }
    const rec = best ?? oldest;
    if (!rec) {
      out.act = FA_NONE;
      out.actT = 0;
      out.xf = 0;
      return;
    }
    let act = rec.act;
    let actT = rec.actT + Math.max(0, t - rec.tick);
    if (act !== FA_NONE && act !== FA_HOLD) {
      const m = MOVES[act];
      if (actT >= m.w + m.a + m.r) {
        act = FA_NONE;
        actT = 0;
      }
    }
    out.act = act;
    out.actT = actT;
    out.xf = rec.xf;
  }

  // ------------------------------------------------------------ события

  /** Разобрать события, до которых дошли часы отрисовки (свои — сразу: удар по мне или мой удар). */
  private flushEvents(): void {
    const t = this.clock.renderTick;
    let i = 0;
    while (i < this.pending.length) {
      const p = this.pending[i];
      const e = p.e;
      const mine = (e[0] === 'hit' && (e[1] === this.myId || e[2] === this.myId)) || (e[0] !== 'hit' && e[1] === this.myId) ||
        (e[0] === 'grab' && e[2] === this.myId) || (e[0] === 'throw' && e[2] === this.myId);
      if (mine || p.k <= t + 1 || p.k - t > 20) {
        this.pending.splice(i, 1);
        this.onEvent(e);
      } else {
        i++;
      }
    }
  }

  private posOf(id: number, out: V3): V3 {
    if (id === this.myId && this.selfActive) {
      const s = this.predictor.f.s;
      out[0] = s.x;
      out[1] = s.y + 0.9;
      out[2] = s.z;
      return out;
    }
    const v = this.views.get(id);
    if (v && v.pose.valid) {
      out[0] = v.pose.x;
      out[1] = v.pose.y + 0.9;
      out[2] = v.pose.z;
    }
    return out;
  }

  private nick(id: number): string {
    const r = this.roster.get(id);
    if (!r) return '?';
    return id === this.myId ? 'ты' : r.nick;
  }

  private colorOf(id: number): number {
    const r = this.roster.get(id);
    return PALETTE[r?.o.c ?? 0] ?? 0xff4d6d;
  }

  private onEvent(e: FcEvent): void {
    const { sfx, effects, arena, hud, grade } = this.d;
    const now = performance.now();
    const me = this.myId;
    const p: V3 = [0, 1, 0];
    switch (e[0]) {
      case 'hit': {
        const [, a, vId, kind, res, dmg, x, y, zz] = e;
        const heavy = kind === FA_HEAVY;
        const power = heavy ? 1 : kind === FA_HOOK ? 0.65 : 0.4;
        const involved = a === me || vId === me;
        sfx.punch(involved ? null : [x, y, zz], heavy || res === HIT_BREAK, res);
        const v = this.views.get(vId);
        const ap = this.posOf(a, [x, y, zz]);
        let dx = x - ap[0];
        let dz = zz - ap[2];
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl;
        dz /= dl;
        if (res === HIT_BLOCK) {
          effects.puff(x, y, zz, 0.35, 0xd8d0c0, 0.25, 0.2, 0.5, 1.6);
          effects.burst(x, y, zz, 0xe8e0d0, 4, 2, dx, 0.3, dz, 0.015);
        } else {
          const n = Math.round(6 + power * 16 + (res === HIT_BREAK ? 8 : 0));
          effects.burst(x, y, zz, this.colorOf(vId), n, 2.5 + power * 4, dx, 0.35, dz, 0.03 + power * 0.02);
          if (heavy || res === HIT_BREAK) effects.puff(x, y, zz, 0.6, 0xfff4e0, 0.2, 0.1, 0.45, 2.4);
        }
        v?.avatar.jolt(res === HIT_BLOCK ? 0.2 : power * 1.2);
        if (v) v.avatar.showHpUntil = now + 2600;
        // Подтверждённый удар сжимает кулак на мгновение; камера и сетевые часы продолжают идти.
        if (a === me) this.fists.impact(res === HIT_BLOCK ? 0.25 : power);
        if (vId === me) {
          this.shake = Math.min(1, this.shake + (res === HIT_BLOCK ? 0.15 : 0.3 + power * 0.45));
          if (res !== HIT_BLOCK) {
            hud.hurt(0.35 + dmg / 25);
            grade.flash = Math.max(grade.flash, heavy ? 0.28 : 0.12);
          }
        } else if (a === me) {
          this.shake = Math.min(1, this.shake + (res === HIT_BLOCK ? 0.06 : 0.12 + power * 0.15));
        }
        arena.excite(res === HIT_BLOCK ? 0.06 : power * 0.5, x, zz);
        if (res === HIT_BREAK) sfx.ooh();
        else if (heavy && res !== HIT_BLOCK) sfx.roar(0.35);
        break;
      }
      case 'dodge': {
        const [, id] = e;
        this.posOf(id, p);
        if (id !== me) sfx.dodge(p);
        effects.puff(p[0], 0.15, p[2], 0.5, 0xb8b0a0, 0.35, 0.1, 0.35, 2);
        break;
      }
      case 'whiff':
        break;
      case 'grab': {
        const [, a, vId] = e;
        this.posOf(vId, p);
        sfx.grab(a === me || vId === me ? null : p);
        arena.excite(0.25, p[0], p[2]);
        break;
      }
      case 'throw': {
        const [, a, vId] = e;
        this.posOf(vId, p);
        sfx.throwAway(a === me || vId === me ? null : p);
        sfx.roar(0.4);
        arena.excite(0.6, p[0], p[2]);
        if (vId === me) this.shake = Math.min(1, this.shake + 0.6);
        break;
      }
      case 'escape': {
        const [, vId] = e;
        this.posOf(vId, p);
        sfx.escape(p);
        break;
      }
      case 'ko': {
        const [, vId, by] = e;
        this.posOf(vId, p);
        sfx.ko(vId === me ? null : p);
        sfx.roar(1);
        arena.excite(1.1, p[0], p[2]);
        effects.burst(p[0], p[1], p[2], this.colorOf(vId), 30, 5, 0, 0.6, 0, 0.05);
        if (by) hud.feed(`${this.nick(by)} — нокаут: ${this.nick(vId)}`);
        else hud.feed(`${this.nick(vId)} — растёкся в темноте`);
        if (vId === me) {
          hud.centerText('НОКАУТ', 'полежи — потом постоишь в толпе', 2400, 'blood');
          grade.flash = 0.4;
          this.shake = 1;
        } else if (by === me) {
          hud.centerText('УЛОЖИЛ!', this.nick(vId), 1400, 'gold');
        }
        break;
      }
      case 'shove': {
        const [, id] = e;
        this.posOf(id, p);
        arena.crowd.shove(p[0], p[2]);
        sfx.shove(id === me ? null : p);
        if (id === me) this.shake = Math.min(1, this.shake + 0.3);
        break;
      }
      case 'emote': {
        const [, id, k] = e;
        const v = this.views.get(id);
        if (!v) break;
        if (k >= 1 && k <= 4) {
          v.avatar.setAction(EMOTE_ACTS[k], 0);
          v.emoteUntil = now + 2600;
        } else if (k === 5) v.avatar.react(1);
        else if (k === 6) v.avatar.react(2);
        arena.crowd.excite(0.05);
        break;
      }
    }
  }

  // ------------------------------------------------------------ ввод (60 раз в секунду)

  private tickInput(): void {
    const { input, net } = this.d;
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    let b = input.sample();
    if (!input.blocked && (this.blockHeld || this.blockLatch)) b |= BTN_BLOCK;
    this.blockLatch = false;
    const pressed = b & ~this.prevButtons;
    this.prevButtons = b;
    if (this.selfActive) this.assist((pressed & (BTN_FIRE | BTN_ADS | BTN_USE)) !== 0);
    inp.buttons = b;
    inp.yaw = Math.fround(input.yaw);
    inp.pitch = Math.fround(input.pitch);
    inp.viewTick = Math.max(0, this.clock.renderTick);
    const gate = this.gateNow();
    if (this.selfActive) this.onLocalEvents(this.predictor.step(inp, gate));
    else this.predictor.record(inp, gate);
    net.sendBinary(encodeInputs(this.inputs, 0, 1, net.epoch));
  }

  /** Что можно на сервере, когда до него дойдёт этот ввод (на стыке «вступление → бой» — по концу вступления). */
  private gateNow(): number {
    if (this.phase === FP_FIGHT) return GATE_FIGHT;
    if (this.phase === FP_INTRO) {
      const at = this.clock.estimate(performance.now()) + this.d.net.pingMs / TICK_MS + this.queueAvg;
      return this.phaseEnd > 0 && at >= this.phaseEnd ? GATE_FIGHT : GATE_FROZEN;
    }
    return GATE_WALK;
  }

  /**
   * Палец: при ударе или замахе слегка помогает удержать цель в секторе ±45°, максимум 1,2 рад/с.
   * Это только ввод; попадание по-прежнему проверяет сервер. На настольном устройстве курс не меняем.
   */
  private assist(press: boolean): void {
    const f = this.predictor.f;
    const input = this.d.input;
    if (!TOUCH || input.blocked || f.ko || f.stun > 0 || f.held) return;
    const winding = striking(f) && f.act !== FA_HOLD && f.actT < MOVES[f.act].w;
    if (!press && !winding) return;
    const s = f.s;
    const fx = -Math.sin(input.yaw);
    const fz = -Math.cos(input.yaw);
    const myTeam = this.roster.get(this.myId)?.team ?? -1;
    let best = -1;
    let bestYaw = 0;
    for (const v of this.views.values()) {
      if (v.id === this.myId || !v.pose.valid || (v.flags & FE_FIGHTER) === 0 || (v.flags & E_ALIVE) === 0) continue;
      if (this.mode === 'team' && (this.roster.get(v.id)?.team ?? -2) === myTeam) continue;
      const dx = v.pose.x - s.x;
      const dz = v.pose.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > ASSIST_R || d < 0.05) continue;
      const c = (dx * fx + dz * fz) / d;
      if (c < ASSIST_COS) continue;
      const score = c - d * 0.2;
      if (score > best) {
        best = score;
        bestYaw = Math.atan2(-dx, -dz);
      }
    }
    if (best < -0.5) return;
    input.yaw = assistedFightYaw(input.yaw, bestYaw, TOUCH, 1 / TICK_RATE);
  }

  private onLocalEvents(ev: FightEvents): void {
    const { sfx, sound, effects } = this.d;
    const f = this.predictor.f;
    if (ev.began && ev.began !== FA_GRAB) sfx.swing(null, ev.began === FA_HEAVY);
    if (ev.began === FA_GRAB) sfx.grab(null);
    if (ev.dodge) {
      sfx.dodge(null);
      this.fovKick = Math.max(this.fovKick, 6);
      effects.puff(f.s.x, 0.12, f.s.z, 0.55, 0xb8b0a0, 0.4, 0.1, 0.4, 2);
    }
    if (ev.winded) sfx.winded();
    if (ev.jumped) sound.jump();
    if (ev.landed) sfx.land(null, ev.landSpeed);
    if (f.s.grounded) {
      this.stepDist += Math.hypot(f.s.vx, f.s.vz) / TICK_RATE;
      if (this.stepDist > 1.9) {
        this.stepDist = 0;
        sound.step(null);
      }
    }
  }

  // ------------------------------------------------------------ кадр

  frame(now: number, dtRaw: number): void {
    const d = this.d;
    const dt = Math.min(0.1, dtRaw);
    this.time += dt;
    this.fpsFrames++;
    this.fpsTime += dtRaw;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.lastFrameMs = dtRaw * 1000;
    // в правой кнопке (тяжёлый удар) мышь не замедляется, как в прицеле пейнтбола
    d.input.scopeSens = 1 / Math.max(0.05, d.input.adsSens * 0.8);

    this.clock.update(now, dt * 1000);
    if (this.ready && this.clock.ready) {
      const rate = clamp(1 - (this.queueAvg - 1.2) * 0.02, 0.97, 1.03);
      this.acc += dt * 1000 * rate;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) {
        this.acc -= TICK_MS;
        this.tickInput();
        n++;
      }
      if (this.acc > TICK_MS * 4) this.acc = 0;
    }
    const alpha = clamp(this.acc / TICK_MS, 0, 1);
    this.predictor.decay(dt);
    this.flushEvents();
    this.updateViews(dt, alpha);
    this.updateCamera(dt, alpha);
    const f = this.predictor.f;
    this.fists.setColor(this.colorOf(this.myId));
    this.fists.update(f, f.actT + alpha, this.time, dt, d.arena.camera.aspect, this.selfActive && !this.resultsShown);
    this.updatePhaseFx();

    d.arena.update(dt, this.time);
    d.arena.crowd.update(dt, this.time, this.camPos);
    d.effects.update(dt);
    tickAvatarShared(this.time, d.renderer.domElement.clientHeight || window.innerHeight);
    d.sfx.update(d.arena.crowd.heat, d.arena.tubeLevel);
    const cam = d.arena.camera;
    cam.getWorldDirection(_v);
    d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z);
    this.updateHud();

    const g = d.grade;
    g.flash *= Math.exp(-dt * 9);
    const koMe = this.selfActive && this.predictor.f.ko === 1;
    g.desat = damp(g.desat, koMe ? 0.75 : 0, 3, dt);
    g.fade = damp(g.fade, 0, 4, dt);
    g.render(d.renderer, d.arena.scene, cam, this.time, this.fists.visible ? this.fists : undefined);
  }

  /** Метки смены бобины перед стартом раунда, кадр-вспышка — по часам сервера. */
  private updatePhaseFx(): void {
    if (!this.clock.ready) return;
    const est = this.clock.estimate(performance.now());
    if (this.phase === FP_INTRO && this.phaseEnd > 0) {
      const left = this.phaseEnd - est;
      if (left <= 2 * TICK_RATE && left > 1.5 * TICK_RATE && (this.reelShown & 1) === 0) {
        this.reelShown |= 1;
        this.d.hud.reel();
        this.d.sfx.reel();
      } else if (left <= TICK_RATE && left > 0.5 * TICK_RATE && (this.reelShown & 2) === 0) {
        this.reelShown |= 2;
        this.d.hud.reel();
        this.d.sfx.reel();
      }
    }
    if (this.flashAt >= 0 && !this.flashDone && this.phase === FP_FIGHT && this.fightStart > 0 && est - this.fightStart >= this.flashAt) {
      this.flashDone = true;
      this.d.grade.showFrame(2);
    }
  }

  /** Желейки: свой боец — по предсказанию, остальные — по снимкам; руки — по действию; нокаут — лужица. */
  private updateViews(dt: number, alpha: number): void {
    const { arena, sfx } = this.d;
    const t = this.clock.renderTick;
    const now = performance.now();
    const act = { act: 0, actT: 0, xf: 0 };
    for (const [id, v] of this.views) {
      const tr = this.tracks.get(id);
      const pose = v.pose;
      const local = id === this.myId && this.selfActive;
      let fighter = (v.flags & FE_FIGHTER) !== 0;
      let ko = fighter && (v.flags & E_ALIVE) === 0;
      let block = (v.flags & FE_BLOCK) !== 0;
      let stun = (v.flags & FE_STUN) !== 0;
      let held = (v.flags & FE_HELD) !== 0;
      let grounded = (v.flags & E_GROUNDED) !== 0;
      let dash = (v.flags & E_DASH) !== 0;
      if (local) {
        const f = this.predictor.f;
        const pr = this.predictor.prev;
        const o = this.predictor.offset;
        pose.x = pr.s.x + (f.s.x - pr.s.x) * alpha + o.x;
        pose.y = pr.s.y + (f.s.y - pr.s.y) * alpha + o.y;
        pose.z = pr.s.z + (f.s.z - pr.s.z) * alpha + o.z;
        pose.yaw = f.ko || f.stun > 0 || f.held ? f.yaw : this.d.input.yaw;
        pose.valid = true;
        fighter = true;
        ko = f.ko === 1;
        block = f.block === 1;
        stun = f.stun > 0;
        held = f.held !== 0;
        grounded = f.s.grounded === 1;
        dash = f.s.dashT > 0;
        act.act = f.act;
        act.actT = f.actT + alpha;
        act.xf = f.grab ? FX_HOLDING : 0;
      } else if (tr && tr.sample(t, _sample)) {
        pose.x = _sample.x;
        pose.y = _sample.y;
        pose.z = _sample.z;
        pose.yaw = _sample.yaw;
        pose.valid = true;
        this.actAt(v, t, act);
      } else {
        pose.valid = false;
      }
      pose.pitch = 0;
      pose.flags = E_ALIVE | (grounded ? E_GROUNDED : 0) | (dash ? E_DASH : 0);
      // замах у других — свист (свой — по предсказанию, в onLocalEvents)
      if (!local && act.act !== v.shownAct) {
        if ((act.act === FA_JAB || act.act === FA_JAB2 || act.act === FA_HOOK || act.act === FA_HEAVY) && pose.valid) {
          sfx.swing([pose.x, pose.y + 1, pose.z], act.act === FA_HEAVY);
        }
      }
      v.shownAct = act.act;
      // эмоция зрителя закончилась
      if (v.emoteUntil && now > v.emoteUntil) {
        v.emoteUntil = 0;
        v.avatar.setAction(ACT_NONE, 0);
      }
      const av = v.avatar;
      if (fighter && v.emoteUntil === 0) {
        handsFor(v.hands, act.act, act.actT, block, stun, held, ko, this.time + id * 0.7);
        av.hands = v.hands;
      } else {
        av.hands = null;
      }
      av.hp = local ? this.predictor.f.hp : v.hp;
      av.maxHp = FC_HP;
      av.update(pose.valid ? pose : null, dt, this.time, arena.world, this.camPos, id === this.myId);
      // Своё тело скрыто только для первого лица. Боец напротив виден даже вплотную; толпа не закрывает камеру.
      if (pose.valid && av.root.visible) {
        const cx = this.camPos.x - pose.x;
        const cz = this.camPos.z - pose.z;
        av.root.visible = fightAvatarVisible(local, fighter, this.resultsShown, cx * cx + cz * cz);
      }
      // нокаут: растекается лужицей (и обратно, когда встаёт в толпу)
      v.koK = damp(v.koK, ko ? 1 : 0, ko ? 7 : 5, dt);
      const k = v.koK;
      av.root.scale.set(1 + 0.6 * k, 1 - 0.8 * k, 1 + 0.6 * k);
    }
  }

  private updateCamera(dt: number, alpha: number): void {
    const { arena, input, settings } = this.d;
    const cam = arena.camera;
    this.shake *= Math.exp(-dt * 6);
    this.fovKick *= Math.exp(-dt * 6);
    const me = this.views.get(this.myId);
    const R = this.ringR;
    if (this.resultsShown) {
      // итоги: медленный облёт ринга
      const a = this.time * 0.12;
      _v.set(Math.sin(a) * (R + 1.2), 3.3, Math.cos(a) * (R + 1.2));
      this.camPos.lerp(_v, this.camInit ? 1 - Math.exp(-dt * 2) : 1);
      cam.position.copy(this.camPos);
      cam.lookAt(0, 0.8, 0);
      this.camInit = true;
    } else if (this.selfActive && me && me.pose.valid) {
      sampleFighterEye(this.eye, this.predictor.prev.s, this.predictor.f.s, this.predictor.offset, alpha, input.yaw, input.pitch);
      this.camPos.set(this.eye.x, this.eye.y, this.eye.z);
      const sh = this.shake * this.shake;
      cam.position.copy(this.camPos);
      cam.position.x += (Math.sin(this.time * 61) + Math.sin(this.time * 37)) * 0.018 * sh;
      cam.position.y += Math.sin(this.time * 53) * 0.018 * sh;
      cam.rotation.set(this.eye.pitch, this.eye.yaw, Math.sin(this.time * 29) * 0.012 * sh, 'YXZ');
      this.camInit = true;
    } else if (me && me.pose.valid) {
      // зритель: из первого ряда, «на цыпочках»; смотрит куда хочет
      if (!this.spectatorYawSet) {
        this.spectatorYawSet = true;
        input.yaw = Math.atan2(me.pose.x, me.pose.z);
        input.pitch = -0.32;
      }
      _v.set(me.pose.x, me.pose.y + 2.1, me.pose.z);
      if (!this.camInit) this.camPos.copy(_v);
      else this.camPos.lerp(_v, 1 - Math.exp(-dt * 8));
      const pitch = clamp(input.pitch, -1.1, 0.6);
      _look.set(this.camPos.x - Math.sin(input.yaw) * Math.cos(pitch), this.camPos.y + Math.sin(pitch), this.camPos.z - Math.cos(input.yaw) * Math.cos(pitch));
      this.aimCamera(cam, dt);
      this.camInit = true;
    } else {
      // ещё не знаем, где мы: обзор сверху
      cam.position.set(0, 3.6, R + 2.5);
      cam.lookAt(0, 0.5, 0);
      this.camPos.copy(cam.position);
    }
    const vBase = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(settings.fov) / 2) / (16 / 9)) * 180) / Math.PI;
    this.curFov = damp(this.curFov, vBase + this.fovKick, 14, dt);
    const f = narrowFov(this.curFov, cam.aspect);
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  /** Поставить камеру в camPos и смотреть на _look, с тряской. */
  private aimCamera(cam: THREE.PerspectiveCamera, dt: number): void {
    const sh = this.shake * this.shake;
    const t = this.time;
    cam.position.copy(this.camPos);
    cam.position.x += (Math.sin(t * 61) + Math.sin(t * 37)) * 0.03 * sh;
    cam.position.y += Math.sin(t * 53) * 0.03 * sh;
    _m.lookAt(cam.position, _look, _up);
    _q.setFromRotationMatrix(_m);
    if (!this.camInit) this.camQuat.copy(_q);
    else this.camQuat.slerp(_q, 1 - Math.exp(-dt * 30));
    cam.quaternion.copy(this.camQuat);
    if (sh > 0.001) cam.rotateZ(Math.sin(t * 29) * 0.025 * sh);
  }

  private updateHud(): void {
    const { hud, settings, net } = this.d;
    hud.tick();
    const est = this.clock.ready ? this.clock.estimate(performance.now()) : 0;
    let left: number | null = null;
    if (this.phase === FP_INTRO || this.phase === FP_PAUSE || this.phase === FP_END) {
      left = this.phaseEnd > 0 ? Math.max(0, (this.phaseEnd - est) / TICK_RATE) : null;
    } else if (this.fightStart > 0) {
      left = Math.max(0, (est - this.fightStart) / TICK_RATE);
    }
    const names: [string, string] = this.mode === 'team' ? ['ХОЛОДНЫЕ', 'ТЁПЛЫЕ'] : [this.teamName(0), this.teamName(1)];
    let alive = 0;
    const myTeam = this.roster.get(this.myId)?.team ?? -1;
    const foes: FoeView[] = [];
    for (const r of this.roster.values()) {
      if (!r.fighter) continue;
      const v = this.views.get(r.id);
      const out = v ? (v.flags & E_ALIVE) === 0 || (v.flags & FE_FIGHTER) === 0 : false;
      if (!out) alive++;
      if (r.id === this.myId) continue;
      foes.push({ id: r.id, nick: r.nick, hp: v ? ((v.flags & FE_FIGHTER) === 0 ? 0 : v.hp) : FC_HP, st: v?.st ?? 1, mate: this.mode === 'team' && r.team === myTeam, out });
    }
    hud.setTop(this.mode, this.round, this.wins, left, names, alive, this.mode === 'ffa' ? -1 : myTeam);
    hud.setFoes(foes);
    const f = this.predictor.f;
    if (this.selfActive) {
      const r = Math.hypot(f.s.x, f.s.z);
      const dark = this.zone.stage > 0 && r > this.zone.r && !f.ko;
      hud.setMe(f.hp, f.st / FC_ST_MAX, f.st < MOVES[FA_JAB].cost && !f.ko, dark);
    } else {
      hud.setMe(null, 0, false, false);
    }
    hud.zoneWarn(this.zone.warn && this.phase === FP_FIGHT);
    hud.showSpectatorEmotes(!this.selfActive && !this.resultsShown);
    hud.hint(this.hintText());
    const held = this.selfActive && f.held !== 0;
    if (held && !this.wasHeld) hud.centerText('ВЫРВИСЬ!', TOUCH ? 'жми любые кнопки' : 'жми кнопки — ЛКМ, ПКМ, E, пробел', 1200, 'blood');
    this.wasHeld = held;
    hud.setStats(settings.showStats ? `${this.fps} FPS · ${Math.round(net.pingMs)} мс · буфер ${this.clock.delay.toFixed(1)} т · кадр ${this.lastFrameMs.toFixed(1)} мс · поправок ${this.predictor.corrections}` : null);
  }

  private hintText(): string | null {
    if (this.resultsShown) return null;
    if (!this.selfActive) {
      return TOUCH ? 'Ты в толпе · кнопки справа — эмоции · ☰ → «На набережную» — уйти' : 'Ты в толпе · 1–6 — эмоции · мышь — смотреть · Esc → «На набережную» — уйти';
    }
    const f = this.predictor.f;
    if (f.ko) return 'Нокаут. Полежи — потом постоишь в толпе.';
    if (f.held) return null;
    if (f.act === FA_HOLD) return TOUCH ? '✊ или 👊 — бросить (или подожди — бросит сам)' : 'E или ЛКМ — бросить (или подожди — бросит сам)';
    if (this.phase === FP_INTRO) {
      return TOUCH
        ? '👊 удар (три подряд — серия) · 💥 тяжёлый · 🛡 блок · 💨 уклон · ✊ захват'
        : 'ЛКМ — удар (три подряд — серия) · ПКМ — тяжёлый · Q/F — блок · Shift — уклон · E — захват';
    }
    if (this.zone.warn && this.phase === FP_FIGHT) return 'Лампы мигают — сейчас погаснут. В темноте больно: держись света.';
    return null;
  }

  debugState(): Record<string, unknown> {
    const f = this.predictor.f;
    const c = this.d.arena.camera.position;
    return {
      id: this.myId, mode: this.mode, phase: this.phase, round: this.round, wins: [...this.wins], ring: this.ringR, self: this.selfActive,
      hp: f.hp, st: f.st, act: f.act, ko: f.ko, pos: [f.s.x, f.s.y, f.s.z], corrections: this.predictor.corrections, zone: { ...this.zone },
      views: this.views.size, renderTick: this.clock.renderTick, fps: this.fps, cam: [c.x, c.y, c.z], results: this.resultsShown,
      cameraMode: this.resultsShown ? 'results' : this.selfActive ? 'firstPerson' : 'spectator', eye: { ...this.eye }, fists: this.fists.debugState(),
      quality: this.d.grade.debugState(), crowd: this.d.arena.crowd.debugState(),
      roster: [...this.roster.values()].map((r) => `${r.nick}${r.fighter ? '' : '(толпа)'}`),
    };
  }
}
