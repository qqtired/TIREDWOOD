// QA only, real lobby renderer/model. Driver: begin -> frame+PNG at45/60/70 -> end.
// Pass baseline poseBundle to after begin. Not executed in the released window.
export function beginRatFade({poseBundle = null, climate = 'clear', time = 120} = {}) {
  if (window.__ratFade) throw new Error('Rat fade capture already active');
  const l = __opus.app.lobby, w = l.world, p = w.perf, r = l.rat3d;
  const pose = node => ({p: node.position.toArray(), q: node.quaternion.toArray(), s: node.scale.toArray(), visible: node.visible});
  const poses = () => ({group: pose(r.group), rats: r.rats.map(x => ({g: pose(x.g), body: pose(x.body), head: pose(x.head), tail: pose(x.tail), paws: x.paws.map(pose), tag: pose(x.tag)}))});
  const put = (node, value) => {node.position.fromArray(value.p); node.quaternion.fromArray(value.q); node.scale.fromArray(value.s); node.visible = value.visible; node.updateMatrix();};
  const apply = bundle => {put(r.group, bundle.group); r.rats.forEach((x, i) => {const b = bundle.rats[i]; for (const key of ['g','body','head','tail','tag']) put(x[key], b[key]); x.paws.forEach((paw, j) => put(paw, b.paws[j]));}); r.group.updateMatrixWorld(true);};
  const weatherKeys = ['on','rain','overcast','dark','wind','thunder','wet','storm','lampsOn'];
  const weather = Object.fromEntries(weatherKeys.map(k => [k, w.weather[k]]));
  const layers = []; w.scene.traverse(node => layers.push([node, node.layers.mask]));
  const saved = {frame: l.frame, time: w.time, camera: pose(w.camera), weather, powered: w.powered.map(node => [node, node.visible]), poses: poses(), layers,
    units: p.units.slice(), fades: p.units.map(u => [u.fade, {...u.fade}]), hidden: [...p.hidden].map(([o, h]) => [o, {...h}]), culled: [...p.culled]};
  const rain = climate === 'rain', dark = climate === 'dark-blackout';
  Object.assign(w.weather, {on: rain, rain: rain ? .75 : 0, overcast: rain ? .85 : dark ? .25 : 0, dark: dark ? .82 : rain ? .15 : 0, wind: rain ? .7 : 0, thunder: 0, wet: rain ? 1 : 0, storm: 0, lampsOn: !dark});
  w.setLamps(!dark); for (const node of w.powered) node.visible = !dark; w.applyWeather();
  l.frame = () => w.render(); w.time = time; w.update(0, 1200);
  if (poseBundle) apply(poseBundle);
  const bundle = poses(), center = r.rats[0].g.position.clone().set(0, 0, 0);
  for (const rat of r.rats) center.add(rat.g.getWorldPosition(rat.g.position.clone()));
  center.divideScalar(r.rats.length); center.y += .1;
  const renderer = __opus.app.renderer, context = renderer.gl.getContext(), ext = context.getExtension('WEBGL_debug_renderer_info');
  window.__ratFade = {l, w, p, r, saved, apply, center, poseBundle: bundle, climate, time};
  return {poseBundle: bundle, center: center.toArray(), climate, time, quality: __opus.info().quality, ratio: __opus.info().ratio, gfx: __opus.info().gfx,
    backend: ext ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER), headMeshes: r.rats.map(x => x.head.children.length)};
}

export async function captureRatFadeFrame({distance, settleMs = 1800}) {
  const f = window.__ratFade; if (!f || ![45,60,70].includes(distance)) throw new Error('Begin capture and use45/60/70m');
  const {w, p, r, center} = f, dy = 2.3;
  w.camera.position.set(center.x - Math.sqrt(distance * distance - dy * dy), center.y + dy, center.z);
  w.camera.lookAt(center); w.camera.updateMatrixWorld(true); p.scanAt = p.cullAt = 0;
  await new Promise(resolve => setTimeout(resolve, settleMs));
  const renderer = __opus.app.renderer, gl = renderer.gl, direct = gl.renderBufferDirect, end = renderer.endFrame;
  const calls = Array(6).fill(0); let timeout;
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Rat fade frame timeout')), 4000);
      gl.renderBufferDirect = function(camera, scene, geometry, material, object, group) {
        const start = this.info.render.calls, result = direct.call(this, camera, scene, geometry, material, object, group);
        if (camera === w.camera) for (let i = 0; i < r.rats.length; i++) for (let node = object; node; node = node.parent) if (node === r.rats[i].g) {calls[i] += this.info.render.calls - start; break;}
        return result;
      };
      renderer.endFrame = function() {end.call(this); resolve();};
    });
  } finally {clearTimeout(timeout); gl.renderBufferDirect = direct; renderer.endFrame = end;}
  return {distance: w.camera.position.distanceTo(center), eye: w.camera.position.toArray(), target: center.toArray(), climate: f.climate, time: f.time, calls,
    headMeshes: r.rats.map(x => x.head.children.length), rats: r.rats.map((rat, i) => ({i, layers: rat.g.layers.mask, parts: rat.head.children.map(node => ({layers: node.layers.mask, fade: (p.fadeMaterials.get(node) ?? []).map(m => m.fade.value)}))})),
    allPoseMatrices: r.rats.map(rat => rat.g.matrixWorld.toArray()), stats: p.debug()};
  // Camera/frame remain frozen here so the driver can take its PNG next.
}

export function endRatFade() {
  const f = window.__ratFade; if (!f) return;
  const {w, p, saved, apply, l} = f;
  apply(saved.poses); w.camera.position.fromArray(saved.camera.p); w.camera.quaternion.fromArray(saved.camera.q); w.camera.scale.fromArray(saved.camera.s); w.camera.updateMatrixWorld(true);
  Object.assign(w.weather, saved.weather); w.setLamps(saved.weather.lampsOn); for (const [node, visible] of saved.powered) node.visible = visible; w.applyWeather();
  w.time = saved.time; w.update(0, 1200);
  p.units = saved.units; for (const [fade, values] of saved.fades) Object.assign(fade, values);
  p.hidden.clear(); for (const [node, values] of saved.hidden) p.hidden.set(node, values);
  p.culled.clear(); for (const [node, unit] of saved.culled) p.culled.set(node, unit);
  for (const [node, mask] of saved.layers) node.layers.mask = mask;
  p.fadeFrame(0); p.scanAt = p.cullAt = 0; l.frame = saved.frame; delete window.__ratFade;
}
