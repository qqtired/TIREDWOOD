// Игровая версия принятой башни: архитектура Blender v3, поверхности и анимации из той же карты, что сервер.
import * as THREE from 'three';
import { makeSkillMap, type SkillRect } from '../../shared/skillmap.ts';
import { cloudHeldBy, makeSackPose, moverAt, sackAt, stepHeldBy } from '../../shared/skillphysics.ts';
import { cloudState, cloudReform, crumbleState, orbitAngle, ramState, spinAngle, windState, type RamPhase } from '../../shared/skilltraps.ts';
import { SKILL_SECTIONS } from '../../shared/skilltest.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { fitShadow } from '../render/kit.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSky } from '../render/sky.ts';
import type { Quality } from '../settings.ts';
import { Batch, C, SKY_DAY, makeMaterials, signTexture } from './look.ts';
import { loadTowerSource, sourcePart, towerCore, TOWER_ATLAS_URL } from './model-source.ts';

export interface SkillMe { x: number; y: number; z: number; grounded: number }
type MovingVisual = { root: THREE.Group; box: number; squash: number };
type CloudVisual = { root: THREE.Group; mat: THREE.MeshStandardMaterial; state: number };

export class CloudTowerWorld {
  readonly map = makeSkillMap();
  readonly collision = new CollisionWorld(this.map);
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, .1, 1800);
  loading = true;
  loadError: string | null = null;
  private readonly renderer: Renderer;
  private readonly mats = makeMaterials();
  private readonly sun = new THREE.DirectionalLight(0xfff1d9, 2.6);
  private readonly moving: MovingVisual[] = [];
  private readonly springs: MovingVisual[] = [];
  private readonly clouds: CloudVisual[] = [];
  private readonly steps: THREE.Group[] = [];
  private readonly sacks: THREE.Group[] = [];
  private readonly rams: Array<{ arm: THREE.Group; light: THREE.MeshStandardMaterial }> = [];
  private readonly flags: Array<{ mesh: THREE.Mesh; cp: number; rest: Float32Array }> = [];
  private readonly sails: Array<{ mesh: THREE.Mesh; phase: number; rest: Float32Array }> = [];
  private readonly streams: Array<{ mesh: THREE.InstancedMesh; y0: number; y1: number; x: number; z: number }> = [];
  private readonly wheel = new THREE.Group();
  private readonly carousels: Array<{ disc: THREE.Group; bar: THREE.Group }> = [];
  private readonly bell = new THREE.Group();
  private readonly cloudSea = new THREE.Group();
  private readonly labels = new THREE.Group();
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly sack = makeSackPose();
  private readonly ram = { e: 0, phase: 'rest' as RamPhase, k: 0 };
  private readonly dummy = new THREE.Object3D();
  private shadowY = -1000;
  private bellPower = 0;
  private bellTime = 0;
  onPuff: ((x: number, y: number, z: number, kind: 'dust' | 'cloud' | 'step') => void) | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    const fog = fogColor(SKY_DAY);
    this.scene.background = fog.clone(); this.scene.fog = new THREE.Fog(fog, 120, 700);
    this.scene.add(new THREE.HemisphereLight(0xe9f4ff, 0xc5aa88, 1.3));
    this.sun.castShadow = true; this.sun.shadow.bias = -.0003; this.sun.shadow.normalBias = .04;
    this.sun.shadow.mapSize.set(2048, 2048); this.scene.add(this.sun, this.sun.target);
    this.scene.add(makeSky(SKY_DAY));
    this.buildRoute(); this.buildCloudSea();
    this.scene.add(this.labels);
    const tex = new THREE.TextureLoader().loadAsync(TOWER_ATLAS_URL);
    Promise.all([loadTowerSource(), tex]).then(([source, atlas]) => {
      atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
      this.applyTextures(atlas);
      const core = towerCore(source);
      core.traverse(o => { if (o instanceof THREE.Mesh) o.material = this.materialFor((o.material as THREE.Material).name, atlas, true); });
      this.scene.add(core);
      this.buildMechanisms(source, atlas);
      this.loading = false; this.renderer.refreshShadows();
    }).catch((e: unknown) => { this.loadError = String(e); this.loading = false; console.error('Башня не загрузилась', e); });
    this.update(0, 0, 0);
  }

  private textured(mat: THREE.MeshStandardMaterial, atlas: THREE.Texture, kind: number): THREE.MeshStandardMaterial {
    mat.map = null;
    mat.onBeforeCompile = shader => {
      shader.uniforms.towerAtlas = { value: atlas };
      shader.vertexShader = `varying vec3 vTowerP; varying vec3 vTowerN;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTowerP = (modelMatrix * vec4(position, 1.0)).xyz; vTowerN = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = `uniform sampler2D towerAtlas; varying vec3 vTowerP; varying vec3 vTowerN;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 tn = abs(vTowerN);
        vec2 uv = tn.y > .65 ? vTowerP.xz : tn.x > tn.z ? vTowerP.zy : vTowerP.xy;
        float kind = ${kind.toFixed(1)};
        if (kind > 3.5) kind = diffuseColor.r > diffuseColor.g * 1.32 ? 2.0 : 1.0;
        vec2 corner = kind < .5 ? vec2(0.0,.5) : kind < 1.5 ? vec2(.5,.5) : kind < 2.5 ? vec2(0.0,0.0) : vec2(.5,0.0);
        vec2 sampleUv = corner + vec2(.002) + fract(uv / (kind < .5 ? 3.0 : kind < 2.5 ? 4.0 : 1.0)) * .496;
        vec3 albedo = texture2D(towerAtlas, sampleUv).rgb;
        diffuseColor.rgb *= mix(vec3(1.0), albedo * (kind < .5 ? 1.55 : kind < 1.5 ? 1.28 : kind < 2.5 ? 1.8 : 1.3), .72);
      `);
    };
    mat.customProgramCacheKey = () => `tower-atlas-v1-${kind}`;
    mat.needsUpdate = true; return mat;
  }

  private readonly imported = new Map<string, THREE.Material>();
  private materialFor(name: string, atlas: THREE.Texture, architecture = false): THREE.Material {
    const key = `${architecture ? 'core' : 'machine'}-${name}`;
    let m = this.imported.get(key); if (m) return m;
    const metal = name.includes('gloss');
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal ? .38 : name.includes('wood') ? .78 : .88, metalness: metal ? .38 : 0 });
    m = metal ? mat : this.textured(mat, atlas, name.includes('wood') ? 0 : architecture ? 4 : 3);
    this.imported.set(key, m); return m;
  }

  private applyTextures(atlas: THREE.Texture): void {
    for (const [key, kind] of [['wood', 0], ['deck', 0], ['plaster', 1], ['brick', 2], ['cloth', 3]] as const) this.textured(this.mats[key] as THREE.MeshStandardMaterial, atlas, kind);
  }

  private rootDeck(w: number, d: number, h = .4, color: number = C.woodDark): THREE.Group {
    const root = new THREE.Group(), b = new Batch(); b.deck(-w / 2, w / 2, -d / 2, d / 2, 0, h, color); b.flush(root, this.mats, false); return root;
  }

  private buildRoute(): void {
    const batch = new Batch();
    for (const p of this.map.pads) {
      if (p.look === 'tower' || p.look === 'belfry' || p.look === 'post' || p.look === 'housing' || p.look === 'disc') continue;
      const box = this.map.boxes[p.box], [x0, y0, z0] = box.min, [x1, y1, z1] = box.max;
      if (p.bounce) {
        const g = this.rootDeck(x1 - x0, z1 - z0, y1 - y0, C.roof);
        this.springBed(g, x1 - x0, z1 - z0);
        g.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2); this.scene.add(g); this.springs.push({ root: g, box: p.box, squash: 0 });
      } else batch.deck(x0, x1, z0, z1, y1, y1 - y0, p.cp !== undefined ? C.roof : C.woodDark);
      // Две несущие балки: законченные настилы, связанные с башней; целиком ниже плоскости ног.
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, r = Math.hypot(x, z);
      if (r > 9 && p.cp === undefined && !p.bounce) {
        const scale = 7 / r;
        batch.beam('wood', C.woodDark, [x * scale, y1 - 2.1, z * scale], [x, y0 - .10, z], .10, 6);
        batch.beam('wood', C.woodDark, [x * scale, y0 - .17, z * scale], [x, y0 - .17, z], .11, 6);
      }
      if (p.cp !== undefined) this.checkpointFlag(batch, p.cp);
    }
    for (const st of this.map.steps) {
      const r = st.rect, root = this.rootDeck(r.x1 - r.x0, r.z1 - r.z0, .45);
      root.position.set((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2); this.steps.push(root); this.scene.add(root);
    }
    for (const c of this.map.clouds) {
      const r = c.rect, root = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xfffcf2, roughness: .9, transparent: true });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, .16, r.z1 - r.z0), mat); floor.position.y = -.08; root.add(floor);
      const geo = new THREE.SphereGeometry(1, 14, 8);
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7, mesh = new THREE.Mesh(geo, mat); mesh.scale.set(.77, .33, .77);
        mesh.position.set(Math.cos(a) * .72, -.35, Math.sin(a) * .72); root.add(mesh);
      }
      root.position.set((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2); this.scene.add(root); this.clouds.push({ root, mat, state: 0 });
    }
    for (const carousel of this.map.carousels!) {
    const d = carousel.disc, disc = new THREE.Group(), bar = new THREE.Group();
    // Пол остаётся квадратным по коллизии, вращается рисунок верха и перекладина. Кромка не исчезает из-под ног.
    const plate = this.rootDeck(d.r * 2, d.r * 2); plate.position.set(d.cx, d.top, d.cz); this.scene.add(plate);
    const marker = new THREE.Mesh(new THREE.RingGeometry(.45, 1.45, 24), new THREE.MeshBasicMaterial({ color: C.roof, side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.position.y = .018; disc.add(marker); disc.position.set(d.cx, d.top, d.cz); this.scene.add(disc);
    for (let k = 0; k < 3; k++) { const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.8, .02, .10), new THREE.MeshStandardMaterial({ color: C.trim, roughness: .8 })); spoke.rotation.y = k * Math.PI / 3; spoke.position.y = .038; disc.add(spoke); }
    const sweep = new THREE.Mesh(new THREE.CapsuleGeometry(.17, carousel.bar.len * 2 - .34, 4, 10), this.mats.paint); sweep.rotation.z = Math.PI / 2;
    // Цвет в вершинах у общего материала: отдельный цветной материал только для этой двухметровой перекладины.
    sweep.material = new THREE.MeshStandardMaterial({ color: C.red, roughness: .6 }); bar.add(sweep);
    bar.position.set(d.cx, (carousel.bar.y0 + carousel.bar.y1) / 2, d.cz); this.scene.add(bar); this.carousels.push({ disc, bar });
    }
    for (const s of this.map.shelters) {
      const x = (s.x0 + s.x1) / 2, z = (s.z0 + s.z1) / 2, y = s.y0 + .1, l = Math.hypot(x, z);
      const root = new THREE.Group(); root.position.set(x + x / l * 1.0, y, z + z / l * 1.0); root.rotation.y = Math.atan2(x, z);
      const b = new Batch(); b.beam('wood', C.woodDark, [-1.05, 0, 0], [-1.05, 2.7, 0], .055); b.beam('wood', C.woodDark, [1.05, 0, 0], [1.05, 2.7, 0], .055); b.flush(root, this.mats, false);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.2, 8, 5), this.mats.cloth); cloth.position.y = 1.55;
      // Принятый мятный парус, однотонный край отличает тихую площадку от открытой.
      const col = new Float32Array(cloth.geometry.getAttribute('position').count * 3); const tint = new THREE.Color(C.roof); for (let k = 0; k < col.length; k += 3) col.set([tint.r, tint.g, tint.b], k);
      cloth.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); root.add(cloth); this.scene.add(root);
      const zone = this.map.winds.find(w => w.y0 === s.y0);
      this.sails.push({ mesh: cloth, phase: zone?.phase ?? 0, rest: new Float32Array(cloth.geometry.getAttribute('position').array) });
    }
    for (const u of this.map.updrafts) {
      batch.cyl('wood', C.woodDark, u.x, u.y0 - .4, u.z, 1.3, .45, 16);
      for (let j = 0; j < 4; j++) batch.cyl('cloth', C.red, u.x, u.y0 - .4 + j * .12, u.z, 1.20 - j * .035, .08, 16);
      const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.10, .42, 6), new THREE.MeshBasicMaterial({ color: 0xf7f6dc, transparent: true, opacity: .65 }), 28);
      this.scene.add(mesh); this.streams.push({ mesh, y0: u.y0, y1: u.y1, x: u.x, z: u.z });
    }
    batch.flush(this.scene, this.mats);
    this.buildBell();
  }

  private checkpointFlag(batch: Batch, index: number): void {
    const c = this.map.checkpoints[index], x = c.x1 - .25, z = c.z1 - .25;
    batch.beam('wood', C.woodDark, [x, c.y, z], [x, c.y + 2.45, z], .065);
    const mat = new THREE.MeshStandardMaterial({ color: C.roof, roughness: .88, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.95, .58, 8, 3), mat); mesh.position.set(x + .46, c.y + 2.08, z);
    this.scene.add(mesh); this.flags.push({ mesh, cp: index, rest: new Float32Array(mesh.geometry.getAttribute('position').array) });
    const tex = signTexture(`${index + 1} · ${Math.round(c.y)} м`, SKILL_SECTIONS[index].name);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(x, c.y + 1.1, z); sign.rotation.y = -c.yaw; this.labels.add(sign);
  }

  private springBed(root: THREE.Group, w: number, d: number): void {
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(w * .78, d * .78), new THREE.MeshStandardMaterial({ color: C.tar, roughness: .9 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = .018; root.add(bed);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * .40, .10, 8, 24), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: .64 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = -.02; root.add(rim);
  }

  private buildMechanisms(source: THREE.Group, atlas: THREE.Texture): void {
    const use = (name: string): THREE.Group => {
      const g = sourcePart(source, name);
      g.traverse(o => { if (o instanceof THREE.Mesh) { o.material = this.materialFor((o.material as THREE.Material).name, atlas); o.castShadow = false; o.receiveShadow = true; } });
      return g;
    };
    for (const [i, m] of this.map.movers.entries()) {
      let root: THREE.Group;
      if (m.look === 'gondola') { root = use('s02_basket0'); root.scale.set(m.w / 2.6, 1, m.d / 2.6); }
      else if (m.look === 'basket') { root = use(i % 2 ? 's12_balloon1' : 's12_balloon0'); root.scale.set(m.w / 2.4, 1, m.d / 2.4); }
      else {
        root = this.rootDeck(m.w, m.d, m.h, C.roof); this.springBed(root, m.w, m.d);
        for (const x of [-1.2, 1.2]) for (const z of [-1.1, 1.1]) {
          const wheel = new THREE.Mesh(new THREE.TorusGeometry(.25, .08, 8, 14), this.mats.metal); wheel.rotation.y = Math.PI / 2; wheel.position.set(x, -.55, z); root.add(wheel);
        }
      }
      root.name = `physical_mover_${i}`; this.scene.add(root); this.moving.push({ root, box: m.box, squash: 0 });
    }
    const wheel = this.map.movers.find(m => m.kind === 'orbit');
    if (wheel) {
      const b = new Batch();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.beam('wood', C.woodDark, [0, 0, 0], [Math.sin(a) * wheel.r, Math.cos(a) * wheel.r, 0], .14); }
      b.flush(this.wheel, this.mats, false);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(wheel.r, .15, 8, 48), new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: .8 })); this.wheel.add(ring);
      this.wheel.position.set(wheel.x, wheel.y, wheel.z + 1.7); this.scene.add(this.wheel);
    }
    const frames = new Batch();
    for (const [i, k] of this.map.sacks.entries()) {
      const root = use('s3_pendulum0');
      // Мешок сохраняет свою форму, удлиняется только верёвка. Его центр и радиус совпадают с sackAt.
      root.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry.clone(), p = g.getAttribute('position');
        for (let n = 0; n < p.count; n++) {
          const y = p.getY(n);
          p.setXYZ(n, p.getX(n) * k.r / .662, y <= -3.2 ? -k.len + (y + 4.04) * k.r / .76 : y * (k.len - k.r) / 3.5, p.getZ(n) * k.r / .662);
        }
        g.computeVertexNormals(); g.computeBoundingSphere(); o.geometry = g;
      });
      root.position.set(k.px, k.py, k.pz);
      this.scene.add(root); this.sacks.push(root);
      const across = k.axis === 'x' ? [0, 1] : [1, 0];
      for (const sign of [-1, 1]) frames.beam('wood', C.woodDark, [k.px + across[0] * 1.65 * sign, k.py - k.len - .8, k.pz + across[1] * 1.65 * sign], [k.px + across[0] * 1.65 * sign, k.py + .1, k.pz + across[1] * 1.65 * sign], .08);
      frames.beam('wood', C.woodDark, [k.px - across[0] * 1.85, k.py, k.pz - across[1] * 1.85], [k.px + across[0] * 1.85, k.py, k.pz + across[1] * 1.85], .11); void i;
    }
    for (const r of this.map.rams) {
      const root = new THREE.Group(); root.position.set(r.fx, (r.y0 + r.y1) / 2, r.fz); root.rotation.y = Math.atan2(r.dx, r.dz);
      const b = new Batch(); b.box('wood', C.woodDark, 0, 0, -.5, 1.6, 1.5, .8); b.box('paint', C.roof, 0, 0, -.065, 1.28, 1.2, .08); b.flush(root, this.mats, false);
      const light = new THREE.MeshStandardMaterial({ color: C.yellow, emissive: C.yellow, emissiveIntensity: .1, roughness: .5 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), light); lamp.position.set(.53, .46, .02); root.add(lamp);
      const arm = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, r.stroke, 10), new THREE.MeshStandardMaterial({ color: C.steel, metalness: .65, roughness: .3 })); shaft.rotation.x = Math.PI / 2; shaft.position.z = -r.stroke / 2; arm.add(shaft);
      const head = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.y1 - r.y0, .20), new THREE.MeshStandardMaterial({ color: C.red, roughness: .55 })); arm.add(head); root.add(arm); this.scene.add(root); this.rams.push({ arm, light });
    }
    frames.flush(this.scene, this.mats);
  }

  private buildBell(): void {
    const b = this.map.bell, x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
    const frame = new Batch(); for (const a of [-1, 1]) frame.beam('wood', C.woodDark, [x + a * 1.8, 185, z], [x + a * 1.8, b.y1 + .3, z], .12);
    frame.beam('wood', C.woodDark, [x - 2, b.y1 + .3, z], [x + 2, b.y1 + .3, z], .14); frame.flush(this.scene, this.mats);
    const points = [[.9, -2.2], [.91, -2.06], [.69, -1.72], [.54, -.7], [.26, -.1]].map(([a, y]) => new THREE.Vector2(a, y));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(points, 24), new THREE.MeshStandardMaterial({ color: C.bronze, metalness: .72, roughness: .3, side: THREE.DoubleSide }));
    this.bell.add(shell); this.bell.position.set(x, b.y1, z); this.scene.add(this.bell);
  }

  private buildCloudSea(): void {
    const geo = new THREE.SphereGeometry(1, 12, 8), mat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, 90);
    for (let i = 0; i < 90; i++) { const a = i * 2.39996, r = 35 + (i * 71 % 180); this.dummy.position.set(Math.cos(a) * r, -18 - i % 7, Math.sin(a) * r); this.dummy.scale.set(14 + i % 8, 4 + i % 3, 11 + i % 9); this.dummy.updateMatrix(); mesh.setMatrixAt(i, this.dummy.matrix); }
    this.cloudSea.add(mesh); this.scene.add(this.cloudSea);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshBasicMaterial({ color: 0xcbdceb })); sea.rotation.x = -Math.PI / 2; sea.position.y = -31; this.scene.add(sea);
  }

  update(t: number, cp: number, dt: number, me?: SkillMe): void {
    for (const [i, v] of this.moving.entries()) {
      const m = this.map.movers[i], p = moverAt(m, t, this.point); v.root.position.set(p.x, p.y, p.z);
      v.squash = Math.max(0, v.squash - dt * 4); if (m.bounce) v.root.scale.y = 1 - v.squash * .18;
    }
    for (const v of this.springs) { v.squash = Math.max(0, v.squash - dt * 4); v.root.scale.y = 1 - v.squash * .18; }
    const orbit = this.map.movers.find(m => m.kind === 'orbit'); if (orbit) this.wheel.rotation.z = -orbitAngle(orbit.period, 0, t);
    for (const [i, root] of this.sacks.entries()) { const k = this.map.sacks[i], pose = sackAt(k, t, this.sack); if (k.axis === 'x') root.rotation.z = pose.a; else root.rotation.x = -pose.a; }
    for (const [i, v] of this.rams.entries()) { const r = this.map.rams[i], st = ramState(r.phase, t, this.ram); v.arm.position.z = st.e * r.stroke; v.light.emissiveIntensity = st.phase === 'wind' ? .6 + Math.sin(t * .7) * .5 : st.phase === 'strike' ? 1.4 : .08; }
    for (const [i, v] of this.clouds.entries()) {
      const c = this.map.clouds[i], st = cloudState(c.phase, t);
      const held = me ? cloudHeldBy(c, me.x, me.y, me.z) : false;
      if (st < 0 && v.state >= 0) this.onPuff?.(v.root.position.x, c.rect.y, v.root.position.z, 'cloud');
      v.state = st; v.root.visible = st >= 0 || cloudReform(c.phase, t) > 0;
      v.mat.opacity = st >= 0 ? held ? .18 : 1 : cloudReform(c.phase, t) * .22;
      v.mat.color.setHex(st > 0 ? 0xe7c0ad : 0xfffcf2);
      v.root.position.y = c.rect.y + (st > 0 ? Math.sin(t * 2.8) * .028 * st : 0);
    }
    for (const [i, root] of this.steps.entries()) {
      const s = this.map.steps[i], state = crumbleState(s.s, t), held = me ? stepHeldBy(s, me.x, me.y, me.z, t) : false;
      if (state < 0 && root.visible) this.onPuff?.(root.position.x, s.rect.y, root.position.z, 'step');
      root.visible = state >= 0 && !held; root.position.y = s.rect.y + (state > 0 ? Math.sin(t * 2.7) * .025 * state : 0);
    }
    for (const [i, v] of this.carousels.entries()) { const c = this.map.carousels![i]; v.disc.rotation.y = -(c.disc.dir ?? 1) * spinAngle(c.disc.period, t); v.bar.rotation.y = -c.bar.dir * spinAngle(c.bar.period, t); }
    for (const f of this.flags) {
      (f.mesh.material as THREE.MeshStandardMaterial).color.setHex(f.cp <= cp ? C.green : C.roof);
      const p = f.mesh.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(f.rest[i * 3] * 4 + t * .06) * .045); p.needsUpdate = true;
    }
    for (const sail of this.sails) { const wind = windState(sail.phase, t), p = sail.mesh.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setZ(i, sail.rest[i * 3 + 2] + Math.sin(sail.rest[i * 3] * 4 + t * (.05 + wind * .13)) * (.03 + wind * .15)); p.needsUpdate = true; }
    for (const stream of this.streams) { for (let i = 0; i < 28; i++) { const a = i * 2.4; this.dummy.position.set(stream.x + Math.sin(a) * .8, stream.y0 + ((t * .06 + i * .7) % (stream.y1 - stream.y0)), stream.z + Math.cos(a) * .8); this.dummy.scale.set(1, 1, 1); this.dummy.rotation.set(0, 0, 0); this.dummy.updateMatrix(); stream.mesh.setMatrixAt(i, this.dummy.matrix); } stream.mesh.instanceMatrix.needsUpdate = true; }
    this.bellTime += dt; this.bellPower = Math.max(0, this.bellPower - dt * .25); this.bell.rotation.z = Math.sin(this.bellTime * 5) * this.bellPower * .24;
    const y = me?.y ?? this.map.checkpoints[cp]?.y ?? 0;
    if (Math.abs(y - this.shadowY) > 8) {
      this.shadowY = y; const center = new THREE.Vector3(0, y + 8, 0); this.sun.position.copy(center).addScaledVector(SKY_DAY.sunDir, 160); this.sun.target.position.copy(center);
      fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-30, y - 14, -30), new THREE.Vector3(30, y + 38, 30))); this.renderer.refreshShadows();
    }
    this.labels.children.forEach(label => { label.visible = Math.abs(label.position.y - y) < 20; });
  }

  ringBell(power = 1): void { this.bellPower = Math.max(this.bellPower, power); this.bellTime = 0; }
  squashAt(box: number): void { const v = [...this.moving, ...this.springs].find(v => v.box === box); if (v) v.squash = 1; }
  bouncerUnder(x: number, y: number, z: number): number {
    for (const p of [...this.map.pads, ...this.map.movers]) if (p.bounce) { const i = p.box, w = this.collision; if (Math.abs(y - w.maxY[i]) < .5 && x > w.minX[i] - .42 && x < w.maxX[i] + .42 && z > w.minZ[i] - .42 && z < w.maxZ[i] + .42) return i; }
    return -1;
  }
  setQuality(q: Quality, slow = false): void { this.cloudSea.visible = !slow && q !== 'low'; this.renderer.refreshShadows(); }
  resize(w: number, h: number): void { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }
  render(): void { this.renderer.render(this.scene, this.camera, SKY_DAY.exposure); }
  rectOf(cp: number): SkillRect { return this.map.checkpoints[Math.min(cp, this.map.checkpoints.length - 1)]; }
}
