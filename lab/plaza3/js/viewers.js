// 3D-окна страницы обзора новой набережной. three.js r186 с jsDelivr (importmap в index.html), модели — из assets/.
// Устройство окна — как в lab/fishing-review/js/viewers.js: колесо мыши над сценой прокручивает страницу, зум — только
// после клика по сцене и выключается, когда курсор ушёл; рисуем только пока окно на экране (IntersectionObserver).
// Маленьких окон (павильоны, жители, набор kit) на странице десятки, а контекстов WebGL у браузера ~16, поэтому их рисует
// ОДИН общий рендерер в свои 2D-холсты (и шейдеры собираются один раз на всех). Площадь целиком — свой рендерер.
// Вид — как в игре: кривая тона и «рисованный» свет из pavilions/models/viewer.html (копия client lookpaint.ts),
// материалы по семействам p3_*, предметы павильонов — инстансами по пустышкам anchor_prop__*, лампочки — одним мешем.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');

// ------------------------------------------------------------------------------------------------ загрузка
const loader = new GLTFLoader();
const cache = new Map();
// свои часы вместо THREE.Clock (в r186 он помечен устаревшим и пишет предупреждение в консоль)
function mkClock() {
  let t = performance.now();
  return { getDelta() { const n = performance.now(), d = (n - t) / 1000; t = n; return d; } };
}
export function load(url, onProg) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => loader.load(url, (g) => { g.scene.updateMatrixWorld(true); res(g); }, onProg,
      () => { cache.delete(url); rej(new Error('не загрузился ' + url)); })));
  }
  return cache.get(url);
}
const jsonCache = new Map();
function loadJson(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return jsonCache.get(url);
}
const imgCache = new Map();
function loadImg(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
  }
  return imgCache.get(url);
}

// ------------------------------------------------------------------------------------------------ тема
export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function onTheme(fn) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', fn);
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  fn();
  return () => { mq.removeEventListener('change', fn); mo.disconnect(); };
}

// ------------------------------------------------------------------------------------------------ вид игры: тон и «рисованный» свет
const TONE = { exposure: 1.08, shade: [0.92, 0.96, 1.1], light: [1.07, 1.0, 0.88], t0: 0.05, t1: 1.0, sat: 1.42, lift: 0.4 };
const f3 = (v) => `vec3( ${v.map((x) => x.toFixed(4)).join(', ')} )`;
const TONE_GLSL = `
vec3 CustomToneMapping( vec3 color ) {
	const mat3 lookIn = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
	const mat3 lookOut = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
	const vec3 lum = vec3( 0.2126, 0.7152, 0.0722 );
	vec3 c = max( color, 0.0 ) * ( toneMappingExposure * ${(TONE.exposure / 0.6).toFixed(5)} );
	float l = dot( c, lum );
	c *= mix( ${f3(TONE.shade)}, ${f3(TONE.light)}, smoothstep( ${TONE.t0.toFixed(4)}, ${TONE.t1.toFixed(4)}, l ) );
	l = dot( c, lum );
	c = max( vec3( l ) + ( c - l ) * ${TONE.sat.toFixed(4)}, 0.0 );
	c = saturate( lookOut * RRTAndODTFit( lookIn * c ) );
	vec3 d = 1.0 - c;
	return c + ${TONE.lift.toFixed(4)} * c * d * d;
}`;
const TONE_STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const TONE_OK = THREE.ShaderChunk.tonemapping_pars_fragment.includes(TONE_STUB);
if (TONE_OK) THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(TONE_STUB, TONE_GLSL);
const WRAP = 0.3;
const PAINT_PARS = `
varying vec3 vLookW;
uniform vec3 uLookShade;
uniform float uLookSunInv;
float lookLit = 0.0;
vec3 lookDirect( float nl, vec3 light ) {
	float w = saturate( ( nl + ${WRAP.toFixed(3)} ) / ${(1 + WRAP).toFixed(3)} );
	lookLit = max( lookLit, saturate( luminance( light ) * uLookSunInv ) * smoothstep( -0.05, 0.35, nl ) );
	return light * ( w * mix( ${f3([0.82, 0.9, 1.12])}, vec3( 1.0 ), smoothstep( 0.0, 0.5, w ) ) );
}
float lookWobble( vec3 p ) {
	return sin( p.x * 0.9 + sin( p.z * 1.3 + p.y * 0.7 ) * 1.7 ) * sin( p.z * 0.8 + sin( p.x * 1.1 - p.y * 0.9 ) * 1.5 + p.y * 0.4 );
}`;
const GRAIN = `
	{
		float lookFar = length( vLookW - cameraPosition );
		if ( lookFar < 260.0 ) {
			vec3 lookK = vec3( 0.075, 0.055, 0.035 ) * lookWobble( vLookW * 0.45 ) * ( 1.0 - smoothstep( 120.0, 260.0, lookFar ) );
			if ( lookFar < 70.0 ) lookK += 0.04 * lookWobble( vLookW * 1.9 + 7.3 ) * ( 1.0 - smoothstep( 25.0, 70.0, lookFar ) );
			diffuseColor.rgb *= 1.0 + lookK;
		}
	}`;
const VERT_POS = `
	{
		vec4 lookWp = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			lookWp = instanceMatrix * lookWp;
		#endif
		vLookW = ( modelMatrix * lookWp ).xyz;
	}`;
const PHYS = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const PHYS_OK = THREE.ShaderChunk.lights_physical_pars_fragment.includes(PHYS);
const physical = THREE.ShaderChunk.lights_physical_pars_fragment.replace(PHYS,
  'reflectedLight.directDiffuse += lookDirect( dot( geometryNormal, directLight.direction ), directLight.color ) * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );');
const paintUniforms = { uLookShade: { value: new THREE.Color(0.9, 0.96, 1.22) }, uLookSunInv: { value: 1 / 3.2 * 1.6 } };
function paint(m) {
  if (!m.isMeshStandardMaterial || !PHYS_OK) return m;
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLookW;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_POS}`);
    Object.assign(s.uniforms, paintUniforms);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${PAINT_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', physical)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= mix( uLookShade, vec3( 1.0 ), lookLit );')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GRAIN}`);
  };
  m.customProgramCacheKey = () => 'look2g' + (m.isMeshPhysicalMaterial ? 'p' : '');
  return m;
}
function setupRenderer(r) {
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = TONE_OK ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.shadowMap.autoUpdate = false;
}

// ------------------------------------------------------------------------------------------------ материалы по семействам
const FAM = new Map();
function famMat(name) {
  let m = FAM.get(name);
  if (m) return m;
  if (name === 'p3_glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  else if (name === 'npc_jelly') m = paint(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }));
  else m = paint(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: name === 'p3_gloss' ? 0.35 : name === 'p3_foliage' ? 0.8 : 0.85, metalness: 0 }));
  m.name = name;
  FAM.set(name, m);
  return m;
}
function applyFam(o, { npc = false } = {}) {
  if (!o.isMesh) return;
  const src = Array.isArray(o.material) ? o.material[0] : o.material;
  const name = src?.name || 'p3_matte';
  if (!o.geometry.attributes.color) { if (src?.isMeshStandardMaterial) paint(src); return; } // без цвета вершин — свой материал как есть
  o.material = famMat(npc && name === 'p3_gloss' ? 'npc_jelly' : (/^p3_/.test(name) ? name : 'p3_matte'));
}
let bulbGeo = null, bulbMat = null;
function bulbParts() {
  bulbGeo ||= new THREE.IcosahedronGeometry(0.05, 1);
  bulbMat ||= new THREE.MeshBasicMaterial({ color: 0xffe3a6, toneMapped: false });
  return [bulbGeo, bulbMat];
}
let blobTex = null;
function blobShadow(r = 0.62) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(40,24,20,.45)'); gr.addColorStop(0.55, 'rgba(40,24,20,.22)'); gr.addColorStop(1, 'rgba(40,24,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}
export function countTris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += o.isInstancedMesh ? t * o.count : t;
  });
  return Math.round(n);
}

