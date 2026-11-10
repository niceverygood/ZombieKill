// 버스 탈출 (2026-11-10) — 버스가 터져도 끝이 아니다: 튕겨 나와 뛰어서 다른 폐차에 시동을 건다
// 왜: "요새가 파괴되었다고 죽는 게 아니라, 나와서 뛰고 다른 차에 타야 하지 않나?"(사용자). 예전엔 버스 체력 0 = 바로 게임 오버였다
//  · 버스 체력 0 → 큰 폭발(반경 버스 길이 + 3.5m · 피해 140, 매달린 놈은 떨어진다) · 사수는 잃는다 · 타고 있었으면 옆으로 튕겨 나온다
//    폭발 둘레(버스 길이 + 12m)의 살아남은 좀비는 1초 동안 휘청인다(10% 속도)
//    → 사람 체력 −15(25 아래로는 안 깎음) · 1.2초 무적 · 잠깐 느린 화면 · 시선이 '시동 걸 폐차' 쪽으로 돌아간다
//  · 시동 걸 폐차: 점수 = 거리 + 그 차 10m 안 좀비×3 + 가는 길 5m 안 좀비×2 (덩치 2배) + 12m 안이면 +25 · 55m 밖이면 +40 → 가장 낮은 차 (확성기 트럭 제외) · 하나도 없으면 25~35m에 1대를 놓는다
//    초록 기둥 · 바닥 고리 · 레이더 초록 네모 · 위쪽 거리 안내
//  · 차 옆 1.6m 안에서 G를 3초 → 시동 (소음 10m · 0.6초마다 딸깍) · 그동안 물리면 0.4초씩 되돌아간다
//  · 시동이 걸리면 그 차가 새 요새: 장갑판·사수 0 · 크기 0.82 · 차 색 · 체력 (100 + 이전 최대×0.12) × 0.85^(탈출 횟수−1) × (최후의 파도면 0.7) → 바로 탑승
//  · 9:00(540초)부터 터지면 시동 걸 차가 없다 → 착륙장(8:30에 열림)까지 걸어서 10:00 헬기를 기다린다 · 초록 원·빛기둥은 착륙장 것을 쓰고 레이더·화살표·안내만 더한다
//    (20차: 막판 시동은 10:00까지 몇 초만 버티면 돼 '거의 확실한 생존'이었다 — 사용자가 9:00을 골랐다)
//  · 게임 오버는 사람 체력이 0일 때만 ('탈출하다 쓰러졌다')
//  · 불타는 잔해는 그 판 끝까지 남는다 (빛을 새로 만들지 않는다 — 빛 개수가 바뀌면 셰이더가 다시 컴파일돼 화면이 멈칫한다)
(function () {
  const T = THREE, { clamp, rand } = ZK;
  const HOT_T = 3, REACH = 1.6, MIN_D = 12, MAX_D = 55, IFRAME = 1.2, LZ_AFTER = 540;   // LZ_AFTER: 9:00부터는 시동 없이 걸어서 착륙장으로
  const B = ZK.bail = { wrecked: false, car: null, toLZ: false, hold: 0, n: 0, iframe: 0, prompt: false, stats: { n: 0, runs: [], lz: null } };
  // 타워(tower3d, 게임성 극대화 기획 세션)와 잇기: 땅에서 뛰어갈 곳은 ZK.mis.runTo(g) — 평소 착륙장 · 타워면 입구 · 타워 안이면 null. 아직 없으면 착륙장
  let G = null;
  const runTo = g => (ZK.mis.runTo ? ZK.mis.runTo(g) : ZK.mis.lz), inTower = () => !!(ZK.tower && ZK.tower.inside), where = () => (ZK.tower ? '타워 입구' : '착륙장'), whereTo = () => (ZK.tower ? '타워 입구로' : '착륙장으로');   // 받침: 착륙장'으로' · 입구'로'
  const goal = () => (B.toLZ ? G && runTo(G) : B.car && B.car.pos);   // 지금 뛰어가야 할 곳 (없으면 null: 타워 안)
  let scene, pillar, pillarMat, ring, wreck, fireTex, smokeT = 0, crankT = 0, flick = 0;
  const fires = [];
  const audioOn = () => !(ZK.debug3 && ZK.debug3.fast);

  B.init = function (sc) {
    scene = sc;
    pillarMat = new T.MeshBasicMaterial({ color: 0x3aff6a, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    pillar = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 26, 10, 1, true), pillarMat); pillar.visible = false; scene.add(pillar);
    ring = new T.Mesh(new T.RingGeometry(3.0, 3.2, 40), new T.MeshBasicMaterial({ color: 0x5aff8a, side: T.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
    // 잔해: 그을린 차체 + 찌그러진 지붕 + 불꽃 스프라이트
    wreck = new T.Group(); wreck.visible = false; scene.add(wreck);
    const burnt = new T.MeshLambertMaterial({ color: 0x1a1714 }), ash = new T.MeshLambertMaterial({ color: 0x2a2420 });
    const hull = new T.Mesh(new T.BoxGeometry(2.8, 1.3, 7.6), burnt); hull.position.y = 1.0; hull.rotation.z = 0.06; wreck.add(hull);
    const roof = new T.Mesh(new T.BoxGeometry(2.5, 0.12, 6.4), ash); roof.position.set(0.2, 1.75, 0.3); roof.rotation.set(0.05, 0.04, -0.14); wreck.add(roof);
    const plowW = new T.Mesh(new T.BoxGeometry(3.0, 1.0, 0.3), ash); plowW.position.set(0, 0.6, -4.0); plowW.rotation.set(-0.5, 0.2, 0.1); wreck.add(plowW);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.8)'); gr.addColorStop(1, 'rgba(200,40,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    fireTex = new T.CanvasTexture(c);
    for (let i = 0; i < 8; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      s.position.set(rand(-1.1, 1.1), rand(1.6, 2.4), rand(-3, 3)); s.scale.setScalar(rand(1.2, 2.2)); wreck.add(s);
      fires.push({ s, base: s.scale.x, y0: s.position.y, ph: rand(0, 6) });
    }
  };
  B.reset = function () {
    Object.assign(B, { wrecked: false, car: null, toLZ: false, hold: 0, n: 0, iframe: 0, prompt: false, t0: 0, stats: { n: 0, runs: [], lz: null } });
    if (pillar) pillar.visible = ring.visible = wreck.visible = false;
  };

  // 시동 걸 폐차 고르기: 거리 + 그 차 둘레(10m)·가는 길(5m)에 있는 좀비 (덩치는 2배)
  // 처음엔 '12m 넘는 가장 가까운 차'만 봤다 → 9:13 봇 판에서 46m 떨어진 차를 골라 해일 한가운데(12m 안 54마리)를 걸어서 뚫어야 했다
  function pickCar(F, zs) {
    const w = z => (z.T.heavy ? 2 : 1);
    const crowd = (c, d) => { let n = 0; const ax = c.pos.x - F.pos.x, az = c.pos.z - F.pos.z, L2 = d * d || 1;
      for (const z of zs) { if (!z.alive || z.sleep || z.retreat) continue;
        const zx = z.pos.x - F.pos.x, zz = z.pos.z - F.pos.z, u = clamp((zx * ax + zz * az) / L2, 0, 1), px = zx - ax * u, pz = zz - az * u;
        if (Math.hypot(z.pos.x - c.pos.x, z.pos.z - c.pos.z) < 10) n += 3 * w(z); else if (Math.hypot(px, pz) < 5) n += 2 * w(z); }
      return n; };
    const cs = ZK.world.cars.filter(c => c.alive && !c.truck).map(c => { const d = Math.hypot(c.pos.x - F.pos.x, c.pos.z - F.pos.z); return { c, d, s: d + crowd(c, d) + (d < MIN_D ? 25 : 0) + (d > MAX_D ? 40 : 0) }; }).sort((a, b) => a.s - b.s);
    B.pick = cs[0] ? { d: Math.round(cs[0].d), s: Math.round(cs[0].s) } : null;
    if (cs[0]) return cs[0].c;
    const p = ZK.world.spawnRing(F.pos, 25, 35); ZK.world.addCar(p.x, p.z, rand(0, 6.283));
    return ZK.world.cars[ZK.world.cars.length - 1];
  }
  function mark(c) {
    B.car = c; pillar.position.set(c.pos.x, 13, c.pos.z); ring.position.set(c.pos.x, 0.05, c.pos.z); pillar.visible = ring.visible = true;
  }
  const faceTo = (ps, p) => { const dx = p.x - ps.pos.x, dz = p.z - ps.pos.z; ps.yaw = Math.atan2(-dx, -dz); ps.lookYaw = 0; ps.pitch = -0.05; };

  // game3d가 버스 체력 0일 때마다 부른다 — true면 '아직 끝이 아님'(탈출 중)
  B.onWreck = function (g) {
    if (B.wrecked) return true;
    if (g.state !== 'play') return false;
    const F = ZK.fort.state, ps = ZK.player.state, was = g.mode;
    B.wrecked = true; B.n++; B.stats.n = B.n; B.hold = 0; B.t0 = g.t; B.prevMax = F.maxHp; B.hp0 = g.hp;
    wreck.position.set(F.pos.x, 0, F.pos.z); wreck.rotation.y = F.heading; wreck.scale.setScalar(F.sizeV); wreck.visible = true;
    for (const z of g.zombies) if (z.state === 'cling') z.dropOff();
    const lost = ZK.fort.dropGunners();
    ZK.fort.setVisible(false); F.speed = 0; ZK.audio.engine && ZK.audio.engine(0);
    // 폭발: 버스 둘레 좀비를 날려 숨 돌릴 틈을 만든다 (덩치·추격자는 버틴다)
    const c0 = F.pos.clone();
    g.boom(c0.clone().setY(1.2), 1.6); g.blast(c0, F.halfL + 3.5, 140, 'fire'); g.noise('barrel', c0);
    for (const z of g.zombies) if (z.alive && Math.hypot(z.pos.x - c0.x, z.pos.z - c0.z) < F.halfL + 12) z.stagger = Math.max(z.stagger || 0, 1.0);   // 폭풍에 휘청: 1초 동안 10% 속도 → 뛰기 시작할 틈
    if (was === 'drive' && !inTower()) {
      g.mode = 'foot'; ps.mounted = false; ps.pos.copy(ZK.fort.sidePoint()); ps.pos.y = 0;
      const away = ps.pos.clone().sub(c0).setY(0); if (away.lengthSq() < 1e-4) away.set(1, 0, 0); away.normalize();
      ps.vel.copy(away).multiplyScalar(5); ps.vy = 3.2; ps.onGround = false;   // 옆으로 튕겨 나가며 살짝 뜬다
      g.hp = Math.max(Math.min(g.hp, 25), g.hp - 15); g.regenT = 4;
    }
    B.iframe = IFRAME; ZK.fx3.slowmo(0.35, 0.9); ZK.fx3.trauma(0.5);
    // 9:00부터는 시동 걸 차가 없다 — 착륙장까지 걸어서 10:00 헬기를 기다린다 (사용자 결정, 20차: 막판 시동은 몇 초만 버티면 돼 '거의 확실한 생존'이었다)
    // 타워 안에서 터지면(플레이어는 이미 내려 있다): 튕겨 나옴·시동 없이 '돌아갈 차는 없다'만 — 게임 오버도 아니다
    G = g; const inside = inTower();
    B.toLZ = inside || (g.t >= LZ_AFTER && !!runTo(g));
    if (B.toLZ) { B.car = null; B.stats.lz = { t: +g.t.toFixed(1), reachT: null, inTower: inside }; } else mark(pickCar(F, g.zombies));
    if (ZK.dread) { ZK.dread.stam = 100; ZK.dread.exhausted = false; }   // 아드레날린: 지구력 가득
    const gp = goal();
    if (gp) faceTo(ps, gp);
    const d = gp ? Math.round(Math.hypot(gp.x - ps.pos.x, gp.z - ps.pos.z)) : 0;
    g.onNotice && g.onNotice(inside ? '밖에서 버스가 터졌다 — 돌아갈 차는 없다. 위로!' : B.toLZ ? `버스가 터졌다! ${where()}(${d}m)까지 걸어서 — 헬기까지 버텨라` : `버스가 터졌다! 초록 기둥 폐차(${d}m)까지 뛰어 — G 3초로 시동`, '#7dff9a');
    if (lost) g.onNotice && g.onNotice(`사수 ${lost}명을 잃었다`, '#ff8a6a');
    if (audioOn()) ZK.audio.stinger && ZK.audio.stinger(1);
    return true;
  };

  // game3d 아래쪽 요새 체력 줄·조작 안내 문구
  B.bar = () => (B.toLZ ? `버스 파괴 — 걸어서 ${whereTo()} · 헬기까지` : '버스 파괴 — 초록 기둥 폐차에서 G 3초로 시동');
  B.hint = () => (B.toLZ ? (inTower() ? '돌아갈 차는 없다 — 옥상으로' : `${whereTo()} — 헬기까지 버텨라`) : '초록 기둥 폐차로 뛰어라 — G 길게: 시동');

  // hurtPlayer 앞에서 부른다: false면 그 피해는 없던 일(튕겨 나온 직후 무적) · 시동 거는 중에 물리면 0.4초 되돌림
  B.hurtGate = function () {
    if (B.iframe > 0) return false;
    if (B.wrecked && B.hold > 0) B.hold = Math.max(0, B.hold - 0.4);
    return true;
  };

  function hotwire(g) {
    // 새 차 체력: 처음 (150 + 이전 최대×0.25)는 막판 '두 번째 체력 막대'가 너무 커서 보통 봇 생존 50 → 92% (19차) → (100 + 이전 최대×0.12) · 최후의 파도 중엔 ×0.7
    const c = B.car, ps = ZK.player.state, hp = Math.round((100 + 0.12 * B.prevMax) * Math.pow(0.85, B.n - 1) * (g.finalWave ? 0.7 : 1));
    const x = c.pos.x, z = c.pos.z, heading = c.group.rotation.y - Math.PI / 2, col = c.color;   // 차의 긴 축(로컬 x)이 새 요새의 앞뒤
    ZK.world.removeCar(c);
    ZK.fort.rebuild(x, z, heading, col, hp, 0.82);
    B.wrecked = false; B.car = null; B.hold = 0; B.prompt = false; pillar.visible = ring.visible = false;
    g.bailT = g.t;   // 실력 맞춤 디렉터: 재시동 직후 30초는 '여유' 판정(firm)을 끈다 (게임성 극대화 기획 세션)
    B.stats.runs.push({ t: +B.t0.toFixed(1), runT: +(g.t - B.t0).toFixed(1), hpLost: Math.round(B.hp0 - g.hp), newHp: hp });
    g.mountFort();
    g.noise('crash', ps.pos);   // 시동 소리 + 출발 굉음
    g.onNotice && g.onNotice(`시동 걸렸다! 새 요새 체력 ${hp} — 폐차를 들이받아 다시 키워라`, '#7dff9a');
    ZK.fx3.trauma(0.25);
    if (audioOn()) { ZK.audio.levelUp && ZK.audio.levelUp(); ZK.audio.thud && ZK.audio.thud(); }
  }

  B.update = function (dt, g) {
    if (wreck && wreck.visible) {   // 불길은 판 끝까지
      flick += dt;
      for (const f of fires) { const k = 0.8 + Math.sin(flick * 9 + f.ph) * 0.15 + Math.random() * 0.1; f.s.scale.setScalar(f.base * k); f.s.position.y = f.y0 + Math.sin(flick * 5 + f.ph) * 0.12; }
      if ((smokeT -= dt) <= 0 && audioOn()) { smokeT = 0.35; ZK.fx3.smoke(wreck.position.clone().setY(2.4 * wreck.scale.x), new T.Vector3(rand(-0.2, 0.2), 1, rand(-0.2, 0.2)).normalize()); }
    }
    if (!B.wrecked || g.state !== 'play') return;
    G = g; B.iframe = Math.max(0, B.iframe - dt);
    pillarMat.color.setHex(Math.sin(flick * 6) > 0 ? 0x3aff6a : 0x9affb0);
    if (B.toLZ) { B.prompt = false; if (!B.stats.lz.reachT && ZK.mis.inLZ(g)) { B.stats.lz.reachT = +(g.t - B.t0).toFixed(1); g.onNotice && g.onNotice(`착륙장이다 — 헬기까지 ${Math.max(0, Math.ceil(ZK.mis.HELI_T - g.t))}초 버텨라!`, '#7dff9a'); } return; }
    if (!B.car || !B.car.alive) mark(pickCar({ pos: ZK.player.state.pos }, g.zombies));   // 고른 차가 사라졌으면(임무 등) 다시 고른다
    const ps = ZK.player.state, b = B.car.col;
    const dx = Math.max(b.minX - ps.pos.x, 0, ps.pos.x - b.maxX), dz = Math.max(b.minZ - ps.pos.z, 0, ps.pos.z - b.maxZ);
    const near = g.mode === 'foot' && Math.hypot(dx, dz) < REACH;
    B.prompt = near;
    if (near && ZK.player.keys.KeyG && !(ZK.surv && ZK.surv.choosing)) {
      if (B.hold === 0) g.noise('search', B.car.pos);   // 차 문 여는 소리
      B.hold += dt;
      if ((crankT -= dt) <= 0) { crankT = 0.6; if (audioOn()) ZK.audio.ting && ZK.audio.ting(0); ZK.fx3.sparks(B.car.pos.clone().setY(0.9), new T.Vector3(0, 1, 0), 3); }
      if (B.hold >= HOT_T) hotwire(g);
    } else B.hold = Math.max(0, B.hold - dt * 1.5);
  };

  // 레이더: 초록 네모 (밖이면 테두리에)
  B.drawRadar = function (h, cx, cy, Rr, c, yaw, sc) {
    const gp = B.wrecked && goal(); if (!gp) return;
    const dx = gp.x - c.x, dz = gp.z - c.z; let x = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * sc, y = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * sc;
    const l = Math.hypot(x, y); if (l > Rr - 6) { x *= (Rr - 6) / l; y *= (Rr - 6) / l; }
    h.fillStyle = Math.sin(flick * 6) > 0 ? '#3aff6a' : '#9affb0'; h.fillRect(cx + x - 5, cy + y - 5, 10, 10);
  };
  // 화면: 위쪽 한 줄(거리) + 가까이 오면 G 진행 원 + 화면 밖이면 가장자리 화살표
  B.drawHUD = function (h, W, H, g, label) {
    const gp = B.wrecked && goal(); if (!gp || g.state !== 'play') return;
    // 착륙장으로 갈 때는 임무 줄(132: '착륙장 — … · 남은 시간 · 거리' + 방향 ▼)이 이미 같은 일을 한다 → 겹치지 않게 그리지 않는다 (아래 요새 줄·안내만 바뀜)
    if (B.toLZ) return;
    // 임무 줄(132)·해일/무기고 줄(160)이 떠 있으면 그 아래(190)로 — 처음엔 136에 그려 임무 줄과 겹쳤다
    const ps = ZK.player.state, d = Math.round(Math.hypot(ps.pos.x - gp.x, ps.pos.z - gp.z)), y0 = ZK.mis.target(g) ? 190 : 136;
    h.globalAlpha = 0.75 + Math.sin(ZK.fx3.time * 6) * 0.25;
    label(B.prompt ? '시동 거는 중 — G를 누르고 버텨라' : `버스가 터졌다 — 초록 기둥 폐차까지 ${d}m · G 3초로 시동`, W / 2, y0, 20, '#7dff9a');
    h.globalAlpha = 1;
    // 방향 화살표: 화면 위쪽 가운데에 폐차 쪽을 가리킨다 (뒤에 있어도 어디로 뛸지 바로 보이게)
    const rel = Math.atan2(-(gp.x - ps.pos.x), -(gp.z - ps.pos.z)) - (ps.yaw + (ps.lookYaw || 0)), a = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (!B.prompt && Math.abs(a) > 0.35) {
      h.save(); h.translate(W / 2, y0 + 40); h.rotate(-a); h.fillStyle = '#3aff6a';
      h.beginPath(); h.moveTo(0, -16); h.lineTo(11, 6); h.lineTo(-11, 6); h.closePath(); h.fill(); h.restore();
    }
    if (B.prompt) {
      const cx = W / 2, cy = H / 2 + 70, k = clamp(B.hold / HOT_T, 0, 1);
      label('G 길게 — 시동', cx, cy, 18, '#7dff9a');
      h.strokeStyle = 'rgba(0,0,0,0.6)'; h.lineWidth = 6; h.beginPath(); h.arc(cx, cy + 34, 16, 0, 6.283); h.stroke();
      h.strokeStyle = '#7dff9a'; h.lineWidth = 4; h.beginPath(); h.arc(cx, cy + 34, 16, -Math.PI / 2, -Math.PI / 2 + k * 6.283); h.stroke();
    }
  };
})();
