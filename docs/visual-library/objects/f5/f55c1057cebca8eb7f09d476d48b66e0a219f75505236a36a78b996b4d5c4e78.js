import { base, clamp, mix, loadKit, part, localLabel, contactPoint, worldGrip } from './common.js';

export function releaseCake(THREE,cake,scene,velocity,direction){
  scene.attach(cake);
  return {velocity:velocity.clone(),spin:new THREE.Vector3(.65,0,-direction*2.5),grounded:false,contacts:0,bounces:0,contactGap:null};
}
export function stepCakeFall(THREE,cake,fall,dt){
  if(!fall.grounded){fall.velocity.y-=9.8*dt;cake.position.addScaledVector(fall.velocity,dt);}
  cake.rotation.x+=fall.spin.x*dt;cake.rotation.z+=fall.spin.z*dt;
  cake.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(cake);
  if(box.min.y<=0){
    cake.position.y-=box.min.y;if(!fall.grounded)fall.contacts++;
    if(!fall.grounded&&fall.velocity.y<-.7&&fall.bounces<2){fall.velocity.y=-fall.velocity.y*.24;fall.bounces++;}
    else{fall.grounded=true;fall.velocity.set(0,0,0);}
    fall.spin.multiplyScalar(Math.exp(-dt*15));cake.updateMatrixWorld(true);
  }else if(fall.grounded){cake.position.y-=box.min.y;cake.updateMatrixWorld(true);}
  if(fall.grounded)fall.spin.multiplyScalar(Math.exp(-dt*12));
  fall.contactGap=fall.grounded?new THREE.Box3().setFromObject(cake).min.y:null;
}

