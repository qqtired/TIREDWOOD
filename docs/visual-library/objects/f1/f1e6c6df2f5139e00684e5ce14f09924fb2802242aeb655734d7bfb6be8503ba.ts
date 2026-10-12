// Новый вид (look v2, см. look.ts): своя кривая тона и «рисованный» патч материалов. Всё — внутри обычных шейдеров
// three.js, без лишних проходов: кривая тона — в выходе каждого материала (THREE.CustomToneMapping), патч — пара
// десятков инструкций на пиксель (мягкий переход свет–тень и неровность цвета).
import * as THREE from 'three';

// ------------------------------------------------------------ кривая тона

/**
 * Кривая тона нового вида — ACES из three.js (та же экспозиция, что у старого вида), а вокруг неё:
 * тени чуть в голубизну, света — в золото (по яркости до кривой), сочность, мягкие тени без провалов в чёрное.
 */
const TONE = {
  /** светлее старого вида во столько раз */
  exposure: 1.08,
  /** множитель цвета в тенях и в светах */
  shade: [0.92, 0.96, 1.1] as const,
  light: [1.07, 1.0, 0.88] as const,
  /** где тень переходит в свет (яркость после экспозиции) */
  t0: 0.05,
  t1: 1.0,
  /** сочность: 1 — как есть */
  sat: 1.42,
  /** подъём тёмных: c + lift · c · (1 − c)² */
  lift: 0.4,
};

const f3 = (v: readonly number[]) => `vec3( ${v.map((x) => x.toFixed(4)).join(', ')} )`;

const TONE_GLSL = /* glsl */ `
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
}
`;

let toneInstalled = false;

/** Подставить свою кривую в шейдеры three.js (до первой компиляции материалов нового вида). Один раз. */
export function installLookTone(): void {
  if (toneInstalled) return;
  toneInstalled = true;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (!chunk.includes(stub)) throw new Error('look: в three.js нет заглушки CustomToneMapping');
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, TONE_GLSL);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Та же кривая в JS: цвет out (линейный) → тонированный линейный, на месте. Нужна туману и фону: они не проходят
 * через кривую в шейдере, но должны совпасть с тонированным небом у горизонта.
 */
