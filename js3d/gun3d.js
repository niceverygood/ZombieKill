// 리볼버 뷰모델 (별도 씬에 렌더 → 벽에 파묻히지 않음)
// 반동 스프링(뒤로 밀림 + 총구 들림) · 이동 흔들림 · 마우스 스웨이 · 질주/정조준 자세 · 해머 · 실린더 회전 · 스피드로더 장전 · 총구 화염
(function () {
  const T = THREE, { rand, clamp, damp } = ZK;
  const G = {};
  const FIRE_INTERVAL = 0.28;
  const RELOAD = [[0, 'out'], [0.32, 'eject'], [0.72, 'load'], [1.0, 'in'], [1.28, 'done']];
  const st = G.state = { ammo: 6, cd: 0, reloading: false, rt: 0, ev: 0, spent: 0, auto: -1,
    kick: 0, kickV: 0, rise: 0, riseV: 0, roll: 0, rollV: 0, hammer: 1, cyl: 0, cylT: 0, spin: 0,
    flashT: 0, pose: 0, sprint: 0, ads: 0, bob: 0, swayX: 0, swayY: 0,
    // 6발 리듬: ch=이번 실린더 결과('head'|'body'|'miss') · hot=달군 탄 남은 발 · fastRel=클린 보상 빠른 장전 · steady=탁 닫기 보상(다음 첫 발 퍼짐 절반)
    ch: [], streak: 0, hot: 0, fastRel: false, steady: false, cleanT: 0, slamT: 0, slamTxt: '', stat: { cyl: 0, clean: 0, perfect: 0, slam: 0, jam: 0 } };
  let scene, cam, mainCam, vm, cylG, cylPivot, hammer, flash, flashLight, sleeve, sg, brk, sgFlash;
  // 두 번째 무기: 수평 쌍대 산탄총 (2발 · 8알 · 꺾어서 장전). 산탄은 ZK.needs.inv.shell에서 꺼내 쓴다
  const sgs = G.sg = { loaded: 0, reloading: false, rt: 0, ev: 0 };
  G.weapon = 'revolver'; G.hasShotgun = false;
  const HIP = new T.Vector3(0.15, -0.15, -0.4), ADS = new T.Vector3(0, -0.047, -0.25);
  const SPR = new T.Vector3(0.12, -0.2, -0.3), REL = new T.Vector3(0.06, -0.12, -0.3);

  G.init = function (mainCamera) {
    mainCam = mainCamera;
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 5);
    scene.add(new T.AmbientLight(0x6a7090, 0.65));
    const key = new T.DirectionalLight(0xffe2c0, 0.9); key.position.set(0.5, 1, 0.6); scene.add(key);
    const rim = new T.DirectionalLight(0x6a8aff, 0.5); rim.position.set(-1, 0.3, -0.5); scene.add(rim);
    flashLight = new T.PointLight(0xffb060, 0, 1.2, 2); scene.add(flashLight);

    const metal = new T.MeshPhongMaterial({ color: 0x2c3036, specular: 0x9aa4b4, shininess: 70 });
    const dark = new T.MeshPhongMaterial({ color: 0x1a1c20, specular: 0x555a66, shininess: 50 });
    const wood = new T.MeshLambertMaterial({ color: 0x6b3f22 }), skin = new T.MeshLambertMaterial({ color: 0xc48a66 });
    const box = (w, h, d, mat, x, y, z, parent = vm) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
    vm = new T.Group(); scene.add(vm);
    box(0.046, 0.06, 0.1, metal, 0, 0, 0);                                    // 프레임
    box(0.024, 0.03, 0.15, metal, 0, 0.014, -0.135);                          // 총열
    box(0.014, 0.008, 0.15, dark, 0, 0.032, -0.135);                          // 상단 리브
    box(0.018, 0.016, 0.1, dark, 0, -0.006, -0.11);                           // 이젝터 하우징
    box(0.006, 0.014, 0.01, dark, 0, 0.042, -0.205);                          // 가늠쇠
    box(0.016, 0.01, 0.012, dark, 0, 0.036, 0.036);                           // 가늠자
    const grip = box(0.036, 0.1, 0.046, wood, 0, -0.07, 0.04); grip.rotation.x = 0.28;
    const guard = new T.Mesh(new T.TorusGeometry(0.019, 0.0035, 6, 14, Math.PI), dark); guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, -0.03, -0.005); vm.add(guard);
    hammer = new T.Group(); hammer.position.set(0, 0.026, 0.05); vm.add(hammer);
    box(0.012, 0.03, 0.012, dark, 0, 0.012, 0.006, hammer);
    // 실린더: 피벗(크레인) → 실린더 그룹(회전)
    cylPivot = new T.Group(); cylPivot.position.set(-0.02, -0.01, -0.04); vm.add(cylPivot);
    cylG = new T.Group(); cylG.position.set(0.02, 0.018, 0); cylPivot.add(cylG);
    const cyl = new T.Mesh(new T.CylinderGeometry(0.027, 0.027, 0.052, 18), metal); cyl.rotation.x = Math.PI / 2; cylG.add(cyl);
    for (let i = 0; i < 6; i++) { // 플루트 홈 + 약실 뒤 탄두
      const a = (i / 6) * Math.PI * 2, fl = box(0.006, 0.006, 0.05, dark, Math.cos(a + 0.52) * 0.026, Math.sin(a + 0.52) * 0.026, 0, cylG);
      fl.rotation.z = a;
      const rd = new T.Mesh(new T.CylinderGeometry(0.0055, 0.0055, 0.004, 8), new T.MeshPhongMaterial({ color: 0xc9952f, specular: 0xffe0a0, shininess: 60 }));
      rd.rotation.x = Math.PI / 2; rd.position.set(Math.cos(a) * 0.016, Math.sin(a) * 0.016, 0.027); cylG.add(rd); rd.userData.round = i;
    }
    // 손 + 소매
    box(0.062, 0.085, 0.07, skin, 0.004, -0.07, 0.045).rotation.x = 0.28;
    box(0.05, 0.02, 0.04, skin, -0.012, 0.0, 0.03);                           // 엄지
    sleeve = new T.Mesh(new T.CylinderGeometry(0.042, 0.05, 0.36, 12), new T.MeshLambertMaterial({ color: 0x2b3039 }));
    sleeve.rotation.x = 1.15; sleeve.position.set(0.012, -0.15, 0.2); vm.add(sleeve);
    // 총구 화염 스프라이트
    const fc = document.createElement('canvas'); fc.width = fc.height = 128; const g = fc.getContext('2d');
    g.translate(64, 64); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) { g.rotate(Math.PI * 2 / 9 + rand(-0.1, 0.1)); const L = rand(34, 62);
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(L, 0); g.lineTo(0, 7); g.fill(); }
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 30); rg.addColorStop(0, 'rgba(255,255,240,1)'); rg.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = rg; g.fillRect(-64, -64, 128, 128);
    flash = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(fc), transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false }));
    flash.position.set(0, 0.014, -0.25); flash.visible = false; vm.add(flash);
    // 산탄총 모델: 몸통 + 꺾이는 총열 묶음(brk) + 개머리 손잡이
    sg = new T.Group(); scene.add(sg); sg.visible = false;
    box(0.054, 0.05, 0.1, metal, 0, 0, 0, sg);
    brk = new T.Group(); brk.position.set(0, 0.006, -0.045); sg.add(brk);
    for (const x of [-0.0145, 0.0145]) { const b = new T.Mesh(new T.CylinderGeometry(0.0145, 0.0145, 0.32, 12), metal); b.rotation.x = Math.PI / 2; b.position.set(x, 0.008, -0.16); brk.add(b);
      const bore = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, 0.002, 10), new T.MeshBasicMaterial({ color: 0x050505 })); bore.rotation.x = Math.PI / 2; bore.position.set(x, 0.008, -0.321); brk.add(bore); }
    box(0.05, 0.022, 0.13, wood, 0, -0.014, -0.11, brk);
    box(0.012, 0.008, 0.012, dark, 0, 0.028, -0.31, brk);
    const sgGrip = box(0.04, 0.1, 0.05, wood, 0, -0.07, 0.05, sg); sgGrip.rotation.x = 0.35;
    box(0.044, 0.05, 0.09, wood, 0, -0.03, 0.12, sg);
    box(0.062, 0.085, 0.07, skin, 0.004, -0.07, 0.05, sg).rotation.x = 0.3;
    box(0.055, 0.03, 0.06, skin, 0, -0.03, -0.12, brk);   // 앞손
    sgFlash = new T.Sprite(flash.material.clone()); sgFlash.position.set(0, 0.014, -0.4); sgFlash.visible = false; sg.add(sgFlash);
  };
  G.resize = (w, h) => { cam.aspect = w / h; cam.updateProjectionMatrix(); };
  G.cap = 6;   // 실린더 장탄 수 (계약 '외로운 총잡이'면 7)
  G.setCap = n => { const old = G.cap; G.cap = n; if (!st.reloading && st.ch.length < old) st.ammo = Math.min(n, st.ammo + (n > old ? 1 : 0)); };   // 이미 판정이 끝난 실린더엔 덤 1발을 주지 않는다(같은 실린더 두 번 판정 방지)
  G.reset = () => { G.cap = 6; Object.assign(st, { ammo: 6, cd: 0, reloading: false, auto: -1, spent: 0, ev: 0, pose: 0, ch: [], streak: 0, hot: 0, fastRel: false, steady: false, cleanT: 0, slamT: 0, stat: { cyl: 0, clean: 0, perfect: 0, slam: 0, jam: 0 } }); Object.assign(sgs, { loaded: 0, reloading: false, rt: 0, ev: 0 });
    G.weapon = 'revolver'; G.hasShotgun = false; if (vm) { vm.visible = true; sg.visible = false; } };
  G.giveShotgun = () => { G.hasShotgun = true; sgs.loaded = 2; };
  // ── 6발 리듬: 리볼버 한 발의 결과를 실린더에 기록 → 6발째에 판정 ──
  // 클린(6/6 명중): 장전 1.28 → 0.70초 · 실린더가 저절로 돎 · 사수 집중 사격 4초 / 퍼펙트(6/6 헤드샷): 다음 6발 '달군 탄'
  G.mark = function (res) {
    if (st.ch.length >= G.cap) return null;
    st.ch.push(res);
    if (res === 'miss') { st.streak = 0; ZK.audio.missThud && ZK.audio.missThud(); }
    else { ZK.audio.hitPing && ZK.audio.hitPing(Math.min(5, st.streak)); st.streak++; }
    if (st.ch.length < G.cap) return null;
    st.stat.cyl++;
    const hits = st.ch.filter(r => r !== 'miss').length, heads = st.ch.filter(r => r === 'head').length;
    if (hits < G.cap) return null;
    st.stat.clean++; st.fastRel = true; st.spin = 14; st.cleanT = 1.6; ZK.audio.clean && ZK.audio.clean();
    if (ZK.fort && ZK.fort.state.gunners.length) ZK.fort.state.rally = Math.max(ZK.fort.state.rally || 0, 4);   // 사수가 있을 때만
    if (heads === G.cap) { st.stat.perfect++; st.hot = G.cap; return 'perfect'; }
    return 'clean';
  };
  G.takeHot = () => { if (G.weapon !== 'revolver' || st.hot <= 0) return false; st.hot--; return true; };
  G.takeSteady = () => { if (!st.steady) return false; st.steady = false; return true; };
  // 탁 닫기: 장전 중 0.84~1.00초에 R → 바로 닫힘(약 30% 단축) + 다음 첫 발 퍼짐 절반 / 0.32~0.84초에 누르면 걸림 +0.3초
  // 피로 70 이상이면 성공 구간이 0.90~1.00초로 좁아진다
  function slam() {
    const tired = ZK.needs && ZK.needs.s && ZK.needs.s.fatigue >= 70, lo = tired ? 0.9 : 0.84;
    if (!st.jammed && st.rt >= lo && st.rt < 1.0 && st.ev <= 3) {   // 한 번 걸리면 이번 장전엔 탁 닫기 없음 (연타로 공짜 슬램 방지)
      while (st.ev < RELOAD.length) reloadEvent(RELOAD[st.ev++][1]);
      st.steady = true; st.stat.slam++; st.slamT = 0.7; st.slamTxt = '탁!'; ZK.audio.slam && ZK.audio.slam(); st.kickV += 1.2; return 'slam';
    }
    if (st.rt >= 0.32 && st.rt < lo && !st.jammed) { st.rt -= 0.3; st.jammed = true; st.stat.jam++; st.slamT = 0.7; st.slamTxt = '걸림'; ZK.audio.jam && ZK.audio.jam(); return 'jam'; }
    return null;
  }
  G.slamWindow = () => [ZK.needs && ZK.needs.s && ZK.needs.s.fatigue >= 70 ? 0.9 : 0.84, 1.0];
  // 1·2번 키로 바꿈 (0.35초 동안 못 쏨)
  G.switchTo = function (w) {
    if (w === G.weapon || (w === 'shotgun' && !G.hasShotgun)) return false;
    G.weapon = w; st.cd = 0.35; st.reloading = false; sgs.reloading = false; vm.visible = w === 'revolver'; sg.visible = w === 'shotgun';
    st.riseV -= 6; ZK.audio.cylIn && ZK.audio.cylIn();
    if (w === 'revolver' && st.ammo === 0) st.auto = 0.35;   // 빈 리볼버로 바꾸면 곧 장전 (탄 0인 채 멈추던 문제)
    return true;
  };
  G.shells = () => (ZK.needs && ZK.needs.inv ? ZK.needs.inv.shell || 0 : 0);
  function sgReload() {
    if (sgs.reloading || sgs.loaded >= 2 || G.shells() <= 0) return;
    sgs.reloading = true; sgs.rt = 0; sgs.ev = 0;
  }

  // 총구 월드 좌표 (트레이서·연기 시작점)
  G.muzzleWorld = function () {
    if (ZK.player.state.mode === 'tpp' && ZK.char) return ZK.char.muzzleWorld();   // 3인칭: 캐릭터 손의 총구
    const a = st.ads; return mainCam.localToWorld(new T.Vector3(ZK.lerp(0.15, 0, a), ZK.lerp(-0.12, -0.035, a), -0.55));
  };
  G.canFire = () => !st.reloading && st.cd <= 0 && st.sprint < 0.3;

  G.fire = function () {
    if (G.weapon === 'shotgun') {
      if (sgs.reloading || st.cd > 0 || st.sprint >= 0.3) return false;
      if (sgs.loaded <= 0) { ZK.audio.dry(); st.cd = 0.25; sgReload(); return false; }
      sgs.loaded--; st.cd = 0.3; st.kickV += 7.5; st.riseV += 84; st.rollV += rand(-18, 18); st.flashT = 0.08;
      sgFlash.material.rotation = rand(0, 6.283); sgFlash.scale.setScalar(rand(0.36, 0.46));
      ZK.audio.shot(); ZK.audio.thud();
      if (sgs.loaded === 0) st.auto = 0.35;
      return 'shotgun';
    }
    if (st.reloading || st.cd > 0 || st.sprint >= 0.3) return false;
    if (st.ammo <= 0) { ZK.audio.dry(); st.cd = 0.25; st.hammer = 0; st.riseV += 3; G.reload(); return false; }
    st.ammo--; st.spent++; st.cd = FIRE_INTERVAL / (ZK.surv ? ZK.surv.stats.rateMul : 1);
    const adsK = 1 - st.ads * 0.45;
    // 손맛: 예전(2.4 · 30 · ±6)보다 뒤로 1.6배 · 총구 들림 1.5배 · 비틀림 2배 → 매그넘처럼 '쾅' 튀었다가 스프링으로 복귀
    st.kickV += 3.8 * adsK; st.riseV += 45 * adsK; st.rollV += rand(-12, 12) + (Math.random() < 0.5 ? -4 : 4);
    st.hammer = 0; st.cylT += 1; st.flashT = 0.06;
    flash.material.rotation = rand(0, 6.283); flash.scale.setScalar(rand(0.18, 0.25));
    ZK.audio.shot();
    if (st.ammo === 0) st.auto = 0.4;
    return true;
  };
  G.reload = function () {
    if (G.weapon === 'shotgun') return sgReload();
    if (st.reloading) return slam();
    if (st.ammo >= G.cap) return;
    st.jammed = false;   // 기록(ch)은 장전이 끝날 때 비운다 → 장전하는 동안 이번 실린더 결과가 HUD에 남음 · 6발 전에 장전하면 판정 없이 버려짐
    st.reloading = true; st.rt = 0; st.ev = 0; st.auto = -1;
  };
  function reloadEvent(e) {
    if (e === 'out') ZK.audio.cylOut();
    else if (e === 'eject') {
      const p = ZK.player.state.mode === 'tpp' && ZK.char ? ZK.char.handWorld() : mainCam.localToWorld(new T.Vector3(0.1, -0.15, -0.35));
      for (let i = 0; i < st.spent; i++) {
        const v = new T.Vector3(rand(-0.6, 0.6), rand(-0.5, 0.6), rand(-0.6, 0.6)).applyQuaternion(mainCam.quaternion);
        ZK.fx3.casing(p.clone().add(new T.Vector3(rand(-0.02, 0.02), 0, rand(-0.02, 0.02))), v);
      }
      st.spent = 0; st.riseV -= 4;
      cylG.children.forEach(c => { if (c.userData.round != null) c.visible = false; });
    } else if (e === 'load') { ZK.audio.speedload(); st.riseV += 2; cylG.children.forEach(c => { if (c.userData.round != null) c.visible = true; }); }
    else if (e === 'in') { ZK.audio.cylIn(); st.kickV += 0.6; st.spin = 9; }
    else if (e === 'done') { st.ammo = G.cap; st.reloading = false; st.cylT = Math.round(st.cylT); st.fastRel = false; st.ch = []; st.streak = 0; }
  }

  // ctx: { ads(0~1 목표), sprint(bool), move(0~1), air(bool), mdx, mdy }
  G.update = function (dt, ctx) {
    st.cd -= dt; st.flashT -= dt;
    if (st.auto > 0 && (st.auto -= dt) <= 0) G.reload();
    st.kickV += (-420 * st.kick - 28 * st.kickV) * dt; st.kick += st.kickV * dt;
    st.riseV += (-260 * st.rise - 20 * st.riseV) * dt; st.rise += st.riseV * dt;
    st.rollV += (-200 * st.roll - 16 * st.rollV) * dt; st.roll += st.rollV * dt;
    if (st.cd < FIRE_INTERVAL - 0.08) st.hammer = Math.min(1, st.hammer + dt * 7);
    st.cyl = damp(st.cyl, st.cylT, 20, dt); st.spin *= Math.exp(-dt * 3);
    if (sgs.reloading) {   // 산탄총: 꺾고(0.25) → 넣고(0.7) → 닫기(1.05)
      sgs.rt += dt * (ZK.needs ? ZK.needs.reloadK() : 1);
      if (sgs.ev === 0 && sgs.rt >= 0.25) { sgs.ev = 1; ZK.audio.cylOut(); }
      if (sgs.ev === 1 && sgs.rt >= 0.7) { sgs.ev = 2; ZK.audio.speedload(); }
      if (sgs.ev === 2 && sgs.rt >= 1.05) { const take = Math.min(2 - sgs.loaded, G.shells()); ZK.needs.inv.shell -= take; sgs.loaded += take; sgs.reloading = false; ZK.audio.cylIn(); st.kickV += 0.8; }
    }
    st.cleanT -= dt; st.slamT -= dt;
    if (st.reloading) { st.rt += dt * (ZK.surv ? ZK.surv.stats.reloadMul : 1) * (ZK.needs ? ZK.needs.reloadK() : 1) * (st.fastRel ? 1.83 : 1);   // 허기: 장전 느려짐 · 클린: 1.83배 빠름
      while (st.ev < RELOAD.length && st.rt >= RELOAD[st.ev][0]) reloadEvent(RELOAD[st.ev++][1]); }
    st.pose = damp(st.pose, st.reloading ? 1 : 0, 12, dt);
    st.sprint = damp(st.sprint, ctx.sprint && !st.reloading ? 1 : 0, 10, dt);
    st.ads = damp(st.ads, ctx.ads && !st.reloading && st.sprint < 0.5 ? 1 : 0, 14, dt);
    st.bob += dt * (ctx.air ? 0 : ctx.move * (ctx.sprint ? 13 : 9));
    st.swayX = damp(st.swayX, clamp(-ctx.mdx * 0.0009, -0.05, 0.05), 10, dt);
    st.swayY = damp(st.swayY, clamp(ctx.mdy * 0.0009, -0.05, 0.05), 10, dt);

    // 자세 블렌딩: 지향사격 → 정조준 → 질주 → 장전
    const p = HIP.clone().lerp(ADS, st.ads).lerp(SPR, st.sprint).lerp(REL, st.pose);
    const bobAmp = ctx.move * (1 - st.ads * 0.85) * (ctx.sprint ? 1.8 : 1);
    p.x += Math.sin(st.bob) * 0.011 * bobAmp + st.swayX;
    p.y += -Math.abs(Math.cos(st.bob)) * 0.009 * bobAmp + st.swayY + (ctx.air ? 0.015 : 0);
    p.z += st.kick * 0.06; p.y -= st.kick * 0.012;   // 뒤로 밀리며 손목이 살짝 꺾여 내려감
    const act = G.weapon === 'shotgun' ? sg : vm, rel = G.weapon === 'shotgun' ? (sgs.reloading ? 1 : 0) : st.pose;
    if (G.weapon === 'shotgun') { p.lerp(REL, rel * 0.6); brk.rotation.x = damp(brk.rotation.x, sgs.reloading && sgs.rt < 0.95 ? 0.55 : 0, 14, dt); }
    act.position.copy(p);
    act.rotation.set(st.rise * 0.16 + st.sprint * -0.45 + st.pose * 0.25 + st.swayY * 2,
      st.sprint * 0.7 + st.swayX * 3 + st.ads * 0.0, st.roll * 0.05 + st.sprint * 0.35 + st.pose * 0.95 + Math.sin(st.bob) * 0.02 * bobAmp);
    hammer.rotation.x = -0.9 * st.hammer;
    cylG.rotation.z = -(st.cyl + st.spin) * (Math.PI / 3);
    cylPivot.rotation.z = st.pose * 0.9; cylPivot.position.x = -0.02 - st.pose * 0.02;
    const on = st.flashT > 0; flash.visible = on && G.weapon === 'revolver'; sgFlash.visible = on && G.weapon === 'shotgun'; flashLight.intensity = on ? 6 : 0; flashLight.position.set(act.position.x, act.position.y + 0.02, act.position.z - 0.25);
    sleeve.visible = st.ads < 0.98;
  };
  G.render = function (renderer) { renderer.clearDepth(); renderer.render(scene, cam); };
  ZK.gun3 = G;
})();
