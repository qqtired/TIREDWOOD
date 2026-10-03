// Набор B: «пуф!» пузырей — облачко сиреневой пены и кольцо капель варенья. Одна жёсткая часть: после взрыва
// разлетается вширь, подлетает и падает, капли плющатся в кляксы, облачко — в лужицу; к концу гибели всё тает.
import * as THREE from 'three';
import { JAM, JAM_HI, ball, bump, hide, join, lerp, linkS, seg, smooth } from './b-parts.ts';

const FOAM = 0xc58ae6;
const FOAM_LIGHT = 0xe6c8f7;

/** Облачко в середине и капли по кольцу радиуса ~1 (в осях части) */
export function splashGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const cloud: Array<[number, number, number, number]> = [[0, 0.05, 0, 0.26], [0.2, 0.12, 0.08, 0.2], [-0.18, 0.1, -0.06, 0.21], [0.04, 0.24, -0.16, 0.18], [-0.06, 0.2, 0.18, 0.19]];
  cloud.forEach(([x, y, z, r], i) => list.push(ball(r, x, y, z, i % 2 ? FOAM_LIGHT : FOAM, 1, 1, 1, 7, 4)));
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 3) * 0.17;
    const r = i % 2 ? 1.0 : 0.72;
    const y = ((i * 7) % 5) * 0.08 - 0.1;
    const size = 0.07 + (i % 4) * 0.012;
    const g = new THREE.SphereGeometry(size * 1.25, 7, 3).scale(1, 1, 1.55).rotateY(a + Math.PI / 2);
    list.push(paintAt(g, Math.cos(a) * r, y, -Math.sin(a) * r, i % 3 ? JAM : JAM_HI));
  }
  return join(list);
}

function paintAt(g: THREE.BufferGeometry, x: number, y: number, z: number, col: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  const n = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(col);
  const arr = new Float32Array(n.getAttribute('position').count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r;
    arr[i + 1] = c.g;
    arr[i + 2] = c.b;
  }
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}

/**
 * Поза брызг: до взрыва спрятаны; после (die от pop до 1) — разлёт вширь, подлёт и падение на землю,
 * капли плющатся в кляксы, к 1 всё сжимается. cy — высота центра взрыва над землёй, size — размах (1 ≈ 2 м).
 */
export function splashPose(out: THREE.Matrix4, root: THREE.Matrix4, die: number, pop: number, cy: number, size: number): THREE.Matrix4 {
  if (die < pop) return hide(out);
  const u = seg(die, pop, 1);
  const burst = 1 - (1 - seg(u, 0, 0.5)) ** 3;
  const fade = 1 - smooth(seg(u, 0.72, 1)) * 0.96;
  const rad = size * (0.45 + 1.65 * burst) * fade;
  const y = lerp(cy, 0.03, smooth(seg(u, 0.12, 0.55))) + 0.32 * bump(seg(u, 0, 0.45)) * size;
  const sy = size * lerp(1.15, 0.2, smooth(seg(u, 0.32, 0.6))) * fade;
  return linkS(out, root, 0, y, 0, 0, u * 0.6, 0, rad, sy, rad);
}
