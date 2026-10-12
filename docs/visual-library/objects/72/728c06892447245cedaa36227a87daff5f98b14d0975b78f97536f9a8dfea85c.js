import * as THREE from 'three';
import { beaconEmitter, doubleLensLantern, chargeBundleGeo, crystalGeo, emberClusterGeo, flywheelGeo, rockClusterGeo, wingedFireflyGeo } from '../../../../../unavailable.html';

// Один renderer с бестиарием. Формы evolved импортированы из настоящего клиента; движение — поясняющая схема.
export function createWeaponStage() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#251c16');
  scene.add(new THREE.HemisphereLight('#ffebcd', '#50463b', 2.5));
  const light = new THREE.DirectionalLight('#ffd6a0', 3); light.position.set(-4, 8, 5); scene.add(light);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.MeshStandardMaterial({ color: '#765b43', roughness: .95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; scene.add(floor);
  const grid = new THREE.GridHelper(32, 32, '#b1936c', '#886b4d'); grid.position.y = -.01; scene.add(grid);
  const center = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .8, 8), new THREE.MeshStandardMaterial({ color: '#b79568' })); center.position.y = .4; scene.add(center);
  const camera = new THREE.PerspectiveCamera(34, 1.52, .1, 150); camera.position.set(12, 18, 18); camera.lookAt(0, 0, 2);
  let root = new THREE.Group(), parts = [], rings = [], id = 'lantern', evo = false, stats = {}, elapsed = 0;
  scene.add(root);
  const mat = (c = '#ffd180') => new THREE.MeshStandardMaterial({ color: c, roughness: .65 });
  const colored = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65 });
  function add(geo, material) { const m = new THREE.Mesh(geo, material); root.add(m); parts.push(m); return m; }
  function ring(radius, color = '#ffc477') { const r = new THREE.Mesh(new THREE.RingGeometry(radius * .96, radius, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .6 })); r.rotation.x = -Math.PI / 2; r.position.y = .04; root.add(r); rings.push(r); return r; }
  function clear() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); }); scene.remove(root); root = new THREE.Group(); scene.add(root); parts = []; rings = []; }
  function choose(next, evolved, s) {
    clear(); id = next; evo = !!evolved; stats = s; elapsed = 0;
    const n = Math.min(12, s.n ?? 1);
    if (id === 'lantern') {
      const lamp = evo ? doubleLensLantern() : new THREE.Mesh(new THREE.BoxGeometry(.25, .35, .25), mat('#bc904e')); lamp.position.set(0, .8, 0); root.add(lamp);
      const angle = s.angle * Math.PI / 180;
      for (let i = 0; i < (evo ? 2 : 1); i++) {
        const g = new THREE.CircleGeometry(s.range, 40, Math.PI / 2 - angle / 2, angle).rotateX(-Math.PI / 2).rotateY(i * Math.PI);
        add(g, new THREE.MeshBasicMaterial({ color: '#ffce7a', transparent: true, opacity: .6, side: THREE.DoubleSide })).position.y = .05;
      }
    } else if (id === 'embers') {
      for (let i = 0; i < n; i++) add(evo ? emberClusterGeo() : new THREE.IcosahedronGeometry(.17, 0), evo ? colored() : mat('#ffac56'));
      if (evo) ring(s.splash.radius);
    } else if (id === 'pickaxe') {
      for (let i = 0; i < n; i++) {
        if (evo) add(flywheelGeo(), colored());
        else { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(.09, .09, 1), mat('#7a5232')), new THREE.Mesh(new THREE.BoxGeometry(.95, .1, .12).translate(0, 0, .45), mat('#9aa0a8'))); root.add(g); parts.push(g); }
      }
    } else if (id === 'fireflies') {
      for (let i = 0; i < n; i++) add(evo ? wingedFireflyGeo() : new THREE.IcosahedronGeometry(.12, 0), evo ? colored() : mat('#e9ed88'));
      for (const r of s.rings ?? [s.radius]) ring(r, '#dce99b');
    } else if (id === 'charges') {
      for (let i = 0; i < n; i++) { const p = add(evo ? chargeBundleGeo() : new THREE.CylinderGeometry(.11, .11, .42, 8).rotateZ(Math.PI / 2), evo ? colored() : mat('#c23a2b')); p.position.set((i - (n - 1) / 2) * 3, .15, 3); const r = ring(s.radius, '#e8a567'); r.position.copy(p.position); r.position.y = .04; }
    } else if (id === 'stalactites') {
      for (let i = 0; i < n; i++) { const p = add(evo ? rockClusterGeo() : new THREE.ConeGeometry(.42, 1.5, 6).rotateX(Math.PI), evo ? colored() : mat('#8a7a6a')); p.position.set((i - (n - 1) / 2) * 3, 6, 4); const r = ring(s.radius); r.position.set(p.position.x, .04, p.position.z); }
      if (evo) { add(new THREE.IcosahedronGeometry(.9, 0), mat('#a78c65')).position.set(0, 8, 8); ring(s.boulder.radius).position.z = 8; }
    } else if (id === 'spark') {
      if (evo) root.add(new THREE.Mesh(crystalGeo(), colored()));
      const pts = [new THREE.Vector3(0, .8, 0)];
      for (let i = 0; i < Math.min(s.jumps, 7); i++) pts.push(new THREE.Vector3((i % 2 ? 1 : -1) * (2 + i * .5), .6, 2 + i * 1.3));
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#b5d3ed' })));
      if (evo) { const p = add(crystalGeo(), colored()); p.position.copy(pts.at(-1)); ring(s.pulse.radius, '#b5d3ed').position.set(p.position.x, .04, p.position.z); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(-p.x, p.y, p.z))), new THREE.LineBasicMaterial({ color: '#b5d3ed' })); root.add(l); const q = add(crystalGeo(), colored()); q.position.set(-p.position.x, p.position.y, p.position.z); ring(s.pulse.radius, '#b5d3ed').position.set(q.position.x, .04, q.position.z); }
    } else if (id === 'beam') {
      if (evo) root.add(beaconEmitter());
      for (let i = 0; i < (evo ? 2 : s.n); i++) { const p = add(new THREE.PlaneGeometry(s.width, s.length).rotateX(-Math.PI / 2).translate(0, .05, s.length / 2), new THREE.MeshBasicMaterial({ color: '#ffe6a6', side: THREE.DoubleSide, transparent: true, opacity: .75 })); p.rotation.y = i * Math.PI; }
    }
  }
  function update(dt) {
    elapsed += dt; const t = elapsed, period = stats.cd ?? 2, phase = (t % period) / period;
    if (id === 'lantern') for (const p of parts) p.visible = phase < .2;
    else if (id === 'embers') { for (let i = 0; i < parts.length; i++) { const a = (i - (parts.length - 1) / 2) * .18, d = phase * 9; parts[i].position.set(Math.sin(a) * d, .8, Math.cos(a) * d); parts[i].rotation.z = t * 3; } for (const r of rings) { r.position.z = 8; r.visible = phase > .75; } }
    else if (id === 'pickaxe') for (let i = 0; i < parts.length; i++) { const a = (i - (parts.length - 1) / 2) * .35, d = Math.sin(phase * Math.PI) * stats.range; parts[i].position.set(Math.sin(a) * d, .8, Math.cos(a) * d); parts[i].rotation.y = t * 18; }
    else if (id === 'fireflies') for (let i = 0; i < parts.length; i++) { const inner = Math.ceil(parts.length / 2), outer = evo && i >= inner, count = evo ? outer ? parts.length - inner : inner : parts.length, k = outer ? i - inner : i, r = evo ? stats.rings[outer ? 1 : 0] : stats.radius, a = (outer ? -1 : 1) * t / stats.spin * Math.PI * 2 + k / count * Math.PI * 2; parts[i].position.set(Math.cos(a) * r, 1.1, Math.sin(a) * r); }
    else if (id === 'stalactites') for (let i = 0; i < parts.length; i++) { const p = ((t + i * .1) % (i === parts.length - 1 && evo ? 8 : period)) / (i === parts.length - 1 && evo ? 8 : period); parts[i].position.y = .5 + 8 * (1 - p) ** 2; }
    else if (id === 'beam') { root.rotation.y = evo ? t / stats.period * Math.PI * 2 : 0; for (const p of parts) p.visible = evo || phase < .2; }
    else if (id === 'charges') for (let i = 0; i < rings.length; i++) rings[i].visible = ((t - i * .18 + 8) % 4) > 3.4;
    else if (id === 'spark') for (const r of rings) r.visible = phase > .3 && phase < .65;
  }
  return { scene, camera, choose, update };
}
