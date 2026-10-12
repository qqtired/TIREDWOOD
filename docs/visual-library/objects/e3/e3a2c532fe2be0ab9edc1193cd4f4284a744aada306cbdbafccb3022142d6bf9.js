import { base, clamp, mix, loadKit, part, localLabel, contactPoint, worldGrip } from './common.js';

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [0, 4.3, 11.7], look: [0, 2.6, 0], radius: 6.8 });
  const kit = await loadKit(ctx, 'social-beach');
  const kite = part(kit, 'kite_body'), spool = part(kit, 'spool'); s.scene.add(kite, spool);
  const tails = [];
  for (let i = 1; i <= 4; i++) { const source = kit.getObjectByName(`kite_tail${i}`); if (source) { const tail = part(kit, `kite_tail${i}`); tail.position.set(0, -.58 - .18 * i, 0); kite.add(tail); tails.push(tail); } }
  const you = s.jelly({ name: 'Ты', x: -.8, z: 1.8, outfit: { c: 9, h: 'cap' } });
  const helper = s.jelly({ name: 'Аня · демо', x: .8, z: 1.8, outfit: { c: 12, h: 'straw' } }); you.face(0, -2); helper.face(0, -2);
  const points = [{ x: -2.2, y: 3.1 }, { x: 2, y: 4.4 }, { x: -.4, y: 3.25 }];
  const rings = points.map((p, i) => { const m = new ctx.THREE.Mesh(new ctx.THREE.TorusGeometry(.66, .055, 10, 48), s.d.mat(i === 0 ? 0xe3aa54 : 0x63b299)); m.position.set(p.x, p.y, -.75); s.scene.add(m); return m; });
  const carpet = s.d.box(1.65, .035, 1.05, 0xc77865); carpet.position.set(0, .03, -.75);
  const lineGeo = new ctx.THREE.BufferGeometry(); const lineArray = new Float32Array(18 * 3); lineGeo.setAttribute('position', new ctx.THREE.BufferAttribute(lineArray, 3));
  const line = new ctx.THREE.Line(lineGeo, new ctx.THREE.LineBasicMaterial({ color: 0xcbb78e })); s.scene.add(line);
  const tensionMeter = ctx.ui.meter('Леска · избегай красных краёв'); tensionMeter.zone(.22, .77);
  const passes = ctx.ui.stat('Кольца', '0 / 3'), windStat = ctx.ui.stat('Ветер', 'Лёгкий');
  let phase = 'ready', elapsed = 0, role = 'steer', x = 0, y = 2.4, vx = 0, vy = 0, tension = .45, stress = 0, passed = 0, landing = 0, gateDwell = 0;
  let heldContact = null;
  localLabel(ctx, 'Аня отвечает за вторую роль');
  ctx.ui.select('Твоя роль', [{ value: 'steer', label: 'Веди змея · A/D' }, { value: 'line', label: 'Держи леску · W/S' }], role, v => { role = v; start(); });
  function start() { phase = 'flight'; elapsed = vx = vy = stress = passed = landing = gateDwell = x = 0; y = 2.4; tension = .45; s.keys.clear(); rings.forEach(m => m.visible = true); s.result.set('Проведи через 3 кольца и посади'); s.note(role === 'steer' ? 'A/D — курс. Аня меняет длину лески. Держи змея внутри подсвеченного кольца.' : 'W — подтяни, S — выдай леску. Аня ведёт по горизонтали; подстрой высоту под кольцо.'); }
  function finish(win, text) { phase = win ? 'success' : 'failure'; s.result.set(text); s.note(win ? 'Чистый полёт! Теперь поменяйся с Аней ролями.' : 'Змей мягко упал. Начни ещё раз и следи за направлением ветра.'); s.celebrate(you, win); }
  const startBtn = s.button('Поднять змея', start, true); s.button('Ещё полёт', start);
  s.hold('Курс влево · A', 'KeyA'); s.hold('Курс вправо · D', 'KeyD'); s.hold('Подтянуть · W', 'KeyW'); s.hold('Выдать · S', 'KeyS');
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput, onKey: s.key,
    update(dt, t) {
      dt = Math.min(dt, .04);
      if (phase === 'flight' || phase === 'landing') {
        elapsed += dt; const gust = Math.sin(elapsed * .62) * .24 + (elapsed > 17 && elapsed < 21 ? .42 : 0); const goal = phase === 'flight' ? points[passed] : { x: 0, y: 1.3 };
        const horizontal = role === 'steer' ? s.axis() * 1.85 : clamp((goal.x - x) * 1.1 - vx * .6, -1.5, 1.5);
        vx += (horizontal + gust - vx * .9) * dt; x = clamp(x + vx * dt, -4.6, 4.6);
        if (role === 'line') tension = clamp(tension + (Number(s.keys.has('KeyW')) - Number(s.keys.has('KeyS'))) * dt * .26, .04, .96);
        else tension += (clamp((goal.y - 1.2) / 6, .04, .8) - tension) * dt * 1.4;
        vy += ((1.2 + tension * 6 - y) * 2.4 - vy * 2) * dt; y += vy * dt;
        const unsafe = (phase === 'flight' && tension < .17) || tension > .83 || Math.abs(x) > 4.4;
        stress = clamp(stress + (unsafe ? dt * .65 : -dt * .4), 0, 1);
        if (phase === 'flight') {
          gateDwell = Math.hypot(x - goal.x, y - goal.y) < .55 ? gateDwell + dt : 0;
          if (gateDwell > .7) { rings[passed].visible = false; passed++; gateDwell = 0; ctx.sound.ding(); s.result.set(`Есть кольцо ${passed}`); if (passed === 3) { phase = 'landing'; s.note('Посадка: верни змея над коврик и плавно выдай леску.'); } }
        } else {
          landing = Math.abs(x) < .65 && y < 1.65 && tension < .14 ? landing + dt : 0;
          if (landing > 1.4) finish(true, '3 кольца · мягкая посадка');
        }
        windStat.set(elapsed > 16 && elapsed < 17 ? 'Сейчас порыв вправо' : gust > .3 ? 'Порыв вправо' : gust < -.12 ? 'Тянет влево' : 'Лёгкий');
        if (stress >= 1) finish(false, 'Леска потеряла натяжение'); else if (elapsed > 65) finish(false, 'Полёт не закончен за 65 секунд');
      }
      if (phase === 'failure') y = Math.max(.3, y - dt * 1.4);
      if (phase === 'success') y += (.45 - y) * dt * 2;
      kite.position.set(x, y, -.75); kite.rotation.set(.07 * Math.sin(t * 3), 0, -vx * .22 + Math.sin(t * 2) * .045); tails.forEach((tail, i) => tail.rotation.z = .15 * Math.sin(t * 5 - i * .8));
      const holder = role === 'line' ? you : helper, steerer = role === 'line' ? helper : you;
      spool.position.set(holder.pos.x - Math.sin(holder.yaw) * .5, 1.04, holder.pos.z - Math.cos(holder.yaw) * .5); spool.rotation.y = holder.yaw;
      spool.rotation.x += (s.keys.has('KeyW') ? -1 : s.keys.has('KeyS') ? 1 : 0) * dt * 3;
      you.avatar.hands = null; helper.avatar.hands = null;
      tensionMeter.set(tension); passes.set(`${passed} / 3`); startBtn.disabled = ['flight', 'landing'].includes(phase); s.update(dt, t);
      const spoolContacts = [contactPoint(ctx, spool, 'spool_grip', [0, 0, 0], [-.1, 0, 0]), contactPoint(ctx, spool, 'spool_grip', [0, 0, 0], [.1, 0, 0])];
      const steeringContacts = [contactPoint(ctx, steerer.root, null, [-.13, 1.08, -.48]), contactPoint(ctx, steerer.root, null, [.13, 1.08, -.48])];
      const start = contactPoint(ctx, spool, 'line_out', [0, .051, 0]).point, end = contactPoint(ctx, kite, 'kite_line', [0, 0, .018]).point;
      const hands = steeringContacts.map(c => c.point); if (start.distanceTo(hands[0]) > start.distanceTo(hands[1])) hands.reverse();
      const rope = [start, ...hands, end];
      for (let i = 0; i < 18; i++) { const segment = Math.floor(i / 6), v = (i % 6) / 5, a = rope[segment], b = rope[segment + 1]; lineArray[i * 3] = mix(a.x, b.x, v); lineArray[i * 3 + 1] = mix(a.y, b.y, v) - (segment === 1 ? 0 : Math.sin(v * Math.PI) * (1 - tension) * .3); lineArray[i * 3 + 2] = mix(a.z, b.z, v); }
      lineGeo.attributes.position.needsUpdate = true; lineGeo.computeBoundingSphere();
      heldContact = { spool: worldGrip(ctx, holder, spoolContacts), steeringLine: worldGrip(ctx, steerer, steeringContacts), holder: role === 'line' ? 'you' : 'partner', ropeStart: start.toArray(), ropeEnd: end.toArray() };
    }, dispose: () => s.dispose(), getState: () => ({ id: 'tandem-kite', phase, role, elapsed, x, y, vx, tension, stress, passed, landing, nextTarget: points[passed] || { x: 0, y: 1.3 }, heldContact, maxGripError: heldContact ? Math.max(heldContact.spool.maxError, heldContact.steeringLine.maxError) : null })
  };
}
