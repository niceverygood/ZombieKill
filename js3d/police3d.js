// 경찰서 (1탄 오픈월드, 2026-11-10) — 총을 많이 파밍할 수 있는 대신 강한 경찰 좀비가 지키는 곳
// 사용자: "경찰서도 만들어줘 무기 많이 파밍할수 있는 곳으로 대신 경찰 좀비들이 있어서 강한 좀비들 있게해줘"
// 자리: 도시 서쪽 경찰서 블록(city3d SPECIAL '1,3', x −196~−144 · z −60~−8)의 북쪽 건물 — 정문(남쪽)은 모래주머니 마당·동서 큰길(z 0) 쪽,
//       쪽문(북쪽)은 무기고 옆에서 북쪽 도로(z −68)로. city3d는 ZK.police가 있으면 막힌 건물을 짓지 않는다 (좀비 슈팅 게임 기획 세션과 나눔)
//  · 건물 46×19m · 높이 5m · 1층 · 어둡다(손전등). 버스는 못 들어온다 — 걸어서만
//    로비(안내 데스크) · 서쪽 사무실 + 유치장 3칸(창살) · 가운데 북쪽 탈의실(사물함) · 동쪽 서장실(금고) → 그 안쪽 무기고(거치대 3)
//  · 물자: 책상·사물함·데스크 9곳(G 1.8초: 리볼버 탄·산탄·소총탄·붕대…) · 서장실 금고(G 4초: 수류탄 2·리볼버 탄 24, 카드 1)
//    무기고 3곳(G 4초, 각 카드 1): 산탄총 + 산탄 12 · 자동소총 + 소총탄 30 · 리볼버 탄 36 + 수류탄 2
//  · 경찰 좀비 (zombie3d는 그대로 — 스폰한 좀비의 hit을 감싸고 옷·모자·방패만 바꾼다)
//    체력은 시간 배율을 약하게(1 + t/900): 보통 스폰 배율(1 + t/220)이면 5:30에 순경 360·기동대 1,050이라 봇이 하나도 못 털었다
//    순경: 걷는 좀비 바탕, 체력 150(=60×2.5) · 속도 ×1.35 · 공격 ×1.1 · 방탄조끼 = 몸통 명중 피해 50% (머리·팔다리·폭발·불은 그대로)
//    기동대: 덩치 바탕(체력 420 · 공격 ×0.75, 검은 진압 헬멧은 첫 머리 명중을 튕김) · 잠든 자리를 지킨다(5m 안·맞음·경보에만 깸) · 진압 방패 = 앞(±63°)에서 맞힌 몸·팔 명중 피해 10% → 옆·뒤 · 머리 · 다리, 수류탄·화염병
//    수감자: 출근러 바탕 주황 수의, 체력 60 — 유치장 창살 안에 갇혀 있다가 경보가 울리면 문이 열린다
//  · 처음 경찰서 130m 안에 오면 채운다: 마당 순경 4 + 정문 기동대 2(배회) · 안에 순경 8 · 기동대 3(잠듦) · 수감자 6(갇힘)
//    잠든 놈은 5m 안에 다가가거나 18m 안의 내 소리에 깬다 · 깬 놈 7m 안의 잠든 놈이 0.6초 뒤 깬다(연쇄)
//  · 무기고를 처음 털면 경보: 사이렌(35m 소음) · 유치장 문 열림 · 안의 경찰 전원 기상 · 북쪽 도로에서 기동대 2 + 순경 4가 쪽문으로 온다 → 정문으로 빠져라
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const P = ZK.police = { zs: [], points: [], keys: [], cells: [], spawned: false, alarm: false, darkOn: false, stats: {} };
  let scene, B = null, darkOn = false, sirenT = 0, NAV = null, block = null, flow = null, flowT = 0;
  const HT = 5, WT = 0.4, WAKE_NEAR = 5, CHAIN = 7, SPAWN_R = 130;
  const audioOn = () => !(ZK.debug3 && ZK.debug3.fast);

  // ── 경찰 좀비 겉모습 (모두가 같이 쓰는 지오메트리·재질) ──
  const GEO = { crown: new T.CylinderGeometry(0.158, 0.15, 0.085, 12), brim: new T.BoxGeometry(0.24, 0.018, 0.11), badge: new T.BoxGeometry(0.045, 0.045, 0.012),
    vest: new T.BoxGeometry(0.56, 0.5, 0.33), shield: new T.BoxGeometry(0.62, 0.95, 0.05), stripe: new T.BoxGeometry(0.5, 0.1, 0.012) };
  const MAT = { cap: new T.MeshLambertMaterial({ color: 0x141c30 }), gold: new T.MeshLambertMaterial({ color: 0xd8b03a, emissive: 0x3a2a00 }),
    vest: new T.MeshLambertMaterial({ color: 0x1a1d22 }), shield: new T.MeshLambertMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.55 }),
    riotHelm: new T.MeshLambertMaterial({ color: 0x0e1014 }), white: new T.MeshLambertMaterial({ color: 0xe8e8e8 }) };

  // 체력: 시간 배율을 약하게 (1 + t/900) — 보통 스폰의 1 + t/220을 그대로 쓰면 5:30에 순경 360 · 기동대 1,050이 되어
  // 봇이 들어가자마자 12~35초 만에 쓰러지고 하나도 못 털었다(1차 시험). 순경 150 = 헤드샷 2발 · 다리 6발 · 조끼 몸통 9발
  const hpOf = (z, k) => { const g = ZK.debug3 && ZK.debug3.g; return Math.round(z.T.hp * k * (1 + ((g && g.t) || 0) / 900)); };
  function dress(z, kind) {
    z.police = kind; z.guard = true;
    const m = z.mats;
    if (kind === 'prisoner') { m.shirt.color.setHex(0xd2641e); m.pants.color.setHex(0xc85a1a); z.maxHp = z.hp = hpOf(z, 2); return z; }
    m.shirt.color.setHex(kind === 'riot' ? 0x14171d : 0x1d2b4f); m.pants.color.setHex(0x14171f);
    if (kind === 'cop') {
      z.maxHp = z.hp = hpOf(z, 2.5); z.speed *= 1.35; z.dmgK = 1.1;
      const crown = new T.Mesh(GEO.crown, MAT.cap); crown.position.y = 0.12; z.head.add(crown);
      const brim = new T.Mesh(GEO.brim, MAT.cap); brim.position.set(0, 0.085, 0.12); z.head.add(brim);
      const badge = new T.Mesh(GEO.badge, MAT.gold); badge.position.set(0, 0.14, 0.158); z.head.add(badge);
      const vest = new T.Mesh(GEO.vest, MAT.vest); z.torso.add(vest);
      const st = new T.Mesh(GEO.stripe, MAT.white); st.position.set(0, 0.1, 0.168); vest.add(st);   // 'POLICE' 흰 띠
    } else {   // riot: 덩치 바탕
      z.maxHp = z.hp = hpOf(z, 1); z.speed *= 1.15; z.dmgK = 0.75;   // 방패 밀치기 ≈21 (덩치 주먹 28은 실내에서 몇 대 만에 끝났다)
      if (z.helmet) z.helmet.children.forEach(o => { if (o.material && o.material.visible !== false && !(o.userData && o.userData.part)) o.material = MAT.riotHelm; });
      const sh = z.shieldMesh = new T.Mesh(GEO.shield, MAT.shield); sh.position.set(-0.12, 0.95, 0.36); z.root.add(sh);
    }
    // 피격 감싸기: 방탄조끼(몸통 50%) · 진압 방패(앞에서 맞힌 몸 10%) — 폭발·불(opts.explosion)은 그대로 들어간다
    const orig = z.hit.bind(z);
    z.hit = function (part, point, dir, dmg, opts = {}) {
      if (this.alive && !opts.explosion && dmg > 0) {
        if (kind === 'cop' && part === 'body') { dmg = Math.round(dmg * 0.5); P.stats.vest++; if (point && dir) ZK.fx3.sparks(point.clone(), dir.clone().negate(), 3); }
        else if (kind === 'riot' && part !== 'head' && part !== 'leg' && dir) {   // 방패는 무릎 위까지 — 앞에서는 머리나 다리
          const ry = this.root.rotation.y, front = -(dir.x * Math.sin(ry) + dir.z * Math.cos(ry));   // 총알이 얼굴 쪽에서 들어오면 +
          if (front > 0.45) { dmg = Math.max(1, Math.round(dmg * 0.1)); P.stats.shield++; if (point) ZK.fx3.sparks(point.clone(), dir.clone().negate(), 6);
            if (audioOn() && ZK.audio.ting) ZK.audio.ting(1);
            if ((this.shieldT = (this.shieldT || 0) - 1) <= 0) { this.shieldT = 4; ZK.fx3.text(this.pos.clone().setY(2.9), '방패! 옆·뒤 · 머리 · 다리', '#9fd0ff', 18, 0.7); } }
        }
      }
      return orig(part, point, dir, dmg, opts);
    };
    return z;
  }

  // ── 건물 ──
  P.init = function (sc) {
    scene = sc; const W = ZK.world, C = ZK.city; if (!C || !C.Batch) return;   // 광장 맵이면 경찰서 없음
    const blk = C.blocks.find(b => b.kind === 'police'); if (!blk) return;
    const X0 = blk.x0 + 3, X1 = blk.x1 - 3, Z0 = blk.z0 + 3, Z1 = blk.z0 + 22, cx = (X0 + X1) / 2;
    const xW = X0 + 15, xE = X1 - 15, zA = Z0 + 8, zL = Z0 + 9, zBar = Z0 + 5;
    B = P.BOX = { X0, X1, Z0, Z1, cx, xW, xE, zA, zL, zBar, DOOR: [cx - 2, cx + 2], BACK: [X1 - 5, X1 - 3] };
    P.DOOR = new T.Vector3(cx, 0, Z1 + 2.5); P.CENTER = new T.Vector3(cx, 0, (Z0 + Z1) / 2);
    const Bt = C.Batch, cols = W.colliders, solids = W.solids;
    const wall = new Bt(), roof = new Bt(), floor = new Bt(), prop = new Bt(), bars = new Bt(), lamp = new Bt();
    const wcol = [0.48, 0.5, 0.55], addCol = (x0, x1, z0, z1, h) => { const c = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h }; cols.push(c); return c; };
    const wseg = (x0, x1, z0, z1, h = HT) => { if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return; wall.box(x0, x1, z0, z1, 0, h, 6, wcol, true); addCol(x0, x1, z0, z1, h); };
    const t = 0.15;
    // 바깥벽: 앞(남) 정문 4m · 뒤(북) 쪽문 2m · 양옆
    wseg(X0, B.DOOR[0], Z1 - WT, Z1); wseg(B.DOOR[1], X1, Z1 - WT, Z1); wall.box(B.DOOR[0], B.DOOR[1], Z1 - WT, Z1, 3, HT, 6, wcol, true);
    wseg(X0, B.BACK[0], Z0, Z0 + WT); wseg(B.BACK[1], X1, Z0, Z0 + WT); wall.box(B.BACK[0], B.BACK[1], Z0, Z0 + WT, 2.6, HT, 6, wcol, true);
    wseg(X0, X0 + WT, Z0, Z1); wseg(X1 - WT, X1, Z0, Z1);
    // 안쪽 벽: 서쪽 날개(xW)·동쪽 날개(xE) — 로비 쪽 문 z(−8~−6 from Z1) · 탈의실(zL, 가운데 문) · 서장실↔무기고(zA, 문)
    const dz0 = Z1 - 8, dz1 = Z1 - 6;
    wseg(xW - t, xW + t, Z0 + WT, dz0); wseg(xW - t, xW + t, dz1, Z1 - WT);
    wseg(xE - t, xE + t, Z0 + WT, dz0); wseg(xE - t, xE + t, dz1, Z1 - WT);
    wseg(xW + t, cx - 1.2, zL - t, zL + t); wseg(cx + 1.2, xE - t, zL - t, zL + t);
    const aDoor = [xE + 5, xE + 7];
    wseg(xE + t, aDoor[0], zA - t, zA + t); wseg(aDoor[1], X1 - WT, zA - t, zA + t);
    // 유치장: 서쪽 날개 북쪽 띠(Z0 ~ zBar)를 3칸으로 · 칸막이는 벽, 앞은 창살(가운데 1.4m가 문)
    const cw = (xW - t - (X0 + WT)) / 3;
    for (let k = 1; k < 3; k++) wseg(X0 + WT + cw * k - t, X0 + WT + cw * k + t, Z0 + WT, zBar);
    const barCol = [0.25, 0.26, 0.28];
    for (let k = 0; k < 3; k++) {
      const a = X0 + WT + cw * k, b = a + cw, d0 = (a + b) / 2 - 0.7, d1 = d0 + 1.4;
      for (let x = a + 0.2; x < b - 0.1; x += 0.42) if (x < d0 || x > d1) bars.box(x - 0.035, x + 0.035, zBar - 0.035, zBar + 0.035, 0, 2.6, 2, barCol, false);
      bars.box(a, b, zBar - 0.05, zBar + 0.05, 2.5, 2.62, 2, barCol, true);
      addCol(a, d0, zBar - 0.06, zBar + 0.06, 2.6); addCol(d1, b, zBar - 0.06, zBar + 0.06, 2.6);
      // 문: 따로 만든 메시 + 따로 충돌 상자 → 경보 때 사라진다
      const db = new Bt(); for (let x = d0 + 0.1; x < d1; x += 0.42) db.box(x - 0.035, x + 0.035, zBar - 0.035, zBar + 0.035, 0, 2.5, 2, [0.42, 0.18, 0.12], false);
      const dm = db.mesh(new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })); scene.add(dm);
      P.cells.push({ x0: a, x1: b, z0: Z0 + WT, z1: zBar, door: dm, col: addCol(d0, d1, zBar - 0.06, zBar + 0.06, 2.6), open: false });
    }
    // 앞 유리 · 지붕 · 천장 · 바닥 (로비는 밝은 타일, 나머지는 회색)
    prop.box(X0 + 1, B.DOOR[0] - 1, Z1 + 0.02, Z1 + 0.06, 1.2, 2.6, 6, [0.22, 0.32, 0.45]); prop.box(B.DOOR[1] + 1, X1 - 1, Z1 + 0.02, Z1 + 0.06, 1.2, 2.6, 6, [0.22, 0.32, 0.45]);
    roof.top(X0, X1, Z0, Z1, HT + 0.01, 8, [0.13, 0.14, 0.16]);
    roof.q([[X0, HT - 0.02, Z0], [X1, HT - 0.02, Z0], [X1, HT - 0.02, Z1], [X0, HT - 0.02, Z1]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.1, 0.1, 0.12]);
    floor.top(X0 + WT, X1 - WT, Z0 + WT, Z1 - WT, 0.03, 2, [0.42, 0.43, 0.45]); floor.top(xW, xE, zL, Z1 - WT, 0.035, 2, [0.58, 0.58, 0.55]);
    // 가구: 안내 데스크 · 로비 의자 · 사무실 책상 4 · 탈의실 사물함 줄·벤치 · 서장 책상·금고 · 무기 거치대
    const furn = (x0, x1, z0, z1, h, col) => { prop.box(x0, x1, z0, z1, 0, h, 2, col); addCol(x0, x1, z0, z1, h); };
    furn(cx - 6, cx - 1.6, Z1 - 5.4, Z1 - 4.6, 1.1, [0.3, 0.27, 0.24]);
    furn(cx + 2.5, cx + 6, Z1 - 2.2, Z1 - 1.7, 0.5, [0.2, 0.22, 0.3]);
    const desks = [[X0 + 4, Z1 - 7], [X0 + 10, Z1 - 7], [X0 + 4, Z1 - 3.5], [X0 + 10, Z1 - 3.5]];
    for (const [x, z] of desks) furn(x - 0.9, x + 0.9, z - 0.45, z + 0.45, 0.78, [0.36, 0.3, 0.22]);
    furn(xW + 1, xE - 1, Z0 + WT, Z0 + WT + 0.6, 2.0, [0.26, 0.32, 0.42]);
    furn(xW + 3, xE - 3, Z0 + 4.2, Z0 + 4.6, 0.45, [0.3, 0.25, 0.2]);
    furn(xE + 4, xE + 8, Z1 - 4.4, Z1 - 3.4, 0.8, [0.3, 0.2, 0.14]);
    furn(X1 - 1.6, X1 - WT, zA + 1.2, zA + 2.4, 1.2, [0.2, 0.21, 0.22]);
    furn(xE + 1, X1 - 1, Z0 + WT, Z0 + WT + 0.5, 2.2, [0.18, 0.2, 0.17]);   // 무기 거치대 (북쪽 벽)
    for (let x = xE + 1.5; x < X1 - 1.5; x += 0.7) prop.box(x - 0.04, x + 0.04, Z0 + WT + 0.5, Z0 + WT + 0.56, 0.9, 1.9, 2, [0.08, 0.08, 0.09]);   // 총 그림자
    // 천장 등 (빛 없음 · 발광만, 몇 개는 꺼짐)
    for (let x = X0 + 3; x < X1 - 2; x += 5) for (const z of [Z0 + 4, Z1 - 5]) { if (Math.random() < 0.5) continue; lamp.q([[x - 0.3, HT - 0.05, z - 1], [x + 0.3, HT - 0.05, z - 1], [x + 0.3, HT - 0.05, z + 1], [x - 0.3, HT - 0.05, z + 1]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.85, 0.9, 1]); }
    const plain = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    for (const [b, mat, hit] of [[wall, plain, true], [roof, plain, true], [floor, plain, false], [prop, plain, true], [bars, plain, false], [lamp, new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), false]]) {
      const m = b.mesh(mat); if (!m) continue; scene.add(m); if (hit) solids.push(m);
    }
    // 간판: 정문 위 '경찰서 POLICE' + 지붕 위 경광등 줄(발광)
    if (C.textTex) {
      const sg = new T.Mesh(new T.PlaneGeometry(14, 1.6), new T.MeshBasicMaterial({ map: C.textTex(['경찰서  POLICE'], 1024, 110, '#13234a', '#fff', [70]), fog: false }));
      sg.position.set(cx, 3.95, Z1 + 0.09); scene.add(sg);
    }
    P.beacon = []; for (const dx of [-1.2, 1.2]) { const b = new T.Mesh(new T.BoxGeometry(1.0, 0.35, 0.5), new T.MeshBasicMaterial({ color: dx < 0 ? 0xff2a2a : 0x2a5aff, fog: false })); b.position.set(cx + dx, HT + 0.25, Z1 - 1); scene.add(b); P.beacon.push(b); }

    // ── 물자 (needs.points에 넣으면 G·진행 원·결과 글자는 survival3d가 처리) ──
    const N = ZK.needs, ringGeo = new T.RingGeometry(0.7, 0.9, 24);
    const addPt = (name, x, z, fixed, opts = {}) => {
      const key = !!opts.key, col = key ? 0x3a6ad8 : 0xd8d8d0;
      const geo = key ? new T.BoxGeometry(1.0, 0.8, 0.6) : new T.BoxGeometry(0.55, 0.3, 0.35), m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: col, emissive: key ? 0x0a1a3a : 0 }));
      m.position.set(x, opts.my ?? (key ? 0.6 : 1.0), opts.mz ?? z); scene.add(m);
      const edge = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: key ? 0x7ab0ff : 0xffe8a0 })); edge.position.copy(m.position); scene.add(edge);
      const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: key ? 0x5a8aff : 0xffd23a, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); scene.add(ring);
      const pt = { name, pos: new T.Vector3(x, 0, z), mesh: m, edge, ring, done: false, fixed, qty: opts.qty, holdT: key ? 4 : 1.8, noise: key ? 'cache' : 'search', police: true, key: opts.key || null, armory: !!opts.armory, col };
      pt.onDone = (p, g) => onLoot(p, g);
      N.points.push(pt); P.points.push(pt); if (key) P.keys.push(pt); return pt;
    };
    addPt('안내 데스크', cx - 3.8, Z1 - 3.7, ['ammo', 'pill'], { mz: Z1 - 5 });
    const deskLoot = [['ammo'], ['bandage', 'pill'], ['ammo', 'can'], ['rifleAmmo']];
    desks.forEach(([x, z], k) => addPt('사무실 책상', x, z + (k < 2 ? -1.2 : 1.2), deskLoot[k], { mz: z }));
    const lockLoot = [['ammo', 'ammo'], ['shell', 'shell'], ['bandage', 'anti'], ['molotov', 'cloth']];
    lockLoot.forEach((f, k) => { const x = xW + 2.5 + k * ((xE - xW - 5) / 3); addPt('사물함', x, Z0 + WT + 1.6, f, { mz: Z0 + WT + 0.8, my: 1.4 }); });
    addPt('서장실 금고', X1 - 2.8, zA + 1.8, ['grenade', 'grenade', 'ammo', 'ammo'], { key: '서장실 금고', mz: zA + 1.8 });
    addPt('무기고 · 산탄총 거치대', xE + 2.5, Z0 + WT + 1.8, ['shell', 'shell', 'shell'], { key: '산탄총', armory: true, mz: Z0 + WT + 0.95, my: 1.2 });
    addPt('무기고 · 소총 거치대', xE + 7.5, Z0 + WT + 1.8, ['rifle', 'rifleAmmo', 'rifleAmmo'], { key: '자동소총', armory: true, mz: Z0 + WT + 0.95, my: 1.2 });
    addPt('무기고 · 탄약 상자', X1 - 2.2, Z0 + 4.2, ['ammo', 'ammo', 'ammo', 'grenade', 'grenade'], { key: '탄약 상자', armory: true });
    P.LOT = new T.Vector3(cx, 0, Z1 + 24);   // 봇이 버스를 대는 곳 (마당 앞, 큰길 가)
    NAV = { x0: Math.floor(X0) - 4, z0: Math.floor(Z0) - 4 }; NAV.nx = Math.ceil(X1) + 4 - NAV.x0; NAV.nz = Math.ceil(Z1) + 10 - NAV.z0;
    buildNav();
  };

  // 물자를 챙겼을 때: 핵심(금고·무기고)은 카드 1장 · 무기고 첫 털이는 경보
  function onLoot(p, g) {
    P.stats.loot++;
    if (!p.key) return;
    if (p.key === '산탄총' && !ZK.gun3.hasShotgun) { ZK.gun3.giveShotgun(); g.onNotice('산탄총! 2번 키 · 가까이서 한 방', '#ffb24a'); }
    P.stats.keys.push([p.key, Math.round(g.t)]); ZK.surv.grant(1);
    const n = P.keys.filter(q => q.done).length;
    if (p.armory && !P.alarm) alarm(g, p.pos);
    else g.onNotice(n >= P.keys.length ? '경찰서를 다 털었다! (카드 +1)' : `${p.key} — 카드 +1 · 경찰서 ${n}/${P.keys.length}`, '#7ab0ff');
  }

  function wake(z) { if (!z.sleep) return; z.sleep = false; z.tideK = 0; z.aware = 'chase'; z.senseT = 0; z.stagger = 0.6; P.stats.woke++; }
  function openCells() { const cols = ZK.world.colliders; for (const c of P.cells) { if (c.open) continue; c.open = true; c.door.visible = false; const i = cols.indexOf(c.col); if (i >= 0) cols.splice(i, 1); } buildNav(); }

  // 경보: 사이렌 · 유치장 문 열림 · 안의 경찰 전원 기상 · 북쪽 도로에서 지원 병력 → 쪽문으로 들어온다
  function alarm(g, at) {
    P.alarm = true; P.stats.alarmT = Math.round(g.t); sirenT = 0;
    g.noise('siren', at); openCells();
    for (const z of P.zs) if (z.alive && !z.remove) { if (z.sleep) wake(z); z.aware = 'chase'; z.senseT = 0; z.wp = null; }
    const bz = B.Z0 - 8;   // 북쪽 도로 가운데 (z −65 근처)
    for (let k = 0; k < 6; k++) {
      const x = clamp(B.cx + rand(-18, 18), B.X0, B.X1), p = new T.Vector3(x, 0, bz + rand(-3, 3)); if (!ZK.world.freeSpot(p.x, p.z, 0.6)) continue;
      const z = dress(g.spawnZ(k < 2 ? 'brute' : 'walker', p, 'chase'), k < 2 ? 'riot' : 'cop'); P.zs.push(z); P.stats.reinf++;
    }
    g.onNotice('경보! 유치장 문이 열렸다 — 기동대가 뒷문으로 온다. 정문으로 빠져라!', '#ff5a4a');
    if (audioOn()) { ZK.audio.stinger && ZK.audio.stinger(1); ZK.audio.levelUp && ZK.audio.levelUp(); }
    ZK.fx3.trauma(0.25);
  }

  P.reset = function () {
    for (const z of P.zs) if (z.alive && !z.remove) z.dispose && z.dispose(); P.zs = [];
    P.spawned = false; P.alarm = false; P.told = false; P.hinted = false; P.near = false;
    P.stats = { spawnT: null, enterT: null, keys: [], loot: 0, woke: 0, alarmT: null, reinf: 0, vest: 0, shield: 0, insideT: 0, hp0: null, killed: 0 };
    const cols = ZK.world.colliders;
    for (const c of P.cells) { c.open = false; c.door.visible = true; if (!cols.includes(c.col)) cols.push(c.col); }
    if (NAV) buildNav(); flow = null;
    for (const p of P.points) p.mesh.material.color.setHex(p.col);
    if (darkOn) setDark(false);
  };

  function spawnAll(g) {
    P.spawned = true; P.stats.spawnT = Math.round(g.t);
    const put = (base, kind, x, z, aware, sleep) => {
      if (!ZK.world.freeSpot(x, z, 0.45)) return null;
      const zz = dress(g.spawnZ(base, new T.Vector3(x, 0, z), aware), kind);
      if (sleep) { zz.sleep = true; zz.tideK = 0.04; zz.senseT = 999; zz.wp = { x, z }; zz.wpT = 999; zz.wakeT = 0; }
      P.zs.push(zz); return zz;
    };
    const many = (n, base, kind, gx, gz, aware, sleep) => { for (let k = 0; k < n; k++) for (let tr = 0; tr < 8; tr++) if (put(base, kind, gx(), gz(), aware, sleep)) break; };   // 책상·모래주머니에 걸리면 다른 자리로 (처음엔 16명 중 11명만 섰다)
    const { X0, X1, Z0, Z1, cx, xW, xE, zA, zL } = B;
    many(4, 'walker', 'cop', () => rand(X0 + 2, X1 - 2), () => rand(Z1 + 4, Z1 + 22), 'wander', false);   // 마당 순찰
    for (const dx of [-3.5, 3.5]) put('brute', 'riot', cx + dx, Z1 + 2.5, 'wander', false);                          // 정문 기동대
    many(2, 'walker', 'cop', () => rand(xW + 1.5, xE - 1.5), () => rand(zL + 1.5, Z1 - 1.5), 'wander', true);   // 로비
    many(3, 'walker', 'cop', () => rand(X0 + 1.5, xW - 1.5), () => rand(B.zBar + 1.2, Z1 - 1.5), 'wander', true);   // 사무실
    many(2, 'walker', 'cop', () => rand(xW + 1.5, xE - 1.5), () => rand(Z0 + 1.8, zL - 1), 'wander', true);   // 탈의실
    put('walker', 'cop', xE + 3, Z1 - 2, 'wander', true); put('brute', 'riot', xE + 9, zA + 3, 'wander', true);   // 서장실
    for (const dx of [3, 9]) put('brute', 'riot', xE + dx, Z0 + 4.5, 'wander', true);                                 // 무기고
    for (const c of P.cells) for (let k = 0; k < 2; k++) {   // 수감자: 칸마다 2 · 창살 안 배회
      const x = rand(c.x0 + 0.8, c.x1 - 0.8), z = rand(c.z0 + 0.8, c.z1 - 0.6), zz = put('runner', 'prisoner', x, z, 'wander', false);
      if (zz) { zz.wp = { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 }; zz.wpT = 999; zz.cell = c; }
    }
    g.onNotice('경찰서다 — 경찰 좀비는 방탄조끼·방패를 썼다 (머리·옆·폭발을 노려라)', '#7ab0ff');
  }

  function setDark(on, g) {
    darkOn = P.darkOn = on; const f = ZK.world.scene && ZK.world.scene.fog; if (!f) return;   // P.darkOn: game3d setNight이 밤 안개를 다시 칠할 때 실내 어둠을 지켜 준다
    f.density = on ? 0.07 : 0.02 + 0.022 * ((g && g.nightK) || 0);
  }
  P.inside = p => !!B && p.x > B.X0 && p.x < B.X1 && p.z > B.Z0 && p.z < B.Z1;

  P.update = function (dt, g) {
    if (!B || g.state !== 'play') return;
    const F = ZK.fort.state, ps = ZK.player.state, foot = g.mode === 'foot', me = foot ? ps.pos : F.pos;
    if (!P.told && g.t > 75) { P.told = true; g.onNotice('무전: 서쪽 경찰서 무기고에 총이 남아 있다 — 경찰 좀비가 지킨다 (M 지도)', '#7ab0ff'); }
    const d = Math.hypot(me.x - P.CENTER.x, me.z - P.CENTER.z); P.near = d < 60;
    if (!P.spawned && d < SPAWN_R) spawnAll(g);
    const inside = foot && P.inside(ps.pos);
    if (inside !== darkOn) setDark(inside, g);
    if (inside) { P.stats.insideT += dt; if (P.stats.enterT === null) { P.stats.enterT = Math.round(g.t); P.stats.hp0 = g.hp; }
      if (!P.hinted) { P.hinted = true; g.onNotice('경찰서 안 — 책상·사물함 G 1.8초 · 파란 상자 = 금고·무기고(G 4초, 무기고를 털면 경보)', '#7ab0ff'); } }
    // 경광등: 경보가 울리면 빠르게 번쩍 · 사이렌을 20초 동안 4초마다 다시 울려 주변을 계속 부른다
    const tt = ZK.fx3.time * (P.alarm ? 9 : 2.5); if (P.beacon) { P.beacon[0].visible = Math.sin(tt) > 0; P.beacon[1].visible = Math.sin(tt) <= 0; }
    if (P.alarm && P.stats.alarmT !== null && g.t - P.stats.alarmT < 20 && (sirenT -= dt) <= 0) { sirenT = 4; g.noise('siren', P.DOOR); }
    if (!P.spawned) return;
    updateFlow(dt, g);   // 쫓는 경찰의 길 지도
    for (const z of P.zs) if (z.alive) z.indoor = P.inside(z.pos);   // 건물 안은 벽 너머 — 밖에 세운 버스의 사수·포탑이 쏘지 않는다(fortress3d nearestZombie가 z.indoor를 건너뜀)
    for (const z of P.zs) {
      if (!z.alive || z.remove) { if (!z._pc) { z._pc = true; if (!z.alive) P.stats.killed++; } continue; }
      if (!z.sleep) continue;
      if (foot && z.pos.distanceTo(ps.pos) < WAKE_NEAR) { wake(z); continue; }
      if (z.hp < z.maxHp) { wake(z); continue; }   // 맞았다
      if (z.police === 'riot') continue;   // 기동대는 제자리(무기고·서장실·정문)를 지킨다: 5m 안·맞음·경보에만 — 총소리 한 번에 건물 전체가 몰려와 봇이 하나도 못 털었다(2차 시험)
      if (z.aware !== 'wander') { wake(z); continue; }   // 소리를 들었다
      if (z.wakeT > 0) { if ((z.wakeT -= dt) <= 0) wake(z); continue; }
      for (const o of P.zs) if (!o.sleep && o.alive && !o.remove && o.aware === 'chase' && o.pos.distanceTo(z.pos) < CHAIN) { z.wakeT = 0.6; break; }
    }
  };

  // 가까이(60m) 오거나 안에 있으면: '경찰서 — 핵심 n/4 · 남은 경찰' 한 줄 — 마트 목표 줄 자리(132)를 대신 쓴다(game3d가 그동안 마트 줄을 건너뜀)
  // 마트처럼 임무 목표·무전 제안이 떠 있으면 그리지 않는다 (같은 줄). 처음엔 186에 그려 알림 줄(172~)과 겹쳤다
  P.showing = g => !!B && g.state === 'play' && P.spawned && (P.near || P.inside(ZK.player.state.pos)) && !(ZK.mis.target && ZK.mis.target(g)) && !ZK.mis.offer;
  P.drawHUD = function (h, W, H, g, label) {
    if (!P.showing(g)) return;
    const n = P.keys.filter(q => q.done).length, left = P.zs.filter(z => z.alive && !z.remove && z.police !== 'prisoner').length;
    const txt = P.alarm ? `경보 중! 경찰 ${left} — 정문으로 빠져라 · 핵심 ${n}/${P.keys.length}` : `경찰서 — 핵심 ${n}/${P.keys.length} (금고·무기고) · 경찰 ${left}`;
    label(txt, W / 2, 132, 17, P.alarm ? '#ff6a5a' : '#7ab0ff');
  };

  // ── 걸어서 다닐 길: 1m 격자 (벽·가구·창살을 0.45m 넓혀 막음) — 건물 + 마당 앞쪽 (마트와 같은 방식) ──
  function buildNav() {
    if (!NAV) return; const { x0, z0, nx, nz } = NAV; block = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) block[i * nz + j] = ZK.world.freeSpot(x0 + i + 0.5, z0 + j + 0.5, 0.45) ? 0 : 1;
  }
  const cellOf = p => [clamp(Math.floor(p.x - NAV.x0), 0, NAV.nx - 1), clamp(Math.floor(p.z - NAV.z0), 0, NAV.nz - 1)];
  // 봇용 A*: 4칸마다 한 점 + 끝점
  P.path = function (from, to) {
    if (!block) return [to.clone()];
    const { x0, z0, nx, nz } = NAV; let [si, sj] = cellOf(from), [ti, tj] = cellOf(to);
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
    const pts = []; for (let n = 3; n < cells.length; n += 4) { const c = cells[n]; pts.push(new T.Vector3(x0 + Math.floor(c / nz) + 0.5, 0, z0 + (c % nz) + 0.5)); }
    pts.push(to.clone().setY(0)); return pts;
  };
  // 쫓는 경찰: 플레이어 칸에서 퍼지는 거리 지도(0.4초마다) — 벽에 붙지 않고 문으로 돌아 들어온다
  const INF = 65535;
  function updateFlow(dt, g) {
    const ps = ZK.player.state; if (!NAV || !block) { flow = null; return; }
    const { x0, z0, nx, nz } = NAV, inGrid = g.mode === 'foot' && ps.pos.x > x0 - 2 && ps.pos.x < x0 + nx + 2 && ps.pos.z > z0 - 2 && ps.pos.z < z0 + nz + 2;
    if (!inGrid) { flow = null; return; }
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
  // g.targetFor가 마트 다음에 부른다: 쫓는 중이고 목표가 걸어 다니는 플레이어일 때만 (코앞 2.2m면 그대로 → 때린다)
  P.routeTarget = function (z, t) {
    if (!flow || t.kind !== 'player' || z.aware !== 'chase') return t;
    const { x0, z0, nx, nz } = NAV, i = Math.floor(z.pos.x - x0), j = Math.floor(z.pos.z - z0); if (i < 0 || j < 0 || i >= nx || j >= nz) return t;
    if (Math.hypot(t.x - z.pos.x, t.z - z.pos.z) < 2.2) return t;
    const here = flow[i * nz + j]; let best = here, bi = -1, bj = -1;
    const ok = (a, b) => a >= 0 && b >= 0 && a < nx && b < nz && !block[a * nz + b];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue; const ni = i + a, nj = j + b; if (!ok(ni, nj) || (a && b && (!ok(i + a, j) || !ok(i, j + b)))) continue;
      const v = flow[ni * nz + nj] + (a && b ? 0.4 : 0); if (v < best) { best = v; bi = ni; bj = nj; }
    }
    if (bi < 0) return t;
    return { x: x0 + bi + 0.5, z: z0 + bj + 0.5, kind: 'point' };
  };
})();
