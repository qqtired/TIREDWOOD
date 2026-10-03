// The pier's old fisherman: subdued cloth, weathered face and modest gear. Static details are merged;
// only head, shoulders and the small working line move. He never walks into the public approach.
import * as THREE from 'three';
import { FISHER_NPC, FISHER_CANOPY_POSTS } from '../../shared/fishplaces.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { makeFish3D } from './fishart.ts';

const CLOTH = 0x68736a;
const DARK = 0x38443d;
const SKIN = 0xb9896f;
const GREY = 0xc3c2b4;
const WOOD = 0x8e7556;
const METAL = 0x718078;

export class Fisherman3D {
  readonly group = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly left = new THREE.Group();
  private readonly right = new THREE.Group();
  private readonly mug = new THREE.Group();
  private readonly workingLine: THREE.Line;
  private accumulated = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'pier-fisherman';
    this.group.position.set(FISHER_NPC.x, FISHER_NPC.y, FISHER_NPC.z);
    this.group.rotation.y = FISHER_NPC.yaw;
    const base: THREE.BufferGeometry[] = [];
    // Trousers and old rubber boots: muted knees, thick soles and toe scuffs.
    for (const sx of [-0.13, 0.13]) {
      base.push(at(new THREE.CylinderGeometry(0.088, 0.075, 0.55, 9), CLOTH, sx, 0.53, 0));
      base.push(at(new THREE.BoxGeometry(0.13, 0.15, 0.035), 0x7a806e, sx, 0.45, -0.075));
      base.push(at(new THREE.CylinderGeometry(0.094, 0.1, 0.29, 10), 0x283b34, sx, 0.23, 0));
      base.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.32), 0x2b3933, sx, 0.075, -0.065));
      base.push(at(new THREE.BoxGeometry(0.205, 0.035, 0.325), 0x1f2b26, sx, 0.018, -0.065));
      base.push(at(new THREE.BoxGeometry(0.11, 0.012, 0.055), 0x526151, sx, 0.139, -0.16));
    }
    this.group.add(mesh(base));
    this.torso.position.set(0, 0.8, 0);
    const body: THREE.BufferGeometry[] = [];
    body.push(at(new THREE.CylinderGeometry(0.23, 0.21, 0.47, 12).scale(1, 1, 0.78), 0xd6cbb0, 0, 0.24, 0));
    for (let y = 0.07; y < 0.47; y += 0.07) body.push(at(new THREE.CylinderGeometry(0.234, 0.23, 0.025, 12).scale(1, 1, 0.78), 0x405564, 0, y, 0));
    // Open, worn vest and its patched pockets leave the striped shirt visible in the middle.
    for (const sx of [-0.155, 0.155]) {
      body.push(at(new THREE.BoxGeometry(0.155, 0.46, 0.06), CLOTH, sx, 0.23, -0.16));
      body.push(at(new THREE.BoxGeometry(0.12, 0.13, 0.027), 0x7c826d, sx, 0.13, -0.204));
      body.push(at(new THREE.BoxGeometry(0.1, 0.023, 0.035), DARK, sx, 0.18, -0.222));
      body.push(at(new THREE.BoxGeometry(0.032, 0.075, 0.035).rotateZ(sx < 0 ? -0.2 : 0.2), 0xa49776, sx, 0.385, -0.196));
    }
    body.push(at(new THREE.BoxGeometry(0.44, 0.44, 0.058), CLOTH, 0, 0.23, 0.17));
    body.push(at(new THREE.CylinderGeometry(0.225, 0.22, 0.055, 12).scale(1, 1, 0.8), 0x514939, 0, 0.016, 0));
    body.push(at(new THREE.BoxGeometry(0.07, 0.044, 0.025), 0x928a65, 0, 0.012, -0.19));
    // A sheathed working tool, rather than a large weapon.
    body.push(at(new THREE.BoxGeometry(0.055, 0.19, 0.044).rotateZ(-0.16), 0x4b4639, 0.24, -0.015, -0.08));
    body.push(at(new THREE.CylinderGeometry(0.014, 0.014, 0.065, 6).rotateZ(-0.16), WOOD, 0.224, 0.106, -0.08));
    body.push(at(new THREE.CylinderGeometry(0.074, 0.09, 0.14, 10), SKIN, 0, 0.53, 0));
    this.torso.add(mesh(body));
    this.group.add(this.torso);
    this.head.position.set(0, 0.62, -0.025);
    const face: THREE.BufferGeometry[] = [];
    face.push(at(new THREE.SphereGeometry(0.19, 16, 12).scale(0.88, 1.14, 0.9), SKIN, 0, 0, 0));
    // Small ears/nose, calm eyes, grey eyebrows, stubble and simple sun lines.
    for (const sx of [-1, 1]) {
      face.push(at(new THREE.SphereGeometry(0.035, 8, 6).scale(0.65, 1.2, 0.7), 0xa97b62, sx * 0.171, -0.003, 0));
      face.push(at(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 0.55, 0.3), 0xebe4d5, sx * 0.067, 0.028, -0.161));
      face.push(at(new THREE.SphereGeometry(0.009, 7, 5).scale(1, 0.8, 0.5), 0x354842, sx * 0.067, 0.028, -0.169));
      face.push(at(new THREE.BoxGeometry(0.061, 0.016, 0.011).rotateZ(sx * 0.1), GREY, sx * 0.067, 0.068, -0.153));
      for (const y of [0.095, 0.12]) face.push(at(new THREE.BoxGeometry(0.058, 0.004, 0.008), 0x936c56, sx * 0.047, y, -0.145));
      face.push(at(new THREE.BoxGeometry(0.035, 0.004, 0.009).rotateZ(sx * 0.3), 0x8b6656, sx * 0.116, 0.01, -0.129));
      face.push(at(new THREE.SphereGeometry(0.042, 8, 6).scale(1, 0.8, 0.4), 0xbb856f, sx * 0.095, -0.038, -0.139));
      face.push(at(new THREE.SphereGeometry(0.07, 10, 7).scale(0.6, 1.05, 0.6), GREY, sx * 0.111, -0.07, -0.104));
    }
    face.push(at(new THREE.SphereGeometry(0.037, 10, 8).scale(0.75, 1.05, 1.1), 0xac7b61, 0, -0.008, -0.173));
    face.push(at(new THREE.SphereGeometry(0.11, 12, 9).scale(1, 0.94, 0.6), GREY, 0, -0.125, -0.105));
    face.push(at(new THREE.SphereGeometry(0.055, 10, 6).scale(1.6, 0.38, 0.35), 0xe0daca, 0, -0.062, -0.172));
    face.push(at(new THREE.BoxGeometry(0.042, 0.005, 0.007), 0x715745, 0, -0.077, -0.168));
    // Faded fishing cap, short brim and a tiny brass hook on the band.
    face.push(at(new THREE.SphereGeometry(0.19, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.59, 0.95), CLOTH, 0, 0.134, 0));
    face.push(at(new THREE.CylinderGeometry(0.186, 0.186, 0.032, 16).scale(1, 1, 0.94), DARK, 0, 0.144, 0));
    face.push(at(new THREE.SphereGeometry(0.17, 14, 8).scale(0.97, 0.1, 0.7), 0x59675c, 0, 0.133, -0.171));
    face.push(at(new THREE.TorusGeometry(0.019, 0.003, 4, 8, Math.PI * 1.3), 0xbca979, -0.105, 0.158, -0.139));
    this.head.add(mesh(face));
    this.torso.add(this.head);
    for (const [arm, side] of [[this.left, -1], [this.right, 1]] as const) {
      arm.position.set(side * 0.26, 0.405, 0);
      arm.add(mesh([
        at(new THREE.CapsuleGeometry(0.073, 0.23, 3, 9), 0xd0c5ad, 0, -0.17, 0),
        at(new THREE.CylinderGeometry(0.079, 0.079, 0.052, 9), 0x435966, 0, -0.15, 0),
        at(new THREE.CylinderGeometry(0.077, 0.077, 0.052, 9), 0x435966, 0, -0.25, 0),
        at(new THREE.SphereGeometry(0.076, 10, 8).scale(0.85, 1.1, 0.8), 0x8b8b72, 0, -0.37, -0.025),
        at(new THREE.BoxGeometry(0.055, 0.055, 0.016), 0x747965, 0, -0.37, -0.088),
      ]));
      this.torso.add(arm);
    }
    this.mug.add(mesh([
      paint(new THREE.CylinderGeometry(0.048, 0.043, 0.085, 10), 0xc9c5a5),
      place(paint(new THREE.TorusGeometry(0.031, 0.006, 5, 10), METAL), 0.067, 0, 0),
    ]));
    this.mug.position.set(0, -0.4, -0.085);
    this.mug.visible = false;
    this.right.add(this.mug);
    this.workingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.17, 0.94, -0.32), new THREE.Vector3(0, 0.82, -0.36), new THREE.Vector3(0.19, 0.96, -0.31),
    ]), new THREE.LineBasicMaterial({ color: 0xc4c8b8, transparent: true, opacity: 0.6 }));
    this.workingLine.visible = false;
    this.group.add(this.workingLine);
    this.addGear();
    this.addCanopy();
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Calm cycle, updated less often when far away; no extra timers or autonomous AI. */
  update(dt: number, time: number, camera: THREE.Vector3): void {
    if (!this.group.visible) return;
    this.accumulated += dt;
    const near = (camera.x - FISHER_NPC.x) ** 2 + (camera.z - FISHER_NPC.z) ** 2 < 24 * 24;
    if (!near && this.accumulated < 0.12) return;
    this.accumulated = 0;
    const phase = time % 48;
    this.torso.rotation.z = Math.sin(time * 0.34) * 0.018;
    this.torso.position.y = 0.8 + Math.sin(time * 0.9) * 0.007;
    this.head.rotation.set(0.03, Math.sin(time * 0.17) * 0.09, 0);
    this.left.rotation.set(-0.08, 0, -0.09);
    this.right.rotation.set(-0.12, 0, 0.09);
    this.mug.visible = false;
    this.workingLine.visible = false;
    if (phase > 7 && phase < 12) {
      const k = Math.sin(((phase - 7) / 5) * Math.PI);
      this.right.rotation.x = -2.4 * k;
      this.right.rotation.z = -0.35 * k;
      this.head.rotation.x = 0.1 * k;
    } else if (phase > 16 && phase < 24) {
      const k = Math.sin(((phase - 16) / 8) * Math.PI);
      this.left.rotation.x = -0.65 * k;
      this.right.rotation.x = -0.7 * k;
      this.left.rotation.z = 0.34 * k;
      this.right.rotation.z = -0.34 * k;
      this.head.rotation.x = 0.27 * k;
      this.workingLine.visible = k > 0.35;
    } else if (phase > 28 && phase < 34) {
      const k = Math.sin(((phase - 28) / 6) * Math.PI);
      this.head.rotation.y = -0.7 * k;
      this.torso.rotation.y = -0.13 * k;
    } else if (phase > 38 && phase < 43) {
      const k = Math.sin(((phase - 38) / 5) * Math.PI);
      this.mug.visible = true;
      this.right.rotation.x = -1.4 * k;
      this.right.rotation.z = -0.32 * k;
    }
    if (!(phase > 28 && phase < 34)) this.torso.rotation.y = 0;
    // A brief easy lean on his gear; the public access point stays clear.
    if (phase > 44) {
      const k = Math.sin(((phase - 44) / 4) * Math.PI);
      this.torso.rotation.z -= 0.09 * k;
      this.torso.position.y -= 0.045 * k;
    }
  }

  private addCanopy(): void {
    const parts: THREE.BufferGeometry[]=[];
    for (const p of FISHER_CANOPY_POSTS) {
      const x=p.x-FISHER_NPC.x,z=p.z-FISHER_NPC.z;
      parts.push(at(new THREE.CylinderGeometry(p.r,p.r,p.h,8),0x746349,x,p.h/2,z));
      parts.push(at(new THREE.CylinderGeometry(p.r+.012,p.r+.012,.065,8),METAL,x,.06,z));
      parts.push(at(new THREE.BoxGeometry(.07,.055,1.32),0x665c45,x,2.36,-.21));
      const brace=new THREE.CylinderGeometry(.025,.025,.57,6).rotateX(-.64);
      parts.push(at(brace,0x847257,x,2.17,-.035));
    }
    parts.push(at(new THREE.BoxGeometry(2.4,.07,.075),0x71634b,0,2.37,.12));
    // Aged canvas over a light wooden cantilever: no posts across the customer's approach.
    for (let i=0;i<8;i++) {
      const x=-1.2+i*.343;
      parts.push(at(new THREE.BoxGeometry(.341,.027,1.47).rotateX(-.085),i%2 ? 0x8a8b70 : 0x7b8068,x,2.43,-.17));
      parts.push(at(new THREE.BoxGeometry(.341,.115,.025),i%2 ? 0x7a7d62 : 0x6f775f,x,2.30,-.9));
    }
    for(const [x,z] of [[-.72,-.22],[.49,.23]]) parts.push(at(new THREE.BoxGeometry(.21,.01,.25).rotateY(.16).rotateX(-.085),0xa5a187,x,2.449+z*.085,z));
    // The sign is backed by wood and hangs from two visible short chains attached to the front frame.
    parts.push(at(new THREE.BoxGeometry(.94,.3,.035),0x594d38,0,2.04,-.616));
    for(const x of [-.32,.32]) {
      parts.push(at(new THREE.CylinderGeometry(.009,.009,.22,5),0x525e52,x,2.285,-.615));
      parts.push(at(new THREE.SphereGeometry(.019,7,5),0xb0a480,x,2.135,-.645));
    }
    this.group.add(mesh(parts));
  }

  private addGear(): void {
    const props: THREE.BufferGeometry[] = [];
    const crate = (x: number, z: number, w: number, h: number, d: number) => {
      props.push(at(new THREE.BoxGeometry(w, 0.035, d), WOOD, x, 0.025, z));
      for (let y = 0.075; y < h; y += 0.075) {
        for (const side of [-1, 1]) {
          props.push(at(new THREE.BoxGeometry(w, 0.058, 0.025), y < 0.16 ? WOOD : 0x9b8263, x, y, z + side * d / 2));
          props.push(at(new THREE.BoxGeometry(0.025, 0.058, d), WOOD, x + side * w / 2, y, z));
        }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.push(at(new THREE.BoxGeometry(0.045, h, 0.045), 0x6c5942, x + sx * w / 2, h / 2, z + sz * d / 2));
    };
    crate(-0.78, 0.03, 0.47, 0.32, 0.35);
    crate(0.73, 0.16, 0.34, 0.26, 0.29);
    crate(0.81, 0.38, 0.31, 0.18, 0.23);
    // Two patched buckets, line spool, bait box, floats and small hooks.
    for (const [x, z, r] of [[-0.54, 0.4, 0.11], [0.45, 0.39, 0.085]]) {
      props.push(at(new THREE.CylinderGeometry(r, r * 0.8, 0.21, 12, 1, true), METAL, x, 0.105, z));
      props.push(at(new THREE.TorusGeometry(r, 0.012, 4, 12).rotateX(Math.PI / 2), 0x9da494, x, 0.21, z));
      props.push(at(new THREE.TorusGeometry(r * 0.94, 0.006, 4, 12, Math.PI), 0x495a52, x, 0.205, z));
    }
    props.push(at(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), 0xc6c0a4, 0.7, 0.285, 0.17));
    props.push(at(new THREE.CylinderGeometry(0.065, 0.065, 0.006, 12), WOOD, 0.7, 0.308, 0.17));
    props.push(at(new THREE.BoxGeometry(0.18, 0.065, 0.13), 0x536d66, 0.85, 0.3, 0.13));
    for (let i = 0; i < 4; i++) {
      props.push(at(new THREE.SphereGeometry(0.016, 6, 5).scale(0.9, 1.4, 0.9), i % 2 ? 0xb77c52 : 0xdacda8, 0.65 + i * 0.034, 0.333, 0.04));
      props.push(at(new THREE.TorusGeometry(0.012, 0.0025, 3, 6, Math.PI * 1.4), 0x9eab9f, 0.65 + i * 0.03, 0.332, 0.22));
    }
    // Resting rods and a compact folding stool, behind the front interaction point.
    for (let i = 0; i < 2; i++) {
      props.push(at(new THREE.CylinderGeometry(0.008, 0.014, 1.1 + i * 0.1, 7).rotateZ(-0.13 - i * 0.05), DARK, 0.93 + i * 0.07, 0.7, 0.32));
      props.push(at(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8).rotateZ(-0.13), WOOD, 0.86 + i * 0.07, 0.19, 0.32));
    }
    props.push(at(new THREE.BoxGeometry(0.32, 0.025, 0.26), CLOTH, -0.16, 0.27, 0.49));
    for (const x of [-0.31, -0.01]) for (const angle of [-0.67, 0.67]) props.push(at(new THREE.BoxGeometry(0.018, 0.33, 0.02).rotateX(angle), METAL, x, 0.145, 0.49));
    // Thermos, enamel cup, old brass lantern and a small bundle of weathered net.
    props.push(at(new THREE.CylinderGeometry(0.042, 0.042, 0.24, 9), 0x587365, -0.69, 0.45, 0.09));
    props.push(at(new THREE.CylinderGeometry(0.044, 0.044, 0.044, 9), 0xc9c7b1, -0.69, 0.592, 0.09));
    props.push(at(new THREE.CylinderGeometry(0.041, 0.037, 0.065, 9), 0xbbb79b, -0.88, 0.36, 0.08));
    props.push(at(new THREE.CylinderGeometry(0.055, 0.058, 0.11, 8), 0xaa9970, -1.02, 0.11, 0.34));
    props.push(at(new THREE.CylinderGeometry(0.043, 0.043, 0.12, 8), 0xc4b184, -1.02, 0.224, 0.34));
    props.push(at(new THREE.ConeGeometry(0.065, 0.052, 8), DARK, -1.02, 0.31, 0.34));
    props.push(at(new THREE.TorusGeometry(0.04, 0.006, 4, 9, Math.PI), DARK, -1.02, 0.356, 0.34));
    for (let i = 0; i < 8; i++) {
      const line = new THREE.CylinderGeometry(0.005, 0.005, 0.46, 4).rotateZ(Math.PI / 2).rotateY(i % 2 ? 0.18 : -0.18);
      props.push(at(line, 0x6a7964, -0.71, 0.24 + i * 0.017, 0.33 + i * 0.013));
      props.push(at(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 4).rotateX(Math.PI / 2), 0x687460, -0.91 + i * 0.05, 0.32, 0.37));
    }
    this.group.add(mesh(props));
    for (let i = 0; i < 3; i++) {
      const fish = makeFish3D(i, 120);
      fish.scale.multiplyScalar(0.72);
      fish.position.set(-0.8, 0.29 + i * 0.015, -0.045 + i * 0.065);
      fish.rotation.y = i * 0.15;
      this.group.add(fish);
    }
    // A painted local sign, small enough to remain part of the gear scene.
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 150;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#746447'; c.fillRect(0, 0, 512, 150);
    c.fillStyle = 'rgba(224,212,175,.12)';
    for (let y = 15; y < 150; y += 27) c.fillRect(0, y, 512, 2);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#eee2bf'; c.font = '700 34px Rubik,system-ui,sans-serif';
    c.fillText('СНАСТИ У СЕМЁНА', 256, 58);
    c.font = '22px Rubik,system-ui,sans-serif'; c.fillText('заходи · рыбак рыбаку', 256, 108);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.26), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, side: THREE.DoubleSide }));
    sign.position.set(0, 2.04, -0.64); sign.rotation.y = Math.PI;
    this.group.add(sign);
  }
}

function at(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return place(paint(g, color), x, y, z);
}

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const result = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.025, side: THREE.DoubleSide }));
  result.castShadow = true; result.receiveShadow = true;
  return result;
}
