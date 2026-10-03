import * as THREE from 'three';
import { BJ_TABLE, cardName, isRed, type BlackjackView } from '../../shared/blackjack.ts';

const TOP = .782;
const COLS = 9;
const ROWS = 6;
const CELL_W = 96;
const CELL_H = 136;
const BACK = 52;
const MAX_CARDS = 280;
const PHASE = { betting: 'Ставки 10 · 20 · 50', countdown: 'Приготовьтесь к раздаче', play: 'Ходы игроков', dealer: 'Ход дилера', result: 'Итог раунда' } as const;

/** Own 52-card atlas: the Durak atlas deliberately has only 36 faces. */
function atlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL_W;
  canvas.height = ROWS * CELL_H;
  const context = canvas.getContext('2d')!;
  for (let i = 0; i <= BACK; i++) {
    const x = i % COLS * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    context.fillStyle = '#fff8e9';
    context.beginPath();
    context.roundRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4, 8);
    context.fill();
    if (i === BACK) {
      context.fillStyle = '#294767';
      context.fillRect(x + 9, y + 9, CELL_W - 18, CELL_H - 18);
      context.strokeStyle = '#afc1c9';
      context.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        context.strokeRect(x + 14 + k * 4, y + 14 + k * 6, CELL_W - 28 - k * 8, CELL_H - 28 - k * 12);
      }
      context.fillStyle = '#fff0ca';
      context.font = 'bold 32px Rubik, sans-serif';
      context.textAlign = 'center';
      context.fillText('◆', x + CELL_W / 2, y + CELL_H / 2 + 10);
    } else {
      const name = cardName(i);
      const rank = name.slice(0, -1);
      const suit = name.slice(-1);
      context.fillStyle = isRed(i) ? '#b72739' : '#182b34';
      context.textAlign = 'left';
      context.font = 'bold 29px Rubik, sans-serif';
      context.fillText(rank, x + 10, y + 33);
      context.font = '29px serif';
      context.fillText(suit, x + 10, y + 59);
      context.textAlign = 'center';
      context.font = '47px serif';
      context.fillText(suit, x + CELL_W / 2, y + 101);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Label {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  text: string;
}

function label(width: number, height: number): Label {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.rotation.x = -Math.PI / 2;
  return { canvas, context: canvas.getContext('2d')!, texture, material, mesh, text: '' };
}

function drawLabel(label: Label, text: string, gold = false): void {
  if (label.text === `${gold}:${text}`) return;
  label.text = `${gold}:${text}`;
  const c = label.context;
  c.clearRect(0, 0, 512, 128);
  c.fillStyle = gold ? '#f5d98b' : '#f7f3de';
  c.font = '600 42px Rubik, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 256, 64, 490);
  label.texture.needsUpdate = true;
}

/** The renderer receives public DTOs only. It cannot reveal the dealer hole card. */
export class BlackjackTable3D {
  private readonly group = new THREE.Group();
  private readonly cards: THREE.InstancedMesh;
  private readonly cells = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARDS), 1);
  private readonly cardTexture = atlas();
  private readonly title = label(.73, .18);
  private readonly dealerLabel = label(.40, .10);
  private readonly seatLabels: Label[] = [];
  private readonly sign: THREE.Sprite;
  private readonly signCanvas = document.createElement('canvas');
  private readonly signTexture: THREE.CanvasTexture;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private current: BlackjackView | null = null;
  private chair = -1;
  private signText = '';
  private layoutKey = '';
  private count = 0;

  constructor(scene: THREE.Scene, x = 18, z = 11) {
    this.group.position.set(x, 0, z);
    const felt = new THREE.Mesh(new THREE.CircleGeometry(.64, 48), new THREE.MeshStandardMaterial({ color: 0x1d624b, roughness: .96 }));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = TOP - .003;
    this.group.add(felt);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.605, .618, 48), new THREE.MeshBasicMaterial({ color: 0xd8b675, side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = TOP - .002;
    this.group.add(rim);
    const geometry = new THREE.PlaneGeometry(.105, .148);
    this.cells.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aCard', this.cells);
    const material = new THREE.MeshBasicMaterial({ map: this.cardTexture, side: THREE.DoubleSide, alphaTest: .5 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aCard;\n${shader.vertexShader}`.replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCard, ${COLS}.0) + uv.x) / ${COLS}.0,
          1.0 - (floor(aCard / ${COLS}.0) + 1.0 - uv.y) / ${ROWS}.0);`);
    };
    material.customProgramCacheKey = () => 'blackjack-cards-52-v1';
    this.cards = new THREE.InstancedMesh(geometry, material, MAX_CARDS);
    this.cards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cards.frustumCulled = false;
    this.cards.count = 0;
    this.group.add(this.cards, this.title.mesh, this.dealerLabel.mesh);
    for (let i = 0; i < 6; i++) {
      const seatLabel = label(.28, .07);
      this.seatLabels.push(seatLabel);
      this.group.add(seatLabel.mesh);
    }
    this.signCanvas.width = 1024;
    this.signCanvas.height = 256;
    this.signTexture = new THREE.CanvasTexture(this.signCanvas);
    this.signTexture.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.signTexture, transparent: true, depthWrite: false }));
    this.sign.position.set(0, 1.25, 0);
    this.sign.scale.set(1.42, .355, 1);
    this.group.add(this.sign);
    scene.add(this.group);
    this.layout();
  }

  setMe(table: number, chair: number): void {
    const next = table === BJ_TABLE ? chair : -1;
    if (next === this.chair) return;
    this.chair = next;
    this.layoutKey = '';
    this.layout();
  }

  setView(view: BlackjackView): void {
    if (view.table !== BJ_TABLE || (this.current && view.rev < this.current.rev)) return;
    this.current = view;
    this.layout();
  }

  view(): BlackjackView | null { return this.current; }

  reset(): void {
    this.current = null;
    this.chair = -1;
    this.layoutKey = '';
    this.layout();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.sign.material.dispose();
    for (const label of [this.title, this.dealerLabel, ...this.seatLabels]) label.texture.dispose();
    this.cardTexture.dispose();
    this.signTexture.dispose();
  }

  private flat(label: Label, yaw: number, u: number, w: number): void {
    label.mesh.position.set(u * Math.cos(yaw) - w * Math.sin(yaw), TOP + .002, -u * Math.sin(yaw) - w * Math.cos(yaw));
    label.mesh.quaternion.setFromEuler(this.euler.set(-Math.PI / 2, yaw, 0, 'YXZ'));
  }

  private place(card: number, x: number, z: number, yaw: number, scale: number, order: number): void {
    if (this.count >= MAX_CARDS) return;
    this.position.set(x, TOP + .008 + order * .001, z);
    this.rotation.setFromEuler(this.euler.set(-Math.PI / 2, yaw, 0, 'YXZ'));
    this.scale.setScalar(scale);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.cards.setMatrixAt(this.count, this.matrix);
    this.cells.setX(this.count, card < 0 ? BACK : card);
    this.count++;
  }

  private layout(): void {
    const v = this.current;
    const key = JSON.stringify([this.chair, v && { ...v, left: 0 }]);
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.count = 0;
    const yaw = this.chair >= 0 ? (this.chair * 60 + 30) * Math.PI / 180 : -Math.PI / 2;
    this.sign.visible = this.chair < 0;
    drawLabel(this.title, 'БЛЭКДЖЕК', true);
    this.flat(this.title, yaw, 0, .25);
    this.title.mesh.scale.setScalar(v?.dealer.length ? .67 : 1);
    drawLabel(this.dealerLabel, v?.dealer.length ? `ДИЛЕР · ${v.dealerTotal ?? '?'}` : '6 КОЛОД · ВЫПЛАТА 3:2');
    this.flat(this.dealerLabel, yaw, 0, .115);
    const dealerCards = v?.dealer ?? [];
    const dealerStep = Math.min(.112, .40 / Math.max(1, dealerCards.length));
    dealerCards.forEach((card, index) => {
      const u = (index - (dealerCards.length - 1) / 2) * dealerStep;
      this.place(card, u * Math.cos(yaw), -u * Math.sin(yaw), yaw, 1, index);
    });
    this.seatLabels.forEach((label, chair) => {
      const seat = v?.seats[chair];
      const a = (chair * 60 + 30) * Math.PI / 180;
      const active = v?.phase === 'play' && v.turn === chair;
      const name = seat?.k ? seat.nick.slice(0, 12) : `${chair + 1} · свободно`;
      const totals = seat?.hands.map((hand) => `${hand.total}${hand.status === 'bust' ? '×' : ''}`).join(' / ');
      drawLabel(label, `${active ? '▶ ' : ''}${name}${totals ? ` · ${totals}` : seat?.bet ? ` · ${seat.bet}` : ''}`, active);
      this.flat(label, a, 0, -.565);
      for (const [h, hand] of (seat?.hands ?? []).entries()) {
        const handOffset = seat!.hands.length === 2 ? (h === 0 ? -.085 : .085) : 0;
        const step = Math.min(.047, (seat!.hands.length === 2 ? .12 : .22) / Math.max(1, hand.cards.length - 1));
        hand.cards.forEach((card, index) => {
          const u = handOffset + (index - (hand.cards.length - 1) / 2) * step;
          const radius = .425;
          this.place(card, Math.sin(a) * radius + u * Math.cos(a), Math.cos(a) * radius - u * Math.sin(a), a, .61, index);
        });
      }
    });
    this.cards.count = this.count;
    this.cards.instanceMatrix.needsUpdate = true;
    this.cells.needsUpdate = true;
    const sub = v ? PHASE[v.phase] : PHASE.betting;
    if (this.signText !== sub) {
      this.signText = sub;
      const c = this.signCanvas.getContext('2d')!;
      c.clearRect(0, 0, 1024, 256);
      c.fillStyle = '#173e31';
      c.strokeStyle = '#e2c481';
      c.lineWidth = 5;
      c.beginPath();
      c.roundRect(8, 8, 1008, 240, 30);
      c.fill();
      c.stroke();
      c.textAlign = 'center';
      c.fillStyle = '#f7dfa2';
      c.font = 'bold 78px Rubik, sans-serif';
      c.fillText('БЛЭКДЖЕК', 512, 116);
      c.fillStyle = '#fff8e8';
      c.font = '42px Rubik, sans-serif';
      c.fillText(sub, 512, 192);
      this.signTexture.needsUpdate = true;
    }
  }
}
