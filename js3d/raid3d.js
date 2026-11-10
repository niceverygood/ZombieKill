// 골목 무기고 습격 — 걸어서만 할 수 있는 한판 (2026-11-10 루프 L5)
// 왜: '쫓기는 긴장'은 걸어 다닐 때 가장 크다(공포 디렉터의 출근러 질주·덮치기·지구력). 그런데 수색 말고는 내릴 이유가 거의 없었다
//  4:42 무전: "경찰 무기고가 열려 있다 — 버스 엔진 소리에 경비가 깬다. 세우고 걸어서" (58초 동안)
//  · 무기고 주변 6~11m에 잠든 경비 6마리(워커 4 · 출근러 2): 거의 움직이지 않고, 보고 알아채지 않는다. 자동 무기는 이들을 쏘지 않는다
//    → 버스가 15m 안에 오거나 · 18m 안에서 플레이어가 낸 소리(총성 등, 자동 무기·주행 소리는 제외) · 맞으면 깬다. 깨면 1.2초 비틀거린다
//  · 걸어서 2.2m 안에서 G를 2.5초 → 털면 보상 + 경보(반경 35m 소음) + 경비 전원 기상 + 30~40m 밖에서 출근러 4마리 + 지구력 가득
//    → 버스까지 뛰어서 돌아가야 한다(지구력·덮치기·아슬아슬)
//  보상: 카드 2장 · 산탄총(없으면) + 산탄 6 · 화염병 2 · 붕대 2
(function () {
  const T = THREE, { clamp, rand } = ZK;
  const OFFER_T = 282, LIFE = 58, LOOT_T = 2.5, REACH = 2.2, WAKE_R = 15;
  const R = ZK.raid = { state: 'idle', pos: null, guards: [], hold: 0, left: 0, stats: {} };
  let scene, pillar, pillarMat, ring, flick = 0;
  const audioOn = () => !(ZK.debug3 && ZK.debug3.fast);

  R.init = function (sc) {
    scene = sc;
    pillarMat = new T.MeshBasicMaterial({ color: 0x3a6aff, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    pillar = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 26, 10, 1, true), pillarMat); pillar.visible = false; scene.add(pillar);
    ring = new T.Mesh(new T.RingGeometry(REACH - 0.15, REACH, 40), new T.MeshBasicMaterial({ color: 0x5a8aff, side: T.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  };
  R.reset = function () {
    Object.assign(R, { state: 'idle', pos: null, guards: [], hold: 0, left: 0, cards: 0, stats: { offered: false, woke: null, looted: false, lootT: null, backT: null, hpLost: 0 } });
    if (pillar) pillar.visible = ring.visible = false;
  };
  R.reset();

  // 자리: 버스에서 35~60m, 빈 곳(반경 3m), 수색 지점에서 6m 이상(G 겹침 방지), 지금 임무 목표에서 25m 이상
  function pickSpot(g) {
    const F = ZK.fort.state, mt = ZK.mis.target && ZK.mis.target(g);
    for (let k = 0; k < 80; k++) {
      const a = rand(0, 6.283), d = rand(35, 60), x = clamp(F.pos.x + Math.cos(a) * d, -68, 68), z = clamp(F.pos.z + Math.sin(a) * d, -68, 68);
      if (!ZK.world.freeSpot(x, z, 3)) continue;
      if (ZK.needs.points.some(q => Math.hypot(q.pos.x - x, q.pos.z - z) < 6)) continue;
      if (mt && Math.hypot(mt.x - x, mt.z - z) < 25) continue;
      return new T.Vector3(x, 0, z);
    }
    return null;
  }
  function wake(g, why) {
    if (R.stats.woke) return; R.stats.woke = why;
    for (const z of R.guards) if (z.alive) { z.sleep = false; z.tideK = 0; z.aware = 'chase'; z.senseT = 0; z.stagger = 1.2; }   // 1.2초 동안 비틀거리며 일어난다 → 뛰기 시작할 틈
    if (why === 'engine') g.onNotice && g.onNotice('엔진 소리에 경비가 깼다!', '#ff6a4a');
    else if (why === 'noise') g.onNotice && g.onNotice('소리에 경비가 깼다!', '#ff6a4a');
  }

  R.update = function (dt, g) {
    if (g.state !== 'play') return;
    const F = ZK.fort.state, ps = ZK.player.state;
    if (R.state === 'idle' && g.t >= OFFER_T && !R.stats.offered) {
      R.stats.offered = true; const p = pickSpot(g); if (!p) return;
      R.pos = p; R.state = 'open'; R.left = LIFE;
      pillar.position.set(p.x, 13, p.z); ring.position.set(p.x, 0.04, p.z); pillar.visible = ring.visible = true;
      for (let i = 0; i < 6; i++) {   // 경비 6마리(워커 4 · 출근러 2), 6~11m — 10마리·4~9m는 대본 플레이에서 털다가 바로 죽었다
        const a = i / 6 * 6.283 + rand(-0.3, 0.3), d = rand(6, 11), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        if (!ZK.world.freeSpot(x, z, 0.4)) continue;
        const zz = g.spawnZ(i < 2 ? 'runner' : 'walker', new T.Vector3(x, 0, z), 'wander');
        zz.sleep = true; zz.guard = true; zz.tideK = 0.04; zz.senseT = 999; zz.wp = { x: x + rand(-0.5, 0.5), z: z + rand(-0.5, 0.5) }; zz.wpT = 999;
        R.guards.push(zz);
      }
      g.onNotice && g.onNotice('무전: 골목 무기고가 열려 있다 — 엔진 소리에 경비가 깬다. 세우고 걸어서!', '#7ab0ff');
      if (audioOn()) ZK.audio.notice();
    }
    if (R.state !== 'open' && R.state !== 'looted') return;
    flick += dt; pillarMat.color.setHex(Math.sin(flick * 9) > 0 ? 0x3a6aff : 0xff3a3a);   // 경광등처럼 파랑·빨강
    if (R.state === 'looted') {
      if (!R.stats.backT && g.mode === 'drive') R.stats.backT = +(g.t - R.stats.lootT).toFixed(1);
      // 카드는 버스에 타면(또는 25초 뒤) 준다: 털자마자 카드 화면이 열려 게임이 멈추면 경보 → 도망의 긴장이 끊겼다
      if (R.cards && (g.mode === 'drive' || g.t - R.stats.lootT > 25)) { ZK.surv.grant(R.cards); R.cards = 0; g.onNotice && g.onNotice(g.mode === 'drive' ? '살았다! 무기고 카드 2장' : '무기고 카드 2장', '#ffd23a'); }
      if (g.t - R.stats.lootT > 25) { R.state = 'done'; pillar.visible = ring.visible = false; } return; }
    R.left -= dt;
    if (R.left <= 0) { R.state = 'done'; pillar.visible = ring.visible = false; g.onNotice && g.onNotice('무기고 신호가 끊겼다', '#9aa0a8'); return; }
    // 잠든 경비: 버스가 15m 안 → 엔진 소리에 깸 · 소음으로 '경계'가 되거나 맞으면(추적) 깸
    if (!R.stats.woke) {
      if (!(ZK.bail && ZK.bail.wrecked) && Math.hypot(F.pos.x - R.pos.x, F.pos.z - R.pos.z) - F.halfL < WAKE_R) wake(g, 'engine');   // 터진 버스는 엔진 소리가 없다
      else if (R.guards.some(z => z.alive && z.aware !== 'wander')) wake(g, 'noise');
    }
    // 털기: 걸어서 2.2m 안, F 한 번에 바로 (2026-11-10 사용자 요청: 줍기·상호작용은 F로 기다림 없이 — 예전엔 G 3초)
    const near = g.mode === 'foot' && Math.hypot(ps.pos.x - R.pos.x, ps.pos.z - R.pos.z) < REACH;
    R.prompt = near;
    if (near && ZK.player.keys.KeyF) {
      R.hold = LOOT_T;
      {
        R.state = 'looted'; R.stats.looted = true; R.stats.lootT = +g.t.toFixed(1); R.hpAtLoot = g.hp;
        R.cards = 2; if (!ZK.gun3.hasShotgun) ZK.gun3.giveShotgun(); ZK.needs.give('shell', 6); ZK.needs.give('molotov', 2); ZK.needs.give('bandage', 2);
        g.noise('siren', R.pos); wake(g, 'alarm');
        ZK.dread.stam = 100; ZK.dread.exhausted = false;   // 아드레날린: 털면 지구력이 다시 찬다
        for (let i = 0; i < 4; i++) { const a = rand(0, 6.283), d = rand(30, 40), x = clamp(R.pos.x + Math.cos(a) * d, -ZK.world.B + 5, ZK.world.B - 5), z = clamp(R.pos.z + Math.sin(a) * d, -ZK.world.B + 5, ZK.world.B - 5); if (ZK.world.freeSpot(x, z, 0.5)) g.spawnZ('runner', new T.Vector3(x, 0, z), 'chase'); }
        g.onNotice && g.onNotice('털었다! 경보가 울린다 — 버스까지 뛰어라! (카드는 버스에서)', '#ffd23a');
        ZK.fx3.text(R.pos.clone().setY(2.6), '카드 2 · 산탄 · 화염병 2 · 붕대 2', '#ffd23a', 24, 1.6);
        if (audioOn()) { ZK.audio.levelUp(); ZK.audio.stinger(0.8); }
        ZK.fx3.trauma(0.2);
      }
    } else R.hold = Math.max(0, R.hold - dt * 2);
  };

  // 레이더: 파랑·빨강으로 깜빡이는 네모 (가장자리 밖이면 테두리에)
  R.drawRadar = function (h, cx, cy, Rr, c, yaw, sc) {
    if (R.state !== 'open' || !R.pos) return;
    const dx = R.pos.x - c.x, dz = R.pos.z - c.z; let x = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * sc, y = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * sc;
    const l = Math.hypot(x, y); if (l > Rr - 6) { x *= (Rr - 6) / l; y *= (Rr - 6) / l; }
    h.fillStyle = Math.sin(flick * 9) > 0 ? '#3a6aff' : '#ff3a3a'; h.fillRect(cx + x - 4, cy + y - 4, 8, 8);
  };
  // 화면: 위쪽 한 줄(거리·남은 시간) + 가까이 오면 G 진행 원
  R.drawHUD = function (h, W, H, g, label) {
    if (R.state !== 'open' || g.state !== 'play' || !R.pos) return;
    const F = ZK.fort.state, ps = ZK.player.state, me = g.mode === 'foot' ? ps.pos : F.pos, d = Math.round(Math.hypot(me.x - R.pos.x, me.z - R.pos.z));
    const txt = g.mode === 'drive' ? (R.stats.woke ? `무기고 ${d}m — 경비가 깼다! · ${Math.ceil(R.left)}초` : `골목 무기고 ${d}m — 15m 밖에 세우고 내려서(G) · ${Math.ceil(R.left)}초`)
      : `무기고 ${d}m — 파란 고리에서 F · ${Math.ceil(R.left)}초`;
    label(txt, W / 2, 160, 18, R.stats.woke ? '#ff8a6a' : '#7ab0ff');
    if (R.prompt) {
      const cx = W / 2, cy = H / 2 + 70, k = clamp(R.hold / LOOT_T, 0, 1);
      label('F — 무기고 털기', cx, cy, 18, '#7ab0ff');
      h.strokeStyle = 'rgba(0,0,0,0.6)'; h.lineWidth = 6; h.beginPath(); h.arc(cx, cy + 34, 16, 0, 6.283); h.stroke();
      h.strokeStyle = '#7ab0ff'; h.lineWidth = 4; h.beginPath(); h.arc(cx, cy + 34, 16, -Math.PI / 2, -Math.PI / 2 + k * 6.283); h.stroke();
    }
  };
})();
