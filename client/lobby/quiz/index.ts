// «Ракушка» в клиенте (флаг QUIZ, docs/quiz/tech.md §14): одна точка для сцены набережной (client/lobby/scene.ts) —
// письма qz / qzBoard / qzErr, площадка в мире, Затейник, облачки, камеры мест, клавиши, чат «В игру», вывеска и афиша.
// Без поля quiz в приветствии набережной (флаг выключен) ничего не строится и игра ведёт себя как раньше.
// Отладка без сервера: ?quizdemo (кресло 0), ?quizdemo=seat:5, ?quizdemo=stage, ?quizdemo=walk — свои снимки и место.
import * as THREE from 'three';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import { QZ, QZ_CATEGORIES, QZ_CROC, type QzBoard, type QzInkOp, type QzMe, type QzView } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE, type QuizPlace } from '../../../shared/quiz/venue.ts';
import type { Chat } from '../../chat.ts';
import type { Avatar } from '../../render/avatar.ts';
import type { LobbyFx } from '../fx.ts';
import { plaza3Shadows } from '../plaza3/mounts.ts';
import type { SignExtras } from '../plaza3/status.ts';
import { FenceClear } from './clear.ts';
import { crocInk } from './easel.ts';
import { demoCroc, demoInk, demoJp, demoWho } from './demo2.ts';
import { QuizPick } from './pick.ts';
import type { QuizFx } from './fx.ts';
import { QuizHeads } from './heads.ts';
import { ACT_QUIZ, pultsUp, quizCamera, quizPlace, whoCamera } from './places.ts';
import { QuizState, type QuizEvent } from './state.ts';
import { QuizHud, uiReal, type QuizHudKitArg, type QuizHudLike } from './uikit.ts';
import { QuizVenue3D, VENUE_LIFT, type FamilyMats } from './venue3d.ts';
import { Zatejnik } from './zatejnik.ts';

export { ACT_QUIZ } from './places.ts';

export interface QuizDeps {
  scene: THREE.Scene;
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** Группа павильонов plaza3: в ней общие материалы семейств p3_matte / p3_gloss / p3_glow — берём их, новых программ нет */
  pavilions: THREE.Object3D;
  fx: LobbyFx;
  canvas: HTMLElement;
  chat: Chat;
  send: (m: QuizClientMsg | { t: 'unuse' }) => void;
  toast: (text: string) => void;
  avatarOf: (slot: number) => Avatar | null;
  mySlot: () => number;
  /** Твёрдое пульта i (map.quizPultBoxes): включено, пока пульт наверху — как у сервера */
  pultSolid?: (i: number, on: boolean) => void;
  /** Слоты кита для HUD (d.ui.slots, d.ui.top, d.sound.kit) */
  hudKit?: QuizHudKitArg;
  /** Громкость звука вопросов «Своей игры» (общая × эффекты), 0…1 */
  volume?: () => number;
  /** Окно «Ракушки» открылось (мышь — окну) / закрылось (мышь — обратно игре), как у регаты */
  freeMouse?: (free: boolean) => void;
  /** Вывески plaza3: строка «Ракушки» на афише кафе */
  signs: { setExtras(x: Partial<SignExtras>): void } | null;
}

/** Куда смотрит камера места: позиция, цель, вертикальный FOV */
export interface QuizCamPose {
  px: number; py: number; pz: number;
  tx: number; ty: number; tz: number;
  fov: number;
}

const DIGITS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
const EMOTE_DIGITS = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7']);
/** Мышью — повернуть взгляд с места (зажатая кнопка): по горизонтали ±look (25°), по вертикали ±12° */
const LOOK_PITCH = (12 * Math.PI) / 180;
const LOOK_K = 0.0035;

