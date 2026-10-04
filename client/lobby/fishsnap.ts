// Картинка вида, у которого нет нарисованной (client/assets/fish/<id>.webp), — снимок его 3D-модели (fishart.ts):
// один раз на вид, общим рендером игры в своё полотно (render target), с прозрачным фоном, в data:-адрес (CSP сайта
// пускает в <img> только свои файлы и data:). Так кальмар «царь морей» виден моделью в карточке улова, журнале,
// рюкзаке и у Семёна. Нового WebGL-контекста не создаём (потери контекстов браузер наказывает блокировкой WebGL).
import * as THREE from 'three';
import { FISH } from '../../shared/fishing.ts';
import { makeFish3D } from './fishart.ts';
import { setSquidTime, tickSquid } from './fishsquid.ts';
import './fishsnap.css';

/** Размер снимка, px (2 : 1, как картинки рыб); потом обрезается по краям рисунка */
const W = 720;
const H = 360;

let gl: THREE.WebGLRenderer | null = null;
const urls = new Map<number, string | null>();

/** Общий рендер игры: без него снимков нет (картинка-заглушка). */
export function setFishSnapRenderer(r: THREE.WebGLRenderer): void {
  gl = r;
}

/** data:-адрес снимка модели вида sp (null — снять нечем или не вышло). */
export function fishSnapUrl(sp: number): string | null {
  if (urls.has(sp)) return urls.get(sp)!;
  const url = shoot(sp);
  if (url) urls.set(sp, url);
  return url;
}

function shoot(sp: number): string | null {
  const r = gl;
  const f = FISH[sp];
  if (!r || !f || typeof document === 'undefined' || r.getContext().isContextLost()) return null;
  const scene = new THREE.Scene();
  // заливки меньше, чем в мире: полотно без тональной кривой ACES, и при ровном свете цвет выцветал (кальмар был розовым)
  scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x9a7a62, 1.25));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.5);
  key.position.set(-1.5, 2.4, 3);
  const rim = new THREE.DirectionalLight(0xffd6e6, 1.3);
  rim.position.set(1.5, 1, -2.5);
  scene.add(key, rim);
  const fish = makeFish3D(sp, f.g[1]);
  fish.scale.setScalar(1);
  // голова (у кальмара — руки) смотрит влево, как на нарисованных картинках; чуть приподнята
  fish.rotation.set(0, 0, f.shape === 'squid' ? 0.12 : 0.05);
  scene.add(fish);
  const box = new THREE.Box3().setFromObject(fish);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(20, W / H, 0.01, 50);
  const fit = Math.max(size.x / (W / H), size.y) / 2 / Math.tan(THREE.MathUtils.degToRad(10)) * 1.08;
  cam.position.set(ctr.x - fit * 0.1, ctr.y + fit * 0.18, ctr.z + fit);
  cam.lookAt(ctr);
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(W * H * 4);
  const prevTarget = r.getRenderTarget();
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  try {
    setSquidTime(1.3);
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } catch {
    return null;
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    tickSquid();
  }
  return toDataUrl(px);
}

/** sRGB-байты ↔ линейные: смешение в полотне шло в линейном, цвет умножен на альфу — делим обратно. */
const toLin = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
function toSrgb(l: number): number {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

function toDataUrl(px: Uint8Array): string | null {
  // границы рисунка — по непрозрачному
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 4;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // полотно WebGL — снизу вверх
    const sy = y1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * W + x0 + x) * 4;
      const d = (y * w + x) * 4;
      const a = px[s + 3];
      if (a === 0) continue;
      const k = 255 / a;
      img.data[d] = toSrgb(toLin[px[s]] * k);
      img.data[d + 1] = toSrgb(toLin[px[s + 1]] * k);
      img.data[d + 2] = toSrgb(toLin[px[s + 2]] * k);
      img.data[d + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
