// Запекание нового вида набережной (look v2) — с нулевой ценой в кадре:
// • плитка площади: мягкие тени солнца (64 выборки карты теней на тексель, один раз) и затенение у подножий (прежняя
//   карта AO настила + пятна под фонарями, кнехтами, горшками, деревьями) — в одну текстуру. В кадре настил берёт
//   тень из неё, без выборок карты теней (было 5 на пиксель): край мягкий и без шума, а кадр — чуть дешевле.
//   Пересчёт — только когда мир пересчитал тени статики (статуя догрузилась, сменилось качество, вернулись на
//   набережную): тогда же, в том же кадре, до того как рисуется настил.
// • отражение неба в мокрой плитке — из неба нового вида (PMREM один раз).
import * as THREE from 'three';
import { LOOK_EVENING, lookSky } from '../render/looksky.ts';
import { makeSky } from '../render/sky.ts';

/** Пятно затенения у подножия: x, z, радиус (м), сила (0…1) */
export type Contact = readonly [number, number, number, number];

const MAX_CONTACTS = 96;
/** Мягкость края запечённой тени, м (тень в реальном времени — ≈ 0,1 м) */
const SOFT = 0.22;

/** Строка тени прямого света в чанке three.js r186 — у настила её заменяет запечённая тень (канал G) */
const DIR_SHADOW =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const DIR_BAKED = 'directLight.color *= mix( 1.0, texture2D( aoMap, vAoMapUv ).g, directionalLightShadow.shadowIntensity );';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/** Тексель запечённой карты: R — затенение (AO), G — сколько солнца доходит (0 — тень) */
const frag = (samples: number) => /* glsl */ `
uniform sampler2DShadow uShadow;
uniform mat4 uShadowMatrix;
uniform vec2 uRadius;
uniform float uBias;
uniform float uNormalBias;
uniform vec4 uRect;
uniform float uY;
uniform sampler2D uAo;
uniform mat3 uAoMatrix;
uniform vec4 uContacts[ ${MAX_CONTACTS} ];
uniform int uContactCount;
varying vec2 vUv;
void main() {
	vec3 p = vec3( uRect.x + vUv.x * uRect.z, uY, uRect.y + vUv.y * uRect.w );
	vec4 sc = uShadowMatrix * vec4( p.x, p.y + uNormalBias, p.z, 1.0 );
	sc.xyz /= sc.w;
	sc.z += uBias;
	float sun = 1.0;
	if ( sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0 ) {
		float acc = 0.0;
		for ( int i = 0; i < ${samples}; i ++ ) {
			float r = sqrt( ( float( i ) + 0.5 ) / ${samples}.0 );
			float a = float( i ) * 2.399963;
			acc += texture( uShadow, vec3( sc.xy + vec2( cos( a ), sin( a ) ) * r * uRadius, sc.z ) );
		}
		sun = acc / ${samples}.0;
	}
	float ao = texture2D( uAo, ( uAoMatrix * vec3( vUv, 1.0 ) ).xy ).r;
	for ( int i = 0; i < ${MAX_CONTACTS}; i ++ ) {
		if ( i >= uContactCount ) break;
		vec4 c = uContacts[ i ];
		vec2 d = ( p.xz - c.xy ) / c.z;
		ao *= 1.0 - c.w * exp( -2.5 * dot( d, d ) );
	}
	gl_FragColor = vec4( ao, sun, 0.0, 1.0 );
}
`;

/**
 * Запечённые тени и затенение настила площади. Настил — меш с картой AO по второй развёртке (uv1 — план площади,
 * client/lobby/world.ts). Нет такого меша или в three.js другой чанк теней — ничего не делаем (тени как были).
 */
export class DeckBake {
  private readonly gl: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly mat: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.Camera();
  private pending = true;

