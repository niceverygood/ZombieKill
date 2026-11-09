// 생존 레이어 2단계: 생존 수치(연료·허기·갈증·피로·출혈·감염) · 인벤토리(개수만) · 수색 지점(걸어서 G 길게)
// 버스 위는 물리지 않는 안전지대 → 내려서 뒤지는 것이 '목숨 건 원정'. 수치는 손맛을 막지 않고 조금씩 무디게 한다
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const N = {};
  const ITEMS = { can: '통조림', water: '생수', bandage: '붕대', fuelcan: '연료통', pill: '진통제', anti: '항생제', scrap: '고철', cloth: '천', bottle: '술병', wood: '목재', shell: '산탄', molotov: '화염병' };
  const LOOT = [['can', 22], ['water', 24], ['bandage', 12], ['fuelcan', 11], ['pill', 8], ['shell', 12], ['molotov', 5], ['scrap', 6], ['cloth', 6], ['bottle', 4], ['wood', 3]];   // 산탄은 한 번에 4발
  const LOOT_SUM = LOOT.reduce((a, [, w]) => a + w, 0);
  const SEARCH_T = 2.5, REACH = 1.8;   // 1.5초는 봇 원정이 4~5초로 끝나 위험이 없었다
  N.ITEMS = ITEMS;
  let scene, ringGeo, ringMat;

  // 수색 지점: 외곽 건물 1층 상점 셔터 20곳(서는 자리는 벽 앞 3.5m) + 광장 안 배낭 7곳(땅바닥, 버스가 밟고 지나가도 되는 높이)
  const SHOPS = [];
  for (const x of [-62, -44, -26, 26, 44, 62]) { SHOPS.push({ at: [x, -76.4], wall: [x, -79.95, 0] }); SHOPS.push({ at: [x, 76.4], wall: [x, 79.95, Math.PI] }); }
  for (const z of [-50, -28, 28, 50]) { SHOPS.push({ at: [-76.4, z], wall: [-79.95, z, Math.PI / 2] }); SHOPS.push({ at: [76.4, z], wall: [79.95, z, -Math.PI / 2] }); }
  const PACKS = [[-33, 24], [33, -24], [36, 42.6], [-19.6, -16.4], [19.6, 16.4], [-1.8, -55.4], [56.2, -46.2]];
  N.START_PACK = [4.4, 8.8];   // 버스(0, 6) 오른쪽 뒤: 판 시작에 걸어서 처음 뒤지는 배낭 — 시작 꾸러미가 여기 들어 있다
  N.points = [];

  N.init = function (sc) {
    scene = sc;
    ringGeo = new T.RingGeometry(0.9, 1.15, 28); ringMat = new T.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const shutterMat = new T.MeshLambertMaterial({ color: 0x4a4e54 }), lineMat = new T.LineBasicMaterial({ color: 0xffd23a });
    for (const s of SHOPS) {
      const grp = new T.Group(); grp.position.set(s.wall[0], 0, s.wall[1]); grp.rotation.y = s.wall[2]; scene.add(grp);
      const geo = new T.BoxGeometry(2.6, 2.7, 0.12), m = new T.Mesh(geo, shutterMat.clone()); m.position.y = 1.35; grp.add(m);
      for (let i = 0; i < 7; i++) { const slat = new T.Mesh(new T.BoxGeometry(2.6, 0.03, 0.14), new T.MeshLambertMaterial({ color: 0x3a3d42 })); slat.position.set(0, 0.35 + i * 0.36, 0); grp.add(slat); }
      const edge = new T.LineSegments(new T.EdgesGeometry(geo), lineMat); edge.position.y = 1.35; grp.add(edge);
      addPoint('상점 셔터', s.at, m, edge);
    }
    for (const [x, z] of PACKS) {
      const grp = new T.Group(); grp.position.set(x, 0, z); grp.rotation.y = rand(0, 6.28); scene.add(grp);
      const geo = new T.BoxGeometry(0.55, 0.32, 0.38), m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0x4a5a3a })); m.position.y = 0.16; grp.add(m);
      const edge = new T.LineSegments(new T.EdgesGeometry(geo), lineMat); edge.position.y = 0.16; grp.add(edge);
      addPoint('버려진 배낭', [x, z], m, edge);
    }
    { const grp = new T.Group(); grp.position.set(N.START_PACK[0], 0, N.START_PACK[1]); scene.add(grp);
      const geo = new T.BoxGeometry(0.55, 0.32, 0.38), m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0x4a5a3a })); m.position.y = 0.16; grp.add(m);
      const edge = new T.LineSegments(new T.EdgesGeometry(geo), lineMat); edge.position.y = 0.16; grp.add(edge);
      addPoint('출발 배낭', N.START_PACK, m, edge); N.startPack = N.points[N.points.length - 1]; N.startPack.fixed = ['can', 'water', 'bandage']; }
  };
  function addPoint(name, at, mesh, edge) {
    const ring = new T.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(at[0], 0.02, at[1]); scene.add(ring);
    N.points.push({ name, pos: new T.Vector3(at[0], 0, at[1]), mesh, edge, ring, done: false });
  }

  N.reset = function () {
    N.s = { fuel: 100, hunger: 100, thirst: 100, fatigue: 0, infection: 0, infected: false, bleeding: false };
    N.inv = { can: 0, water: 0, bandage: 0, fuelcan: 0, pill: 0, anti: 0, scrap: 0, cloth: 0, bottle: 0, wood: 0, shell: 0, molotov: 0 };   // 시작 꾸러미(통조림·생수·붕대)는 출발 배낭 안에
    N.search = null; N.searched = 0; N.useT = 0; N.msg = null;
    for (const p of N.points) { p.done = false; p.edge.visible = true; p.ring.visible = true; p.mesh.material.color.setHex(p.name === '상점 셔터' ? 0x4a4e54 : 0x4a5a3a); }
  };
  N.s = null;

  const roll = () => { let r = Math.random() * LOOT_SUM; for (const [k, w] of LOOT) { if ((r -= w) < 0) return k; } return 'can'; };
  N.give = function (k, n = 1) { N.inv[k] = (N.inv[k] || 0) + n; };

  // ── 효과: 수치는 바로 죽이지 않고 손맛·사수를 무디게 한다 (0이 되면 걸을 때만 체력이 깎임) ──
  N.starving = () => N.s && (N.s.hunger <= 0 || N.s.thirst <= 0);
  N.reloadK = () => !N.s ? 1 : N.s.hunger <= 0 ? 0.6 : N.s.hunger < 30 ? 0.75 : 1;
  N.sway = () => !N.s ? 0 : (N.s.thirst <= 0 ? 0.025 : N.s.thirst < 30 ? 0.012 : 0) + (N.s.fatigue >= 70 ? 0.01 : 0);
  N.recoilK = () => N.s && N.s.fatigue >= 70 ? 1.2 : 1;
  N.crewK = () => N.starving() ? 0.7 : 1;
  const has = id => ZK.surv && ZK.surv.contract && ZK.surv.contract.has(id);
  // 계약 '혈액 연료 엔진': 4초 넘게 로드킬이 없으면 출력 −30%
  N.engineK = () => (N.s && N.s.fuel <= 0 ? 0.35 : 1) * (has('blood') && ZK.debug3 && ZK.debug3.g.t - (ZK.debug3.g.lastRamT || 0) > 4 ? 0.7 : 1);
  N.canBoost = () => !N.s || N.s.fuel > 0 || has('nitro');   // 직분사 부스트는 연료가 없어도 된다(버스 체력을 태움)

  N.onShot = () => { if (N.s) N.s.fatigue = Math.min(100, N.s.fatigue + 0.05); };   // 0.1이면 초당 1.5발 쏘는 봇이 5분 만에 100 → 판 후반 내내 흔들림
  N.onCar = () => { if (N.s) N.s.fuel = Math.min(100, N.s.fuel + (ZK.meta ? ZK.meta.carFuel() : 3)); };   // +6이면 폐차 흡수만으로 연료가 줄지 않았다(10분 뒤 89)
  // 걸어 다니다 물림: 60% 출혈(붕대로 멈춤) · 25% 감염 시작(분당 +12, 100이면 사망 · 항생제 −50)
  N.onBite = function (g) {
    if (Math.random() < 0.6 && !N.s.bleeding) { N.s.bleeding = true; say('출혈! H로 붕대를 감아라', '#ff5a4a', g); }
    if (!N.s.infected && Math.random() < 0.25) { N.s.infected = true; N.s.infection = Math.max(N.s.infection, 5); say('물렸다… 감염됐다. 항생제를 찾아라', '#c8ff5a', g); }
  };
  function say(t, col, g) { g && g.onNotice && g.onNotice(t, col); }

  // 탑승할 때 연료가 65 이하면 연료통을 자동으로 붓는다
  N.onMount = function (g) {
    let n = 0; while (N.s.fuel <= 65 && N.inv.fuelcan > 0) { N.inv.fuelcan--; N.s.fuel = Math.min(100, N.s.fuel + 35); n++; }
    if (n) { ZK.audio.cylIn && ZK.audio.cylIn(); say(`연료통 ${n}개를 부었다 (연료 ${Math.round(N.s.fuel)})`, '#ffb24a', g); }
  };

  // H: 가장 급한 것부터 하나 사용
  N.useBest = function (g) {
    const s = N.s, inv = N.inv, use = (k, f, text) => { inv[k]--; f(); ZK.audio.cylIn && ZK.audio.cylIn(); N.msg = { text, t: 1.6 }; return k; };
    if (s.bleeding && inv.bandage > 0) return use('bandage', () => { s.bleeding = false; }, '붕대 — 출혈 멈춤');
    if (s.infected && s.infection >= 30 && inv.anti > 0) return use('anti', () => { s.infection = Math.max(0, s.infection - 50); if (s.infection <= 0) s.infected = false; }, '항생제 — 감염 −50');
    const low = [['water', 'thirst', '생수 — 갈증 +40'], ['can', 'hunger', '통조림 — 허기 +40']].filter(([k, st]) => inv[k] > 0 && s[st] < 70).sort((a, b) => s[a[1]] - s[b[1]])[0];
    if (low) return use(low[0], () => { s[low[1]] = Math.min(100, s[low[1]] + 40); }, low[2]);
    if (s.fatigue >= 50 && inv.pill > 0) return use('pill', () => { s.fatigue = Math.max(0, s.fatigue - 30); }, '진통제 — 피로 −30');
    if (g && g.mode === 'drive' && s.fuel < 60 && inv.fuelcan > 0) return use('fuelcan', () => { s.fuel = Math.min(100, s.fuel + 35); }, '연료통 — 연료 +35');
    N.msg = { text: '지금 쓸 게 없다', t: 1.2 }; return null;
  };

  N.nearPoint = function (pos) {
    let best = null, bd = REACH;
    for (const p of N.points) { if (p.done) continue; const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; best = p; } }
    return best;
  };

  N.update = function (dt, g) {
    const s = N.s, F = ZK.fort.state, k = ZK.player.keys, ps = ZK.player.state;
    // 연료: 주행 초당 0.2 · 부스트 0.6 · 공회전 0.03 (100이면 약 8분), 0이면 최고 속도 35%·부스트 불가
    const sp = Math.abs(F.speed), boosting = g.mode === 'drive' && !!F.boostActive;   // 실제 전진 부스트일 때만 (후진·관성 중 Shift 누름은 빼고)
    if (!has('blood')) s.fuel = Math.max(0, s.fuel - dt * (sp < 0.5 ? 0.03 : boosting && !has('nitro') ? 0.6 : 0.2) * (ZK.meta ? ZK.meta.fuelK() : 1));   // 특성 '정비공' −35% · 혈액 엔진은 시간으로 안 줄고 · 직분사는 부스트도 평소 소모
    if (boosting && has('nitro')) ZK.fort.hurt(3 * dt, true);   // 직분사: 버스 체력을 초당 3 태운다
    // 피로 분당 +4 (하차 질주 초당 +1)
    s.hunger = Math.max(0, s.hunger - dt * 0.233); s.thirst = Math.max(0, s.thirst - dt * 0.317);   // 허기 분당 −14 · 갈증 분당 −19 (예전 −12·−16은 한 번도 바닥나지 않았다)
    s.fatigue = Math.min(100, s.fatigue + dt * (4 / 60 + (g.mode === 'foot' && ps.sprint ? 1 : 0)));
    if (s.infected) s.infection = Math.min(100, s.infection + dt * 0.2);
    // 체력(사람): 출혈 초당 −2, 굶주림·탈수는 걸을 때만 초당 −1씩. 이럴 땐 자연 회복도 멈춘다(game3d)
    if (s.bleeding) { g.hp -= 2 * dt * (ZK.meta ? ZK.meta.bleedK() : 1); g.regenT = Math.max(g.regenT, 0.5); }
    if (g.mode === 'foot') { if (s.hunger <= 0) g.hp -= dt; if (s.thirst <= 0) g.hp -= dt; }
    if (s.infection >= 100) { g.hp = 0; g.deathBy = '감염으로 사망'; }
    else if (g.hp <= 0 && s.bleeding) g.deathBy = '출혈로 사망';
    // 경고 (한 번씩)
    for (const [key, v, text] of [['fuel', s.fuel, '연료가 바닥났다 — 연료통을 찾아라'], ['thirst', s.thirst, '목이 마르다 — 생수를 찾아라'], ['hunger', s.hunger, '배가 고프다 — 통조림을 찾아라']]) {
      const flag = 'warn_' + key; if (v < 25 && !s[flag]) { s[flag] = true; say(text, '#ffb24a', g); } if (v > 40) s[flag] = false;
    }
    // 수색: 걸어서 지점 1.8m 안 + G를 1.5초 누르고 있기 (소음 6m)
    const p = g.mode === 'foot' ? N.nearPoint(ps.pos) : null;
    N.prompt = p;
    if (p && k.KeyG) {
      if (!N.search || N.search.p !== p) { N.search = { p, t: 0 }; g.noise && g.noise('search', ps.pos); }
      N.search.t += dt;
      if (N.search.t >= SEARCH_T) {
        p.done = true; p.edge.visible = false; p.ring.visible = false; p.mesh.material.color.setHex(0x2a2c30); N.searched++;
        const got = p.fixed ? p.fixed.slice() : Math.random() < 0.35 ? [] : Array.from({ length: Math.random() < 0.45 ? 2 : 1 }, roll);   // 빈손 35%
        got.forEach(it => N.give(it, it === 'shell' ? 4 : 1));
        const text = got.length ? got.map(it => '+' + ITEMS[it] + (it === 'shell' ? ' 4' : '')).join(' ') : '빈손';
        ZK.fx3.text(p.pos.clone().setY(1.8), text, got.length ? '#ffd23a' : '#9aa0a8', 26, 1.1);
        ZK.audio.absorb && ZK.audio.absorb(); N.search = null; N.lastLoot = { t: g.t, got };
      }
    } else N.search = null;
    if (N.msg && (N.msg.t -= dt) <= 0) N.msg = null;
  };

  // ── HUD: 왼쪽 아래 수치 막대 + 인벤토리 한 줄 · 수색 안내와 진행 원 ──
  N.draw = function (h, W, H, g, label) {
    if (!N.s) return;
    const s = N.s, x = 18, bw = 110, t = ZK.fx3.time;
    const rows = [['연료', s.fuel, '#ffb24a', s.fuel < 25], ['허기', s.hunger, '#e8c86a', s.hunger < 30], ['갈증', s.thirst, '#6ac8ff', s.thirst < 30], ['피로', s.fatigue, '#b89aff', s.fatigue >= 70]];
    if (s.infected) rows.push(['감염', s.infection, '#9aff5a', true]);
    let y = H - 196 - (rows.length + (s.bleeding ? 1 : 0)) * 20;   // 출혈 줄까지 위로 쌓아 인벤토리 줄과 겹치지 않게
    h.font = '700 12px system-ui, sans-serif'; h.textAlign = 'left'; h.textBaseline = 'middle';
    for (const [name, v, col, warn] of rows) {
      const blink = warn && Math.sin(t * 8) > 0;
      h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(x - 2, y - 7, bw + 46, 14);
      h.fillStyle = blink ? '#ff5a4a' : '#c8cfdb'; h.fillText(name, x, y);
      h.fillStyle = 'rgba(255,255,255,0.12)'; h.fillRect(x + 32, y - 4, bw, 8);
      h.fillStyle = blink ? '#ff5a4a' : col; h.fillRect(x + 32, y - 4, bw * clamp(v / 100, 0, 1), 8);
      y += 20;
    }
    if (s.bleeding) { h.globalAlpha = 0.6 + Math.sin(t * 10) * 0.4; label('출혈! H — 붕대', x, y + 2, 15, '#ff4a3a', 'left'); h.globalAlpha = 1; y += 20; }
    const inv = N.inv, short = ['can', 'water', 'bandage', 'fuelcan', 'pill', 'anti'].map(k2 => `${ITEMS[k2]} ${inv[k2]}`).join(' · ');
    const mats = inv.scrap + inv.cloth + inv.bottle + inv.wood;
    h.font = '600 11px system-ui, sans-serif'; h.fillStyle = '#aab2c0'; h.textAlign = 'left';
    h.fillText(`${short} · 재료 ${mats}   [H 사용]`, x, H - 174);
    if (N.msg) { h.globalAlpha = clamp(N.msg.t, 0, 1); label(N.msg.text, x, H - 210 - (rows.length + (s.bleeding ? 1 : 0)) * 20, 15, '#ffe27a', 'left'); h.globalAlpha = 1; }
    // 수색 안내 + 진행 원
    if (N.prompt && g.mode === 'foot') {
      const cx = W / 2, cy = H / 2;
      label(`G 길게 — ${N.prompt.name} 수색`, cx, cy + 70, 18, '#ffd23a');
      if (N.search) { const k = clamp(N.search.t / SEARCH_T, 0, 1);
        h.strokeStyle = 'rgba(0,0,0,0.6)'; h.lineWidth = 7; h.beginPath(); h.arc(cx, cy, 26, 0, 6.283); h.stroke();
        h.strokeStyle = '#ffd23a'; h.lineWidth = 4; h.beginPath(); h.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + k * 6.283); h.stroke(); }
    }
  };
  ZK.needs = N;
})();
