// Афиша «Сегодня в городе» на фасаде кафе «Чайка» новой набережной (Х-9): готовая меловая доска client/lobby/plaza/agenda.ts
// на поле anchor_afisha_face модели pav_cafe (2,6 × 2,1 м, лицом наружу). Строки — agendaRows(LiveIn): те же, что читает вслух
// Тоня и считает вывеска кафе. Холст перерисовывается только когда меняется текст (в худшем случае раз в секунду).
import * as THREE from 'three';
import { AgendaBoard } from '../plaza/agenda.ts';
import type { AgendaRow } from '../plaza/live.ts';

/** Поле модели: полуразмеры 1,3 × 1,05 м у anchor_afisha_face (pav_cafe.glb) */
export const AFISHA_W = 2.6;
export const AFISHA_H = 2.1;
/** Пикселей холста на метр: восемь-двенадцать строк читаются от кафе, а холст остаётся небольшим */
const PPM = 400;

export class AfishaBoard {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly board: AgendaBoard;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(AFISHA_W * PPM);
    canvas.height = Math.round(AFISHA_H * PPM);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // как у досок площади (HonorBoard, RecentBoard): свой свет доски — чтобы читалась и в тени козырька
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.92 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(AFISHA_W, AFISHA_H), mat);
    this.mesh.name = 'plaza3-afisha';
    // встанет на поле модели, когда павильон загрузится (pavilions.ts → BOARD_FIELDS.afisha); до этого не рисуется
    this.mesh.visible = false;
    this.mesh.userData.p3keep = true;
    this.board = new AgendaBoard(this.mesh);
    this.board.set([]);
  }

  /** Строки афиши; те же слова второй раз не перерисовываются */
  set(rows: readonly AgendaRow[]): void {
    this.board.set(rows);
  }
}
