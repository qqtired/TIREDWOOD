// Сцена, модуль которой грузится лениво (import()): оболочке сцена нужна сразу, а код режима приходит чуть позже.
// Пока модуль не пришёл — письма сервера копятся, кадр пустой; пришёл — сцена строится, входит и получает накопленное.
// Обычно модуль уже в кэше: оболочка начинает его грузить заранее (при входе на набережную, если режим включён).
import type { RoomKind, ServerMsg } from '../shared/messages.ts';
import type { Scene } from './scene.ts';
import type { Quality } from './settings.ts';
import type { TouchMode } from './touch.ts';

/** Что ещё умеют сцены режимов сверх Scene (у ленивой — передаются, когда модуль пришёл) */
export interface LazyInner extends Scene {
  setQuality?(q: Exclude<Quality, 'auto'>): void;
}

export class LazyScene implements Scene {
  readonly kind: RoomKind;
  private inner: LazyInner | null = null;
  private entered = false;
  private queue: ServerMsg[] = [];
  private size: [number, number] | null = null;
  private quality: Exclude<Quality, 'auto'> | null = null;
  private paused = false;

  constructor(kind: RoomKind, load: () => Promise<LazyInner>, onError: (e: unknown) => void) {
    this.kind = kind;
    load().then((s) => {
      this.inner = s;
      if (this.quality) s.setQuality?.(this.quality);
      if (this.size) s.resize(...this.size);
      if (!this.entered) return;
      s.enter();
      s.setPaused?.(this.paused);
      const q = this.queue;
      this.queue = [];
      for (const m of q) s.onJson(m);
    }, onError);
  }

  get loaded(): boolean {
    return this.inner !== null;
  }

  get wantsPointer(): boolean {
    return this.inner?.wantsPointer ?? true;
  }

  get touchMode(): TouchMode {
    return this.inner?.touchMode ?? 'none';
  }

  get touchUseIcon(): string | undefined {
    return this.inner?.touchUseIcon;
  }

  enter(): void {
    this.entered = true;
    this.queue = [];
    this.inner?.enter();
  }

  exit(): void {
    this.entered = false;
    this.queue = [];
    this.inner?.exit();
  }

  onJson(msg: ServerMsg): void {
    if (this.inner) this.inner.onJson(msg);
    else if (this.entered) this.queue.push(msg);
  }

  onSnapshot(buf: ArrayBuffer, at: number): void {
    this.inner?.onSnapshot(buf, at);
  }

  frame(now: number, dt: number): void {
    this.inner?.frame(now, dt);
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    return this.inner?.onKey(code, down, e) ?? false;
  }

  onUse(mouse: boolean): void {
    this.inner?.onUse(mouse);
  }

  resize(w: number, h: number): void {
    this.size = [w, h];
    this.inner?.resize(w, h);
  }

  setQuality(q: Exclude<Quality, 'auto'>): void {
    this.quality = q;
    this.inner?.setQuality?.(q);
  }

  setPaused(on: boolean): void {
    this.paused = on;
    this.inner?.setPaused?.(on);
  }

  debugState(): Record<string, unknown> | null {
    return this.inner ? this.inner.debugState() : { loading: true };
  }
}
