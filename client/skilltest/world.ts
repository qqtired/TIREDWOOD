// «Высотная верфь»: authored harbour structures around the unchanged authoritative course.
import * as THREE from 'three';
import { moverU } from '../../shared/aquadyn.ts';
import { makeSkillMap } from '../../shared/skillmap.ts';
import { skillHazardAngle, skillPulseState } from '../../shared/skillphysics.ts';
import { SKILL_CHECKPOINTS } from '../../shared/skilltest.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { craneGeometry, fitShadow, makeBoat } from '../render/kit.ts';
import { EVENING, fogColor, makeSea, makeSky } from '../render/sky.ts';
import type { Renderer } from '../render/renderer.ts';
import type { Quality } from '../settings.ts';
import { YARD, YardBatch, yardDeck, yardMaterials, yardMover, yardPulse, yardSweeper, yardTower, type YardHazard, type YardMover } from './shipyard.ts';

export const SHIPYARD_STAGES = ['Приёмная палуба', 'Подвесной паром', 'Ветровой стенд', 'Точная сборка', 'Испытание роторов', 'Грузовой лифт', 'Спуск кассет', 'Последний пролёт'];
const ACCENTS = [YARD.teal, YARD.teal, YARD.orange, YARD.teal, YARD.orange, YARD.teal, YARD.orange, YARD.teal];

