// 이동 요새(장갑 버스): 운전(관성·회전) · 건물 충돌 · 좀비 들이받기/밀어내기 · 폐차 흡수 → 장갑판이 붙으며 커짐
// 생존자 사수(자동 사격) · 카드로 얻는 자동 무기(지붕 포탑 · 화염 고리 · 전기 울타리) · 전조등
(function () {
  const T = THREE, { rand, clamp, damp } = ZK;
  const F = {};
  let scene, root, body, cannon, headlight, beaconM, plow, hullM, hlK = 1;   // hullM·hlK: 버스 탈출(bail3d)이 차체 색·전조등을 되돌린다
  const st = F.state = { pos: new T.Vector3(0, 0, 0), heading: 0, speed: 0, hp: 300, maxHp: 300, size: 1, sizeV: 1, modules: 0,
    gunners: [], halfW: 1.4, halfL: 3.8, deckY: 2.11, crashCd: 0, cannonT: 0, flameT: 0, shockT: 0, slot: 0 };
  const BASE = { halfW: 1.4, halfL: 3.8, deckY: 2.11 };
  const SLOTS = [];   // 장갑판 붙일 자리 (로컬)
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) SLOTS.push([s * 1.43, rand(0.8, 1.5), -2.6 + i * 1.05, s]);
  for (let i = 0; i < 5; i++) for (const z of [-3.85, 3.85]) SLOTS.push([-1.1 + i * 0.55, rand(0.7, 1.6), z, 0]);
  const GSLOTS = [[-1.05, -2.6], [1.05, -2.6], [-1.05, 2.6], [1.05, 2.6], [-1.05, 0], [1.05, 0]];
  const _v = new T.Vector3(), _w = new T.Vector3();

  const mat = c => new T.MeshLambertMaterial({ color: c });
  function box(w, h, d, m, x, y, z, parent = body) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; }

  F.init = function (sc) {
    scene = sc; root = new T.Group(); scene.add(root); body = new T.Group(); root.add(body);
    hullM = mat(0x4a5040); const dark = mat(0x111214), plate = mat(0x3a3e36), rust = mat(0x6a4a2a);
    box(2.8, 1.6, 7.6, hullM, 0, 1.25, 0);                                       // 차체
    for (const s of [-1, 1]) box(0.04, 0.42, 6.4, dark, s * 1.41, 1.62, -0.1);       // 창문(철판으로 막음)
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) box(0.06, 0.5, 1.4, plate, s * 1.43, 1.05, -2.6 + i * 1.75);
    box(2.5, 0.5, 0.05, dark, 0, 1.7, -3.81);                                      // 앞유리
    box(2.6, 0.12, 6.8, rust, 0, 2.11, 0);                                         // 지붕 갑판
    for (const s of [-1, 1]) { box(0.06, 0.5, 6.8, plate, s * 1.3, 2.4, 0); }       // 난간
    box(2.6, 0.5, 0.06, plate, 0, 2.4, 3.4); box(2.6, 0.3, 0.06, plate, 0, 2.3, -3.4);
    plow = box(3.0, 1.1, 0.35, mat(0x5a5a52), 0, 0.75, -4.0); plow.rotation.x = -0.35;   // 충각(쟁기)
    for (const [x, z] of [[-1.45, -2.6], [1.45, -2.6], [-1.45, 2.6], [1.45, 2.6], [-1.45, 1.3], [1.45, 1.3]]) {
      const w = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.36, 14), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); body.add(w);
    }
    for (const s of [-0.85, 0.85]) {
      box(0.32, 0.18, 0.05, new T.MeshBasicMaterial({ color: 0xfff2c8 }), s, 1.05, -3.83);
      box(0.3, 0.16, 0.05, new T.MeshBasicMaterial({ color: 0xaa1010 }), s, 1.05, 3.83);
    }
    // ── 앞뒤 구분 (지붕에서 보면 앞뒤가 비슷해 '어디가 앞인지 모르겠다'는 피드백) ──
    // 앞: 갑판에 노란 화살표 3개 · 앞 난간 노랑-검정 줄무늬 · 전조등 빛줄기 / 뒤: 지붕 양 끝 빨간 경광등(깜빡임)
    const yellow = new T.MeshBasicMaterial({ color: 0xffc81a, side: T.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const sh = new T.Shape(); sh.moveTo(0, 0.42); sh.lineTo(0.68, -0.16); sh.lineTo(0.42, -0.16); sh.lineTo(0, 0.2); sh.lineTo(-0.42, -0.16); sh.lineTo(-0.68, -0.16); sh.closePath();
      const m = new T.Mesh(new T.ShapeGeometry(sh), yellow); m.rotation.x = -Math.PI / 2; m.position.set(0, 2.18, -0.9 - i * 0.72); body.add(m);
    }
    for (let i = 0; i < 6; i++) box(0.2, 0.32, 0.07, yellow, -1.1 + i * 0.44, 2.3, -3.4);
    beaconM = new T.MeshBasicMaterial({ color: 0xff2a1a });
    for (const s of [-1, 1]) { box(0.08, 0.36, 0.08, dark, s * 1.15, 2.6, 3.4); box(0.22, 0.2, 0.22, beaconM, s * 1.15, 2.86, 3.4); }
    const beamM = new T.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.07, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    for (const s of [-0.85, 0.85]) { const cone = new T.Mesh(new T.ConeGeometry(2.4, 14, 16, 1, true), beamM); cone.rotation.x = Math.PI / 2 - 0.05; cone.position.set(s, 0.95, -3.9 - 7); body.add(cone); }
    headlight = new T.SpotLight(0xfff0d0, 2.4, 45, 0.55, 0.55, 1.2); headlight.position.set(0, 1.4, -3.9); root.add(headlight);
    const tgt = new T.Object3D(); tgt.position.set(0, 0, -20); root.add(tgt); headlight.target = tgt;
    // 지붕 포탑 (카드로 해금)
    cannon = new T.Group(); cannon.position.set(0, 2.17, -2.4); body.add(cannon); cannon.visible = false;
    box(0.7, 0.35, 0.7, plate, 0, 0.17, 0, cannon); box(0.14, 0.14, 1.0, dark, 0, 0.32, -0.55, cannon);
    F.reset();
  };
  F.reset = function () {
    Object.assign(st, { heading: 0, speed: 0, hp: 300, maxHp: 300, size: 1, sizeV: 1, modules: 0, crashCd: 0, slot: 0, rally: 0, clingers: 0, looked: false, drift: 0, velH: undefined, nitroT: 0 });
    st.pos.set(0, 0, 6); hlK = 1; if (headlight) headlight.intensity = 2.4;
    st.size0 = 1; if (body) body.visible = true; if (hullM) hullM.color.setHex(0x4a5040);   // 버스 탈출로 바뀐 차체를 되돌린다
    for (const g of st.gunners) body.remove(g.mesh); st.gunners = [];
    body.children.filter(o => o.userData.module || o.userData.trophy).forEach(o => body.remove(o));
    if (plow) plow.material.color.setHex(0x5a5a52);
    cannon.visible = false;
  };
  F.forward = () => _v.set(-Math.sin(st.heading), 0, -Math.cos(st.heading)).clone();
  F.local = function (p) { // 월드 → 요새 로컬 (lx: 오른쪽+, lz: 뒤쪽+)
    const dx = p.x - st.pos.x, dz = p.z - st.pos.z, c = Math.cos(st.heading), s = Math.sin(st.heading);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  };
  F.toWorld = function (lx, ly, lz) { const c = Math.cos(st.heading), s = Math.sin(st.heading);
    return new T.Vector3(st.pos.x + (lx * c + lz * s) * st.size, ly * st.size, st.pos.z + (-lx * s + lz * c) * st.size); };
  F.deckPoint = () => F.toWorld(0, BASE.deckY + 0.06, 0.6);
  // 매달린 좀비 자리 (2026-11-09 수정): 옆 난간 꼭대기(2.65)에 허리가 걸치게 → 상체·머리가 늘 난간 위로 보인다.
  // 예전엔 높이까지 버스 배율로 키워서, 장갑판 7장쯤부터 사람 크기 좀비가 지붕 갑판 아래로 통째로 숨었다("매달렸다는데 안 보이고 못 죽인다").
  // 바깥 0.14m·허리 높이는 m 단위 그대로 두고, 버스 쪽 기준점만 화면의 차체 배율(sizeV)을 따른다.
  F.clingPoint = function (c) {
    const s = st.sizeV, co = Math.cos(st.heading), si = Math.sin(st.heading), lx = c.side * (BASE.halfW * s + 0.14), lz = c.lz * s;
    return new T.Vector3(st.pos.x + lx * co + lz * si, 2.65 * s - 0.9, st.pos.z - lx * si + lz * co);
  };
  F.sidePoint = function () {
    for (const s of [1, -1]) { const p = F.toWorld(s * (BASE.halfW + 1.3), 0, 0); if (ZK.world.freeSpot(p.x, p.z, 0.5)) return p; }
    return F.toWorld(0, 0, BASE.halfL + 1.5);
  };
  // 요새 표면에서 가장 가까운 점 (좀비가 달라붙을 위치)
  F.nearestPoint = function (p) {
    const L = F.local(p), lx = clamp(L.lx, -st.halfW, st.halfW), lz = clamp(L.lz, -st.halfL, st.halfL);
    const c = Math.cos(st.heading), s = Math.sin(st.heading);
    return { x: st.pos.x + lx * c + lz * s, z: st.pos.z - lx * s + lz * c };
  };
  F.hurt = function (dmg, raw) {   // raw: 장갑 무시 (직분사 부스트가 스스로 태우는 체력)
    const armor = raw ? 1 : 1 - Math.min(0.5, (ZK.surv ? ZK.surv.stats.armor : 0) * 0.08);
    st.hp = Math.max(0, st.hp - dmg * armor);
  };

  // 폐차 흡수 → 장갑판 + 크기·체력 증가
  F.grow = function (color = 0x5a5a5a) {
    st.modules++; st.size = Math.min(1.9, (st.size0 || 1) + st.modules * 0.055);   // size0: 버스 탈출로 시동 건 작은 차는 0.82부터
    st.maxHp += 30; st.hp = Math.min(st.maxHp, st.hp + 15);   // 흡수 회복 45 → 15 (회복이 피해를 앞질러 위기가 없던 문제)
    const sl = SLOTS[st.slot++ % SLOTS.length], layer = Math.floor((st.slot - 1) / SLOTS.length);
    const m = mat(new T.Color(color).multiplyScalar(0.8).getHex());
    const p = sl[3] !== 0 ? box(0.12 + layer * 0.06, rand(0.5, 0.9), rand(1.0, 1.5), m, sl[0] + sl[3] * (0.06 + layer * 0.1), sl[1], sl[2])
      : box(rand(0.5, 0.8), rand(0.5, 0.9), 0.12, m, sl[0], sl[1], sl[2] + Math.sign(sl[2]) * (0.06 + layer * 0.1));
    p.rotation.set(rand(-0.15, 0.15), rand(-0.1, 0.1), rand(-0.2, 0.2)); p.userData.module = true;
    if (st.modules % 3 === 0) { // 3개마다 지붕에 가시 장식
      const sp = new T.Mesh(new T.ConeGeometry(0.12, 0.5, 6), mat(0x8a8a80)); sp.position.set(rand(-1.2, 1.2), 2.4, rand(-3, 3)); sp.userData.module = true; body.add(sp);
    }
  };
  F.addGunner = function () {
    if (ZK.surv && ZK.surv.contract && ZK.surv.contract.has('lone')) { ZK.needs.give('can'); ZK.needs.give('water'); return false; }   // 외로운 총잡이: 생존자는 식량을 두고 간다
    if (st.gunners.length >= 4) { F.grow(); return false; }   // 사수는 최대 4명 (넘치면 장갑판으로)
    const [x, z] = GSLOTS[st.gunners.length], g = new T.Group(); g.position.set(x, 2.17, z); g.userData.module = true; body.add(g);
    box(0.32, 0.55, 0.22, mat(0x3a4a5a), 0, 0.5, 0, g);
    const hd = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), mat(0xc48a66)); hd.position.y = 0.92; g.add(hd);
    box(0.06, 0.06, 0.6, mat(0x1a1a1a), 0.12, 0.62, -0.3, g);
    st.gunners.push({ mesh: g, cd: rand(0, 0.8) });
    return true;
  };
  F.unlockCannon = () => { cannon.visible = true; };
  // ── 무리한 개조 계약 ──
  F.dropGunners = () => { const n = st.gunners.length; for (const q of st.gunners) body.remove(q.mesh); st.gunners.length = 0; return n; };   // 외로운 총잡이
  F.headlightK = k => { hlK = k; headlight.intensity = 2.4 * k; };   // 정전: 전조등 +30%
  // ── 버스 탈출(bail3d) ──
  // 숨기기: 몸체(body)만 숨기고 전조등은 세기만 0 — root를 숨기면 전조등 빛이 장면에서 빠져 모든 셰이더가 다시 컴파일된다(멈칫)
  F.setVisible = v => { body.visible = v; headlight.intensity = v ? 2.4 * hlK : 0; };
  // 시동 건 폐차가 새 요새: 장갑판·사수는 잃고 · 차 색 · 작은 차체(size0) — 폐차를 흡수하면 다시 커진다
  F.rebuild = function (x, z, heading, color, hp, size0 = 1) {
    Object.assign(st, { heading, speed: 0, hp, maxHp: hp, size0, size: size0, sizeV: size0, modules: 0, crashCd: 0, slot: 0, rally: 0, clingers: 0, drift: 0, velH: undefined, nitroT: 0 });
    st.pos.set(x, 0, z); for (const q of st.gunners) body.remove(q.mesh); st.gunners = [];
    body.children.filter(o => o.userData.module).forEach(o => body.remove(o));
    hullM.color.setHex(color); F.setVisible(true);
    root.position.copy(st.pos); root.rotation.y = heading; root.scale.setScalar(size0);
    st.halfW = BASE.halfW * size0; st.halfL = BASE.halfL * size0; st.deckY = BASE.deckY * size0;
  };
  // 계약마다 외형: 공통으로 옆구리에 빨강·검정 경고 띠 + 계약별 소품 (판이 다시 시작하면 trophy로 지워짐)
  F.contractLook = function (id) {
    const tag = o => { o.userData.trophy = true; body.add(o); return o; }, red = mat(0xc81e1e), blk = mat(0x111111);
    if (!st.looked) { st.looked = true; for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { const b = tag(new T.Mesh(new T.BoxGeometry(0.03, 0.18, 0.7), i % 2 ? blk : red)); b.position.set(s * 1.46, 1.92, -3.1 + i * 0.78); } }
    if (id === 'lone') { const r = tag(new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.08, 7), mat(0x2c3036))); r.position.set(0, 2.2, 1.6); }   // 지붕 위 큰 실린더 문장
    if (id === 'nobrake') { for (const s of [-0.85, 0.85]) { const b = tag(new T.Mesh(new T.BoxGeometry(0.32, 0.18, 0.06), blk)); b.position.set(s, 1.05, 3.86); } }   // 브레이크등을 떼어냄
    if (id === 'blackout') { const p = tag(new T.Mesh(new T.BoxGeometry(2.2, 0.2, 0.2), mat(0x3a3a3a))); p.position.set(0, 1.55, -3.9); for (const s of [-0.7, 0, 0.7]) { const l = tag(new T.Mesh(new T.BoxGeometry(0.4, 0.16, 0.06), new T.MeshBasicMaterial({ color: 0xfff6d8 }))); l.position.set(s, 1.55, -4.01); } }   // 보조등 막대
    if (id === 'nitro') for (const s of [-0.6, 0.6]) { const pipe = tag(new T.Mesh(new T.CylinderGeometry(0.12, 0.14, 0.7, 10), mat(0x8a8f96))); pipe.rotation.x = Math.PI / 2; pipe.position.set(s, 0.6, 4.05); }   // 배기관 2개
    if (id === 'blood') { const t = tag(new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 1.6, 12), mat(0x7a0a0a))); t.rotation.z = Math.PI / 2; t.position.set(0, 2.5, 2.6); }   // 지붕 핏빛 탱크
  };
  // 그릴 트로피: 들이받기 처치 15·40·80회째 — 앞 충각이 점점 검붉어지고, 40회째 팔·80회째 머리가 걸린다 (앞뒤 구분에도 도움)
  // 위험 도살자 처치 보상: 쟁기 앞에 거대한 식칼 (이번 판 들이받기 +40%는 missions3d가 준다)
  F.trophyKnife = function () {
    const k = new T.Group(); k.position.set(0.9, 1.35, -4.25); k.rotation.set(0.2, 0, -0.5); k.userData.trophy = true; body.add(k);
    const blade = new T.Mesh(new T.BoxGeometry(0.05, 1.1, 0.42), new T.MeshLambertMaterial({ color: 0xc8ccd0, emissive: 0x202224 })); blade.position.y = 0.55; k.add(blade);
    const edge = new T.Mesh(new T.BoxGeometry(0.052, 0.5, 0.1), new T.MeshLambertMaterial({ color: 0x6a0a0a })); edge.position.set(0, 0.7, 0.17); k.add(edge);
    const handle = new T.Mesh(new T.BoxGeometry(0.09, 0.4, 0.12), new T.MeshLambertMaterial({ color: 0x2a1a10 })); handle.position.y = -0.2; k.add(handle);
  };
  F.trophy = function (n) {
    if (n === 15 || n === 40 || n === 80) { plow.material.color.setHex(0x5a5a52).lerp(new T.Color(0x3a0806), n === 15 ? 0.35 : n === 40 ? 0.65 : 1); ZK.fx3.text(F.toWorld(0, 2.4, -4.2), `들이받기 ${n}`, '#c8a07a', 20, 0.8); }
    if (n === 40) { const a = box(0.12, 0.62, 0.12, mat(0x7d9a6a), 0.95, 1.0, -4.3); a.rotation.z = 1.1; a.userData.trophy = true; }
    if (n === 80) { const hd = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), mat(0x86a172)); hd.position.set(-0.85, 1.25, -4.32); hd.userData.trophy = true; body.add(hd); }
  };

  function nearestZombie(from, zombies, range) {
    let best = null, bd = range * range;
    for (const z of zombies) { if (!z.alive || z.state === 'cling' || z.retreat || z.sleep || z.indoor || (ZK.tower && ZK.tower.inFoot && ZK.tower.inFoot(z.pos))) continue; const d = z.pos.distanceToSquared(from);   /* 건물 안(타워 안 · z.indoor)은 벽 너머라 사수·포탑이 못 쏜다 — 입구에 버스를 대면 타워 1~8층 좀비 28마리가 2초 만에 벽 너머로 죽었다 (2026-11-10) */ if (d < bd) { bd = d; best = z; } }   // 매달린 좀비는 플레이어 몫 · 물러나는 무리(해일 고요)·잠든 무기고 경비는 쏘지 않는다(쏘면 깨거나 돌아온다)
    return best;
  }

  // input: { throttle(-1~1), steer(-1~1), boost, brake }
  F.update = function (dt, input, game) {
    const S = ZK.surv ? ZK.surv.stats : { engineMul: 1, ramMul: 1, gunnerMul: 1, cannonLv: 0, flameLv: 0, shockLv: 0, regen: 0 };
    st.sizeV = damp(st.sizeV, st.size, 3, dt); root.scale.setScalar(st.sizeV);
    st.halfW = BASE.halfW * st.sizeV; st.halfL = BASE.halfL * st.sizeV; st.deckY = BASE.deckY * st.sizeV;
    if (S.regen) st.hp = Math.min(st.maxHp, st.hp + S.regen * dt);
    // 운전
    const nd = ZK.needs, boost = input.boost && (!nd || nd.canBoost());   // 연료가 바닥나면 부스트 불가 · 최고 속도 35%
    st.boost = boost;   // 로드킬 '분쇄'(부스트 중일 때만)
    const C = ZK.surv && ZK.surv.contract, nobrake = !!C && C.has('nobrake');
    // 계약 '브레이크 철거': Space = 드리프트(회전 ×2, 떼고 나서 0.6초 미끄러짐) · 최고 속도 +25% · 브레이크 없음
    if (nobrake && input.brake && Math.abs(st.speed) > 2) st.drift = 0.6; else st.drift = Math.max(0, (st.drift || 0) - dt);
    const brake = input.brake && !nobrake;
    const maxF = 9 * S.engineMul * (boost ? 1.45 : 1) * (nobrake ? 1.25 : 1) * (nd ? nd.engineK() : 1) / Math.sqrt(st.sizeV), maxR = 4;
    const target = brake ? 0 : input.throttle > 0 ? input.throttle * maxF : input.throttle * maxR;
    const opposing = target !== 0 && Math.sign(target) !== Math.sign(st.speed) && Math.abs(st.speed) > 0.3;
    st.speed = damp(st.speed, target, brake ? 4.5 : opposing ? 3.2 : target === 0 ? 1.1 : 1.6, dt);
    const turnK = clamp(Math.abs(st.speed) / 3, 0.35, 1) * (st.speed < -0.2 ? -1 : 1);
    st.heading -= input.steer * 1.2 / Math.sqrt(st.sizeV) * turnK * dt * (st.drift > 0 ? 2 : 1);
    const fw = F.forward();
    // 드리프트: 차가 가는 방향(velH)이 차가 보는 방향을 늦게 따라가 옆으로 미끄러진다
    if (st.velH === undefined || !(st.drift > 0)) st.velH = st.heading;
    else { const dh = Math.atan2(Math.sin(st.heading - st.velH), Math.cos(st.heading - st.velH)); st.velH += dh * (1 - Math.exp(-2.2 * dt)); }
    const tv = st.drift > 0 ? new T.Vector3(-Math.sin(st.velH), 0, -Math.cos(st.velH)) : fw;   // 실제로 움직이는 방향 (드리프트 중엔 차가 보는 방향과 다르다)
    st.pos.addScaledVector(tv, st.speed * dt);
    // 실제 전진 부스트일 때만 (후진·관성 중 Shift는 아님): 직분사 체력 소모 · 불꽃 꼬리가 이걸 본다
    st.boostActive = boost && input.throttle > 0 && st.speed > 3;
    // 계약 '직분사 부스트': 부스트 중 버스 뒤 6m 불꽃 꼬리 (초당 40 = 0.25초마다 10)
    if (C && C.has('nitro') && st.boostActive) {
      if ((st.nitroT = (st.nitroT || 0) - dt) <= 0) { st.nitroT = 0.25;
        for (const z of game.zombies) { if (!z.alive || z.state === 'cling') continue; const L = F.local(z.pos); if (L.lz > st.halfL && L.lz < st.halfL + 6 && Math.abs(L.lx) < st.halfW + 0.6) game.fireHit(z, 10); } }
      for (const s of [-0.6, 0.6]) ZK.fx3.sparks(F.toWorld(s, 0.6, BASE.halfL + 0.5), fw.clone().negate().setY(0.15), 2);
    }
    // 폐차 흡수 (부딪히기 전에 먼저 판정): 차 충돌 박스와 요새 박스(+0.6m)가 겹치면 흡수
    // (예전엔 차 '중심점'만 봐서, 옆으로 세워진 차는 충돌 박스에 먼저 막혀 흡수 대신 충돌이 났다)
    const c0 = Math.cos(st.heading), s0 = Math.sin(st.heading);
    for (const c of ZK.world.cars) {
      if (!c.alive || Math.abs(st.speed) < 1) continue;
      if (Math.abs(c.pos.x - st.pos.x) > 14 || Math.abs(c.pos.z - st.pos.z) > 14) continue;
      const b = c.col, pad = 0.6;
      let touch = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [c.pos.x, c.pos.z]]
        .some(([x, z]) => { const L = F.local({ x, z }); return Math.abs(L.lx) < st.halfW + pad && Math.abs(L.lz) < st.halfL + pad; });
      if (!touch) for (const lz of [-1, -0.5, 0, 0.5, 1]) for (const lx of [-1, 0, 1]) {
        const wx = st.pos.x + lx * st.halfW * c0 + lz * st.halfL * s0, wz = st.pos.z - lx * st.halfW * s0 + lz * st.halfL * c0;
        if (wx > b.minX - pad && wx < b.maxX + pad && wz > b.minZ - pad && wz < b.maxZ + pad) touch = true;
      }
      if (touch) { ZK.world.removeCar(c); F.grow(c.color); game.onAbsorb('car', c.pos.clone()); }
    }
    // 건물·장애물 충돌: 앞·가운데·뒤 세 원으로 근사
    let cx = 0, cz = 0;
    for (const k of [-0.7, 0, 0.7]) {
      const p = new T.Vector3(st.pos.x - fw.x * k * st.halfL, 0, st.pos.z - fw.z * k * st.halfL), q = p.clone();
      ZK.world.collide(q, st.halfW + 0.1); const dx = q.x - p.x, dz = q.z - p.z;
      if (Math.abs(dx) > Math.abs(cx)) cx = dx; if (Math.abs(dz) > Math.abs(cz)) cz = dz;
    }
    st.pos.x += cx; st.pos.z += cz; st.crashCd -= dt;
    // 충돌: 튕겨 나오되, 피해는 '벽을 정면으로 박은 속도'(벽 법선 방향 성분)가 초속 5m 넘을 때만 · 쿨다운 1.5초
    // 벽을 비스듬히 긁고 지나가면 피해 없음 (예전엔 긁기도 정면 충돌과 같이 깎여, 초보 피해의 20~38%가 충돌이었다)
    const cl = Math.hypot(cx, cz);
    if (cl > 0.02 && Math.abs(st.speed) > 3) {
      const hit = Math.abs(st.speed), hitN = hit * Math.abs(tv.x * cx + tv.z * cz) / cl; st.speed *= -0.25;
      if (hit > 5 && st.crashCd <= 0) { st.crashCd = 1.5; if (hitN > 5) F.hurt((hitN - 4) * 3); game.onCrash(hit, hitN); }
    }
    root.position.copy(st.pos); root.rotation.y = st.heading;
    body.position.y = Math.sin(ZK.fx3.time * 21) * 0.012 * Math.min(1, Math.abs(st.speed) / 4);   // 엔진 진동
    body.rotation.z = damp(body.rotation.z, -input.steer * 0.04 * Math.min(1, Math.abs(st.speed) / 5), 6, dt);
    ZK.audio.engine && ZK.audio.engine(Math.abs(st.speed) / 9);
    beaconM.color.setHex(Math.sin(ZK.fx3.time * 7) > 0 ? 0xff2a1a : 0x3a0806);   // 뒤쪽 경광등 깜빡임

    // 좀비: 앞/뒤로 들이받기 · 옆/뒤에 닿으면 30%는 차체에 매달림(플레이어가 쏴야 떨어짐) · 나머지는 밀어내기
    // 매달린 수는 먼저 다 센다 (예전엔 세면서 검사해서, 목록 뒤쪽에 매달린 좀비를 못 보고 최대 6명 제한을 넘어 8명까지 붙었다)
    st.clingers = 0; for (const z of game.zombies) if (z.state === 'cling') st.clingers++;
    for (const z of game.zombies) {
      if (z.state === 'cling') continue;
      if (!z.alive) continue;
      const L = F.local(z.pos);
      const canCling = z.state !== 'down' && !z.noArms;   // 떨어져 누운 놈·두 팔 잃은 놈은 못 붙는다 (들이받기·밀어내기는 그대로)
      if (z.T.chaser && canCling) { // 추격자: 4m 안이면 앞·옆·뒤 어디서든 뛰어올라 매달림 (확률·인원 제한 없음, 들이받기·밀어내기 없음)
        if (Math.abs(L.lx) < st.halfW + 4 && Math.abs(L.lz) < st.halfL + 4) {
          const side = Math.abs(L.lx) > 0.3 ? Math.sign(L.lx) : (Math.random() < 0.5 ? -1 : 1);
          z.grabFort({ side, lz: clamp(L.lz / st.sizeV, -BASE.halfL + 0.5, BASE.halfL - 0.5) }, true);
          st.clingers++; ZK.audio.shriek && ZK.audio.shriek(ZK.panFor ? ZK.panFor(z.pos) : 0, 0.8); game.onCling && game.onCling(z); 
        }
        continue;
      }
      if (Math.abs(L.lx) > st.halfW + 1.2 || Math.abs(L.lz) > st.halfL + 1.2) continue;
      // 앞/뒤: 드리프트 중엔 '가는 방향'으로 판정 → 옆으로 미끄러지며 쓸어 버린 좀비도 들이받힌다 (예전엔 매달림 굴림으로 빠졌다)
      const ahead = (z.pos.x - st.pos.x) * tv.x + (z.pos.z - st.pos.z) * tv.z;
      const front = st.speed > 1.3 && (st.drift > 0 ? ahead > 0.3 : L.lz < -st.halfL * 0.35), back = L.lz > st.halfL * 0.35 && st.speed < -1.3;
      // 1.2m 안으로 다가온(=공격 중인) 좀비는 한 번 굴려 30% 확률로 매달림
      if (!z.clingRolled && !z.T.heavy && canCling && st.clingers < 6 && !front) {
        z.clingRolled = true;
        if (Math.random() < 0.45) {   // 매달림 확률 45%
          const side = Math.abs(L.lx) > st.halfW * 0.8 ? Math.sign(L.lx) : (Math.random() < 0.5 ? -1 : 1);
          z.grabFort({ side, lz: clamp(L.lz / st.sizeV, -BASE.halfL + 0.5, BASE.halfL - 0.5) });
          st.clingers++; game.onCling && game.onCling(z); continue;
        }
      }
      if (Math.abs(L.lx) > st.halfW + 0.4 || Math.abs(L.lz) > st.halfL + 0.5) continue;
      z.ramCd = (z.ramCd || 0) - dt;
      if ((front || back) && z.ramCd <= 0) { z.ramCd = 2; game.ramZombie(z, Math.abs(st.speed) * 16 * S.ramMul, front ? tv.clone() : fw.clone().negate()); continue; }
      const side = L.lx >= 0 ? 1 : -1, c = Math.cos(st.heading), s = Math.sin(st.heading), push = (st.halfW + 0.45) * side - L.lx;
      z.pos.x += push * c; z.pos.z -= push * s;
    }
    // 생존자 사수 (최대 4명 · 사거리 16m · 피해 12) — 플레이어가 헤드샷으로 처치하면 3초간 연사 2배(지휘)
    st.rally = Math.max(0, (st.rally || 0) - dt);
    for (const g of st.gunners) {
      g.cd -= dt; const from = g.mesh.getWorldPosition(_w); from.y += 0.6 * st.sizeV;
      const z = nearestZombie(from, game.zombies, 16);
      if (z) g.mesh.rotation.y = damp(g.mesh.rotation.y, Math.atan2(-(z.pos.x - from.x), -(z.pos.z - from.z)) - st.heading, 10, dt);
      if (g.cd <= 0 && z) { g.cd = 0.85 / (st.rally > 0 ? 2 : 1) / (ZK.needs ? ZK.needs.crewK() : 1);   // 굶주림·탈수면 사수 연사 −30%
        game.autoShot(from.clone(), z, 12 * (S.gunnerMul || 1), 'gunner'); }
    }
    // 지붕 포탑
    if (S.cannonLv > 0) {
      st.cannonT -= dt; const from = cannon.getWorldPosition(_w); from.y += 0.35 * st.sizeV;
      const z = nearestZombie(from, game.zombies, 32);
      if (z) cannon.rotation.y = damp(cannon.rotation.y, Math.atan2(-(z.pos.x - from.x), -(z.pos.z - from.z)) - st.heading, 8, dt);
      if (st.cannonT <= 0 && z) { st.cannonT = Math.max(0.35, 1.15 - 0.17 * S.cannonLv); game.autoShot(from.clone(), z, 38 + 16 * S.cannonLv, 'cannon'); }
    }
    // 화염 고리 · 전기 울타리
    if (S.flameLv > 0 && (st.flameT -= dt) <= 0) {
      st.flameT = 0.45;
      for (let i = 0; i < 6; i++) { const a = rand(0, 6.283); ZK.fx3.sparks(F.toWorld(Math.cos(a) * 1.9, 0.3, Math.sin(a) * 4.4), new T.Vector3(0, 1, 0), 3); }
      for (const z of game.zombies) { if (!z.alive) continue; const L = F.local(z.pos);
        const pad = S.hellfire ? 3.6 : 2.4, still = Math.abs(st.speed) < 1.5 ? 0.4 : 1;   // 멈춰 있으면 40%: 화염 고리로 아무 데서나 멈춰 버티던 문제
        if (Math.abs(L.lx) < st.halfW + pad && Math.abs(L.lz) < st.halfL + pad) game.auraHit(z, Math.round((6 + 5 * S.flameLv) * (S.hellfire ? 2 : 1) * still), 'flame'); }
    }
    if (S.shockLv > 0 && (st.shockT -= dt) <= 0) {
      st.shockT = 0.4;
      for (const z of game.zombies) { if (!z.alive) continue; const L = F.local(z.pos);
        if (Math.abs(L.lx) < st.halfW + 0.9 && Math.abs(L.lz) < st.halfL + 0.9) game.auraHit(z, Math.round((12 + 8 * S.shockLv) * (Math.abs(st.speed) < 1.5 ? 0.4 : 1)), 'shock'); }
    }
  };
  ZK.fort = F;
})();
