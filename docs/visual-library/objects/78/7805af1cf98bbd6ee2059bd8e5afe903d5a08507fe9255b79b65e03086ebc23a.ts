import * as THREE from 'three';
import type { VoicePeer } from '../../shared/voice.ts';

// Public room presence is independent of whether this observer has joined voice.
// Server snapshots own the talking lease; replacement/scene exit removes stale IDs.
const speaking = new Set<number>();

export function setVoicePresence(peers: readonly Pick<VoicePeer, 'entityId' | 'talking'>[]): void {
  speaking.clear();
  for (const peer of peers) {
    if (peer.talking && peer.entityId !== null && Number.isSafeInteger(peer.entityId) && peer.entityId > 0) speaking.add(peer.entityId);
  }
}

export function isVoiceSpeaking(entityId: number): boolean { return speaking.has(entityId); }

let material: THREE.SpriteMaterial | null = null;

/** One canvas/material for every avatar; no text, texture uploads or allocations in the frame loop. */
export function makeVoiceIndicator(): THREE.Sprite {
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    // Dark rim keeps the mint speaker readable on both sky and scenery. Ник уже над головой — тут только значок:
    // динамик с волнами, как в списке «кто говорит» (client/ui/voice.ts).
    ctx.fillStyle = '#172a28';
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#96e6c6'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e3fff3'; ctx.fillStyle = '#e3fff3';
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(30, 52); ctx.lineTo(44, 52); ctx.lineTo(62, 36); ctx.lineTo(62, 92); ctx.lineTo(44, 76); ctx.lineTo(30, 76); ctx.closePath();
    ctx.lineWidth = 5; ctx.fill(); ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(66, 64, 13, -0.85, 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(66, 64, 26, -0.85, 0.85); ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: true, depthWrite: false, transparent: true, fog: false, toneMapped: false });
  }
  const sprite = new THREE.Sprite(material);
  sprite.name = 'voice-speaking';
  sprite.visible = false;
  sprite.renderOrder = 6;
  return sprite;
}
