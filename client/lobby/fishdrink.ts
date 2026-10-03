import * as THREE from 'three';
import type { Sound } from '../audio.ts';
import type { Avatar } from '../render/avatar.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

/** Short, sober use animation: a small can lifted to the face; no locomotion or fishing modifiers. */
export class FishDrink {
  private readonly can: THREE.Mesh;
  private readonly avatar: Avatar;
  private readonly sound: Sound;
  private age = -1;
  private chimed = false;
  private readonly hands = [-0.28, 0.8, -0.08, 0.3, 0.85, -0.15];

  constructor(avatar: Avatar, sound: Sound) {
    this.avatar = avatar;
    this.sound = sound;
    this.can = new THREE.Mesh(mergeColored([
      paint(new THREE.CylinderGeometry(0.055, 0.055, 0.19, 12), 0xba985b),
      place(paint(new THREE.CylinderGeometry(0.057, 0.057, 0.008, 12), 0xbfc4c1), 0, 0.098, 0),
      paint(new THREE.CylinderGeometry(0.056, 0.056, 0.095, 12), 0xf0dfb7),
      place(paint(new THREE.TorusGeometry(0.012, 0.003, 4, 8).rotateX(Math.PI / 2), 0x697572), 0, 0.105, 0),
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }));
    this.can.visible = false;
    avatar.root.add(this.can);
  }

  start(): void {
    this.age = 0;
    this.chimed = false;
    this.can.visible = true;
    beerOpenSound(this.sound);
  }

  /** Before Avatar.update: its normal mitten renderer picks up these hand positions. */
  update(dt: number, allowed: boolean): void {
    if (this.age < 0) return;
    if (!allowed) { this.reset(); return; }
    this.age += dt;
    if (this.age >= 2.3) { this.reset(); return; }
    const rise = smooth(Math.min(1, this.age / 0.65));
    const fall = smooth(Math.max(0, (this.age - 1.45) / 0.75));
    const k = rise * (1 - fall);
    this.hands[3] = 0.3 - 0.18 * k;
    this.hands[4] = 0.85 + 0.39 * k;
    this.hands[5] = -0.15 - 0.35 * k;
    this.avatar.hands = this.hands;
    this.can.position.set(this.hands[3], this.hands[4] + 0.07, this.hands[5] - 0.06);
    this.can.rotation.x = -0.65 * k;
    this.can.rotation.z = -0.2 * k;
    if (!this.chimed && this.age >= 0.9) {
      this.chimed = true;
      beerConfirmSound(this.sound);
    }
  }

  reset(): void {
    if (this.avatar.hands === this.hands) this.avatar.hands = null;
    this.age = -1;
    this.can.visible = false;
  }
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }

function tone(sound: Sound, frequency: number, offset: number, duration: number, gain: number): void {
  const kit = sound.kit;
  if (!kit) return;
  const { ctx, sfx } = kit;
  const at = ctx.currentTime + offset;
  const voice = ctx.createOscillator();
  const envelope = ctx.createGain();
  voice.type = 'sine';
  voice.frequency.setValueAtTime(frequency, at);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  voice.connect(envelope).connect(sfx);
  voice.start(at);
  voice.stop(at + duration + 0.03);
  voice.onended = () => { voice.disconnect(); envelope.disconnect(); };
}

function beerOpenSound(sound: Sound): void {
  tone(sound, 1100, 0, 0.06, 0.055);
  const kit = sound.kit;
  if (!kit) return;
  const { ctx, noise, sfx } = kit;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noise;
  filter.type = 'highpass';
  filter.frequency.value = 3200;
  gain.gain.setValueAtTime(0.027, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
  source.connect(filter).connect(gain).connect(sfx);
  source.start();
  source.stop(ctx.currentTime + 0.18);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function beerConfirmSound(sound: Sound): void {
  tone(sound, 523.25, 0, 0.2, 0.05);
  tone(sound, 659.25, 0.09, 0.3, 0.045);
}