export class QuizClient {
  private readonly d: QuizDeps;
  /** Открыто окно «Ракушки» (трибуна, вопрос загадывающего): мышь свободна, пауза не нужна */
  private winOpen = false;
  readonly state: QuizState;
  private venue: QuizVenue3D | null = null;
  private zat: Zatejnik | null = null;
  private readonly heads: QuizHeads;
  private hud: QuizHudLike | null = null;
  /** Декор plaza3 в ограде (кипарисы): спрятан, пока площадка построена */
  private readonly clear = new FenceClear();
  private on = false;
  private hudSec = -1;
  /** Взгляд мышью с места: смещение от направления места */
  private lookYaw = 0;
  private lookPitch = 0;
  private lookPlace = -1;
  private dragging = false;
  /** ?quizdemo: своё место без сервера (−1 — стоит) */
  private demo: { place: number } | null = null;
  /** Мышью по табло и по желейкам (часть 2) */
  private readonly pick: QuizPick;
  /** Тост голосовой зоны — раз за сессию */
  private zoneToast = false;
  /** Звук вопроса «Своей игры» (/quiz/m/<пак>/<файл>) */
  private audio: HTMLAudioElement | null = null;
  private audioKey = '';
  /** Твёрдое пультов: что сейчас включено */
  private solid: boolean[] = [];

  constructor(d: QuizDeps) {
    this.d = d;
    this.state = new QuizState((m) => d.send(m));
    this.heads = new QuizHeads(d.avatarOf, d.mySlot);
    this.state.on((e) => this.onEvent(e));
    this.bindLook();
    this.pick = new QuizPick({
      camera: d.camera, canvas: d.canvas, board: () => this.venue?.boardMesh ?? null, state: this.state, avatarOf: d.avatarOf, mySlot: d.mySlot,
      active: () => this.on && this.lookPlace >= 0 && !document.pointerLockElement,
      repaint: () => this.venue?.markBoard(),
      picked: (slot) => { const av = d.avatarOf(slot), t = this.heads.iconTex('online'); if (av && t) av.showIcon(t); },
    });
    const q = new URLSearchParams(location.search).get('quizdemo');
    if (q !== null) this.startDemo(q);
    if (q !== null || new URLSearchParams(location.search).has('debug')) (window as unknown as { __quiz: unknown }).__quiz = this;
  }

  get enabled(): boolean {
    return this.on;
  }

  // ------------------------------------------------------------ сеть

  /** Приветствие набережной: поле quiz есть — «Ракушка» включена (нет — выключена, ничего не видно) */
  welcome(b: QzBoard | null): void {
    if (this.demo) return;
    this.setOn(!!b);
    this.state.reset();
    // твёрдое пультов сцена только что выключила — следующий снимок включит поднятые
    this.solid = [];
    if (!b) return;
    this.state.onBoard(b);
    this.pushView();
  }

  /** Письма «Ракушки»; true — съели */
  onMsg(msg: { t: string }): boolean {
    if (this.demo) return msg.t === 'qz' || msg.t === 'qzBoard' || msg.t === 'qzInk';
    switch (msg.t) {
      case 'qz': {
        const m = msg as unknown as { v: QzView; me: QzMe };
        this.setOn(true);
        this.state.onQz(m.v, m.me);
        this.pushView();
        return true;
      }
      case 'qzBoard': {
        this.setOn(true);
        this.state.onBoard((msg as unknown as { b: QzBoard }).b);
        this.pushView();
        return true;
      }
      case 'qzInk':
        this.venue?.easel?.onInk(msg as unknown as { d: number; ops: QzInkOp[]; full?: boolean });
        return true;
      case 'qzPacks':
      case 'qzPackOutline':
      case 'qzTicket':
      case 'qzRecs':
        this.hud?.onMsg?.(msg);
        return true;
      case 'qzErr': {
        const m = msg as unknown as { text: string };
        if (m.text) this.d.toast(m.text);
        return true;
      }
      default:
        return false;
    }
  }

