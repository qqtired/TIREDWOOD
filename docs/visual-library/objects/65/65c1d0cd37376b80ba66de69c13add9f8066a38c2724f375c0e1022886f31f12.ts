// Rigid GLB clips → one animated InstancedMesh per enemy type. The source GLB,
// vertex colours, material response and every authored clip remain authoritative.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const POSE_FPS = 24;
export interface ClipRows { start: number; frames: number; duration: number; loop: boolean }
export interface BakedMob { geo: THREE.BufferGeometry; tex: THREE.DataTexture; clips: Record<string, ClipRows>; height: number; triangles: number; parts: number }

export function bakeFortModel(gltf: GLTF, id: string): BakedMob {
  const root = gltf.scene.getObjectByName(id) ?? gltf.scene.children[0];
  if (!root || !gltf.animations.length) throw new Error(`Fort ${id}: missing model or animation`);
  const animated = new Set(gltf.animations.flatMap(c => c.tracks.map(t => THREE.PropertyBinding.parseTrackName(t.name).nodeName)));
  const joints: THREE.Object3D[] = [root];
  root.traverse(o => { if (o !== root && animated.has(o.name)) joints.push(o); });
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const rest = root.position.clone();
  const geos: THREE.BufferGeometry[] = [];
  const rel = new THREE.Matrix4();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`Fort ${id}: split material groups before baking`);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.map) throw new Error(`Fort ${id}: selected source must be the approved vertex-colour GLB`);
    let parent: THREE.Object3D | null = mesh;
    while (parent && !joints.includes(parent)) parent = parent.parent;
    const ji = parent ? joints.indexOf(parent) : 0;
    // Authored hidden props can start with scale zero (Miller's flour cloud).
    // Walk local transforms below the joint; inverting its world matrix would
    // be singular and destroy otherwise valid geometry before the clip opens it.
    rel.identity();
    let cursor: THREE.Object3D | null = mesh;
    while (cursor && cursor !== joints[ji]) { rel.premultiply(cursor.matrix); cursor = cursor.parent; }
    const g = mesh.geometry.clone();
    const authored = g.getAttribute('color');
    const n = g.getAttribute('position').count;
    const color = new Float32Array(n * 3), emi = new Float32Array(n * 3);
    const rough = new Float32Array(n), metal = new Float32Array(n), part = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const value = authored ? (c === 0 ? authored.getX(i) : c === 1 ? authored.getY(i) : authored.getZ(i)) : 1;
        color[i * 3 + c] = value * (c === 0 ? mat.color.r : c === 1 ? mat.color.g : mat.color.b);
        emi[i * 3 + c] = value * (c === 0 ? mat.emissive.r : c === 1 ? mat.emissive.g : mat.emissive.b) * mat.emissiveIntensity;
      }
      rough[i] = mat.roughness; metal[i] = mat.metalness; part[i] = ji;
    }
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
    g.applyMatrix4(rel);
    const rig = new Float32Array(n * 3);
    const isLoad = id === 'crabcrane' && joints[ji].name === 'crabcrane_load';
    const isCable = id === 'crabcrane' && joints[ji].name === 'crabcrane_suspension';
    if (isLoad || isCable) {
      const positions = g.getAttribute('position');
      let length = .001;
      if (isCable) for (let i=0;i<n;i++) length=Math.max(length,positions.getZ(i));
      for (let i=0;i<n;i++) { rig[i*3]=isLoad?1:2; rig[i*3+1]=isCable?Math.max(0,Math.min(1,positions.getZ(i)/length)):0; rig[i*3+2]=length; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aEmi', new THREE.BufferAttribute(emi, 3));
    g.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    g.setAttribute('aMetal', new THREE.BufferAttribute(metal, 1));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    g.setAttribute('aRig', new THREE.BufferAttribute(rig, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  });
  const geo = mergeGeometries(geos, false);
  if (!geo) throw new Error(`Fort ${id}: empty geometry`);
  const clips: Record<string, ClipRows> = {};
  let rows = 0;
  for (const clip of gltf.animations) {
    const key = clip.name.startsWith(id + '_') ? clip.name.slice(id.length + 1) : clip.name;
    const frames = Math.ceil(clip.duration * POSE_FPS) + 1;
    clips[key] = { start: rows, frames, duration: clip.duration, loop: key === 'walk' || key === 'idle' };
    rows += frames;
  }
  const width = joints.length * 3, data = new Float32Array(width * rows * 4);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const m = new THREE.Matrix4();
  for (const clip of gltf.animations) {
    const key = clip.name.startsWith(id + '_') ? clip.name.slice(id.length + 1) : clip.name;
    const info = clips[key];
    mixer.stopAllAction();
    const action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    for (let f = 0; f < info.frames; f++) {
      mixer.setTime(Math.min(f / POSE_FPS, clip.duration));
      // World movement comes from the server. Keep the walk's planted foot cycle,
      // but remove authored horizontal root travel to avoid sliding twice.
      const dx = key === 'walk' ? root.position.x - rest.x : 0;
      const dz = key === 'walk' ? root.position.z - rest.z : 0;
      gltf.scene.updateMatrixWorld(true);
      for (let j = 0; j < joints.length; j++) {
        m.copy(joints[j].matrixWorld); const e = m.elements;
        const o = ((info.start + f) * width + j * 3) * 4;
        data[o] = e[0]; data[o+1] = e[4]; data[o+2] = e[8]; data[o+3] = e[12] - dx;
        data[o+4] = e[1]; data[o+5] = e[5]; data[o+6] = e[9]; data[o+7] = e[13];
        data[o+8] = e[2]; data[o+9] = e[6]; data[o+10] = e[10]; data[o+11] = e[14] - dz;
      }
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  for (const g of geos) g.dispose();
  const tex = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return { geo, tex, clips, height: box.max.y - box.min.y, triangles: geo.getAttribute('position').count / 3, parts: joints.length };
}

export function fortBakedMaterial(tex: THREE.DataTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uPose = { value: tex };
    shader.vertexShader = `attribute float aPart; attribute vec3 aEmi; attribute float aRough; attribute float aMetal;
attribute vec4 aAnim; attribute vec4 aTint; attribute vec4 aTarget; attribute vec3 aRig; uniform highp sampler2D uPose;
varying vec3 vEmi; varying float vRough; varying float vMetal; varying float vFlash; varying vec4 vTint;
mat4 ftPose(int row,int part){int x=part*3; vec4 a=texelFetch(uPose,ivec2(x,row),0); vec4 b=texelFetch(uPose,ivec2(x+1,row),0); vec4 c=texelFetch(uPose,ivec2(x+2,row),0);
return mat4(a.x,b.x,c.x,0.,a.y,b.y,c.y,0.,a.z,b.z,c.z,0.,a.w,b.w,c.w,1.);}
` + shader.vertexShader.replace('#include <beginnormal_vertex>', `
mat4 pose=ftPose(int(aAnim.x+.5),int(aPart+.5))*(1.-aAnim.z)+ftPose(int(aAnim.y+.5),int(aPart+.5))*aAnim.z;
mat3 axes=mat3(pose); vec3 objectNormal=mat3(cross(axes[1],axes[2]),cross(axes[2],axes[0]),cross(axes[0],axes[1]))*normal;
vEmi=aEmi; vRough=aRough; vMetal=aMetal; vFlash=aAnim.w; vTint=aTint;
`).replace('#include <begin_vertex>', `vec3 transformed=(pose*vec4(position,1.)).xyz;
if(aTarget.w>.5 && aRig.x>.5){
  if(aRig.x<1.5) transformed+=aTarget.xyz-pose[3].xyz;
  else {vec3 end=(pose*vec4(0.,0.,aRig.z,1.)).xyz;transformed+=(aTarget.xyz+vec3(0.,.22,0.)-end)*aRig.y;}
}`);
    shader.fragmentShader = 'varying vec3 vEmi; varying float vRough; varying float vMetal; varying float vFlash; varying vec4 vTint;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vTint.rgb,vTint.a); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),vFlash);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=vRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor=vMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=vEmi+vec3(.5)*vFlash;');
  };
  mat.customProgramCacheKey = () => 'fort-approved-rigid-v1';
  return mat;
}

export function frameAt(clip: ClipRows, time: number): number {
  const t = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.max(0, Math.min(clip.duration, time));
  return Math.min(clip.frames - 1, t * POSE_FPS);
}
