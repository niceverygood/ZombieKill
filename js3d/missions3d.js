// 판마다 다른 임무 3개(5종 중 무작위) + 10:00 헬기 탈출 + 폭발 드럼통 + 화염병 불길 + 목표 나침반
// "10분 버티기"만 있던 판에 '지금 할 일'과 '판마다 다른 흐름'을 준다. 임무 보상(카드·산탄총·물자)이 성장의 큰 축
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const M = {};
  let scene, fireTex, smokeTex;
  const INFO = {
    supply: { name: '보급 헬기', goal: '떨어진 보급 상자를 챙겨라' },
    gas: { name: '주유소 습격', goal: '버스를 노란 원 안에 세우고 12초 버텨라' },
    escort: { name: '생존자 호송', goal: '생존자를 태워 안전지대로' },
    host: { name: '숙주 처치', goal: '좀비를 낳는 숙주를 죽여라' },
    butcher: { name: '도살자 사냥', goal: '도살자를 쓰러뜨려라' },
  };
  // 두 갈래 무전 (2026-11-09): 0:40 · 3:10 · 5:40에 아직 성공 못 한 종류 중 둘을 동시에 제안 — A 일반(노란 빛기둥 35~55m) / B 위험(붉은 빛기둥 50~70m)
  // 그쪽 25m 안에 들어가거나, 초속 2m 이상으로 움직이며 그쪽 ±20°를 누적 3초 바라보면 선택 · 20초 안에 안 고르면 A · 제한 시간 85초는 고른 순간부터
  const AT = [40, 190, 340], LIMIT = 85, LZ_T = 510, HELI_T = 600, LEAVE_T = 630, LZ_R = 10, OFFER_T = 20, PICK_R = 25, LOOK_T = 3, LOOK_ANG = 20 * Math.PI / 180;
  // 주유소·착륙장 후보: 반경 9m 이상 비어 있는 곳만 (예전 네 귀퉁이 중 (52,52)는 바로 옆이 막혀 착륙장에 못 들어가는 판이 나왔다)
  const CORNERS = [[-52, -52], [-30, -60], [30, 60], [-60, -30], [-25, 45], [25, -45], [-45, -25], [45, 25]];
  M.INFO = INFO; M.HELI_T = HELI_T; M.LEAVE_T = LEAVE_T;
  // ── 도시 덫 (2026-11-09): 확성기 트럭 4대(가게 벽 앞) + 트럭 뒤 LPG통 2개씩 + 한글 네온 간판 8개(트럭 위 4 · 수색 셔터 위 4) ──
  // 트럭 후보: 북·남쪽 벽 앞 x ∈ {−53, −35, 35, 53}, 서·동쪽 벽 앞 z ∈ {−39, 39} (수색 셔터와 겹치지 않는 자리). n = 벽에서 광장 쪽 방향
  const TRUCK_SPOTS = [];
  for (const x of [-53, -35, 35, 53]) { TRUCK_SPOTS.push({ x, z: -76, nx: 0, nz: 1 }); TRUCK_SPOTS.push({ x, z: 76, nx: 0, nz: -1 }); }
  for (const z of [-39, 39]) { TRUCK_SPOTS.push({ x: -76, z, nx: 1, nz: 0 }); TRUCK_SPOTS.push({ x: 76, z, nx: -1, nz: 0 }); }
  const SIGN_WORDS = ['치킨', '노래방', 'PC방', '약국', '국밥', '24시', '편의점', '세탁소'];
  const TRUCK_COLOR = 0x2a5aa8;

  function glowTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
  }
  const beamMat = col => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false });
  const ringMat = col => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false });
  let beam, beamR, ring, lzBeam, lzRing, crate, chute, group3, heli, rotor;
  const smoke = [];

  M.init = function (sc) {
    scene = sc;
    fireTex = glowTex([[0, 'rgba(255,240,180,1)'], [0.35, 'rgba(255,140,40,0.8)'], [1, 'rgba(200,40,0,0)']]);
    smokeTex = glowTex([[0, 'rgba(160,255,170,0.8)'], [0.5, 'rgba(90,200,110,0.35)'], [1, 'rgba(40,120,60,0)']]);
    beam = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 60, 12, 1, true), beamMat(0xffd23a)); beam.position.y = 30; scene.add(beam);
    beamR = new T.Mesh(new T.CylinderGeometry(0.85, 0.85, 60, 12, 1, true), beamMat(0xff3a2a)); beamR.position.y = 30; scene.add(beamR);   // 위험 임무 빛기둥
    ring = new T.Mesh(new T.RingGeometry(6.6, 7, 48), ringMat(0xffd23a)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
    lzBeam = new T.Mesh(new T.CylinderGeometry(1, 1, 60, 12, 1, true), beamMat(0x5aff7a)); lzBeam.position.y = 30; scene.add(lzBeam);
    lzRing = new T.Mesh(new T.RingGeometry(LZ_R - 0.5, LZ_R, 56), ringMat(0x5aff7a)); lzRing.rotation.x = -Math.PI / 2; lzRing.position.y = 0.03; scene.add(lzRing);
    for (let i = 0; i < 14; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); s.userData.ph = rand(0, 6); scene.add(s); smoke.push(s); }
    // 보급 상자 + 낙하산
    crate = new T.Group(); scene.add(crate);
    const box = (w, h, d, c, x, y, z, p) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); p.add(m); return m; };
    box(1.1, 0.8, 1.1, 0x3a5a3a, 0, 0.4, 0, crate); box(1.14, 0.12, 1.14, 0x222, 0, 0.82, 0, crate);
    chute = new T.Mesh(new T.ConeGeometry(2.4, 1.4, 10, 1, true), new T.MeshLambertMaterial({ color: 0xd8d0b8, side: T.DoubleSide })); chute.position.y = 4.4; crate.add(chute);
    // 호송할 생존자 셋 (손 흔들기 없이 모여 서 있음)
    group3 = new T.Group(); scene.add(group3);
    for (let i = 0; i < 3; i++) { const a = i * 2.1; box(0.36, 0.6, 0.22, 0x2a6a4a, Math.cos(a) * 0.9, 1.2, Math.sin(a) * 0.9, group3); box(0.3, 0.85, 0.2, 0x2a2d33, Math.cos(a) * 0.9, 0.45, Math.sin(a) * 0.9, group3);
      const hd = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshLambertMaterial({ color: 0xc48a66 })); hd.position.set(Math.cos(a) * 0.9, 1.65, Math.sin(a) * 0.9); group3.add(hd); }
    // 탈출 헬기 (상자 몇 개로 만든 실루엣 + 회전 날개)
    heli = new T.Group(); scene.add(heli);
    box(2.2, 1.6, 4.4, 0x2e3a2a, 0, 0, 0, heli); box(0.5, 0.5, 3.6, 0x2e3a2a, 0, 0.3, 3.8, heli); box(1.8, 0.9, 1.4, 0x0e1418, 0, 0.3, -1.9, heli);
    rotor = new T.Group(); rotor.position.y = 1.05; heli.add(rotor); box(9, 0.06, 0.3, 0x111, 0, 0, 0, rotor); box(0.3, 0.06, 9, 0x111, 0, 0, 0, rotor);
    const hl = new T.PointLight(0x9affb0, 1.4, 30, 1.5); hl.position.y = -1; heli.add(hl);
    hideAll();
  };
  function hideAll() { for (const o of [beam, beamR, ring, lzBeam, lzRing, crate, group3, heli]) o.visible = false; smoke.forEach(s => s.visible = false); }

  // ───────── 판 초기화 ─────────
  M.reset = function (g) {
    hideAll();
    M.list = []; M.offer = null; M.offerIdx = 0; M.doneKinds = new Set(); M.riskyDone = 0; M.riskyPicked = 0; M.knife = false;   // M.list: 고른(시작한) 임무들
    for (let i = 0; i < group3.children.length; i++) group3.children[i].visible = true;   // 지난 판에 쓰러진 생존자 복구
    M.cur = null; M.done = 0; M.failed = 0; M.flash = null; M.lz = null; M.heliY = 40; M.won = false;
    for (const b of M.barrels || []) removeBarrel(b);
    for (const f of M.fires || []) killFire(f);
    for (const p of M.proj || []) scene.remove(p.mesh);
    for (const t of M.trucks || []) { if (t.car.alive) ZK.world.removeCar(t.car); const i = ZK.world.cars.indexOf(t.car); if (i >= 0) ZK.world.cars.splice(i, 1); }   // 지난 판 트럭 항목도 목록에서 정리
    for (const sg of M.signs || []) removeSign(sg);
    M.barrels = []; M.fires = []; M.proj = []; M.trucks = []; M.signs = []; M.pend = []; M.trapN = 0; M.signDrops = 0; M.truckOn = 0; M.trap = null;
    // 확성기 트럭 4대: 시작점에서 30m 이상, 서로 25m 이상 · 각 트럭 뒤(벽 쪽)에 LPG통 2개 · 위에 네온 간판
    const spots = TRUCK_SPOTS.filter(sp => Math.hypot(sp.x, sp.z - 6) >= 30 && ZK.world.freeSpot(sp.x, sp.z, 3)).sort(() => Math.random() - 0.5), words = SIGN_WORDS.slice().sort(() => Math.random() - 0.5);
    for (const sp of spots) { if (M.trucks.length >= 4) break; if (M.trucks.some(t => Math.hypot(t.pos.x - sp.x, t.pos.z - sp.z) < 25)) continue; addTruck(sp, words.pop()); }
    // 셔터 4곳 위에도 간판 (경비 좀비 처리용)
    for (const p of ZK.needs.points.filter(q => q.name === '상점 셔터' && !M.trucks.some(t => t.pos.distanceTo(q.pos) < 9)).sort(() => Math.random() - 0.5).slice(0, 4)) {
      const nx = Math.abs(p.pos.x) > Math.abs(p.pos.z) ? -Math.sign(p.pos.x) : 0, nz = nx ? 0 : -Math.sign(p.pos.z);
      addSign(p.pos.x - nx * 3.6, p.pos.z - nz * 3.6, nx, nz, words.pop() || '치킨');
    }
    // 일반 드럼통 6개 (LPG 8개와 합쳐 14개): 쏘거나 들이받으면 반경 5.5m 폭발 + 불길 4초
    for (let i = 0, tries = 0; i < 6 && tries < 400; tries++) {
      const x = rand(-68, 68), z = rand(-68, 68);
      if (Math.hypot(x, z - 6) < 16 || !ZK.world.freeSpot(x, z, 1.6) || M.barrels.some(b => Math.hypot(b.pos.x - x, b.pos.z - z) < 8)) continue;
      addBarrel(x, z); i++;
    }
    // 상점 셔터 중 8곳 앞에는 배회 좀비 2~3마리가 지키고 있다 (뒤지는 소리에 깬다)
    const shops = ZK.needs.points.filter(p => p.name === '상점 셔터').sort(() => Math.random() - 0.5).slice(0, 8);
    for (const p of shops) for (let i = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); i < n; i++) {
      const a = rand(0, 6.283), r = rand(2.5, 6), x = clamp(p.pos.x + Math.cos(a) * r, -75, 75), zz = clamp(p.pos.z + Math.sin(a) * r, -75, 75);
      const z = g.spawnZ('walker', new T.Vector3(x, 0, zz), 'wander'); z.guard = true;
    }
  };
  function addBarrel(x, z, kind = 'drum', truck = null, y = 0) {
    const grp = new T.Group(); grp.position.set(x, y, z); scene.add(grp); let body;
    if (kind === 'lpg') {   // LPG통: 흰 원통 + 빨간 띠 + 밸브 · 반경 6.5m · 피해 260
      body = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 1.15, 14), new T.MeshLambertMaterial({ color: 0xd8d8d0, emissive: 0x1a1a18 })); body.position.y = 0.58; grp.add(body);
      const band = new T.Mesh(new T.CylinderGeometry(0.31, 0.31, 0.12, 14), new T.MeshLambertMaterial({ color: 0xb8241c })); band.position.y = 0.8; grp.add(band);
      const valve = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.16, 8), new T.MeshLambertMaterial({ color: 0x333 })); valve.position.y = 1.22; grp.add(valve);
    } else {
      body = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.95, 14), new T.MeshLambertMaterial({ color: 0xa8241c, emissive: 0x2a0400 })); body.position.y = 0.48; grp.add(body);
      for (const y of [0.2, 0.75]) { const band = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.05, 14), new T.MeshLambertMaterial({ color: 0x1a1a1a })); band.position.y = y; grp.add(band); }
    }
    const b = { grp, body, pos: grp.position, alive: true, kind, truck, r: kind === 'lpg' ? 6.5 : 5.5, dmg: kind === 'lpg' ? 260 : 220 }; body.userData.barrel = b;
    ZK.world.solids.push(body); M.barrels.push(b); return b;
  }
  // 확성기 트럭: 쏘면 16초 동안 1.5초마다 반경 45m 방송(소음 게이지는 오르지 않음) → 근처 좀비가 트럭으로 모이고, 그사이 터지는 포위도 트럭으로 간다
  // 버스로 들이받으면 폐차처럼 흡수(장갑판 2장 · 연료 +6) — 대신 그 트럭의 덫은 사라진다
  function addTruck(sp, word) {
    const W = ZK.world, grp = new T.Group(); grp.position.set(sp.x, 0, sp.z); grp.rotation.y = sp.nx ? Math.PI / 2 : 0; scene.add(grp);
    const t = { pos: grp.position, sp, used: false, active: 0, speakT: 0, absorbed: false };
    const body = new T.MeshLambertMaterial({ color: TRUCK_COLOR }), dark = new T.MeshLambertMaterial({ color: 0x15171a }), meshes = [];
    const box = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.userData.truck = t; grp.add(o); W.solids.push(o); meshes.push(o); return o; };
    box(1.6, 1.5, 1.9, body, 1.6, 1.2, 0); box(1.55, 0.55, 1.85, dark, 1.75, 1.6, 0);          // 운전석 + 앞유리
    box(3.2, 0.25, 2.0, body, -0.8, 0.75, 0); box(3.2, 0.5, 0.08, body, -0.8, 1.1, 0.96); box(3.2, 0.5, 0.08, body, -0.8, 1.1, -0.96); box(0.08, 0.5, 2.0, body, -2.4, 1.1, 0);   // 짐칸
    box(0.9, 0.6, 1.3, new T.MeshLambertMaterial({ color: 0x6a5a48 }), -1.2, 1.15, 0);       // 실린 고물
    const horn = new T.Mesh(new T.ConeGeometry(0.28, 0.5, 10, 1, true), new T.MeshLambertMaterial({ color: 0xd8d8d0, side: T.DoubleSide })); horn.rotation.z = -Math.PI / 2; horn.position.set(1.6, 2.35, 0); horn.userData.truck = t; grp.add(horn); W.solids.push(horn); meshes.push(horn);
    for (const [x, z] of [[1.6, 0.95], [1.6, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) { const w = new T.Mesh(new T.CylinderGeometry(0.38, 0.38, 0.25, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.38, z); grp.add(w); }
    grp.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(grp), col = { minX: bb.min.x - 0.05, maxX: bb.max.x + 0.05, minZ: bb.min.z - 0.05, maxZ: bb.max.z + 0.05, h: bb.max.y };
    W.colliders.push(col);
    t.car = { group: grp, col, meshes, pos: grp.position, color: TRUCK_COLOR, alive: true, truck: t }; W.cars.push(t.car);
    t.hornPos = new T.Vector3(); horn.getWorldPosition(t.hornPos); t.cabPos = new T.Vector3(1.6, 1.2, 0).applyAxisAngle(new T.Vector3(0, 1, 0), grp.rotation.y).add(grp.position);   // 운전석 가운데(봇 조준용)
    // LPG통 2개는 짐칸 위 (고물 트럭이 싣고 다니는 가스통 — 광장에서 잘 보이게. 처음엔 벽 쪽 뒤에 숨겨 놔서 쏠 수가 없었다) · 벽 위 간판
    for (const s of [-0.55, 0.55]) { const wp = new T.Vector3(-0.2, 0, s).applyAxisAngle(new T.Vector3(0, 1, 0), grp.rotation.y).add(grp.position); t.lpg = (t.lpg || []).concat(addBarrel(wp.x, wp.z, 'lpg', t, 0.88)); }
    t.sign = addSign(sp.x - sp.nx * 4, sp.z - sp.nz * 4, sp.nx, sp.nz, word);
    M.trucks.push(t); return t;
  }
  M.hitTruck = function (t, g) {
    if (t.used || t.absorbed) { ZK.audio.ting && ZK.audio.ting(); return false; }
    t.used = true; t.active = 16; t.speakT = 0; M.truckOn++;
    g.onNotice('확성기가 켜졌다 — 좀비가 트럭으로 몰려든다', '#5a9aff');
    if (g.noiseM >= 60 && g.hordeClock >= 25) { g.forceHorde = true; }   // 소음이 찬 상태에서 켜면 포위를 지금 트럭으로 불러낸다
    return true;
  };
  M.lure = () => { const t = (M.trucks || []).filter(x => x.active > 0 && !x.absorbed).sort((a, b) => b.active - a.active)[0]; return t ? t.pos : null; };
  // 한글 네온 간판: 볼트 2개(반지름 0.22m)를 쏘면 하나는 처지고, 둘 다 끊으면 0.7초 만에 앞으로 떨어져 아래(벽 앞 3.2m, 반경 2.8m)에 320 피해
  function neonTex(word) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80; const x = c.getContext('2d');
    x.fillStyle = '#0b0b10'; x.fillRect(0, 0, 256, 80); const col = ['#ff3aa8', '#3af0ff', '#ffe23a', '#7dff6a'][(Math.random() * 4) | 0];
    x.font = '900 52px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = col; x.shadowBlur = 18; x.fillStyle = col; x.fillText(word, 128, 42); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.6; x.fillText(word, 128, 42);
    x.globalAlpha = 1; x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(4, 4, 248, 72);
    return new T.CanvasTexture(c);
  }
  function addSign(wx, wz, nx, nz, word) {
    const grp = new T.Group(); grp.position.set(wx + nx * 0.16, 4.6, wz + nz * 0.16); grp.lookAt(grp.position.x + nx, 4.6, grp.position.z + nz); scene.add(grp);
    const pivot = new T.Group(); pivot.position.y = -0.45; grp.add(pivot);
    const tex = neonTex(word), side = new T.MeshLambertMaterial({ color: 0x222228 }), front = new T.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1 });
    const board = new T.Mesh(new T.BoxGeometry(3.0, 0.9, 0.12), [side, side, side, side, front, side]); board.position.y = 0.45; pivot.add(board);
    const sg = { grp, pivot, front, start: grp.position.clone(), n: new T.Vector3(nx, 0, nz), cut: 0, fall: -1, landed: false, bolts: [], drop: new T.Vector3(wx + nx * 3.2, 0, wz + nz * 3.2) };
    for (const s of [-1.3, 1.3]) {
      const m = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshLambertMaterial({ color: 0x8a8a80, emissive: 0xffc81a, emissiveIntensity: 0.6 }));
      m.position.set(s, 0.95, 0.12); pivot.add(m); const b = { mesh: m, sign: sg, alive: true, side: s }; m.userData.bolt = b; ZK.world.solids.push(m); sg.bolts.push(b);
    }
    M.signs.push(sg); return sg;
  }
  function removeSign(sg) { scene.remove(sg.grp); for (const b of sg.bolts) { const i = ZK.world.solids.indexOf(b.mesh); if (i >= 0) ZK.world.solids.splice(i, 1); } }
  M.hitBolt = function (b, g) {
    if (!b.alive) return; b.alive = false; b.mesh.visible = false; const i = ZK.world.solids.indexOf(b.mesh); if (i >= 0) ZK.world.solids.splice(i, 1);
    const wp = new T.Vector3(); b.mesh.getWorldPosition(wp); ZK.fx3.sparks(wp, new T.Vector3(0, -1, 0), 10); ZK.audio.ting && ZK.audio.ting();
    const sg = b.sign; sg.cut++;
    if (sg.cut === 1) sg.pivot.rotation.z = b.side > 0 ? -0.22 : 0.22;   // 한쪽만 끊으면 처진다
    else if (sg.fall < 0) sg.fall = 0;
  };
  function removeBarrel(b) { scene.remove(b.grp); const i = ZK.world.solids.indexOf(b.body); if (i >= 0) ZK.world.solids.splice(i, 1); b.alive = false; }

  // ───────── 폭발 · 불길 ─────────
  M.blowBarrel = function (b, g, src = 'player') {
    if (!b.alive) return; removeBarrel(b);
    const p = b.pos.clone();
    // 함정: 트럭 7m 안에 8마리 이상 모였을 때 그 트럭의 LPG가 터지면 큰 연출 한 번 ("함정 발동! ×N" · 슬로모 0.4초 · 1초 동안 OVERKILL 글자 끔)
    // 흡수된 트럭의 LPG는 평범한 통
    const t = b.truck && !b.truck.absorbed ? b.truck : null, crowd = t ? g.zombies.filter(z => z.alive && Math.hypot(z.pos.x - t.pos.x, z.pos.z - t.pos.z) < 7).length : 0;
    const trap = !!t && crowd >= 8, again = M.trap && M.trap.t > 0 && M.trap.truck === t;
    if (trap || again) g.quietT = 1;
    g.boom(p, b.kind === 'lpg' ? 1.4 : 1.2); const kills = g.blast(p, b.r, b.dmg, src); g.noise('barrel', p); addFire(p, b.kind === 'lpg' ? 4 : 3.2, 4);
    const F = ZK.fort.state; if (F.pos.distanceTo(p) < b.r + 0.5 + F.halfL * 0.5) ZK.fort.hurt(14);
    if (g.mode === 'foot') { const d = ZK.player.state.pos.distanceTo(p); if (d < b.r) { g.hp -= 35 * (1 - d / b.r); g.regenT = 4; g.hurtA = 1; } }
    // 함정 배너는 임무 완료 배너를 덮지 않는다 (그땐 아래 줄에 덧붙임)
    const trapFlash = n => { if (!M.flash || M.flash.trap) M.flash = { text: `함정 발동! ×${n}`, sub: '확성기 트럭 덫', t: 2.2, col: '#ff8a2a', trap: true }; else if (!String(M.flash.sub || '').includes('함정')) M.flash.sub = (M.flash.sub ? M.flash.sub + ' · ' : '') + `함정 발동! ×${n}`; };
    if (again) { M.trap.n += kills; trapFlash(M.trap.n); }
    else if (trap) { M.trap = { truck: t, n: kills, t: 1.2 }; M.trapN++; trapFlash(kills); ZK.fx3.slowmo(0.35, 0.4); }
    else ZK.fx3.text(p.clone().setY(2.6), 'BOOM!', '#ff8a2a', 40, 0.8);
    for (const o of M.barrels) if (o.alive && o.pos.distanceTo(p) < 4) M.pend.push({ b: o, t: 0.15, src });   // 옆 통도 0.15초 뒤 연쇄 폭발
  };
  function addFire(p, r, life) {
    const f = { pos: p.clone().setY(0), r, life, t: 0, tick: 0, sprites: [] };
    f.light = new T.PointLight(0xff7a2a, 2.6, r * 5, 1.5); f.light.position.set(p.x, 1.6, p.z); scene.add(f.light);
    for (let i = 0; i < 10; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      const a = rand(0, 6.283), rr = Math.sqrt(Math.random()) * r * 0.85; s.position.set(p.x + Math.cos(a) * rr, rand(0.4, 1.2), p.z + Math.sin(a) * rr); s.userData.base = rand(0.9, 1.7); s.userData.ph = rand(0, 6); scene.add(s); f.sprites.push(s); }
    M.fires.push(f); return f;
  }
  function killFire(f) { scene.remove(f.light); f.sprites.forEach(s => scene.remove(s)); }
  // 화염병: T로 던짐 (가진 게 없으면 술병+천+연료 5로 즉석 제작)
  M.throwMolotov = function (g, cam) {
    const N = ZK.needs, inv = N.inv;
    if (inv.molotov > 0) inv.molotov--;
    else if (inv.bottle > 0 && inv.cloth > 0 && N.s.fuel >= 5) { inv.bottle--; inv.cloth--; N.s.fuel -= 5; }
    else { N.msg = { text: '화염병이 없다 (술병 + 천 + 연료로 만들 수 있다)', t: 1.6 }; return false; }
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    const mesh = new T.Group(); const bottle = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.28, 8), new T.MeshLambertMaterial({ color: 0x3a6a3a })); mesh.add(bottle);
    const fl = new T.Sprite(new T.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); fl.scale.setScalar(0.5); fl.position.y = 0.2; mesh.add(fl);
    mesh.position.copy(cam.position).addScaledVector(dir, 0.6); scene.add(mesh);
    M.proj.push({ mesh, v: dir.multiplyScalar(17).add(new T.Vector3(0, 3.5, 0)), t: 0 });
    ZK.audio.cylIn && ZK.audio.cylIn(); return true;
  };

  // ───────── 임무 ─────────
  const F = () => ZK.fort.state;
  // 무전으로 제안된 자리(m.pos)에서 시작 · 위험(m.risky) 버전은 규칙이 더 세다
  function start(m, g) {
    M.cur = m; m.state = 'active'; m.t = 0; const info = INFO[m.kind], R = !!m.risky;
    if (m.kind === 'supply') { m.y = 26; m.landed = false; crate.visible = true; chute.visible = true; crate.position.set(m.pos.x, m.y, m.pos.z); }
    if (m.kind === 'gas') { m.prog = 0; m.sirenT = 0; m.need = R ? 18 : 12; ring.visible = true; ring.position.set(m.pos.x, 0.03, m.pos.z);
      if (R) for (let i = 0; i < 3; i++) { const a = i * 2.094 + rand(-0.3, 0.3), x = clamp(m.pos.x + Math.cos(a) * 8.5, -74, 74), z = clamp(m.pos.z + Math.sin(a) * 8.5, -74, 74); if (ZK.world.freeSpot(x, z, 1)) addBarrel(x, z); } }   // 원 둘레 드럼통 3개
    if (m.kind === 'escort') { m.phase = 'pick'; m.surv = 3; m.survT = 0; group3.visible = true; group3.position.copy(m.pos); for (const c of group3.children) c.visible = true;
      if (R) for (let i = 0; i < 10; i++) { const a = rand(0, 6.283), r = rand(5, 10), z = g.spawnZ('walker', new T.Vector3(clamp(m.pos.x + Math.cos(a) * r, -75, 75), 0, clamp(m.pos.z + Math.sin(a) * r, -75, 75)), 'alert'); z.alertPos.copy(m.pos); z.alertT = 60; z.guard = true; } }   // 이미 워커 10마리가 생존자를 노린다 (경비 표시: 멀어져도 디렉터가 지우지 않음)
    if (m.kind === 'host') { m.z = g.spawnZ('host', m.pos); m.pos = m.z.pos; m.spawnT = 2; m.kids = 0; m.spawnInt = R ? 2 : 2.5;
      if (R) { const k = 1 + g.t / 220; m.z.hp = m.z.maxHp = Math.round(900 * k);   // 위험: HP 900 · 덩치 호위 2 · 2초마다 낳는다
        for (let i = 0; i < 2; i++) { const a = rand(0, 6.283), b = g.spawnZ('brute', new T.Vector3(clamp(m.pos.x + Math.cos(a) * 5, -75, 75), 0, clamp(m.pos.z + Math.sin(a) * 5, -75, 75)), 'wander'); b.guard = true; } } }
    if (m.kind === 'butcher') { m.z = g.spawnZ('butcher', m.pos); m.pos = m.z.pos; m.z.enrageAt = R ? 0.5 : 0; ZK.audio.shriek && ZK.audio.shriek(0, 1.2); }
    (R ? beamR : beam).visible = true;
    g.onNotice(`${R ? '위험 임무' : '임무'}: ${info.name} — ${info.goal}`, R ? '#ff6a4a' : '#ffd23a'); ZK.audio.notice && ZK.audio.notice();
  }
  // ── 무전 제안 ──
  const SEP = 70 * Math.PI / 180, MIN_D = PICK_R + 8;   // 제안 지점은 고르는 반경(25m)보다 8m 이상 떨어지게 → 뜨자마자 저절로 골리지 않는다
  function pickPos(kind, risky, P, avoid, g) {
    const lo = risky ? 50 : 35, hi = risky ? 70 : 55, angOf = v => Math.atan2(v.z - P.z, v.x - P.x);
    const far = v => !avoid || Math.abs(Math.atan2(Math.sin(angOf(v) - angOf(avoid)), Math.cos(angOf(v) - angOf(avoid)))) >= SEP;
    if (kind === 'gas') {   // 주유소: 반경 6m 이상 빈 귀퉁이 — 거리대에 가깝고 다른 선택지와 방향이 갈리는 곳
      const c = CORNERS.map(([x, z]) => new T.Vector3(x, 0, z)).filter(v => ZK.world.freeSpot(v.x, v.z, 6) && v.distanceTo(P) >= MIN_D && (!avoid || v.distanceTo(avoid) > 20));
      c.sort((a, b) => (far(b) - far(a)) || (Math.abs(a.distanceTo(P) - (lo + hi) / 2) - Math.abs(b.distanceTo(P) - (lo + hi) / 2)));
      if (c.length) return c[0];
    }
    let best = null, bestK = -1e9;
    for (let i = 0; i < 10; i++) {
      const v = ZK.world.spawnRing(P, lo, hi); if (!v || Math.hypot(v.x - P.x, v.z - P.z) < MIN_D) continue;   // 맵 가장자리에서 잘린 점은 너무 가까울 수 있다
      let k = far(v) ? 100 : 0;
      if (risky && kind === 'supply') k += g.zombies.filter(z => z.alive && Math.hypot(z.pos.x - v.x, z.pos.z - v.z) < 15).length;   // 위험 보급: 좀비가 가장 많은 곳
      if (k > bestK) { bestK = k; best = v; }
    }
    if (best) return best;
    for (let i = 0; i < 24; i++) { const a = i * 0.2618, v = new T.Vector3(clamp(P.x + Math.cos(a) * lo, -74, 74), 0, clamp(P.z + Math.sin(a) * lo, -74, 74)); if (Math.hypot(v.x - P.x, v.z - P.z) >= MIN_D && ZK.world.freeSpot(v.x, v.z, 1)) return v; }
    return new T.Vector3(P.x > 0 ? -60 : 60, 0, P.z > 0 ? -60 : 60);   // 최후: 반대쪽 귀퉁이
  }
  function makeOffer(g) {
    const left = Object.keys(INFO).filter(k => !M.doneKinds.has(k) && !(k === 'butcher' && g.zombies.some(z => z.alive && z.type === 'butcher'))).sort(() => Math.random() - 0.5);   // 시간 초과로 남은 도살자가 살아 있으면 또 부르지 않는다
    if (!left.length) { M.offerIdx++; return; }
    const P = (g.mode === 'drive' ? F().pos : ZK.player.state.pos).clone(), a = { kind: left[0], risky: false }, b = { kind: left[1] || left[0], risky: true };   // 고르기 판정과 같은 기준점(걸어 다니면 나)
    a.pos = pickPos(a.kind, false, P, null, g); b.pos = pickPos(b.kind, true, P, a.pos, g);
    M.offer = { a, b, t: 0, look: { a: 0, b: 0 }, idx: M.offerIdx++ };
    beam.visible = beamR.visible = true; beam.position.set(a.pos.x, 30, a.pos.z); beamR.position.set(b.pos.x, 30, b.pos.z);
    g.onNotice('긴급 무전 — 두 곳에서 부른다! 노란 빛(일반) / 붉은 빛(위험)', '#ffb24a'); ZK.audio.notice && ZK.audio.notice();
  }
  function choose(key, g) {
    const c = M.offer[key], m = { kind: c.kind, risky: c.risky, pos: c.pos.clone(), state: 'wait', at: Math.round(g.t), how: M.offer.how || 'near' };
    M.offer = null; beam.visible = beamR.visible = false; M.list.push(m); if (m.risky) M.riskyPicked++; start(m, g);
  }
  function updateOffer(dt, g) {
    const o = M.offer, ps = ZK.player.state, drive = g.mode === 'drive', me = drive ? F().pos : ps.pos, spd = drive ? Math.abs(F().speed) : Math.hypot(ps.vel.x, ps.vel.z), yaw = ps.yaw + (ps.lookYaw || 0);
    o.t += dt;
    // 실제로 그쪽으로 다가가는 속도(초속 2m 이상)일 때만 '바라보며 달리기'를 센다 — 지붕에서 뒤를 보며 쏘다가 저절로 골리지 않게
    const fwd = ZK.fort.forward(), vx = drive ? fwd.x * F().speed : ps.vel.x, vz = drive ? fwd.z * F().speed : ps.vel.z;
    for (const key of ['a', 'b']) {
      const c = o[key], d = Math.hypot(c.pos.x - me.x, c.pos.z - me.z);
      if (d < PICK_R && o.t > 1) { o.how = 'near'; return choose(key, g); }
      let diff = Math.atan2(-(c.pos.x - me.x), -(c.pos.z - me.z)) - yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const closing = (vx * (c.pos.x - me.x) + vz * (c.pos.z - me.z)) / Math.max(1, d);
      if (closing >= 2 && Math.abs(diff) < LOOK_ANG) o.look[key] += dt; else o.look[key] = Math.max(0, o.look[key] - dt * 0.5);
      if (o.look[key] >= LOOK_T) { o.how = 'look'; return choose(key, g); }
    }
    beam.material.opacity = 0.18 + Math.sin(ZK.fx3.time * 6) * 0.08; beamR.material.opacity = 0.2 + Math.sin(ZK.fx3.time * 6 + 1) * 0.1;
    if (o.t >= OFFER_T) { o.how = 'timeout'; choose('a', g); }
  }
  // 큰 '임무 완료!' 배너는 위험 임무 성공에만 (일반 성공은 작은 글자) — 빅 모먼트 예산
  function finish(m, ok, g) {
    m.state = ok ? 'done' : 'fail'; M.cur = null; beam.visible = beamR.visible = ring.visible = crate.visible = group3.visible = false;
    if (ok) { M.done++; M.doneKinds.add(m.kind); const text = reward(m, g);
      if (m.risky) { M.riskyDone++; M.flash = { text: '위험 임무 완료!', sub: text + ' · ★ +1', t: 2.8, col: '#ff8a2a' }; ZK.audio.levelUp(); ZK.fx3.trauma(0.3); }
      else { M.flash = { text: '임무 완료', sub: text, t: 2.2, col: '#7dff9a', small: true }; ZK.audio.notice && ZK.audio.notice(); } }
    else { M.failed++; M.flash = { text: '임무 실패', sub: INFO[m.kind].name, t: 2, col: '#ff6a4a', small: !m.risky }; }
  }
  // 보상: 첫 성공에는 산탄총이 함께 온다 (손맛의 두 번째 축) · 카드 1~2장 · 임무별 물자
  function reward(m, g) {
    const N = ZK.needs, out = [], kind = m.kind;
    if (!ZK.gun3.hasShotgun) { ZK.gun3.giveShotgun(); N.give('shell', 8); out.push('산탄총(2번 키) + 산탄 8'); }
    const cards = (kind === 'gas' ? 1 : 2) + (m.risky ? 1 : 0); ZK.surv.grant(cards); out.push(`카드 ${cards}장`);   // 위험 성공은 카드 +1
    if (kind === 'supply') { N.give('shell', 6); N.give('molotov', 2); N.give(Math.random() < 0.5 ? 'anti' : 'pill'); out.push('산탄 6 · 화염병 2 · 약품'); }
    if (kind === 'gas') { N.s.fuel = 100; N.give('fuelcan', 2); N.give('molotov', 2); N.give('shell', 4); out.push('연료 가득 · 연료통 2 · 화염병 2 · 산탄 4'); }
    if (kind === 'escort') {   // 위험 호송에서 셋 다 살리면 사수 +2 (외로운 총잡이 계약 중이면 사수 대신 식량)
      const n = m.risky && m.surv >= 3 ? 2 : 1; let j = 0;
      for (let i = 0; i < n; i++) { if (ZK.surv.contract && ZK.surv.contract.has('lone')) break; if (ZK.fort.addGunner()) j++; }
      if (ZK.surv.contract && ZK.surv.contract.has('lone')) { N.give('can', n); N.give('water', n); out.push(`생존자 ${n} → 통조림·생수 ${n}`); }
      else { if (j < n) ZK.fort.state.hp = Math.min(ZK.fort.state.maxHp, ZK.fort.state.hp + 120 * (n - j)); out.push(j ? `사수 +${j}` : '요새 체력 +120'); }
      ZK.surv.addXP(30); }
    if (kind === 'host') { N.give('shell', 6); N.give('can'); N.give('water'); out.push('산탄 6 · 식량'); }
    if (kind === 'butcher') { N.give('anti'); N.give('molotov', 2); out.push('항생제 · 화염병 2');
      if (m.risky && !M.knife) { M.knife = true; ZK.surv.stats.ramMul *= 1.4; ZK.fort.trophyKnife && ZK.fort.trophyKnife(); out.push('식칼 트로피(들이받기 +40%)'); } }
    return out.join(' · ');
  }
  M.onKill = function (z, g) {
    if (M.cur && M.cur.z === z) { if (z.type === 'host') g.boom(z.pos.clone().setY(1.5), 1.4); finish(M.cur, true, g); }
  };
  const nearBus = (p, pad) => { const L = ZK.fort.local(p), s = F(); return Math.abs(L.lx) < s.halfW + pad && Math.abs(L.lz) < s.halfL + pad; };
  const nearMe = (p, r, g) => g.mode === 'foot' && Math.hypot(ZK.player.state.pos.x - p.x, ZK.player.state.pos.z - p.z) < r;

  M.update = function (dt, g) {
    // 다음 무전 (진행 중인 임무가 있으면 끝날 때까지 미룸)
    if (!M.cur && !M.offer && g.t < LZ_T && M.offerIdx < AT.length && g.t >= AT[M.offerIdx]) makeOffer(g);
    if (M.offer) updateOffer(dt, g);
    const m = M.cur;
    if (m) {
      m.t += dt;
      if (m.kind === 'supply') {
        if (!m.landed) { m.y = Math.max(0, m.y - dt * 4.2); crate.position.y = m.y; crate.rotation.y += dt * 0.6;
          if (m.y <= 0) { m.landed = true; chute.visible = false; ZK.audio.thud(); ZK.fx3.trauma(0.12);
            for (let i = 0, n = m.risky ? 15 : 8; i < n; i++) { const a = rand(0, 6.283), r = rand(12, 18); g.spawnZ(m.risky && i === 0 ? 'brute' : 'walker', new T.Vector3(clamp(m.pos.x + Math.cos(a) * r, -75, 75), 0, clamp(m.pos.z + Math.sin(a) * r, -75, 75)), 'chase'); }   // 위험: 워커 14 + 덩치 1
            g.onNotice('보급 상자 착지! 냄새를 맡고 좀비가 몰려든다', '#ffb24a'); } }
        else if (nearBus(m.pos, 2.4) || nearMe(m.pos, 2.2, g)) finish(m, true, g);
      }
      if (m.kind === 'gas') {
        const s = F(), inBus = s.pos.distanceTo(m.pos) < 7 && Math.abs(s.speed) < 2.5 && g.mode === 'drive', inMe = nearMe(m.pos, 7, g);
        if (inBus || inMe) { m.prog += dt; if ((m.sirenT -= dt) <= 0) { m.sirenT = m.risky ? 2 : 3; g.noise('siren', m.pos); } }   // 급유 펌프 경보음 → 좀비가 몰려옴 (위험: 2초마다)
        if (m.prog >= m.need) finish(m, true, g);
      }
      if (m.kind === 'escort') {
        // 생존자 곁 2.5m 안에 좀비가 2마리 이상이면 3초마다 한 명씩 쓰러진다 (위험 버전은 처음부터 워커 10마리가 둘러싸고 있다)
        if (m.phase === 'pick' && M.cur === m) {
          const near = g.zombies.filter(z => z.alive && Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z) < 2.5).length;
          if (near >= 2 && (m.survT += dt) >= 3) { m.survT = 0; m.surv--; for (let k = 0; k < 3; k++) group3.children[m.surv * 3 + k].visible = false;
            ZK.fx3.blood(m.pos.clone().setY(1.2), new T.Vector3(0, 0.5, 0), 1.2); g.onNotice(m.surv > 0 ? `생존자가 당했다! (남은 ${m.surv}명)` : '생존자 전멸…', '#ff6a4a');
            if (m.surv <= 0) { finish(m, false, g); } }
        }
        if (M.cur !== m) { /* 전멸로 끝남 */ }
        else if (m.phase === 'pick' && (nearBus(m.pos, 4) || nearMe(m.pos, 3, g))) {
          m.phase = 'drop'; group3.visible = false; let best = null;
          for (let i = 0; i < 8; i++) { const c = ZK.world.spawnRing(m.pos, 50, 80); if (!best || c.distanceTo(m.pos) > best.distanceTo(m.pos)) best = c; }
          m.pos = best; ring.visible = true; ring.position.set(m.pos.x, 0.03, m.pos.z); g.onNotice(`생존자 ${m.surv}명 탑승! 노란 원(안전지대)까지 데려가라`, '#7dff9a');
        } else if (m.phase === 'drop' && (F().pos.distanceTo(m.pos) < 8 || nearMe(m.pos, 6, g))) finish(m, true, g);
      }
      if (m.kind === 'host' && m.z.alive && m.z.sacPause > 0) m.z.sacPause -= dt;   // 고름주머니가 터지면 6초 동안 못 낳는다
      else if (m.kind === 'host' && m.z.alive && (m.spawnT -= dt) <= 0 && m.kids < 24) {   // 숙주는 2.5초마다(위험 2초) 한 마리씩 낳는다
        m.spawnT = m.spawnInt || 2.5; m.kids++; const a = rand(0, 6.283), r = rand(4, 8);
        g.spawnZ(Math.random() < 0.3 ? 'runner' : 'walker', new T.Vector3(clamp(m.pos.x + Math.cos(a) * r, -75, 75), 0, clamp(m.pos.z + Math.sin(a) * r, -75, 75)), 'chase');
        ZK.fx3.blood(m.pos.clone().setY(1.8), new T.Vector3(Math.cos(a), 0.6, Math.sin(a)), 0.8);
      }
      // 위험 도살자: 체력 50% 밑이면 분노 (속도 1.75 → 2.5 · 타격 40 → 55)
      if (m.kind === 'butcher' && M.cur === m && m.z.enrageAt && !m.z.enraged && m.z.alive && m.z.hp < m.z.maxHp * m.z.enrageAt) {
        m.z.enraged = true; m.z.speed *= 2.5 / 1.75; m.z.dmgK = 55 / 40; m.z.mats.skin.color.setHex(0x9a2a1e); m.z.mats.shirt.color.setHex(0x8a0606);
        ZK.audio.shriek && ZK.audio.shriek(ZK.panFor(m.z.pos), 1.4); ZK.fx3.text(m.z.pos.clone().setY(4), '도살자 분노!', '#ff3b3b', 34, 1.1); g.onNotice('도살자가 분노했다 — 더 빠르고 더 세다', '#ff3b3b'); }
      if (M.cur === m && m.t >= LIMIT) {
        if (m.kind === 'host' && m.z.alive) m.z.dispose();   // 숙주는 땅속으로 사라진다 (도살자는 남아서 계속 쫓아온다)
        finish(m, false, g);
      }
      if (M.cur === m) { const p = m.kind === 'escort' || m.kind === 'gas' || m.kind === 'supply' ? m.pos : m.z.pos, bm = m.risky ? beamR : beam; bm.position.set(p.x, 30, p.z); bm.material.opacity = 0.16 + Math.sin(ZK.fx3.time * 4) * 0.08; }
    }
    // 탈출: 8:30에 착륙장 공개 → 10:00 헬기 도착 → 10:30까지 착륙장(반경 10m)에 들어가면 성공
    if (!M.lz && g.t >= LZ_T) {
      const P = F().pos, c = CORNERS.map(([x, z]) => new T.Vector3(x, 0, z)).filter(v => ZK.world.freeSpot(v.x, v.z, 9)).sort(() => Math.random() - 0.5);
      M.lz = c[0] || new T.Vector3(50, 0, 50); lzBeam.visible = lzRing.visible = true; lzBeam.position.set(M.lz.x, 30, M.lz.z); lzRing.position.set(M.lz.x, 0.03, M.lz.z);
      smoke.forEach((s, i) => { s.visible = true; s.position.set(M.lz.x + rand(-1, 1), (i / smoke.length) * 14, M.lz.z + rand(-1, 1)); s.scale.setScalar(2 + i * 0.3); });
      if (M.cur) finish(M.cur, false, g);
      if (M.offer) { M.offer = null; beam.visible = beamR.visible = false; }   // 답하지 못한 무전은 끊긴다
      g.onNotice('탈출 헬기가 10:00에 온다! 초록 연기(착륙장)로 가라', '#7dff9a'); ZK.audio.levelUp();
    }
    if (M.lz) {
      for (const s of smoke) { s.position.y += dt * 2.2; if (s.position.y > 16) s.position.y = 0.5; s.material.opacity = 0.7 * (1 - s.position.y / 16); }
      if (g.t >= HELI_T - 4) { heli.visible = true; M.heliY = M.won ? M.heliY + dt * 6 : Math.max(6, M.heliY - dt * 9); heli.position.set(M.lz.x, M.heliY, M.lz.z + 2); rotor.rotation.y += dt * 30; }
    }
    // 연쇄 폭발 대기열
    for (let i = M.pend.length - 1; i >= 0; i--) { const q = M.pend[i]; if ((q.t -= dt) <= 0) { M.pend.splice(i, 1); M.blowBarrel(q.b, g, q.src); } }
    if (M.trap) M.trap.t -= dt;
    // 확성기 트럭: 방송 중이면 1.5초마다 반경 45m 소리(게이지는 그대로) · 버스가 들이받아 흡수하면 덫은 사라지고 장갑판 1장·연료 +6 더
    for (const t of M.trucks) {
      if (!t.absorbed && !t.car.alive) { t.absorbed = true; t.active = 0; ZK.fort.grow(TRUCK_COLOR);   // 폐차 흡수(장갑판 1 + 연료)에 더해 장갑판 1장 · 연료는 합쳐서 +6
        for (const b of t.lpg || []) if (b.alive) b.grp.position.y = 0;   // 짐칸의 가스통은 땅으로 떨어진다
        ZK.needs.s.fuel = Math.min(100, ZK.needs.s.fuel + Math.max(0, 6 - (ZK.meta ? ZK.meta.carFuel() : 3))); g.onNotice('트럭 흡수 — 장갑판 2장 · 연료 +6 (확성기 덫은 사라졌다)', '#8fd18f'); continue; }
      if (t.active > 0) { t.active -= dt;
        if ((t.speakT -= dt) <= 0) { t.speakT = 1.5; g.noise('speaker', t.pos); const d = t.pos.distanceTo(ZK.debug3 ? ZK.debug3.camera.position : t.pos); ZK.audio.speaker && ZK.audio.speaker(clamp(1.4 - d / 45, 0.15, 1)); ZK.fx3.text(t.hornPos.clone().setY(3.2), '♪ 고물 삽니다~', '#9ac0ff', 18, 1.2); } }
    }
    // 간판: 아래(낙하 범위)에 3마리 이상이면 볼트가 4Hz로 맥동 → "지금 쏴라" · 둘 다 끊기면 0.7초 동안 앞으로 쓰러지며 떨어짐
    for (const sg of M.signs) {
      if (sg.fall < 0) { const n = g.zombies.reduce((c, z) => c + (z.alive && Math.hypot(z.pos.x - sg.drop.x, z.pos.z - sg.drop.z) < 2.8 ? 1 : 0), 0);
        for (const b of sg.bolts) if (b.alive) b.mesh.material.emissiveIntensity = n >= 3 ? 0.6 + Math.sin(ZK.fx3.time * 25) * 0.5 : 0.6; continue; }
      if (sg.landed) continue;
      sg.fall += dt; const k = Math.min(1, sg.fall / 0.7);
      sg.grp.position.copy(sg.start).addScaledVector(sg.n, 2.4 * k); sg.grp.position.y = 4.6 - 4.25 * k * k; sg.pivot.rotation.x = 1.5 * k;
      if (k >= 1) {   // 쾅: 반경 2.8m에 320 · 버스 20 · 걸어 있는 나 40
        sg.landed = true; sg.front.emissiveIntensity = 0.15; M.signDrops++;
        g.boom(sg.drop.clone().setY(0.5), 0.7); ZK.fx3.smoke(sg.drop.clone().setY(0.6), new T.Vector3(0, 1, 0)); ZK.audio.barricade && ZK.audio.barricade(0);
        const kills = g.blast(sg.drop, 2.8, 320, 'player');
        if (kills >= 3) ZK.fx3.text(sg.drop.clone().setY(2.6), `간판 낙하! ×${kills}`, '#ffc81a', 30, 0.9);
        const Fs = ZK.fort.state; if (Fs.pos.distanceTo(sg.drop) < 2.8 + Fs.halfL) ZK.fort.hurt(20);
        if (g.mode === 'foot' && ZK.player.state.pos.distanceTo(sg.drop) < 2.8) { g.hp -= 40; g.regenT = 4; g.hurtA = 1; }
      }
    }
    // 드럼통: 버스로 들이받아도 터진다
    for (const b of M.barrels) if (b.alive && nearBus(b.pos, 0.6) && Math.abs(F().speed) > 1) M.blowBarrel(b, g, 'ram');
    // 불길: 0.25초마다 반경 안 좀비 9 피해(초당 36) · 걸어 다니는 나도 데인다
    for (let i = M.fires.length - 1; i >= 0; i--) {
      const f = M.fires[i]; f.t += dt; f.life -= dt; const k = clamp(f.life / 1.2, 0, 1);
      f.light.intensity = (2 + Math.random()) * k;
      for (const s of f.sprites) { const ph = ZK.fx3.time * 9 + s.userData.ph; s.scale.setScalar(s.userData.base * (0.8 + Math.sin(ph) * 0.15 + Math.random() * 0.1) * Math.max(0.2, k)); }
      if ((f.tick -= dt) <= 0) { f.tick = 0.25;
        for (const z of g.zombies) if (z.alive && z.state !== 'cling' && Math.hypot(z.pos.x - f.pos.x, z.pos.z - f.pos.z) < f.r) g.fireHit(z, 9);
        if (g.mode === 'foot' && Math.hypot(ZK.player.state.pos.x - f.pos.x, ZK.player.state.pos.z - f.pos.z) < f.r) { g.hp -= 5; g.regenT = 2; g.hurtA = Math.min(1, g.hurtA + 0.3); } }
      if (f.life <= 0) { killFire(f); M.fires.splice(i, 1); }
    }
    // 화염병 날아가는 중
    for (let i = M.proj.length - 1; i >= 0; i--) {
      const p = M.proj[i]; p.t += dt; p.v.y -= 14 * dt; p.mesh.position.addScaledVector(p.v, dt); p.mesh.rotation.x += dt * 9;
      const hitZ = g.zombies.find(z => z.alive && z.pos.distanceTo(p.mesh.position.clone().setY(0)) < 0.9 && p.mesh.position.y < 2.2);
      if (p.mesh.position.y <= 0.15 || hitZ || p.t > 3) {
        const at = p.mesh.position.clone().setY(0); scene.remove(p.mesh); M.proj.splice(i, 1);
        addFire(at, 4, 6); g.noise('molotov', at); ZK.audio.gibBurst && ZK.audio.gibBurst(ZK.panFor(at)); ZK.fx3.trauma(0.12);
        for (const b of M.barrels) if (b.alive && b.pos.distanceTo(at) < 4.5) M.blowBarrel(b, g, 'player');
      }
    }
    if (M.flash && (M.flash.t -= dt) <= 0) M.flash = null;
  };
  M.inLZ = g => !!M.lz && (F().pos.distanceTo(M.lz) < LZ_R + 1 || (g.mode === 'foot' && ZK.player.state.pos.distanceTo(M.lz) < LZ_R));
  M.canWin = g => g.t >= HELI_T && M.inLZ(g);
  M.missed = g => g.t >= LEAVE_T && !M.inLZ(g);
  M.onWin = () => { M.won = true; };

  // 봇·나침반·레이더가 쓰는 '지금 목표'
  M.target = function (g) {
    const m = M.cur;
    if (M.lz) { const left = g.t < HELI_T ? HELI_T - g.t : LEAVE_T - g.t;
      return { x: M.lz.x, z: M.lz.z, name: '탈출', sub: g.t < HELI_T ? `착륙장으로 · 헬기 도착 ${fmt(left)}` : `헬기 대기 중! ${fmt(left)} 안에 착륙장으로`, left, kind: 'lz', col: '#7dff9a' }; }
    if (!m) return null;
    const p = m.kind === 'host' || m.kind === 'butcher' ? m.z.pos : m.pos;
    let sub = INFO[m.kind].goal;
    if (m.kind === 'gas') sub = `버스를 원 안에 세워라 · 급유 ${Math.floor(m.prog)}/${m.need}초`;
    if (m.kind === 'escort') sub = m.phase === 'pick' ? `초록 옷 생존자 ${m.surv}명에게 가라` : '노란 원(안전지대)까지 데려가라';
    if (m.kind === 'supply' && !m.landed) sub = '상자가 떨어지는 중 — 그쪽으로 달려라';
    return { x: p.x, z: p.z, name: (m.risky ? '[위험] ' : '') + INFO[m.kind].name, sub, left: LIMIT - m.t, kind: m.kind, col: m.risky ? '#ff8a5a' : '#ffd23a', zb: m.z, risky: !!m.risky };   // zb: 숙주·도살자 (z는 좌표)
  };
  const fmt = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  M.drawHUD = function (h, W, H, g, label) {
    const tg = M.target(g), ps = ZK.player.state, cx = W / 2;
    if (tg) {
      const px = g.mode === 'drive' ? F().pos.x : ps.pos.x, pz = g.mode === 'drive' ? F().pos.z : ps.pos.z, d = Math.hypot(tg.x - px, tg.z - pz);
      let diff = Math.atan2(-(tg.x - px), -(tg.z - pz)) - (ps.yaw + ps.lookYaw); diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const y = 132, urgent = tg.left < 20 && Math.sin(ZK.fx3.time * 10) > 0;
      label(`${tg.name} — ${tg.sub} · ${fmt(tg.left)} · ${Math.round(d)}m`, cx, y, 17, urgent ? '#ff6a4a' : tg.col);
      // 방향 표시: 앞쪽 ±63° 안이면 그 자리에 ▼, 아니면 왼쪽/오른쪽 끝에 ◀ ▶
      h.fillStyle = tg.col; h.strokeStyle = 'rgba(0,0,0,0.8)'; h.lineWidth = 3;
      const tri = (x, yy, dir) => { h.beginPath(); if (dir === 'down') { h.moveTo(x - 9, yy - 8); h.lineTo(x + 9, yy - 8); h.lineTo(x, yy + 6); } else { const s = dir === 'left' ? -1 : 1; h.moveTo(x + s * 10, yy); h.lineTo(x - s * 6, yy - 9); h.lineTo(x - s * 6, yy + 9); } h.closePath(); h.stroke(); h.fill(); };
      if (Math.abs(diff) < 1.1) tri(cx - diff / 1.1 * Math.min(320, W * 0.32), y + 24, 'down'); else tri(diff > 0 ? cx - Math.min(360, W * 0.36) : cx + Math.min(360, W * 0.36), y, diff > 0 ? 'left' : 'right');
    }
    if (M.offer) drawOffer(h, W, H, g);
    if (M.flash) { const big = !M.flash.small; h.globalAlpha = clamp(M.flash.t, 0, 1); label(M.flash.text, cx, H * (big ? 0.36 : 0.3), big ? 52 : 28, M.flash.col); if (M.flash.sub) label(M.flash.sub, cx, H * (big ? 0.36 : 0.3) + (big ? 46 : 30), big ? 20 : 16, '#e8e8e8'); h.globalAlpha = 1; }
  };
  // 긴급 무전 상자 (휴대폰 재난문자 모양): 두 선택지 · 거리 · 방향 화살표 · '바라보며 달리기' 진행 막대 · 자동 선택까지 남은 시간
  function drawOffer(h, W, H, g) {
    const o = M.offer, ps = ZK.player.state, cx = W / 2, drive = g.mode === 'drive', me = drive ? F().pos : ps.pos, yaw = ps.yaw + (ps.lookYaw || 0);
    const bw = Math.min(560, W - 40), bx = cx - bw / 2, by = 98, bh = 112, pulse = 0.75 + Math.sin(ZK.fx3.time * 6) * 0.25;
    h.save(); h.fillStyle = 'rgba(18,20,24,0.9)'; h.beginPath(); if (h.roundRect) h.roundRect(bx, by, bw, bh, 12); else h.rect(bx, by, bw, bh); h.fill();
    h.strokeStyle = `rgba(255,178,74,${pulse})`; h.lineWidth = 2; h.stroke();
    h.font = '700 15px system-ui, sans-serif'; h.textAlign = 'left'; h.fillStyle = '#ffb24a'; h.fillText('⚠ 긴급 무전 — 두 곳에서 부른다', bx + 14, by + 22);
    h.textAlign = 'right'; h.font = '600 13px system-ui, sans-serif'; h.fillStyle = '#c8ccd4'; h.fillText(`${Math.max(0, Math.ceil(OFFER_T - o.t))}초 뒤 자동으로 A`, bx + bw - 14, by + 22);
    ['a', 'b'].forEach((key, i) => {
      const c = o[key], y = by + 48 + i * 30, col = key === 'a' ? '#ffd23a' : '#ff6a4a', d = Math.hypot(c.pos.x - me.x, c.pos.z - me.z);
      let diff = Math.atan2(-(c.pos.x - me.x), -(c.pos.z - me.z)) - yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      h.save(); h.translate(bx + 26, y - 5); h.rotate(-diff); h.fillStyle = col; h.beginPath(); h.moveTo(0, -10); h.lineTo(8, 6); h.lineTo(-8, 6); h.closePath(); h.fill(); h.restore();   // 그쪽 방향
      h.textAlign = 'left'; h.font = '700 16px system-ui, sans-serif'; h.fillStyle = col;
      h.fillText(`${key === 'a' ? 'A 일반' : 'B 위험'} · ${INFO[c.kind].name} · ${Math.round(d)}m`, bx + 46, y);
      if (key === 'b') { h.textAlign = 'right'; h.font = '600 13px system-ui, sans-serif'; h.fillStyle = '#ffb08a'; h.fillText('보상 카드 +1 · ★ +1', bx + bw - 96, y); }
      const k = clamp(o.look[key] / LOOK_T, 0, 1), px = bx + bw - 84, py = y - 10;   // 바라보며 달리기 진행
      h.fillStyle = 'rgba(255,255,255,0.12)'; h.fillRect(px, py, 70, 8); h.fillStyle = col; h.fillRect(px, py, 70 * k, 8);
    });
    h.textAlign = 'center'; h.font = '600 12px system-ui, sans-serif'; h.fillStyle = '#8a93a2';
    h.fillText('그쪽으로 달리며 3초 바라보거나 25m 안에 들어가면 그 임무가 시작된다', cx, by + bh - 12);
    h.restore();
  }
  M.radarMarks = function (g) {
    const out = [], tg = M.target(g);
    if (tg) out.push({ x: tg.x, z: tg.z, col: tg.col, big: true });
    if (M.offer) { out.push({ x: M.offer.a.pos.x, z: M.offer.a.pos.z, col: '#ffd23a', big: true }); out.push({ x: M.offer.b.pos.x, z: M.offer.b.pos.z, col: '#ff4a3a', big: true }); }   // 무전 두 곳
    for (const b of M.barrels) if (b.alive) out.push({ x: b.pos.x, z: b.pos.z, col: b.kind === 'lpg' ? '#f0f0e8' : '#e0402e', big: false });
    for (const t of M.trucks || []) if (!t.absorbed) out.push({ x: t.pos.x, z: t.pos.z, col: '#5a9aff', big: t.active > 0, truck: true });   // 확성기 트럭(파랑, 방송 중이면 맥동)
    return out;
  };
  ZK.mis = M;
})();
