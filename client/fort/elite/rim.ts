// Контур ауры элиток «Крепости» — кусок шейдера для общего материала мобов (client/fort/mobs/kit.ts) и для желейки
// без модели. Новой программы нет: тот же материал, ступень особи едет в уже существующем атрибуте вспышки
// (mobFlash = вспышка 0…1 + 2 × ступень, см. MobRenderer.add) или в своём атрибуте желейки. Обычная особь (ступень 0)
// и материал без настроенной ауры (сила 0) рисуются ровно как раньше. Вид ауры (цвета, сила) — общие ручки AURA_RIM:
// их ставит client/fort/elite/aura.ts (setAuraLook) одним вызовом на всех.
import * as THREE from 'three';

/** Общие ручки контура — одни объекты на все материалы мобов */
export const AURA_RIM = {
  /** Цвет ауры элиты (ступень 1) и чемпиона (ступень 2), линейный */
  uAuraCol1: { value: new THREE.Color(0x7a5cff) },
  uAuraCol2: { value: new THREE.Color(0xffa12e) },
  /** x — резкость края (степень френеля), y — яркость контура, z — «языки» по краю 0…1, w — притемнение тела 0…1 */
  uAuraRim: { value: new THREE.Vector4(2.4, 0, 0, 0) },
  /** x — яркость светящихся частей (глаза), y — доля цвета ауры в них 0…1, z — во сколько раз чемпион ярче элиты */
  uAuraEye: { value: new THREE.Vector3(1, 0, 1) },
  uAuraTime: { value: 0 },
};

export const AURA_PARS = /* glsl */ `
uniform vec3 uAuraCol1;
uniform vec3 uAuraCol2;
uniform vec4 uAuraRim;
uniform vec3 uAuraEye;
uniform float uAuraTime;
varying float vMobAura;`;

/**
 * Вставка после emissivemap_fragment: к этому месту уже есть нормаль (normal) и цвет (diffuseColor), а свет ещё не
 * посчитан. Контур — френель по краю силуэта с бегущими вверх «языками»; светящиеся части (MOB_GLOW) — в цвет ауры.
 */
export const AURA_FRAGMENT = /* glsl */ `#include <emissivemap_fragment>
if ( vMobAura > 0.5 ) {
  float auraChamp = step( 1.5, vMobAura );
  vec3 auraCol = mix( uAuraCol1, uAuraCol2, auraChamp );
  float auraK = mix( 1.0, uAuraEye.z, auraChamp );
#ifdef MOB_GLOW
  totalEmissiveRadiance = mix( totalEmissiveRadiance, auraCol * uAuraEye.x * auraK, uAuraEye.y );
#else
  float auraFacing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  float auraEdge = pow( 1.0 - auraFacing, uAuraRim.x );
  float auraLick = 0.5 + 0.5 * sin( vViewPosition.y * 7.0 + uAuraTime * 6.5 + sin( vViewPosition.x * 5.0 + uAuraTime * 1.7 ) * 1.6 );
  auraEdge *= mix( 1.0, 0.35 + 1.3 * auraLick, uAuraRim.z );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ( 0.3 + 0.45 * auraCol ), uAuraRim.w );
  totalEmissiveRadiance += auraCol * auraEdge * uAuraRim.y * auraK;
#endif
}`;

/** Добавить ручки ауры в uniforms шейдера (onBeforeCompile) */
export function bindAuraUniforms(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.uAuraCol1 = AURA_RIM.uAuraCol1;
  uniforms.uAuraCol2 = AURA_RIM.uAuraCol2;
  uniforms.uAuraRim = AURA_RIM.uAuraRim;
  uniforms.uAuraEye = AURA_RIM.uAuraEye;
  uniforms.uAuraTime = AURA_RIM.uAuraTime;
}

/**
 * Контур на материал желейки без модели (InstancedMesh тела): ступень — атрибут auraRank (float, 0 — обычная) у
 * геометрии тела. Программа та же по числу: материал просто собирается с этой вставкой.
 */
export function patchJellyAura(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    bindAuraUniforms(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float auraRank;\nvarying float vMobAura;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMobAura = auraRank;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${AURA_PARS}`)
      .replace('#include <emissivemap_fragment>', AURA_FRAGMENT);
  };
  mat.customProgramCacheKey = () => 'jelly-aura';
  return mat;
}
