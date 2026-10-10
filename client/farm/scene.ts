// Ферма на клиенте: ходьба как на набережной (та же физика и предсказание, двоичные снимки), свой участок, грядки
// растут по серверному времени, E/ЛКМ — посадить, полить, собрать, Дядюшка Гриб — продать, корыто — набрать лейку,
// телега «В город» — обратно на площадь. Решает сервер (server/farm/room.ts): клиент шлёт только намерения.
import * as THREE from 'three';
import { quantTick } from '../../shared/aquadyn.ts';
import { TICK_MS, TICK_RATE } from '../../shared/constants.ts';
import { bedStage, canMax, emptyFarm, farmLevel, type FarmProgress } from '../../shared/farm.ts';
import { BED_CLICK_RANGE, BED_USE_RANGE, FARM_BEDS, UPGRADES, WELL_SETS, cropById } from '../../shared/farmdata.ts';
import { FARM_BED_LOCAL, FARM_USES, bedWorld, type FarmObjectId } from '../../shared/farmmap.ts';
import type { FarmEvent, FarmPlotView, FarmRosterRow, FarmServerMsg } from '../../shared/farmnet.ts';
import { LOBBY_MIN_DELAY } from '../../shared/lobby.ts';
import { clamp } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { E_ALIVE, E_GROUNDED, SNAP_HAS_SELF, SNAP_SELF_RESET, decodeSnapshot, encodeInputs, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { itemById, withItem } from '../../shared/outfit.ts';
import { sysFailText } from '../../shared/farmsys.ts';
import { makeInput, makeState } from '../../shared/sim.ts';
import { LobbyCamera } from '../lobby/camera.ts';
import { ClockSync } from '../net.ts';
import { Predictor } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import { FarmAudio } from './audio/farmaudio.ts';
import { FarmHud, fmtMin } from './hud.ts';
import { effectiveVolume } from '../settings.ts';
import { FarmWell } from './well.ts';
import { FarmWorld } from './world.ts';

const PITCH_MIN = -0.6;
const PITCH_MAX = 0.85;

interface Remote {
  track: RemoteTrack;
  avatar: Avatar;
  pose: AvatarPose;
}

/** Что сейчас под E: своя грядка или место у общего предмета */
type Target = { k: 'bed'; i: number } | { k: 'use'; id: FarmObjectId } | null;

const USE_TEXT: Partial<Record<FarmObjectId, string>> = {
  semechkin: 'Семечкин: семена и обучение',
  orders: 'Доска заказов',
  farmBoard: 'Доска фермы',
  van: 'Фургон: сдать ящик',
  boss: 'Древо разлома: доска вклада',
};

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Обзор из настроек — по горизонтали для 16:9; камере нужен вертикальный (как на набережной) */
function vfov(h: number): number {
  return (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / (16 / 9)) * 180) / Math.PI;
}

