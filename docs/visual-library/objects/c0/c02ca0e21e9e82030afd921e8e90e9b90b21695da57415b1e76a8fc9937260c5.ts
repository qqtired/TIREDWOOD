// Надписи на существующих табличках: меняется только текстура при серверном изменении имени.
import * as THREE from 'three';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { plotToWorld } from '../../../shared/farmmap.ts';
import type { FarmPlotView } from '../../../shared/farmnet.ts';
import { iconUrl } from '../ui/common.ts';

interface PlotSign { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string; image: HTMLImageElement | null }
export class FarmSigns {
  private readonly signs: PlotSign[] = [];
  constructor(scene: THREE.Scene) {
    const local = FARM_LAYOUT.plotLocal.sign;
    for (let i = 0; i < FARM_LAYOUT.plots.length; i++) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.08, .49), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
      const p = plotToWorld(i, local.x, local.z + .085);
      mesh.position.set(p.x, 1.46, p.z); mesh.rotation.y = FARM_LAYOUT.plots[i].yaw;
      scene.add(mesh); this.signs.push({ canvas, tex, key: '', image: null });
      this.set({ i, pid: 0, name: `Свободный участок ${i + 1}`, nick: '', icon: 'radish' } as FarmPlotView);
    }
    const cart = FARM_LAYOUT.objects.find(o => o.id === 'cart')!;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ad7a48'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#81563b'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, c.width - 14, c.height - 14);
    ctx.strokeStyle = '#956336'; ctx.lineWidth = 4;
    for (let y = 38; y < 256; y += 42) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(1012, y + 5); ctx.stroke(); }
    ctx.fillStyle = '#fff3d9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 94px Rubik, sans-serif'; ctx.fillText('НА НАБЕРЕЖНУЮ', 512, 128, 940);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.48, .36), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    mesh.position.set(cart.x, 2.10, cart.z + .95); scene.add(mesh);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.055, .85, .055), new THREE.MeshStandardMaterial({ color: 0x81563b, roughness: .9 }), 2);
    const m = new THREE.Matrix4();
    posts.setMatrixAt(0, m.makeTranslation(cart.x - .56, 1.65, cart.z + .94));
    posts.setMatrixAt(1, m.makeTranslation(cart.x + .56, 1.65, cart.z + .94));
    scene.add(posts);
  }
  set(v: FarmPlotView): void {
    const s = this.signs[v.i]; if (!s) return;
    const name = v.name || (v.pid ? `Ферма ${v.nick}` : `Свободный участок ${v.i + 1}`);
    const key = `${name}|${v.nick}|${v.icon}|${v.sleeping}`; if (key === s.key) return; s.key = key;
    const paint = (): void => {
      if (s.key !== key) return;
      const ctx = s.canvas.getContext('2d')!; ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = '#fbf2d7'; ctx.fillRect(0, 0, 512, 256); ctx.fillStyle = '#0d524d';
      if (s.image?.complete && s.image.naturalWidth) ctx.drawImage(s.image, 14, 58, 92, 92);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 34px Rubik, sans-serif';
      const words = name.split(' '); let line = '', lines: string[] = [];
      for (const word of words) { const n = line ? `${line} ${word}` : word; if (ctx.measureText(n).width > 385 && line) { lines.push(line); line = word; } else line = n; }
      if (line) lines.push(line); lines = lines.slice(0, 2);
      lines.forEach((t, i) => ctx.fillText(t, 304, lines.length === 1 ? 105 : 80 + i * 44, 388));
      ctx.font = '600 28px Rubik, sans-serif'; ctx.fillText(v.pid ? `${v.nick}${v.sleeping ? ' · спит' : ''}` : 'Можно занять', 256, 199, 480);
      s.tex.needsUpdate = true;
    };
    const image = new Image(); s.image = image; image.onload = paint; image.src = iconUrl(v.icon || 'radish'); paint();
  }
}