export class SkillWorld {
  readonly map = makeSkillMap(); readonly collision = new CollisionWorld(this.map);
  readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(65, 1, .1, 1600);
  private readonly renderer: Renderer;
  private readonly materials = yardMaterials();
  private readonly movers: YardMover[] = []; private readonly hazards: YardHazard[] = [];
  private readonly beacons: THREE.MeshStandardMaterial[] = [];
  private readonly detail = new THREE.Group(); private readonly boats: THREE.Group[] = [];
  private readonly sun = new THREE.DirectionalLight(0xffe4b9, 3.0);
  private readonly skyMat: THREE.ShaderMaterial; private readonly seaMat: THREE.ShaderMaterial;
  private quality: Quality = 'high';

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    const palette = { ...EVENING, fogNear: 115, fogFar: 720 };
    const fog = fogColor(palette); this.scene.background = fog.clone(); this.scene.fog = new THREE.Fog(fog, palette.fogNear, palette.fogFar);
    this.scene.add(new THREE.HemisphereLight(0xd7e5f6, 0x746650, 1.55));
    const center = new THREE.Vector3(118, 39, 0); this.sun.position.copy(center).addScaledVector(EVENING.sunDir, 320); this.sun.target.position.copy(center); this.sun.castShadow = true;
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-10, 32, -14), new THREE.Vector3(249, 54, 14)));
    this.sun.shadow.bias = -.00045; this.sun.shadow.normalBias = .025; this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);
    const sky = makeSky(palette), sea = makeSea(palette); this.skyMat = sky.material; this.seaMat = sea.material; this.scene.add(sky, sea);

    const structure = new YardBatch(), detail = new YardBatch();
    for (const p of this.map.pads) {
      const checkpoint = SKILL_CHECKPOINTS.some(cp => cp.x === p.x && cp.z === p.z && cp.y === p.y);
      yardDeck(structure, p.x, p.y, p.z, p.w, p.d, ACCENTS[Math.min(7, p.section)], checkpoint);
      for (const side of [-1, 1]) {
        structure.beam('edge', 0x6e7169, [p.x, 49, side * 9.5], [p.x, p.y - .55, p.z + side * (p.d / 2 + .98)], .045);
        structure.box('steel', YARD.orange, [p.x, p.y - .5, p.z + side * (p.d / 2 + .5)], [.22, .4, 1.12], .03);
      }
      if (checkpoint) this.checkpoint(structure, p.x, p.y, p.z, p.section);
    }
    // Four real gantries hold the cable course above the wharf. All towers are outside playable side bounds.
    for (const x of [0, 60, 150, 240]) yardTower(structure, x, x === 150 ? 53 : 50);
    for (const side of [-1, 1]) {
      for (const [from, to] of [[0, 60], [60, 150], [150, 240]]) {
        structure.beam('edge', 0x6d7069, [from, 49.1, side * 9.5], [to, 49.1, side * 9.5], .075);
      }
    }
    // Each mover gets a fixed rail/hoist station plus its independent moving carriage.
    this.map.movers.forEach(m => {
      const x = (m.x0 + m.x1) / 2, z = (m.z0 + m.z1) / 2, w = m.x1 - m.x0, d = m.z1 - m.z0;
      const roof = m.kind === 'lift' ? 51 : m.kind === 'sink' ? 46 : 47.2;
      const accent = m.kind === 'sink' ? YARD.orange : YARD.teal;
      const model = yardMover(w, d, accent, m.kind, roof, this.materials); this.movers.push(model); this.scene.add(model.root);
      for (const side of [-1, 1]) {
        const zz = z + side * (d / 2 + .98), start = Math.min(x, x + m.dx) - w / 2 - .7, end = Math.max(x, x + m.dx) + w / 2 + .7;
        structure.box('steel', YARD.navy, [(start + end) / 2, roof + .2, zz], [end - start, .35, .32]);
        structure.box('edge', YARD.edge, [(start + end) / 2, roof + .41, zz], [end - start + .1, .08, .48]);
        if (m.kind !== 'lift') for (const endX of [start + .2, end - .2]) structure.beam('edge', 0x6e7169, [endX, 49, side * 9.5], [endX, roof + .45, zz], .045);
        else if (side > 0) structure.box('steel', YARD.navy, [x, roof + .2, z + d / 2 + 1.3], [.28, .3, 3.5]);
        if (m.kind === 'lift') {
          structure.box('steel', YARD.navy, [x, 40, zz + side * .38], [.35, 22, .35]);
          for (let y = 30; y < 49; y += 3) structure.box('steel', YARD.edge, [x, y, zz + side * .38], [.8, .16, .48]);
        }
      }
      if (m.kind === 'lift') {
        structure.box('steel', YARD.navy, [x, 29.1, z], [.35, .32, d + 3]);
        for (const side of [-1, 1]) {
          const zz = z + side * (d / 2 + .98);
          structure.beam('steel', YARD.navy, [150, 49.5, zz], [150, 53, zz], .2);
          structure.beam('steel', YARD.navy, [150, 51.3, zz], [x + 2, 51.3, zz], .22);
          structure.beam('edge', YARD.edge, [150, 49.5, zz], [x + 2, 51.3, zz], .13);
        }
      }
      // A hoist drum above each station explains the cables' motion.
      structure.cylinder('brass', YARD.brass, [x, roof + .7, z], .48, 1.1, 12, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      structure.box('steel', YARD.navy, [x, roof + .37, z], [1.6, .3, 1.2], .06);
    });
    this.map.hazards.forEach(h => {
      const model = h.kind === 'sweep' ? yardSweeper(h.radius, this.materials) : yardPulse(h.radius, this.materials);
      model.root.position.set(h.x, h.top, h.z); this.hazards.push(model); this.scene.add(model.root);
    });
    // Distinct section silhouettes: a wind-compressor rack, twin rotors, tall lift, and hanging cassette gantry.
    for (const x of [70, 78, 84]) {
      structure.cylinder('steel', YARD.teal, [x, 39.1, -4.15], .56, 1.7, 12, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      structure.beam('brass', YARD.brass, [x, 39.4, -4.15], [x, 40.1, -3.45], .095);
    }
    for (const x of [181.5, 210]) {
      for (const z of [-4.7, 4.7]) structure.box('steel', YARD.navy, [x, 39, z], [.26, 17, .26]);
      structure.box('steel', YARD.orange, [x, 47.3, 0], [.65, .5, 10]);
      structure.box('steel', YARD.navy, [x, 30.5, 0], [.3, .25, 9.7]);
    }
    for (const z of [-4.7, 4.7]) { structure.box('steel', YARD.navy, [195.5, 47.2, z], [30, .36, .36]); structure.box('steel', YARD.navy, [195.5, 30.5, z], [30, .22, .3]); }
    structure.flush(this.scene, this.materials);
    this.harbour(detail); detail.flush(this.detail, this.materials); this.scene.add(this.detail);
    this.plaque('ВЫСОТНАЯ ВЕРФЬ', 'УЧЕБНЫЙ ПОЛИГОН · 40 М', -1.2, 43, -8.2, 4.4, 1.35, -Math.PI / 2);
    this.update(0, 0); this.setQuality('high');
  }

  private checkpoint(b: YardBatch, x: number, y: number, z: number, index: number): void {
    const side = -6;
    b.beam('steel', YARD.navy, [x - 1.9, y - .45, z - 3.5], [x - 1.9, y - .45, z + side], .15);
    b.beam('edge', YARD.edge, [x - 1.9, y - 1.3, z - 3.5], [x - 1.9, y + .05, z + side], .1);
    b.box('steel', YARD.navy, [x - 1.9, y + .8, z + side], [.18, 1.6, .18]);
    b.box('brass', YARD.brass, [x - 1.9, y + 1.69, z + side], [.48, .11, .48], .03);
    b.box('steel', YARD.navy, [x - 1.9, y + 2.1, z + side], [.58, .12, .58], .05);
    const material = new THREE.MeshStandardMaterial({ color: 0xf1d8a2, emissive: index === 0 ? YARD.teal : 0x9c6731, emissiveIntensity: .85, roughness: .35 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .3, 12), material); lens.position.set(x - 1.9, y + 1.9, z + side); this.scene.add(lens); this.beacons.push(material);
    this.plaque(index === 0 ? 'СТАРТ' : String(index).padStart(2, '0'), index === 8 ? 'ФИНИШ' : SHIPYARD_STAGES[index], x - 1.9, y + .85, z + side, 1.7, 1.08, -Math.PI / 2);
  }
  /** An actual bolted board on its support. Not a camera-facing billboard. */
  private plaque(title: string, sub: string, x: number, y: number, z: number, w: number, h: number, yaw: number): void {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = yaw;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w + .08, h + .08, .09), new THREE.MeshStandardMaterial({ color: YARD.brass, roughness: .55, metalness: .55 })); group.add(plate);
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#243b49'; ctx.fillRect(0, 0, 768, 256); ctx.strokeStyle = '#b99b63'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, 744, 232);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f0dfb9'; ctx.font = `700 ${title.length > 5 ? 43 : 110}px Rubik, sans-serif`; ctx.fillText(title, 384, 102, 715);
    ctx.fillStyle = '#9ac1b6'; ctx.font = '500 27px Rubik, sans-serif'; ctx.fillText(sub.toUpperCase(), 384, 203, 715);
    for (const xx of [26, 742]) for (const yy of [26, 230]) { ctx.fillStyle = '#b6a17e'; ctx.beginPath(); ctx.arc(xx, yy, 5, 0, Math.PI * 2); ctx.fill(); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture })); face.position.z = .047; group.add(face); this.scene.add(group);
  }
  /** Shallow facade construction on the existing volumes; stays visible even on low quality. */
  private warehouseFacade(b: YardBatch, x: number, base: number, z: number, w: number, h: number, d: number): void {
    for (const axis of ['x', 'z'] as const) for (const side of [-1, 1]) {
      const span = axis === 'z' ? w : d, half = (axis === 'z' ? d : w) / 2;
      const panel = (key: 'steel' | 'paint' | 'door', color: number, along: number, y: number, width: number, height: number, offset: number, thickness = .08) => {
        const at: [number, number, number] = axis === 'z' ? [x + along, y, z + side * (half + offset)] : [x + side * (half + offset), y, z + along];
        const size: [number, number, number] = axis === 'z' ? [width, height, thickness] : [thickness, height, width];
        b.box(key, color, at, size);
      };
      const bandY = base + h * .79, bandH = Math.max(1.35, h * .2), bandW = span - 2;
      panel('steel', 0x667a7c, 0, bandY, bandW + .24, bandH + .24, .07, .12);
      panel('paint', 0x203b49, 0, bandY, bandW, bandH, .15, .06);
      for (let at = -bandW / 2 + 1.7; at < bandW / 2; at += 1.7) panel('steel', 0x789091, at, bandY, .085, bandH, .2, .075);
      panel('steel', 0x7d908d, 0, bandY, bandW, .075, .2);
      const gateW = Math.min(5, span * .24), gateH = h * .5;
      for (const at of [-span * .25, span * .25]) {
        panel('steel', 0x435662, at, base + gateH / 2, gateW + .3, gateH + .18, .08, .15);
        panel('door', 0x6e8790, at, base + gateH / 2, gateW, gateH, .18, .08);
        panel('paint', 0xc6aa6f, at, base + gateH + .22, gateW + .4, .18, .15);
      }
      // Stone sill and exposed corner pilasters break the large uniform wall without changing its footprint.
      panel('steel', 0x596a6d, 0, base + .14, span, .24, .1, .17);
      for (const at of [-span / 2 + .2, span / 2 - .2]) panel('paint', 0x9b9d8a, at, base + h / 2, .25, h, .07, .12);
    }
  }
  private harbour(b: YardBatch): void {
    const essential = new YardBatch();
    essential.box('concrete', 0x8c8c7d, [120, -.8, 62], [440, 3, 64], .5);
    essential.box('concrete', 0x5a6465, [120, -2.1, 28.5], [440, 5, 1.2]);
    // Modular sheds have pitched roofs and loading bays, not a random pile of cubes.
    for (let i = 0; i < 8; i++) {
      const x = -38 + i * 44, width = 27, depth = 22, height = 7 + i % 3;
      essential.box('brick', i % 2 ? 0xa39487 : 0xb4a18a, [x, height / 2 + .7, 59], [width, height, depth]);
      const profile = new THREE.Shape(); profile.moveTo(-(width + 1) / 2, 0); profile.lineTo(0, 3.5); profile.lineTo((width + 1) / 2, 0); profile.closePath();
      const roof = new THREE.ExtrudeGeometry(profile, { depth: depth + 1, bevelEnabled: false, steps: 1 }); roof.translate(0, 0, -(depth + 1) / 2);
      essential.add('steel', roof, 0x4a5a5c, [x, height + .8, 59]);
      this.warehouseFacade(essential, x, .7, 59, width, height, depth);
    }
    for (const x of [-30, 75, 180, 285]) essential.add('steel', craneGeometry(x, .7, 30, Math.PI, .75), YARD.navy);
    // Twin repair docks face the course. They are below the fall-reset plane, never playable extra landings.
    essential.box('concrete', 0xa29b84, [130, -.45, -46], [226, 1.6, 75]);
    for (const x of [18, 134, 242]) {
      essential.box('concrete', 0x7c8581, [x, 2.1, -46], [9, 5, 79]);
      essential.box('paint', 0xc9b986, [x, 4.66, -46], [9.15, .13, 79.2]);
      for (let z = -79; z < -11; z += 7) { essential.box('rubber', YARD.rubber, [x + (x === 242 ? -4.6 : 4.6), 2.2, z], [.3, 2.1, 1]); b.box('paint', YARD.orange, [x, 4.75, z], [.24, .01, 2.8]); }
    }
    essential.box('concrete', 0x858c83, [130, 2, -86], [242, 5, 22]);
    for (const x of [45, 158, 229]) essential.add('steel', craneGeometry(x, 4.5, -82, Math.PI, .75), x === 158 ? 0x9e7148 : YARD.navy);
    for (const x of [72, 190]) {
      const vessel = makeBoat(x === 72 ? 0x426473 : 0x91634b); vessel.scale.set(3.2, 3, 4.2); vessel.rotation.y = Math.PI / 2; vessel.position.set(x, 2.7, -44); this.scene.add(vessel);
      for (const xx of [-10, -3, 4, 10]) { essential.box('wood', YARD.darkWood, [x + xx, .92, -44], [1.6, 1.2, 7.4]); essential.box('concrete', 0x737f7c, [x + xx, .23, -44], [2.2, .3, 8]); }
    }
    for (const x of [43, 91, 181, 229]) {
      essential.box('brick', 0xada192, [x, 10.5, -99], [32, 12, 17]);
      const profile = new THREE.Shape(); profile.moveTo(-17, 0); profile.lineTo(0, 4); profile.lineTo(17, 0); profile.closePath();
      const roof = new THREE.ExtrudeGeometry(profile, { depth: 18, bevelEnabled: false }); roof.translate(0, 0, -9); essential.add('steel', roof, 0x53646a, [x, 16.6, -99]);
      this.warehouseFacade(essential, x, 4.5, -99, 32, 12, 17);
    }
    // Large concrete pours have expansion joints; a few mooring bollards provide human scale.
    for (let x = 27; x < 240; x += 18) essential.box('paint', 0x6f7974, [x, .357, -46], [.045, .009, 74.4]);
    for (const z of [-69, -46, -23]) essential.box('paint', 0x6f7974, [130, .357, z], [224, .009, .045]);
    for (const x of [18, 134, 242]) {
      for (let z = -77; z < -12; z += 16) essential.box('paint', 0x797c68, [x, 4.733, z], [8.9, .009, .045]);
      for (const z of [-72, -51, -30]) {
        const bx = x + (x === 242 ? -3 : 3);
        essential.box('steel', YARD.edge, [bx, 4.78, z], [.65, .11, .62]);
        essential.cylinder('steel', YARD.navy, [bx, 5.04, z], .2, .5, 8);
        essential.cylinder('brass', YARD.brass, [bx, 5.3, z], .31, .11, 10);
      }
    }
    for (let x = -45; x < 306; x += 32) {
      essential.box('paint', 0x727974, [x, .711, 43], [.045, .009, 25]);
      essential.cylinder('steel', YARD.navy, [x, 1, 30.8], .21, .55, 8);
      essential.cylinder('edge', YARD.edge, [x, 1.29, 30.8], .31, .11, 10);
    }
    essential.flush(this.scene, this.materials);
    // Corrugated cargo containers with readable doors and ribbed sides.
    for (let i = 0; i < 18; i++) {
      const x = -15 + i * 17, z = 36 + i % 3 * 4.3, color = [0x3b737d, 0x98634d, 0xa09062, 0x52677b][i % 4];
      b.box('steel', color, [x, 2.1, z], [12.2, 2.6, 2.44], .045);
      for (let rib = 0; rib < 12; rib++) b.box('steel', color, [x - 5.6 + rib, 2.1, z - 1.25], [.08, 2.4, .08]);
      for (const dx of [-5.7, 5.7]) b.box('edge', YARD.edge, [x + dx, 2.1, z - 1.29], [.08, 2.4, .08]);
    }
    for (const x of [12, 125, 230]) {
      const boat = makeBoat(x === 125 ? 0x405c67 : 0x8c6548); boat.position.set(x, -1.35, -35 - x % 3 * 8); boat.rotation.y = -.65; boat.scale.setScalar(2.1); this.scene.add(boat); this.boats.push(boat);
    }
  }
  setQuality(q: Quality, slow = false): void {
    this.quality = slow ? 'low' : q; this.detail.visible = this.quality !== 'low';
    this.boats.forEach((boat, i) => boat.visible = this.quality !== 'low' || i === 0);
    const size = this.quality === 'high' || this.quality === 'auto' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; this.renderer.refreshShadows(); }
  }
  update(tick: number, checkpoint: number): void {
    const time = tick / 60; this.skyMat.uniforms.uTime.value = time; this.seaMat.uniforms.uTime.value = time;
    this.map.movers.forEach((m, i) => {
      const u = moverU(m, tick), v = this.movers[i], top = m.top + m.dy * u;
      v.root.position.set((m.x0 + m.x1) / 2 + m.dx * u, top, (m.z0 + m.z1) / 2 + m.dz * u);
      const length = v.roof - top - .25;
      v.wheels.position.y = v.roof - top;
      for (const wheel of v.wheelDiscs) wheel.rotation.x = (m.dx * u + m.dy * u) / .26;
      if (v.counterweight) v.counterweight.position.y = v.roof - 2 - m.dy * u - top;
      if (v.counterCable) { const bottom = v.roof - 1.35 - m.dy * u - top, upper = v.roof - top; v.counterCable.scale.y = upper - bottom; v.counterCable.position.y = (upper + bottom) / 2; }
      for (const cable of v.cables) { cable.scale.y = length; cable.position.y = length / 2 + .02; }
      const period = m.rest + m.go + m.stay + m.back, phase = ((tick - m.phase) % period + period) % period;
      const warn = m.kind === 'sink' && phase >= m.rest - 48 && phase < m.rest;
      for (const lamp of v.lamps) { lamp.emissive.setHex(warn ? YARD.orange : YARD.teal); lamp.emissiveIntensity = warn ? 1 + .5 * Math.sin(tick * .45) : .4; }
    });
    this.map.hazards.forEach((h, i) => {
      const v = this.hazards[i];
      if (h.kind === 'sweep') v.rotor.rotation.y = -skillHazardAngle(h, tick);
      else {
        const state = skillPulseState(h, tick); v.jets.visible = state === 'hit';
        for (const fan of v.rotor.children) fan.rotation.z = time * (state === 'warn' ? 32 : state === 'hit' ? 70 : 4);
        for (const lamp of v.lights) { lamp.emissive.setHex(state === 'hit' ? 0xe56b37 : state === 'warn' ? 0xe6ad4e : YARD.teal); lamp.emissiveIntensity = state === 'safe' ? .35 : 1.3; }
      }
    });
    this.beacons.forEach((m, i) => { m.emissive.setHex(i <= checkpoint ? YARD.teal : i === checkpoint + 1 ? YARD.brass : 0x625742); m.emissiveIntensity = i <= checkpoint + 1 ? .85 : .25; });
    for (let i = 0; i < this.boats.length; i++) { const boat = this.boats[i]; boat.position.y = -1.35 + Math.sin(time * .9 + i * 2) * .08; boat.rotation.z = Math.sin(time * .7 + i) * .025; }
  }
  resize(w: number, h: number): void { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }
  render(): void { this.renderer.render(this.scene, this.camera, EVENING.exposure); }
}