// ------------------------------------------------------------------------------------------------ холсты: вывеска, экран
function drawBall(g, cx, cy, r) {
  g.fillStyle = '#2a1f24'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.fillStyle = '#fff3de'; g.beginPath(); g.arc(cx - r * 0.12, cy - r * 0.12, r * 0.48, 0, 7); g.fill();
  g.fillStyle = '#2a1f24'; g.font = `900 ${Math.round(r * 0.62)}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('8', cx - r * 0.12, cy - r * 0.08); g.textAlign = 'left';
}
function signTexture(cfg, w, h, icon) {
  const W = 1024, H = Math.max(96, Math.min(1024, Math.round(W * h / Math.max(0.01, w))));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff3de'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffd35a'; g.lineWidth = Math.max(6, H * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  const r = H * 0.36;
  if (icon) g.drawImage(icon, H * 0.5 - r, H * 0.5 - r, r * 2, r * 2);
  else if (cfg.icon === 'ball') drawBall(g, H * 0.5, H * 0.5, r * 0.8);
  else { g.fillStyle = '#d9643a'; g.beginPath(); g.arc(H * 0.5, H * 0.5, r * 0.8, 0, 7); g.fill(); }
  const title = cfg.text || '';
  g.fillStyle = '#2a1f24';
  let fs = Math.round(H * 0.4);
  g.font = `900 ${fs}px Rubik, sans-serif`;
  while (g.measureText(title).width > W - H * 1.15 && fs > 10) { fs -= 2; g.font = `900 ${fs}px Rubik, sans-serif`; }
  g.textBaseline = 'alphabetic';
  g.fillText(title, H * 1.02, H * (cfg.status ? 0.55 : 0.64));
  if (cfg.status) {
    g.fillStyle = '#c4512d'; g.font = `700 ${Math.round(Math.min(fs * 0.52, H * 0.2))}px Rubik, sans-serif`;
    g.fillText(cfg.status, H * 1.04, H * 0.84);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function screenTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 460;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 460); gr.addColorStop(0, '#2b2330'); gr.addColorStop(1, '#3a2b33');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 460);
  g.textAlign = 'center';
  g.fillStyle = '#ffd35a'; g.font = '900 64px Rubik, sans-serif'; g.fillText('МАТЧ · 1:42', 512, 92);
  g.font = '900 150px Rubik, sans-serif';
  g.fillStyle = '#ec8a3e'; g.fillText('3', 330, 300);
  g.fillStyle = '#fff3de'; g.fillText(':', 512, 290);
  g.fillStyle = '#9dc64c'; g.fillText('2', 694, 300);
  g.font = '700 40px Rubik, sans-serif'; g.fillStyle = '#fff3de'; g.fillText('рыжие            лаймы', 512, 380);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  return t;
}
// автомат аркады у пустышки anchor_arcade_N (в курзале): корпус и светящийся экран, лицом к −Z
const CAB_COLORS = [0x2f8a4f, 0xb8332f, 0xd9a04a];
let cabGeo = null, cabScreenGeo = null;
function arcadeCabinet(i) {
  cabGeo ||= new THREE.BoxGeometry(0.82, 1.78, 0.72).translate(0, 0.89, 0);
  cabScreenGeo ||= new THREE.PlaneGeometry(0.6, 0.46).rotateY(Math.PI).translate(0, 1.32, -0.365);
  const g = new THREE.Group();
  const body = new THREE.Mesh(cabGeo, paint(new THREE.MeshStandardMaterial({ color: CAB_COLORS[i % 3], roughness: 0.4 })));
  const scr = new THREE.Mesh(cabScreenGeo, new THREE.MeshBasicMaterial({ color: [0x9cf0b8, 0xffb0a0, 0xffe2a0][i % 3], toneMapped: false, side: THREE.DoubleSide }));
  g.add(body, scr);
  return g;
}

// ------------------------------------------------------------------------------------------------ павильон из GLB
// Возвращает Group в осях павильона (лицо −Z): статика с материалами семейств, предметы инстансами, лампочки, вывески,
// экраны; пустышки anchor_* и коллайдеры col_* убраны. resident — точка жителя (anchor_resident), если есть.
let kitManP = null;
export async function buildPavilion(url, { assets, signs = [], onProg } = {}) {
  const g = await load(url, onProg);
  const root = g.scene.clone(true);
  root.updateMatrixWorld(true);
  const anchors = [];
  root.traverse((o) => { if (/^(anchor_|col_)/.test(o.name)) anchors.push(o); });
  const isAnchor = new Set(anchors);
  const under = (o) => { for (let p = o; p; p = p.parent) if (isAnchor.has(p)) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || under(o)) return;
    if (/^live_screen/.test(o.name) || /^live_screen/.test(o.parent?.name || '')) { o.material = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }); return; }
    applyFam(o);
    const glow = o.material?.name === 'p3_glow';
    o.castShadow = !glow; o.receiveShadow = true;
  });
  const out = new THREE.Group();
  out.add(root);
  const mats = (re) => anchors.filter((a) => re.test(a.name));
  // предметы
  const want = new Map();
  for (const a of anchors) {
    const m = /^anchor_prop__(.+?)__\d+$/.exec(a.name);
    if (!m) continue;
    if (!want.has(m[1])) want.set(m[1], []);
    want.get(m[1]).push(a.matrixWorld.clone());
  }
  if (want.size && assets) {
    kitManP ||= assets.kit?.manifest ? loadJson(assets.kit.manifest) : Promise.resolve(null);
    const kitMan = await kitManP;
    const propNames = new Set(assets.props?.pieces || []);
    const fileOf = (n) => {
      if (assets.propFiles?.[n]) return assets.propFiles[n];
      const k = kitMan?.pieces?.find((p) => p.name === n);
      if (k) return 'assets/models/kit/' + k.file;
      if (propNames.has(n) && assets.props?.file) return assets.props.file;
      return null;
    };
    const files = [...new Set([...want.keys()].map(fileOf).filter(Boolean))];
    const kits = await Promise.all(files.map((f) => load(f).catch(() => null)));
    const inv = new THREE.Matrix4(), tmp = new THREE.Matrix4();
    for (const [name, list] of want) {
      const node = kits.map((k) => k?.scene.getObjectByName(name)).find(Boolean);
      if (!node) continue;
      inv.copy(node.matrixWorld).invert();
      node.traverse((o) => {
        if (!o.isMesh) return;
        const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const mat = o.geometry.attributes.color ? famMat(/^p3_/.test(o.material.name) ? o.material.name : 'p3_matte') : o.material;
        const im = new THREE.InstancedMesh(o.geometry, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, rel)));
        im.castShadow = mat.name !== 'p3_glow'; im.receiveShadow = true;
        im.frustumCulled = false;
        out.add(im);
      });
    }
  }
  // лампочки
  const bulbs = mats(/^anchor_bulbs_\d+$/);
  if (bulbs.length) {
    const [bg, bm] = bulbParts();
    const im = new THREE.InstancedMesh(bg, bm, bulbs.length);
    bulbs.forEach((b, i) => im.setMatrixAt(i, b.matrixWorld));
    im.frustumCulled = false;
    out.add(im);
  }
  // вывески
  const faces = mats(/^anchor_sign_face/);
  if (faces.length && signs.length) {
    await document.fonts?.load('900 64px Rubik').catch(() => {});
    for (let i = 0; i < faces.length; i++) {
      const cfg = signs[Math.min(i, signs.length - 1)];
      const icon = await loadImg(assets?.ui?.icons?.[cfg.icon]);
      const s = new THREE.Vector3();
      faces[i].matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: signTexture(cfg, Math.abs(s.x), Math.abs(s.y), icon), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      quad.matrixAutoUpdate = false;
      quad.matrix.copy(faces[i].matrixWorld);
      out.add(quad);
    }
  }
  // автоматы аркады в курзале
  mats(/^anchor_arcade_\d+$/).forEach((a, i) => {
    const cab = arcadeCabinet(i);
    cab.matrixAutoUpdate = false;
    cab.matrix.copy(a.matrixWorld);
    out.add(cab);
  });
  const res = anchors.find((a) => a.name === 'anchor_resident');
  out.userData.resident = res ? new THREE.Vector3().setFromMatrixPosition(res.matrixWorld) : null;
  out.userData.residentYaw = res ? new THREE.Euler().setFromRotationMatrix(res.matrixWorld).y : null;
  const bb = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && !under(o)) bb.expandByObject(o); });
  out.userData.box = bb.isEmpty() ? new THREE.Box3().setFromObject(root) : bb;
  return out;
}

// ------------------------------------------------------------------------------------------------ житель: ожидание
// Клипы idle/greet, если они есть в GLB; иначе — по частям userData.animation_part: покачивание тела (с сохранением
// объёма), моргание (eyes.scale.y → 0,12, как у игрока) и взмах свободной рукой раз в несколько секунд.
export function npcIdle(root, clips = [], phase = Math.random() * 10) {
  const idleClip = clips.find((c) => c.name === 'idle');
  if (idleClip) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(idleClip).play();
    if (phase) mixer.update(phase % idleClip.duration);
    return (dt) => mixer.update(dt);
  }
  const P = {};
  root.traverse((o) => { const p = o.userData?.animation_part; if (p && !P[p]) P[p] = o; });
  const base = new Map();
  for (const o of Object.values(P)) base.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
  const holds = (h) => { let y = false; h?.traverse((o) => { if (/^prop/.test(o.userData?.animation_part || '')) y = true; }); return y; };
  const hand = [P['hand.R'], P['hand.L']].find((h) => h && !holds(h)) || P['hand.R'] || P['hand.L'];
  const side = hand && hand === P['hand.L'] ? -1 : 1;
  return (dt, t0) => {
    const t = t0 + phase;
    const body = P.body;
    if (body) {
      const b = base.get(body), s = Math.sin(t * 2.1);
      body.scale.set(b.s.x * (1 - 0.013 * s), b.s.y * (1 + 0.026 * s), b.s.z * (1 - 0.013 * s));
      body.rotation.z = b.r.z + Math.sin(t * 0.9) * 0.035;
      body.rotation.y = b.r.y + Math.sin(t * 0.45) * 0.08;
    }
    const eyes = P.eyes;
    if (eyes) {
      const b = base.get(eyes), c = t % 3.7;
      const k = c < 0.16 ? 0.12 + 0.88 * Math.abs(c - 0.08) / 0.08 : 1;
      eyes.scale.y = b.s.y * k;
    }
    if (hand) {
      const b = base.get(hand), c = t % 6.5;
      const w = c < 1.8 ? Math.sin(Math.PI * c / 1.8) : 0;
      hand.position.set(b.p.x + side * 0.07 * w, b.p.y + 0.3 * w, b.p.z - 0.05 * w);
      hand.rotation.z = b.r.z + side * 0.45 * w + Math.sin(t * 13) * 0.3 * w;
    }
  };
}

// ------------------------------------------------------------------------------------------------ окно-сцена
class Stage {
  constructor(host, { fov = 40, near = 0.1, far = 2000, shared = false, fps = 60 } = {}) {
    this.host = host;
    this.shared = shared;
    if (shared) {
      this.canvas = document.createElement('canvas');
      this.ctx2d = this.canvas.getContext('2d');
    } else {
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      setupRenderer(r);
      this.canvas = r.domElement;
    }
    host.insertBefore(this.canvas, host.firstChild);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Колесо мыши над сценой не отнимает прокрутку у страницы: зум включается после клика по сцене и выключается,
    // когда курсор ушёл. Палец на телефоне: пока не нажал на сцену — страница прокручивается (touch-action pan-y).
    this.controls.enableZoom = false;
    this.canvas.addEventListener('pointerdown', () => { this.controls.enableZoom = true; this.canvas.classList.add('live'); });
    this.canvas.addEventListener('pointerleave', () => { this.controls.enableZoom = false; this.canvas.classList.remove('live'); });
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('start', () => { this.active = true; });
    this.controls.addEventListener('end', () => { this.active = false; });
    this.tickers = [];
    this.labels = [];
    this.time = 0;
    this.visible = false;
    this.dirty = true;
    this.animated = false;
    this.minDt = 1 / fps;
    this.hud = document.createElement('div'); this.hud.className = 'hud'; host.appendChild(this.hud);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.dirty = true; }, { threshold: 0.02 });
    this.io.observe(host);
    this.resize();
    if (shared) Mini.add(this);
    else {
      this.clock = mkClock();
      let acc = 0;
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(this.clock.getDelta(), 0.1);
        if (!this.visible || document.hidden) return;
        acc += dt;
        if (!this.active && !this.controls.autoRotate && acc < this.minDt) return; // в покое — реже
        this.step(acc);
        acc = 0;
        this.renderer.render(this.scene, this.camera);
        this.afterFrame();
      };
      this.raf = requestAnimationFrame(loop);
    }
  }
  step(dt) {
    this.time += dt;
    for (const t of [...this.tickers]) t(dt, this.time);
    if (this.controls.update(dt)) this.dirty = true;
  }
  afterFrame() {
    this.dirty = false;
    this.placeLabels();
    if (!this.firstFrame) { this.firstFrame = true; this.onFirstFrame?.(); }
    this.afterRender?.();
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    if (this.shared) { this.canvas.width = Math.round(w * DPR); this.canvas.height = Math.round(h * DPR); }
    else this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  setHud(items) { this.hud.innerHTML = items.filter(Boolean).map((t) => `<span>${t}</span>`).join(''); }
  label(text, obj, { off = 0, maxDist = Infinity, minDist = 0, cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = 'lbl' + (cls ? ' ' + cls : ''); el.textContent = text; el.style.display = 'none';
    this.host.appendChild(el);
    const L = { el, obj, off, maxDist, minDist, v: new THREE.Vector3(), show: true };
    this.labels.push(L);
    return L;
  }
  placeLabels() {
    if (!this.labels.length) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const L of this.labels) {
      if (L.obj.isVector3) L.v.copy(L.obj); else L.obj.getWorldPosition(L.v);
      L.v.y += L.off;
      const d = L.v.distanceTo(this.camera.position);
      L.v.project(this.camera);
      let vis = this.labelsOn !== false && L.show && L.v.z < 1 && Math.abs(L.v.x) < 1.05 && Math.abs(L.v.y) < 1.05 && d < L.maxDist && d >= L.minDist;
      if (vis && !L.obj.isVector3) { for (let o = L.obj; o; o = o.parent) if (o.visible === false) { vis = false; break; } }
      L.el.style.display = vis ? '' : 'none';
      if (vis) L.el.style.transform = `translate(${((L.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-L.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -120%)`;
    }
  }
  toast(text, ms = 3600) {
    if (!this.toastEl) { this.toastEl = document.createElement('div'); this.toastEl.className = 'toast'; this.host.appendChild(this.toastEl); }
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { if (this.toastEl) this.toastEl.style.opacity = '0'; }, ms);
  }
  tween(pos, target, dur = 1.6, done) {
    const c = this.camera, ctl = this.controls;
    const p0 = c.position.clone(), t0 = ctl.target.clone();
    if (REDUCED || dur <= 0) { c.position.copy(pos); ctl.target.copy(target); this.dirty = true; done?.(); return; }
    let k = 0;
    ctl.enabled = false;
    this.active = true;
    const f = (dt) => {
      k = Math.min(1, k + dt / dur);
      const e = ease(k);
      c.position.lerpVectors(p0, pos, e);
      ctl.target.lerpVectors(t0, target, e);
      this.dirty = true;
      if (k >= 1) { this.tickers.splice(this.tickers.indexOf(f), 1); ctl.enabled = true; this.active = false; done?.(); }
    };
    this.tickers.push(f);
  }
  // кадр «3/4 спереди» по габаритам: лицо модели смотрит в −Z, камера — спереди-слева, чуть выше глаз
  frameFront(box, { k = 0.9, minY = 2.2, lookY = 0.4, side = 0.55 } = {}) {
    const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const R = Math.max(0.5, size.length() / 2);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = (R * 1.02) / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect)) / 2);
    this.camera.position.set(ctr.x - fit * side * k, Math.max(minY, ctr.y + size.y * 0.15), ctr.z - fit * 0.85 * k);
    this.controls.target.set(ctr.x, box.min.y + size.y * lookY, ctr.z);
    this.camera.near = Math.max(0.02, fit / 200);
    this.camera.far = fit * 40;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = R * 0.5;
    this.controls.maxDistance = fit * 2.6;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();
    this.dirty = true;
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.shared) Mini.remove(this);
    this.ro.disconnect(); this.io.disconnect();
    this.offTheme?.();
    this.controls.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); }
    this.canvas.remove();
    this.hud.remove();
    this.toastEl?.remove();
    for (const L of this.labels) L.el.remove();
    this.labels = [];
  }
}

// ------------------------------------------------------------------------------------------------ общий рендерер маленьких окон
const Mini = {
  r: null, stages: new Set(), raf: 0, clock: mkClock(), w: 0, h: 0, info: { calls: 0 },
  add(st) {
    this.stages.add(st);
    if (!this.r) {
      this.r = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.r.setPixelRatio(1);
      setupRenderer(this.r);
      this.r.setScissorTest(true);
    }
    if (!this.raf) { this.clock.getDelta(); this.raf = requestAnimationFrame(() => this.loop()); }
  },
  remove(st) { this.stages.delete(st); },
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (document.hidden) return;
    for (const st of this.stages) {
      if (!st.visible) continue;
      st.step(dt);
      if (!st.dirty && !st.animated) continue;
      const pw = st.canvas.width, ph = st.canvas.height;
      if (!pw || !ph) continue;
      if (pw > this.w || ph > this.h) { this.w = Math.max(this.w, pw); this.h = Math.max(this.h, ph); this.r.setSize(this.w, this.h, false); }
      this.r.setViewport(0, 0, pw, ph);
      this.r.setScissor(0, 0, pw, ph);
      this.r.shadowMap.needsUpdate = !!st.shadowDirty;
      st.shadowDirty = false;
      this.r.render(st.scene, st.camera);
      st.calls = this.r.info.render.calls;
      st.ctx2d.drawImage(this.r.domElement, 0, this.h - ph, pw, ph, 0, 0, pw, ph);
      st.afterFrame();
    }
  },
};

function lightStudio(st, { sunFrom = new THREE.Vector3(-0.45, 0.62, -0.65), shadowR = 14 } = {}) {
  const hemi = new THREE.HemisphereLight(0xb2c8f4, 0xd2a57c, 1.3);
  const sun = new THREE.DirectionalLight(0xffd49a, 3.2);
  sun.position.copy(sunFrom).normalize().multiplyScalar(shadowR * 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 0.5, far: shadowR * 7 });
  sun.shadow.camera.updateProjectionMatrix();
  st.scene.add(hemi, sun, sun.target);
  st.shadowDirty = true;
  return { hemi, sun };
}
function studioGround(st, r = 60) {
  const mat = paint(new THREE.MeshStandardMaterial({ color: 0xe8dfcf, roughness: 0.95 }));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), mat);
  ground.receiveShadow = true;
  st.scene.add(ground);
  st.offTheme = onTheme(() => {
    const d = isDark();
    st.scene.background = new THREE.Color(d ? 0x2a3746 : 0xcfe0ef);
    mat.color.set(d ? 0x6f6658 : 0xe8dfcf);
    st.dirty = true;
  });
  return ground;
}

// ------------------------------------------------------------------------------------------------ окно павильона (и набора kit)
export async function pavilionViewer(host, { assets, models, npcModel, progress }) {
  const st = new Stage(host, { shared: true, fov: 42, near: 0.1, far: 900 });
  studioGround(st, 90);
  const L = lightStudio(st, { shadowR: 16 });
  const group = new THREE.Group(); st.scene.add(group);
  let token = 0, cur = null, tick = null;
  async function show(i) {
    const my = ++token;
    const m = models[i];
    const pav = await buildPavilion(m.file, { assets, signs: m.signs || [], onProg: progress });
    if (my !== token) return;
    group.clear();
    group.add(pav);
    if (tick) { st.tickers = st.tickers.filter((t) => t !== tick); tick = null; }
    const box = pav.userData.box;
    const R = Math.max(6, box.getSize(new THREE.Vector3()).length() / 2);
    Object.assign(L.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, far: R * 7 });
    L.sun.shadow.camera.updateProjectionMatrix();
    L.sun.position.set(-0.45, 0.62, -0.65).normalize().multiplyScalar(R * 3).add(box.getCenter(new THREE.Vector3()));
    L.sun.target.position.copy(box.getCenter(new THREE.Vector3()));
    // житель у входа — если его модель уже есть
    const nm = m.npc || npcModel;
    if (nm && pav.userData.resident) {
      try {
        const ng = await load(nm.file);
        if (my !== token) return;
        const npc = ng.scene.clone(true);
        npc.traverse((o) => { applyFam(o, { npc: true }); o.castShadow = false; });
        npc.position.copy(pav.userData.resident);
        npc.rotation.y = pav.userData.residentYaw ?? 0;
        npc.add(blobShadow());
        pav.add(npc);
        tick = npcIdle(npc, ng.animations);
        st.tickers.push(tick);
        st.animated = true;
      } catch { /* житель не обязателен */ }
    }
    st.frameFront(box, { k: m.k || 0.92 });
    st.shadowDirty = true;
    cur = i;
    // в карточке — только название: число треугольников окна (павильон + вещи + житель без склейки) путает с бюджетом игры
    st.setHud([m.title]);
  }
  await show(0);
  return { show, get current() { return cur; }, stage: st, dispose() { st.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ окно жителя
export async function npcViewer(host, { file, name, progress }) {
  const st = new Stage(host, { shared: true, fov: 30, near: 0.05, far: 200 });
  studioGround(st, 30);
  const L = lightStudio(st, { shadowR: 3 });
  L.sun.castShadow = false;
  const g = await load(file, progress);
  const root = g.scene.clone(true);
  root.traverse((o) => applyFam(o, { npc: true }));
  root.add(blobShadow(0.66));
  st.scene.add(root);
  const box = new THREE.Box3().setFromObject(root);
  // кадр с запасом: шляпа, руки и вещь в руке целиком в окне
  const h = Math.max(1.2, box.max.y), sz = box.getSize(new THREE.Vector3());
  const w = Math.max(sz.x, sz.z * 0.8, 0.8);
  const aspect = Math.max(0.5, (host.clientWidth || 1) / (host.clientHeight || 1));
  const t = Math.tan(THREE.MathUtils.degToRad(st.camera.fov) / 2);
  const d = Math.max((h * 1.3) / (2 * t), (w * 1.3) / (2 * t * aspect));
  const dir = new THREE.Vector3(0.36, 0.2, -1).normalize();
  st.controls.target.set((box.min.x + box.max.x) / 2, h * 0.5, (box.min.z + box.max.z) / 2);
  st.camera.position.copy(st.controls.target).addScaledVector(dir, d);
  st.controls.minDistance = 1.4;
  st.controls.maxDistance = Math.max(9, d * 2);
  st.controls.maxPolarAngle = Math.PI * 0.5;
  st.controls.update();
  st.tickers.push(npcIdle(root, g.animations, 0));
  st.animated = !REDUCED;
  st.setHud([`${fmt(countTris(root))} треугольников`]);
  return { stage: st, dispose() { st.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ площадь целиком
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function flatShape(points, y = 0) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).translate(0, y, 0);
}
function extrudeShape(points, depth, top = 0) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, top, 0);
}
function stripGeo(pts, width, y) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const g = new THREE.PlaneGeometry(len + width * 0.5, width).rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    parts.push(g);
  }
  return parts;
}
function wallGeo(pts, h, thick) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const g = new THREE.BoxGeometry(len + thick, h, thick);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    parts.push(g);
  }
  return parts;
}
// детерминированный «случай» — чтобы задник не прыгал между запусками
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function inPoly(x, z, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function roseTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#efe0c2'; g.fillRect(0, 0, 512, 512);
  g.translate(256, 256);
  g.strokeStyle = '#c9643b'; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 236, 0, 7); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 200, 0, 7); g.stroke();
  for (let i = 0; i < 16; i++) {
    const long = i % 4 === 0, mid = i % 2 === 0;
    const r = long ? 220 : mid ? 150 : 110, w = long ? 34 : 22;
    g.save(); g.rotate(i * Math.PI / 8);
    g.fillStyle = long ? (i === 0 ? '#c9643b' : '#2a1f24') : mid ? '#d9a441' : '#7a9a7e';
    g.beginPath(); g.moveTo(0, -r); g.lineTo(w, 0); g.lineTo(0, w * 0.4); g.lineTo(-w, 0); g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = '#ffd35a'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export async function plazaViewer(host, { assets, layout, models, npcs, signFor, labelFor, quarterOf, onPick, onReady, progress }) {
  const st = new Stage(host, { fov: 45, near: 0.5, far: 1800, fps: 30 });
  const { scene, camera, controls } = st;
  const r = st.renderer;
  const L = layout;
  const C = L.center || { x: 8, z: -8 };
  // ---------------------------------------------------------------- свет и небо
  const hemi = new THREE.HemisphereLight(0xc6daf6, 0xd8b48a, 1.25);
  const sun = new THREE.DirectionalLight(0xffdcae, 3.1);
  const toSun = V3(-0.42, 0.86, 0.58).normalize();
  const sc = V3(17, 0, -6);
  sun.position.copy(sc).addScaledVector(toSun, 160);
  sun.target.position.copy(sc);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06;
  Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 64, bottom: -64, near: 20, far: 340 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, sun, sun.target);
  paintUniforms.uLookSunInv.value = 1.6 / Math.max(0.05, sun.intensity * 0.85);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
    uniforms: { a: { value: new THREE.Color(0xffd9ad) }, b: { value: new THREE.Color(0x9cc4ee) }, c: { value: new THREE.Color(0x4f86d0) } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 a,b,c;\nvarying vec3 p;\nvoid main(){\nfloat h = max(p.y, 0.);\nvec3 col = mix(a, b, smoothstep(0., .18, h));\ncol = mix(col, c, smoothstep(.18, .8, h));\ngl_FragColor = vec4(col, 1.);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcfe0ef, 220, 900);

  // ---------------------------------------------------------------- земля, вода, задник
  const M = (color, rough = 0.9) => paint(new THREE.MeshStandardMaterial({ color, roughness: rough }));
  const matPave = M(0xe9dcc2), matQuay = M(0xb9aa90), matRock = M(0xb3a184, 1), matField = M(0xb8c46e), matHill = M(0x9aa47e);
  const matStone = M(0xd6cbb6), matWood = M(0x9a7a58), matWhite = M(0xf4efe4, 0.7), matProm = M(0xf3e9d3);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), paint(new THREE.MeshStandardMaterial({ color: 0x5a8ea6, roughness: 0.3, metalness: 0.05 })));
  water.position.y = -0.55;
  water.receiveShadow = true;
  scene.add(water);
  const land = L.land?.polygon;
  if (land) {
    const g = extrudeShape(land, 3, 0);
    const m = new THREE.Mesh(g, [matPave, matQuay]);
    m.receiveShadow = true;
    scene.add(m);
  }
  let cliffMesh = null;
  if (L.land?.cliffPolygon) {
    const cliff = cliffMesh = new THREE.Mesh(extrudeShape(L.land.cliffPolygon, 16, 15), matRock);
    cliff.castShadow = true; cliff.receiveShadow = true;
    scene.add(cliff);
  }
  // задник: холм с городком к северу, поле подсолнухов к востоку
  // холм к северу: от кромки суши (z −45) плавно поднимается
  const hillGeo = new THREE.PlaneGeometry(220, 110, 22, 22).rotateX(-Math.PI / 2).translate(25, -0.06, -100);
  const hp = hillGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) hp.setY(i, -0.06 + Math.max(0, -hp.getZ(i) - 50) * 0.18);
  hillGeo.computeVertexNormals();
  const hill = new THREE.Mesh(hillGeo, matHill);
  hill.receiveShadow = true;
  scene.add(hill);
  if (L.land?.fieldPolygon) {
    const f = new THREE.Mesh(extrudeShape(L.land.fieldPolygon, 3, 0.005), [matField, matQuay]);
    f.receiveShadow = true;
    scene.add(f);
    const field = L.land.fieldPolygon;
    const xs = field.map((p) => p[0]), zs = field.map((p) => p[1]);
    const rand = rng(7), pts = [];
    while (pts.length < 520) {
      const x = Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rand() * (Math.max(...zs) - Math.min(...zs));
      if (inPoly(x, z, field) && !(z > -22.5 && z < -17.5)) pts.push([x, z]);
      if (pts.length === 0 && rand() > 2) break;
    }
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 7, 5), M(0xf2c230, 0.7), pts.length);
    const stem = new THREE.InstancedMesh(new THREE.ConeGeometry(0.32, 1.3, 5).translate(0, 0.65, 0), M(0x6f9a3a), pts.length);
    const mt = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { const s = 0.85 + rand() * 0.4; mt.makeScale(s, s, s).setPosition(x, 1.35 * s, z); head.setMatrixAt(i, mt); mt.makeScale(s, s, s).setPosition(x, 0, z); stem.setMatrixAt(i, mt); });
    scene.add(head, stem);
  }
  {
    // городок на холме: дома с черепицей и кипарисы
    const rand = rng(3), n = 34;
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M(0xffffff), n);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), M(0xc9643b, 0.8), n);
    const walls = [0xf1ebe1, 0xf1d3ca, 0xefc8b2, 0xd3e6d2, 0xf0e7d6];
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const x = -4 + rand() * 66, z = -52 - rand() * 26 - (x < 0 ? 6 : 0), w = 5 + rand() * 4, d = 5 + rand() * 3, h = 4.5 + rand() * 5;
      const y = (-z - 50) * 0.18;
      q.setFromEuler(e.set(0, (rand() - 0.5) * 0.4, 0));
      mt.compose(V3(x, y, z), q, V3(w, h, d)); houses.setMatrixAt(i, mt); houses.setColorAt(i, new THREE.Color(walls[i % walls.length]));
      mt.compose(V3(x, y + h, z), q, V3(w * 1.02, 2 + rand(), d * 1.02)); roofs.setMatrixAt(i, mt);
    }
    houses.castShadow = roofs.castShadow = true;
    scene.add(houses, roofs);
    const cyp = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 7, 6).translate(0, 3.5, 0), M(0x3c6b3f), 26);
    for (let i = 0; i < 26; i++) { const x = -6 + rand() * 70, z = -49 - rand() * 22; mt.compose(V3(x, (-z - 50) * 0.18, z), q.identity(), V3(1, 0.8 + rand() * 0.5, 1)); cyp.setMatrixAt(i, mt); }
    cyp.castShadow = true;
    scene.add(cyp);
  }

  // ---------------------------------------------------------------- площадь, кварталы, променады, балюстрады
  const hub = new THREE.Mesh(new THREE.CircleGeometry(15, 72).rotateX(-Math.PI / 2), M(0xf2e6cd));
  hub.position.set(C.x, 0.025, C.z); hub.receiveShadow = true;
  scene.add(hub);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48).rotateX(-Math.PI / 2), paint(new THREE.MeshStandardMaterial({ map: roseTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  rose.position.set(C.x, 0.05, C.z); rose.receiveShadow = true;
  scene.add(rose);
  const qColors = {};
  for (const q of L.quarters || []) {
    qColors[q.id] = q.color;
    if (!q.poly) continue;
    const m = new THREE.Mesh(flatShape(q.poly, 0.012), new THREE.MeshBasicMaterial({ color: q.color, transparent: true, opacity: 0.13, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false }));
    m.renderOrder = 1;
    scene.add(m);
  }
  const promParts = (L.promenades || []).flatMap((p) => stripGeo(p.pts, Math.min(p.width || 4, 9), 0.035));
  if (promParts.length) {
    const m = new THREE.Mesh(mergeGeometries(promParts), matProm);
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1.5; m.material.polygonOffsetUnits = -1.5;
    m.receiveShadow = true;
    scene.add(m);
  }
  const balParts = (L.balustrades || []).flatMap((b) => wallGeo(b.pts, 0.95, 0.28));
  if (balParts.length) { const m = new THREE.Mesh(mergeGeometries(balParts), matWhite); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // фонари площади
  const lamps = L.objects?.lamps || [];
  if (lamps.length) {
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8).translate(0, 2.1, 0), M(0x2e3330, 0.5), lamps.length);
    const [bg] = bulbParts();
    const lampHead = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffe3a6, toneMapped: false }), lamps.length);
    const mt = new THREE.Matrix4();
    lamps.forEach(([x, z], i) => { post.setMatrixAt(i, mt.makeTranslation(x, 0, z)); lampHead.setMatrixAt(i, mt.makeScale(5, 5, 5).setPosition(x, 4.3, z)); });
    post.castShadow = true;
    scene.add(post, lampHead);
  }
  // точка появления
  const spawn = L.spawn || { x: 8, z: -5.6 };
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc9643b, toneMapped: false }));
  arrow.position.set(spawn.x, 0.4, spawn.z);
  scene.add(arrow);
  st.label('Точка появления', arrow, { off: 1.2, maxDist: 70, cls: 'npc' });

  // ---------------------------------------------------------------- маяк и мостки (стоят на месте), молы выбранного варианта
  const portV = L.port ? Object.values(L.port).find((v) => v?.lighthouseKept) : null;
  const lk = portV?.lighthouseKept || { decks: [[-21, 22, -17, 38], [-24, 38, -14, 46], [-17, 36, -14, 38]], lighthouse: { x: -19, z: 43, r: 2.4 } };
  const deckParts = [];
  for (const [x0, z0, x1, z1] of lk.decks || []) deckParts.push(new THREE.BoxGeometry(x1 - x0, 0.5, z1 - z0).translate((x0 + x1) / 2, -0.15, (z0 + z1) / 2));
  if (deckParts.length) { const m = new THREE.Mesh(mergeGeometries(deckParts), matWood); m.receiveShadow = true; m.castShadow = true; scene.add(m); }
  if (lk.lighthouse) {
    const { x, z, r: lr = 2.4 } = lk.lighthouse;
    const tower = new THREE.Group();
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(lr * 0.62, lr, 13, 20).translate(0, 6.5, 0), M(0xf5f1e8, 0.6));
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(lr * 0.66, lr * 0.66, 1.4, 20).translate(0, 13.7, 0), M(0xcf4a3d, 0.5));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(lr * 0.45, lr * 0.45, 1.6, 16).translate(0, 15.2, 0), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(lr * 0.62, 1.8, 16).translate(0, 16.9, 0), M(0xcf4a3d, 0.5));
    for (const m of [t1, t2, cap]) { m.castShadow = true; m.receiveShadow = true; }
    tower.add(t1, t2, lamp, cap);
    tower.position.set(x, 0, z);
    scene.add(tower);
    st.label('Маяк', tower, { off: 19, maxDist: 160 });
  }
  const chosenDecks = [];
  if (L.port) {
    for (const v of Object.values(L.port)) if (v?.chosen || v?.selected) chosenDecks.push(...(v.decks || []));
  }

  // ---------------------------------------------------------------- павильоны: заглушки
  const SPECIAL_SKIP = new Set(['rose']);
  const stubs = new Map(); // id -> Group
  const pickables = [];
  const wallM = M(0xf1e7d4, 0.85), doorM = M(0x2f5c4a, 0.4);
  const topMats = {};
  // крыша заглушки — цвет квартала, приглушённый к штукатурке: видно квартал, но коробка не спорит с готовыми павильонами
  const topM = (q) => (topMats[q] ||= M(new THREE.Color(qColors[q] || '#c9643b').lerp(new THREE.Color(0xf1e7d4), 0.38), 0.8));
  const yawOf = (p) => -THREE.MathUtils.degToRad(p.facing?.compassDeg || 0);
  const labelPos = new Map();
  function stubFor(p) {
    const grp = new THREE.Group();
    const q = p.quarter;
    const h = Math.max(0.4, Math.min(30, p.height || 1));
    if (p.id === 'wheel' && p.box) {
      const cx = (p.box.x0 + p.box.x1) / 2, cz = (p.box.z0 + p.box.z1) / 2, R = Math.min(9, (p.height || 18) / 2 - 0.6);
      const w = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 8, 48), M(0xf4efe4, 0.5));
      w.add(ring);
      for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, R * 2, 0.12), M(0xd63c5e, 0.5)); s.rotation.z = i * Math.PI / 8; w.add(s); }
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), M([0xcf4a3d, 0xf2cf4a, 0x2fa7a0, 0xf28c28][i % 4], 0.5)); cab.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.7, 0); w.add(cab); }
      w.rotation.y = Math.PI / 2;
      w.position.set(cx, R + 0.8, cz);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(1.2, R + 0.8, 3), M(0xf4efe4, 0.6));
      legs.position.set(cx, (R + 0.8) / 2, cz);
      grp.add(w, legs);
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      labelPos.set(p.id, V3(cx, R * 2 + 1.6, cz));
      return grp;
    }
    const boxes = [];
    if (p.box) boxes.push({ ...p.box, h });
    if (p.donjon) { const d = Array.isArray(p.donjon) ? { x0: p.donjon[0], z0: p.donjon[1], x1: p.donjon[2], z1: p.donjon[3] } : p.donjon; if (d.x0 != null) boxes.push({ ...d, h: d.h || 18 }); }
    for (const b of boxes) {
      const w = Math.abs(b.x1 - b.x0), d = Math.abs(b.z1 - b.z0);
      const geo = new THREE.BoxGeometry(Math.max(0.3, w), b.h, Math.max(0.3, d)).translate(0, b.h / 2, 0);
      const m = new THREE.Mesh(geo, [wallM, wallM, topM(q), wallM, wallM, wallM]);
      m.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
    if (p.circle && !p.box && p.id !== 'rose') {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(p.circle.r, p.circle.r, h, 28).translate(0, h / 2, 0), [wallM, topM(q), wallM]);
      cyl.position.set(p.circle.x, 0, p.circle.z);
      cyl.castShadow = true;
      grp.add(cyl);
    }
    if (p.points) {
      p.points.forEach((pt, i) => {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 24).translate(0, 0.25, 0), M([0xcf4a3d, 0xf2c230, 0x2fa7a0][i % 3], 0.5));
        tr.position.set(pt.x, 0, pt.z); tr.castShadow = true;
        grp.add(tr);
      });
    }
    if (p.decks) {
      for (const dk of p.decks) {
        const [x0, z0, x1, z1] = Array.isArray(dk) ? dk : dk.b;
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.8, z1 - z0).translate(0, -0.1, 0), matStone);
        m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true;
        grp.add(m);
      }
    }
    // дверь на фасаде — видно, куда смотрит вход
    if (p.box && h >= 2 && p.facing && !p.open) {
      const cx = (p.box.x0 + p.box.x1) / 2, cz = (p.box.z0 + p.box.z1) / 2;
      const yaw = yawOf(p);
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      const half = Math.abs(dx) > 0.5 ? Math.abs(p.box.x1 - p.box.x0) / 2 : Math.abs(p.box.z1 - p.box.z0) / 2;
      const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.4, half * 1.2), Math.min(2.6, h * 0.8), 0.2).translate(0, Math.min(2.6, h * 0.8) / 2, 0), doorM);
      door.position.set(cx + dx * (half + 0.06), 0, cz + dz * (half + 0.06));
      door.rotation.y = yaw;
      grp.add(door);
    }
    if (!grp.children.length) return null;
    const bb = new THREE.Box3().setFromObject(grp);
    labelPos.set(p.id, V3((bb.min.x + bb.max.x) / 2, bb.max.y + 0.6, (bb.min.z + bb.max.z) / 2));
    return grp;
  }
  const pavById = new Map((L.pavilions || []).map((p) => [p.id, p]));
  const labelsById = new Map();
  for (const p of L.pavilions || []) {
    if (SPECIAL_SKIP.has(p.id)) continue;
    const g = stubFor(p);
    if (!g) continue;
    g.userData.pick = p.id;
    stubs.set(p.id, g);
    pickables.push(g);
    scene.add(g);
    const lp = labelPos.get(p.id);
    const far = p.far || Math.hypot(lp.x - C.x, lp.z - C.z) > 70;
    labelsById.set(p.id, st.label(labelFor(p.id), lp, { maxDist: far ? 140 : 95, cls: 'stub' }));
  }
  for (const dk of chosenDecks) {
    const [x0, z0, x1, z1] = Array.isArray(dk) ? dk : dk.b;
    const wood = !Array.isArray(dk) && dk.kind === 'wood';
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, wood ? 0.4 : 0.8, z1 - z0).translate(0, wood ? -0.05 : -0.1, 0), wood ? matWood : matStone);
    m.position.set((x0 + x1) / 2, Array.isArray(dk) ? 0 : (dk.y ?? 0), (z0 + z1) / 2); m.receiveShadow = true;
    scene.add(m);
  }
  // красный огонь на голове мола выбранного варианта
  for (const pv of Object.values(L.port || {})) {
    const lt = (pv?.chosen || pv?.selected) && pv.light;
    if (!lt || typeof lt.x !== 'number') continue;
    const h = lt.h || 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 8).translate(0, h / 2, 0), M(0xf5f1e8, 0.6));
    const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8).translate(0, h + 0.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(lt.color || '#e53935'), toneMapped: false }));
    const g = new THREE.Group(); g.add(pole, lampR); g.position.set(lt.x, -0.1, lt.z); pole.castShadow = true;
    scene.add(g);
  }
  // подписи кварталов — видны издалека
  const qCenter = (q) => {
    if (q.circle) return V3(q.circle.x, 0, q.circle.z);
    const xs = q.poly.map((p) => p[0]), zs = q.poly.map((p) => p[1]);
    let cx = xs.reduce((a, b) => a + b, 0) / xs.length, cz = zs.reduce((a, b) => a + b, 0) / zs.length;
    if (!inPoly(cx, cz, q.poly)) { cx = (Math.min(...xs) + Math.max(...xs)) / 2; cz = (Math.min(...zs) + Math.max(...zs)) / 2; }
    return V3(cx, 0, cz);
  };
  const quarterCenters = {};
  for (const q of L.quarters || []) {
    const c = qCenter(q);
    if (q.id === 'port') c.set(-6, 0, 20);
    if (q.id === 'farm') c.set(56, 0, -24);
    quarterCenters[q.id] = c;
    const Lb = st.label(quarterOf(q.id), c.clone().setY(8), { minDist: 70, cls: 'qlbl' });
    Lb.el.style.setProperty('--qc', q.color);
  }

  // ---------------------------------------------------------------- камера и виды
  const VIEWS = {
    overview: [V3(46, 68, 62), V3(14, 0, -14)],
    spawn: [V3(spawn.x, 2.1, spawn.z + 2.2), V3(spawn.x, 6, spawn.z - 40)],
    top: [V3(17, 190, 4), V3(17, 0, -8)],
  };
  for (const [id, c] of Object.entries(quarterCenters)) {
    const span = id === 'hub' ? 26 : id === 'port' ? 44 : 36;
    VIEWS[id] = [V3(c.x + span * 0.35, span * 0.95, c.z + span * 1.05), V3(c.x, 2, c.z)];
  }
  // узкое окно (телефон) — отодвигаем камеру, чтобы в кадр влезло то же, что на десктопе
  const asp = (host.clientWidth || 1) / (host.clientHeight || 1);
  if (asp < 1.4) for (const [id, [p, t]] of Object.entries(VIEWS)) if (id !== 'spawn') p.sub(t).multiplyScalar(Math.min(1.9, Math.pow(1.6 / asp, 0.75))).add(t);
  camera.position.copy(VIEWS.overview[0]);
  controls.target.copy(VIEWS.overview[1]);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 4;
  controls.maxDistance = 360;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.5;
  controls.update();
  const clampTarget = () => {
    const t = controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -80, 90); t.z = THREE.MathUtils.clamp(t.z, -90, 70); t.y = THREE.MathUtils.clamp(t.y, 0, 20);
  };
  controls.addEventListener('change', clampTarget);
  function go(id) {
    const v = VIEWS[id];
    if (!v) return;
    controls.autoRotate = false;
    st.tween(v[0], v[1], 1.8);
  }

  // ---------------------------------------------------------------- выбор мышью
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null, mark = null;
  st.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  st.canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rc = st.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, true).find((h) => h.object.visible);
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.pick) o = o.parent;
    if (o) select(o.userData.pick, false);
  });
  function select(id, fly = true) {
    const obj = placed.get(id) || stubs.get(id);
    if (mark) { scene.remove(mark); mark = null; }
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj).expandByScalar(0.6);
      mark = new THREE.Box3Helper(box, 0xffb347);
      mark.material.transparent = true; mark.material.depthTest = false; mark.renderOrder = 9;
      scene.add(mark);
      if (fly) {
        const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        const R = Math.max(10, s.length() * 0.9);
        const p = pavById.get(id);
        const yaw = p ? yawOf(p) : 0;
        const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        st.tween(V3(c.x + dx * R + dz * R * 0.4, c.y + R * 0.55, c.z + dz * R - dx * R * 0.4), V3(c.x, Math.max(1.5, c.y * 0.6), c.z), 1.6);
      }
    }
    onPick?.(id);
    st.dirty = true;
  }
  st.tickers.push((dt, t) => { if (mark) mark.material.opacity = 0.55 + 0.45 * Math.sin(t * 4); });

  // ---------------------------------------------------------------- тема
  st.offTheme = onTheme(() => {
    const d = isDark();
    skyMat.uniforms.a.value.set(d ? 0xf2a37a : 0xffd9ad);
    skyMat.uniforms.b.value.set(d ? 0x5a6f9c : 0x9cc4ee);
    skyMat.uniforms.c.value.set(d ? 0x1f2b52 : 0x4f86d0);
    scene.fog.color.set(d ? 0x6a6f8e : 0xcfe0ef);
    hemi.intensity = d ? 0.85 : 1.25;
    sun.color.set(d ? 0xffb07a : 0xffdcae);
    sun.intensity = d ? 2.2 : 3.1;
    r.toneMappingExposure = d ? 0.92 : 1.0;
    st.dirty = true;
  });

  // ---------------------------------------------------------------- готовые павильоны и жители
  const placed = new Map(); // layoutId -> Group
  const residents = new Map(); // layoutId -> Vector3 (мир)
  const total = { pav: models.size, done: 0 };
  async function placePavilion(id, m) {
    const p = pavById.get(id);
    const pav = await buildPavilion(m.file, { assets, signs: signFor(id) });
    const wrap = new THREE.Group();
    wrap.add(pav);
    const ox = m.origin ? m.origin[0] : p?.center?.x, oz = m.origin ? m.origin[1] : p?.center?.z;
    if (ox == null) return;
    wrap.position.set(ox, 0, oz);
    wrap.rotation.y = typeof m.yaw === 'number' ? m.yaw : (p ? yawOf(p) : 0);
    wrap.userData.pick = id;
    wrap.updateMatrixWorld(true);
    scene.add(wrap);
    // модель «скала со входом» (pav_dungeon_cliff) сама и есть скала — простую глыбу-заглушку убираем
    if (cliffMesh && /cliff/.test(m.key || m.file || '')) { cliffMesh.visible = false; r.shadowMap.needsUpdate = true; }
    placed.set(id, wrap);
    pickables.push(wrap);
    const s = stubs.get(id);
    if (s) { s.visible = false; const i = pickables.indexOf(s); if (i >= 0) pickables.splice(i, 1); }
    // для курзала-заглушки башенка и галерея — та же коробка; убираем и её подпись «заглушка»
    const Lb = labelsById.get(id);
    if (Lb) { Lb.el.classList.remove('stub'); Lb.obj = V3(ox, new THREE.Box3().setFromObject(wrap).max.y + 0.8, oz); }
    if (pav.userData.resident) residents.set(id, pav.userData.resident.clone().applyMatrix4(wrap.matrixWorld));
    total.done++;
    r.shadowMap.needsUpdate = true;
    st.dirty = true;
  }
  const npcPlaced = [];
  async function placeNpc(n) {
    const g = await load(n.file);
    const root = g.scene.clone(true);
    root.traverse((o) => { applyFam(o, { npc: true }); o.castShadow = false; });
    root.add(blobShadow(0.7));
    const p = pavById.get(n.pav);
    const at = residents.get(n.pav) || (n.pos ? V3(n.pos[0], 0, n.pos[1]) : p?.npc ? V3(p.npc.x, 0, p.npc.z) : null);
    if (!at) return;
    root.position.copy(at);
    const dx = C.x - at.x, dz = C.z - at.z;
    root.rotation.y = Math.atan2(-dx, -dz);
    scene.add(root);
    st.tickers.push(npcIdle(root, g.animations));
    st.label(n.name, root, { off: 2.3, maxDist: 34, cls: 'npc' });
    npcPlaced.push(n.id);
  }
  st.animated = true;
  r.shadowMap.needsUpdate = true;
  // число отрисовок здесь не показываем: это сцена-превью без склейки, бюджет игры — в разделе «Как выпускаем»
  const hud = () => st.setHud([
    `${fmt(st.renderer.info.render.triangles)} треугольников в кадре`,
    `павильонов готово: ${total.done}`,
    npcPlaced.length ? `жителей: ${npcPlaced.length}` : null,
  ]);
  let hudT = 0;
  st.tickers.push((dt) => { hudT += dt; if (hudT > 1) { hudT = 0; hud(); } });

  // грузим по одной, начиная с ближних к центру — сцена живёт сразу, модели подтягиваются
  (async () => {
    const list = [...models.entries()].sort((a, b) => {
      const pa = pavById.get(a[0])?.center, pb = pavById.get(b[0])?.center;
      return (pa ? Math.hypot(pa.x - C.x, pa.z - C.z) : 99) - (pb ? Math.hypot(pb.x - C.x, pb.z - C.z) : 99);
    });
    let i = 0;
    for (const [id, m] of list) {
      try { await placePavilion(id, m); } catch (e) { console.warn('павильон', id, e); }
      progress?.(++i / (list.length + npcs.length));
    }
    for (const n of npcs) {
      try { await placeNpc(n); } catch (e) { console.warn('житель', n.id, e); }
      progress?.(++i / (list.length + npcs.length));
    }
    progress?.(1);
    onReady?.({ pavilions: total.done, npcs: npcPlaced.length });
  })();

  return {
    go, select,
    setLabels(on) { st.labelsOn = on; st.dirty = true; },
    setOrbit(on) { controls.autoRotate = on && !REDUCED; },
    stage: st,
    dispose() { st.dispose(); },
  };
}
