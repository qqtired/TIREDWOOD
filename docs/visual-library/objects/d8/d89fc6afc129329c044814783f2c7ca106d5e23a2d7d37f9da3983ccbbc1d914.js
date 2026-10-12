import { base, clamp, loadKit, part, localLabel } from './common.js';

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [4.8, 4.3, 8.6], look: [0, 1.3, -.5], radius: 6.5 });
  const kit = await loadKit(ctx, 'social-beach');
  const specs = [{ name: 'sand_foundation', title: 'Широкое основание', h: .45, width: 1.15, weight: 2.4 }, { name: 'sand_arch', title: 'Арка', h: .65, width: .85, weight: 1.7 }, { name: 'sand_turret', title: 'Башенка', h: .9, width: .55, weight: 1 }];
  const previews = specs.map(g => { const m = part(kit, g.name); m.visible = false; s.scene.add(m); return m; });
  const sand = s.d.cyl(4, 4, .04, 0xe2c9a1); sand.position.y = .025;
  const you = s.jelly({ name: 'Ты · строишь', x: 1.8, z: 1.1, outfit: { c: 9, h: 'cap' } }); you.face(0, 0);
  const partner = s.jelly({ name: 'Миша · демо', x: -1.8, z: .6, outfit: { c: 0, h: 'straw' } }); partner.face(0, 0);
  const brace = part(kit, 'sand_brace'); brace.position.set(0, .1, -.9); s.scene.add(brace);
  const waveGeo = new ctx.THREE.PlaneGeometry(9, 1.3, 32, 5); const wave = new ctx.THREE.Mesh(waveGeo, new ctx.THREE.MeshStandardMaterial({ color: 0x87d1ca, transparent: true, opacity: .68, roughness: .35, side: ctx.THREE.DoubleSide })); wave.rotation.x = -Math.PI / 2; wave.position.set(0, .11, -4.7); s.scene.add(wave);
  const foam = new ctx.THREE.Mesh(new ctx.THREE.TorusGeometry(3.8, .06, 6, 64, Math.PI), s.d.mat(0xf7f5e8)); foam.rotation.x = -Math.PI / 2; foam.position.set(0, .12, -4.5); s.scene.add(foam);
  const heightStat = ctx.ui.stat('Высота', '0,0 м'), countStat = ctx.ui.stat('Формы', '0 / 6'); const balanceMeter = ctx.ui.meter('Устойчивость'); balanceMeter.zone(.58, 1); const energyMeter = ctx.ui.meter('Силы для страховки'); energyMeter.zone(.3, 1);
  localLabel(ctx, 'Миша страхует противоположную сторону');
  let phase = 'ready', elapsed = 0, chosen = 0, offset = 0, rotation = 0, height = 0, massCenter = 0, totalMass = 0, stability = 1, energy = 1, placed = 0, collapse = 0, blocks = [], timeSincePlace = 0, previewX = 0;
  const shapeSelect = ctx.ui.select('Песчаная форма', specs.map((g, i) => ({ value: String(i), label: g.title })), '0', v => { chosen = Number(v); });
  function start() { for (const b of blocks) b.mesh.removeFromParent(); blocks = []; phase = 'build'; elapsed = offset = rotation = height = massCenter = totalMass = placed = collapse = timeSincePlace = 0; stability = energy = 1; s.keys.clear(); s.result.set('Поставь 6 форм, затем удержи волну'); s.note('A/D — смещение, Q/E — повернуть. Пробел — поставить. На волне держи W для страховки.'); }
  function place() {
    if (phase !== 'build' || placed >= 6 || timeSincePlace < .45) return;
    const spec = specs[chosen], mesh = part(kit, spec.name), previous = blocks.at(-1); mesh.position.set(previewX, height + .04, 0); mesh.rotation.y = rotation; s.scene.add(mesh);
    const newMass = totalMass + spec.weight; massCenter = (massCenter * totalMass + previewX * spec.weight) / newMass; totalMass = newMass;
    const contact = previous ? Math.abs(previous.x - previewX) / ((previous.spec.width + spec.width) * .45) : Math.abs(previewX) / .72;
    stability = clamp(stability - Math.max(0, contact - .23) * .25 - Math.abs(massCenter) * .045 + (chosen === 0 ? .035 : 0), 0, 1);
    blocks.push({ mesh, x: previewX, base: height + .04, spec }); height += spec.h; placed++; timeSincePlace = 0; offset = previewX * .3;
    ctx.sound.pop(); you.avatar.jolt?.(.28); s.result.set(contact > .9 ? 'Верхушка нависает — следующий блок как противовес' : `Форма ${placed} стоит`);
    if (placed === 6) { phase = 'tide'; elapsed = 0; s.note('Волна идёт! Держи W только на ударе: силы заканчиваются.'); }
    if (stability < .17) fall('Центр тяжести ушёл за опору');
  }
  function fall(text) { phase = 'failure'; collapse = 0; s.result.set(text); s.note('Башня наклонилась раньше волны. Широкий низ и центр масс помогают. Попробуй снова.'); ctx.sound.splat(); you.action(ctx.kit.ACT.laugh); }
  const startBtn = s.button('Начать стройку', start, true); const dropBtn = s.button('Поставить форму · Пробел', place, true); s.button('Построить ещё', start);
  s.hold('Левее · A', 'KeyA'); s.hold('Правее · D', 'KeyD'); s.hold('Страховать · W', 'KeyW'); s.button('Повернуть · E', () => rotation += Math.PI / 2);
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput,
    onKey(code, down) { if (down && !s.keys.has(code)) { if (code === 'Space') place(); if (code === 'KeyQ') rotation -= Math.PI / 2; if (code === 'KeyE') rotation += Math.PI / 2; if (/^Digit[123]$/.test(code)) { chosen = Number(code.at(-1)) - 1; if (shapeSelect) { shapeSelect.value = String(chosen); shapeSelect.dispatchEvent?.(new Event('change')); } } } return s.key(code, down); },
    update(dt, t) {
      dt = Math.min(dt, .04); if (phase === 'build' || phase === 'tide') elapsed += dt; timeSincePlace += dt;
      if (phase === 'build') { offset = clamp(offset + s.axis() * dt * .85, -.9, .9); previewX = offset + Math.sin(t * 1.4) * .22; if (elapsed > 45) { if (placed >= 3) { phase = 'tide'; elapsed = 0; s.note('Время стройки вышло. Теперь удержи волну.'); } else fall('Не хватило форм для устойчивой башни'); } }
      previews.forEach((m, i) => { m.visible = phase === 'build' && i === chosen; if (m.visible) { m.position.set(previewX, height + .55, 0); m.rotation.y = rotation; } });
      if (phase === 'tide') {
        const defending = s.keys.has('KeyW') && energy > .03; energy = clamp(energy + (defending ? -dt * .28 : dt * .13), 0, 1);
        const strike = elapsed > 5 && elapsed < 8.2; brace.position.z = defending ? -.62 : -1.4; brace.rotation.x = defending ? -.12 : -.4;
        wave.position.z = -4.7 + clamp(elapsed / 8, 0, 1) * 5.3; foam.position.z = wave.position.z + .6;
        if (strike) { stability -= dt * (defending ? .008 : .24) * (1 + height * .09); if (stability < .16) fall('Прилив смыл верхушку'); }
        if (phase === 'tide' && elapsed > 10) { phase = 'success'; s.result.set(`Прилив выдержали · ${height.toFixed(1)} м`); s.note('Башня сохранилась. Попробуй выше или поменяй формы.'); s.celebrate(you, true); }
      }
      if (phase === 'failure') { collapse += dt; blocks.forEach((b, i) => { b.mesh.rotation.z = clamp(collapse * (i + 1) * .13, 0, 1.3); b.mesh.position.x = b.x + Math.sin(b.mesh.rotation.z) * b.base; b.mesh.position.y = Math.max(.08, b.base - collapse * collapse * .35 * (i + 1)); }); }
      else blocks.forEach((b, i) => b.mesh.rotation.z = (1 - stability) * .09 * Math.sin(t * 2) * (i + 1));
      const p = waveGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.4 + t * 3) * .05); p.needsUpdate = true;
      heightStat.set(`${height.toFixed(1)} м`); countStat.set(`${placed} / 6`); balanceMeter.set(stability); energyMeter.set(energy); startBtn.disabled = ['build', 'tide'].includes(phase); dropBtn.disabled = phase !== 'build'; s.update(dt, t);
    }, dispose: () => s.dispose(), getState: () => ({ id: 'tide-tower', phase, elapsed, chosen, placed, height, massCenter, stability, energy, previewX, blocks: blocks.map(b => ({ x: b.x, base: b.base, name: b.spec.name })) })
  };
}
