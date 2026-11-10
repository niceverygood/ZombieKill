// 1탄 오픈월드 도시 (2026-11-10) — 사방이 막힌 160m 광장 대신 약 470m 도시
// 사용자: "첫번째 탄을 막힌 공간 말고 오픈월드로 만들고, 마트를 찾아가는 과정을 만들자. 마트에 파밍할 게 엄청 많은데 대신 좀비들이 바글거리게"
//  · 격자 도로 7×7(가운데 0, ±68, ±136, ±204 · 폭 16m) · 블록 64개. 가운데 네 블록은 시작 광장(예전 광장 자리, 버스 (0,6))
//  · 북쪽 블록에 2탄 타워 자리(W.TOWER, x −24~−8 · z −96~−80)를 그대로 비워 둔다 (tower3d, 게임성 극대화 기획 세션)
//  · 북동쪽 두 블록을 합친 한빛마트 부지(x 144~196 · z −196~−76): 건물·안쪽·물자·좀비는 mart3d.js
//  · 남서쪽 공원 · 남동쪽 운동장(착륙장 후보) · 주유소 3곳 · 경찰서 · 길을 막은 바리케이드 6곳(돌아가야 한다)
//  · 건물은 블록마다 한 덩어리로 합쳐 그린다(드로우콜) · 가로등 불빛은 가까운 8개만 진짜 빛(빛 수가 바뀌면 셰이더가 다시 컴파일됨)
//  · 레이더에 도로 · M으로 도시 지도 켜고 끄기(목표까지 길 안내 · 배그식, Tab은 소지품 창 — inv3d) · 봇용 길찾기 C.route(from, to)
(function () {
  const T = THREE, { rand, clamp } = ZK, W = ZK.world;
  const B = 236, RW = 8, CS = [-204, -136, -68, 0, 68, 136, 204], ROAD_END = 212;
  const INT = [[-236, -212], [-196, -144], [-128, -76], [-60, -8], [8, 60], [76, 128], [144, 196], [212, 236]];
  W.B = B; W.MAP = 'city';
  const C = W.city = { B, CS, roads: [], blocks: [], shops: [], packs: [], trucks: [], gas: [], lz: [], bulbs: [], cut: new Set(), blocked: new Set(), signs: [] };
  const TW = W.TOWER;
  // 특별 블록 (x칸, z칸)
  const PLAZA = new Set(['3,3', '3,4', '4,3', '4,4']), SPECIAL = { '3,2': 'tower', '6,1': 'mart', '6,2': 'mart', '1,6': 'park', '6,6': 'field', '5,5': 'gas', '2,1': 'gas', '6,4': 'gas', '1,3': 'police' };
  C.MART = { x0: 144, x1: 196, z0: -196, z1: -76 };
  C.cut.add(edgeKey(5, 1, 6, 1));   // 마트 부지를 가로지르는 도로(z −136, x 136~204)는 없다
  function edgeKey(i, j, i2, j2) { return i < i2 || (i === i2 && j < j2) ? `${i},${j}-${i2},${j2}` : `${i2},${j2}-${i},${j}`; }

  // ── 합친 지오메트리 (사각형 면 묶음) ──
  function Batch() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  Batch.prototype.q = function (v, nrm, uv, col) {
    const b = this.p.length / 3;
    for (const a of v) this.p.push(a[0], a[1], a[2]);
    for (let k = 0; k < 4; k++) { this.n.push(nrm[0], nrm[1], nrm[2]); if (col) this.c.push(col[0], col[1], col[2]); }
    this.u.push(...uv); this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // 옆면 A→B (바깥 법선 = (−dz, 0, dx)) · 바닥 y0 ~ 위 y1
  Batch.prototype.side = function (ax, az, bx, bz, y0, y1, cs, off, col) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, u0 = off[0], v0 = off[1], u1 = u0 + L / cs, v1 = v0 + (y1 - y0) / cs;
    this.q([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [-dz / L, 0, dx / L], [u0, v0, u1, v0, u1, v1, u0, v1], col);
  };
  Batch.prototype.top = function (x0, x1, z0, z1, y, ts, col) {   // 위를 보는 면 (uv = 월드 좌표 / ts)
    this.q([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], [x0 / ts, z1 / ts, x1 / ts, z1 / ts, x1 / ts, z0 / ts, x0 / ts, z0 / ts], col);
  };
  Batch.prototype.box = function (x0, x1, z0, z1, y0, y1, cs, col, withTop = true) {
    const off = [rand(0, 1), rand(0, 1)];
    this.side(x1, z0, x0, z0, y0, y1, cs, off, col); this.side(x0, z1, x1, z1, y0, y1, cs, off, col);
    this.side(x0, z0, x0, z1, y0, y1, cs, off, col); this.side(x1, z1, x1, z0, y0, y1, cs, off, col);
    if (withTop) this.top(x0, x1, z0, z1, y1, cs, col);
  };
  Batch.prototype.mesh = function (mat) {
    if (!this.i.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2)); if (this.c.length) g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox(); return new T.Mesh(g, mat);
  };
  C.Batch = Batch;

  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
  function facadeMat(seed) {   // 창문 격자 외벽 (불 켜진 창은 emissive) · 정점 색으로 건물마다 색을 바꾼다
    const lit = [];
    const map = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#9a9ea8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.1)})`; g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4)); }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const on = Math.random() < 0.16 + seed * 0.04; lit.push(on);
        g.fillStyle = on ? '#4a3a20' : '#16181e'; g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20); g.fillStyle = '#3a3c44'; g.fillRect(x * 32 + 5, y * 32 + 26, 22, 3); }
    });
    const em = canvasTex(256, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      lit.forEach((on, i) => { if (!on) return; const x = i % 8, y = (i / 8) | 0; g.fillStyle = Math.random() < 0.7 ? '#ffcf8a' : '#9fc4ff'; g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20); }); });
    return new T.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, vertexColors: true });
  }
  function textTex(lines, w, h, bg, fg, sizes) {
    return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((t, i) => { g.font = `900 ${sizes[i]}px system-ui, sans-serif`; g.fillStyle = Array.isArray(fg) ? fg[i] : fg; g.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)); }); });
  }
  C.textTex = textTex;
  const tint = () => { const c = new T.Color().setHSL(rand(0.52, 0.66), rand(0.03, 0.14), rand(0.36, 0.58)); return [c.r, c.g, c.b]; };

  // ── 블록 안 건물 배치 ──
  // 건물 하나: 충돌체 + 블록 합본에 면 추가 + 도로에 면한 쪽을 가게 셔터·트럭 후보로
  function addBuilding(bt, roofB, x0, x1, z0, z1, h, blk, colliders) {
    bt.box(x0, x1, z0, z1, 0, h, 27.2, tint(), false); roofB.top(x0, x1, z0, z1, h, 8, null);
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h });
    // 도로 쪽 면(블록 바깥 테두리에 닿은 면)
    const faces = [], bz0 = blk.z0i !== undefined ? blk.z0i : blk.z0, bz1 = blk.z1i !== undefined ? blk.z1i : blk.z1, bx0 = blk.x0i !== undefined ? blk.x0i : blk.x0, bx1 = blk.x1i !== undefined ? blk.x1i : blk.x1;   // 인도(3m) 안쪽 테두리 기준
    if (Math.abs(z0 - bz0) < 0.1 && blk.roadN) faces.push({ x: (x0 + x1) / 2, z: z0, nx: 0, nz: -1, len: x1 - x0 });
    if (Math.abs(z1 - bz1) < 0.1 && blk.roadS) faces.push({ x: (x0 + x1) / 2, z: z1, nx: 0, nz: 1, len: x1 - x0 });
    if (Math.abs(x0 - bx0) < 0.1 && blk.roadW) faces.push({ x: x0, z: (z0 + z1) / 2, nx: -1, nz: 0, len: z1 - z0 });
    if (Math.abs(x1 - bx1) < 0.1 && blk.roadE) faces.push({ x: x1, z: (z0 + z1) / 2, nx: 1, nz: 0, len: z1 - z0 });
    for (const f of faces) if (f.len >= 10) { blk.faces.push(f); }
  }
  function regularBlock(blk, bt, roofB, colliders, edge) {
    const IN = edge ? 0 : 3, x0 = blk.x0 + IN, x1 = blk.x1 - IN, z0 = blk.z0 + IN, z1 = blk.z1 - IN;
    blk.x0i = x0; blk.x1i = x1; blk.z0i = z0; blk.z1i = z1;
    if (edge) {   // 도시 가장자리: 끊김 없는 높은 건물 벽
      const alongX = blk.x1 - blk.x0 > blk.z1 - blk.z0;
      let a = alongX ? blk.x0 : blk.z0; const end = alongX ? blk.x1 : blk.z1;
      while (a < end - 0.1) { const len = Math.min(end - a, rand(12, 22)); if (alongX) addBuilding(bt, roofB, a, a + len, blk.z0, blk.z1, rand(26, 46), blk, colliders); else addBuilding(bt, roofB, blk.x0, blk.x1, a, a + len, rand(26, 46), blk, colliders); a += len; }
      return;
    }
    // 골목: 가운데 4m 골목으로 2×2 또는 1×2로 나눔 · 칸마다 12%는 주차장(빈 땅 + 폐차)
    const sx = Math.random() < 0.75, sz = Math.random() < 0.75, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const xs = sx ? [[x0, mx - 2], [mx + 2, x1]] : [[x0, x1]], zs = sz ? [[z0, mz - 2], [mz + 2, z1]] : [[z0, z1]];
    for (const [ax, bx] of xs) for (const [az, bz] of zs) {
      if (Math.random() < 0.12) { blk.lots.push({ x: (ax + bx) / 2, z: (az + bz) / 2 }); continue; }
      // 긴 쪽으로 한 번 더 나눠 높낮이를 다르게 (붙어 있는 건물 두 채)
      if (bx - ax > bz - az && bx - ax > 16 && Math.random() < 0.6) { const m = rand(ax + 7, bx - 7); addBuilding(bt, roofB, ax, m, az, bz, rand(8, 36), blk, colliders); addBuilding(bt, roofB, m, bx, az, bz, rand(8, 36), blk, colliders); }
      else if (bz - az > 16 && Math.random() < 0.6) { const m = rand(az + 7, bz - 7); addBuilding(bt, roofB, ax, bx, az, m, rand(8, 36), blk, colliders); addBuilding(bt, roofB, ax, bx, m, bz, rand(8, 36), blk, colliders); }
      else addBuilding(bt, roofB, ax, bx, az, bz, rand(8, 36), blk, colliders);
    }
  }

  W.buildCity = function (scene, H) {
    const { addBox, colliderFrom, fireAt, colliders, solids } = H;
    scene.fog.density = 0.02;
    const facades = [0, 1, 2].map(facadeMat), roofMat = new T.MeshLambertMaterial({ color: 0x15171c });
    const plainMat = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const roofB = new Batch(), groundB = new Batch(), markB = new Batch(), propB = new Batch(), treeB = new Batch(), poleB = new Batch(), bulbB = new Batch();

    // 땅: 도시 전체 아스팔트 + 블록마다 인도
    groundB.top(-B - 4, B + 4, -B - 4, B + 4, -0.002, 50, [0.16, 0.165, 0.18]);
    // 도로 (텍스처: 가운데 황색 이중선 + 흰 차선)
    const road = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#26272c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},255,${rand(0.01, 0.05)})`; g.fillRect(rand(0, w), rand(0, h), 1.5, 1.5); }
      g.fillStyle = '#b8902a'; g.fillRect(w / 2 - 6, 0, 3, h); g.fillRect(w / 2 + 3, 0, 3, h);
      g.fillStyle = '#9a9a96'; for (const x of [w * 0.25, w * 0.75]) g.fillRect(x - 2, 0, 4, h * 0.5);
    });
    const roadB = new Batch(), RT = 14;
    for (let k = 0; k < CS.length; k++) {
      const c = CS[k];
      // 남북 도로 x=c (z −212 ~ 212) · 동서 도로 z=c — 교차로 사이 조각마다 (마트 부지 조각은 없음)
      const stops = [-ROAD_END, ...CS, ROAD_END];
      for (let s = 0; s < stops.length - 1; s++) {
        const a = stops[s], b = stops[s + 1]; if (b - a < 0.5) continue;
        // 조각이 잘린 도로인가 (마트)
        const ia = CS.indexOf(a), ib = CS.indexOf(b);
        if (ia >= 0 && ib >= 0 && C.cut.has(edgeKey(ia, k, ib, k))) continue;   // 동서 도로 z=CS[k]의 x 구간
        roadB.q([[a, 0.004, c + RW], [b, 0.004, c + RW], [b, 0.004, c - RW], [a, 0.004, c - RW]], [0, 1, 0], [1, a / RT, 1, b / RT, 0, b / RT, 0, a / RT]);   // 동서
        C.roads.push({ x0: a, x1: b, z0: c - RW, z1: c + RW });
      }
      for (let s = 0; s < stops.length - 1; s++) {
        const a = stops[s], b = stops[s + 1]; if (b - a < 0.5) continue;
        roadB.q([[c - RW, 0.0035, b], [c + RW, 0.0035, b], [c + RW, 0.0035, a], [c - RW, 0.0035, a]], [0, 1, 0], [0, b / RT, 1, b / RT, 1, a / RT, 0, a / RT]);   // 남북
        C.roads.push({ x0: c - RW, x1: c + RW, z0: a, z1: b });
      }
    }
    // 교차로: 차선을 덮는 검은 사각 + 횡단보도
    for (const x of CS) for (const z of CS) {
      markB.top(x - RW, x + RW, z - RW, z + RW, 0.006, 50, [0.15, 0.155, 0.17]);
      for (const [dx, dz, rot] of [[0, -RW - 1.5, 0], [0, RW + 1.5, 0], [-RW - 1.5, 0, 1], [RW + 1.5, 0, 1]])
        for (let i = 0; i < 6; i++) { const o = -6.25 + i * 2.5; if (rot) markB.top(x + dx - 1.2, x + dx + 1.2, z + o - 0.35, z + o + 0.35, 0.007, 50, [0.62, 0.62, 0.6]); else markB.top(x + o - 0.35, x + o + 0.35, z + dz - 1.2, z + dz + 1.2, 0.007, 50, [0.62, 0.62, 0.6]); }
    }

    // 블록
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const key = `${i},${j}`, edge = i === 0 || i === 7 || j === 0 || j === 7, kind = PLAZA.has(key) ? 'plaza' : SPECIAL[key] || (edge ? 'edge' : 'city');
      const [x0, x1] = INT[i], [z0, z1] = INT[j];
      const blk = { i, j, x0, x1, z0, z1, kind, faces: [], lots: [], roadN: j > 0, roadS: j < 7, roadW: i > 0, roadE: i < 7 };
      C.blocks.push(blk);
      if (kind === 'mart') continue;   // 마트 부지(두 블록 + 사이 도로)는 아래에서 한 번에
      if (kind !== 'edge') groundB.top(x0, x1, z0, z1, 0.02, 50, kind === 'plaza' ? [0.22, 0.22, 0.24] : kind === 'park' || kind === 'field' ? [0.11, 0.17, 0.1] : [0.27, 0.27, 0.29]);
      if (kind === 'city' || kind === 'edge') {
        const bt = new Batch(); regularBlock(blk, bt, roofB, colliders, edge);
        const m = bt.mesh(facades[(i * 7 + j * 3) % 3]); if (m) { scene.add(m); solids.push(m); }
        for (const l of blk.lots) C.lotSpots = (C.lotSpots || []).concat([l]);
      }
    }
    // ── 시작 광장 (예전 광장의 소품 자리 그대로: 방벽·모래주머니 진지·동상) ──
    [[-18, -18, 0.8], [18, 18, 0.8], [18, -21, -0.7], [-21, 18, -0.7], [-57, 45, 1.57], [57, -48, 1.57]]
      .forEach(([x, z, r]) => { const b = addBox(scene, 2.2, 0.85, 0.6, x, 0.42, z, 0x7a7a74, { ry: r }); colliderFrom(b); });
    for (const [cx, cz] of [[-33, 24], [33, -24]]) for (let i = 0; i < 6; i++) {
      const a = Math.PI * (i / 5) + (cx > 0 ? Math.PI : 0), b = addBox(scene, 1.5, 0.75, 0.6, cx + Math.cos(a) * 2.6, 0.37, cz + Math.sin(a) * 2.6, 0x6b5a3a, { ry: -a + Math.PI / 2 }); colliderFrom(b);
    }
    { const ped = addBox(scene, 4, 1.4, 4, 36, 0.7, 39, 0x5a5650); colliderFrom(ped); addBox(scene, 1, 3.2, 1, 36, 3, 39, 0x3a3d40); }

    // ── 2탄 타워 블록 (x −60~−8 · z −128~−76): 타워 자리(+여유 2m)와 그 앞 인도는 비우고, 뒤·옆은 낮은 건물 ──
    { const blk = C.blocks.find(b => b.kind === 'tower'), bt = new Batch();
      addBuilding(bt, roofB, -57, -29, -125, -80, rand(14, 24), blk, colliders);
      addBuilding(bt, roofB, -27, -11, -125, -100, 14, blk, colliders);
      const m = bt.mesh(facades[1]); scene.add(m); solids.push(m); }

    // ── 한빛마트 부지 (x 144~196 · z −196~−76): 주차장 바닥 · 주차선 · 카트 보관대 · 높은 간판(멀리서 보이는 표지) ──
    { const M = C.MART;
      groundB.top(M.x0, M.x1, M.z0, M.z1, 0.02, 50, [0.2, 0.2, 0.22]);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) { const x = M.x0 + 6 + k * 5, z = -150 + r * 22; markB.top(x - 0.1, x + 0.1, z, z + 5, 0.025, 50, [0.7, 0.7, 0.66]); }   // 주차선
      for (const [x, z] of [[154, -120], [186, -120]]) { const c = addBox(scene, 3.4, 1.1, 1.2, x, 0.55, z, 0x8a8f96); colliderFrom(c); }   // 카트 보관대
      // 기둥 간판: 높이 18m · 안개를 무시하는 발광 간판 → 도시 어디서든 '저기가 마트'
      addBox(scene, 0.6, 16, 0.6, 191, 8, -84, 0x2a2c30); colliderFrom(addBox(scene, 1.4, 1, 1.4, 191, 0.5, -84, 0x2a2c30));
      const sign = new T.Mesh(new T.BoxGeometry(9, 3.6, 0.5), new T.MeshBasicMaterial({ map: textTex(['한빛마트', '24시 · 식품 · 약국 · 생활'], 512, 200, '#c8281e', ['#fff', '#ffe8c0'], [92, 30]), fog: false }));
      sign.position.set(191, 17.5, -84); scene.add(sign); C.signs.push(sign);
      C.mart = { ...M, sign: sign.position.clone() }; }

    // ── 공원 (남서, 착륙장 후보) · 운동장 (남동, 착륙장 후보) ──
    const park = C.blocks.find(b => b.kind === 'park'), field = C.blocks.find(b => b.kind === 'field');
    for (let k = 0; k < 26; k++) {   // 나무: 가운데 14m는 비움
      const x = rand(park.x0 + 3, park.x1 - 3), z = rand(park.z0 + 3, park.z1 - 3), cx = (park.x0 + park.x1) / 2, cz = (park.z0 + park.z1) / 2;
      if (Math.hypot(x - cx, z - cz) < 14) continue;
      treeB.box(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 2.4, 4, [0.33, 0.22, 0.14]); treeB.box(x - 1.6, x + 1.6, z - 1.6, z + 1.6, 2.2, 5.4, 4, [0.12, 0.24, 0.12]);
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, h: 5 });
    }
    { const cx = (field.x0 + field.x1) / 2, cz = (field.z0 + field.z1) / 2;   // 운동장 흰 선
      for (const [a, b2, c2, d] of [[cx - 20, cx + 20, cz - 0.15, cz + 0.15], [cx - 0.15, cx + 0.15, cz - 20, cz + 20]]) markB.top(a, b2, c2, d, 0.025, 50, [0.6, 0.62, 0.58]); }
    C.lz.push(new T.Vector3((park.x0 + park.x1) / 2, 0, (park.z0 + park.z1) / 2), new T.Vector3((field.x0 + field.x1) / 2, 0, (field.z0 + field.z1) / 2));

    // ── 주유소 3곳: 지붕(기둥 4) · 주유기 2 · 작은 가게 — 가운데 6m는 비워 '주유소 습격' 원 자리 ──
    for (const blk of C.blocks.filter(b => b.kind === 'gas')) {
      const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
      addBox(scene, 22, 0.5, 14, cx, 5.2, cz, 0xd8d8d0, { noHit: true });
      for (const [dx, dz] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) colliderFrom(addBox(scene, 0.5, 5, 0.5, cx + dx, 2.5, cz + dz, 0xb8b8b0));
      for (const dx of [-8, 8]) colliderFrom(addBox(scene, 1.2, 1.6, 3, cx + dx, 0.8, cz, 0xc82a2a));
      const bt = new Batch(); addBuilding(bt, roofB, cx - 8, cx + 8, blk.z1 - 13, blk.z1 - 4, 5, blk, colliders); const m = bt.mesh(facades[2]); scene.add(m); solids.push(m);
      C.gas.push(new T.Vector3(cx, 0, cz));
    }
    // ── 경찰서: 건물 + 모래주머니 + 마당(착륙장 후보) ──
    { const blk = C.blocks.find(b => b.kind === 'police'), bt = new Batch();
      if (!ZK.police) {   // police3d.js(ZK.police, 경찰서 실내·무기고 — 다른 세션)가 있으면 건물(z0+3~z0+22)은 그쪽이 짓는다
        addBuilding(bt, roofB, blk.x0 + 3, blk.x1 - 3, blk.z0 + 3, blk.z0 + 22, 16, blk, colliders);
        const m = bt.mesh(facades[0]); scene.add(m); solids.push(m); }
      const cx = (blk.x0 + blk.x1) / 2, cz = blk.z1 - 14;
      for (let k = 0; k < 7; k++) { if (k === 3) continue; const b = addBox(scene, 2.6, 0.75, 0.6, cx - 10.5 + k * 3.5, 0.37, blk.z1 - 3, 0x6b5a3a); colliderFrom(b); }   /* 모래주머니 줄은 길 쪽 끝(가운데 틈) — 마당 가운데 반원이 착륙장 반경 9m를 막아 경찰서 마당이 한 번도 착륙장이 못 됐다(검수) */
      C.lz.push(new T.Vector3(cx, 0, cz)); C.police = new T.Vector3(cx, 0, blk.z0 + 24); }

    // ── 바리케이드로 막힌 길 6곳 (돌아가야 한다) — 시작 교차로·마트로 들어가는 길은 안 막고, 모든 교차로가 이어져 있게 ──
    { const cand = [];
      for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) { if (a < 6) cand.push([a, b, a + 1, b]); if (b < 6) cand.push([a, b, a, b + 1]); }
      const bad = e => C.cut.has(edgeKey(...e)) || (e[0] === 3 && e[1] === 3) || (e[2] === 3 && e[3] === 3) || (e[1] === 2 && e[3] === 2 && e[0] >= 5);
      for (let n = 0, tries = 0; n < 6 && tries < 200; tries++) {
        const e = cand[(Math.random() * cand.length) | 0], k = edgeKey(...e); if (bad(e) || C.blocked.has(k)) continue;
        C.blocked.add(k); if (!connected()) { C.blocked.delete(k); continue; } n++;
        const x = (CS[e[0]] + CS[e[2]]) / 2, z = (CS[e[1]] + CS[e[3]]) / 2, alongX = e[1] === e[3];
        // 콘크리트 방벽 줄(가운데 1.4m는 사람만 지나갈 틈) + 넘어진 버스
        for (let s = -1; s <= 1; s += 2) for (let q = 0; q < 5; q++) { const o = s * (1.6 + q * 2.2); /* 5칸: 인도(도로 중심에서 11m)까지 막는다 — 3칸(7.1m)이면 버스가 인도로 돌아 나갔다(검수) */ const bb = alongX ? addBox(scene, 0.6, 1.0, 2.2, x, 0.5, z + o, 0x8a8a84) : addBox(scene, 2.2, 1.0, 0.6, x + o, 0.5, z, 0x8a8a84); colliderFrom(bb); }
        const bus = alongX ? addBox(scene, 2.6, 3.1, 12, x + 7, 1.55, z, 0x6a5a1e) : addBox(scene, 12, 3.1, 2.6, x, 1.55, z + 7, 0x6a5a1e); colliderFrom(bus);
        C.roadblocks = (C.roadblocks || []).concat([{ x, z }]);
      } }

    // ── 가로등: 교차로마다 대각선 두 모서리 (기둥·팔·전구는 합본) · 진짜 빛은 가까운 8개만 ──
    for (const x of CS) for (const z of CS) for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = x + sx * (RW + 1.2), pz = z + sz * (RW + 1.2);
      if (!W.freeSpot(px, pz, 0.3)) continue;
      poleB.box(px - 0.08, px + 0.08, pz - 0.08, pz + 0.08, 0, 6.2, 4, [0.1, 0.11, 0.13]);
      const bx = px - sx * 1.2; poleB.box(Math.min(px, bx) - 0.05, Math.max(px, bx) + 0.05, pz - 0.05, pz + 0.05, 6.0, 6.1, 4, [0.1, 0.11, 0.13]);
      bulbB.box(bx - 0.25, bx + 0.25, pz - 0.15, pz + 0.15, 5.85, 5.97, 4, [1, 0.88, 0.62]);
      colliders.push({ minX: px - 0.1, maxX: px + 0.1, minZ: pz - 0.1, maxZ: pz + 0.1, h: 6 });
      C.bulbs.push(new T.Vector3(bx, 5.6, pz));
    }
    const bulbMat = new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    for (const [b, mat] of [[groundB, plainMat], [roadB, new T.MeshLambertMaterial({ map: road })], [markB, plainMat], [roofB, roofMat], [propB, plainMat], [treeB, plainMat], [poleB, plainMat], [bulbB, bulbMat]]) {
      const m = b.mesh(mat); if (!m) continue; scene.add(m); if (b !== bulbB && b !== poleB && b !== markB) solids.push(m);   /* 노면 표시(횡단보도·주차선)는 총알·시야 레이 대상이 아니다 — 도시 전체 2,500면을 레이마다 검사했다 */
      if (b === bulbB) C.bulbMesh = m;
    }
    C.pool = []; for (let k = 0; k < 8; k++) { const l = new T.PointLight(0xffc27a, 1.35, 22, 1.4); l.position.set(0, -50, 0); scene.add(l); C.pool.push(l); }

    // ── 불타는 차 3대 (빛 3개) ──
    for (const [x, z] of [[39, 6], [-100, -68], [100, 140]]) fireAt(scene, x, z);

    // ── 가게 셔터(수색 지점) · 확성기 트럭 자리 · 배낭 ──
    const nearBlock = (x, z) => (C.roadblocks || []).some(r => Math.hypot(r.x - x, r.z - z) < 9);   // 바리케이드 줄 위에 셔터·트럭이 겹치지 않게
    const faces = []; for (const blk of C.blocks) if (blk.kind === 'city') for (const f of blk.faces) faces.push(f);
    faces.sort(() => Math.random() - 0.5);
    for (const f of faces) {
      if (C.shops.length >= 24) break;
      if (Math.hypot(f.x, f.z - 6) < 25 || C.shops.some(s => Math.hypot(s.at[0] - f.x, s.at[1] - f.z) < 30) || nearBlock(f.x, f.z)) continue;
      C.shops.push({ at: [f.x + f.nx * 3.2, f.z + f.nz * 3.2], wall: [f.x + f.nx * 0.05, f.z + f.nz * 0.05, Math.atan2(f.nx, f.nz)] });
    }
    for (const f of faces) {   // 트럭: 가게 셔터와 겹치지 않는 면 앞 4m
      if (C.trucks.length >= 12) break;
      if (C.shops.some(s => Math.hypot(s.at[0] - f.x, s.at[1] - f.z) < 9) || C.trucks.some(t => Math.hypot(t.x - f.x, t.z - f.z) < 40) || nearBlock(f.x, f.z)) continue;
      C.trucks.push({ x: f.x + f.nx * 4, z: f.z + f.nz * 4, nx: f.nx, nz: f.nz });
    }
    for (let k = 0, tries = 0; k < 20 && tries < 600; tries++) {   // 배낭: 인도 위 (블록 테두리 1.5m 띠)
      const blk = C.blocks[(Math.random() * C.blocks.length) | 0]; if (blk.kind !== 'city') continue;
      const side = (Math.random() * 4) | 0, t = rand(0.15, 0.85);
      const x = side < 2 ? ZK.lerp(blk.x0, blk.x1, t) : side === 2 ? blk.x0 + 1.5 : blk.x1 - 1.5, z = side >= 2 ? ZK.lerp(blk.z0, blk.z1, t) : side === 0 ? blk.z0 + 1.5 : blk.z1 - 1.5;
      if (!W.freeSpot(x, z, 1) || C.packs.some(p => Math.hypot(p[0] - x, p[1] - z) < 25) || Math.hypot(x, z - 6) < 20) continue;
      C.packs.push([x, z]); k++;
    }

    // ── 길 안내 표지판 (시작 광장에서 마트 방향) ──
    for (const [x, z, ry, txt] of [[14, -14, -Math.PI / 4, ['한빛마트 ↗', '북동쪽 약 240m']], [76, -76, -Math.PI / 4, ['한빛마트 ↗', '약 140m']], [140, -64, Math.PI, ['한빛마트 ↑', '이 길 끝']]]) {
      addBox(scene, 0.2, 4.4, 0.2, x, 2.2, z, 0x2a2c30);
      const s = new T.Mesh(new T.BoxGeometry(4.2, 1.6, 0.15), new T.MeshBasicMaterial({ map: textTex(txt, 256, 100, '#1a5aa8', '#fff', [40, 22]), fog: false })); s.position.set(x, 4.6, z); s.rotation.y = ry; scene.add(s);
      colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, h: 4.4 });
    }

    // ── 폐차: 시작 광장 12대(30초 안에 첫 흡수) + 도로·주차장·마트 주차장 ──
    const cars = [[-6, -24, 0.3], [5.7, -45, -0.4], [-30, -5, 1.4], [39, 10, 1.7], [7, 32, 0.15], [-6, 51, -0.25], [-45, 33, 0.9], [46, -36, 0.4], [-40, -45, -0.6], [27, 51, 2.2], [54, 22, 1.2], [-57, -18, 0.2]];
    for (const l of (C.lotSpots || []).slice(0, 6)) cars.push([l.x, l.z, rand(0, 3.14)]);
    for (const [x, z] of [[156, -144], [176, -128], [186, -106], [160, -98], [150, -122]]) cars.push([x, z, rand(-0.3, 0.3)]);   // 마트 주차장
    for (let k = 0, tries = 0; k < 10 && tries < 200; tries++) {   // 도로 위 (교차로 피해서, 차선 한쪽)
      const road2 = C.roads[(Math.random() * C.roads.length) | 0], alongX = road2.x1 - road2.x0 > road2.z1 - road2.z0;
      const t = rand(0.2, 0.8), x = alongX ? ZK.lerp(road2.x0, road2.x1, t) : (road2.x0 + road2.x1) / 2 + (Math.random() < 0.5 ? -4 : 4), z = alongX ? (road2.z0 + road2.z1) / 2 + (Math.random() < 0.5 ? -4 : 4) : ZK.lerp(road2.z0, road2.z1, t);
      if (Math.hypot(x, z) < 70 || !W.freeSpot(x, z, 3) || cars.some(c => Math.hypot(c[0] - x, c[1] - z) < 20)) continue;
      cars.push([x, z, (alongX ? 0 : Math.PI / 2) + rand(-0.3, 0.3)]); k++;
    }
    W.START_CARS = cars; cars.forEach(([x, z, r]) => W.addCar(x, z, r));

    // 길찾기 그래프 확인용으로 한 번 계산
    C.ready = true;
  };

  // ── 길찾기: 교차로 7×7 격자, 잘린 길·막힌 길 제외 ──
  function neighbors(i, j) {
    const out = [];
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || a > 6 || b < 0 || b > 6) continue; const k = edgeKey(i, j, a, b);
      if (C.cut.has(k) || C.blocked.has(k)) continue; out.push([a, b]);
    }
    return out;
  }
  function connected() {
    const seen = new Set(['3,3']), q = [[3, 3]];
    while (q.length) { const [i, j] = q.shift(); for (const [a, b] of neighbors(i, j)) { const k = `${a},${b}`; if (!seen.has(k)) { seen.add(k); q.push([a, b]); } } }
    return seen.size === 49;
  }
  const nearestNode = p => { let best = [3, 3], bd = 1e9; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const d = Math.hypot(CS[i] - p.x, CS[j] - p.z); if (d < bd) { bd = d; best = [i, j]; } } return best; };
  // from → to 경로: 가까운 교차로부터 교차로 단위 최단 경로(A*) + 마지막에 목표점. 반환은 Vector3 목록
  function clearLine(a, b, pad = 1.7) {   // a→b 직선을 2.5m마다 재서 건물·방벽 충돌체가 없으면 true (주차된 차는 충돌체가 아니라 무시)
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 2.5));
    for (let k = 1; k < n; k++) { const t = k / n; if (!W.freeSpot(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, pad)) return false; }
    return true;
  }
  C.clearLine = clearLine;
  C.route = function (from, to) {
    const s = nearestNode(from), t = nearestNode(to), key = n => n[0] * 7 + n[1];
    const open = [[s, 0]], g0 = new Map([[key(s), 0]]), prev = new Map();
    const hf = n => Math.abs(CS[n[0]] - CS[t[0]]) + Math.abs(CS[n[1]] - CS[t[1]]);
    while (open.length) {
      open.sort((a, b) => a[1] - b[1]); const [n] = open.shift();
      if (n[0] === t[0] && n[1] === t[1]) break;
      for (const m of neighbors(n[0], n[1])) {
        const c = g0.get(key(n)) + Math.abs(CS[m[0]] - CS[n[0]]) + Math.abs(CS[m[1]] - CS[n[1]]);
        if (c < (g0.get(key(m)) ?? 1e9)) { g0.set(key(m), c); prev.set(key(m), n); open.push([m, c + hf(m)]); }
      }
    }
    const path = []; let n = t; path.push(n);
    while (prev.has(key(n))) { n = prev.get(key(n)); path.push(n); }
    path.reverse();
    const pts = path.map(q => new T.Vector3(CS[q[0]], 0, CS[q[1]]));
    // 출발점이 첫 교차로보다 목표 쪽에 있으면 첫 교차로를 건너뜀
    // 지름길: 버스 폭(1.7m 여유)으로 막힌 데 없이 곧장 갈 수 있으면 앞·끝 교차로를 건너뛴다
    // (예전 규칙은 같은 길 위의 출발·목표에서 교차로까지 갔다 되돌아오거나, 마트 주차장 앞에서 맴돌았다 — 검수)
    const goal = to.clone ? to.clone().setY(0) : new T.Vector3(to.x, 0, to.z);
    while (pts.length && clearLine(from, pts.length > 1 ? pts[1] : goal)) pts.shift();
    while (pts.length > 1 && clearLine(pts[pts.length - 2], goal)) pts.pop();
    pts.push(goal);
    return pts;
  };

  // ── 매 프레임: 가까운 가로등 8개에 진짜 빛 (0.4초마다 다시 고름) ──
  let poolT = 0, dark = false;
  C.update = function (dt, cam) {
    if (!C.pool || (poolT -= dt) > 0) return; poolT = 0.4;
    const p = cam.position, near = C.bulbs.map(b => [b, (b.x - p.x) ** 2 + (b.z - p.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    C.pool.forEach((l, k) => { const b = near[k]; if (b) l.position.copy(b[0]); l.intensity = dark ? 0 : 1.35; });
  };
  // 계약 '정전': 가로등 빛·전구까지 끈다
  const offW = W.lightsOff, onW = W.lightsOn;
  W.lightsOff = () => { offW(); dark = true; if (C.pool) C.pool.forEach(l => { l.intensity = 0; }); if (C.bulbMesh) C.bulbMesh.visible = false; };
  W.lightsOn = () => { onW(); dark = false; if (C.bulbMesh) C.bulbMesh.visible = true; };

  // ── 레이더에 도로 ──
  C.drawRadar = function (h, cx, cy, Rr, c, yaw, sc) {
    const reach = Rr / sc + 20, cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const pr = (x, z) => { const dx = x - c.x, dz = z - c.z; return [cx + (dx * cosY - dz * sinY) * sc, cy + (dx * sinY + dz * cosY) * sc]; };
    const poly = (x0, x1, z0, z1) => { const a = pr(x0, z0), b = pr(x1, z0), d = pr(x1, z1), e = pr(x0, z1); h.beginPath(); h.moveTo(a[0], a[1]); h.lineTo(b[0], b[1]); h.lineTo(d[0], d[1]); h.lineTo(e[0], e[1]); h.closePath(); h.fill(); };
    h.fillStyle = 'rgba(150,160,175,0.22)';
    for (const r of C.roads) { if (r.x1 < c.x - reach || r.x0 > c.x + reach || r.z1 < c.z - reach || r.z0 > c.z + reach) continue; poly(r.x0, r.x1, r.z0, r.z1); }
    const M = C.MART; if (!(M.x1 < c.x - reach || M.x0 > c.x + reach || M.z1 < c.z - reach || M.z0 > c.z + reach)) { h.fillStyle = 'rgba(255,120,60,0.25)'; poly(M.x0, M.x1, M.z0, M.z1); }
    h.fillStyle = 'rgba(255,60,40,0.8)'; for (const r of C.roadblocks || []) { const [x, y] = pr(r.x, r.z); h.fillRect(x - 3, y - 3, 6, 6); }
  };
  // ── M: 도시 지도 (블록·도로·마트·착륙장·타워·나·버스 + 목표까지 길) ──
  C.drawMap = function (h, Wd, Hd, g, label) {
    const S = Math.min(Wd, Hd) * 0.86, k = S / (2 * B), ox = Wd / 2, oy = Hd / 2, P = (x, z) => [ox + x * k, oy + z * k];
    h.save(); h.fillStyle = 'rgba(4,6,10,0.88)'; h.fillRect(ox - S / 2 - 12, oy - S / 2 - 12, S + 24, S + 24);
    for (const b of C.blocks) { const [x, y] = P(b.x0, b.z0); h.fillStyle = b.kind === 'plaza' ? '#2a2c32' : b.kind === 'park' || b.kind === 'field' ? '#1f3a22' : b.kind === 'mart' ? '#5a2a1a' : b.kind === 'gas' ? '#4a4420' : b.kind === 'tower' ? '#3a2a4a' : '#1a1c22'; h.fillRect(x, y, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); }
    h.fillStyle = '#5a606c'; for (const r of C.roads) { const [x, y] = P(r.x0, r.z0); h.fillRect(x, y, (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); }
    h.fillStyle = '#ff4a3a'; for (const r of C.roadblocks || []) { const [x, y] = P(r.x, r.z); h.fillRect(x - 4, y - 4, 8, 8); }
    h.font = '800 13px system-ui, sans-serif'; h.textAlign = 'center'; h.textBaseline = 'middle';
    const tag = (x, z, t, col) => { const [a, b] = P(x, z); h.fillStyle = col; h.fillText(t, a, b); };
    tag((C.MART.x0 + C.MART.x1) / 2, -150, '한빛마트', '#ff9a6a'); tag((TW.x0 + TW.x1) / 2, (TW.z0 + TW.z1) / 2, '타워', '#c8a0ff');
    for (const p of C.gas) tag(p.x, p.z, '주유소', '#e8d27a');
    if (C.police) tag(C.police.x, C.police.z, '경찰서', '#7ab0ff');
    const lz = ZK.mis && ZK.mis.lz; if (lz) { const [a, b] = P(lz.x, lz.z); h.strokeStyle = '#7dff9a'; h.lineWidth = 3; h.beginPath(); h.arc(a, b, 8, 0, 6.283); h.stroke(); tag(lz.x, lz.z - 14, '착륙장', '#7dff9a'); }
    // 목표까지 길 (청록 선)
    const F = ZK.fort.state, ps = ZK.player.state, me = g.mode === 'drive' ? F.pos : ps.pos, goal = C.goal && C.goal(g);
    if (goal) { const pts = C.route(me, goal); h.strokeStyle = 'rgba(80,230,255,0.9)'; h.lineWidth = 3; h.beginPath(); const [a0, b0] = P(me.x, me.z); h.moveTo(a0, b0); for (const q of pts) { const [a, b] = P(q.x, q.z); h.lineTo(a, b); } h.stroke(); }
    { const [a, b] = P(F.pos.x, F.pos.z); h.fillStyle = '#8fd18f'; h.fillRect(a - 4, b - 4, 8, 8); }
    { const [a, b] = P(me.x, me.z); h.save(); h.translate(a, b); h.rotate(-(ps.yaw)); h.fillStyle = '#fff'; h.beginPath(); h.moveTo(0, -9); h.lineTo(-6, 6); h.lineTo(6, 6); h.closePath(); h.fill(); h.restore(); }
    h.restore();
    label('도시 지도 — M으로 닫기 · 빨간 네모 = 막힌 길', ox, oy + S / 2 + 2, 14, '#c8cfdb');
  };
  // M으로 도시 지도 켜고 끄기 (배그식 · 예전엔 Tab을 누르고 있는 동안 — Tab은 이제 소지품 창, inv3d)
  addEventListener('keydown', e => {
    if (e.code !== 'KeyM' || e.repeat) return;
    const g = ZK.debug3 && ZK.debug3.g; if (!g || g.state !== 'play' || (ZK.surv && ZK.surv.choosing)) return;
    C.showMap = !C.showMap; if (C.showMap && ZK.inv) ZK.inv.open = false;
  });
  addEventListener('blur', () => { C.showMap = false; });
  ZK.city = C;
})();
