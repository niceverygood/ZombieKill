// 2탄: 고층 타워 — 1탄(광장)에서 챙긴 무기로 계단·복도의 좀비 떼를 뚫고, 옥상에서 헬기를 타고 이륙한다 (2026-11-10)
//
// 흐름: 8:30 무전 → 타워 입구가 열린다 → 버스로 입구까지 → 내려서 로비로 → 계단(A) 1~4층 → 4층 복도 → 계단(B) → 5층 복도
//       → 계단(A) 5~8층 → 8층 복도 → 계단(B) → 9층 복도 → 계단(A) 9~12층 → 옥상 → 10:00 헬기 → G 3초 탑승 → 이륙 → 승리
//   A 계단은 4층·8층에서 무너져 있어서, 복도를 지나 B 계단으로 한 층을 돌아 올라가야 한다 → '계단과 복도'에서 싸운다
//
// 1탄 → 2탄 연결 (사용자 요청: "1탄에서 충분히 파밍해야 2탄 계단·복도의 좀비 떼를 처치할 수 있게, 유기적으로")
//   · 타워 안엔 버스 탄약고가 없다: 리볼버 예비탄 = 기본 12(TW.CFG.base) + 1탄에서 주운 '리볼버 탄'. 산탄·소총탄·수류탄·화염병·붕대는 들고 온 것만
//   · 버스가 방벽이 된다: 입구 14m 안에 버스를 대고 들어가면, 장갑판·체력만큼 무리가 로비로 못 들어온다(5~28초)
//   · 무리가 따라 올라온다: 광장에서 쫓던 놈과 해일이 입구로 몰려와 계단을 오른다 → 오래 머뭇거리면 뒤가 막힌다
//   · 1탄에서 시끄럽게 굴면(소음) 타워 앞이 더 붐빈다 — 광장 규칙이 그대로 이어진다
//
// 높이: world3d의 바닥면(groundAt) · 층 구간 벽(collider.y0) · 경계 예외(open)를 쓴다. 층이 겹치는 계단실도 '발 높이 기준 가장 높은 바닥'으로 판정
// 길찾기: 로비~옥상을 한 줄 경로(점 목록)로 두고, 좀비는 플레이어 쪽으로 다음 점을 따라간다 (game3d targetFor를 감싼다)
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const X0 = -24, X1 = -8, Z0 = -96, Z1 = -80, H = 3.6, NS = 12, ROOF = NS * H;
  const DOOR = { x0: -17.5, x1: -14.5, h: 3 }, W0 = new T.Vector3(-16, 0, -77.4);   // 입구 밖(광장 쪽) 점
  const LZ0 = -85, LZ1 = -83, FZ0 = -89.5, MZ0 = -91.5;   // 층계참 z −85~−83 · 계단 z −89.5~−85 · 중간 참 z −91.5~−89.5
  const SH = {
    A: { x0: -23.7, x1: -19.7, outer: [-23.7, -21.7], inner: [-21.7, -19.7], ox: -22.7, ix: -20.7, wallX0: -19.85, wallX1: -19.55,
      flights: [0, 1, 2, 3, 5, 6, 7, 9, 10, 11], landings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], open: [0, 4, 5, 8, 9, 12] },
    B: { x0: -12.3, x1: -8.3, outer: [-10.3, -8.3], inner: [-12.3, -10.3], ox: -9.3, ix: -11.3, wallX0: -12.45, wallX1: -12.15,
      flights: [4, 8], landings: [4, 5, 8, 9], open: [4, 5, 8, 9] },
  };
  const CORR = [4, 5, 8, 9], CX0 = -19.55, CX1 = -12.45, CZ0 = -85.5, CZ1 = -82.5;
  const PAD = { x: -13.6, z: -88.6, r: 4 };
  const TW = ZK.tower = { X0, X1, Z0, Z1, H, ROOF, PAD, W0, BRIEF_T: 360, inside: false, entered: false, open: false, boarded: false, escaped: false, ready: false };
  let scene, route = [], doorCol, doorMesh, blockCol = null, pads = [], heliRef = null;
  const W = () => ZK.world, ps = () => ZK.player.state;
  const inFoot = p => p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1 - 0.3;   // 앞벽(z −80) 안쪽
  TW.inFoot = inFoot;   // fortress3d: 버스 사수·포탑은 타워 안 좀비를 못 쏜다(벽 너머)
  // 노브 (2026-11-10 24차 A/B 뒤): base 기본 예비탄 · pad 탄약 상자 한 개 · hpMul 타워 좀비 체력 배율 · extra 복도마다 워커 추가 · calmHeli 헬기 도착 몇 초 전부터 따라오는 무리 멈춤
  //  예전 값 { base 24, pad 12, hpMul 1.5, extra 0, calmHeli 0 }: 맨손으로 와도 78% 탈출(꾸러미 83%) — 방망이와 54발이면 충분해서 1탄 파밍이 2탄을 안 갈랐다
  TW.CFG = { base: 12, pad: 8, hpMul: 1.5, extra: 0, calmHeli: 8 };   // 1차: 공짜 탄만 줄인다(체력·무리는 그대로) — 마트 세션 실측(마트 끔): 보통·초보 사망의 7/16이 이미 타워라 전체를 어렵게 하면 기준 밑으로 빠진다

  // ───────── 지오메트리 (재질별로 모아 한 메시로 합친다 → 드로우콜 몇 개) ─────────
  const geos = { facade: [], concrete: [], stair: [], dark: [], debris: [], lamp: [], sign: [] };
  const cols = [];
  function uvScale(g, w, h, d, tile) {   // BoxGeometry 면마다 uv를 실제 크기/타일로 늘린다 (텍스처가 늘어지지 않게)
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  }
  const TILE = { facade: 8, concrete: 3, stair: 1.2, dark: 3, debris: 2, lamp: 1, sign: 1 };
  function box(kind, x0, x1, y0, y1, z0, z1, solid) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0); if (w < 1e-3 || h < 1e-3 || d < 1e-3) return;
    const g = new T.BoxGeometry(w, h, d); uvScale(g, w, h, d, TILE[kind]); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); geos[kind].push(g);
    if (solid) cols.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0: Math.min(y0, y1), h: Math.max(y0, y1) });
  }
  // 벽 + 문 구멍(높이 구간 gaps를 뺀 나머지만 세운다)
  function wallGaps(kind, x0, x1, z0, z1, yb, yt, gaps) {
    let y = yb; for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (a > y) box(kind, x0, x1, y, a, z0, z1, true); y = Math.max(y, b); }
    if (yt > y) box(kind, x0, x1, y, yt, z0, z1, true);
  }
  // 경사 계단: x0~x1 폭, z는 zLo(낮은 끝)→zHi 방향, yLo→yHi. 시각은 기울인 판, 판정은 바닥면(ramp)
  function flight(x0, x1, zLo, zHi, yLo, yHi) {
    const len = Math.abs(zHi - zLo), rise = yHi - yLo, slope = Math.hypot(len, rise), ang = Math.atan2(rise, len) * Math.sign(zLo - zHi), w = x1 - x0;
    const g = new T.BoxGeometry(w, 0.22, slope); uvScale(g, w, 0.22, slope, TILE.stair); g.rotateX(ang); g.translate((x0 + x1) / 2, (yLo + yHi) / 2 - 0.11, (zLo + zHi) / 2); geos.stair.push(g);
    const minZ = Math.min(zLo, zHi), maxZ = Math.max(zLo, zHi);
    W().surfaces.push({ minX: x0, maxX: x1, minZ, maxZ, axis: 'z', y0: minZ === zLo ? yLo : yHi, y1: minZ === zLo ? yHi : yLo });
  }
  function slab(kind, x0, x1, z0, z1, y, surf = true) {
    box(kind, x0, x1, y - 0.25, y, z0, z1, false);
    if (surf) W().surfaces.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0: y });
  }
  function merge(list) {
    let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let ov = 0, oi = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2);
      const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + ov; ov += g.attributes.position.count; oi += ia.length; g.dispose();
    }
    const m = new T.BufferGeometry(); m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('normal', new T.BufferAttribute(nor, 3)); m.setAttribute('uv', new T.BufferAttribute(uv, 2));
    m.setIndex(new T.BufferAttribute(idx, 1)); m.computeBoundingSphere(); m.computeBoundingBox(); return m;
  }
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }

  function build() {
    const fy = k => k * H;
    // 바깥벽: 광장 쪽(z −80)에 입구, 지붕 위 1.2m 난간까지
    const top = ROOF + 1.2;
    box('facade', X0, DOOR.x0, 0, top, -80.3, -80, true); box('facade', DOOR.x1, X1, 0, top, -80.3, -80, true); box('facade', DOOR.x0, DOOR.x1, DOOR.h, top, -80.3, -80, true);
    box('facade', X0, X1, 0, top, Z0, Z0 + 0.3, true); box('facade', X0, X0 + 0.3, 0, top, Z0, Z1, true); box('facade', X1 - 0.3, X1, 0, top, Z0, Z1, true);
    // 입구 간판·차양
    box('dark', DOOR.x0 - 1.2, DOOR.x1 + 1.2, DOOR.h, DOOR.h + 0.25, -79.2, -80, false);

    // 계단실 두 개
    for (const key of ['A', 'B']) {
      const s = SH[key];
      const yTop = key === 'A' ? ROOF + 3 : ROOF;
      // 북·남 벽 (전 높이)
      box('concrete', s.x0, s.x1 + (key === 'A' ? 0.15 : 0), 0, yTop, -82.85, -82.55, true);
      box('concrete', s.x0, s.x1 + (key === 'A' ? 0.15 : 0), 0, yTop, -91.95, -91.65, true);
      // 복도 쪽 벽: 층계참 앞(z −85~−83)만 열린 층에 문 구멍
      box('concrete', s.wallX0, s.wallX1, 0, yTop, -91.65, LZ0, true); box('concrete', s.wallX0, s.wallX1, 0, yTop, LZ1, -82.85, true);
      wallGaps('concrete', s.wallX0, s.wallX1, LZ0, LZ1, 0, yTop, s.open.map(k => [fy(k), fy(k) + 2.6]));
      // 가운데 벽(오르는 계단 둘 사이) — 계단 사이로 떨어지지 않게
      const mid = (s.outer[1] + s.inner[0]) / 2; box('concrete', mid - 0.05, mid + 0.05, 0, key === 'A' ? ROOF : fy(9) + 0.01, FZ0, LZ0, true);
      // 층계참
      for (const k of s.landings) {
        if (k > 0) slab('concrete', s.x0, s.x1, LZ0, LZ1 + 0.15, fy(k));
        const hasUp = s.flights.includes(k) && k < NS, hasArr = k > 0 && s.flights.includes(k - 1);
        // 올라갈 계단이 없는 쪽(무너진 곳)·내려오는 계단이 없는 쪽: 잔해 더미 / 난간
        if (!hasUp) { box('debris', s.outer[0], s.outer[1], fy(k), fy(k) + (k === NS ? 1.1 : 2.4), LZ0 - 0.25, LZ0, true); if (k < NS) for (let i = 0; i < 4; i++) box('debris', s.outer[0] + rand(0, 1.4), s.outer[0] + rand(1.6, 2), fy(k), fy(k) + rand(0.4, 1.4), LZ0 - rand(0.3, 1.6), LZ0 - 0.2, false); }
        if (!hasArr && k > 0) box('dark', s.inner[0], s.inner[1], fy(k), fy(k) + 1.05, LZ0 - 0.12, LZ0, true);
        // 비상등 (문 위 붉은 등) · 층 표시
        if (k <= NS) box('lamp', (s.x0 + s.x1) / 2 - 0.25, (s.x0 + s.x1) / 2 + 0.25, fy(k) + 2.75, fy(k) + 2.88, -82.9, -82.85, false);
        signs.push({ x: (s.x0 + s.x1) / 2, y: fy(k) + 1.75, z: -82.86, label: k === NS ? 'R' : `${k + 1}F` });
      }
      for (const k of s.flights) {
        flight(s.outer[0], s.outer[1], LZ0, FZ0, fy(k), fy(k) + H / 2);                 // 오르는 계단 1 (바깥쪽, 남쪽으로)
        slab('concrete', s.x0, s.x1, MZ0, FZ0, fy(k) + H / 2);                           // 중간 참
        flight(s.inner[0], s.inner[1], FZ0, LZ0, fy(k) + H / 2, fy(k + 1));              // 오르는 계단 2 (안쪽, 북쪽으로)
        box('lamp', (s.x0 + s.x1) / 2 - 0.2, (s.x0 + s.x1) / 2 + 0.2, fy(k) + H / 2 + 2.6, fy(k) + H / 2 + 2.72, -91.65, -91.6, false);
      }
      if (key === 'B') slab('dark', s.x0, s.x1, -91.95, -82.55, ROOF, false);   // B 계단실 꼭대기는 지붕으로 덮는다
    }
    // A 계단탑 지붕 · 서쪽 벽(난간 위)
    box('concrete', X0, -19.55, ROOF + 3, ROOF + 3.25, -91.95, -82.55, false); box('concrete', X0, X0 + 0.3, top, ROOF + 3, -91.95, -82.55, true);
    // 로비 (1층): 입구 ~ A 계단 층계참
    slab('dark', CX0, CX1, CZ0 - 0.3, -80.3, H, false);
    box('concrete', CX0, CX1, 0, H, CZ0 - 0.3, CZ0, true);
    box('concrete', SH.A.wallX0, SH.A.wallX1, 0, H, -82.55, -80.3, true); box('concrete', SH.B.wallX0, SH.B.wallX1, 0, H, -82.55, -80.3, true);
    box('dark', CX0 + 1, CX0 + 3.2, 0, 1.05, -81.4, -80.9, true);   // 안내 데스크
    // 복도 (4·5·8·9층)
    for (const k of CORR) {
      slab('concrete', CX0, CX1, CZ0, CZ1, fy(k));
      if (!CORR.includes(k + 1)) slab('dark', CX0, CX1, CZ0, CZ1, fy(k + 1), false);
      box('concrete', CX0, CX1, fy(k), fy(k + 1), CZ1, CZ1 + 0.3, true); box('concrete', CX0, CX1, fy(k), fy(k + 1), CZ0 - 0.3, CZ0, true);
      for (const x of [-18, -15.6, -13.4]) { box('dark', x, x + 1.1, fy(k), fy(k) + 2.2, CZ1 - 0.05, CZ1, false); box('dark', x + 0.4, x + 1.5, fy(k), fy(k) + 2.2, CZ0, CZ0 + 0.05, false); }   // 사무실 문
      box('lamp', -16.3, -15.7, fy(k) + 3.2, fy(k) + 3.3, -84.3, -83.7, false);
      // 문턱: 층계참과 복도 바닥 사이 틈(벽 두께)을 메운다 — 여기를 밟은 좀비가 아래층으로 떨어지던 문제
      slab('concrete', SH.A.x1, CX0, LZ0, LZ1, fy(k)); slab('concrete', CX1, SH.B.x0, LZ0, LZ1, fy(k));
      // 넘어진 책상·캐비닛 (지나가려면 비켜야 하는 엄폐물)
      box('debris', -17.6, -16.4, fy(k), fy(k) + 0.95, CZ0 + 0.2, CZ0 + 1.0, true);
      if (k % 2) box('debris', -14.8, -14.0, fy(k), fy(k) + 1.3, CZ1 - 0.9, CZ1 - 0.1, true);
    }
    // 옥상: 계단탑 자리를 뺀 나머지 · 헬기장
    slab('dark', X0, X1, Z0, -91.95, ROOF); slab('dark', X0, X1, -82.55, Z1, ROOF); slab('dark', -19.55, X1, -91.95, -82.55, ROOF);
    W().surfaces.push({ minX: SH.A.x0, maxX: SH.A.x1, minZ: LZ0, maxZ: LZ1 + 0.15, y0: ROOF });   // A 꼭대기 층계참(=옥상 높이)
    slab('dark', SH.A.x1, -19.55, LZ0, LZ1, ROOF);   // 옥상 문턱
    for (const [x, z] of [[-10, -95], [-22, -94.5], [-10.5, -81.5]]) box('debris', x, x + 1.6, ROOF, ROOF + 1.4, z, z + 1.2, true);   // 옥상 실외기

    // 메시
    const conc = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#4a4c50'; c.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(0,0,0,${rand(0.03, 0.12)})`; c.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); } c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 3, w, 3); });
    const fac = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#1b2029'; c.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = Math.random() < 0.18 ? '#e6c56a' : '#0c1018'; c.fillRect(x * 64 + 10, y * 64 + 12, 44, 38); } });
    const facEm = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (Math.random() < 0.16) { c.fillStyle = '#8a7238'; c.fillRect(x * 64 + 10, y * 64 + 12, 44, 38); } });
    const stair = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#55575b'; c.fillRect(0, 0, w, h); c.fillStyle = '#2e2f33'; for (let i = 0; i < 4; i++) c.fillRect(0, i * 16, w, 3); c.fillStyle = '#b8902a'; for (let i = 0; i < 4; i++) c.fillRect(0, i * 16 + 3, w, 1); });
    const mats = {
      facade: new T.MeshLambertMaterial({ map: fac, emissiveMap: facEm, emissive: 0xffffff, emissiveIntensity: 0.9 }),
      concrete: new T.MeshLambertMaterial({ map: conc, color: 0x8a8c90 }),
      stair: new T.MeshLambertMaterial({ map: stair }),
      dark: new T.MeshLambertMaterial({ color: 0x2a2c30 }),
      debris: new T.MeshLambertMaterial({ color: 0x5a4a3a }),
      lamp: new T.MeshBasicMaterial({ color: 0xff3a2a }),
    };
    for (const k in mats) { if (!geos[k].length) continue; const m = new T.Mesh(merge(geos[k]), mats[k]); m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); W().solids.push(m); }
    // 층 표시(한 장의 아틀라스에서 잘라 붙인다)
    const LBL = ['1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F', '11F', '12F', 'R'], CW = 96;
    const atlas = canvasTex(CW * LBL.length, 64, (c) => { c.fillStyle = '#0e1013'; c.fillRect(0, 0, CW * LBL.length, 64); c.font = 'bold 42px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      LBL.forEach((t, i) => { c.fillStyle = i === LBL.length - 1 ? '#7dff9a' : '#e8e8e0'; c.fillText(t, i * CW + CW / 2, 34); }); });
    atlas.wrapS = atlas.wrapT = T.ClampToEdgeWrapping;
    const sg = [];
    for (const s of signs) { const i = LBL.indexOf(s.label), g = new T.PlaneGeometry(0.9, 0.6); const uv = g.attributes.uv; for (let k = 0; k < 4; k++) uv.setX(k, (i + uv.getX(k)) / LBL.length); g.rotateY(Math.PI); g.translate(s.x, s.y, s.z - 0.01); sg.push(g); }
    if (sg.length) { const m = new T.Mesh(merge(sg.map(g => g.index ? g : g)), new T.MeshBasicMaterial({ map: atlas })); scene.add(m); }
    // 헬기장 표시
    const padTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h); c.strokeStyle = '#e8e8e0'; c.lineWidth = 12; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 10, 0, 6.283); c.stroke(); c.fillStyle = '#e8e8e0'; c.font = 'bold 150px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, h / 2 + 8); });
    const pm = new T.Mesh(new T.PlaneGeometry(PAD.r * 2, PAD.r * 2), new T.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false })); pm.rotation.x = -Math.PI / 2; pm.position.set(PAD.x, ROOF + 0.03, PAD.z); scene.add(pm);
    // 잠긴 입구(8:30까지): 셔터 + 충돌
    doorMesh = new T.Mesh(new T.BoxGeometry(DOOR.x1 - DOOR.x0, DOOR.h, 0.12), new T.MeshLambertMaterial({ color: 0x3a3d42 })); doorMesh.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, -80.15); scene.add(doorMesh); W().solids.push(doorMesh);
    doorCol = { minX: DOOR.x0, maxX: DOOR.x1, minZ: -80.3, maxZ: -80, y0: 0, h: DOOR.h };
    for (const c of cols) W().colliders.push(c);
    W().colliders.push(doorCol);
    W().open.push({ minX: X0 - 0.5, maxX: X1 + 0.5, minZ: Z0, maxZ: -76.9 });   // 타워 앞 인도(z −80~−77)와 타워 안은 맵 경계 밖이어도 다닌다
  }
  const signs = [];

  // ───────── 경로 (로비 → 옥상) ─────────
  function buildRoute() {
    const P = (x, z, y) => new T.Vector3(x, y, z), fy = k => k * H, R = [];
    const pair = (s, k) => { R.push(P(s.ox, -84, fy(k)), P(s.ox, -90.5, fy(k) + H / 2), P(s.ix, -90.5, fy(k) + H / 2), P(s.ix, -84, fy(k + 1))); };
    R.push(W0.clone(), P(-16, -81.6, 0), P(-18.4, -84, 0));
    for (const k of [0, 1, 2, 3]) pair(SH.A, k);
    const corridor = (k, east) => { const xs = east ? [-18.4, -13.6] : [-13.6, -18.4]; for (const x of xs) R.push(P(x, -84, fy(k))); };
    corridor(4, true); pair(SH.B, 4); corridor(5, false);
    for (const k of [5, 6, 7]) pair(SH.A, k);
    corridor(8, true); pair(SH.B, 8); corridor(9, false);
    for (const k of [9, 10, 11]) pair(SH.A, k);
    R.push(P(-18.4, -84, ROOF), P(PAD.x, PAD.z, ROOF));
    route = R; TW.route = R;
  }
  function nearestIdx(p, lo = 0, hi = route.length - 1) {
    let bi = lo, bd = 1e9;
    for (let i = Math.max(0, lo); i <= Math.min(route.length - 1, hi); i++) { const w = route[i], dx = w.x - p.x, dz = w.z - p.z, dy = (w.y - p.y) * 2.2, d = dx * dx + dz * dz + dy * dy; if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  TW.floorOf = y => Math.min(NS, Math.max(0, Math.floor((y + 0.6) / H)));

  // ───────── 좀비 길찾기 (game3d targetFor를 감싼다) ─────────
  // 플레이어가 타워 안이면: 밖의 좀비는 입구 앞(W0)으로 → 경로를 따라 플레이어 쪽으로. 같은 구간·같은 층이면 바로 플레이어
  // 자는(추적 아닌) 타워 좀비는 다른 층의 플레이어를 '못 본다' (2D 시야 판정이 층을 뚫지 않게)
  const FAR = (z) => ({ x: z.pos.x + 999, z: z.pos.z, kind: 'point' });
  // 경로를 '구간'(점 i → i+1)으로 보고, 위치를 가장 가까운 구간에 투영한다 (높이 차는 2.2배로 무겁게 → 겹친 층을 헷갈리지 않게)
  // 이음점에서 두 구간이 같으면: 앞으로 갈 땐 뒤 구간, 뒤로 갈 땐 앞 구간을 고른다 (이음점에서 멈추지 않게)
  function nearestSeg(p, lo, hi, fwd) {
    let bs = Math.max(0, lo), bd = 1e9;
    for (let s = Math.max(0, lo); s < Math.min(route.length - 1, hi + 1); s++) {
      const a = route[s], b = route[s + 1], abx = b.x - a.x, abz = b.z - a.z, aby = (b.y - a.y) * 2.2, L = abx * abx + abz * abz + aby * aby || 1e-6;
      const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz + (p.y - a.y) * 2.2 * aby) / L, 0, 1);
      const dx = p.x - (a.x + abx * t), dz = p.z - (a.z + abz * t), dy = (p.y - (a.y + (b.y - a.y) * t)) * 2.2, d = dx * dx + dz * dz + dy * dy;
      if (fwd ? d <= bd + 1e-6 : d < bd - 1e-6) { bd = d; bs = s; }
    }
    return bs;
  }
  const toP = (w) => ({ x: w.x, z: w.z, kind: 'point' });
  TW.routeTarget = function (z, t) {
    if (!TW.ready || !route.length) return t;
    const P = ps();
    if (TW.boarded) return FAR(z);
    const zin = inFoot(z.pos) || z.navI !== undefined;
    if (!TW.inside) {   // 플레이어가 밖: 타워 안의 쫓던 놈은 경로를 거꾸로 내려가 입구로 나온다
      if (!zin) return t;
      if (z.aware !== 'chase') return z.tw ? FAR(z) : t;   // 자는 타워 좀비는 밖의 플레이어를 못 본다
      z.navI = z.navI === undefined ? nearestSeg(z.pos, 0, route.length, false) : nearestSeg(z.pos, z.navI - 3, z.navI + 3, false);
      if (z.navI <= 0 && Math.hypot(z.pos.x - W0.x, z.pos.z - W0.z) < 2.2) { z.navI = undefined; return t; }
      return toP(route[z.navI]);
    }
    if (z.navI === undefined) {
      if (!inFoot(z.pos)) {   // 밖의 놈: 먼저 입구 앞(W0)으로. 안이 꽉 차면(45) 입구 앞에서 기다린다
        if (Math.hypot(z.pos.x - W0.x, z.pos.z - W0.z) > 1.6 || TW.towerN >= 45) return z.aware === 'chase' ? toP(W0) : t;
        z.navI = 0;
      } else z.navI = nearestSeg(z.pos, 0, route.length, true);
    }
    const pS = TW.pI ?? 0, fwd = pS > z.navI;
    z.navI = nearestSeg(z.pos, z.navI - 3, z.navI + 3, fwd);
    const dy = Math.abs(z.pos.y - P.pos.y);
    if (Math.abs(pS - z.navI) <= 2 && dy < 1.7) return { x: P.pos.x, z: P.pos.z, kind: 'player' };   // 같은 층 가까운 구간: 바로 플레이어
    if (z.aware !== 'chase') return FAR(z);   // 자는 놈은 다른 층의 플레이어를 못 본다
    if (pS === z.navI) return { x: P.pos.x, z: P.pos.z, kind: 'player' };
    return toP(fwd ? route[z.navI + 1] : route[z.navI]);
  };

  // ───────── 2탄 시작: 입구가 열리고, 들어가면 준비물 점검 ─────────
  TW.open = function (g) {
    if (TW.isOpen) return; TW.isOpen = true; doorMesh.visible = false;
    const i = W().colliders.indexOf(doorCol); if (i >= 0) W().colliders.splice(i, 1);
    const j = W().solids.indexOf(doorMesh); if (j >= 0) W().solids.splice(j, 1);
  };
  TW.carry = () => { const inv = ZK.needs.inv, G3 = ZK.gun3; return { ammo: 24 + (inv.ammo || 0), shell: G3.hasShotgun ? (inv.shell || 0) + G3.sg.loaded : 0, rifle: G3.hasRifle ? (inv.rifleAmmo || 0) : 0, nade: inv.grenade || 0, molotov: inv.molotov || 0, bandage: inv.bandage || 0, gun: ZK.fort.state.gunners.length }; };
  function onFirstEnter(g) {
    TW.entered = true; TW.enterT = g.t; TW.checkT = 5.5;
    // 리볼버 예비탄: 기본 CFG.base(버스 탄약고에서 한 줌) + 1탄에서 주운 리볼버 탄 전부
    TW.reserve = TW.CFG.base + (ZK.needs.inv.ammo || 0); ZK.needs.inv.ammo = 0;
    // 버스 방벽: 입구 14m 안에 버스를 대고 들어왔으면, 장갑판·체력만큼 무리가 로비로 못 들어온다
    const F = ZK.fort.state, near = F.hp > 0 && !(ZK.bail && ZK.bail.wrecked) && Math.hypot(F.pos.x - W0.x, F.pos.z - W0.z) < 14;
    TW.blockT = near ? clamp(5 + F.modules * 1.2 + 12 * F.hp / F.maxHp, 5, 28) : 3; TW.busBlock = near;
    blockCol = { minX: DOOR.x0, maxX: DOOR.x1, minZ: -80.3, maxZ: -80, y0: 0, h: DOOR.h }; W().colliders.push(blockCol);
    spawnPacks(g);
    g.onNotice(near ? `버스로 입구를 막았다 — 무리가 ${Math.round(TW.blockT)}초 동안 못 들어온다. 위로!` : '입구가 뚫려 있다 — 곧 무리가 따라 들어온다. 위로!', '#7dff9a');
  }
  // 타워 안 좀비 떼: 복도(4·5·8·9층)와 계단 몇 곳에 잠들어 있다 → 같은 층에서 보이거나, 2층 안에서 총소리가 나면 깬다
  function spawnPacks(g) {
    const fy = k => k * H, put = (type, x, z, y, hp = TW.CFG.hpMul) => {
      const z3 = new ZK.Zombie3(type, new T.Vector3(x, y, z), scene, hp); z3.aware = 'alert'; z3.alertPos.set(x, y, z); z3.alertT = 1e9; z3.tw = true; z3.home = new T.Vector3(x, y, z);
      z3.root.rotation.y = rand(0, 6.283); g.zombies.push(z3); return z3;
    };
    const corr = (k, walkers, runners, brute) => {
      for (let i = 0; i < walkers; i++) put('walker', rand(-18.8, -13.2), rand(-85, -83), fy(k));
      for (let i = 0; i < runners; i++) put('runner', rand(-18, -14), rand(-85, -83), fy(k));
      if (brute) put('brute', -16, -84, fy(k), TW.CFG.hpMul * 0.8);
    };
    const X = TW.CFG.extra; corr(4, 5 + X, 2, false); corr(5, 4 + X, 0, true); corr(8, 6 + X, 2, false); corr(9, 5 + X, 1, true);
    for (const k of [2, 6, 10]) for (let i = 0; i < 2; i++) put('walker', rand(-23, -20.4), rand(-84.8, -83.4), fy(k));
    for (const k of [3, 7]) put('runner', -21.7, -90.5, fy(k) + H / 2);
    for (const k of [4, 8]) for (let i = 0; i < 2; i++) put('walker', rand(-11.8, -8.8), -90.5, fy(k) + H / 2);
    // 탄약 상자 2개(경로 위): 리볼버 탄 +12
    pads = [{ x: -22.7, z: -84.2, y: fy(6), n: TW.CFG.pad, mesh: null }, { x: -15.6, z: -82.95, y: fy(9), n: TW.CFG.pad, mesh: null }];
    for (const a of pads) { const m = new T.Mesh(new T.BoxGeometry(0.5, 0.3, 0.32), new T.MeshLambertMaterial({ color: 0x3a5a2a, emissive: 0x1a3a10 })); m.position.set(a.x, a.y + 0.15, a.z); scene.add(m); a.mesh = m; }
  }

  // ───────── 매 프레임 ─────────
  TW.update = function (dt, g) {
    if (!TW.ready) return;
    const P = ps(), G3 = ZK.gun3;
    if (!TW.isOpen && ZK.mis.lz) TW.open(g);
    // 6:00 무전 — 2탄 예고: 타워 안엔 버스 탄약고가 없다는 걸 2분 앞서 알려 1탄 남은 시간을 '챙기는 시간'으로 만든다
    if (!TW.briefed && g.t >= TW.BRIEF_T && !TW.isOpen) { TW.briefed = true; g.onNotice('무전: 8:00 북쪽 타워로 — 안엔 탄약고가 없다. 탄을 아껴 둬라', '#ffd23a'); ZK.audio.notice(); }
    const was = TW.inside;
    TW.inside = g.mode === 'foot' && inFoot(P.pos);
    if (TW.inside && !TW.entered) onFirstEnter(g);
    // 리볼버 예비탄: 안에선 유한, 밖으로 나가면 다시 버스 탄약고(무한)
    if (TW.inside && !was) G3.reserve = TW.reserve;
    if (!TW.inside && was) { TW.reserve = G3.reserve; G3.reserve = Infinity; }
    if (TW.inside) TW.reserve = G3.reserve;
    if (G3.outT > 0) G3.outT -= dt;
    // 플레이어 진행 위치(경로 번호) — 층이 겹쳐도 튀지 않게 근처에서만 찾는다
    if (TW.inside) TW.pI = TW.pI === undefined ? nearestSeg(P.pos, 0, route.length, true) : nearestSeg(P.pos, TW.pI - 4, TW.pI + 4, true);
    // 버스 방벽이 버티는 시간 → 끝나면 입구가 뚫린다
    if (blockCol && TW.entered && (TW.blockT -= dt) <= 0) {
      const i = W().colliders.indexOf(blockCol); if (i >= 0) W().colliders.splice(i, 1); blockCol = null;
      g.onNotice(TW.busBlock ? '버스가 밀렸다 — 무리가 로비로 쏟아진다!' : '무리가 로비로 들어온다!', '#ff5a4a'); ZK.audio.thud(); ZK.fx3.trauma(0.2);
    }
    // 따라 올라오는 무리: 안에 있는 동안 5초마다 3마리가 입구 앞에 나타난다 (타워 안 좀비 45마리까지)
    // 헬기가 내려오는 동안(10:00 − calmHeli초부터)은 새로 안 나타난다: 헬기 1~2초 전에 옥상에서 죽는 판이 꾸러미 묶음 3판이었다
    if (TW.inside && !blockCol && !TW.boarded && g.t < ZK.mis.HELI_T - TW.CFG.calmHeli && (TW.followT = (TW.followT || 0) - dt) <= 0) {
      TW.followT = 5;
      const n = g.zombies.reduce((c, z) => c + (z.alive && (z.navI !== undefined || inFoot(z.pos)) ? 1 : 0), 0);
      if (n < 45) for (let i = 0; i < 3; i++) { const z3 = new ZK.Zombie3(Math.random() < 0.3 ? 'runner' : 'walker', new T.Vector3(W0.x + rand(-2.5, 2.5), 0, W0.z + rand(0, 1.2)), scene, 1.8); z3.aware = 'chase'; z3.navI = 0; g.zombies.push(z3); }
    }
    // 좀비 높이(계단·층)와 소리 반응
    TW.towerN = 0;
    for (const z of g.zombies) {
      if (z.alive && (z.navI !== undefined || inFoot(z.pos))) TW.towerN++;
      if (!z.alive) continue;
      const zin = inFoot(z.pos) || z.pos.y > 0.05;
      if (zin && z.state !== 'cling' && z.state !== 'flying') {   // 오르막·내리막은 바닥에 붙이고, 낭떠러지는 순간이동하지 않고 떨어진다
        const gy = W().groundAt(z.pos.x, z.pos.z, z.pos.y);
        z.pos.y = gy >= z.pos.y - 0.8 ? gy : Math.max(gy, z.pos.y - 9 * dt);
      }
      if (z.tw && z.aware === 'alert' && z.alertT < 1e8) {   // 총소리에 깸: 2층 안이면 쫓아오고, 아니면 제자리로
        if (Math.abs(z.pos.y - P.pos.y) < 7.5) z.aware = 'chase'; else { z.alertPos.copy(z.home); z.alertT = 1e9; }
      }
      if (!zin && TW.inside && z.aware === 'alert' && z.alertT < 1e8 && inFoot(z.alertPos)) z.alertPos.set(W0.x, 0, W0.z);   // 밖의 놈은 타워 안 소리를 듣고 입구로
    }
    // 탄약 상자 줍기
    for (const a of pads) if (a.mesh.visible && Math.hypot(a.x - P.pos.x, a.z - P.pos.z) < 1.3 && Math.abs(a.y - P.pos.y) < 1.2) {
      a.mesh.visible = false; G3.reserve += a.n; ZK.audio.absorb(); ZK.fx3.text(new T.Vector3(a.x, a.y + 1.6, a.z), `리볼버 탄 +${a.n}`, '#9aff5a', 26, 1.0);
    }
    if (TW.checkT > 0) TW.checkT -= dt;
    // ── 옥상: 10:00 헬기 → G 3초 탑승 → 이륙 3초 → 승리 ──
    const onRoof = TW.inside && P.pos.y > ROOF - 0.6;
    const heliIn = g.t >= ZK.mis.HELI_T, nearHeli = onRoof && Math.hypot(P.pos.x - PAD.x, P.pos.z - PAD.z) < PAD.r + 0.8;
    TW.canBoard = heliIn && nearHeli && !TW.boarded;
    if (TW.canBoard && ZK.player.keys.KeyG) { TW.boardT = (TW.boardT || 0) + dt; if (TW.boardT >= 3) { TW.boarded = true; TW.liftT = 0; ZK.mis.won = true; g.onNotice('탑승! 이륙한다 — 꽉 잡아!', '#7dff9a'); ZK.audio.levelUp(); } }
    else if (!TW.boarded) TW.boardT = Math.max(0, (TW.boardT || 0) - dt * 2);
    if (TW.boarded) {
      TW.liftT += dt; const y = ROOF + 1.4 + TW.liftT * TW.liftT * 1.6;
      P.pos.set(PAD.x - 0.6, y, PAD.z + 1.2); P.vel.set(0, 0, 0); P.vy = 0; P.onGround = true; g.hp = Math.max(g.hp, 1);
      if (TW.liftT >= 3.2) TW.escaped = true;
    }
  };

  // ───────── 화면 ─────────
  TW.drawHUD = function (h, Wd, Ht, g, label) {
    if (!TW.ready || g.state !== 'play') return;
    const P = ps(), G3 = ZK.gun3, inv = ZK.needs.inv;
    // 6:00 무전 뒤, 아직 밖: 타워 준비물 한 줄 (1탄 파밍이 2탄 무기가 된다는 걸 보이게 — 열리기 2분 전부터)
    if ((TW.isOpen || TW.briefed) && !TW.entered) {
      const c = TW.carry(); label(`타워 준비물 — 리볼버 탄 ${c.ammo} · 산탄 ${c.shell} · 소총탄 ${c.rifle} · 수류탄 ${c.nade} · 화염병 ${c.molotov} · 붕대 ${c.bandage}`, Wd / 2, 182, 15, '#c8e8b0');
    }
    if (TW.inside) {
      const fl = TW.floorOf(P.pos.y), left = NS - fl, rs = isFinite(G3.reserve) ? G3.reserve : 0;
      label(fl >= NS ? '옥상' : `타워 ${fl + 1}F — 옥상까지 ${left}층`, Wd / 2, 150, 18, '#7dff9a');
      label(`리볼버 예비탄 ${rs}${blockCol ? ` · 입구 방벽 ${Math.ceil(TW.blockT)}초` : ''}`, Wd / 2, 174, 15, rs <= 6 ? '#ff6a4a' : '#e8e8e0');
      if (G3.outT > 0) label('리볼버 탄 없음 — 산탄·소총·수류탄 · 4 방망이로!', Wd / 2, Ht * 0.62, 20, '#ff6a4a');
      if (P.pos.y > ROOF - 0.6) {
        if (TW.boarded) label('이륙!', Wd / 2, Ht * 0.4, 30, '#7dff9a');
        else if (TW.canBoard) label(`G 길게 — 헬기 탑승 ${(TW.boardT || 0).toFixed(1)} / 3초`, Wd / 2, Ht * 0.62, 22, '#7dff9a');
        else if (g.t < ZK.mis.HELI_T) label(`헬기 도착까지 ${Math.ceil(ZK.mis.HELI_T - g.t)}초 — 옥상 문을 지켜라`, Wd / 2, Ht * 0.62, 20, '#ffd23a');
        else label('헬기장(H)으로!', Wd / 2, Ht * 0.62, 20, '#7dff9a');
      }
    }
    // 들어선 순간 준비물 점검 (5초)
    if (TW.checkT > 0) {
      const c = TW.carry(), a = Math.min(1, TW.checkT), x = Wd / 2, y0 = Ht * 0.3;
      h.globalAlpha = a * 0.78; h.fillStyle = '#0a0d12'; h.fillRect(x - 230, y0 - 34, 460, 196); h.globalAlpha = a;
      label('2탄 — 타워 진입 · 들고 온 것', x, y0, 22, '#7dff9a');
      label(`리볼버 예비탄 ${TW.reserve}  (버스 탄약고 ${TW.CFG.base} + 주운 탄)`, x, y0 + 32, 16, '#e8e8e0');
      label(`산탄 ${c.shell} · 소총탄 ${c.rifle} · 수류탄 ${c.nade} · 화염병 ${c.molotov}`, x, y0 + 56, 16, '#e8e8e0');
      label(`붕대 ${c.bandage}`, x, y0 + 80, 16, '#e8e8e0');
      label(TW.busBlock ? `버스 방벽 ${Math.round(TW.blockT + (5.5 - TW.checkT))}초 — 장갑판·체력만큼 버틴다` : '버스 방벽 없음 — 무리가 곧 따라온다', x, y0 + 110, 16, TW.busBlock ? '#c8e8b0' : '#ff8a5a');
      label('A 계단은 4층·8층에서 무너졌다 — 복도를 지나 B 계단으로 돌아가라', x, y0 + 138, 15, '#ffd23a');
      h.globalAlpha = 1;
    }
  };
  // 나침반·봇이 쓰는 '지금 갈 곳'
  TW.next = function () {
    if (!TW.inside) return { x: W0.x, z: W0.z };
    const i = clamp((TW.pI || 0) + 2, 0, route.length - 1), w = route[i]; return { x: w.x, z: w.z, y: w.y };
  };

  TW.init = function (sc) { scene = sc; build(); buildRoute(); TW.ready = true; };
  TW.reset = function (g) {
    TW.inside = false; TW.entered = false; TW.boarded = false; TW.escaped = false; TW.pI = undefined; TW.boardT = 0; TW.checkT = 0; TW.followT = 0; TW.reserve = TW.CFG.base; TW.briefed = false;
    if (TW.isOpen) { TW.isOpen = false; doorMesh.visible = true; if (!W().colliders.includes(doorCol)) W().colliders.push(doorCol); if (!W().solids.includes(doorMesh)) W().solids.push(doorMesh); }
    if (blockCol) { const i = W().colliders.indexOf(blockCol); if (i >= 0) W().colliders.splice(i, 1); blockCol = null; }
    for (const a of pads) if (a.mesh) scene.remove(a.mesh); pads = [];
  };
})();