export function lookTone(out: THREE.Color, exposure: number): THREE.Color {
  const k = (exposure * TONE.exposure) / 0.6;
  let r = Math.max(0, out.r) * k;
  let g = Math.max(0, out.g) * k;
  let b = Math.max(0, out.b) * k;
  const t = smooth(TONE.t0, TONE.t1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
  r *= TONE.shade[0] + (TONE.light[0] - TONE.shade[0]) * t;
  g *= TONE.shade[1] + (TONE.light[1] - TONE.shade[1]) * t;
  b *= TONE.shade[2] + (TONE.light[2] - TONE.shade[2]) * t;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = Math.max(0, l + (r - l) * TONE.sat);
  g = Math.max(0, l + (g - l) * TONE.sat);
  b = Math.max(0, l + (b - l) * TONE.sat);
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = fit(ir);
  const fg = fit(ig);
  const fb = fit(ib);
  const sat = (v: number) => Math.min(1, Math.max(0, v));
  const lift = (v: number) => v + TONE.lift * v * (1 - v) * (1 - v);
  return out.setRGB(
    lift(sat(1.60475 * fr - 0.53108 * fg - 0.07367 * fb)),
    lift(sat(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb)),
    lift(sat(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb)),
  );
}

// ------------------------------------------------------------ «рисованные» материалы

/** Насколько у края света ещё светло (wrap) и оттенок перехода свет–тень */
const WRAP = 0.3;
const TERMINATOR = [0.82, 0.9, 1.12] as const;

/** Общие униформы патча: оттенок рассеянного света в тени (в дождь — белый) и 1 / яркость солнца */
export interface PaintUniforms {
  uLookShade: THREE.IUniform<THREE.Color>;
  uLookSunInv: THREE.IUniform<number>;
}

export interface PaintOptions {
  /** неровность цвета (шум в мировых координатах); на телефоне — без неё */
  grain: boolean;
  uniforms: PaintUniforms;
}

/**
 * Мягкий свет и неровность цвета: общий код для патча. lookLit — сколько прямого света дошло до точки (0 — в тени
 * или отвернулась от солнца): по нему рассеянный свет в тени голубее.
 */
const PAINT_PARS = /* glsl */ `
varying vec3 vLookW;
uniform vec3 uLookShade;
uniform float uLookSunInv;
float lookLit = 0.0;
vec3 lookDirect( float nl, vec3 light ) {
	float w = saturate( ( nl + ${WRAP.toFixed(3)} ) / ${(1 + WRAP).toFixed(3)} );
	lookLit = max( lookLit, saturate( luminance( light ) * uLookSunInv ) * smoothstep( -0.05, 0.35, nl ) );
	return light * ( w * mix( ${f3(TERMINATOR)}, vec3( 1.0 ), smoothstep( 0.0, 0.5, w ) ) );
}
float lookWobble( vec3 p ) {
	return sin( p.x * 0.9 + sin( p.z * 1.3 + p.y * 0.7 ) * 1.7 ) * sin( p.z * 0.8 + sin( p.x * 1.1 - p.y * 0.9 ) * 1.5 + p.y * 0.4 );
}
`;

const GRAIN = /* glsl */ `
	{
		// крупные пятна — до 260 м, мелкие — до 70 м (дальше их всё равно не видно, а считать дорого)
		float lookFar = length( vLookW - cameraPosition );
		if ( lookFar < 260.0 ) {
			vec3 lookK = vec3( 0.075, 0.055, 0.035 ) * lookWobble( vLookW * 0.45 ) * ( 1.0 - smoothstep( 120.0, 260.0, lookFar ) );
			if ( lookFar < 70.0 ) lookK += 0.04 * lookWobble( vLookW * 1.9 + 7.3 ) * ( 1.0 - smoothstep( 25.0, 70.0, lookFar ) );
			diffuseColor.rgb *= 1.0 + lookK;
		}
	}
`;

const VERT_POS = /* glsl */ `
	{
		vec4 lookWp = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			lookWp = instanceMatrix * lookWp;
		#endif
		vLookW = ( modelMatrix * lookWp ).xyz;
	}
`;

/** Диффуз прямого света в чанках three.js (стандартный/физический и ламберт) → мягкий свет нового вида */
const PHYSICAL_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const LAMBERT_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';

let physicalChunk: string | null = null;
let lambertChunk: string | null = null;

function chunks(): [string, string] {
  if (physicalChunk === null || lambertChunk === null) {
    const p = THREE.ShaderChunk.lights_physical_pars_fragment;
    const l = THREE.ShaderChunk.lights_lambert_pars_fragment;
    if (!p.includes(PHYSICAL_DIFFUSE) || !l.includes(LAMBERT_DIFFUSE)) throw new Error('look: чанки освещения three.js не те');
    physicalChunk = p.replace(PHYSICAL_DIFFUSE, 'reflectedLight.directDiffuse += lookDirect( dot( geometryNormal, directLight.direction ), directLight.color ) * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );');
    lambertChunk = l.replace(LAMBERT_DIFFUSE, 'reflectedLight.directDiffuse += lookDirect( dot( geometryNormal, directLight.direction ), directLight.color ) * BRDF_Lambert( material.diffuseColor );');
  }
  return [physicalChunk, lambertChunk];
}

const painted = new WeakSet<THREE.Material>();

/** Можно ли «нарисовать» материал: освещённые материалы three.js (не свои шейдеры, не неосвещённые). */
export function paintable(m: THREE.Material): boolean {
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial === true;
}

/**
 * «Рисованный» материал: мягкий переход свет–тень (свет «обёрнут» за край, переход — прохладный, на солнце — как
 * было) и лёгкая неровность цвета пятнами в мировых координатах (на больших поверхностях заметнее, вдали гаснет).
 * Прежний onBeforeCompile (мокрота, дымка, ветер) сохраняется.
 */
export function paintMaterial(m: THREE.Material, o: PaintOptions): void {
  if (painted.has(m) || !paintable(m)) return;
  painted.add(m);
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  const [physical, lambert] = chunks();
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLookW;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_POS}`);
    Object.assign(s.uniforms, o.uniforms);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINT_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', physical)
      .replace('#include <lights_lambert_pars_fragment>', lambert)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= mix( uLookShade, vec3( 1.0 ), lookLit );');
    if (o.grain) s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${GRAIN}`);
  };
  m.customProgramCacheKey = () => `${key}|look2${o.grain ? 'g' : ''}`;
  m.needsUpdate = true;
}