  /** Найти настил и подготовить запекание; null — не нашли или three.js не тот. lite — телефон: карта мельче. */
  static create(gl: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight, contacts: readonly Contact[], lite: boolean): DeckBake | null {
    if (!THREE.ShaderChunk.lights_fragment_begin.includes(DIR_SHADOW)) return null;
    let deck: THREE.Mesh | null = null;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!deck && mesh.isMesh && m && !Array.isArray(m) && m.isMeshStandardMaterial && m.aoMap && mesh.geometry.getAttribute('uv1')) deck = mesh;
    });
    return deck ? new DeckBake(gl, sun, deck, contacts, lite) : null;
  }

  private constructor(gl: THREE.WebGLRenderer, sun: THREE.DirectionalLight, deck: THREE.Mesh, contacts: readonly Contact[], lite: boolean) {
    this.gl = gl;
    this.sun = sun;
    const m = deck.material as THREE.MeshStandardMaterial;
    const old = m.aoMap!;
    old.updateMatrix();
    // план настила: uv1 линейно по x и z (по крайним вершинам), верх — самая высокая точка
    deck.updateMatrixWorld();
    const pos = deck.geometry.getAttribute('position');
    const uv1 = deck.geometry.getAttribute('uv1');
    const v = new THREE.Vector3();
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, x0 = 0, x1 = 0, z0 = 0, z1 = 0, top = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(deck.matrixWorld);
      const u = uv1.getX(i);
      const w = uv1.getY(i);
      if (u < u0) { u0 = u; x0 = v.x; }
      if (u > u1) { u1 = u; x1 = v.x; }
      if (w < w0) { w0 = w; z0 = v.z; }
      if (w > w1) { w1 = w; z1 = v.z; }
      top = Math.max(top, v.y);
    }
    const sx = (x1 - x0) / (u1 - u0);
    const sz = (z1 - z0) / (w1 - w0);
    const ox = x0 - u0 * sx;
    const oz = z0 - w0 * sz;
    // 20 текселей на метр (телефон — 10): 60 × 48 м площади → 1200 × 960
    const px = lite ? 10 : 20;
    const W = Math.min(2048, Math.round(Math.abs(sx) * px));
    const H = Math.min(2048, Math.round(Math.abs(sz) * px));
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      format: THREE.RGFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.rt.texture.channel = 1;
    this.rt.texture.anisotropy = lite ? 4 : 8;
    const list = contacts.slice(0, MAX_CONTACTS).map(([x, z, r, k]) => new THREE.Vector4(x, z, r, k));
    while (list.length < MAX_CONTACTS) list.push(new THREE.Vector4(0, 0, 1, 0));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag(lite ? 32 : 64),
      uniforms: {
        uShadow: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uRadius: { value: new THREE.Vector2() },
        uBias: { value: 0 },
        uNormalBias: { value: 0 },
        uRect: { value: new THREE.Vector4(ox, oz, sx, sz) },
        uY: { value: top },
        uAo: { value: old },
        uAoMatrix: { value: old.matrix },
        uContacts: { value: list },
        uContactCount: { value: Math.min(contacts.length, MAX_CONTACTS) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    // до первого запекания — «всё на солнце, без затенения» (запечётся в первом же кадре, до настила)
    const prev = gl.getRenderTarget();
    const clear = gl.getClearColor(new THREE.Color());
    const alpha = gl.getClearAlpha();
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0xffffff, 1);
    gl.clear(true, false, false);
    gl.setClearColor(clear, alpha);
    gl.setRenderTarget(prev);
    // настил: AO и тень солнца — из запечённой карты
    m.aoMap = this.rt.texture;
    const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(DIR_SHADOW, DIR_BAKED);
    const before = m.onBeforeCompile;
    const key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      before.call(m, s, r);
      s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
    };
    m.customProgramCacheKey = () => `${key}|bake`;
    m.needsUpdate = true;
    // запекаем прямо перед тем, как рисуется настил: карта теней этого кадра уже готова
    deck.onBeforeRender = () => {
      if (this.pending) this.bake();
    };
  }

  /** Мир пересчитывает тени статики в этом кадре (вызывать до отрисовки сцены) — запечь заново. */
  invalidate(): void {
    this.pending = true;
  }

  private bake(): void {
    const sh = this.sun.shadow;
    const depth = sh.map?.depthTexture;
    // карты ещё нет (или она не для аппаратного сравнения) — подождём следующего пересчёта
    if (!depth || depth.compareFunction !== THREE.LessEqualCompare) return;
    this.pending = false;
    const u = this.mat.uniforms;
    const cam = sh.camera;
    u.uShadow.value = depth;
    u.uShadowMatrix.value.copy(sh.matrix);
    (u.uRadius.value as THREE.Vector2).set(SOFT / (cam.right - cam.left), SOFT / (cam.top - cam.bottom));
    u.uBias.value = sh.bias;
    u.uNormalBias.value = sh.normalBias;
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.rt);
    gl.render(this.scene, this.cam);
    gl.setRenderTarget(prev);
  }
}

/** Отражение неба нового вида для мокрой плитки (как у мира, только небо — своё). Один раз. */
export function lookSkyEnv(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  const sky = makeSky(LOOK_EVENING);
  lookSky(sky.material);
  const env = pmrem.fromScene(new THREE.Scene().add(sky), 0, 0.1, 100, { size: 128 }).texture;
  sky.geometry.dispose();
  sky.material.dispose();
  pmrem.dispose();
  return env;
}
