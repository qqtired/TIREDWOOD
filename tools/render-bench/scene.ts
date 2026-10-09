import {
  BackSide, BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DirectionalLight,
  Fog, Group, HemisphereLight, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D,
  PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { createMaterials } from './materials.ts';
import { createSceneData, playerPose, sceneSignature } from './scene-data.ts';
import type { BenchScene, SceneConfig, SceneFlavor } from './types.ts';

/** Procedural workload approximation, deliberately independent of the production game. */
export function createBenchScene(config: SceneConfig, flavor: SceneFlavor): BenchScene {
  const data = createSceneData(config);
  const complexity = config.complexity ?? 1;
  if (flavor !== 'legacy' && flavor !== 'nodes') throw new TypeError('unknown scene flavor');
  const materials = createMaterials(flavor);
  const geometries = new Set<BufferGeometry>();
  const own = <T extends BufferGeometry>(geometry: T): T => { geometries.add(geometry); return geometry; };
  const scene = new Scene();
  scene.name = 'TIREDWOOD procedural harbour benchmark';
  scene.background = null;
  scene.fog = new Fog(0x9ddbf1, 75, 150);
  const camera = new PerspectiveCamera(48, 1280 / 720, 0.1, 180);
  const sky = new HemisphereLight(0xe4f7ff, 0xb5a085, 2.0);
  const sun = new DirectionalLight(0xfff3d7, 3.0);
  sun.name = 'static-sun';
  sun.position.set(-25, 38, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 32, bottom: -32, near: 1, far: 110 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sky, sun, sun.target);

  // Color clear backgrounds bypass ACES in classic WebGL, but are tone mapped
  // in the node renderer's global output pass. One shared mesh aligns that path.
  const skyMaterial = materials.basic(0x9ddbf1);
  skyMaterial.side = BackSide;
  skyMaterial.toneMapped = true;
  skyMaterial.fog = false;
  skyMaterial.depthWrite = false;
  const skyDome = new Mesh(own(new SphereGeometry(140, 16, 8)), skyMaterial);
  skyDome.name = 'sky-dome';
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -100;
  scene.add(skyDome);

  const box = own(new BoxGeometry(1, 1, 1));
  function mesh(name: string, geometry: BufferGeometry, material: Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, casts = false) {
    const object = new Mesh(geometry, material);
    object.name = name;
    object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = casts; object.receiveShadow = true;
    object.updateMatrix(); object.matrixAutoUpdate = false;
    scene.add(object);
    return object;
  }
  mesh('quay', box, materials.standard(0xd4c3a6), 0, -0.35, -4, 74, 0.7, 30);
  mesh('quay-edge', box, materials.standard(0xc0ad93), 0, -0.3, 11.2, 74, 0.8, 0.45);
  const waterSegments: [number, number] = [96 * complexity, 80];
  const waterGeometry = own(new PlaneGeometry(125, 110, ...waterSegments));
  waterGeometry.rotateX(-Math.PI / 2);
  const water = mesh('sea', waterGeometry, materials.sea(), 0, -0.65, 42);
  water.receiveShadow = false;
  const roof = own(new ConeGeometry(1, 1, 4)); roof.rotateY(Math.PI / 4);
  const roofMaterial = materials.standard(0xb5644a);
  const windowMaterial = materials.standard(0x406d77, 0.35, 0.1);
  for (let i = 0; i < data.buildings.length; i++) {
    const b = data.buildings[i];
    const compact = complexity === 10 && i >= 10;
    const roofHeight = compact ? 0.6 : 1.8;
    mesh(`building-${i}`, box, materials.standard(b.color), b.x, b.height / 2, b.z, b.width, b.height, b.depth, true);
    mesh(`roof-${i}`, roof, roofMaterial, b.x, b.height + roofHeight / 2, b.z, b.width * 0.85, roofHeight, b.depth * 0.85, true);
    mesh(`window-${i}`, box, windowMaterial, b.x, compact ? b.height * 0.55 : 2.2, b.z + b.depth / 2 + 0.03, b.width * 0.62, compact ? b.height * 0.32 : 1.25, 0.06);
  }

  const dummy = new Object3D();
  function instances(name: string, geometry: BufferGeometry, material: Material, count: number, casts = false) {
    const object = new InstancedMesh(geometry, material, count);
    object.name = name; object.castShadow = casts; object.receiveShadow = true;
    scene.add(object);
    return object;
  }
  const trunks = instances('tree-trunks', own(new CylinderGeometry(0.18, 0.24, 2.6, 8)), materials.standard(0x8f7351), data.trees.length, true);
  const crowns = instances('tree-crowns', own(new ConeGeometry(1.1, 4.8, 10)), materials.standard(0x497f54), data.trees.length, true);
  data.trees.forEach((tree, i) => {
    dummy.position.set(tree.x, 1.3 * tree.scale, tree.z); dummy.scale.setScalar(tree.scale); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 4 * tree.scale; dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;

  const bodyGeometry = own(new SphereGeometry(1, 24, 16));
  const eyeGeometry = own(new SphereGeometry(1, 8, 6));
  const eyeMaterial = materials.basic(0x273849);
  const actors: Group[] = [];
  const blobs = instances('player-ground-shadows', own(new CircleGeometry(1, 16).rotateX(-Math.PI / 2)), materials.basic(0x3c3a31, 0.16), data.players.length);
  blobs.receiveShadow = false;
  data.players.forEach((player, i) => {
    const group = new Group(); group.name = `player-${i}`;
    const jelly = materials.jelly(player.color, player.phase);
    const body = new Mesh(bodyGeometry, jelly); body.name = `jelly-body-${i}`;
    body.scale.set(player.radius, player.radius * 0.92, player.radius);
    group.add(body);
    for (const side of [-1, 1]) {
      const hand = new Mesh(bodyGeometry, jelly); hand.name = `jelly-hand-${i}-${side}`;
      hand.scale.set(0.22, 0.25, 0.22); hand.position.set(side * player.radius * 1.03, -0.03, 0.03);
      const eye = new Mesh(eyeGeometry, eyeMaterial); eye.name = `jelly-eye-${i}-${side}`;
      eye.scale.set(0.065, 0.09, 0.055); eye.position.set(side * player.radius * 0.28, player.radius * 0.14, player.radius * 0.955);
      group.add(hand, eye);
    }
    actors.push(group); scene.add(group);
  });

  if (config.rain) {
    const rainGeometry = own(new PlaneGeometry(0.022, 0.5));
    rainGeometry.setAttribute('benchRainPhase', new InstancedBufferAttribute(new Float32Array(data.rain.map(drop => drop.phase)), 1));
    const rain = instances('rain-drops', rainGeometry, materials.rain(), data.rain.length);
    rain.castShadow = false; rain.receiveShadow = false;
    // Shader displacements exceed the tiny base quad's bounds. Keep this workload visible.
    rain.frustumCulled = false;
    data.rain.forEach((drop, i) => {
      // Translation only: TSL positionNode runs after instancing, classic begin_vertex before it.
      // A vertical displacement commutes with this translation in both paths.
      dummy.position.set(drop.x, 10, drop.z); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); rain.setMatrixAt(i, dummy.matrix);
    });
    rain.instanceMatrix.needsUpdate = true;
  }

  let meshCount = 0, triangles = 0, instanceCount = 0;
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const count = object instanceof InstancedMesh ? object.count : 1;
    meshCount++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * count;
    if (object instanceof InstancedMesh) instanceCount += object.count;
  });
  const manifest = {
    name: complexity === 10 ? 'Procedural harbour slice v3 ×10' : 'Procedural harbour slice v2', ...config,
    complexity, buildings: data.buildings.length, trees: data.trees.length, rainDrops: data.rain.length,
    waterSegments, waterTriangles: waterSegments[0] * waterSegments[1] * 2, characterMeshes: config.players * 5,
    meshes: meshCount, triangles, instances: instanceCount,
    signature: sceneSignature(config, data),
    notes: [
      'Approximation of TIREDWOOD; not the production scene, full shader set, multiplayer or capacity test.',
      'Identical procedural descriptors, geometry, CPU motion, camera and shader formulas across A/B/C; B/C use the same TSL factory.',
      'Standard PBR lighting approximates the game. Legacy and node pipelines may shade/tone-map/shadow-filter differently.',
      'Shared 140-unit, 16x8-segment tone-mapped sky dome aligns background ACES processing; no Color clear background.',
      'Vertex wobble and sea waves leave base normals unchanged in both material paths; water has no reflection/refraction.',
      'One 1024px static sun shadow map for buildings/trees; moving characters use flat translucent ground blobs, not animated shadow maps.',
      'Trees/rain are instanced; each character has five meshes. No textures, text, postprocessing, automatic LOD or gameplay systems.',
      ...(complexity === 10 ? [
        '10x declared component workload: 100 buildings, 240 trees, up to 18000 rain drops, 960x80 water segments. Players are the actual config count, never a hidden multiplier.',
        'Extra compact market buildings and small trees occupy distinct rows within the original quay footprint. Static overhead and instanced draw calls do not scale by 10; submitted work must be measured.',
      ] : []),
    ],
  };
  let disposed = false;
  function tick(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('simulation time must be finite and non-negative');
    materials.tick(seconds);
    data.players.forEach((player, i) => {
      const pose = playerPose(player, seconds);
      actors[i].position.set(pose.x, pose.y, pose.z); actors[i].rotation.y = pose.yaw;
      dummy.position.set(pose.x, 0.025, pose.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(player.radius * 1.15, 1, player.radius * 1.15); dummy.updateMatrix(); blobs.setMatrixAt(i, dummy.matrix);
    });
    blobs.instanceMatrix.needsUpdate = true;
    camera.position.set(26 + Math.sin(seconds * 0.08) * 3, 18.5, 33 + Math.cos(seconds * 0.08) * 2);
    camera.lookAt(0, 1.5, -3);
    camera.updateMatrixWorld(true);
    skyDome.position.copy(camera.position);
  }
  tick(0);
  return {
    scene, camera, manifest, tick,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      geometries.clear(); materials.dispose(); sun.shadow.dispose();
      scene.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
      scene.clear();
    },
  };
}
