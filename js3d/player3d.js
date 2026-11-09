// 플레이어 이동 (배그식 동작 + 콜옵식 1인칭 시점): 1인칭 ↔ 3인칭 어깨너머(V) · WASD(뒷걸음·옆걸음 감속) · Shift 질주 · C 앉기 · Z 엎드리기
// Space 점프/넘기(낮은 장애물) · Q/E 기울이기 · Alt 둘러보기 · 우클릭 조준 · 묵직한 가감속 · 카메라 벽 충돌
(function () {
  const T = THREE, { clamp, damp, lerp } = ZK;
  const P = {};
  const SENS = 0.0021, EYE = { stand: 1.6, crouch: 1.12, prone: 0.42 };
  const st = P.state = {
    pos: new T.Vector3(0, 0, 3), vel: new T.Vector3(), vy: 0, yaw: 0, pitch: 0, lookYaw: 0, lookPitch: 0, freeLook: false,
    recP: 0, recPV: 0, recY: 0, recYV: 0, onGround: true, stance: 'stand', crouchK: 0, proneK: 0, stanceLock: 0,
    lean: 0, mode: 'fpp' /* 기본 1인칭(콜옵식 시점), V로 3인칭 전환 */, aimK: 0, adsK: 0, sprint: false, move: 0, bob: 0, roll: 0, land: 0, landV: 0, fov: 74, fovPunch: 0,
    bloom: 0, stepT: 0, locked: false, vaulting: false, vault: null, eye: 1.6, camBack: 2.7,
  };
  P.pos = st.pos;
  const keys = P.keys = {};
  let mdx = 0, mdy = 0, cam, jumpPressed = false;
  const ray = new T.Raycaster(), _f = new T.Vector3(), _r = new T.Vector3(), _o = new T.Vector3(), _d = new T.Vector3(), camTarget = new T.Vector3();
  const _aq = new T.Quaternion(), _ae = new T.Euler(0, 0, 0, 'YXZ');

  function setStance(s) {
    if (s === st.stance || !st.onGround || st.vaulting) return;
    if (s === 'prone' || st.stance === 'prone') st.stanceLock = 0.55;   // 엎드리고 일어나는 데 시간이 걸림
    st.stance = s; ZK.audio.step && ZK.audio.step(0.8);
  }
  P.init = function (camera, dom) {
    cam = camera; cam.rotation.order = 'YXZ';
    const block = ['Space', 'ShiftLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'AltLeft', 'AltRight', 'KeyQ', 'KeyE', 'KeyC', 'KeyZ', 'KeyV', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    addEventListener('keydown', e => {
      if (block.includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (e.code === 'Space') jumpPressed = true;
        if (e.code === 'KeyC') setStance(st.stance === 'crouch' ? 'stand' : 'crouch');
        if (e.code === 'KeyZ') setStance(st.stance === 'prone' ? 'stand' : 'prone');
        if (e.code === 'KeyV') st.mode = st.mode === 'tpp' ? 'fpp' : 'tpp';
      }
      keys[e.code] = true;
    });
    addEventListener('keyup', e => { keys[e.code] = false; if (e.code.startsWith('Alt')) e.preventDefault(); });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === dom; });
    addEventListener('mousemove', e => {
      st.cx = e.clientX; st.cy = e.clientY;   // 마우스 잠금이 안 될 때 가장자리 회전용 커서 위치
      if (!st.locked) return;
      const s = SENS * (st.aimK > 0.5 ? 0.65 : 1);
      if (st.freeLook) { st.lookYaw = clamp(st.lookYaw - e.movementX * s, -1.9, 1.9); st.lookPitch = clamp(st.lookPitch - e.movementY * s, -1.1, 1.1); }
      else { st.yaw -= e.movementX * s; st.pitch = clamp(st.pitch - e.movementY * s, -1.4, 1.4); mdx += e.movementX; mdy += e.movementY; }
    });
  };
  P.reset = function () {
    st.pos.set(0, 0, 3); st.vel.set(0, 0, 0); st.vy = 0; st.yaw = 0; st.pitch = 0; st.lookYaw = st.lookPitch = 0;
    st.recP = st.recY = st.recPV = st.recYV = 0; st.bloom = 0; st.stance = 'stand'; st.vaulting = false; st.onGround = true;
  };
  P.mouseFrame = () => { const r = { mdx, mdy }; mdx = mdy = 0; return r; };
  P.kick = function (up, side) {
    st.pitch = clamp(st.pitch + up * 0.35, -1.4, 1.4); st.yaw += side * 0.35;
    st.recPV += up * 0.65 * 22; st.recYV += side * 0.65 * 22;
    st.fovPunch += 3.2; st.bloom = Math.min(1, st.bloom + 0.55);
  };
  // 화각 펀치: +면 밖으로 확 넓어짐(발사·폭발), −면 확 당겨짐(헤드샷 처치 '줌 펀치')
  P.fovKick = n => { st.fovPunch += n * (ZK.fx3 ? ZK.fx3.J : 1); };
  // 탄 퍼짐: 엎드림 < 앉음 < 섬, 조준하면 크게 줄고, 움직이거나 공중이면 커짐
  P.spread = function () {
    const a = st.aimK, stanceMul = st.stance === 'prone' ? 0.5 : st.stance === 'crouch' ? 0.75 : 1;
    return (lerp(st.mode === 'tpp' ? 0.024 : 0.02, 0.0025, a) + st.move * lerp(0.028, 0.006, a) + st.bloom * lerp(0.03, 0.008, a)) * stanceMul
      + (st.onGround && !st.vaulting ? 0 : 0.06) + (ZK.needs ? ZK.needs.sway() : 0);   // 갈증·피로: 조준이 흔들림
  };
  // 3인칭 사격은 카메라 중앙에서 쏘되, 카메라~캐릭터 사이 물체는 건너뛴다
  // 조준 방향: 화면 흔들림·펀치를 뺀 '진짜 조준' → 손맛 연출이 세져도 탄은 마우스로 겨눈 곳으로 간다
  P.aimQuat = () => _aq;
  P.aimOrigin = () => cam.position.clone().addScaledVector(cam.getWorldDirection(_d), st.mode === 'tpp' ? st.camBack : 0);

  P.update = function (dt, ctx) {
    st.ads = !!ctx.ads;
    st.aimK = damp(st.aimK, st.ads && !ctx.reloading && !st.vaulting ? 1 : 0, 12, dt); st.adsK = st.aimK;
    st.freeLook = !!(keys.AltLeft || keys.AltRight);
    if (!st.freeLook) { st.lookYaw = damp(st.lookYaw, 0, 9, dt); st.lookPitch = damp(st.lookPitch, 0, 9, dt); }
    // 둘러보기 보조: ←→↑↓ 키, 그리고 마우스 잠금이 안 되는 창(앱 미리보기 등)에서는 커서를 화면 가장자리 12%에 대면 계속 돈다
    // (잠금 없이 상대 이동만 쓰면 커서가 화면 끝에 닿는 순간 회전이 멈춰 360도로 돌아볼 수 없었다)
    { const ty = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0), tp = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
      st.yaw += ty * 2.4 * dt; st.pitch = clamp(st.pitch + tp * 1.3 * dt, -1.4, 1.4);
      st.noLock = st.locked && !document.pointerLockElement;
      if (st.noLock && st.cx !== undefined && !st.freeLook) {
        const e = 0.12, nx = st.cx / innerWidth, ny = st.cy / innerHeight;
        if (nx < e) st.yaw += (e - nx) / e * 2.6 * dt; else if (nx > 1 - e) st.yaw -= (nx - 1 + e) / e * 2.6 * dt;
        if (ny < e) st.pitch = clamp(st.pitch + (e - ny) / e * 1.3 * dt, -1.4, 1.4); else if (ny > 1 - e) st.pitch = clamp(st.pitch - (ny - 1 + e) / e * 1.3 * dt, -1.4, 1.4);
      } }
    st.crouchK = damp(st.crouchK, st.stance === 'crouch' ? 1 : 0, 9, dt);
    st.proneK = damp(st.proneK, st.stance === 'prone' ? 1 : 0, 5.5, dt);
    st.stanceLock -= dt;

    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    if (st.mounted) {
      // 요새 탑승 중: WASD는 운전에 쓰이고 플레이어는 갑판에 붙어 있음 (앉기·기울이기·조준은 그대로)
      st.pos.copy(st.mountPos); st.vel.copy(st.mountVel); st.vy = 0; st.onGround = true; st.vaulting = false; st.sprint = false; jumpPressed = false;
      if (st.stance === 'prone') st.stance = 'crouch';
      st.lean = damp(st.lean, (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0), 10, dt);
    } else {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const wantSprint = !!keys.ShiftLeft && f > 0 && st.aimK < 0.5 && !ctx.firing && st.stance !== 'prone' && (!ZK.dread || ZK.dread.canSprint());   // 공포 디렉터: 지구력이 바닥나면 못 뛴다
    if (wantSprint && st.stance === 'crouch') setStance('stand');
    st.sprint = wantSprint && st.onGround && !st.vaulting;
    let speed = st.stance === 'prone' ? 1.15 : st.stance === 'crouch' ? 3.0 : st.sprint ? 6.3 : 4.7;
    if (st.aimK > 0.5) speed = Math.min(speed, st.stance === 'crouch' ? 1.9 : 2.5);
    if (st.stanceLock > 0) speed *= 0.15;
    if (f < 0) speed *= 0.72; else if (f === 0 && r !== 0) speed *= 0.88;
    let wx = -sy * f + cy * r, wz = -cy * f - sy * r; const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    // 기울이기 (질주·엎드림 중 불가)
    const leanT = st.sprint || st.stance === 'prone' ? 0 : (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
    st.lean = damp(st.lean, leanT, 10, dt);

    // Space: 앉음/엎드림이면 일어서기 → 앞에 낮은 장애물이면 넘기 → 아니면 점프
    if (jumpPressed) {
      jumpPressed = false;
      if (st.stance !== 'stand') setStance('stand');
      else if (st.onGround && !st.vaulting) {
        const v = ZK.world.vault(st.pos, -sy, -cy);
        if (v) {
          st.vaulting = true; st.vault = { t: 0, dur: 0.34 + v.dist * 0.07, from: st.pos.clone(), to: v.land, h: v.h };
          ZK.audio.step && ZK.audio.step(1.2); ZK.fx3.trauma(0.04);
        } else { st.vy = 5.4; st.onGround = false; }
      }
    }
    if (st.vaulting) {
      const V = st.vault; V.t += dt; const k = Math.min(1, V.t / V.dur), e = k * k * (3 - 2 * k);
      st.pos.x = lerp(V.from.x, V.to.x, e); st.pos.z = lerp(V.from.z, V.to.z, e); st.pos.y = Math.sin(k * Math.PI) * (V.h + 0.2);
      st.vel.set((V.to.x - V.from.x) / V.dur * 0.6, 0, (V.to.z - V.from.z) / V.dur * 0.6);
      if (k >= 1) { st.vaulting = false; st.pos.y = 0; st.onGround = true; st.landV -= 1.2; ZK.audio.step && ZK.audio.step(1.2); }
    } else {
      const acc = st.onGround ? (wl > 0 ? 7.5 : 9) : 1.5;   // 배그처럼 묵직한 가속·감속
      st.vel.x = damp(st.vel.x, wx * speed, acc, dt); st.vel.z = damp(st.vel.z, wz * speed, acc, dt);
      st.vy -= 20 * dt;
      st.pos.x += st.vel.x * dt; st.pos.z += st.vel.z * dt; st.pos.y += st.vy * dt;
      if (st.pos.y <= 0) {
        if (!st.onGround) { const hard = clamp(-st.vy / 9, 0.2, 1); st.landV -= 2.2 * hard; ZK.audio.step && ZK.audio.step(1.3 * hard); ZK.fx3.trauma(0.05 * hard); }
        st.pos.y = 0; st.vy = 0; st.onGround = true;
      }
      ZK.world.collide(st.pos, st.stance === 'prone' ? 0.45 : 0.36);
    }
    }

    const hs = Math.hypot(st.vel.x, st.vel.z);
    st.move = clamp(hs / 4.7, 0, 1.4);
    if (st.onGround && hs > 0.5 && !st.vaulting && !st.mounted) { st.stepT += hs * dt; if (st.stepT > (st.sprint ? 2.4 : st.stance === 'prone' ? 0.9 : 1.9)) { st.stepT = 0; ZK.audio.step && ZK.audio.step(st.sprint ? 1 : st.stance === 'stand' ? 0.7 : 0.35); } }
    st.bob += dt * hs * (st.sprint ? 2.0 : 2.3);
    st.recPV += (-160 * st.recP - 18 * st.recPV) * dt; st.recP += st.recPV * dt;
    st.recYV += (-160 * st.recY - 18 * st.recYV) * dt; st.recY += st.recYV * dt;
    st.landV += (-180 * st.land - 16 * st.landV) * dt; st.land += st.landV * dt;
    st.bloom = Math.max(0, st.bloom - dt * 2.2); st.fovPunch *= Math.exp(-dt * 10);

    // ───────── 카메라 ─────────
    const fpp = st.mode === 'fpp', sh = ZK.fx3.shake();
    st.eye = lerp(lerp(EYE.stand, EYE.crouch, st.crouchK), EYE.prone, st.proneK);
    const strafe = st.vel.x * cy - st.vel.z * sy;
    st.roll = damp(st.roll, fpp ? -strafe * 0.009 + st.lean * 0.2 : st.lean * 0.06, 8, dt);
    const bobA = st.move * (st.onGround ? 1 : 0) * lerp(1, 0.25, st.aimK) * (fpp ? 1 : 0.35) * (st.mounted ? 0.12 : 1);
    cam.rotation.set(clamp(st.pitch + st.lookPitch + st.recP + sh.pitch, -1.45, 1.45), st.yaw + st.lookYaw + st.recY + sh.yaw, st.roll + sh.roll);
    _ae.set(clamp(st.pitch + st.lookPitch + st.recP, -1.45, 1.45), st.yaw + st.lookYaw + st.recY, st.roll); _aq.setFromEuler(_ae);
    cam.getWorldDirection(_f); _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const flatR = new T.Vector3(cy, 0, -sy);
    const pivot = _o.set(st.pos.x, st.pos.y + st.eye + Math.sin(st.bob * 2) * 0.03 * bobA + st.land * 0.06, st.pos.z).addScaledVector(flatR, st.lean * 0.38);
    if (fpp) { cam.position.copy(pivot); st.camBack = 0; }
    else {
      const dist = lerp(lerp(3.1, 2.3, st.proneK), 1.3, st.aimK), side = lerp(0.62, 0.68, st.aimK), up = lerp(0.42, 0.18, st.aimK);
      const origin = pivot.clone().addScaledVector(_r, side * 0.5).add(new T.Vector3(0, up, 0));
      camTarget.copy(pivot).addScaledVector(_r, side).add(new T.Vector3(0, up, 0)).addScaledVector(_f, -dist);
      _d.copy(camTarget).sub(origin); const len = _d.length(); _d.normalize();
      ray.set(origin, _d); ray.far = len;
      const hit = ray.intersectObjects(ZK.world.solids, false)[0];
      if (hit) camTarget.copy(origin).addScaledVector(_d, Math.max(0.2, hit.distance - 0.2));   // 벽에 카메라가 박히지 않게
      cam.position.copy(camTarget);
      st.camBack = Math.max(0, camTarget.clone().sub(pivot).dot(_f) * -1) + 0.3;
    }
    // 흔들림·펀치의 위치 성분: 화면이 옆·위로 떨리고, 발사하면 뒤로 '쿵' 밀린다 (조준·판정은 회전만 따르므로 영향 없음)
    cam.position.addScaledVector(_r, sh.x).y += sh.y; cam.position.addScaledVector(_f, -sh.back);
    const fovT = fpp ? lerp(st.sprint ? 84 : 76, 56, st.aimK) : lerp(st.sprint ? 78 : 72, 60, st.aimK);
    st.fov = damp(st.fov, fovT, 10, dt);
    cam.fov = st.fov + clamp(st.fovPunch, -9, 12) - (ZK.dread ? ZK.dread.tunnel : 0); cam.updateProjectionMatrix();   // 쫓길수록 시야가 좁아진다(최대 6°)
  };
  ZK.player = P;
})();
