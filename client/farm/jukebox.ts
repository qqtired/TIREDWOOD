// Тот же автомат, окно и синтез песен, но очередь и точки внутри комнаты фермы.
import type * as THREE from 'three';
import { FARM_JUKE_SPOT } from '../../shared/farmseats.ts';
import type { JukeServerMsg } from '../../shared/jukebox.ts';
import { LobbyJukebox } from '../lobby/jukebox.ts';
import { Jukebox3D } from '../lobby/jukebox3d.ts';
import { JukeboxPanel } from '../ui/jukebox.ts';
import type { SceneDeps } from '../scene.ts';

export class FarmJukebox {
  private readonly juke: LobbyJukebox;
  constructor(d: SceneDeps, scene: THREE.Scene, solid: (on: boolean) => void) {
    this.juke = new LobbyJukebox({
      spots: [FARM_JUKE_SPOT], sound: d.sound, send: m => d.net.send(m),
      myPid: () => d.ui.me().pid, tokens: () => d.ui.me().tokens, ping: () => d.net.pingMs,
      toast: text => d.ui.toasts.show(text, 3000, 'farm-juke'),
      onOpen: () => { d.input.releaseAll(); d.input.unlock(); }, onClose: () => d.wantPointer(),
      setSolid: solid, refreshShadows: () => d.renderer.refreshShadows(),
    });
    this.juke.attachPanel(actions => new JukeboxPanel(document.body, actions, { eyebrow: 'Ферма · общая музыка' }));
    this.juke.attachModels([new Jukebox3D(scene, FARM_JUKE_SPOT)]);
  }
  get open(): boolean { return this.juke.isOpen; }
  get enabled(): boolean { return this.juke.enabled; }
  enter(): void { this.juke.reset(true); }
  exit(): void { this.juke.reset(false); }
  onJson(m: JukeServerMsg): void { this.juke.onMsg(m); }
  use(): void { this.juke.toggle(); }
  onKey(code: string, e: KeyboardEvent): boolean { return this.juke.onKey(code, e); }
  frame(dt: number, me: { x: number; y: number; z: number } | null, camera: THREE.Camera): void { this.juke.update(dt, me, camera); }
}
