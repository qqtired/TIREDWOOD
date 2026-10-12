import { controls, asset, loadKit, component, marker, ring, line, ellipseCourse, ellipsePoint, newVehicle, vehicleStep, ellipseBoundary, gatePass, poseVehicle, waterWake, mix, clamp, clockText, TAU } from './common.js';
import { authoredRegattaOverview } from './regatta-overview.js';

export async function regatta(ctx) {
  const { THREE: T, ui, sound, kit } = ctx;
  const d = kit.diorama({ cam: [40, 28, 35], look: [0, 0, 0], radius: 3, rail: false, waterY: -0.3 });
  const backgroundNodes = new Set(d.scene.children);
  const keys = controls(ctx), rx = 25, rz = 18, width = 12;
  const courseKit = await loadKit(ctx, 'regatta-course');
  ellipseCourse(ctx, d, rx, rz, width, true, courseKit);
  const boat = await asset(ctx, 'boat', d.scene);
  const wake = waterWake(ctx,d.scene);
  const pier = component(courseKit, 'harbor_pier', d.scene);
  if (pier) pier.position.set(-35, -0.3, 0);
  const coast = component(courseKit, 'coastal_landmark', d.scene);
  if (coast) coast.position.set(-36, -0.3, -15);
  const gates = [];
  for (let i = 1; i <= 4; i++) {
    const a = i / 4 * TAU, p = ellipsePoint(a, rx, rz);
    gates.push(ring(ctx, d.scene, p.x, -0.2, p.z, 3, i === 1 ? 0xeab94a : 0xe2e9d5));
    const gateModel = component(courseKit, 'race_gate', d.scene);
    if (gateModel) { gateModel.position.set(p.x, -0.3, p.z); gateModel.rotation.y = -a; }
    else for (const side of [-1, 1]) {
      const x = p.x + Math.cos(a) * side * 5, z = p.z + Math.sin(a) * side * 5;
      d.cyl(0.25, 0.3, 3, 0xd97350).position.set(x, 1.2, z);
      d.box(1.1, 0.45, 0.06, 0xf4e5c4).position.set(x, 2.45, z);
    }
    marker(ctx, d, i === 4 ? 'Финиш' : `Ворота ${i}`, p.x, 3.5, p.z, 4);
  }
  // Close landmarks supply motion parallax without becoming hidden gameplay collisions.
  for (const [x, z, w] of [[-37, -12, 5], [-35, 10, 4], [11, -29, 6]]) {
    const rock = d.ball(w, 0xc9c2ab); rock.scale.set(1, 0.65, 0.8); rock.position.set(x, -0.9, z);
  }
  line(ctx, d.scene, [[-38, 0, -30], [-38, 0, 30]], 0xb78a5b);
  const sliceNodes=d.scene.children.filter(o=>!backgroundNodes.has(o));
  const planning=authoredRegattaOverview(ctx,d,courseKit);planning.setVisible(false);
  let s = newVehicle(rx, rz), phase = 'ready', elapsed = 0, variant = 'new', camVariant = 'path', view='slice', shake = 0, accum = 0, hitCooldown = 0;
  const records = { old: Infinity, new: Infinity };
  const timeStat = ui.stat('Круг', '—'), speedStat = ui.stat('Ход', '0 км/ч'), gateStat = ui.stat('Ворота', '0 / 4');
  const driftStat = ui.stat('Руль / поворот', '—'), recordStat = ui.stat('Твой чистый круг', '—');
  const sceneSelect=ui.select('Сцена',[{value:'slice',label:'Руль и камера: A/B-фрагмент'},{value:'planning',label:'План нового курса: 3 зоны'},{value:'marina',label:'Марина'},{value:'cliffs',label:'Канал белых скал'},{value:'lighthouse',label:'Выход у маячка'},{value:'choice',label:'Две линии поворота'}],view,v=>{view=v;keys.clear();ui.note(v==='slice'?'Эллипс — только проверка руля и камеры. Enter — один короткий круг.':planning.available?'Настоящий 3D-план: 6 дуг, радиусы 20–24 м, основная полоса 18 м и узкий срез. Проходимость всего курса ещё не проверена.':'Полная модель курса ещё не загружена. A/B-фрагмент доступен отдельно.');});
  ui.select('Управление', [{ value: 'new', label: 'Контрруление' }, { value: 'old', label: 'Нынешний занос' }], variant, v => { variant = v; reset(); });
  ui.select('Камера', [{ value: 'path', label: 'Смотрит в выход' }, { value: 'nose', label: 'Запаздывает за носом' }], camVariant, v => { camVariant = v; });
  const start = ui.button('Старт · Enter', () => reset(true), true);
  ui.button('Ещё круг · R', () => reset(true));
  keys.movement(false, true);
  let camYaw = s.yaw;
  function reset(run = false) {
    s = newVehicle(rx, rz); phase = run ? 'running' : 'ready'; elapsed = 0; accum = 0; shake = 0; hitCooldown = 0; keys.clear(); camYaw = s.yaw; wake.reset();
    if(run){view='slice';if(sceneSelect)sceneSelect.value='slice';}
    ui.note(run ? 'Держи W. D — в первый поворот; Shift — снос. Это A/B-фрагмент управления, а не новый полный курс.' : 'Эллипс — только тест руля и камеры. Новый трёхзонный курс смотри отдельно в выборе сцены. Enter — старт.');
    recordStat.set(Number.isFinite(records[variant]) ? clockText(records[variant]) : '—');
  }
  reset();
  return {
    scene: d.scene, camera: d.camera, target: d.target, cameraOwned: true,
    cancelInput(){keys.clear();s.drift=false;s.driftDir=0;s.steer=0;s.omega=0;},
    onKey(code, down) { keys.onKey(code, down); if (down && (code === 'Enter' || code === 'KeyR')) reset(true); if (down && code === 'KeyC') camVariant = camVariant === 'path' ? 'nose' : 'path'; },
    update(dt, t) {
      planning.setVisible(view!=='slice');planning.update(dt,view!=='slice');
      sliceNodes.forEach(o=>o.visible=view==='slice');
      boat.userData.labActor?.setVisible(view==='slice');
      hitCooldown = Math.max(0, hitCooldown - dt);
      if (phase === 'running'&&view==='slice') {
        elapsed += dt; accum += dt;
        while (accum >= 1 / 60) {
          vehicleStep(s, keys, 1 / 60, { old: variant === 'old', top: 17 });
          if (ellipseBoundary(s, rx, rz, width, variant === 'old') && !hitCooldown) { s.hits++; hitCooldown = 0.5; shake = 0.12; sound.slip(); }
          if (gatePass(s, rx, rz, width / 2 + 1)) {
            sound.ding();
            if (s.checkpoint >= 4) {
              phase = 'won';
              if (!s.hits) records[variant] = Math.min(records[variant], elapsed);
              ui.note(`Финиш ${clockText(elapsed)} · касаний ${s.hits}. ${s.hits ? 'Пройди чище и сравни.' : 'Чистый круг записан.'} R — ещё.`); sound.fanfare();
              recordStat.set(Number.isFinite(records[variant]) ? clockText(records[variant]) : '—');
            }
          }
          accum -= 1 / 60;
          if (phase !== 'running') break;
        }
        if (elapsed > 60) { phase = 'failed'; ui.note('Минута прошла. Если ворота остались позади — R и новая попытка.'); sound.slip(); }
      }
      if(view==='slice')wake.update(s,dt);
      const speed = Math.hypot(s.vx, s.vz);
      for (let i = 0; i < gates.length; i++) gates[i].material.opacity = i === s.checkpoint ? 0.95 : 0.22;
      const posYaw = Math.atan2(s.z / rz, s.x / rx), trackYaw = Math.atan2(Math.cos(posYaw) * rz, -Math.sin(posYaw) * rx);
      const velocityYaw = speed > 1 ? Math.atan2(s.vz, s.vx) : s.yaw;
      const blend = camVariant === 'nose' ? (s.drift ? 2.6 : 4.5) : 10;
      let wanted = s.yaw;
      if (camVariant === 'path') {
        const look = ellipsePoint(posYaw + 0.52, rx, rz);
        wanted = Math.atan2(look.z - s.z, look.x - s.x);
        wanted += Math.atan2(Math.sin(velocityYaw - wanted), Math.cos(velocityYaw - wanted)) * 0.18;
      }
      camYaw += Math.atan2(Math.sin(wanted - camYaw), Math.cos(wanted - camYaw)) * (1 - Math.exp(-dt * blend));
      const hx = Math.cos(camYaw), hz = Math.sin(camYaw), back = 6 + speed * 0.05;
      d.camera.position.set(s.x - hx * back, 2.8, s.z - hz * back);
      const lookAhead = camVariant === 'path' ? clamp(speed * 1.1, 12, 25) : 8;
      d.camera.lookAt(s.x + hx * lookAhead, 0.5, s.z + hz * lookAhead);
      const fov = 68 + Math.min(10, speed * 0.5); if (Math.abs(d.camera.fov - fov) > 0.1) { d.camera.fov = fov; d.camera.updateProjectionMatrix(); }
      shake *= Math.exp(-dt * 10); d.camera.position.y += Math.sin(t * 36) * shake;
      if(view!=='slice')planning.camera(view,d.camera);
      poseVehicle(boat,s,-0.2,dt,t,d.camera);
      timeStat.set(clockText(elapsed)); speedStat.set(`${Math.round(speed * 3.6)} км/ч`); gateStat.set(`${Math.min(4, s.checkpoint)} / 4`);
      driftStat.set(`${s.steer > 0.1 ? '←' : s.steer < -0.1 ? '→' : '·'} / ${s.omega > 0.08 ? '←' : s.omega < -0.08 ? '→' : '·'}${s.drift ? ' · снос' : ''}`);
      start.disabled = phase === 'running';
    },
    getState: () => ({ mode: 'regatta', scope: 'ellipse only tests A/B control; authored three-zone planning view is not full-course physics acceptance', phase, clock: elapsed, score: s.checkpoint, gates: s.checkpoint, hits: s.hits, variant, view, planningReady:planning.available,planningClips:planning.clips,camera: camVariant, speed: Math.hypot(s.vx, s.vz), steer: s.steer, yawRate: s.omega, headingYaw:s.yaw, drift: s.drift, driftDir: s.driftDir,boost:s.boost,position: { x: s.x, z: s.z }, modelParts: ['race_gate','course_buoy','harbor_pier','coastal_landmark','regatta_full_course'].filter(n=>d.scene.getObjectByName(`lab-${n}`)), actors: 'actual game boat', actorState:boat.userData.labActor?.state?.()||null }),
    dispose() { keys.clear(); planning.dispose();d.dispose(); }
  };
}