export class FarmScene implements Scene {
  readonly kind = 'farm' as const;
  readonly touchMode = 'walk' as const;
  readonly world: FarmWorld;
  private readonly d: SceneDeps;
  private readonly hud: FarmHud;
  private readonly well: FarmWell;
  private readonly audio = new FarmAudio();
  private readonly cam = new LobbyCamera();
  private predictor: Predictor;
  private clock = new ClockSync(LOBBY_MIN_DELAY);
  private readonly me = new Avatar(0, { gun: false });
  private readonly remotes = new Map<number, Remote>();
  private readonly roster = new Map<number, FarmRosterRow>();
  private readonly header = makeHeader();
  private readonly selfSnap = makeState();
  private readonly ents: EntitySnap[] = [];
  private readonly seen = new Set<number>();
  private readonly sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };
  private readonly inputs = [makeInput()];
  private readonly pose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  private readonly ground = { groundBelow: (x: number, y: number, z: number) => this.world.collision.groundBelow(x, y, z) };
  private active = false;
  private hasSelf = false;
  private myId = -1;
  private plot = -1;
  private farm: FarmProgress = emptyFarm(0);
  private plots: FarmPlotView[] = [];
  /** Серверное время = Date.now() + offset */
  private offset = 0;
  private seq = 0;
  private acc = 0;
  private queueAvg = 1;
  private lastVt = 0;
  private time = 0;
  private target: Target = null;
  /** Когда можно снова просить шишку (performance.now, мс) */
  private coneAt = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly hit = new THREE.Vector3();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
  private readonly center = new THREE.Vector2(0, 0);

  constructor(d: SceneDeps) {
    this.d = d;
    this.world = new FarmWorld(d.renderer);
    this.predictor = new Predictor(this.world.collision);
    this.me.addTo(this.world.scene);
    this.hud = new FarmHud(d.hudRoot, {
      plant: (crop) => this.plant(crop),
      sell: (item, n) => d.net.send({ t: 'farm', a: 'sell', item, n }),
      closed: () => { this.world.talk('grib', false); this.world.talk('semechkin', false); d.wantPointer(); },
      send: (m) => d.net.send(m),
      tokens: () => d.ui.me().tokens,
      plots: () => this.plots,
      roster: () => [...this.roster.values()],
      toast: (text, sub = '', key = 'farm') => d.ui.toasts.show(text, 4200, key, sub),
      wear: (ids) => {
        let o = d.ui.me().outfit;
        for (const id of ids) { const it = itemById(id); if (it) o = withItem(o, it); }
        d.net.send({ t: 'outfit', o });
      },
      free: () => { d.input.releaseAll(); d.input.unlock(); },
    });
    this.well = new FarmWell(d.hudRoot, { closed: () => d.wantPointer(), volume: () => effectiveVolume(d.settings) * d.settings.sfxVolume });
    window.addEventListener('wheel', (e) => {
      if (this.active && d.input.locked && !d.input.blocked) this.cam.zoomBy(e.deltaY);
    }, { passive: true });
  }

  /** Окно открыто — мышь отпущена (без паузы) */
  get wantsPointer(): boolean {
    return !this.hud.open && !this.well.open;
  }

  /** Модели ещё грузятся: экран загрузки ждёт (client/ui/transition.ts) */
  get loading(): boolean {
    return this.world.loading;
  }

  private now(): number {
    return Date.now() + this.offset;
  }

  // ------------------------------------------------------------ вход и выход

  enter(): void {
    this.active = true;
    this.hasSelf = false;
    this.myId = -1;
    this.plot = -1;
    this.seq = 0;
    this.acc = 0;
    this.queueAvg = 1;
    this.lastVt = 0;
    this.clock = new ClockSync(LOBBY_MIN_DELAY);
    this.predictor = new Predictor(this.world.collision);
    const me = this.d.ui.me();
    this.me.setOutfit(me.outfit);
    this.me.setInfo(me.nick, null, false, me.level);
    this.cam.reset();
    this.hud.setVisible(true);
    this.hud.setHint(null);
    this.d.ui.chat.setPlaceholder('Сообщение');
    this.audio.enter();
  }

  exit(): void {
    this.active = false;
    this.hasSelf = false;
    for (const r of this.remotes.values()) r.avatar.dispose(this.world.scene);
    this.remotes.clear();
    this.roster.clear();
    this.hud.setVisible(false);
    this.well.cancel();
    this.audio.exit();
  }

  // ------------------------------------------------------------ сеть

  onJson(msg: ServerMsg): void {
    const m = msg as FarmServerMsg;
    switch (m.t) {
      case 'farm':
        this.myId = m.id;
        this.plot = m.plot;
        this.offset = m.now - Date.now();
        this.plots = m.plots;
        this.world.setPlots(m.plots);
        this.setRoster(m.roster);
        this.setFarm(m.me);
        return;
      case 'farmMe':
        this.offset = m.now - Date.now();
        this.setFarm(m.me);
        return;
      case 'farmPlot':
        this.plots[m.plot.i] = m.plot;
        this.world.setPlot(m.plot);
        return;
      case 'farmRoster':
        this.setRoster(m.list);
        for (const row of m.list) if (row.id === this.myId) this.plot = row.plot;
        return;
      case 'farmEv':
        for (const e of m.e) { this.onEvent(e); this.world.onEvent(e); }
        return;
      default:
        // сообщения частей B1 (shared/farmsys.ts): окнам и 3D
        this.hud.onSys(m);
        this.world.onSys(m);
    }
  }

  private setFarm(f: FarmProgress): void {
    this.farm = f;
    this.hud.setMe(f, this.plot);
    this.hud.refresh(f, this.now(), this.d.ui.me().tokens);
  }

  private setRoster(list: readonly FarmRosterRow[]): void {
    this.roster.clear();
    for (const row of list) this.roster.set(row.id, row);
    for (const [id, r] of this.remotes) {
      const row = this.roster.get(id);
      if (row) { r.avatar.setInfo(row.nick, null, false, row.level); r.avatar.setOutfit(row.o); }
    }
    const mine = this.roster.get(this.myId);
    if (mine) { this.me.setOutfit(mine.o); this.me.setLevel(mine.level); }
  }

  private onEvent(e: FarmEvent): void {
    const toast = (text: string, sub = ''): void => this.d.ui.toasts.show(text, 2600, 'farm', sub);
    switch (e.k) {
      case 'harvest':
        if (e.plot !== this.plot) return;
        toast(`+${e.xp} XP фермы`, e.items.map((it) => `${cropById(it.crop)?.product ?? it.crop}${it.n > 1 ? ' ×2' : ''}${it.res ? ' · +1 ресурс' : ''}`).join(', ') + (e.bagFull ? ' · сумка полна!' : ''));
        return;
      case 'sold':
        toast(`+${e.coins} 🪙`, `Продано: ${cropById(e.item)?.product ?? 'трюфель'} × ${e.n}`);
        return;
      case 'level':
        this.hud.onEvent(e);
        return;
      case 'tut':
        toast(`Шаг обучения ${e.step} пройден`, `+${e.xp} XP${e.coins ? ` · +${e.coins} 🪙` : ''}`);
        return;
      case 'fill':
        // мини-игра «Набери лейку» (B4, client/farm/well.ts): отсчёты уходят серверу, он и считает долю
        this.d.input.releaseAll();
        this.d.input.unlock();
        this.well.start(e.seed, (s) => this.d.net.send({ t: 'farm', a: 'fillEnd', s }), { have: this.farm.water, max: canMax(this.farm) });
        return;
      case 'filled':
        // окно мини-игры само показывает итог «+N зарядов»; тост нужен, только если его уже закрыли (Esc, ×)
        if (!this.well.result(e.share, e.add)) toast(`Лейка: +${Math.round(e.add / 100)} 💧`, `Набрано ${Math.round(e.share * 100)} %`);
        return;
      case 'upgrade':
        toast(`Готово: ${UPGRADES.find((u) => u.id === e.id)?.name ?? e.id}`);
        return;
      case 'fail':
        toast((e.a === 'help' || e.a === 'van' || e.a === 'order' || e.a === 'cone' ? sysFailText(e.a, e.why) : null) ?? failText(e.why));
        return;
      case 'note':
        toast(e.text);
        return;
    }
  }

  onSnapshot(buf: ArrayBuffer, at: number): void {
    if (this.myId < 0) return;
    const n = decodeSnapshot(buf, this.header, this.selfSnap, this.ents);
    if (n < 0) return;
    const h = this.header;
    this.clock.addSample(h.tick, at);
    this.queueAvg += (h.queue - this.queueAvg) * 0.05;
    this.seen.clear();
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      if (e.id === this.myId) continue;
      const r = this.remotes.get(e.id) ?? this.addRemote(e.id);
      if (r.track.lastTick > 0 && Math.hypot(e.x - r.track.lastX, e.z - r.track.lastZ) > 4) r.track.clear();
      r.track.push(h.tick, e);
      this.seen.add(e.id);
    }
    for (const [id, r] of this.remotes) {
      if (this.seen.has(id)) continue;
      r.avatar.dispose(this.world.scene);
      this.remotes.delete(id);
    }
    if (h.flags & SNAP_HAS_SELF) {
      if (h.flags & SNAP_SELF_RESET || !this.hasSelf) this.predictor.reset(this.selfSnap, h.ack, 0);
      else this.predictor.reconcile(h.ack, this.selfSnap, 0);
      this.hasSelf = true;
    }
  }

  private addRemote(id: number): Remote {
    const avatar = new Avatar(id, { gun: false });
    const row = this.roster.get(id);
    if (row) { avatar.setInfo(row.nick, null, false, row.level); avatar.setOutfit(row.o); }
    avatar.addTo(this.world.scene);
    const r: Remote = { track: new RemoteTrack(id), avatar, pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 } };
    this.remotes.set(id, r);
    return r;
  }

  // ------------------------------------------------------------ действия

  private plant(crop: string): void {
    const t = this.target;
    if (t?.k === 'bed') this.d.net.send({ t: 'farm', a: 'plant', beds: [t.i], crop });
  }

  /** Своя грядка: −1 пусто, 0–2 растёт, 3 спелая; null — закрыта */
  private bedState(i: number): number | null {
    const b = this.farm.beds[i];
    return b ? bedStage(b, this.now()) : null;
  }

  private useBed(i: number): void {
    const st = this.bedState(i);
    const net = this.d.net;
    if (st === null) return;
    if (st === -1) {
      this.d.input.releaseAll();
      this.d.input.unlock();
      this.hud.openPlant(this.farm, this.d.ui.me().tokens, i);
    } else if (st === 3) net.send({ t: 'farm', a: 'harvest', beds: [i] });
    else if (!this.farm.beds[i].watered) net.send({ t: 'farm', a: 'water', beds: [i] });
  }

  private useObject(id: FarmObjectId): void {
    const net = this.d.net;
    if (id.startsWith('trough')) net.send({ t: 'farm', a: 'fillStart' });
    else if (id === 'cart') net.send({ t: 'leave' });
    else if (this.hud.object(id, this.farm, this.now())) {
      this.world.talk(id, true);
      this.d.input.releaseAll();
      this.d.input.unlock();
    } else this.d.ui.toasts.show(USE_TEXT[id] ?? 'Скоро', 2200, 'farm');
  }

  onUse(mouse: boolean): void {
    if (!this.hasSelf || this.hud.open || this.well.open) return;
    if (mouse) {
      const bed = this.aimBed();
      if (bed >= 0) { this.target = { k: 'bed', i: bed }; this.useBed(bed); return; }
    }
    const t = this.target;
    if (t?.k === 'bed') this.useBed(t.i);
    else if (t?.k === 'use') this.useObject(t.id);
  }

  /** ЛКМ: своя грядка в центре экрана, не дальше 6 м */
  private aimBed(): number {
    if (this.plot < 0) return -1;
    this.ray.setFromCamera(this.center, this.world.camera);
    if (!this.ray.ray.intersectPlane(this.groundPlane, this.hit)) return -1;
    const p = this.pose;
    let best = -1;
    let bestD = 0.95;
    for (let i = 0; i < this.farm.beds.length; i++) {
      const c = bedWorld(this.plot, i);
      const d = Math.hypot(c.x - this.hit.x, c.z - this.hit.z);
      if (d < bestD && Math.hypot(c.x - p.x, c.z - p.z) <= BED_CLICK_RANGE) { best = i; bestD = d; }
    }
    return best;
  }

  /** Что под E: своя грядка рядом и перед собой, иначе ближнее место у общего предмета */
  private findTarget(): Target {
    if (!this.hasSelf) return null;
    const p = this.pose;
    const fx = -Math.sin(this.d.input.yaw);
    const fz = -Math.cos(this.d.input.yaw);
    let best: Target = null;
    let bestD = Infinity;
    if (this.plot >= 0) {
      for (let i = 0; i < FARM_BEDS; i++) {
        const c = bedWorld(this.plot, i);
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > BED_USE_RANGE + 0.6 || (d > 0.9 && (dx * fx + dz * fz) / d < 0.2)) continue;
        if (d < bestD) { best = { k: 'bed', i }; bestD = d; }
      }
    }
    if (best) return best;
    for (const u of FARM_USES) {
      const d = Math.hypot(u.x - p.x, u.z - p.z);
      if (d <= u.r && d < bestD) { best = { k: 'use', id: u.id }; bestD = d; }
    }
    return best;
  }

  private updateHint(): void {
    if (this.hud.open) return;
    const t = (this.target = this.findTarget());
    const hud = this.hud;
    if (!t) { hud.setHint(null); return; }
    if (t.k === 'bed') {
      const st = this.bedState(t.i);
      if (st === null) {
        hud.setHint([], `Грядка ${t.i + 1} — откроется на ур. ${FARM_BED_LOCAL[t.i].level} фермы (сейчас ${farmLevel(this.farm.xp)})`);
        return;
      }
      const b = this.farm.beds[t.i];
      if (st === -1) hud.setHint(['E'], 'посадить');
      else if (st === 3) hud.setHint(['E'], `собрать: ${cropById(b.crop)?.product ?? ''}`);
      else {
        const left = fmtLeft(b.ripeAt - this.now());
        const crop = cropById(b.crop)?.name ?? '';
        if (b.watered) hud.setHint([], `${crop}: созреет через ${left} · полито`);
        else if (this.farm.water >= 100) hud.setHint(['E'], `полить (−20 %) · ${crop} созреет через ${left}`);
        else hud.setHint([], `${crop}: созреет через ${left} · лейка пуста — набери у колодца`);
      }
      return;
    }
    switch (t.id) {
      case 'grib': hud.setHint(['E'], 'Дядюшка Гриб: продать урожай'); break;
      case 'cart': hud.setHint(['E'], 'в город — на набережную'); break;
      case 'troughN': case 'troughE': case 'troughS': case 'troughW': {
        const full = this.farm.water >= canMax(this.farm);
        hud.setHint(full ? [] : ['E'], full ? 'Лейка полная' : `набрать лейку · наборов ${this.farm.well.sets}/${WELL_SETS}`);
        break;
      }
      default: hud.setHint(['E'], USE_TEXT[t.id] ?? '');
    }
  }

  // ------------------------------------------------------------ тик и кадр

  private tick(): void {
    const { input, net } = this.d;
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    inp.buttons = this.hud.open || this.well.open ? 0 : input.sample();
    inp.yaw = Math.fround(input.yaw);
    inp.pitch = Math.fround(input.pitch);
    const vt = quantTick(this.clock.renderTick);
    inp.viewTick = vt > this.lastVt ? vt : this.lastVt;
    this.lastVt = inp.viewTick;
    this.predictor.step(inp, false);
    net.sendBinary(encodeInputs(this.inputs, 0, 1, net.epoch));
  }

  frame(now: number, dtRaw: number): void {
    const { input, settings } = this.d;
    const dt = Math.min(0.1, dtRaw);
    this.time += dt;
    input.pitch = clamp(input.pitch, PITCH_MIN, PITCH_MAX);
    this.clock.update(now, dt * 1000);
    if (this.hasSelf && this.clock.ready) {
      const rate = clamp(1 - (this.queueAvg - 1.2) * 0.02, 0.97, 1.03);
      this.acc += dt * 1000 * rate;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) {
        this.acc -= TICK_MS;
        this.tick();
        n++;
      }
      if (this.acc > TICK_MS * 4) this.acc = 0;
    }
    const alpha = clamp(this.acc / TICK_MS, 0, 1);
    this.predictor.decay(dt);
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;
    const pose = this.pose;
    pose.x = p.x + (s.x - p.x) * alpha + o.x;
    pose.y = p.y + (s.y - p.y) * alpha + o.y;
    pose.z = p.z + (s.z - p.z) * alpha + o.z;
    pose.yaw = input.yaw;
    pose.pitch = input.pitch;
    pose.flags = E_ALIVE | (s.grounded ? E_GROUNDED : 0);
    const cam = this.world.camera;
    if (this.hasSelf) this.cam.follow(cam, dt, 'walk', pose.x, pose.y, pose.z, input.yaw, input.pitch, this.world.collision, vfov(settings.fov));
    else {
      cam.position.set(-16, 9, -16);
      cam.lookAt(0, 0, 0);
    }
    const camPos = cam.position;
    this.me.update(this.hasSelf ? pose : null, dt, this.time, this.ground, camPos, true);
    const t = this.clock.renderTick;
    for (const r of this.remotes.values()) {
      const ok = r.track.sample(t, this.sample);
      if (ok) Object.assign(r.pose, { x: this.sample.x, y: this.sample.y, z: this.sample.z, yaw: this.sample.yaw, pitch: this.sample.pitch, flags: this.sample.flags });
      r.avatar.update(ok ? r.pose : null, dt, this.time, this.ground, camPos, false);
    }
    tickAvatarShared(now / 1000, this.d.renderer.canvas.clientHeight || window.innerHeight);
    this.updateHint();
    this.pickCone(now);
    this.world.update(dt, this.now());
    this.audio.update(this.d.sound, this.world.camera);
    this.world.render();
  }

  /** Прошёл сквозь шишку-ворчунью — подобрал (сервер проверит расстояние); запрос не чаще раза в 0,5 с */
  private pickCone(now: number): void {
    if (!this.hasSelf || now < this.coneAt) return;
    const id = this.world.coneAt(this.pose.x, this.pose.z);
    if (id === null) return;
    this.coneAt = now + 500;
    this.d.net.send({ t: 'farm', a: 'cone', id });
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (down && !e.repeat && this.hasSelf && this.hud.hotkey(code)) {
      e.preventDefault();
      return true;
    }
    if (this.hud.open && down && code === 'Escape') {
      e.preventDefault();
      this.hud.close();
      return true;
    }
    return false;
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  setQuality(q: 'low' | 'medium' | 'high'): void {
    this.world.setQuality(q);
  }

  debugState(): Record<string, unknown> | null {
    const s = this.predictor.state;
    return {
      mode: 'farm', id: this.myId, plot: this.plot, loading: this.world.loading, player: { x: s.x, y: s.y, z: s.z },
      target: this.target, level: farmLevel(this.farm.xp), xp: this.farm.xp, water: this.farm.water, bag: { ...this.farm.bag },
      beds: this.farm.beds.map((b) => ({ crop: b.crop, stage: bedStage(b, this.now()), left: Math.max(0, b.ripeAt - this.now()) })),
      tutorial: this.farm.tutorial, remotes: this.remotes.size, renderTick: this.clock.renderTick, tickRate: TICK_RATE, window: this.hud.open,
      ripeIn: this.farm.beds.map((b) => (b.crop ? fmtMin(Math.ceil(Math.max(0, b.ripeAt - this.now()) / 60_000)) : '')),
    };
  }
}

function failText(why: Extract<FarmEvent, { k: 'fail' }>['why']): string {
  switch (why) {
    case 'far': return 'Подойди ближе';
    case 'coins': return 'Не хватает жетонов';
    case 'level': return 'Откроется на следующих уровнях фермы';
    case 'water': return 'Лейка пуста — набери воды у колодца';
    case 'watered': return 'Эта грядка уже полита в этом цикле';
    case 'bag': return 'Сумка полна — продай урожай Дядюшке Грибу';
    case 'unripe': return 'Ещё не созрело';
    case 'busy': return 'Грядка занята';
    case 'empty': return 'Грядка пустая';
    case 'res': return 'Не хватает ресурсов';
    case 'well': return 'Колодец набирается — следующий набор через 15 минут';
    case 'rate': return 'Не так быстро 🙂';
    case 'off': return 'Скоро';
    default: return 'Не получилось';
  }
}
