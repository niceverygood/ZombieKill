// 맵: 밤의 서울 도로 (본도로 + 교차로 + 골목 2곳), 건물·차·바리케이드·가로등·불타는 차, 충돌체
(function () {
  const T = THREE, { rand } = ZK;
  const W = {};
  const colliders = [], solids = [], flick = [], lamps = [];
  // 맵 경계 반폭: 광장 77m (1탄 오픈월드 도시는 city3d.js가 236으로 바꾼다)
  W.B = 77;
  // 충돌체 격자 색인 (1탄 도시, 2026-11-10): 도시는 충돌체가 수백 개라 매번 전부 훑으면 좀비 수 × 충돌체 수가 된다.
  // 칸 16m · 충돌체 목록 길이나 마지막 항목이 바뀌면 다시 만든다 (차 흡수·트럭·타워 벽이 더해지고 빠져도 맞게)
  const GC = 16, grid = new Map(); let gN = -1, gLast = null, stamp = 0;
  const cellKey = (i, j) => i * 100003 + j;
  function reindex() {
    grid.clear(); gN = colliders.length; gLast = colliders[gN - 1];
    for (const b of colliders) for (let i = Math.floor(b.minX / GC); i <= Math.floor(b.maxX / GC); i++) for (let j = Math.floor(b.minZ / GC); j <= Math.floor(b.maxZ / GC); j++) {
      const k = cellKey(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b); }
  }
  // (x,z) 둘레 pad 안에 걸칠 수 있는 충돌체 (중복 없이)
  function near(x, z, pad) {
    if (colliders.length !== gN || colliders[gN - 1] !== gLast) reindex();
    const out = [], s0 = ++stamp;
    for (let i = Math.floor((x - pad) / GC); i <= Math.floor((x + pad) / GC); i++) for (let j = Math.floor((z - pad) / GC); j <= Math.floor((z + pad) / GC); j++) {
      const a = grid.get(cellKey(i, j)); if (a) for (const b of a) if (b._st !== s0) { b._st = s0; out.push(b); } }
    return out;
  }
  W.near = near;
  // 계약 '정전': 켜진 가로등을 모두 끈다 (판이 다시 시작하면 lightsOn)
  // 빛을 visible=false로 끄면 장면의 점광원 수가 바뀌어 모든 재질 셰이더가 다시 컴파일된다(멈칫) → 세기만 0으로
  W.lightsOff = () => { for (const q of lamps) { q.l.intensity = 0; q.f.on = false; q.bulb.material.color.setHex(0x333333); q.bulb.material.emissive && q.bulb.material.emissive.setHex(0); } };
  W.lightsOn = () => { for (const q of lamps) { q.l.intensity = q.f.base; q.f.on = true; q.bulb.material.color.setHex(0xffe2a8); q.bulb.material.emissive && q.bulb.material.emissive.setHex(0xffd08a); } };

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
  // 건물 외벽: 8×8 창문 격자 (불 켜진 창은 emissive 맵에만)
  function facadeTex() {
    const lit = [];
    const map = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5a5d66'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.1)})`; g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4)); }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const on = Math.random() < 0.18; lit.push(on);
        g.fillStyle = on ? '#3a3020' : '#14161c'; g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20);
        g.fillStyle = '#2a2c33'; g.fillRect(x * 32 + 5, y * 32 + 26, 22, 3);
      }
    });
    const em = canvasTex(256, 256, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      lit.forEach((on, i) => { if (!on) return; const x = i % 8, y = (i / 8) | 0;
        g.fillStyle = Math.random() < 0.7 ? '#ffcf8a' : '#9fc4ff'; g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20); });
    });
    return { map, em };
  }
  const FAC = [];
  function building(scene, x0, x1, z0, z1, h) {
    const f = FAC[(Math.random() * FAC.length) | 0], cell = 3.4 * 8;
    const mk = (lenU) => {
      const map = f.map.clone(), em = f.em.clone(); map.needsUpdate = em.needsUpdate = true;
      map.repeat.set(lenU / cell, h / cell); em.repeat.copy(map.repeat);
      const off = [rand(0, 1), rand(0, 1)]; map.offset.set(...off); em.offset.set(...off);
      return new T.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9, color: new T.Color().setHSL(rand(0.55, 0.65), rand(0.03, 0.12), rand(0.35, 0.55)) });
    };
    const wx = Math.abs(x1 - x0), wz = Math.abs(z1 - z0), mx = mk(wz), mz = mk(wx), top = new T.MeshLambertMaterial({ color: 0x15171c });
    const m = new T.Mesh(new T.BoxGeometry(wx, h, wz), [mx, mx, top, top, mz, mz]);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); scene.add(m); solids.push(m);
    colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h });
  }
  function block(scene, side, z0, z1) { // z0 > z1 구간을 여러 건물로 쪼갬
    let z = z0;
    while (z > z1 + 0.1) {
      const len = Math.min(z - z1, rand(8, 15));
      building(scene, side * 10, side * 42, z, z - len, rand(9, 30)); z -= len;
    }
  }
  function addBox(scene, w, h, d, x, y, z, color, opts = {}) {
    const mat = new T.MeshLambertMaterial({ color, emissive: opts.emissive || 0, emissiveIntensity: opts.ei ?? 1 });
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (opts.ry) m.rotation.y = opts.ry;
    scene.add(m); if (!opts.noHit) solids.push(m); return m;
  }
  function colliderFrom(obj, pad = 0) {
    const b = new T.Box3().setFromObject(obj);
    colliders.push({ minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad, h: b.max.y });
  }
  function car(scene, x, z, ry, color) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const body = new T.MeshLambertMaterial({ color }), dark = new T.MeshLambertMaterial({ color: 0x0c0d10 });
    const parts = [
      [new T.BoxGeometry(4.3, 0.75, 1.85), body, 0, 0.62, 0], [new T.BoxGeometry(2.3, 0.62, 1.68), body, -0.2, 1.3, 0],
      [new T.BoxGeometry(2.1, 0.5, 1.72), dark, -0.2, 1.3, 0],
    ];
    const meshes = [];
    for (const [geo, mat, px, py, pz] of parts) { const m = new T.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); solids.push(m); meshes.push(m); }
    for (const [wx, wz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
      const w = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.24, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.34, wz); g.add(w);
    }
    for (const sz of [0.6, -0.6]) {
      const hl = new T.Mesh(new T.BoxGeometry(0.05, 0.14, 0.32), new T.MeshBasicMaterial({ color: Math.random() < 0.3 ? 0xfff2c0 : 0x3a3a30 })); hl.position.set(2.16, 0.72, sz); g.add(hl);
      const tl = new T.Mesh(new T.BoxGeometry(0.05, 0.14, 0.3), new T.MeshBasicMaterial({ color: 0x7a0a0a })); tl.position.set(-2.16, 0.74, sz); g.add(tl);
    }
    g.updateMatrixWorld(true); colliderFrom(g, 0.05);
    W.cars.push({ group: g, col: colliders[colliders.length - 1], meshes, pos: g.position, color, alive: true }); // 요새가 흡수할 수 있는 차
    return g;
  }
  W.cars = [];
  W.removeCar = function (c) {
    if (!c.alive) return; c.alive = false; W.scene.remove(c.group);
    const i = colliders.indexOf(c.col); if (i >= 0) colliders.splice(i, 1);
    for (const m of c.meshes) { const j = solids.indexOf(m); if (j >= 0) solids.splice(j, 1); }
  };
  W.addCar = (x, z, ry) => car(W.scene, x, z, ry, [0x5a1e1e, 0x2a3a5a, 0x6a6a6e, 0x1e1e22, 0x3a4a3a, 0xb0b0aa][(Math.random() * 6) | 0]);
  // 처음 폐차 14대 (고정 좌표: 시작 위치 근처에 몇 대를 둬서 30초 안에 첫 흡수가 되게)
  const START_CARS = [[-6, -24, 0.3], [5.7, -45, -0.4], [-30, -5, 1.4], [39, 6, 1.7], [7, 32, 0.15], [-6, 51, -0.25], [-45, 33, 0.9], [46, -36, 0.4],
    [-40, -45, -0.6], [27, 51, 2.2], [54, 22, 1.2], [-57, -18, 0.2], [-60, 60, 0.7], [62, -62, 2.4]];
  // 판 리셋 때 폐차 원위치 (2026-11-09): 예전엔 판이 바뀌어도 차가 그대로였다.
  // 흡수된 차는 사라진 채, 디렉터가 아무 데나 보충한 차가 다음 판으로 넘어갔다('다시 하기'도 같음).
  // 그래서 시작 근처 폐차가 없는 채로 시작하는 판이 생겼고, 같은 시드도 판마다 다르게 흘렀다.
  // 확성기 트럭 항목은 missions3d가 따로 관리하니 건드리지 않는다.
  W.resetCars = function () {
    for (let i = W.cars.length - 1; i >= 0; i--) {
      const c = W.cars[i]; if (c.truck) continue;
      if (c.alive) W.removeCar(c);
      c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });   // car()가 차마다 새로 만든 것
      W.cars.splice(i, 1);   // 흡수된(죽은) 항목도 목록에서 뺀다 — 예전엔 판마다 쌓였다
    }
    (W.START_CARS || START_CARS).forEach(([x, z, r]) => W.addCar(x, z, r));   // 1탄 도시는 city3d가 W.START_CARS를 정한다
  };
  W.freeSpot = function (x, z, pad = 2) { return !near(x, z, pad).some(b => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad); };
  function lamp(scene, x, z, side, on) {
    const pole = addBox(scene, 0.14, 6, 0.14, x, 3, z, 0x1a1c22, { noHit: false });
    addBox(scene, 1.4, 0.1, 0.12, x - side * 0.7, 5.95, z, 0x1a1c22);
    const bulb = addBox(scene, 0.5, 0.12, 0.3, x - side * 1.3, 5.88, z, on ? 0xffe2a8 : 0x333333, { emissive: on ? 0xffd08a : 0, ei: 1.5 });
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12, h: 6 });
    if (on) { const l = new T.PointLight(0xffc27a, 1.35, 22, 1.4); l.position.set(x - side * 1.3, 5.6, z); scene.add(l); const f = { l, base: 1.35, k: 'lamp', on: true }; if (Math.random() < 0.3) flick.push(f); lamps.push({ l, bulb, f }); }
    return pole;
  }
  function fireAt(scene, x, z) {
    const tex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.8)'); gr.addColorStop(1, 'rgba(200,40,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const l = new T.PointLight(0xff7a2a, 2.4, 26, 1.5); l.position.set(x, 2.2, z); scene.add(l); flick.push({ l, base: 2.4, k: 'fire' });
    for (let i = 0; i < 9; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      s.position.set(x + rand(-1.4, 1.4), rand(1.2, 2.2), z + rand(-0.7, 0.7)); s.scale.setScalar(rand(0.8, 1.6)); scene.add(s);
      flick.push({ s, base: s.scale.x, y0: s.position.y, k: 'flame', ph: rand(0, 6) });
    }
  }

  W.build = function (scene) {
    scene.background = new T.Color(0x070910);
    scene.fog = new T.FogExp2(0x0c101a, 0.02);
    scene.add(new T.HemisphereLight(0x5a6a8a, 0x1a1410, 1.05));
    scene.add(new T.AmbientLight(0x404858, 0.35));
    const moon = new T.DirectionalLight(0x9ab0e0, 0.55); moon.position.set(-20, 40, 10); scene.add(moon);
    for (let i = 0; i < 3; i++) FAC.push(facadeTex());
    if (W.buildCity) { W.scene = scene; return W.buildCity(scene, { building, addBox, colliderFrom, lamp, fireAt, canvasTex, FAC, colliders, solids }); }   // 1탄 오픈월드 도시 (city3d.js)

    // 바닥: 도로(중앙 황색 실선 + 흰 점선) · 인도 · 교차로
    const road = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#26272c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},255,${rand(0.01, 0.05)})`; g.fillRect(rand(0, w), rand(0, h), 1.5, 1.5); }
      g.fillStyle = '#b8902a'; g.fillRect(w / 2 - 6, 0, 3, h); g.fillRect(w / 2 + 3, 0, 3, h);
      g.fillStyle = '#9a9a96'; for (const x of [w * 0.25, w * 0.75]) g.fillRect(x - 2, 0, 4, h * 0.5);
    });
    // ── 사방이 트인 교차로 광장 (약 160m × 160m, 요새가 달릴 수 있는 크기) ──
    W.scene = scene;
    road.repeat.set(1, 160 / 14);
    const plain = (w, d, x, z, color, y = -0.002) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); solids.push(m); return m; };
    plain(180, 180, 0, 0, 0x34353a);                                         // 광장 바닥(인도 블록)
    for (const [rz, y] of [[0, 0.001], [Math.PI / 2, 0.002]]) {               // 남북·동서 도로
      const m = new T.Mesh(new T.PlaneGeometry(14, 160), new T.MeshLambertMaterial({ map: road }));
      m.rotation.set(-Math.PI / 2, 0, rz); m.position.y = y; scene.add(m); solids.push(m);
    }
    plain(14, 14, 0, 0, 0x26272c, 0.003);                                    // 교차로 한가운데
    for (const [dx, dz, rot] of [[0, -8.5, 0], [0, 8.5, 0], [-8.5, 0, 1], [8.5, 0, 1]])   // 횡단보도 4곳
      for (let i = 0; i < 7; i++) addBox(scene, rot ? 2.6 : 0.5, 0.01, rot ? 0.5 : 2.6, dx + (rot ? 0 : -4.5 + i * 1.5), 0.004, dz + (rot ? -4.5 + i * 1.5 : 0), 0xb8b8b0, { noHit: true });

    // 외곽 건물로 둘러싸기
    const ring = (fixedA, fixedB, from, to, alongX) => {
      let a = from;
      while (a < to - 0.1) { const len = Math.min(to - a, rand(10, 17));
        if (alongX) building(scene, a, a + len, fixedA, fixedB, rand(10, 32)); else building(scene, fixedA, fixedB, a, a + len, rand(10, 32)); a += len; }
    };
    // 북쪽 줄은 2탄 타워 자리(x −24~−8, z −96~−80)를 비운다 — 타워 뒤(z −108~−96)는 낮은 건물로 메운다 (tower3d.js)
    const TWR = W.TOWER;
    ring(-80, -108, -108, TWR.x0, true); ring(-80, -108, TWR.x1, 108, true); building(scene, TWR.x0, TWR.x1, TWR.z0, -108, 20);
    ring(80, 108, -108, 108, true); ring(-80, -108, -80, 80, false); ring(80, 108, -80, 80, false);
    // 도로 끝을 막은 버스들
    for (const [x, z, r] of [[0, -77.6, 0], [0, 77.6, 0], [-77.6, 0, Math.PI / 2], [77.6, 0, Math.PI / 2]]) {
      const bus = addBox(scene, 13, 3.1, 2.6, x, 1.55, z, 0x8a6a1e, { ry: r }); colliderFrom(bus);
    }

    // 흡수용 폐차 (요새로 들이받으면 장갑이 된다) · 콘크리트 방벽 · 모래주머니 · 동상
    START_CARS.forEach(([x, z, r]) => W.addCar(x, z, r));
    [[-18, -18, 0.8], [18, 18, 0.8], [18, -21, -0.7], [-21, 18, -0.7], [0, -57, 0], [0, 57, 0], [-57, 45, 1.57], [57, -48, 1.57]]
      .forEach(([x, z, r]) => { const b = addBox(scene, 2.2, 0.85, 0.6, x, 0.42, z, 0x7a7a74, { ry: r }); colliderFrom(b); });
    for (const [cx, cz] of [[-33, 24], [33, -24]]) for (let i = 0; i < 6; i++) { // 모래주머니 반원 진지
      const a = Math.PI * (i / 5) + (cx > 0 ? Math.PI : 0), b = addBox(scene, 1.5, 0.75, 0.6, cx + Math.cos(a) * 2.6, 0.37, cz + Math.sin(a) * 2.6, 0x6b5a3a, { ry: -a + Math.PI / 2 }); colliderFrom(b);
    }
    const ped = addBox(scene, 4, 1.4, 4, 36, 0.7, 39, 0x5a5650); colliderFrom(ped);
    addBox(scene, 1, 3.2, 1, 36, 3, 39, 0x3a3d40);

    // 가로등 (일부 고장) · 불타는 차 2대
    [[-8.6, -8.6, 1], [8.6, 8.6, 1], [8.6, -8.6, 0], [-8.6, 8.6, 1], [-8.6, -40, 1], [8.6, 40, 1], [40, -8.6, 1], [-40, 8.6, 1], [8.6, -66, 0], [-66, -8.6, 1], [-8.6, 66, 1], [66, 8.6, 0]]
      .forEach(([x, z, on]) => lamp(scene, x, z, Math.abs(x) > Math.abs(z) ? 0 : Math.sign(x), !!on));
    fireAt(scene, 39, 6); fireAt(scene, -40, -45);
  };
  // 플레이어 주변 링(rMin~rMax) 위 빈 자리에 스폰 지점
  W.spawnRing = function (p, rMin, rMax, ang, spread = 1) {   // ang 주면 그 방향 ±spread 안에서만
    for (let i = 0; i < 12; i++) {
      const a = ang === undefined ? rand(0, 6.283) : ang + rand(-spread, spread), r = rand(rMin, rMax), x = ZK.clamp(p.x + Math.cos(a) * r, -W.B + 1, W.B - 1), z = ZK.clamp(p.z + Math.sin(a) * r, -W.B + 1, W.B - 1);
      if (!near(x, z, 0.6).some(b => x > b.minX - 0.6 && x < b.maxX + 0.6 && z > b.minZ - 0.6 && z < b.maxZ + 0.6)) return new T.Vector3(x, 0, z);
    }
    for (let i = 0; i < 24; i++) { const a = rand(0, 6.283), r = rand(rMin, rMax) * (1 + i / 12), x = ZK.clamp(p.x + Math.cos(a) * r, -W.B + 1, W.B - 1), z = ZK.clamp(p.z + Math.sin(a) * r, -W.B + 1, W.B - 1); if (W.freeSpot(x, z, 0.6)) return new T.Vector3(x, 0, z); }   // 도시: 건물 사이라 더 넓게 찾아본다
    return new T.Vector3(ZK.clamp(p.x + rand(-6, 6), -W.B + 1, W.B - 1), 0, ZK.clamp(p.z + rand(-6, 6), -W.B + 1, W.B - 1));
  };

  // 원(반지름 r)과 AABB 충돌 → 위치를 밀어냄
  // 넘기(vault): 앞 0.75m 안에 높이 1.7m 이하 장애물이 있으면 반대편 착지 지점을 돌려줌
  W.vault = function (p, dx, dz) {
    const inside = (x, z, pad) => near(x, z, pad).find(b => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
    const first = inside(p.x + dx * 0.75, p.z + dz * 0.75, 0.3);
    if (!first || first.h > 1.7) return null;
    for (let d = 0.8; d < 4.6; d += 0.1) {
      const x = p.x + dx * d, z = p.z + dz * d, b = inside(x, z, 0.4);
      if (!b) return { h: first.h, land: new T.Vector3(x, 0, z), dist: d };
      if (b.h > 1.7) return null;
    }
    return null;
  };
  // ── 높이(2탄 타워): 바닥면 목록 · 맵 경계 예외 ──
  // 바닥면 s: {minX,maxX,minZ,maxZ, y0, y1?, axis?} — axis가 있으면 경사(계단): min 끝이 y0, max 끝이 y1
  // groundAt: (x,z) 위의 바닥면 중 '발 높이 + 0.7m' 이하에서 가장 높은 것 → 층이 겹쳐도(계단실) 지금 서 있는 층을 고른다. 광장 바닥은 0
  W.TOWER = { x0: -24, x1: -8, z0: -96, z1: -80 };
  W.surfaces = []; W.open = [];   // open: 맵 경계(±77) 클램프를 하지 않는 구역 (타워 앞 인도·타워 안)
  W.groundAt = function (x, z, y) {
    let best = 0;
    for (const s of W.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      let h = s.y0;
      if (s.axis) { const t = s.axis === 'x' ? (x - s.minX) / (s.maxX - s.minX) : (z - s.minZ) / (s.maxZ - s.minZ); h = s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, t)); }
      if (h <= y + 0.7 && h > best) best = h;
    }
    return best;
  };
  W.collide = function (p, r) {   // 부딪힌 충돌체를 돌려준다(경계 클램프는 제외) — 날아가는 시체의 벽 핏자국 판정용
    let hit = null;
    for (const b of near(p.x, p.z, r)) {
      if (p.y >= b.h) continue;                     // 장애물보다 높이 있으면(점프·넘기) 통과
      if (b.y0 !== undefined && p.y + 1.8 <= b.y0) continue;   // 위층 벽(타워): 머리보다 위에서 시작하는 벽은 통과
      const cx = ZK.clamp(p.x, b.minX, b.maxX), cz = ZK.clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = b;
      if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // 중심이 박스 안: 가장 가까운 면으로
        const opts = [[b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1])); p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
    if (!W.open.some(o => p.x > o.minX && p.x < o.maxX && p.z > o.minZ && p.z < o.maxZ)) { p.x = ZK.clamp(p.x, -W.B, W.B); p.z = ZK.clamp(p.z, -W.B, W.B); }
    return hit;
  };
  W.update = function (dt, t) {
    for (const f of flick) {
      if (f.k === 'fire') f.l.intensity = f.base * (0.75 + Math.random() * 0.5);
      else if (f.k === 'lamp') { if (f.on !== false) f.l.intensity = Math.random() < 0.04 ? 0.1 : f.base; }   // 정전이면 깜빡임도 멈춤
      else { const k = 0.8 + Math.sin(t * 9 + f.ph) * 0.15 + Math.random() * 0.1; f.s.scale.setScalar(f.base * k); f.s.position.y = f.y0 + Math.sin(t * 5 + f.ph) * 0.1; }
    }
  };
  W.spawns = [[0, -72], [0, 72], [-72, 0], [72, 0], [-66, -66], [66, 66], [-66, 66], [66, -66]].map(([x, z]) => new T.Vector3(x, 0, z));
  W.solids = solids;
  W.colliders = colliders;
  ZK.world = W;
})();
