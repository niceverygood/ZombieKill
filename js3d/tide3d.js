// 좀비 해일 — P3 클라이맥스 (2026-11-10)
// 헬기가 내리기 직전, 무리가 벽처럼 밀려와 착륙장을 덮친다. 마지막 1분을 '목적지가 있는 질주 + 버티기'로 만든다
//  9:20 예고: 땅울림이 커지고 "땅이 울린다… 해일이 온다" + 레이더 테두리에 붉은 호(해일 방향)
//  9:28 첫 물결(60%) · 9:38 두 번째 물결(40%): 착륙장에서 45~75m, 플레이어에게서 40m 이상, 되도록 플레이어 뒤쪽. 폭 56m, 3열 (기본 60마리 × 포위 보정 pressK)
//       → 착륙장으로 행진, 9:50 · 9:56쯤 도착하게 속도를 맞춘다(초속 3~5.5m)
//  나를 알아보면(시야 12~17m) 쫓는다: 워커 ×2(초속 약 2.7m) · 출근러 ×1.25 — 해일은 느려지지 않는다
//  해일 좀비는 체력 ×0.55 · 타격 ×0.6: 한 마리보다 '벽'이 무섭다. 촘촘해서 오버킬 연쇄가 잘 터진다
//  해일이 나온 뒤엔 일반 포위가 멈춘다(동시 좀비 수 · 빅 모먼트 관리) — game3d director가 ZK.tide.active를 본다
(function () {
  const T = THREE, { clamp, rand } = ZK;
  const LULL_T = 552, WARN_T = 560, PULSES = [[568, 590, 0.6], [578, 596, 0.4]], BASE_N = 60, WIDTH = 56, RANKS = 3, HP_K = 0.55, DMG_K = 0.6;   // [출현, 착륙장 도착 목표, 몫]
  const C = ZK.tide = { active: false, warned: false, spawned: 0, members: [], dir: null, origin: null, frontDist: 999, centroid: null, impact: false, stats: {} };
  let rumbleT = 0, dustT = 0;
  const _v = new T.Vector3();
  // 해일 좀비의 눈: 안개를 뚫는 붉은 빛 — 밤 안개(시야 약 25m) 너머에서 붉은 눈 수십 쌍이 다가오는 게 보이게
  const EYE = new T.MeshBasicMaterial({ color: 0xff2a14, fog: false });
  // 눈가 붉은 번짐(가산 혼합 스프라이트, 안개 무시): 30m 밖에서도 '붉은 눈의 벽'으로 읽히게. 머리에 붙어 있어 머리가 날아가면 같이 사라진다
  const GLOW = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,90,60,1)'); gr.addColorStop(0.35, 'rgba(255,30,10,0.55)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    return new T.SpriteMaterial({ map: new T.CanvasTexture(c), blending: T.AdditiveBlending, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false }); })();   // 거리와 상관없이 화면에서 같은 크기
  const audioOn = () => !(ZK.debug3 && ZK.debug3.fast);

  // 9:12~9:28 '폭풍 전 고요': 포위·추격자·새 좀비가 거의 멈춘다(game3d director가 본다). 해일이 정점이 되려면 직전이 조용해야 한다
  // (L1: 숙련은 최후의 파도가 이미 분당 빅 모먼트 9.5~16이라 해일이 묻혔다)
  C.lull = g => !!ZK.mis.lz && g.t >= LULL_T && g.t < PULSES[0][0];
  // '물러나는 무리'(L3): 고요가 시작되면 플레이어에게서 18m보다 먼 일반 좀비가 해일이 올 쪽으로 돌아서서 서둘러 걸어간다
  // (L2: 고요 구간이 남은 좀비 86~267마리를 쓸어 담는 구간이 돼 분당 빅 모먼트 11~22였다)
  // 30초 동안 보거나 듣고 돌아오지 않는다(맞으면 돌아온다). 50m 밖으로 멀어지면 사라지고, 해일이 나올 때 25m 밖에 남은 놈도 사라진다 → 무리가 모여 해일이 된다
  const me = g => g.mode === 'foot' ? ZK.player.state.pos : ZK.fort.state.pos;
  function retreat(g, pad) {
    const p = me(g); if (!C.o) C.o = pickOrigin(pad, p);
    const ox = pad.x + C.o.ux * C.o.dist, oz = pad.z + C.o.uz * C.o.dist;
    for (const z of g.zombies) {
      if (!z.alive || z.T.heavy || z.T.chaser || z.state === 'cling' || z.tide || z.T.host) continue;
      if (Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 18) continue;
      z.aware = 'alert'; z.alertPos.set(ox + rand(-10, 10), 0, oz + rand(-10, 10)); z.alertT = 30; z.senseT = 30; z.retreat = true; z.tideK = 2.2;
      C.retreaters.push(z);
    }
    C.stats.retreated = C.retreaters.length;
  }
  function tickRetreat(g) {
    const p = me(g), spawn = g.t >= PULSES[0][0];
    for (let i = C.retreaters.length - 1; i >= 0; i--) {
      const z = C.retreaters[i];
      if (!z.alive || z.aware === 'chase') { z.retreat = false; z.tideK = 0; C.retreaters.splice(i, 1); continue; }   // 맞아서 돌아온 놈은 평소대로
      const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z);
      if (d > 50 || (spawn && d > 25)) { z.dispose(); C.retreaters.splice(i, 1); C.stats.vanished = (C.stats.vanished || 0) + 1; }
      else if (spawn) { z.retreat = false; z.tideK = 0; z.aware = 'chase'; C.retreaters.splice(i, 1); }
    }
  }
  C.reset = function () {
    Object.assign(C, { padLast: null, retreaters: [], lullSaid: false, active: false, warned: false, spawned: 0, members: [], dir: null, origin: null, o: null, pulse: 0, frontDist: 999, centroid: null, impact: false, stats: { spawned: 0, killed: 0, reachedPad: 0, hitT: null, contactT: null, originFromMe: null, firm: null, pincer: false, aliveLull: null, aliveTide: null } });
    rumbleT = dustT = 0;
  };
  C.reset();

  // 해일이 올 방향: 착륙장 둘레 24방향 중, 맵 안(±70)에 45m 이상 여유가 있고 플레이어에게서 40m 이상 떨어진 곳.
  // 그중 '플레이어 뒤쪽'(착륙장 → 플레이어 방향과 같은 쪽)을 고른다 → 착륙장으로 가는 나를 뒤에서 벽이 쫓는다
  // (처음 판은 착륙장 너머에 있던 버스 위로 해일이 맵 끝에 눌려 생겨, 5초 만에 끝났다)
  function pickOrigin(pad, me) {
    const room = (x, z) => Math.min(x > 0 ? ((ZK.world.B - 7) - pad.x) / x : x < 0 ? (-(ZK.world.B - 7) - pad.x) / x : 999, z > 0 ? ((ZK.world.B - 7) - pad.z) / z : z < 0 ? (-(ZK.world.B - 7) - pad.z) / z : 999);
    const mx = me.x - pad.x, mz = me.z - pad.z, md = Math.hypot(mx, mz) || 1;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * 6.283, ux = Math.cos(a), uz = Math.sin(a), dist = Math.min(75, room(ux, uz));
      const ox = pad.x + ux * dist, oz = pad.z + uz * dist, fromMe = Math.hypot(ox - me.x, oz - me.z);
      const ok = dist >= 45 && fromMe >= 40, score = (ok ? 100 : 0) + (ux * mx + uz * mz) / md * 20 + Math.min(fromMe, 60) * 0.3 + dist * 0.1;
      if (!best || score > best.score) best = { ux, uz, dist, score };
    }
    return best;
  }

  // 두 번째 물결: 첫 물결 반대쪽에 여유(40m)가 있고 플레이어에게서 30m 이상이면 반대쪽에서 → 협공. 아니면 같은 쪽
  function oppositeOf(o, pad, me) {
    const ux = -o.ux, uz = -o.uz, room = Math.min(ux > 0 ? ((ZK.world.B - 7) - pad.x) / ux : ux < 0 ? (-(ZK.world.B - 7) - pad.x) / ux : 999, uz > 0 ? ((ZK.world.B - 7) - pad.z) / uz : uz < 0 ? (-(ZK.world.B - 7) - pad.z) / uz : 999), dist = Math.min(75, room);
    return dist >= 40 && Math.hypot(pad.x + ux * dist - me.x, pad.z + uz * dist - me.z) >= 30 ? { ux, uz, dist } : null;
  }
  function spawnWall(g, pad, arriveT, frac, second) {
    const F = ZK.fort.state, me = g.mode === 'foot' ? ZK.player.state.pos : F.pos;
    if (!C.o) C.o = pickOrigin(pad, me);
    let o = C.o; if (second) { const op = oppositeOf(C.o, pad, me); if (op) { o = op; C.stats.pincer = true; } }
    C.dir = { x: -o.ux, z: -o.uz }; C.origin = new T.Vector3(pad.x + o.ux * o.dist, 0, pad.z + o.uz * o.dist);
    // 버스가 튼튼하면(체력 45% 이상, game3d의 firm 기준) 규모 ×1.3 · 체력 ×0.75 — L1: 숙련은 해일에서 체력이 0~8%p만 깎였다
    // 몰려 있으면 포위 보정 pressK(35% 밑 ×0.75) · 체력 ×0.55 그대로
    const firm = !g.pressOff && F.hp / F.maxHp >= ((g.PRESS && g.PRESS.firm) || 0.45); if (C.stats.firm === null) C.stats.firm = firm;
    let n = Math.round(BASE_N * frac * (firm ? 1.3 : g.pressK ? g.pressK() : 1));
    const cap = g.PRESS && g.PRESS.cap; if (cap) n = Math.max(Math.round(n * 0.5), Math.min(n, cap - g.zombies.filter(z => z.alive).length));   // 동시 좀비 상한(성능): 그래도 물결의 절반은 낸다
    const hpK = firm ? 0.75 : HP_K, px = -o.uz, pz = o.ux, perRank = Math.ceil(n / RANKS);
    const v = clamp(o.dist / Math.max(8, arriveT - g.t), 3, 5.5); let made = 0;
    for (let r = 0; r < RANKS; r++) for (let i = 0; i < perRank && made < n; i++) {
      const lat = (i / (perRank - 1) - 0.5) * WIDTH + rand(-1, 1), back = r * 2.6 + rand(-0.6, 0.6);
      const x = clamp(C.origin.x + px * lat + o.ux * back, -ZK.world.B + 3, ZK.world.B - 3), z = clamp(C.origin.z + pz * lat + o.uz * back, -ZK.world.B + 3, ZK.world.B - 3);
      if (!ZK.world.freeSpot(x, z, 0.5)) continue;
      const type = Math.random() < 0.3 ? 'runner' : 'walker', zz = g.spawnZ(type, new T.Vector3(x, 0, z), 'alert');
      zz.maxHp = zz.hp = Math.round(zz.hp * hpK); zz.dmgK = DMG_K; zz.tide = true;
      for (const m of zz.head.children) if (m.isMesh && m.geometry.parameters && m.geometry.parameters.width === 0.14) { m.material = EYE; m.scale.set(1.15, 1.8, 1); }
      const glow = new T.Sprite(GLOW); glow.scale.set(0.028, 0.016, 1); glow.position.set(0, 0.02, 0.16); zz.head.add(glow);
      zz.alertPos.set(pad.x + rand(-4, 4), 0, pad.z + rand(-4, 4)); zz.alertT = 90;
      zz.tideK = v / (zz.speed * 0.85);                        // 행진 속도 맞춤 (경계 상태 이동은 85%)
      zz.tideC = type === 'runner' ? 1.25 : 2;                  // 나를 알아본 뒤에도 느려지지 않게
      C.members.push(zz); C.spawned++; made++;
    }
    C.stats.spawned = C.spawned;
  }

  // 타워(tower3d)와 잇기: 해일이 밀려갈 '땅의 목표'는 ZK.mis.runTo(g) — 평소 착륙장 · 타워면 입구 · 타워 안이면 null → 마지막으로 본 곳(C.padLast)
  const groundPad = g => { const p = ZK.mis.runTo ? ZK.mis.runTo(g) : ZK.mis.lz; if (p) { if (!C.padLast) C.padLast = new T.Vector3(); C.padLast.set(p.x, 0, p.z); } return C.padLast || ZK.mis.lz; };
  const where = () => (ZK.tower ? '타워로' : '착륙장으로');
  C.update = function (dt, g) {
    if (g.state !== 'play') return;
    const pad = groundPad(g); if (!pad) return;
    // 플레이어가 타워 안이면 해일은 행진을 멈추고 나를 쫓는다(경계 → 추격) — 타워 안 길찾기는 targetFor 훅(tower3d)이 맡아 계단으로 따라 올라온다
    if (ZK.tower && ZK.tower.inside) for (const z of C.members) if (z.alive && z.aware !== 'chase') { z.aware = 'chase'; z.senseT = 0; }
    if (!C.lullSaid && C.lull(g)) { C.lullSaid = true; C.stats.aliveLull = g.zombies.filter(z => z.alive).length; retreat(g, pad); g.onNotice && g.onNotice('…놈들이 물러난다? 갑자기 조용해졌다', '#9ab0ff'); }
    if (C.retreaters.length) tickRetreat(g);
    if (!C.warned && g.t >= WARN_T) {
      C.warned = true; g.onNotice && g.onNotice(`땅이 울린다… 무리 해일이 온다 — ${where()}!`, '#ff5a4a');
      if (audioOn()) { ZK.audio.rumble(0, 0.8, 5); ZK.audio.farShriek(-0.4); setTimeout(() => ZK.audio.farShriek(0.5), 700); }
    }
    while (C.pulse < PULSES.length && g.t >= PULSES[C.pulse][0]) {
      const [, arriveT, frac] = PULSES[C.pulse], first = C.pulse === 0; C.pulse++; C.active = true;
      if (first) C.stats.aliveTide = g.zombies.filter(z => z.alive).length;
      spawnWall(g, pad, arriveT, frac, !first);
      if (first) { const F = ZK.fort.state, me = g.mode === 'foot' ? ZK.player.state.pos : F.pos; C.stats.originFromMe = Math.round(Math.hypot(C.origin.x - me.x, C.origin.z - me.z)); g.onNotice && g.onNotice(ZK.tower ? '해일이다! 타워로 — 옥상 헬기까지 버텨라' : '해일이다! 헬기가 올 때까지 착륙장에서 버텨라', '#ff3b3b'); ZK.fx3.trauma(0.25); }
      else g.onNotice && g.onNotice(C.stats.pincer ? '반대쪽에서도 온다! 두 번째 물결' : '두 번째 물결!', '#ff3b3b');
    }
    if (!C.active) return;
    // 살아 있는 해일 좀비: 무게중심 · 나와 가장 가까운 거리 · 착륙장 도착
    const F = ZK.fort.state, me = g.mode === 'foot' ? ZK.player.state.pos : F.pos;
    let n = 0, sx = 0, sz = 0, near = 999;
    for (let i = C.members.length - 1; i >= 0; i--) {
      const z = C.members[i];
      if (!z.alive) { if (!z._tideCounted) { z._tideCounted = true; C.stats.killed++; } C.members.splice(i, 1); continue; }
      n++; sx += z.pos.x; sz += z.pos.z;
      const d = Math.hypot(z.pos.x - me.x, z.pos.z - me.z) - (g.mode === 'foot' ? 0 : F.halfL); if (d < near) near = d;
      if (!z._atPad && Math.hypot(z.pos.x - pad.x, z.pos.z - pad.z) < 12) { z._atPad = true; C.stats.reachedPad++; if (C.stats.hitT === null) C.stats.hitT = +g.t.toFixed(1); }
    }
    C.frontDist = n ? Math.max(0, near) : 999; C.centroid = n ? { x: sx / n, z: sz / n } : null;
    if (!C.impact && C.frontDist < 16) { C.impact = true; C.stats.contactT = +g.t.toFixed(1); if (audioOn()) ZK.audio.stinger(1); ZK.fx3.trauma(0.3); }
    if (!audioOn() || !C.centroid) return;
    // 땅울림: 3.2초마다, 무게중심 쪽에서, 가까울수록 크게 · 벽 앞에 먼지
    const close = clamp(1 - C.frontDist / 70, 0, 1);
    if ((rumbleT -= dt) <= 0) { rumbleT = 3.2; ZK.audio.rumble(ZK.panFor(_v.set(C.centroid.x, 1, C.centroid.z)), 0.45 + close * 0.9, 3.4); }
    if ((dustT -= dt) <= 0 && C.members.length) { dustT = 0.5; for (let k = 0; k < 2; k++) { const z = C.members[(Math.random() * C.members.length) | 0]; ZK.fx3.smoke(z.pos.clone().setY(0.6), _v.set(C.dir.x, 0.4, C.dir.z)); } }
  };

  // 레이더: 해일이 레이더 밖이면 테두리에 붉은 호 + '해일' (해일 쪽 방향)
  C.drawRadar = function (h, cx, cy, R, c, yaw, sc) {
    if (!(C.active || C.warned) || !ZK.mis.lz) return;
    const tgt = C.centroid || C.origin || ZK.mis.lz; if (!tgt) return;
    const dx = tgt.x - c.x, dz = tgt.z - c.z, rx = dx * Math.cos(yaw) - dz * Math.sin(yaw), ry = dx * Math.sin(yaw) + dz * Math.cos(yaw), dist = Math.hypot(dx, dz);
    if (C.active && dist * sc < R * 0.85) return;   // 레이더 안이면 점들이 이미 벽으로 보인다
    const a = Math.atan2(ry, rx), pulse = 0.55 + 0.45 * Math.sin(ZK.fx3.time * 8);
    h.strokeStyle = `rgba(255,50,40,${pulse})`; h.lineWidth = 6; h.beginPath(); h.arc(cx, cy, R + 2, a - 0.5, a + 0.5); h.stroke();
    h.font = '900 11px system-ui, sans-serif'; h.textAlign = 'center'; h.fillStyle = `rgba(255,120,100,${pulse})`;
    h.fillText('해일', cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14) + 4);
  };
  // 화면 위: 해일까지 거리 · 착륙장 안이면 헬기까지 남은 시간
  C.drawHUD = function (h, W, H, g, label) {
    if (!C.active || g.state !== 'play') return;
    const inLZ = ZK.mis.inLZ(g), left = Math.max(0, 600 - g.t), blink = Math.sin(ZK.fx3.time * 9) > 0;
    const txt = C.frontDist > 900 ? (inLZ ? `해일을 막아냈다 — 헬기까지 ${Math.ceil(left)}초` : `해일을 막아냈다 — ${where()}!`)
      : inLZ ? `해일 ${Math.round(C.frontDist)}m — 버텨라! 헬기까지 ${Math.ceil(left)}초` : `해일 ${Math.round(C.frontDist)}m — ${where()}!`;
    h.globalAlpha = C.frontDist < 20 ? (blink ? 1 : 0.6) : 0.95; label(txt, W / 2, 160, 20, C.frontDist < 20 ? '#ff3b2a' : '#ff8a6a'); h.globalAlpha = 1;
  };
})();
