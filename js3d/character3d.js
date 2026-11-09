// 3인칭 플레이어 캐릭터: 관절(엉덩이·무릎·어깨·팔꿈치)로 절차적 애니메이션
// 서기/앉기/엎드리기 · 방향별 걷기/뛰기(뒷걸음·옆걸음) · 질주 팔 흔들기 · 조준 자세(시점 상하 따라감) · 기울이기 · 점프/넘기 · 반동
(function () {
  const T = THREE, { damp, clamp } = ZK;
  const C = {};
  let root, poseG, hips, spine, headG, legs = [], arms = [], muzzle, flash, gunG;
  let phase = 0, aimHold = 0, lastFlash = 0;

  function box(w, h, d, mat, x, y, z, parent) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
  function joint(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  C.init = function (scene) {
    const lam = c => new T.MeshLambertMaterial({ color: c });
    const jacket = lam(0x3b4636), pants = lam(0x2a2d33), skin = lam(0xc48a66), boots = lam(0x1b1a18), pack = lam(0x4a3e2c), cap = lam(0x22252b), vest = lam(0x2b3027);
    root = new T.Group(); scene.add(root);
    poseG = joint(root, 0, 0, 0);
    hips = joint(poseG, 0, 0.95, 0);
    box(0.36, 0.16, 0.22, pants, 0, 0, 0, hips);
    for (const s of [1, -1]) { // 왼(+x)·오른(-x) 다리
      const thigh = joint(hips, s * 0.1, -0.04, 0);
      box(0.15, 0.46, 0.17, pants, 0, -0.23, 0, thigh);
      const knee = joint(thigh, 0, -0.46, 0);
      box(0.13, 0.44, 0.15, pants, 0, -0.22, 0, knee);
      box(0.13, 0.08, 0.26, boots, 0, -0.46, 0.05, knee);
      legs.push({ thigh, knee, s });
    }
    spine = joint(hips, 0, 0.06, 0);
    box(0.44, 0.56, 0.25, jacket, 0, 0.3, 0, spine);
    box(0.42, 0.3, 0.06, vest, 0, 0.32, 0.13, spine);
    box(0.36, 0.44, 0.17, pack, 0, 0.32, -0.21, spine);
    box(0.3, 0.08, 0.12, pack, 0, 0.58, -0.2, spine);
    headG = joint(spine, 0, 0.62, 0);
    box(0.1, 0.08, 0.1, skin, 0, 0.03, 0, headG);
    const head = new T.Mesh(new T.SphereGeometry(0.115, 12, 10), skin); head.position.y = 0.15; headG.add(head);
    const capM = new T.Mesh(new T.SphereGeometry(0.122, 12, 8, 0, 6.283, 0, 1.45), cap); capM.position.y = 0.16; headG.add(capM);
    box(0.16, 0.02, 0.1, cap, 0, 0.17, 0.12, headG);
    for (const s of [1, -1]) {
      const sh = joint(spine, s * 0.27, 0.54, 0);
      box(0.12, 0.3, 0.13, jacket, 0, -0.15, 0, sh);
      const el = joint(sh, 0, -0.3, 0);
      box(0.1, 0.27, 0.11, jacket, 0, -0.13, 0, el);
      box(0.09, 0.09, 0.09, skin, 0, -0.3, 0, el);
      arms.push({ sh, el, s });
    }
    // 오른손 리볼버 (총열은 팔 방향으로)
    gunG = joint(arms[1].el, 0, -0.32, 0.02); gunG.rotation.x = Math.PI / 2;
    const metal = new T.MeshPhongMaterial({ color: 0x2c3036, specular: 0x8a94a4, shininess: 60 });
    box(0.035, 0.05, 0.09, metal, 0, 0.02, 0.02, gunG);
    box(0.022, 0.026, 0.13, metal, 0, 0.032, 0.12, gunG);
    const cyl = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.05, 12), metal); cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.025, 0.045); gunG.add(cyl);
    box(0.03, 0.08, 0.04, lam(0x6b3f22), 0, -0.03, -0.01, gunG).rotation.x = -0.3;
    muzzle = joint(gunG, 0, 0.032, 0.2);
    const fc = document.createElement('canvas'); fc.width = fc.height = 64; const g = fc.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,250,220,1)'); rg.addColorStop(0.3, 'rgba(255,190,90,0.9)'); rg.addColorStop(1, 'rgba(255,110,20,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    flash = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(fc), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    flash.visible = false; muzzle.add(flash);
  };
  C.setVisible = v => { root.visible = v; };
  C.muzzleWorld = () => muzzle.getWorldPosition(new T.Vector3());
  C.handWorld = () => arms[1].el.getWorldPosition(new T.Vector3());

  // ps: 플레이어 상태, gs: 총 상태
  C.update = function (dt, ps, gs) {
    const yaw = ps.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    root.position.copy(ps.pos); root.rotation.y = yaw + Math.PI;
    // 이동 방향(캐릭터 기준): 앞 +, 오른쪽 +
    const mf = -(ps.vel.x * sy + ps.vel.z * cy), mr = ps.vel.x * cy - ps.vel.z * sy, sp = Math.hypot(mf, mr);
    const crouch = ps.crouchK, prone = ps.proneK, air = !ps.onGround || ps.vaulting;
    const dir = mf < -0.3 ? -1 : 1;
    phase += dt * sp * (ps.sprint ? 2.1 : 2.6) * dir;
    const amp = clamp(sp / 4.7, 0, 1.3) * (1 - prone) * (air ? 0 : 1);
    if (gs.flashT > 0 && lastFlash <= 0) aimHold = 1.2;
    lastFlash = gs.flashT; aimHold = Math.max(0, aimHold - dt);
    const aim = Math.max(ps.aimK, aimHold > 0 ? 1 : 0, ps.sprint ? 0 : 0.35) * (ps.sprint ? 0 : 1);

    // 엎드리기: 몸 전체를 앞으로 눕힘
    poseG.rotation.x = damp(poseG.rotation.x, prone * Math.PI / 2, 14, dt);
    poseG.position.set(0, prone * 0.14, -prone * 0.95);
    hips.position.y = 0.95 - crouch * 0.36 * (1 - prone);
    // 옆걸음이면 하체를 이동 방향으로 틀기
    const legYaw = sp > 0.4 && !ps.sprint ? clamp(Math.atan2(mr, Math.abs(mf)) * 0.55, -0.8, 0.8) * (1 - prone) : 0;
    hips.rotation.y = damp(hips.rotation.y, -legYaw, 10, dt);
    spine.rotation.y = -hips.rotation.y;
    const s = Math.sin(phase);
    for (const L of legs) {
      const sw = s * L.s, swing = -sw * 0.75 * amp;
      let tx = swing - crouch * 1.25 * (1 - prone), kx = Math.max(0, Math.sin(phase * L.s + 1.2)) * 1.1 * amp + crouch * 1.75 * (1 - prone);
      if (air) { tx = -0.65; kx = 1.1; }
      L.thigh.rotation.x = damp(L.thigh.rotation.x, tx, 18, dt); L.knee.rotation.x = damp(L.knee.rotation.x, kx, 18, dt);
      L.thigh.rotation.z = damp(L.thigh.rotation.z, prone * L.s * 0.18, 8, dt);
    }
    // 상체: 시점 상하 · 질주 시 앞으로 숙임 · 기울이기
    const pitch = ps.pitch + (ps.recP || 0);
    spine.rotation.x = damp(spine.rotation.x, (ps.sprint ? 0.25 : 0.06) + crouch * 0.22 * (1 - prone) - pitch * 0.4 * (1 - prone) + (air ? 0.2 : 0), 12, dt);
    spine.rotation.z = damp(spine.rotation.z, ps.lean * 0.38, 12, dt);
    hips.position.x = -ps.lean * 0.12;
    hips.position.y += Math.abs(Math.cos(phase)) * 0.035 * amp;
    headG.rotation.x = -pitch * 0.3 * (1 - prone) - prone * 1.0;
    // 팔: 조준(두 손) ↔ 낮춘 자세 ↔ 질주 흔들기
    const rise = (gs.rise || 0) * 0.12;
    const aimSh = -Math.PI / 2 - pitch * 0.6 * (1 - prone) - rise - prone * Math.PI / 2 + prone * 0.15;
    const lowSh = -0.55, runSh = s * 0.9;
    for (const A of arms) {
      const right = A.s < 0;
      let shx = ps.sprint ? (right ? -runSh : runSh) * amp : ZK.lerp(lowSh, aimSh, aim);
      let elx = ps.sprint ? -0.9 : ZK.lerp(-0.55, right ? -0.05 : -0.45, aim);
      let shz = ps.sprint ? A.s * 0.08 : ZK.lerp(A.s * 0.05, right ? 0.12 : -0.55, aim);
      if (gs.reloading) { shx = -1.2; elx = right ? -0.9 : -1.4; shz = right ? 0.3 : -0.4; }
      A.sh.rotation.x = damp(A.sh.rotation.x, shx, 20, dt); A.el.rotation.x = damp(A.el.rotation.x, elx, 20, dt);
      A.sh.rotation.z = damp(A.sh.rotation.z, shz, 14, dt);
    }
    // 총구 화염
    const on = gs.flashT > 0; flash.visible = on && root.visible;
    if (on) { flash.scale.setScalar(ZK.rand(0.35, 0.55)); flash.material.rotation = ZK.rand(0, 6.28); }
  };
  ZK.char = C;
})();
