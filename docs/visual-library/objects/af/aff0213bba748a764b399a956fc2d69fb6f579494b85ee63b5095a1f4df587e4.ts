import * as THREE from 'three';
import { RAT_BOARD } from '../../../shared/ratrace.ts';
import type { RatArenaMount } from './mounts.ts';

/** The GLB owns the pontoon, track, fence, props and board frame; the running scene keeps all live gameplay. */
export function mountRatArena(body: THREE.Object3D, board: THREE.Object3D, finish: THREE.Object3D, back: THREE.Object3D, m: RatArenaMount): void {
  body.visible = false;
  const scale = new THREE.Vector3();
  m.board.decompose(board.position, board.quaternion, scale);
  board.scale.set(scale.x / (RAT_BOARD.w / 2), scale.y / (RAT_BOARD.h / 2), 1);
  m.finish.decompose(finish.position, finish.quaternion, scale);
  finish.scale.set(scale.x / .25, scale.y / .07, 1);
  back.position.copy(finish.position).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(finish.quaternion), -.07);
  back.quaternion.copy(finish.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  back.scale.copy(finish.scale);
}
