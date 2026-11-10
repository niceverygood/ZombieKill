// 공포 디렉터 — "좀비에게 쫓긴다"는 긴장을 만든다 (2026-11-09)
// ① 위협도 0~1: 나를 쫓는 좀비가 얼마나 가깝고 많은지. 안 보이는 뒤쪽은 1.4배 무겁게, 매달린 놈, 빈사, 포위·추격자 예고
//    오를 땐 빠르게(시정수 0.4초), 내릴 땐 느리게(2.2초) → 벗어난 뒤에도 잠깐 심장이 뛴다
//    버스를 밟으면(초속 3 → 9m) 땅 좀비 위협이 최대 55% 줄어든다 → 느려지면 조여 오고, 밟으면 풀린다
//    버스 체력 55% 이상이면 위협 상한 0.65, 30%까지 풀린다(매달림·추격자·도살자가 붙으면 해제) → 최상단 경보는 진짜 위기에만
// ② 소리: 심장박동(BPM 58 → 153) · 긴장 음악 3겹(드론 → 맥박 북 → 현 트레몰로) · 조용하다 들킨 순간의 스팅어
//    · 알아챈 좀비의 비명 · 걸을 때 쫓아오는 발소리 · 가까운 놈 으르렁 · 내 숨소리 · 빈사 먹먹함 · 무리 땅울림 · 먼 비명
// ③ 화면: 박동에 맞춰 조여 오는 검은 비네트 · 화면 가장자리의 위협 방향 호(위 = 앞, 아래 = 뒤, 안 보이는 쪽이 진하다)
//    · 알아챈 좀비 머리 위 '!' · 뒤 경고 · 위협이 크면 시야가 최대 6° 좁아진다 · 아슬아슬 피한 순간 붉은 테두리
// ④ 추격 규칙(D.mech, 봇 A/B용 스위치): 출근러는 20m 안에서 3.5초씩 질주(×1.5, 초속 약 5.9m) 뒤 2.5초 숨 고르기(×0.9)
//    · 걸을 때 2.6m 안의 워커·출근러가 0.25초 멈칫(예고) 뒤 몸을 날려 덮친다(최대 0.4초 ×2.6, 한 번에 한 마리 · 전역 1.4초 간격) — 달아나서 끝까지 안 닿으면 '아슬아슬' 슬로모
//    (걸어 다닐 때만 — 버스 밸런스는 건드리지 않는다) · 걸을 때 워커가 5m 안이면 서두른다(×1.3) · 걸을 때 질주는 지구력(5.5초)이 있다
(function () {
  const T = THREE, { clamp, rand, lerp } = ZK;
  const BINS = 24, bins = new Float32Array(BINS), binS = new Float32Array(BINS);
  const D = ZK.dread = { k: 0, raw: 0, tunnel: 0, pulse: 0, stam: 100, exhausted: false, mech: true, boost: 0, rearT: 0, rearN: 0, backT: 0, nearFlash: 0, marks: [], stats: {} };
  // 검수용 통계: 발견·덮치기·아슬아슬·지칠 때까지 뜀 횟수, 위협 0.7+ / 0.4+로 보낸 초, 최고 위협도
  const newStats = () => ({ spot: 0, lunge: 0, near: 0, exhaust: 0, high: 0, mid: 0, peak: 0, minFort: 1, minFortT: 0, minFoot: 1 });
  let stepNoiseT = 0, lungeGap = 0, beatT = 1, beatN = 0, spotCd = 0, stingCd = 0, snarlCd = 0, shriekCd = 0, nearCd = 0, breathT = 0, inhale = true, restT = 0, ambT = 8, hordeSeen = 0, lastHordeT = -1, markCd = 0;
  const _v = new T.Vector3();
  const audioOn = () => !(ZK.debug3 && ZK.debug3.fast);   // 봇 빠른 시뮬레이션에서는 소리를 내지 않는다

  D.reset = function () {
    Object.assign(D, { k: 0, raw: 0, tunnel: 0, pulse: 0, stam: 100, exhausted: false, boost: 0, rearT: 0, rearN: 0, backT: 0, nearFlash: 0, marks: [], stats: newStats() });
    lungeGap = 0; beatT = 1; beatN = 0; spotCd = stingCd = snarlCd = shriekCd = nearCd = 0; breathT = 0; restT = 0; ambT = 8; hordeSeen = 0; lastHordeT = -1; binS.fill(0);
  };
  D.canSprint = () => !D.mech || !D.exhausted;
  // 몰래 걷기(L7): 배회·경계 좀비가 걸어 다니는 나를 알아채는 거리(낮 12m · 밤 17m)에 곱한다 — zombie3d 시야 판정이 부른다
  // 엎드림 ×0.35 · 앉음 ×0.55 · 멈춰 섬 ×0.8 · 질주 ×1.25 (L6: 서도 앉아도 똑같이 들켜서 무기고·수색에서 '몰래'가 선택이 못 됐다)
  D.stealthK = function () {
    if (!D.mech) return 1; const ps = ZK.player.state;
    const tm = ZK.torch ? ZK.torch.stealthMul() : 1;   // 손전등(L8)을 켜면 ×1.3
    if (ps.stance === 'prone') return 0.35 * tm; if (ps.stance === 'crouch') return 0.55 * tm;
    if (ps.sprint) return 1.25 * tm; return (Math.hypot(ps.vel.x, ps.vel.z) < 0.5 ? 0.8 : 1) * tm;
  };

  // 배회·경계 → 추적으로 바뀐 순간 (맞아서 바뀐 건 빼고): 비명 + '!' + 처음 들킨 거면 스팅어
  // 걷거나 버스가 느릴 때(초속 4m 미만), 그리고 아직 쫓기지 않을 때(위협 0.5 미만)만 — 몰래 다니다 들킨 순간이 무서운 거다
  // 빠르게 달리며 스치는 놈마다(판당 약 400번), 이미 쫓기는 중에 또 들킨 놈마다(10차 보충: 판당 최대 289번) 비명·'!'를 내면 소음이 된다
  function onSpot(z, cam, g) {
    const d = z.pos.distanceTo(cam.position); if (d > 34) return;
    D.stats.spot++;
    if ((g.mode !== 'foot' && Math.abs(ZK.fort.state.speed) >= 4) || D.k >= 0.5) { D.boost = Math.min(0.35, D.boost + 0.015); return; }
    D.stats.spotLoud = (D.stats.spotLoud || 0) + 1;
    D.boost = Math.min(0.35, D.boost + 0.07);
    if (markCd <= 0 && D.marks.length < 8) { markCd = 0.12; D.marks.push({ z, t: 1.1 }); }
    if (!audioOn()) return;
    if (spotCd <= 0) { spotCd = 4; ZK.audio.spot(ZK.panFor(z.pos), clamp(1.35 - d / 28, 0.3, 1.1)); }
    if (stingCd <= 0 && D.k < 0.35) { stingCd = 12; ZK.audio.stinger(0.9); }
  }

  // 추격 규칙: z.rush = 이동 속도 배율 (zombie3d가 걷기 이동에 곱한다)
  function chaseRules(z, d, dt, foot, g) {
    let r = 1;
    // 버스를 쫓을 땐 질주하지 않는다: ×1.5·×1.35 모두 매달림 피해를 크게 늘려 초보 봇 생존이 떨어졌다(같은 시드 3/6 → 1/6, 최신 코드에선 3분 안에 4/6 사망)
    // → 버스 밸런스는 그대로 두고, 버스의 긴장은 소리·화면·뒤 경고·추격자 예고로 만든다
    if (z.type === 'runner' && foot) {   // 20m 안에 들어오는 순간 질주 3.5초 → 숨 고르기 2.5초 → 다시 질주 (몰려오는 파도가 귀에 들리고 눈에 보이게)
      if (d < 20) {
        if (!z._inR) { z._inR = true; z._sprinting = false; z._surge = 0; }
        if ((z._surge -= dt) <= 0) { z._sprinting = !z._sprinting; z._surge = z._sprinting ? rand(3.2, 3.8) : rand(2.2, 2.8);
          if (z._sprinting && audioOn() && snarlCd <= 0 && d < 18) { snarlCd = 0.7; ZK.audio.snarl(ZK.panFor(z.pos), clamp(1.2 - d / 20, 0.3, 1)); } }
        r = z._sprinting ? 1.5 : 0.9;
      } else if (d > 24) z._inR = z._sprinting = false;
    } else if (z.type === 'runner') z._inR = z._sprinting = false;   // 버스로 돌아가면 질주 주기를 처음부터
    if (foot && z.type === 'walker' && d < 5) r = Math.max(r, 1.3);
    // 덮치기 (걸어 다닐 때만): 2.6m 안이면 최대 0.4초 동안 몸을 날린다(서 있으면 닿는다)
    // → 달아나는 중(초속 3m+)이라 끝까지 못 닿으면 '아슬아슬' (서서 맞은 건 아슬아슬이 아니다)
    //   출근러 덮치기(초속 10m)는 걸어서(4.7) 도망치면 닿고, 질주(6.3)면 약 1m 앞에서 끝난다 → 뛰어야 산다
    if (foot && !z.T.heavy && !z.T.chaser && (z.state === 'walk' || z.state === 'attack')) {   // 버스에 매달린 놈·쓰러진 놈은 못 덮친다
      z._lcd = (z._lcd ?? rand(0.4, 1.4)) - dt;
      if (z._wind > 0) {   // 예고 0.25초: 몸을 뒤로 젖히고 멈칫 → 그다음 몸을 날린다
        z._wind -= dt; r = 0.3; if (z._wind <= 0) z._lt = 0.4;
      } else if (z._lt > 0) {
        z._lt -= dt; r = Math.max(r, 2.6);
        if (d < 0.95) z._lt = 0;   // 닿았다 → 물기는 zombie3d가 한다
        else if (z._lt <= 0 && nearCd <= 0 && g.hp > 0 && Math.hypot(ZK.player.state.vel.x, ZK.player.state.vel.z) > 3) {   // 끝까지 못 닿았다 = 간발의 차로 피함
          nearCd = 2.5; D.nearFlash = 0.4; D.stats.near++; D.boost = Math.min(0.4, D.boost + 0.12);
          ZK.fx3.slowmo(0.45, 0.24); ZK.fx3.trauma(0.12); if (audioOn()) ZK.audio.whoosh(ZK.panFor(z.pos));
        }
      } else if (d < 2.6 && d > 1.25 && z._lcd <= 0 && lungeGap <= 0) {   // 한 번에 한 마리만(전역 1.4초 간격) · 이미 물 거리(1.25m) 안이면 덮치지 않는다
        // L4: 걸은 32초 동안 덮치기 56번 → 상시 상태가 돼 하나하나가 읽히지 않았다(초보 출혈사)
        z._wind = 0.25; z._lcd = rand(2.2, 3.2); lungeGap = 1.4; z.leanV -= 7; D.stats.lunge++;   // 뒤로 젖힘(피격 때와 같은 방향) → 덮칠 땐 상체를 숙인다(zombie3d rush > 1.25)
        if (audioOn() && snarlCd <= 0) { snarlCd = 0.5; ZK.audio.snarl(ZK.panFor(z.pos), 1.1); }
      }
    } else { z._lt = 0; z._wind = 0; }
    z.rush = r;
  }

  D.update = function (dt, g, cam) {
    const A = ZK.audio;
    if (g.state !== 'play') {   // 타이틀·일시정지·끝: 소리를 거두고 숨을 고른다
      D.k = Math.max(0, D.k - dt * 0.8); D.pulse = 0; D.tunnel = 0; D.marks.length = 0;
      if (audioOn()) { A.tension(0, false); A.muffle(0); } return;
    }
    if (ZK.surv.choosing) { if (audioOn()) A.tension(D.k * 0.5, true); return; }   // 카드 고르는 중: 음악만 낮게
    const ps = ZK.player.state, F = ZK.fort.state, foot = g.mode === 'foot', R = foot ? 20 : 15;
    const yaw = ps.yaw + (ps.lookYaw || 0), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cp = cam.position;
    spotCd -= dt; stingCd -= dt; snarlCd -= dt; shriekCd -= dt; nearCd -= dt; markCd -= dt; lungeGap -= dt;
    bins.fill(0);
    let sum = 0, rearN = 0, backN = 0, clingN = 0, danger = false; const close = [];
    // 밟으면 안도: 버스가 초속 3m를 넘으면 땅의 좀비(추격자 제외) 위협이 줄어 9m 넘게 달리면 45%만 센다
    // → "느려지면 심장이 뛰고, 밟으면 가라앉는다". 이게 없으면 보통 봇도 판의 40%를 고위협으로 보내 대비가 사라졌다
    const relief = 1 - 0.55 * clamp((Math.abs(F.speed) - 3) / 6, 0, 1);
    for (const z of g.zombies) {
      if (!z.alive) continue;
      const was = z._aw; z._aw = z.aware;
      if (was && was !== 'chase' && z.aware === 'chase' && !(z.flash > 0)) onSpot(z, cam, g);
      if (z.aware !== 'chase' || z.T.host) { z.rush = z.tideK || 1; continue; }   // 해일 좀비는 행진 속도(tide3d)
      let d;
      if (foot) d = Math.hypot(z.pos.x - ps.pos.x, z.pos.z - ps.pos.z);
      else { const L = ZK.fort.local(z.pos); d = Math.hypot(Math.max(0, Math.abs(L.lx) - F.halfW), Math.max(0, Math.abs(L.lz) - F.halfL));
        if ((z.type === 'runner' || z.T.chaser) && z.state !== 'cling' && L.lz > F.halfL * 0.6 && d < 12) rearN++; }   // 버스 뒤로 따라붙는 빠른 놈
      if (D.mech) chaseRules(z, d, dt, foot, g); else z.rush = 1;
      if (z.tideC) z.rush = Math.max(z.rush, z.tideC);   // 해일 좀비는 나를 알아본 뒤에도 느려지지 않는다
      const dx = z.pos.x - cp.x, dz = z.pos.z - cp.z, dl = Math.hypot(dx, dz) || 1, fwd = (dx * fx + dz * fz) / dl, a = Math.atan2((dx * rx + dz * rz) / dl, fwd);
      let v;
      if (z.state === 'cling') { if (foot) continue; v = 1.3; clingN++; }   // 걸어 다닐 땐 멀리 세워 둔 버스에 매달린 놈은 내 위협이 아니다
      else {
        if (d > R) continue;
        if (!foot && d < 15 && (z.T.chaser || z.type === 'butcher' || z.tide)) danger = true;   // 추격자·도살자는 체력과 상관없이 진짜 위기
        const w = z.T.chaser ? 2.6 : z.type === 'butcher' ? 3 : z.T.heavy ? 2.2 : z.type === 'runner' ? 1.5 : foot ? 1 : 0.7, c = 1 - d / R;   // 워커는 달리는 버스를 못 따라온다 → 버스에선 0.7
        v = w * c * c * (fwd < 0.35 ? 1.4 : 1) * (foot || z.T.chaser ? 1 : relief);
        if (foot && d < 4.5 && fwd < -0.2) backN++;
        if (d < (foot ? 12 : 15)) close.push([z, d, fwd]);
      }
      sum += v; bins[((Math.floor((a + Math.PI) / (2 * Math.PI) * BINS) % BINS) + BINS) % BINS] += v;
    }
    // 위협도
    D.raw = 1 - Math.exp(-sum * (foot ? 1.3 : 1) / (foot ? 5 : 6.5));   // 버스는 더 많이 붙어야 '고위협' — 판 내내 심장이 뛰면 대비가 없어진다
    const hpR = foot ? clamp(g.hp / 100, 0, 1) : clamp(F.hp / F.maxHp, 0, 1), panic = clamp((0.5 - hpR) / 0.4, 0, 1);
    D.boost = Math.max(0, D.boost - dt * 0.07);
    if (g.hordes !== hordeSeen) {   // 포위 무리: 그쪽에서 땅울림이 부풀어 온다
      hordeSeen = g.hordes; D.boost = Math.min(0.45, D.boost + 0.3);
      if (audioOn() && g.lastHorde) A.rumble(ZK.panFor(_v.set(g.lastHorde.x, 1, g.lastHorde.z)), 1, 3.5);
    }
    if (g.chaserWarn) D.boost = Math.max(D.boost, 0.35);
    if (ZK.tide && ZK.tide.warned) D.boost = Math.max(D.boost, ZK.tide.active ? 0.2 + 0.4 * clamp(1 - ZK.tide.frontDist / 70, 0, 1) : 0.25);   // 해일: 다가올수록 조여 온다
    // 버스 체력 55% 이상이면 위협 상한 0.65 → 30%(검수의 '위기' 기준)까지 내려가며 상한이 풀린다. 매달린 놈·가까운 추격자·도살자가 있거나 걸어 다닐 땐 상한 없음
    // 10차 보충: 숙련 봇이 판의 10~33%를 위협 0.7+로 보냈는데 위기는 판당 0.2번 → 심장박동의 최상단(박동 흔들림·매 박동 북)은 진짜 위기에만 남긴다
    const cap = foot || clingN > 0 || danger ? 1 : lerp(0.65, 1, clamp((0.55 - hpR) / 0.25, 0, 1));
    const target = Math.min(cap, clamp(Math.max(D.raw, panic * 0.85) + D.boost, 0, 1));
    D.k += (target - D.k) * (1 - Math.exp(-dt * (target > D.k ? 2.5 : 0.45)));
    const k = D.k, st = D.stats; if (k >= 0.7) st.high += dt; if (k >= 0.4) st.mid += dt; if (k > st.peak) st.peak = k;
    { const fr = F.hp / F.maxHp; if (fr > 0 && fr < st.minFort) { st.minFort = fr; st.minFortT = g.t; } if (foot && g.hp > 0) st.minFoot = Math.min(st.minFoot, g.hp / 100); }   // 결과창 '이번 판의 순간'용
    for (let i = 0; i < BINS; i++) binS[i] += (bins[i] - binS[i]) * (1 - Math.exp(-dt * 6));
    const fear = ZK.cfg ? ZK.cfg.fear : 1;   // 설정 패널의 '공포 화면 효과'(비네트·시야 좁힘)
    D.tunnel = ps.mode === 'fpp' ? 6 * k * k * fear : 0;
    D.pulse = Math.max(0, D.pulse - dt * 3.2);
    D.nearFlash = Math.max(0, D.nearFlash - dt);
    D.rearN = rearN; D.rearT = rearN > 0 ? Math.min(1, D.rearT + dt * 4) : Math.max(0, D.rearT - dt * 2);
    D.backT = backN > 0 ? 0.6 : Math.max(0, D.backT - dt);
    for (let i = D.marks.length - 1; i >= 0; i--) { const m = D.marks[i]; m.t -= dt; if (m.t <= 0 || !m.z.alive) D.marks.splice(i, 1); }

    // 지구력 (걸어 다닐 때 질주): 초당 −18 → 약 5.5초 · 0.8초 쉬면 초당 +24(피로 70+면 ×0.6) · 바닥나면 35까지 못 뛴다
    if (foot && D.mech && ps.sprint && (stepNoiseT -= dt) <= 0) { stepNoiseT = 0.45; g.noise('footstep', ps.pos); }   // 질주 발소리: 반경 9m (무기고 경비도 18m 안이면 깬다)
    if (foot && D.mech) {
      if (ps.sprint) { D.stam = Math.max(0, D.stam - 18 * dt); restT = 0.8; if (D.stam <= 0 && !D.exhausted) { D.exhausted = true; D.stats.exhaust++; if (audioOn()) { A.breath(1.4, true); breathT = 0.45; } } }
      else if ((restT -= dt) <= 0) D.stam = Math.min(100, D.stam + 24 * (ZK.needs.s && ZK.needs.s.fatigue >= 70 ? 0.6 : 1) * dt);
      if (D.exhausted && D.stam >= 35) D.exhausted = false;
    } else { D.stam = Math.min(100, D.stam + 40 * dt); D.exhausted = false; }

    if (!audioOn()) return;
    // 심장박동 + 맥박 북 (위협 0.18부터 들린다)
    const bpm = 58 + 95 * Math.pow(k, 1.2);
    if ((beatT -= dt) <= 0) {
      beatT = 60 / bpm; beatN++;
      const v = clamp((k - 0.15) / 0.6, 0, 1) * (foot ? 1.05 : 0.85);
      if (v > 0.02) { A.heartbeat(v); D.pulse = 1; if (k > 0.72) ZK.fx3.trauma(0.012); }
      if (k > 0.8 || (k > 0.45 && beatN % 2 === 0)) A.drum(clamp((k - 0.4) / 0.6, 0.15, 1) * 0.75);
    }
    A.tension(k, true);
    A.muffle(clamp((0.35 - hpR) / 0.3, 0, 1) * 0.8);
    // 숨소리: 걸을 때 지구력이 떨어지거나 쫓길수록 빠르고 크게 · 버스 위에선 아주 위험할 때만
    const effort = foot ? Math.max((1 - D.stam / 100) * (D.exhausted ? 1.25 : 1), k * 0.7) : Math.max(0, (k - 0.75) * 1.6);
    if (effort > 0.2 && (breathT -= dt) <= 0) { breathT = lerp(1.5, 0.42, clamp(effort, 0, 1)) * (inhale ? 0.8 : 1.2); A.breath(clamp(effort, 0.25, 1.3), inhale); inhale = !inhale; }
    // 가까운 추적 좀비: 걸을 땐 가장 가까운 3마리의 발소리(뒤에서 오면 더 크게) · 7m 안 으르렁 · 추격자 사냥 비명
    close.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < close.length; i++) {
      const [z, d, fwd] = close[i], pan = ZK.panFor(z.pos);
      if (foot && i < 3 && z.state === 'walk') {
        z._st = (z._st ?? rand(0, 0.3)) - dt * z.speed * (z.rush || 1);
        if (z._st <= 0) { z._st = 1.7; A.zstep(pan, Math.pow(1 - d / 12, 2) * (fwd < 0 ? 1.3 : 0.9) * (z.T.heavy ? 1.6 : 1)); }
      }
      if (d < 7 && snarlCd <= 0 && Math.random() < dt * 0.9) { snarlCd = 0.9; A.snarl(pan, clamp(1.1 - d / 8, 0.3, 1)); }
      if (z.T.chaser && z.state !== 'cling' && shriekCd <= 0 && Math.random() < dt * 0.6) { shriekCd = 1.4; A.shriek(pan, clamp(1 - d / 18, 0.35, 0.9)); }
    }
    // 조용할 때: 도시 어딘가의 먼 신음 (9~16초마다)
    if (k < 0.3 && (ambT -= dt) <= 0) { ambT = rand(9, 16); A.groan(rand(-0.9, 0.9), rand(0.15, 0.3)); }
  };
  // 첫 습격(L9): 판 시작 배낭을 줍는 순간, 시야 안(앞 ±50°) 16~18m에서 출근러 1마리가 비명과 함께 튀어나와 달려든다
  // 왜: 시작 뒤 첫 '쫓기는' 순간이 1분 가까이 걸렸다(좀비 6마리가 25~40m 뒤에서 배회만). 버스로 뛰어 타거나 한 발로 잡으면 된다(출근러 체력 30)
  D.openingScare = function (g, cam) {
    const ps = ZK.player.state, yaw = ps.yaw; let pos = null;
    // 보이는 곳이어야 한다: 버스·차·벽이 플레이어와 그 자리 사이에 있으면 다른 자리 (처음엔 버스 뒤에 숨어 '!'만 보였다)
    const F = ZK.fort.state, clear = (x, z) => { for (let s2 = 0.15; s2 < 1; s2 += 0.12) { const px = ps.pos.x + (x - ps.pos.x) * s2, pz = ps.pos.z + (z - ps.pos.z) * s2, L = ZK.fort.local(new THREE.Vector3(px, 0, pz));
      if ((Math.abs(L.lx) < F.halfW + 0.6 && Math.abs(L.lz) < F.halfL + 0.6) || !ZK.world.freeSpot(px, pz, 0.2)) return false; } return true; };
    for (let k = 0; k < 40 && !pos; k++) { const a = yaw + (Math.random() - 0.5) * 1.75, d = 16 + Math.random() * 2, x = ps.pos.x - Math.sin(a) * d, z = ps.pos.z - Math.cos(a) * d; if (ZK.world.freeSpot(x, z, 0.6) && clear(x, z)) pos = new THREE.Vector3(x, 0, z); }
    if (!pos) return;
    const z = g.spawnZ('runner', pos, 'chase'); D.marks.push({ z, t: 1.4 }); D.boost = Math.min(0.45, D.boost + 0.3); D.stats.opening = 1;
    g.onNotice && g.onNotice('놈이다! — 쏘거나(좌클릭) 버스로 뛰어(Shift)!', '#ff5a4a');
    if (audioOn()) { ZK.audio.spot(ZK.panFor(pos), 1.2); ZK.audio.stinger(1); }
    ZK.fx3.trauma(0.12);
  };
  // 추격자 예고: 실제로 나타나기 2.8초 전, 버스 뒤쪽에서 먼 비명
  D.warnChasers = function () {
    D.boost = Math.max(D.boost, 0.35);
    if (!audioOn()) return;
    const fw = ZK.fort.forward(), F = ZK.fort.state, p = new T.Vector3(F.pos.x - fw.x * 40, 1, F.pos.z - fw.z * 40);
    ZK.audio.farShriek(ZK.panFor(p)); setTimeout(() => ZK.audio.farShriek(ZK.panFor(p)), 900);
  };

  // 결과창 '이번 판의 순간': 쫓긴 기억 중 가장 극적인 2개 (점수가 높은 순)
  D.highlights = function (g) {
    const st = D.stats, out = [], win = g.state === 'win', R = ZK.raid && ZK.raid.stats, C = ZK.tide && ZK.tide.stats, mm = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const Bl = ZK.bail && ZK.bail.stats, bl = Bl && Bl.runs[Bl.runs.length - 1];   // 버스 탈출(bail3d)
    if (Bl && Bl.lz) out.push([115, win ? `${mm(Bl.lz.t)}에 버스가 터졌지만 걸어서 헬기에 올랐다` : `${mm(Bl.lz.t)}에 버스가 터진 뒤 ${Bl.lz.reachT ? '착륙장에서 버티다' : '착륙장까지 뛰다'} 쓰러졌다`]);   // 9:00 뒤 파괴: 걸어서 착륙장
    else if (bl) out.push([110, `버스가 터졌지만 ${bl.runT}초 만에 폐차에 시동을 걸었다 (${mm(bl.t)})`]);
    else if (Bl && Bl.n && !win) out.push([105, `버스가 터진 뒤 폐차까지 뛰다 쓰러졌다 (${mm(ZK.bail.t0)})`]);
    if (st.minFort < 0.2 && !(Bl && Bl.n)) out.push([100 - st.minFort * 100, win ? `버스 체력 ${Math.max(1, Math.round(st.minFort * 100))}%까지 몰렸다가 탈출했다 (${mm(st.minFortT)})` : `버스 체력 ${Math.max(1, Math.round(st.minFort * 100))}%에서 버티다 쓰러졌다 (${mm(st.minFortT)})`]);
    if (R && R.looted) out.push([85, R.backT ? `무기고를 털고 ${R.backT}초 만에 버스로 돌아왔다` : '무기고를 털었다']);
    if (st.near > 0) out.push([60 + 8 * st.near, `덮치는 좀비를 ${st.near}번 간발의 차로 피했다`]);
    if (st.minFoot < 0.3) out.push([70, `걸어 다니다 체력 ${Math.max(1, Math.round(st.minFoot * 100))}%까지 물렸다`]);
    if (C && C.spawned) out.push([win ? 75 : 40, win ? `해일 ${C.killed}마리를 뚫고 헬기에 올랐다` : `해일 ${C.killed}/${C.spawned}마리를 쓰러뜨렸다`]);
    if (g.bestChain >= 4) out.push([30 + g.bestChain * 4, `연쇄 폭발 ×${g.bestChain}`]);
    if (g.bestCombo >= 20) out.push([20 + Math.min(20, g.bestCombo / 5), `${g.bestCombo} 콤보`]);   // 아래 둘은 쫓긴 순간이 모자랄 때 채우는 줄
    if (g.rams >= 80) out.push([15, `버스로 ${g.rams}마리를 들이받았다`]);
    return out.sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]);
  };

  // ───────── HUD ─────────
  D.draw = function (h, W, H, g, label, cam) {
    if (g.state !== 'play' || ZK.surv.choosing) return;
    const cx = W / 2, cy = H / 2, k = D.k, t = ZK.fx3.time;
    // ① 조여 오는 어둠: 위협이 클수록 가장자리가 검게, 심장이 뛸 때마다 한 번 더 조인다
    const a = Math.min(0.8, k * 0.55 + D.pulse * k * 0.25) * (ZK.cfg ? ZK.cfg.fear : 1);
    if (a > 0.02) {
      const inner = Math.min(W, H) * lerp(0.45, 0.16, k) * (1 - D.pulse * 0.1), gr = h.createRadialGradient(cx, cy, inner, cx, cy, Math.hypot(W, H) * 0.55);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, `rgba(8,0,0,${a * 0.55})`); gr.addColorStop(1, `rgba(0,0,0,${a})`); h.fillStyle = gr; h.fillRect(0, 0, W, H);
    }
    // ② 위협 방향: 화면 가장자리 타원 위의 붉은 호 (위 = 앞, 아래 = 뒤). 시야 안(앞 ±32°)은 옅게
    const ex = W * 0.47, ey = H * 0.45, span = (2 * Math.PI / BINS) * 0.82;
    h.lineCap = 'round';
    for (let i = 0; i < BINS; i++) {
      const b = binS[i]; if (b < 0.05) continue;
      const mid = (i + 0.5) / BINS * 2 * Math.PI - Math.PI, seen = Math.abs(mid) < 0.55, al = Math.min(0.9, b * 0.55) * (seen ? 0.25 : 1) * (0.8 + 0.2 * Math.sin(t * 9 + i));
      const phi = mid - Math.PI / 2;
      h.strokeStyle = `rgba(255,30,20,${al * 0.35})`; h.lineWidth = 10 + 14 * Math.min(1, b); h.beginPath(); h.ellipse(cx, cy, ex, ey, 0, phi - span / 2, phi + span / 2); h.stroke();
      h.strokeStyle = `rgba(255,90,70,${al})`; h.lineWidth = 3 + 3 * Math.min(1, b); h.beginPath(); h.ellipse(cx, cy, ex, ey, 0, phi - span / 2, phi + span / 2); h.stroke();
    }
    // ③ 알아챈 좀비 머리 위 '!' (튀어나왔다가 깜빡이며 사라짐)
    for (const m of D.marks) {
      const wp = m.z.head.getWorldPosition(_v); wp.y += 0.55 * (m.z.T.scale || 1);
      const vv = wp.clone().applyMatrix4(cam.matrixWorldInverse); if (vv.z > -0.5) continue;
      const p = wp.project(cam); if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const age = 1.1 - m.t, sc = age < 0.12 ? 1.6 - age * 5 : 1, sz = clamp(34 / Math.max(1, -vv.z / 8), 16, 34) * sc;
      h.globalAlpha = clamp(m.t * 2, 0, 1) * (m.t < 0.5 ? (Math.sin(t * 30) > 0 ? 1 : 0.4) : 1);
      label('!', (p.x + 1) / 2 * W, (1 - p.y) / 2 * H, sz, '#ff3b2a'); h.globalAlpha = 1;
    }
    // ④ 뒤 경고: 버스 뒤로 빠른 놈이 따라붙음 / 걸을 때 바로 뒤에 붙음
    const rel = Math.atan2(Math.sin(ZK.player.state.yaw - ZK.fort.state.heading), Math.cos(ZK.player.state.yaw - ZK.fort.state.heading));
    if (g.mode === 'drive' && D.rearT > 0.05 && Math.abs(rel) < 1.9) {
      const gr = h.createLinearGradient(0, H, 0, H * 0.72), al = D.rearT * (0.55 + 0.45 * Math.sin(t * 10));
      gr.addColorStop(0, `rgba(200,0,0,${0.45 * al})`); gr.addColorStop(1, 'rgba(200,0,0,0)'); h.fillStyle = gr; h.fillRect(0, H * 0.72, W, H * 0.28);
      h.globalAlpha = D.rearT; label(D.rearN > 1 ? `뒤에 ${D.rearN}마리가 따라붙었다 — 밟아라!` : '뒤에 따라붙었다 — 밟아라!', cx, H * 0.7, 22, '#ff5a4a'); h.globalAlpha = 1;
    }
    if (g.mode === 'foot' && D.backT > 0) {
      const gr = h.createLinearGradient(0, H, 0, H * 0.78); gr.addColorStop(0, `rgba(220,0,0,${0.5 * D.backT / 0.6})`); gr.addColorStop(1, 'rgba(220,0,0,0)'); h.fillStyle = gr; h.fillRect(0, H * 0.78, W, H * 0.22);
      h.globalAlpha = Math.min(1, D.backT * 2) * (Math.sin(t * 16) > -0.3 ? 1 : 0.5); label('뒤!', cx, H * 0.72, 40, '#ff3b2a'); h.globalAlpha = 1;
    }
    // ⑤ 아슬아슬: 붉은 테두리 번쩍
    if (D.nearFlash > 0) { h.strokeStyle = `rgba(255,40,30,${D.nearFlash * 1.6})`; h.lineWidth = 26; h.strokeRect(0, 0, W, H); }
    // ⑥ 지구력 (걸을 때, 가득 차 있지 않으면): 사람 체력 막대와 요새 체력 막대 사이 (위쪽은 탑승 안내 글자 자리)
    if (g.mode === 'foot' && D.mech && D.stam < 99.5) {
      const bw = Math.min(420, W * 0.5) * 0.4, bx = cx - Math.min(420, W * 0.5) / 2, by = H - 52 - 13;
      h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(bx - 3, by - 3, bw + 6, 10);
      h.fillStyle = D.exhausted ? (Math.sin(t * 12) > 0 ? '#ff5a3a' : '#8a2a1a') : D.stam < 30 ? '#ffb24a' : '#e8e2b0'; h.fillRect(bx, by, bw * D.stam / 100, 4);
      h.font = '700 11px system-ui, sans-serif'; h.textAlign = 'left'; h.fillStyle = D.exhausted ? '#ff8a6a' : '#aab2c0';
      h.fillText(D.exhausted ? '숨이 차다 — 못 뛴다' : '지구력', bx + bw + 8, by + 3);
    }
    // 몰래 걷기 상태 (걸을 때): 앉음·엎드림이면 들킬 거리, 질주면 발소리 — 지구력 막대 위
    if (g.mode === 'foot' && D.mech) {
      const ps2 = ZK.player.state, sk = D.stealthK(), sight = Math.round((g.sight || 12) * sk), bx2 = cx - Math.min(420, W * 0.5) / 2, y2 = H - 52 - 62;   // 탑승 안내(H−92, 가운데)와 겹치지 않게 그 위
      const lit = ZK.torch && ZK.torch.on, txt = (ps2.stance === 'prone' ? `엎드림 — 들킬 거리 ${sight}m` : ps2.stance === 'crouch' ? `몸 낮춤 — 들킬 거리 ${sight}m` : ps2.sprint ? `질주 — 발소리 9m · 들킬 거리 ${sight}m` : lit ? `들킬 거리 ${sight}m` : null);
      if (lit) { h.font = '700 12px system-ui, sans-serif'; h.textAlign = 'left'; h.fillStyle = '#ffe8b0'; h.fillText('손전등 켜짐(L) — 잘 보이지만 잘 들킨다', bx2, y2 - 16); }
      if (txt) { h.font = '700 12px system-ui, sans-serif'; h.textAlign = 'left'; h.fillStyle = ps2.sprint ? '#ffb24a' : '#9fe8a8'; h.fillText(txt, bx2, y2); }
    }
  };
})();
