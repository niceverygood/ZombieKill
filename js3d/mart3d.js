// 한빛마트 (1탄 오픈월드의 목적지, 2026-11-10) — 파밍할 게 엄청 많은 대신 좀비가 바글거리는 실내
//  · 건물 x 148~192 · z −192~−156 (44×36m, 높이 6m): 앞(남쪽) 입구 8m · 뒤(북쪽) 하역장 문 6m · 지붕(위)·천장(아래)·타일 바닥
//  · 안: 진열대 8줄(남북으로 19m, 통로 3.8m) · 계산대 4개 · 뒤쪽 창고 띠(팔레트) — 버스는 못 들어온다, 걸어서만
//  · 진열대 수색 18곳(G 1.8초): 음료 · 통조림 · 라면 · 생활용품 · 공구 · 캠핑/사냥 · 주류 · 약국 진열대
//  · 핵심 물자 3곳(G 4초 · 쇠붙이 소리 16m): 의약품 상자(약국 벽) · 식량 팔레트(창고) · 연료 드럼(하역장). 하나마다 카드 1장
//  · 좀비: 버스나 내가 마트 140m 안에 처음 오면 그때 나타난다 — 안에 40마리(잠듦, 출근러 8 · 덩치 2) · 주차장에 18마리(배회)
//    잠든 놈은 5m 안에 다가가거나 18m 안의 내 소리에 깬다. 깬 놈이 7m 안의 잠든 놈을 0.6초 뒤 깨운다(연쇄) → 총 한 발이 통로 하나를 깨운다
//  · 안은 어둡다(안개를 짙게) → 손전등(L)이 빛난다
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const R = ZK.mart = { keys: [], points: [], zs: [], spawned: false, stats: {} };
  const X0 = 148, X1 = 192, Z0 = -192, Z1 = -156, HT = 6, WT = 0.4, DOOR = [166, 174], DOCK = [182, 188];
  const ROWS = [152.5, 157.5, 162.5, 167.5, 172.5, 177.5, 182.5, 187.5], RZ0 = -186, RZ1 = -167;
  const CENTER = new T.Vector3(170, 0, -150);
  // 조절값 (A/B는 판 시작 전에 ZK.mart.CFG를 바꿔서): inside 안에 잠든 수 · runners 그중 달리기 · lot 주차장 배회 · wake 다가가면 깨는 반경 · chain 연쇄 반경 · depth 뒤쪽 쏠림 지수 · frontAid 앞줄 진열대에 붕대를 더 넣을지
  const CFG = R.CFG = { inside: 32, runners: 2, lot: 8, wake: 3.6, chain: 4.5, depth: 1.7, frontAid: 1, dmgK: 1, leash: 25 };   // dmgK: 안에 잠든 놈들의 공격력 배율 · leash: 깬 마트 좀비가 입구에서 이만큼 넘게 쫓아오면 돌아간다(0이면 끔)
  // 최종 A/B(변형 4 × 48판): 주차장 12→8이 보통 승 2/16 → 10/16(p≈0.003), 전체 22/48로 마트를 건너뛴 판(22/48)과 같아졌다
  // 2라운드 A/B(변형 7 × 24판, 2026-11-10): 달리기 4→2 + 앞줄 붕대 1개가 보통 승 3/8(마트 건너뜀) → 6/8, 숙련은 5/8 대 6/8로 비슷. 공격력 0.75·출혈 40%·잠든 수 26·깨는 반경 3.0은 효과 없음
  // 잠든 놈이 깨는 소리 반경(m): 첫 봇 판에서 40마리가 23초 만에 다 깼다(총소리 18m + 연쇄 7m가 통로 간격 5m를 타고 번짐) → 총은 근처만, 뒤지기는 바로 옆만
  const HEAR = { revolver: 11, shotgun: 13, rifle: 12, molotov: 9, grenade: 18, barrel: 16, burst: 7, crash: 8, siren: 18, cache: 6, search: 3, footstep: 3 };
  R.BOX = { x0: X0, x1: X1, z0: Z0, z1: Z1 }; R.DOOR = new T.Vector3((DOOR[0] + DOOR[1]) / 2, 0, Z1 + 2.5); R.LOT = new T.Vector3(170, 0, -140);
  R.inside = p => p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1;
  let scene, sceneFog, darkOn = false;

  // 진열대 상품 무늬 (색 띠)
  function shelfTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#2a2c30'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) { g.fillStyle = '#4a4c52'; g.fillRect(0, r * 32 + 28, 128, 4);
      for (let k = 0; k < 10; k++) { g.fillStyle = `hsl(${(Math.random() * 360) | 0},${40 + Math.random() * 40}%,${30 + Math.random() * 30}%)`; g.fillRect(k * 13 + 1, r * 32 + 6 + Math.random() * 8, 10, 22); } }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }

  R.init = function (sc) {
    scene = sc; const W = ZK.world, C = ZK.city; if (!C || !C.Batch) return;   // 광장 맵이면 마트 없음
    const Bt = C.Batch, cols = W.colliders, solids = W.solids;
    const wall = new Bt(), roof = new Bt(), floor = new Bt(), shelf = new Bt(), prop = new Bt();
    const wcol = [0.42, 0.4, 0.38], addCol = (x0, x1, z0, z1, h) => cols.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h });
    // 벽 (안·밖 양면이 보이게 상자로) · 문 자리는 비움
    const wseg = (x0, x1, z0, z1) => { wall.box(x0, x1, z0, z1, 0, HT, 6, wcol, true); addCol(x0, x1, z0, z1, HT); };
    wseg(X0, DOOR[0], Z1 - WT, Z1); wseg(DOOR[1], X1, Z1 - WT, Z1);                 // 앞 (입구)
    wseg(X0, DOCK[0], Z0, Z0 + WT); wseg(DOCK[1], X1, Z0, Z0 + WT);                 // 뒤 (하역장 문)
    wseg(X0, X0 + WT, Z0, Z1); wseg(X1 - WT, X1, Z0, Z1);                           // 옆
    wall.box(DOOR[0], DOOR[1], Z1 - WT, Z1, 3.2, HT, 6, wcol, true); wall.box(DOCK[0], DOCK[1], Z0, Z0 + WT, 3.6, HT, 6, wcol, true);   // 문 위 벽
    // 앞 유리창 띠(발광) · 간판
    prop.box(X0 + 1, DOOR[0] - 1, Z1 + 0.02, Z1 + 0.06, 1.2, 2.8, 6, [0.25, 0.4, 0.5]); prop.box(DOOR[1] + 1, X1 - 1, Z1 + 0.02, Z1 + 0.06, 1.2, 2.8, 6, [0.25, 0.4, 0.5]);
    // 차 막이 기둥(정문 앞 2개 · 하역장 앞 1개, 틈 2.45~2.85m < 버스 폭 3m): 사람·좀비는 지나가고 버스는 못 들어온다 — 검수: 버스로 정문을 밀고 들어가 진열대 끝까지 갔다
    // 처음엔 3개(틈 1.7m)였는데 1m 길찾기 칸에서 틈이 한 칸씩만 남아 나오던 좀비가 문 모서리에 줄줄이 끼었다 → 벽에서 1.6m 띄우고 2개로
    for (const x of [168.6, 171.4]) { prop.box(x - 0.15, x + 0.15, Z1 + 1.45, Z1 + 1.75, 0, 1.0, 1, [0.85, 0.7, 0.1]); addCol(x - 0.15, x + 0.15, Z1 + 1.45, Z1 + 1.75, 1.0); }
    for (const x of [185]) { prop.box(x - 0.15, x + 0.15, Z0 - 1.75, Z0 - 1.45, 0, 1.0, 1, [0.85, 0.7, 0.1]); addCol(x - 0.15, x + 0.15, Z0 - 1.75, Z0 - 1.45, 1.0); }
    if (C.textTex) {   // 입구 위 가로 간판 (안개를 무시: 주차장 건너편에서도 '여기가 입구')
      const sg = new T.Mesh(new T.PlaneGeometry(22, 2.1), new T.MeshBasicMaterial({ map: C.textTex(['한빛마트  HANBIT MART'], 1024, 100, '#c8281e', '#fff', [64]), fog: false }));
      sg.position.set((DOOR[0] + DOOR[1]) / 2, 4.55, Z1 + 0.09); scene.add(sg);
      const ar = new T.Mesh(new T.PlaneGeometry(3.2, 0.9), new T.MeshBasicMaterial({ map: C.textTex(['입구 ▼'], 256, 72, '#1a1c20', '#ffd23a', [44]), fog: false }));
      ar.position.set((DOOR[0] + DOOR[1]) / 2, 3.55, Z1 + 0.1); scene.add(ar);
    }
    // 지붕(위에서 보이는 면) + 천장(안에서 보이는 아래 면)
    roof.top(X0, X1, Z0, Z1, HT + 0.01, 8, [0.12, 0.12, 0.14]);
    roof.q([[X0, HT - 0.02, Z0], [X1, HT - 0.02, Z0], [X1, HT - 0.02, Z1], [X0, HT - 0.02, Z1]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.1, 0.1, 0.11]);
    floor.top(X0 + WT, X1 - WT, Z0 + WT, Z1 - WT, 0.03, 2, [0.5, 0.5, 0.48]);
    // 천장 형광등 판 (빛은 없고 발광만, 몇 개는 꺼짐)
    const lamp = new Bt(); for (let k = 0; k < 8; k++) for (let r = 0; r < 3; r++) { const x = 152 + k * 5.2, z = -186 + r * 9; if (Math.random() < 0.55) continue; lamp.q([[x - 0.3, HT - 0.05, z - 1.2], [x + 0.3, HT - 0.05, z - 1.2], [x + 0.3, HT - 0.05, z + 1.2], [x - 0.3, HT - 0.05, z + 1.2]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.9, 0.95, 1]); }
    // 진열대 8줄 (1.2m 폭 · 2.1m 높이) — 가운데에 2m 건너가는 틈
    for (const x of ROWS) for (const [za, zb] of [[RZ0, -177.5], [-175.5, RZ1]]) { shelf.box(x - 0.6, x + 0.6, za, zb, 0, 2.1, 2.1, null, true); addCol(x - 0.6, x + 0.6, za, zb, 2.1); }
    // 계산대 4개 · 창고 팔레트 · 약국 카운터
    for (const x of [151.5, 156.5, 181.5, 186.5]) { prop.box(x - 0.5, x + 0.5, -163, -160, 0, 1.0, 2, [0.35, 0.3, 0.26]); addCol(x - 0.5, x + 0.5, -163, -160, 1.0); }
    for (const [x, z] of [[151, -190], [161, -190], [171, -190], [177, -190]]) { prop.box(x - 1.4, x + 1.4, z - 0.8, z + 0.8, 0, 1.4, 2, [0.45, 0.36, 0.22]); addCol(x - 1.4, x + 1.4, z - 0.8, z + 0.8, 1.4); }
    prop.box(190, 191.6, -182, -170, 0, 1.1, 2, [0.85, 0.85, 0.82]); addCol(190, 191.6, -182, -170, 1.1);
    const plain = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    for (const [b, mat, hit] of [[wall, plain, true], [roof, plain, true], [floor, plain, false], [shelf, new T.MeshLambertMaterial({ map: shelfTex() }), true], [prop, plain, true], [lamp, new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), false]]) {
      const m = b.mesh(mat); if (!m) continue; scene.add(m); if (hit) solids.push(m);
    }
    // ── 수색 지점 ──
    const N = ZK.needs, ringGeo = new T.RingGeometry(0.7, 0.9, 24);
    const addPt = (name, x, z, fixed, opts = {}) => {
      const col = opts.key ? 0xd8b42a : 0xe0e0d8;
      const geo = opts.key ? new T.BoxGeometry(1.2, 0.9, 0.9) : new T.BoxGeometry(0.6, 0.35, 0.35), m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: col, emissive: opts.key ? 0x3a2a00 : 0 }));
      m.position.set(opts.mx ?? x, opts.my ?? (opts.key ? 0.45 : 1.15), opts.mz ?? z); scene.add(m);
      const edge = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: opts.key ? 0xffd23a : 0xffe8a0 })); edge.position.copy(m.position); scene.add(edge);
      const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: opts.key ? 0xffb02a : 0xffd23a, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); scene.add(ring);
      const pt = { name, pos: new T.Vector3(x, 0, z), mesh: m, edge, ring, done: false, fixed, holdT: opts.key ? 4 : 1.8, noise: opts.key ? 'cache' : 'search', mart: true, key: opts.key || null, col };
      if (opts.key) pt.onDone = (p, g) => R.onKey(p, g);
      else pt.onDone = () => { R.stats.shelves = (R.stats.shelves || 0) + 1; };
      N.points.push(pt); R.points.push(pt); if (opts.key) R.keys.push(pt); return pt;
    };
    // 통로마다 진열대 면에 2곳 (통로 가운데에서 G)
    const AISLE = [['음료', [['water', 'water'], ['water', 'can']]], ['통조림', [['can', 'can'], ['can', 'water']]], ['라면·과자', [['can', 'water'], ['can', 'can']]],
      ['생활용품', [['cloth', 'bottle'], ['bandage', 'cloth']]], ['공구', [['scrap', 'ammo'], ['fuelcan', 'scrap']]], ['캠핑·사냥', [['shell', 'shell', 'ammo'], ['rifleAmmo', 'ammo', 'molotov']]],   /* 리볼버 탄(ammo, 12발)을 넣어 마트 털이가 2탄 타워 준비가 되게 — 타워 세션: 마트를 털어도 타워 입구 짐이 리볼버 24발 그대로였다 */
      ['주류', [['bottle', 'bottle', 'cloth'], ['molotov', 'molotov']]], ['약국 진열대', [['bandage', 'pill'], ['anti', 'bandage']]], ['세제·위생', [['cloth', 'water'], ['pill', 'can']]]];
    AISLE.forEach(([nm, sets], k) => {
      const x = k === 0 ? (X0 + ROWS[0] - 0.6) / 2 + 0.2 : k === 8 ? (ROWS[7] + 0.6 + X1) / 2 - 0.2 : (ROWS[k - 1] + ROWS[k]) / 2, side = k === 0 ? 1 : -1;
      sets.forEach((fx, n) => { const z = n === 0 ? -182 : -171; addPt('진열대 · ' + nm, x, z, fx, { mx: x + side * 1.3, mz: z }); });
    });
    addPt('핵심 물자 · 의약품 상자', 188.8, -176, ['bandage', 'bandage', 'anti', 'anti', 'pill'], { key: '의약품 상자', mx: 190.8, my: 1.55 });
    addPt('핵심 물자 · 식량 팔레트', 156, -188, ['can', 'can', 'can', 'water', 'water', 'water'], { key: '식량 팔레트', mz: -190 });
    addPt('핵심 물자 · 연료 드럼', 185, -188.5, ['fuelcan', 'fuelcan', 'molotov'], { key: '연료 드럼' });
    buildNav();
    // 지도(M)의 길 안내 목표: 임무·착륙장이 있으면 그쪽, 없으면 마트
    C.goal = g => { const t = ZK.mis.target && ZK.mis.target(g); if (t) return new T.Vector3(t.x, 0, t.z); return R.goal(g); };
  };

  // 핵심 물자를 챙겼을 때: 카드 1장 · 기록 · 알림 (3개 다 → 큰 알림)
  R.onKey = function (p, g) {
    R.stats.keys = (R.stats.keys || []).concat([[p.key, Math.round(g.t)]]);
    ZK.surv.grant(1); const n = R.got();
    g.onNotice(n >= 3 ? '한빛마트를 다 털었다! 이제 버티다 착륙장으로 (8:30 무전)' : `핵심 물자 ${n}/3 — ${p.key} (카드 +1)`, n >= 3 ? '#7dff9a' : '#ffd23a');
    if (n >= 3 && ZK.mis) ZK.mis.flash = { text: '한빛마트 털이 성공!', sub: '핵심 물자 3/3 · 카드 +3', t: 2.6, col: '#7dff9a' };
  };
  R.got = () => R.keys.filter(p => p.done).length;

  R.reset = function (g) {
    for (const z of R.zs) if (z.alive && !z.remove) z.dispose(); R.zs = [];
    R.spawned = false; R.hinted = false; R.told = false; R.stats = { spawnT: null, enterT: null, keys: [], shelves: 0, woke: 0, insideT: 0, hpInside: 0, hp0: null };
    for (const p of R.points) p.mesh.material.color.setHex(p.col);   // needs.reset이 칠한 색을 상품 색으로 되돌림
    for (const p of R.points) { if (!p.fixed0) p.fixed0 = p.fixed.slice(); p.fixed = p.fixed0.slice(); if (!p.key && p.pos.z > -175) for (let a = 0; a < CFG.frontAid; a++) p.fixed.push('bandage'); }   // A/B: 입구 쪽 앞줄 진열대에 붕대 하나 더
    if (darkOn) setDark(false, g);
  };

  // 처음 가까이 왔을 때 좀비를 채운다 (먼 도시에서 미리 60마리를 돌리지 않게)
  function spawnAll(g) {
    R.spawned = true; R.stats.spawnT = Math.round(g.t);
    const inside = [], hpk = 1;
    for (let k = 0; k < CFG.inside; k++) {   // 40 → 32 (첫 봇 5판 중 4판이 2:40 전에 안에서 죽음)
      let x, z;
      const r0 = Math.random();
      // 깊이 = 위험 = 보상: 입구 쪽(앞 진열대)은 한산하고 안쪽(핵심 물자가 있는 뒤쪽 창고 띠)으로 갈수록 빽빽하다
      // (처음엔 계산대 뒤 앞줄에도 15%를 두어, 초보 봇이 들어서자마자 10~30초 만에 쓰러졌다)
      if (r0 < 0.7) { const a = (Math.random() * 9) | 0; x = a === 0 ? 150.2 : a === 8 ? 189.6 : (ROWS[a - 1] + ROWS[a]) / 2; z = RZ0 + 1 + (RZ1 - RZ0 - 2) * Math.pow(Math.random(), CFG.depth); }   // 통로 (뒤로 쏠림)
      else { x = rand(X0 + 1.5, X1 - 1.5); z = rand(-188.5, -187); }   // 창고 띠
      const type = k < 1 ? 'brute' : k < 1 + CFG.runners ? 'runner' : 'walker' /* 달리는 놈 4: 물러나는 플레이어를 붙잡는 건 주로 이놈들 */, zz = g.spawnZ(type, new T.Vector3(x + rand(-0.4, 0.4), 0, z), 'wander');
      zz.guard = true; zz.mart = true; zz.sleep = true; zz.tideK = 0.04; zz.senseT = 999; zz.wp = { x: zz.pos.x, z: zz.pos.z }; zz.wpT = 999; zz.wakeT = 0; zz.hearR = kind => HEAR[kind] || 0; zz.home = { x: zz.pos.x, z: zz.pos.z }; if (CFG.dmgK !== 1) zz.dmgK = CFG.dmgK;
      inside.push(zz);
    }
    for (let k = 0; k < CFG.lot; k++) {   // 주차장: 배회 (버스를 보면 달려든다) · 18 → 12: 안에 있는 동안 세워 둔 버스가 부서져 탈출로 이어졌다
      const p = new T.Vector3(rand(147, 193), 0, rand(-150, -82)); if (!ZK.world.freeSpot(p.x, p.z, 0.6)) continue;
      const zz = g.spawnZ(Math.random() < 0.2 ? 'runner' : 'walker', p, 'wander'); zz.guard = true; zz.mart = true; inside.push(zz);
    }
    R.zs = inside;
    g.onNotice('한빛마트가 보인다 — 주차장과 안에 좀비가 바글거린다', '#ff9a6a');
  }
  // soft: 소리에 깬 놈은 곧장 달려들지 않고 소리 난 곳으로 걸어간다(경계) — 쏘고 자리를 옮기면 따돌릴 수 있다. 가까이 다가왔거나 맞은 놈만 바로 추적
  function wake(z, g, soft) { if (!z.sleep) return; z.sleep = false; z.tideK = 0; if (!soft) z.aware = 'chase'; z.senseT = soft ? 0.3 : 0; z.stagger = 0.6; R.stats.woke++; }

  function setDark(on, g) {
    darkOn = R.darkOn = on; const f = ZK.world.scene && ZK.world.scene.fog; if (!f) return;   // R.darkOn: game3d setNight이 밤이 와도 안의 어둠을 지킨다
    f.density = on ? 0.075 : 0.02 + 0.022 * ((g && g.nightK) || 0);
  }

  R.update = function (dt, g) {
    if (!ZK.city || !R.points.length || g.state !== 'play') return;
    const F = ZK.fort.state, ps = ZK.player.state, foot = g.mode === 'foot', me = foot ? ps.pos : F.pos;
    if (!R.told && g.t > 6) { R.told = true; g.onNotice('무전: 북동쪽 한빛마트에 물자가 산더미다 — 표지판을 따라가라 (M 지도)', '#ffb06a'); }
    if (!R.spawned && me.distanceTo(CENTER) < 140) spawnAll(g);
    const inside = foot && R.inside(ps.pos);
    if (inside !== darkOn) setDark(inside, g);
    else if (darkOn && ZK.world.scene.fog && ZK.world.scene.fog.density < 0.075) ZK.world.scene.fog.density = 0.075;   // 다른 데서 안개를 바꿔도(밤·정전) 안은 어둡게
    if (inside) { R.stats.insideT += dt; if (R.stats.enterT === null) { R.stats.enterT = Math.round(g.t); R.stats.hp0 = g.hp; }
      if (!R.hinted) { R.hinted = true; g.onNotice('마트 안 — 어둡다 (L 손전등) · 진열대·노란 상자(핵심 물자 3곳)는 F로 바로 줍기 — 줍는 소리는 난다', '#ffd23a'); g.onNotice('잠든 좀비 곁은 C로 앉아서 — 다가가면 깬다 (질주는 더 멀리서 · 총소리는 근처를 깨운다)', '#ffb06a'); } }
    if (!R.spawned) return;
    updateFlow(dt, g);   // 쫓는 놈들의 길 지도
    for (const z of R.zs) { if (!z.alive) continue; z.indoor = R.inside(z.pos);
      // 추격 끈: 안에서 깬 놈이 입구에서 leash m 넘게 쫓아왔고 플레이어가 12m 밖이면 제자리로 돌아간다 — 초보가 일찍 물러나도 마트 무리가 버스·주차장까지 끝까지 쫓아와 죽였다
      if (CFG.leash && z.home && !z.sleep && z.aware === 'chase' && z.state !== 'cling' && z.pos.distanceTo(R.DOOR) > CFG.leash && z.pos.distanceTo(g.mode === 'foot' ? ps.pos : F.pos) > 12) { z.aware = 'alert'; z.alertPos.set(z.home.x, 0, z.home.z); z.alertT = 25; z.senseT = 2; R.stats.leashed = (R.stats.leashed || 0) + 1; }
    }   // 마트 건물 안은 벽 너머 — 밖에 세운 버스의 사수·포탑이 못 쏜다 (게임성 세션 발견: 깬 놈을 벽 너머로 쏴 죽였다)
    // 잠든 놈 깨우기: 내가 3.6m 안(질주 ×1.25 · 앉기 ×0.55 · 엎드리기 ×0.35 · 손전등 ×1.3) · 깬 놈 4.5m 안이면 1초 뒤 (연쇄)
    const wr = CFG.wake * (ZK.dread && ZK.dread.stealthK ? ZK.dread.stealthK() : 1);
    for (const z of R.zs) {
      if (!z.sleep || !z.alive || z.remove) continue;
      if (z.home) { z.pos.x = z.home.x; z.pos.z = z.home.z; }   // 잠든 놈은 제자리 (배회 걸음이 1~3m씩 흘러갔다 — 검수)
      if (foot && z.pos.distanceTo(ps.pos) < wr) { wake(z, g); continue; }
      if (z.hp < z.maxHp || z.aware === 'chase') { wake(z, g); continue; }   // 맞았다
      if (z.aware === 'alert') { wake(z, g, true); continue; }   // 소리를 들었다 → 소리 난 곳으로
      if (z.wakeT > 0) { if ((z.wakeT -= dt) <= 0) wake(z, g); continue; }
      for (const o of R.zs) if (!o.sleep && o.alive && !o.remove && o.aware === 'chase' && o.pos.distanceTo(z.pos) < CFG.chain) { z.wakeT = 1; break; }
    }
  };

  // 목표 줄: 다른 임무·무전·착륙장이 없을 때 '한빛마트 — 핵심 물자 n/3 · 거리' + 방향 화살표
  R.goal = g => (R.got() >= 3 ? null : R.inside(ZK.player.state.pos) && g.mode === 'foot' ? null : R.DOOR);
  R.drawHUD = function (h, W, H, g, label) {
    if (!ZK.city || g.state !== 'play' || (ZK.mis.target && ZK.mis.target(g)) || ZK.mis.offer) return;
    const n = R.got(), ps = ZK.player.state, F = ZK.fort.state, me = g.mode === 'foot' ? ps.pos : F.pos;
    if (n >= 3) return;
    const inside = g.mode === 'foot' && R.inside(ps.pos);
    let tgt = R.DOOR, nm = '한빛마트';
    if (inside) { const left = R.keys.filter(p => !p.done).sort((a, b) => a.pos.distanceTo(me) - b.pos.distanceTo(me))[0]; if (left) { tgt = left.pos; nm = left.key; } }
    const d = Math.hypot(tgt.x - me.x, tgt.z - me.z), cx = W / 2, y = 132;
    label(`${nm} — 핵심 물자 ${n}/3 · ${Math.round(d)}m${inside ? '' : ' · M 지도'}`, cx, y, 17, '#ffb06a');
    let diff = Math.atan2(-(tgt.x - me.x), -(tgt.z - me.z)) - (ps.yaw + (ps.lookYaw || 0)); diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    h.fillStyle = '#ffb06a'; h.strokeStyle = 'rgba(0,0,0,0.8)'; h.lineWidth = 3; h.beginPath();
    if (Math.abs(diff) < 1.1) { const x = cx - diff / 1.1 * Math.min(320, W * 0.32), yy = y + 24; h.moveTo(x - 9, yy - 8); h.lineTo(x + 9, yy - 8); h.lineTo(x, yy + 6); }
    else { const s = diff > 0 ? -1 : 1, x = cx + s * Math.min(360, W * 0.36); h.moveTo(x + s * 10, y); h.lineTo(x - s * 6, y - 9); h.lineTo(x - s * 6, y + 9); }
    h.closePath(); h.stroke(); h.fill();
  };

  // ── 걸어서 다닐 길 (봇용): 1m 격자 A* (벽·진열대·계산대·팔레트를 0.45m 넓혀 막음), 마트와 앞 주차장 일부 ──
  const GX0 = 144, GX1 = 196, GZ0 = -196, GZ1 = -140, nx = GX1 - GX0, nz = GZ1 - GZ0; let block = null;
  let exitFlow = null;
  function buildNav() {
    block = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = GX0 + i + 0.5, z = GZ0 + j + 0.5; block[i * nz + j] = ZK.world.freeSpot(x, z, 0.45) ? 0 : 1; }
    // 입구로 나오는 거리 지도 (정문 바깥 2~4m 띠에서 퍼짐) — 고정이라 한 번만
    exitFlow = new Uint16Array(nx * nz).fill(65535); const q = new Int32Array(nx * nz); let h = 0, t = 0;
    for (let x = DOOR[0]; x < DOOR[1]; x++) for (let zz = Z1 + 2; zz < Z1 + 4; zz++) { const i = Math.floor(x - GX0), j = Math.floor(zz - GZ0); if (i >= 0 && j >= 0 && i < nx && j < nz && !block[i * nz + j]) { exitFlow[i * nz + j] = 0; q[t++] = i * nz + j; } }
    while (h < t) { const c = q[h++], i = (c / nz) | 0, j = c % nz, v = exitFlow[c] + 1;
      if (i > 0 && !block[c - nz] && exitFlow[c - nz] > v) { exitFlow[c - nz] = v; q[t++] = c - nz; }
      if (i < nx - 1 && !block[c + nz] && exitFlow[c + nz] > v) { exitFlow[c + nz] = v; q[t++] = c + nz; }
      if (j > 0 && !block[c - 1] && exitFlow[c - 1] > v) { exitFlow[c - 1] = v; q[t++] = c - 1; }
      if (j < nz - 1 && !block[c + 1] && exitFlow[c + 1] > v) { exitFlow[c + 1] = v; q[t++] = c + 1; } }
  }
  const cellOf = p => [clamp(Math.floor(p.x - GX0), 0, nx - 1), clamp(Math.floor(p.z - GZ0), 0, nz - 1)];
  R.path = function (from, to) {
    if (!block) return [to.clone()];
    let [si, sj] = cellOf(from), [ti, tj] = cellOf(to);
    const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && !block[i * nz + j];
    const snap = (i, j) => { if (free(i, j)) return [i, j]; for (let r = 1; r < 4; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (free(i + a, j + b)) return [i + a, j + b]; return [i, j]; };
    [si, sj] = snap(si, sj); [ti, tj] = snap(ti, tj);
    const K = (i, j) => i * nz + j, g0 = new Float32Array(nx * nz).fill(1e9), prev = new Int32Array(nx * nz).fill(-1), open = [[si, sj, 0]];
    g0[K(si, sj)] = 0;
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][2] < open[bi][2]) bi = k;
      const [i, j] = open.splice(bi, 1)[0]; if (i === ti && j === tj) break;
      for (const [a, b, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
        const ni = i + a, nj = j + b; if (!free(ni, nj) || (a && b && (!free(i + a, j) || !free(i, j + b)))) continue;
        const ng = g0[K(i, j)] + c; if (ng < g0[K(ni, nj)]) { g0[K(ni, nj)] = ng; prev[K(ni, nj)] = K(i, j); open.push([ni, nj, ng + Math.hypot(ni - ti, nj - tj)]); }
      }
    }
    const cells = []; let k = K(ti, tj); if (prev[k] < 0 && k !== K(si, sj)) return [to.clone()];
    while (k >= 0) { cells.push(k); k = prev[k]; } cells.reverse();
    // 줄이기: 4칸마다 하나 + 마지막
    const pts = []; for (let n = 3; n < cells.length; n += 4) { const c = cells[n]; pts.push(new T.Vector3(GX0 + Math.floor(c / nz) + 0.5, 0, GZ0 + (c % nz) + 0.5)); }
    pts.push(to.clone().setY(0)); return pts;
  };
  // ── 좀비 길찾기: 플레이어 칸에서 퍼지는 거리 지도(0.4초마다 한 번) — 쫓는 놈은 거리가 줄어드는 옆 칸으로 걷는다 ──
  // 직선으로만 오던 놈들이 진열대 뒤에 몇십 초씩 붙어 있었다(봇은 그 너머로 총만 쏘다 소리로 더 깨움). 칸마다 A*를 돌리지 않고 지도 하나를 함께 쓴다
  let flow = null, flowT = 0;
  const INF = 65535;
  function updateFlow(dt, g) {
    const ps = ZK.player.state, inGrid = g.mode === 'foot' && ps.pos.x > GX0 - 2 && ps.pos.x < GX1 + 2 && ps.pos.z > GZ0 - 2 && ps.pos.z < GZ1 + 2;
    if (!inGrid || !block) { flow = null; return; }
    if ((flowT -= dt) > 0 && flow) return; flowT = 0.4;
    if (!flow) flow = new Uint16Array(nx * nz);
    flow.fill(INF);
    let [si, sj] = cellOf(ps.pos);
    if (block[si * nz + sj]) { let f = null; for (let r = 1; r < 3 && !f; r++) for (let a = -r; a <= r && !f; a++) for (let b = -r; b <= r && !f; b++) { const i = si + a, j = sj + b; if (i >= 0 && j >= 0 && i < nx && j < nz && !block[i * nz + j]) f = [i, j]; } if (f) [si, sj] = f; }
    const q = new Int32Array(nx * nz); let h = 0, t = 0; q[t++] = si * nz + sj; flow[si * nz + sj] = 0;
    while (h < t) { const c = q[h++], i = (c / nz) | 0, j = c % nz, v = flow[c] + 1;
      if (i > 0 && !block[c - nz] && flow[c - nz] > v) { flow[c - nz] = v; q[t++] = c - nz; }
      if (i < nx - 1 && !block[c + nz] && flow[c + nz] > v) { flow[c + nz] = v; q[t++] = c + nz; }
      if (j > 0 && !block[c - 1] && flow[c - 1] > v) { flow[c - 1] = v; q[t++] = c - 1; }
      if (j < nz - 1 && !block[c + 1] && flow[c + 1] > v) { flow[c + 1] = v; q[t++] = c + 1; } }
  }
  R.updateFlow = updateFlow;
  // g.targetFor가 부른다: 쫓는 중이고 목표가 걸어 다니는 플레이어일 때만 (코앞 2.2m면 그대로 → 때린다)
  R.routeTarget = function (z, t) {
    if (z.aware !== 'chase' || !block) return t;
    const i = Math.floor(z.pos.x - GX0), j = Math.floor(z.pos.z - GZ0); if (i < 0 || j < 0 || i >= nx || j >= nz) return t;
    // 지도 고르기: 플레이어가 걸어서 마트 칸 안 → 플레이어 거리 지도. 아니면(버스에 탔거나 멀리) 건물 안의 놈은 입구로 나오는 지도
    // (검수: 버스로 돌아간 뒤 안에서 깬 놈들이 정문 벽·진열대에 판 끝까지 붙어 있었다)
    let F = null; if (flow && t.kind === 'player') F = flow; else if (exitFlow && R.inside(z.pos)) F = exitFlow;
    if (!F) return t;
    const here = F[i * nz + j];
    if (F === flow && (here <= 2 || Math.hypot(t.x - z.pos.x, t.z - z.pos.z) < 1.2)) return t;   // 길로 2칸 안이면 곧장(때리기) — 직선 2.2m 규칙은 진열대 너머에서도 곧장 가다 막혔다
    let best = here, bi = -1, bj = -1;
    const ok = (a, b) => a >= 0 && b >= 0 && a < nx && b < nz && !block[a * nz + b];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue; const ni = i + a, nj = j + b; if (!ok(ni, nj) || (a && b && (!ok(i + a, j) || !ok(i, j + b)))) continue;
      const v = F[ni * nz + nj] + (a && b ? 0.4 : 0); if (v < best) { best = v; bi = ni; bj = nj; }
    }
    if (bi < 0) return t;
    return { x: GX0 + bi + 0.5, z: GZ0 + bj + 0.5, kind: 'point' };   // 길 점은 때리지 않고 걸어가기만
  };
})();
