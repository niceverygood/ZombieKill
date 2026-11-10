// 무기 보급함 (2026-11-10) — 버스에서 내려 걸어가야만 얻는 무기: 조준경 · 자동소총 · 소총탄 · 수류탄
// 왜: "내렸을 때의 긴장감과 무기의 필요성을 저울질해 볼 수 있게"(사용자). 수색은 식량·연료 위주라 내릴 이유가 '버티기'뿐이었다
//  · 판마다 7곳: 조준경 1 · 자동소총 1(+30발) · 소총탄 2(각 30) · 수류탄 3(각 2개). 시작점에서 28~70m, 조준경·소총은 45m 밖
//  · 상자 위에 무엇이 들었는지 아이콘이 떠 있다(45m 안에서 보임) + 레이더 주황 마름모 → "저기 소총이 있다, 경비 4마리, 갈까?"
//  · 경비: 상자 3~7m에 잠든 좀비 2~4마리(조준경·소총은 4마리, 출근러 1 포함). 제자리에 붙어 있고 자동 무기는 쏘지 않는다(z.sleep, raid3d와 같은 규칙)
//    깨는 조건: 버스가 15m 안(엔진 소리) · 18m 안의 플레이어 소리 · 맞음 · 상자를 열 때. 하나가 깨면 그 상자 경비가 모두 깬다 → 이때부터 평범한 추격자(디렉터가 센다)
//  · 걸어서 1.8m 안에서 G를 3초(소총탄·수류탄 2초). 쇠 상자를 비트는 소리(반경 16m)가 경비를 깨운다
//  · 버스로는 못 줍는다(상자는 충돌하지 않는 낮은 상자, 들이받아도 그대로) → 반드시 내려야 한다
// 수류탄(B): 포물선으로 던져 땅·벽에 튀고 2.4초 뒤 반경 7m 폭발(가까울수록 세게 최대 300). 가까이 있으면 나도 다친다. 소음 50m
(function () {
  const T = THREE, { clamp, rand } = ZK;
  const A = ZK.arms = { caches: [], nades: [], stats: {} };
  const KINDS = {
    scope: { name: '조준경', items: ['scope'], qty: {}, hold: 3, far: true, guards: 4, col: '#7ad8ff' },
    rifle: { name: '자동소총', items: ['rifle', 'rifleAmmo'], qty: { rifleAmmo: 30 }, hold: 3, far: true, guards: 4, col: '#ffb24a' },
    ammo: { name: '소총탄 30', items: ['rifleAmmo'], qty: { rifleAmmo: 30 }, hold: 2, guards: 2, col: '#e8d27a' },
    nade: { name: '수류탄 ×2', items: ['grenade'], qty: { grenade: 2 }, hold: 2, guards: 3, col: '#9ad86a' },
  };
  const LAYOUT = ['scope', 'rifle', 'ammo', 'ammo', 'nade', 'nade', 'nade'];
  const FUSE = 2.4, NADE_R = 7, NADE_DMG = 300, WAKE_R = 15;
  let scene, crateGeo, lidGeo, bandGeo, nadeGeo;
  const icons = {};

  // 상자 위 아이콘: 캔버스에 그림 + 이름 (스프라이트, 멀어도 읽히게 크기 고정에 가깝게)
  function iconTex(kind) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const h = c.getContext('2d'), K = KINDS[kind];
    h.fillStyle = 'rgba(10,12,16,0.78)'; h.beginPath(); if (h.roundRect) h.roundRect(4, 4, 248, 120, 18); else h.rect(4, 4, 248, 120); h.fill();
    h.strokeStyle = K.col; h.lineWidth = 5; h.stroke();
    h.save(); h.translate(64, 64); h.strokeStyle = K.col; h.fillStyle = K.col; h.lineWidth = 6;
    if (kind === 'scope') { h.beginPath(); h.arc(0, 0, 30, 0, 6.283); h.stroke(); h.beginPath(); h.moveTo(-40, 0); h.lineTo(-12, 0); h.moveTo(12, 0); h.lineTo(40, 0); h.moveTo(0, -40); h.lineTo(0, -12); h.moveTo(0, 12); h.lineTo(0, 40); h.stroke(); h.beginPath(); h.arc(0, 0, 4, 0, 6.283); h.fill(); }
    else if (kind === 'rifle') { h.fillRect(-44, -8, 70, 12); h.fillRect(20, -5, 26, 6); h.fillRect(-44, -8, 14, 22); h.fillRect(-14, 4, 10, 22); h.fillRect(2, 4, 8, 14); }
    else if (kind === 'ammo') { for (let i = -2; i <= 2; i++) { h.fillRect(i * 14 - 4, -14, 9, 32); h.beginPath(); h.moveTo(i * 14 - 4, -14); h.lineTo(i * 14 + 0.5, -26); h.lineTo(i * 14 + 5, -14); h.fill(); } }
    else { h.beginPath(); h.ellipse(0, 6, 20, 26, 0, 0, 6.283); h.fill(); h.fillRect(-6, -30, 14, 10); h.lineWidth = 4; h.beginPath(); h.arc(14, -26, 10, 3.6, 6.0); h.stroke(); }
    h.restore();
    h.fillStyle = '#f2f2ea'; h.font = '800 34px system-ui, sans-serif'; h.textBaseline = 'middle'; h.fillText(K.name, 116, 64);
    const t = new T.CanvasTexture(c); return t;
  }

  A.init = function (sc) {
    scene = sc;
    crateGeo = new T.BoxGeometry(1.1, 0.55, 0.72); lidGeo = new T.BoxGeometry(1.16, 0.08, 0.78); bandGeo = new T.BoxGeometry(1.12, 0.1, 0.74);
    nadeGeo = new T.SphereGeometry(0.09, 10, 8);
    for (const k in KINDS) icons[k] = new T.SpriteMaterial({ map: iconTex(k), transparent: true, depthWrite: false, depthTest: false, fog: false });   // 안개에 묻히지 않게(밤에도 읽힘)
  };

  function clearCaches() {
    for (const c of A.caches) { scene.remove(c.grp); scene.remove(c.icon); scene.remove(c.pt.ring); const i = ZK.needs.points.indexOf(c.pt); if (i >= 0) ZK.needs.points.splice(i, 1); }
    A.caches = [];
    for (const n of A.nades) scene.remove(n.mesh); A.nades = [];
  }
  // 자리: 시작점(0,6)에서 28~70m · 빈 곳(반경 2m) · 다른 보급함 14m · 수색 지점 6m · 드럼통·트럭 8m 밖. 조준경·소총은 45m 밖
  function pickSpot(far) {
    for (let i = 0; i < 160; i++) {
      const city = ZK.world.MAP === 'city', a = rand(0, 6.283), r = city ? rand(far ? 90 : 40, far ? 200 : 160) : rand(far ? 45 : 28, 70) /* 1탄 도시: 넓게 흩어 둔다 */,
        x = clamp(Math.cos(a) * r, -ZK.world.B + 5, ZK.world.B - 5), z = clamp(6 + Math.sin(a) * r, -ZK.world.B + 5, ZK.world.B - 5);
      if (Math.hypot(x, z - 6) < (far ? (city ? 90 : 45) : 28) || !ZK.world.freeSpot(x, z, 2)) continue;
      if (ZK.mart && ZK.mart.BOX && x > ZK.mart.BOX.x0 - 6 && x < ZK.mart.BOX.x1 + 6 && z > ZK.mart.BOX.z0 - 6 && z < ZK.mart.BOX.z1 + 6) continue;   // 마트 건물 안팎은 피함
      if (A.caches.some(c => Math.hypot(c.pos.x - x, c.pos.z - z) < 14)) continue;
      if (ZK.needs.points.some(q => Math.hypot(q.pos.x - x, q.pos.z - z) < 6)) continue;
      if ((ZK.mis.barrels || []).some(b => b.pos.distanceTo(new T.Vector3(x, 0, z)) < 8) || (ZK.mis.trucks || []).some(t => Math.hypot(t.pos.x - x, t.pos.z - z) < 8)) continue;
      return new T.Vector3(x, 0, z);
    }
    return null;
  }
  function addCache(kind, pos, g) {
    const K = KINDS[kind], grp = new T.Group(); grp.position.copy(pos); grp.rotation.y = rand(0, 6.283); scene.add(grp);
    const mat = new T.MeshLambertMaterial({ color: 0x4a5a3a }), m = new T.Mesh(crateGeo, mat); m.position.y = 0.28; grp.add(m);
    const lid = new T.Mesh(lidGeo, new T.MeshLambertMaterial({ color: 0x3a4630 })); lid.position.y = 0.6; grp.add(lid);
    const band = new T.Mesh(bandGeo, new T.MeshLambertMaterial({ color: 0xd8b42a, emissive: 0x3a2a00 })); band.position.y = 0.3; grp.add(band);   // 노란 띠 = 무기 상자
    const edge = new T.LineSegments(new T.EdgesGeometry(crateGeo), new T.LineBasicMaterial({ color: new T.Color(K.col) })); edge.position.y = 0.28; grp.add(edge);
    const icon = new T.Sprite(icons[kind]); icon.position.set(pos.x, 2.3, pos.z); icon.scale.set(2.4, 1.2, 1); icon.renderOrder = 5; scene.add(icon);
    // 수색 지점으로 등록 → survival3d의 G 길게 · 진행 원 · 레이더 노란 네모를 그대로 쓴다 (fixed = 내용물, qty = 개수)
    const ringMat = new T.MeshBasicMaterial({ color: new T.Color(K.col), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const ring = new T.Mesh(new T.RingGeometry(0.9, 1.15, 28), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.02, pos.z); scene.add(ring);
    const pt = { name: '무기 보급함 · ' + K.name, pos: pos.clone(), mesh: m, edge, ring, done: false, fixed: K.items.slice(), qty: K.qty, holdT: K.hold, noise: 'cache', cache: kind };
    ZK.needs.points.push(pt);
    // 경비: 상자 3~7m, 배회(소리를 들으면 깨어 쫓는다). 조준경·소총은 4마리(출근러 1)
    const guards = [];
    for (let i = 0; i < K.guards; i++) {
      const a = rand(0, 6.283), r = rand(3, 7), zp = new T.Vector3(clamp(pos.x + Math.cos(a) * r, -ZK.world.B + 2, ZK.world.B - 2), 0, clamp(pos.z + Math.sin(a) * r, -ZK.world.B + 2, ZK.world.B - 2));
      const z = g.spawnZ(K.far && i === 0 ? 'runner' : 'walker', zp, 'wander'); z.guard = true; z.cacheGuard = true;
      z.sleep = true; z.tideK = 0.04; z.senseT = 999; z.wp = { x: zp.x + rand(-0.5, 0.5), z: zp.z + rand(-0.5, 0.5) }; z.wpT = 999;   // 제자리에서 잠듦 (예전엔 떠돌다 30~40m씩 흩어졌다)
      guards.push(z);
    }
    const c = { kind, pos: pos.clone(), grp, icon, pt, guards, opened: false, woke: null };
    A.caches.push(c); return c;
  }

  A.reset = function (g) {
    clearCaches();
    A.stats = { opened: [], openT: [], nades: 0, nadeKills: 0, rifleKills: 0, rifleShots: 0, hpLostFoot: 0, scopeT: null, rifleT: null };
    if (A.off) return;   // 봇 A/B: 보급함 없이
    for (const kind of LAYOUT) { const p = pickSpot(KINDS[kind].far); if (p) addCache(kind, p, g); }
  };

  // 경비 깨우기: 그 상자 경비 전원 → 추격 · 1초 비틀 · 경비 표시를 떼어 디렉터가 다시 센다
  function wake(c, why) {
    if (c.woke) return; c.woke = why;
    for (const z of c.guards) if (z.alive && !z.remove) { z.sleep = false; z.tideK = 0; z.aware = 'chase'; z.senseT = 0; z.stagger = 1.0; z.guard = false; }
  }
  const liveGuards = c => c.guards.filter(z => z.alive && !z.remove && Math.hypot(z.pos.x - c.pos.x, z.pos.z - c.pos.z) < 12);
  // survival3d가 조준경·자동소총을 꺼냈을 때
  A.onLoot = function (it, g) {
    const G3 = ZK.gun3;
    if (it === 'scope') { G3.setScope(true); A.stats.scopeT = Math.round(g.t); g.onNotice('조준경 장착 — 우클릭 정조준이 2.5배 확대', '#7ad8ff'); }
    if (it === 'rifle') { G3.giveRifle(); A.stats.rifleT = Math.round(g.t); g.onNotice('자동소총! 3번 키 · 누르고 있으면 연사 · 총소리가 크다', '#ffb24a'); }
    ZK.audio.cylIn && ZK.audio.cylIn(); ZK.fx3.trauma(0.12);
  };
  // 보급함을 열었을 때: 아이콘 끄기 · 경비 전원 기상(쫓기 시작) · 기록
  A.onOpen = function (p, g) {
    const c = A.caches.find(q => q.pt === p); if (!c) return;
    c.opened = true; c.icon.visible = false; A.stats.opened.push(c.kind); A.stats.openT.push(Math.round(g.t));
    wake(c, 'open'); g.noise('cache', p.pos);
  };

  // ── 수류탄 ──
  A.throwGrenade = function (g, cam) {
    const inv = ZK.needs.inv; if (!(inv.grenade > 0)) { ZK.needs.msg = { text: '수류탄이 없다 — 무기 보급함(초록 아이콘)을 뒤져라', t: 1.6 }; return false; }
    if (A.cool > 0) return false;
    inv.grenade--; A.cool = 0.6; A.stats.nades++;
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    const mesh = new T.Group(); const body = new T.Mesh(nadeGeo, new T.MeshLambertMaterial({ color: 0x3e4a2c })); body.scale.set(1, 1.25, 1); mesh.add(body);
    const lever = new T.Mesh(new T.BoxGeometry(0.03, 0.12, 0.05), new T.MeshLambertMaterial({ color: 0x8a8f96 })); lever.position.set(0.07, 0.06, 0); mesh.add(lever);
    mesh.position.copy(cam.position).addScaledVector(dir, 0.6).add(new T.Vector3(0, -0.15, 0)); scene.add(mesh);
    // 조준점으로 던진다: 십자선이 4~28m 안의 땅을 가리키면 그 자리에 떨어지는 포물선(비행 0.55 + 거리/40초) · 하늘을 보면 멀리 던지기
    let v = dir.clone().multiplyScalar(16).add(new T.Vector3(0, 4, 0));
    if (dir.y < -0.02) { const tg = -cam.position.y / dir.y, P = cam.position.clone().addScaledVector(dir, tg), p0 = mesh.position, dd = Math.hypot(P.x - p0.x, P.z - p0.z);
      if (dd > 28) { const k = 28 / dd; P.x = p0.x + (P.x - p0.x) * k; P.z = p0.z + (P.z - p0.z) * k; }   // 28m보다 멀면 28m에 (예전엔 14m로 짧게 떨어졌다)
      const d2 = Math.hypot(P.x - p0.x, P.z - p0.z);
      if (d2 >= 4) { const tau = 0.55 + d2 / 40; v = new T.Vector3((P.x - p0.x) / tau, (0.1 - p0.y + 0.5 * 16 * tau * tau) / tau, (P.z - p0.z) / tau); } }
    A.nades.push({ mesh, v, t: 0, beep: 0 });
    ZK.audio.cylOut && ZK.audio.cylOut(); return true;
  };
  function explode(n, g) {
    const p = n.mesh.position.clone().setY(0); scene.remove(n.mesh);
    g.boom(p, 1.3); g.noise('grenade', p);
    const kills = g.blast(p, NADE_R, NADE_DMG, 'player'); A.stats.nadeKills += kills;
    if (kills >= 3) ZK.fx3.text(p.clone().setY(3.4), `수류탄 ×${kills}`, '#9ad86a', 30 + kills * 2, 0.9);
    for (const b of ZK.mis.barrels || []) if (b.alive && b.pos.distanceTo(p) < NADE_R * 0.6) ZK.mis.pend.push({ b, t: 0.12, src: 'player' });   // 근처 드럼통·LPG 유폭
    const F = ZK.fort.state; if (F.pos.distanceTo(p) < NADE_R + F.halfL * 0.5) ZK.fort.hurt(18);
    if (g.mode === 'foot') { const ps = ZK.player.state, d = Math.hypot(ps.pos.x - p.x, ps.pos.z - p.z); if (d < NADE_R) { const dmg = 55 * (1 - d / NADE_R); g.hp -= dmg; g.regenT = 4; g.hurtA = 1; A.stats.hpLostFoot += dmg; if (g.hp <= 0) g.deathBy = '내 수류탄에 휘말렸다'; } }
  }

  A.update = function (dt, g) {
    A.cool = (A.cool || 0) - dt;
    const F = ZK.fort.state, busOk = !(ZK.bail && ZK.bail.wrecked);
    for (const c of A.caches) {
      if (c.woke) continue;
      if (busOk && Math.hypot(F.pos.x - c.pos.x, F.pos.z - c.pos.z) - F.halfL < WAKE_R) wake(c, 'engine');   // 버스를 가까이 대면 엔진 소리에 깬다
      else if (c.guards.some(z => z.alive && !z.remove && (z.aware !== 'wander' || z.hp < z.maxHp))) wake(c, 'noise');   // 소리를 들었거나 맞았다
    }
    // 아이콘: 45m 안에서만 · 위아래로 살짝 떠다님
    const me = g.mode === 'drive' ? ZK.fort.state.pos : ZK.player.state.pos;
    for (const c of A.caches) { if (c.opened) continue; const d = Math.hypot(c.pos.x - me.x, c.pos.z - me.z); c.icon.visible = d < 45; c.icon.position.y = 2.3 + Math.sin(ZK.fx3.time * 2 + c.pos.x) * 0.12; const k = clamp(d / 12, 1, 3); c.icon.scale.set(2.4 * k * 0.6, 1.2 * k * 0.6, 1); }
    for (let i = A.nades.length - 1; i >= 0; i--) {
      const n = A.nades[i], p = n.mesh.position; n.t += dt;
      n.v.y -= 16 * dt; const sx = p.x, sz = p.z; p.addScaledVector(n.v, dt); n.mesh.rotation.x += dt * 10 * Math.hypot(n.v.x, n.v.z) * 0.2;
      if (p.y < 0.1) { p.y = 0.1; if (n.v.y < 0) n.v.y = -n.v.y * 0.25; n.v.x *= 0.3; n.v.z *= 0.3;   /* 크게 죽이는 튐: 조준점에서 1~2m 안에 멈춘다 (예전 0.62는 4~8m 굴러가 무리를 빗나감) */ if (Math.abs(n.v.y) > 1) ZK.audio.casing && ZK.audio.casing(); }   // 땅에 튐
      if (p.y < 2.5) { const q = p.clone(); ZK.world.collide(q, 0.12); if (Math.abs(q.x - p.x) > 1e-4) { n.v.x = -n.v.x * 0.4; p.x = sx; } if (Math.abs(q.z - p.z) > 1e-4) { n.v.z = -n.v.z * 0.4; p.z = sz; } }   // 벽에 튐
      if ((n.beep -= dt) <= 0 && n.t > FUSE - 1) { n.beep = 0.25; ZK.fx3.sparks(p.clone(), new T.Vector3(0, 1, 0), 2); }
      if (n.t >= FUSE) { A.nades.splice(i, 1); explode(n, g); }
    }
  };

  // 레이더: 열지 않은 보급함은 내용물 색 마름모 (멀면 테두리에 붙음)
  A.drawRadar = function (h, cx, cy, Rr, c, yaw, sc) {
    for (const q of A.caches) {
      if (q.opened) continue;
      const dx = q.pos.x - c.x, dz = q.pos.z - c.z; let x = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * sc, y = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * sc;
      const l = Math.hypot(x, y); if (l > Rr - 6) { x *= (Rr - 6) / l; y *= (Rr - 6) / l; }
      h.fillStyle = KINDS[q.kind].col; h.beginPath(); h.moveTo(cx + x, cy + y - 5); h.lineTo(cx + x + 5, cy + y); h.lineTo(cx + x, cy + y + 5); h.lineTo(cx + x - 5, cy + y); h.closePath(); h.fill();
    }
  };
  // 화면: 조준경 들여다보기(정조준 중 검은 원 + 십자선) · 가장 가까운 보급함 한 줄 안내(걸을 때)
  A.scopeView = () => ZK.debug3 && ZK.debug3.g.state === 'play' && !ZK.surv.choosing && ZK.gun3.hasScope && ZK.player.state.mode === 'fpp' && (ZK.player.state.aimK || 0) > 0.85 && (ZK.gun3.weapon === 'revolver' || ZK.gun3.weapon === 'rifle');
  // 조준경 화면은 HUD 글자보다 먼저(아래에) 그린다 → 체력·탄약·알림이 검은 테두리에 가리지 않게 (game3d가 drawHUD 앞쪽에서 부름)
  A.drawScope = function (h, W, H) {
    if (A.scopeView()) {
      const r = Math.min(W, H) * 0.44, cx = W / 2, cy = H / 2;
      h.save(); h.fillStyle = 'rgba(0,0,0,0.92)'; h.beginPath(); h.rect(0, 0, W, H); h.arc(cx, cy, r, 0, 6.283, true); h.fill('evenodd');
      const gr = h.createRadialGradient(cx, cy, r * 0.75, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)'); h.fillStyle = gr; h.beginPath(); h.arc(cx, cy, r, 0, 6.283); h.fill();
      h.strokeStyle = 'rgba(10,10,10,0.9)'; h.lineWidth = 2; h.beginPath(); h.moveTo(cx - r, cy); h.lineTo(cx - 14, cy); h.moveTo(cx + 14, cy); h.lineTo(cx + r, cy); h.moveTo(cx, cy - r); h.lineTo(cx, cy - 14); h.moveTo(cx, cy + 14); h.lineTo(cx, cy + r); h.stroke();
      h.fillStyle = 'rgba(255,60,40,0.9)'; h.beginPath(); h.arc(cx, cy, 2.2, 0, 6.283); h.fill();
      h.restore();
    }
  };
  A.drawHUD = function (h, W, H, g, label) {
    if (g.state !== 'play' || g.mode !== 'foot') return;
    const ps = ZK.player.state; let best = null, bd = 30;
    for (const q of A.caches) { if (q.opened) continue; const d = Math.hypot(q.pos.x - ps.pos.x, q.pos.z - ps.pos.z); if (d < bd) { bd = d; best = q; } }
    if (best && bd > 2.2) { const gl = liveGuards(best), left = gl.length;
      label(`무기 보급함 ${KINDS[best.kind].name} ${Math.round(bd)}m · 경비 ${left}${best.woke ? ' (깼다!)' : left ? ' (잠듦 — 총소리 18m · 버스 15m에 깸)' : ''} · 상자 앞에서 G ${KINDS[best.kind].hold}초`, W / 2, H - 132, 15, best.woke ? '#ff8a6a' : KINDS[best.kind].col); }
  };
  A.KINDS = KINDS; A.liveGuards = liveGuards;
})();