  private setOn(on: boolean): void {
    if (on === this.on && (!on || this.venue)) return;
    this.on = on;
    if (on && !this.venue) {
      const d = this.d;
      this.venue = new QuizVenue3D({
        scene: d.scene, gl: d.gl, camera: d.camera, mats: familyMats(d.pavilions), mySlot: d.mySlot,
        easel: {
          canvas: d.canvas, canDraw: () => this.canDraw(), send: (ops) => this.state.send({ t: 'qz', a: 'crInk', ops }),
          tool: () => { const t = this.hud?.crocTool?.(); return t ? { color: t.erase ? QZ_CROC.ERASER : t.color, width: t.width } : null; },
        },
      });
      // Затейник: стандартный материал со скинингом и цветом вершин — как у зверьков набережной (critter-kit.ts)
      this.zat = new Zatejnik(this.venue.group, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }));
      this.hud = new QuizHud((m) => (m.t === 'unuse' ? d.send(m) : this.state.send(m)), d.hudKit);
    }
    if (this.venue) this.venue.group.visible = on;
    if (on) this.clear.apply(this.d.scene);
    else this.clear.restore();
    plaza3Shadows.refresh();
    if (!on) this.reset();
  }

  /** Табло, вывеска, HUD, чат, афиша — по новому снимку */
  private pushView(): void {
    const st = this.state;
    this.venue?.setBoard(st.board, () => st.serverNow());
    this.hud?.update(st.view, st.me, st.board, st.serverNow());
    this.hudSec = Math.floor(performance.now() / 1000);
    // Enter в «В игру»: письмо режима от HUD (ответ отвечающего, ответ финала, свой вопрос…), без HUD — реплика
    this.d.chat.setGame(st.gameChat ? (text) => st.send(this.hud?.lineMsg?.(text) ?? { t: 'qz', a: 'say', text: text.slice(0, QZ.LINE_MAX) }) : null);
    this.d.signs?.setExtras({ quiz: st.board });
    this.heads.setTitles(st.view?.people ?? null);
    this.syncSolid(pultsUp(st.board));
    this.pick.refresh();
    this.syncAudio();
  }

  /** Звук вопроса «Своей игры»: играет, пока вопрос на табло (чтение, кнопки, ответ); только внутри ограды */
  private syncAudio(): void {
    const b = this.state.board;
    const jp = this.state.inside && b?.phase === 'game' && b.mode === 'jeopardy' ? b.jp : null;
    const a = jp?.q && jp.pack && (jp.step === 'read' || jp.step === 'buzz' || jp.step === 'answer') ? jp.q.content.find((c) => c.kind === 'audio') : undefined;
    const key = a && a.kind === 'audio' && jp?.pack ? `${jp.pack.id}/${a.file}` : '';
    if (key === this.audioKey) return;
    this.audioKey = key;
    this.audio?.pause();
    this.audio = null;
    if (!key) return;
    const el = new Audio(`/quiz/m/${key}`);
    el.volume = Math.max(0, Math.min(1, this.d.volume?.() ?? 0.7));
    this.audio = el;
    void el.play().catch(() => {});
  }

  /** Твёрдое пультов вслед за подъёмом (без флага и вне «Своей игры» — всё выключено) */
  private syncSolid(up: readonly boolean[]): void {
    up.forEach((on, i) => {
      if (this.solid[i] === on) return;
      this.solid[i] = on;
      this.d.pultSolid?.(i, on);
    });
  }

  /** Я рисую сейчас: «Крокодил», шаг draw, рисующий — я */
  canDraw(): boolean {
    const b = this.state.board;
    return this.state.inside && b?.phase === 'game' && b.mode === 'croc' && b.croc?.step === 'draw' && b.croc.drawer?.slot === this.d.mySlot();
  }

  /** «Кто из нас?», шаг vote, я участник — камера со сцены на зал, голос кликом по желейке */
  private whoVoting(): boolean {
    const b = this.state.board;
    return b?.phase === 'game' && b.mode === 'whoofus' && b.who?.step === 'vote' && !!this.state.me?.who?.in;
  }

  private onEvent(e: QuizEvent): void {
    this.heads.onEvent(e);
    const fx = (x: QuizFx): void => this.hud?.fx(x);
    switch (e.k) {
      case 'inside':
        fx({ k: 'inside', on: e.on });
        if (!e.on) {
          this.heads.reset();
          this.pick.clear();
          this.syncAudio();
        }
        // своя голосовая зона (tech §25): раз за сессию; голоса нет (флаг) — кнопки микрофона нет и тоста нет
        if (e.on && !this.zoneToast && document.querySelector('.voice-hud')) {
          this.zoneToast = true;
          this.d.toast('Ты на «Ракушке»: здесь свой голос — набережная не слышит');
        }
        return;
      case 'zat':
        this.zat?.say(e.say.text, e.say.clip);
        return;
      case 'line':
        if (e.line.kind === 'guess') fx({ k: 'sound', name: 'pop' });
        return;
      case 'mark':
        if (e.line.mark === 'warm') {
          fx({ k: 'warmFly', lineId: e.line.id, slot: e.line.slot, from: null });
          fx({ k: 'sound', name: 'warm' });
        } else if (e.line.mark === 'miss') fx({ k: 'sound', name: 'miss' });
        return;
      case 'vote':
        if (e.slot === this.d.mySlot()) fx({ k: 'sound', name: 'vote' });
        return;
      case 'check':
        fx({ k: 'sound', name: 'drum' });
        this.venue?.party(0);
        return;
      case 'checkEnd':
        if (e.solved) {
          fx({ k: 'sound', name: 'fanfare' });
          fx({ k: 'confetti' });
          this.celebrate();
        } else fx({ k: 'sound', name: 'undo' });
        return;
      case 'end':
        if (e.end !== 'solved') fx({ k: 'sound', name: 'fail' });
        return;
      case 'stage':
        this.puff(e.who.slot, e.on);
        fx({ k: 'sound', name: 'puff' });
        return;
      default:
    }
  }

  /** Хлопок-облачко: на точке загадывающего и на его кресле (откуда ушёл или куда вернулся) */
  private puff(slot: number, on: boolean): void {
    const r = QUIZ_VENUE.riddler;
    this.d.fx.sparkle(r.x, r.y + VENUE_LIFT + 0.9, r.z, 26);
    this.d.fx.confetti(r.x, r.y + VENUE_LIFT + 0.4, r.z, 18, 0, 1, 0, 0.9, 3.2);
    const p = this.state.view?.people.find((x) => x.slot === slot);
    const c = p && p.chair >= 0 ? QUIZ_VENUE.chairs[p.chair] : null;
    if (c) this.d.fx.sparkle(c.x, c.y + VENUE_LIFT + 0.9, c.z, 18);
    else if (!on) this.d.fx.sparkle(QUIZ_VENUE.back.x, QUIZ_VENUE.back.y + 0.9, QUIZ_VENUE.back.z, 18);
  }

  /** Разгадали: конфетти из ракушки, лампочки бегут */
  private celebrate(): void {
    const c = QUIZ_VENUE.board.center;
    this.d.fx.confetti(c[0] - 0.6, c[1] + 2.2, c[2], 90, -1, 0.6, 0, 0.7, 7);
    this.venue?.party(4);
  }

  // ------------------------------------------------------------ кадр

  frame(dt: number, camPos: THREE.Vector3): void {
    if (!this.on) return;
    this.venue?.update(dt, camPos);
    this.zat?.update(dt, camPos);
    // звук вопроса следует за громкостью и выключателем из Esc прямо во время вопроса
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, this.d.volume?.() ?? 0.7));
    const win = !!document.querySelector('dialog.qz-scrim[open]');
    if (win !== this.winOpen) { this.winOpen = win; this.d.freeMouse?.(win); }
    this.heads.update();
    // HUD: отсчёты — раз в секунду (снимки — сразу, pushView)
    const sec = Math.floor(performance.now() / 1000);
    if (sec !== this.hudSec && this.state.board) {
      this.hudSec = sec;
      const st = this.state;
      this.hud?.update(st.view, st.me, st.board, st.serverNow());
    }
  }

  /** Своё место «Ракушки» с учётом ?quizdemo (null — не на месте) */
  private placeOf(act: number, arg: number): QuizPlace | null {
    if (this.demo) return this.demo.place >= 0 ? quizPlace(this.demo.place) : null;
    return this.on && act === ACT_QUIZ ? quizPlace(arg) : null;
  }

  /** Камера места: кресло — на табло, сцена — за спиной; мышью ±25° (зажатая кнопка). null — обычная камера */
  cameraPose(act: number, arg: number): QuizCamPose | null {
    const p = this.placeOf(act, arg);
    if (!p) {
      this.lookPlace = -1;
      return null;
    }
    if (p.i !== this.lookPlace) {
      this.lookPlace = p.i;
      this.lookYaw = this.lookPitch = 0;
    }
    const c = this.whoVoting() ? whoCamera() : quizCamera(p);
    const lift = VENUE_LIFT;
    const dx = c.target[0] - c.pos[0], dy = c.target[1] - c.pos[1], dz = c.target[2] - c.pos[2];
    const h = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz) + this.lookYaw;
    const pitch = Math.atan2(dy, h) + this.lookPitch;
    const k = Math.cos(pitch);
    return { px: c.pos[0], py: c.pos[1] + lift, pz: c.pos[2], tx: c.pos[0] + Math.sin(yaw) * k, ty: c.pos[1] + lift + Math.sin(pitch), tz: c.pos[2] + Math.cos(yaw) * k, fov: c.fovV };
  }

  /** Своя желейка в кресле не рисуется (камера за спинкой смотрит сквозь неё на табло) */
  hidesSelf(act: number, arg: number): boolean {
    const k = this.placeOf(act, arg)?.kind;
    return (k === 'chair' && !this.whoVoting()) || k === 'drawer';
  }

  /** На месте «Ракушки» мышь свободна: кнопки плашки и строки дока нажимаются мышью */
  freesPointer(act: number, arg: number): boolean {
    return this.winOpen || !!this.placeOf(act, arg);
  }

  /** Своя желейка — точно на месте и лицом, куда смотрит место (сервер держит её там же) */
  selfPose(act: number, arg: number, pose: { x: number; y: number; z: number; yaw: number; pitch: number }, me: Avatar): void {
    const p = this.placeOf(act, arg);
    if (!p) return;
    if (this.demo) {
      pose.x = p.x;
      pose.y = p.y + VENUE_LIFT;
      pose.z = p.z;
      if (me.action !== ACT_QUIZ || me.arg !== p.i) me.setAction(ACT_QUIZ, p.i);
    }
    pose.yaw = p.yaw;
    pose.pitch = 0;
  }

  /** Куда смотрит место (yaw игры); undefined — нет такого места */
  placeYaw(arg: number): number | undefined {
    return quizPlace(arg)?.yaw;
  }

  /** Подсказка у своего места: кресло — «E встать»; на сцене встать нельзя */
  placeHint(arg: number): [readonly string[] | null, string] {
    const p = quizPlace(arg);
    // встать — кнопка «Встать [E]» в HUD; здесь только мышь. Голос «Кто из нас?» — своя подсказка HUD («Клик по желейке»),
    // а при наведении на желейку — за кого голос (ник заднего ряда может прятаться под верхней плашкой)
    if (this.whoVoting()) {
      const h = this.pick.hover;
      const nick = h?.k === 'jelly' ? this.state.view?.people.find((x) => x.slot === h.slot)?.nick : undefined;
      return nick ? [['ЛКМ'], `Голос за ${nick}`] : [null, ''];
    }
    if (p?.kind === 'chair') return [['ЛКМ'], 'зажми — осмотреться'];
    return [null, ''];
  }

  /** Подсказка у кресла: свободно — «E сесть», занято — «Место занято» */
  pointHint(arg: number): [readonly string[] | null, string] {
    const p = quizPlace(arg);
    // трибуна: E — окно «Ракушки» в любой шаг (встать за неё как ведущий сервер даст только в шаге «Веду я»)
    if (p?.kind === 'podium') return [['E'], 'окно «Ракушки» · игры, паки, рекорды'];
    // пульт: встать за него можно только посреди «Своей игры» (сервер: jeopardy.use); вне игры он в люке — без подсказки
    if (p?.kind === 'pult') return this.state.board?.jp ? [['E'], 'встать за пульт · играть'] : [null, ''];
    const busy = !!p && p.kind === 'chair' && !!this.state.view?.people.some((x) => x.chair === p.n && x.slot !== this.d.mySlot());
    return busy ? [[], 'Место занято'] : [['E'], 'сесть · смотреть на сцену и играть'];
  }

  /** Эмоции 1–7 выключены: голосование, загадывающий; часть 2 — цифры заняты (пак, слово, ✓ / ✗ ведущего) */
  get emotesBlocked(): boolean {
    return this.on && (this.state.emotesBlocked || this.digitsBusy());
  }

  /** Стою у трибуны (точка E ведущего) */
  private nearPodium(): boolean {
    const av = this.d.avatarOf(this.d.mySlot());
    const h = QUIZ_VENUE.host;
    return !!av && Math.hypot(av.root.position.x - h.x, av.root.position.z - h.z) < 1.4;
  }

  private digitsBusy(): boolean {
    const b = this.state.board, me = this.d.mySlot();
    if (!this.state.inside || b?.phase !== 'game') return false;
    if (b.mode === 'jeopardy' && b.jp) return b.jp.step === 'packvote' || b.jp.host?.slot === me;
    if (b.mode === 'croc' && b.croc) return b.croc.step === 'words' && b.croc.drawer?.slot === me;
    return false;
  }

  /** Клавиши внутри ограды: 1–4 — голос; F — взять роль; у загадывающего 1/2/3 — отметки, Z — отменить, H — подсказка */
  onKey(code: string): boolean {
    const st = this.state;
    if (!this.on) return false;
    // E у трибуны — окно «Ракушка» (клиент, в любой шаг); use уходит как обычно — сервер посадит ведущего в шаге roles
    if (code === 'KeyE' && this.nearPodium()) this.hud?.openWindow?.();
    if (!st.inside || !st.board) return false;
    // часть 2б: клавиши режимов — сначала HUD Sonnet (Пробел, 1/2 ведущего, R…), остальное — здесь
    if (this.hud?.onKey?.(code)) return true;
    const me = st.me;
    const b = st.board;
    const n = DIGITS[code];
    if (b.phase === 'vote' && n !== undefined) {
      st.send({ t: 'qz', a: 'vote', m: n });
      return true;
    }
    if (code === 'KeyF' && me?.canTake) {
      st.send({ t: 'qz', a: 'role', take: true });
      return true;
    }
    if (st.riddling) {
      const step = st.view?.riddle?.step;
      if (n !== undefined && n < 3 && step === 'round') {
        const l = st.oldest();
        if (l) st.send({ t: 'qz', a: 'mark', id: l.id, m: n === 0 ? 'warm' : n === 1 ? 'miss' : 'win' });
        return true;
      }
      if (code === 'KeyZ' && (step === 'round' || step === 'check')) {
        st.send({ t: 'qz', a: 'undo' });
        return true;
      }
      if (code === 'KeyH' && step === 'round' && (me?.hintsLeft ?? 0) > 0) {
        this.hud?.fx({ k: 'hint' });
        return true;
      }
    }
    if (b.phase === 'game' && this.part2Key(code, n, b)) return true;
    // в эти моменты эмоции выключены — цифры не уходят в жесты
    return this.emotesBlocked && EMOTE_DIGITS.has(code);
  }

  /** Клавиши части 2: «Своя игра» — 1–3 пак, Пробел — «Жму!» (ведущему — открыть кнопки), 1 / 2 — ✓ / ✗ ведущего,
   *  R — показать ответ; «Крокодил» — 1–3 слово, Z — отменить мазок */
  private part2Key(code: string, n: number | undefined, b: QzBoard): boolean {
    const st = this.state, me = this.d.mySlot();
    const jp = b.mode === 'jeopardy' ? b.jp : null;
    if (jp) {
      const host = jp.host?.slot === me;
      if (jp.step === 'packvote' && n !== undefined && n < 3) return st.send({ t: 'qz', a: 'jpPv', i: n }), true;
      if (code === 'Space' && host && jp.step === 'read') return st.send({ t: 'qz', a: 'jpOpen' }), true;
      if (code === 'Space' && (st.me?.jp?.pult ?? -1) >= 0 && (jp.step === 'read' || jp.step === 'buzz')) return st.send({ t: 'qz', a: 'jpBuzz' }), true;
      if (host && (jp.step === 'answer' || jp.step === 'judge') && (n === 0 || n === 1)) return st.send({ t: 'qz', a: 'jpJudge', ok: n === 0 }), true;
      if (host && code === 'KeyR' && jp.step === 'buzz') return st.send({ t: 'qz', a: 'jpShow' }), true;
    }
    const croc = b.mode === 'croc' ? b.croc : null;
    if (croc?.drawer?.slot === me) {
      if (croc.step === 'words' && n !== undefined && n < 3) return st.send({ t: 'qz', a: 'crWord', i: n }), true;
      if (croc.step === 'draw' && code === 'KeyZ') return crocInk.undo(), true;
    }
    return false;
  }

  // ------------------------------------------------------------ взгляд мышью с места

  private bindLook(): void {
    const cv = this.d.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (this.lookPlace < 0 || document.pointerLockElement) return;
      this.dragging = true;
      e.preventDefault();
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.lookPlace < 0) return;
      const p = quizPlace(this.lookPlace);
      const lim = p ? quizCamera(p).look : 0.44;
      this.lookYaw = Math.max(-lim, Math.min(lim, this.lookYaw - e.movementX * LOOK_K));
      this.lookPitch = Math.max(-LOOK_PITCH, Math.min(LOOK_PITCH, this.lookPitch - e.movementY * LOOK_K));
    });
  }

  // ------------------------------------------------------------ ушли с набережной

  reset(): void {
    this.state.reset();
    this.heads.reset();
    this.d.chat.setGame(null);
    this.d.signs?.setExtras({ quiz: null });
    this.hud?.update(null, null, null, Date.now());
    this.dragging = false;
    this.pick.clear();
    this.syncSolid(QUIZ_VENUE.pults.map(() => false));
    this.audioKey = 'x';
    this.syncAudio();
  }

  debug(): Record<string, unknown> {
    const st = this.state;
    return {
      on: this.on, inside: st.inside, phase: st.phase, rev: st.board?.rev ?? null, ui: uiReal, demo: this.demo,
      venue: this.venue?.debug() ?? null, cleared: this.clear.tris, zatejnik: this.zat?.debug() ?? null,
    };
  }

  // ------------------------------------------------------------ ?quizdemo: без сервера

  /** Своё место для отладки: −1 — стоит; число — номер места; 'stage' — точка загадывающего */
  demoPlace(place: number | 'stage'): void {
    this.demo = { place: place === 'stage' ? QUIZ_VENUE.first.riddler : place };
  }

  /** Подменить снимок (как будто пришёл от сервера) */
  feed(v: QzView, me: QzMe | null): void {
    this.setOn(true);
    if (me) this.state.onQz(v, me);
    else this.state.onBoard(v);
    this.pushView();
  }

  private startDemo(q: string): void {
    const [kind, a1, a2] = q.split(':');
    const f = QUIZ_VENUE.first;
    // часть 2: «Своя игра» за пультом 0 (jp:host — у трибуны), «Крокодил» у мольберта (croc:seat:N — смотрю с кресла), «Кто из нас?»
    if (kind === 'jp' || kind === 'croc' || kind === 'who') {
      const seat = a1 === 'seat' ? f.chair + (Number(a2) || 0) : -1;
      const place = kind === 'jp' ? (a1 === 'host' ? f.podium : f.pult) : kind === 'croc' ? (seat >= 0 ? seat : f.drawer) : (seat >= 0 ? seat : f.chair + 2);
      this.demo = { place };
      let rev = 1;
      const tick = (): void => {
        const slot = this.d.mySlot();
        if (slot < 0) return void setTimeout(tick, 300);
        const r = rev++;
        const x = kind === 'jp' ? demoJp(slot, r, place, a1 === 'host') : kind === 'croc' ? demoCroc(slot, r, place, seat < 0) : demoWho(slot, r, place);
        this.feed(x.v, x.me);
        if (kind === 'croc' && seat >= 0) for (let i = 0; i < 6; i++) setTimeout(() => this.venue?.easel?.onInk({ d: 1, ops: demoInk(i) }), 600 + i * 700);
        if (kind !== 'croc') setTimeout(tick, 5000);
      };
      setTimeout(tick, 1500);
      return;
    }
    this.demo = { place: kind === 'stage' ? f.riddler : kind === 'walk' ? -1 : f.chair + (Number(a1) || 0) };
    const stage = kind === 'stage';
    // первый снимок — когда известен свой номер в снимке набережной
    const t0 = Date.now();
    let rev = 1;
    const tick = (): void => {
      const slot = this.d.mySlot();
      if (slot < 0) return void setTimeout(tick, 300);
      const v = demoView(slot, rev++, t0, stage);
      const me: QzMe = {
        slot, place: this.demo?.place ?? -1, role: stage ? 'riddler' : '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0,
        ...(stage ? { word: 'пароход', near: [], hintsLeft: 1 } : {}),
      };
      this.feed(v, kind !== 'walk' ? me : null);
      if (rev === 2) this.zat?.say(v.zat?.text ?? '', 'announce');
      setTimeout(tick, 5000);
    };
    setTimeout(tick, 1500);
  }
}