export async function createDemo(ctx) {
  const s = base(ctx, { cam: [7.5, 6.2, 10], look: [0, 1.1, 0], radius: 7.3 });
  const kit = await loadKit(ctx, 'social-picnic');
  const tray = part(kit, 'carry_tray'), cake = part(kit, 'party_cake');
  const cakeBaseY = new ctx.THREE.Box3().setFromObject(cake).min.y;
  const cargo = new ctx.THREE.Group(); cargo.add(tray, cake); s.scene.add(cargo);
  const you = s.jelly({ name: 'Ты', x: -4, z: 1.4, outfit: { c: 6, h: 'cap' } });
  const partner = s.jelly({ name: 'Аня · демо', x: -4, z: -.9, outfit: { c: 0, h: 'straw' } });
  const spectator = s.jelly({ name: 'Миша', x: 4.7, z: -2.5, outfit: { c: 5, h: 'panama' } });
  const table = s.d.cyl(.85, .85, .14, 0xd29668); table.position.set(4.3, .8, 0);
  for (const x of [3.85, 4.75]) for (const z of [-.4, .4]) s.d.cyl(.06, .06, .8, 0x80543a).position.set(x, .4, z);
  const marks = [];
  for (let i = 0; i < 24; i++) { const u = i / 23, x = mix(-4.5, 4.3, u), z = Math.sin(u * Math.PI * 3) * .9; marks.push(s.ring(x, z, .12, 0xf0dabb)); }
  s.ring(4.3, 0, 1.15, 0x57af99);
  localLabel(ctx, 'Аня ведёт поднос по отмеченному пути');
  const tiltMeter = ctx.ui.meter('Наклон · держи середину'); tiltMeter.zone(.38, .62);
  const integrity = ctx.ui.stat('Торт', '100%');
  const distance = ctx.ui.stat('До стола', '8,8 м');
  let phase = 'ready', elapsed = 0, progress = 0, tilt = 0, tiltV = 0, slide = 0, slideV = 0, quality = 100, damageCd = 0, gust = 0;
  let role = 'balance', heldBrake = false, lane = 0, checkedTurns = 0;
  let heldContact = null, efforts = { you: 0, partner: 0 }, cakeSeatGap = null, cakeSeatSource = null;
  let cakeFall=null,detachRequested=false,carrySpeed=.025;
  const turns = [.17, .5, .84];
  ctx.ui.select('Твоя роль', [{ value: 'balance', label: 'Лови наклон' }, { value: 'steer', label: 'Веди поднос' }], role, v => { role = v; start(); });
  function start() {
    phase = 'carry'; elapsed = progress = tilt = tiltV = slide = slideV = lane = checkedTurns = 0; quality = 100; damageCd = 0; cakeFall=null;detachRequested=false;cargo.add(cake);cake.visible = true; cake.rotation.set(0,0,0); s.keys.clear();
    you.action(ctx.kit.ACT.none); partner.action(ctx.kit.ACT.none); s.result.set('Несём торт'); s.note(role === 'balance' ? 'A/D — против наклона. Пробел — осторожнее. Держи торт в середине подноса.' : 'A/D — следуй меловому пути. Пробел — сбавь скорость перед поворотом.');
  }
  function finish(win, text) { phase = win ? 'success' : 'failure'; s.result.set(text); s.note(win ? 'Донесли! Поменяйся ролью или попробуй сохранить весь крем.' : 'Поднос остался целым. Начни ещё раз и тормози перед порывом.'); s.celebrate(you, win); partner.action(ctx.kit.ACT.laugh); }
  const startBtn = s.button('Взяться и нести', start, true); s.button('Ещё раз', start);
  s.hold('Левее · A', 'KeyA'); s.hold('Правее · D', 'KeyD'); s.hold('Осторожнее · Пробел', 'Space');
  const state = () => ({ id: 'picnic-carry', phase, elapsed, progress, tilt, tiltV, slide, slideV, quality: Math.round(quality), role, gust, lane, routeZ: Math.sin(progress * Math.PI * 3) * .9, checkedTurns, efforts: { ...efforts }, heldContact, gripErrors: heldContact ? [...heldContact.you.errors, ...heldContact.partner.errors] : null, maxGripError: heldContact ? Math.max(heldContact.you.maxError, heldContact.partner.maxError) : null, actorColors: [6, 0], cakeSeatGap, cakeSeatSource, cakeFlight:cakeFall?{detached:true,grounded:cakeFall.grounded,position:cake.getWorldPosition(new ctx.THREE.Vector3()).toArray(),velocity:cakeFall.velocity.toArray(),contacts:cakeFall.contacts,bounces:cakeFall.bounces,contactGap:cakeFall.contactGap}:null });
  return { scene: s.scene, camera: s.camera, target: s.target, cameraOwned: true, cancelInput: s.cancelInput, onKey(code, down) { if (code === 'KeyR' && down) start(); return s.key(code, down); },
    update(dt, t) {
      dt = Math.min(dt, .04); damageCd = Math.max(0, damageCd - dt);
      if (phase === 'carry') {
        elapsed += dt; heldBrake = s.keys.has('Space'); const speed = heldBrake ? .012 : .025;carrySpeed=speed;
        progress = Math.min(1, progress + speed * dt); gust = Math.sin(elapsed * .77) * .22 + (elapsed > 13 && elapsed < 18 ? .42 : 0) - (elapsed > 28 && elapsed < 32 ? .36 : 0);
        const curve = Math.cos(progress * Math.PI * 3) * .19;
        if (role === 'steer') lane = clamp(lane + s.axis() * dt * .7, -1.3, 1.3);
        const control = role === 'balance' ? s.axis() * .92 : clamp(gust + curve + tilt * 2 + tiltV * 2 + slide * .8 + slideV, -.85, .85);
        efforts = role === 'balance' ? { you: control, partner: speed / .025 } : { you: s.axis(), partner: control };
        const routeZ = Math.sin(progress * Math.PI * 3) * .9;
        tiltV += (gust + curve - control - tilt * .75 - tiltV * 1.3 + (role === 'steer' ? (lane - routeZ) * .2 : 0)) * dt;
        tilt += tiltV * dt; tilt = clamp(tilt, -.7, .7);
        const slope = Math.abs(tilt) > .045 ? Math.sin(tilt) : 0;
        slideV += (slope * 1.7 - slideV * 1.7) * dt; slide += slideV * dt;
        if (Math.abs(slide) > .47 && damageCd === 0) { quality -= 12; damageCd = 2.2; ctx.sound.pop(); s.note('Крем помялся у края. Держи противоположную сторону, пока торт не вернётся.'); }
        if (role === 'steer' && checkedTurns < turns.length && progress >= turns[checkedTurns]) {
          checkedTurns++; if (Math.abs(lane - routeZ) > .5) finish(false, `Пропустил поворот ${checkedTurns}`); else ctx.sound.ding();
        }
        if (phase !== 'carry') { /* preserve the real missed-turn outcome */ }
        else if (Math.abs(slide) > .79) { detachRequested=true;finish(false, 'Торт стал десертом в стаканчике'); }
        else if (progress >= 1) finish(true, quality > 80 ? 'Торт целый · отличный праздник' : `Донесли · сохранность ${Math.max(0, Math.round(quality))}%`);
        else if (elapsed > 68) finish(false, 'Остыли свечи · слишком медленно');
      }
      const x = mix(-4.5, 4.3, progress), z = role === 'steer' ? lane : Math.sin(progress * Math.PI * 3) * .9;
      cargo.position.set(x, phase === 'success' ? .9 : 1.05 + Math.sin(t * 4) * .012, z); cargo.rotation.z = tilt;
      const seat = contactPoint(ctx, tray, 'cake_seat', [0, .06, 0]), seatLocal = cargo.worldToLocal(seat.point.clone());
      if(!cakeFall){cake.position.copy(seatLocal);cake.position.x+=slide;cake.position.y-=Number.isFinite(cakeBaseY)?cakeBaseY:0;cakeSeatSource=seat.source;cakeSeatGap=Math.abs(cake.rotation.z)<.001?Math.abs(cake.position.y+(Number.isFinite(cakeBaseY)?cakeBaseY:0)-seatLocal.y):null;}
      if(detachRequested){cargo.updateMatrixWorld(true);const direction=Math.sign(slide)||1,velocity=new ctx.THREE.Vector3(slideV+direction*2.5,1.4,0).applyQuaternion(cargo.quaternion);velocity.x+=carrySpeed*8.8;velocity.z+=role==='steer'?s.axis()*.7:Math.cos(progress*Math.PI*3)*.9*Math.PI*3*carrySpeed;cakeFall=releaseCake(ctx.THREE,cake,s.scene,velocity,direction);detachRequested=false;cakeSeatGap=null;}
      if(cakeFall)stepCakeFall(ctx.THREE,cake,cakeFall,dt);
      you.pos.set(x, 0, z + 1.13); partner.pos.set(x, 0, z - 1.13); you.face(x, z); partner.face(x, z);
      you.avatar.hands = null; partner.avatar.hands = null; spectator.face(x, z);
      tiltMeter.set(clamp(.5 + tilt * .65, 0, 1)); integrity.set(`${Math.max(0, Math.round(quality))}%`); distance.set(`${((1 - progress) * 8.8).toFixed(1)} м`); startBtn.disabled = phase === 'carry'; s.update(dt, t);
      you.root.rotation.z = efforts.you * .055; partner.root.rotation.z = -tilt * .08;
      cargo.updateMatrixWorld(true);
      heldContact = {
        you: worldGrip(ctx, you, [contactPoint(ctx, tray, 'handle_rear_left', [-.7, .14, .42]), contactPoint(ctx, tray, 'handle_rear_right', [.7, .14, .42])]),
        partner: worldGrip(ctx, partner, [contactPoint(ctx, tray, 'handle_front_right', [.7, .14, -.42]), contactPoint(ctx, tray, 'handle_front_left', [-.7, .14, -.42])]),
      };
    }, dispose: () => s.dispose(), getState: state
  };
}
