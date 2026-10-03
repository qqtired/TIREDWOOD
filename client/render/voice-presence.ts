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
    // Dark rim keeps the warm mint microphone readable on both sky and scenery.
    ctx.fillStyle = '#172a28';
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#96e6c6'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e3fff3'; ctx.fillStyle = '#e3fff3';
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.roundRect(53, 30, 22, 39, 11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(42, 59); ctx.lineTo(42, 62);
    ctx.arc(64, 62, 22, Math.PI, 0, true); ctx.lineTo(86, 59); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 84); ctx.lineTo(64, 97);
    ctx.moveTo(53, 97); ctx.lineTo(75, 97); ctx.stroke();
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