/** Общие материалы семейств павильонов (их держит группа павильонов с первого кадра — pavilions.ts) */
function familyMats(group: THREE.Object3D): FamilyMats {
  const found: Partial<FamilyMats> = {};
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || Array.isArray(m)) return;
    if (m.name === 'p3_matte' && !found.matte) found.matte = m;
    else if (m.name === 'p3_gloss' && !found.gloss) found.gloss = m;
    else if (m.name === 'p3_glow' && !found.glow) found.glow = m;
  });
  return {
    matte: found.matte ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
    gloss: found.gloss ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }),
    glow: found.glow ?? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}

/** Снимок «Загадка идёт» для ?quizdemo: Барон загадал, две подсказки, три «мимо», строки над своей желейкой */
function demoView(slot: number, rev: number, t0: number, stage: boolean): QzView {
  const now = Date.now();
  const me = { slot, nick: 'Tester9' };
  const baron = { slot: stage ? slot : 0, nick: stage ? 'Tester9' : 'Барон' };
  const lines = [
    { id: 1, slot, nick: me.nick, text: 'Оно плавает?', at: t0, kind: 'guess' as const, mark: 'warm' as const, markedAt: t0 + 10 },
    { id: 2, slot: 0, nick: 'Затейник', text: 'Барон загадал! Тема — Предмет', at: t0 + 1, kind: 'zat' as const, mark: '' as const, markedAt: 0 },
    { id: 2 + rev, slot, nick: me.nick, text: ['Это лодка?', 'Пароход!', 'Большое и дымит?', 'Это корабль?'][rev % 4], at: now, kind: stage ? 'say' as const : 'guess' as const, mark: (rev % 3 === 0 ? 'warm' : '') as '' | 'warm', markedAt: rev % 3 === 0 ? now : 0 },
  ];
  return {
    rev, now, phase: 'game', endsAt: 0, mode: 'riddle', count: 5, seated: 4,
    vote: null,
    riddle: {
      step: 'round', num: 2, of: QZ.RIDDLES, riddler: baron, category: QZ_CATEGORIES[0], hints: ['дымит', 'по морю'], misses: ['кит', 'чайка', 'буй'], warm: 2,
      endsAt: t0 + QZ.ROUND_MS, total: QZ.ROUND_MS, checking: null, last: null, lines,
    },
    results: null, evening: [{ ...me, pts: 6 }, { slot: 0, nick: 'Барон', pts: 3 }], noTokens: false,
    zat: { id: 1, text: `${baron.nick} загадал! Тема — Предмет`, clip: 'announce', at: t0 },
    people: [{ ...me, chair: stage ? -1 : 0, role: stage ? 'riddler' : '', vote: -1 }],
    call: null, swap: { n: 0, need: 2 },
  };
}
