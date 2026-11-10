// 좀비킬 봇 플레이테스트 하네스 (game-review 스킬용)
// 사용: 페이지에서 → const c = await (await fetch('qa/bot_harness.js', {cache:'reload'})).text(); (0, eval)(c);
//       __runOne('보통', 11)  → 한 판(최대 600초)을 돌리고 결과 문자열 반환. 결과는 window.__runs 에 쌓임
//       __export()           → summarize_playtest.py 입력용 JSON 문자열
(function () {
  if (ZK.meta) ZK.meta.bot = true;   // 봇 판은 별·해금을 저장하지 않고 시작 보너스도 받지 않는다
  // 소리 끄기: 헤드리스·숨은 창에선 AudioContext가 멈춰 있어, 총소리마다 만든 소리 노드가 끝나지 않고 쌓인다 → 판을 거듭할수록 느려지다 멈춘 것처럼 됨 (2026-11-09 배치)
  if (ZK.audio && ZK.audio.toggleMute && !window.__botMuted) { if (!ZK.audio.toggleMute()) ZK.audio.toggleMute(); window.__botMuted = true; }
  // 단, 계약 ④⑤(직분사·혈액 엔진)는 봇에게도 열어 둔다 — 안 그러면 한 번도 검수되지 않는다
  if (ZK.meta && !ZK.meta.unlocked.botWrap) { const ul0 = ZK.meta.unlocked; ZK.meta.unlocked = id => /^contract/.test(id) || ul0(id); ZK.meta.unlocked.botWrap = true; }
  const D = ZK.debug3, P = ZK.player, ps = P.state, k = P.keys, S = ZK.surv, T = THREE, g = D.g;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const PROFILES = {
    // 초보도 앞 장애물은 보고 피한다(2026-11-09 임무 추가 뒤): 임무로 멀리 다니면서 같은 벽에 1분에 15번씩 박아 죽는 건 사람 초보가 아니라 봇의 한계였다
    // risky: 무전에서 위험(B)을 고를 확률 (초보는 고르지 않고 20초를 흘려보내 A) · arm: 매달린 놈 팔을 노릴 확률 · sac: 숙주 고름주머니를 노릴 확률
    '초보': { aim: 2.5 * Math.PI / 180, react: 0.6, head: 0.10, seek: 0.4, smartCards: false, lookahead: true, skeet: 0.3, slam: 0.3, jam: 0.15, boltR: 12, risky: 0, arm: 0, sac: 0.3, armsR: 30, armsBrave: 4 },
    '보통': { aim: 1.2 * Math.PI / 180, react: 0.35, head: 0.30, seek: 1.0, smartCards: false, lookahead: true, skeet: 0.6, slam: 0.6, jam: 0.08, boltR: 20, trapWatch: true, risky: 0.4, arm: 0.3, sac: 0.7, armsR: 45, armsBrave: 5 },
    '숙련': { aim: 0.5 * Math.PI / 180, react: 0.2, head: 0.45, seek: 1.0, smartCards: true, lookahead: true, skeet: 0.9, slam: 0.85, jam: 0.03, boltR: 28, trapWatch: true, risky: 0.65, arm: 0.6, sac: 0.95, armsR: 55, armsBrave: 7 },
    // 조용한 보통: 매달린 좀비나 12m 안의 좀비만 쏜다 (소음 관리가 실제로 포위를 줄이는지 확인용)
    '보통조용': { aim: 1.2 * Math.PI / 180, react: 0.35, head: 0.30, seek: 1.0, smartCards: false, lookahead: true, quiet: 12, skeet: 0.6, slam: 0.6, jam: 0.08, risky: 0.4, arm: 0.3, sac: 0.7, armsR: 45, armsBrave: 5 },
  };
  window.__runs = window.__runs || [];
  let R = null, dmgSrc = 'crash', killSrc = null, B = null;
  const log = (type, d) => { if (R) R.events.push([+g.t.toFixed(2), type].concat(d !== undefined ? [d] : [])); };

  // ── 이벤트·피해·처치 출처 기록 (원본 함수를 감쌈) ──
  const ot = ZK.fx3.text; ZK.fx3.text = function (p, text) {
    const map = { 'OVERKILL!': 'OVERKILL', 'HEADSHOT': 'HEADSHOT', '+장갑판': 'ABSORB', '생존자 합류!': 'RESCUE', '+통조림·생수': 'RESCUE', '보급품!': 'CRATE', '집중 사격!': 'RALLY' };   // 외로운 총잡이: 생존자 = 식량
    if (map[text]) log(map[text]); else if (String(text).startsWith('CHAIN')) log('CHAIN', text); else if (String(text).startsWith('PERFECT')) log('PERFECT'); else if (String(text).startsWith('OVERKILL')) log('OVERKILL', text);
    return ot.apply(this, arguments);
  };
  const ox = S.addXP; S.addXP = function (v) { log('KILL'); return ox.call(S, v); };
  const osc = ZK.absorb.spawnCrate; ZK.absorb.spawnCrate = function (p) { log('ELITE_KILL'); return osc.call(ZK.absorb, p); };
  const oex = ZK.Zombie3.prototype.explode; ZK.Zombie3.prototype.explode = function () { if (killSrc !== 'ram') log('BURST'); return oex.call(this); };   // 시체 폭발 전체(큰 연출 + 혼자 터짐)
  const oc = S.choose; S.choose = function (i) { const c = S.cards[i]; if (S.choosing && S.openT >= 0.3 && c) { log('LEVELUP'); log('CARD', c.name); } return oc.call(S, i); };
  const oh = ZK.fort.hurt; ZK.fort.hurt = function (d) { const b = ZK.fort.state.hp; oh.call(ZK.fort, d); if (R) R.dmg[dmgSrc] = (R.dmg[dmgSrc] || 0) + b - ZK.fort.state.hp; };
  const wrapG = (name, fn) => { const o = g[name]; g[name] = function (...a) { return fn(o, a); }; };
  // try/finally: 호출이 중간에 끊겨도(도구 타임아웃 등) 출처 표시가 남아 다음 판 기록을 오염시키지 않게
  wrapG('hurtTarget', (o, a) => { const p = dmgSrc, ground = a[2] && a[2].kind === 'fort' && !a[2].quiet, hb = ZK.fort.state.hp; dmgSrc = a[2] && a[2].quiet ? (a[1] && a[1].T && a[1].T.chaser ? 'chaser' : 'cling') : 'zombie';
    try { return o.apply(g, a); } finally { dmgSrc = p; if (R && ground && g.state === 'play' && ZK.fort.state.hp === hb && hb > 0) R.capped = (R.capped || 0) + 1; } });   // 동시 공격 제한에 걸려 피해 없이 끝난 타격
  wrapG('ramZombie', (o, a) => { const p1 = dmgSrc, p2 = killSrc; dmgSrc = 'ram'; killSrc = 'ram'; try { return o.apply(g, a); } finally { dmgSrc = p1; killSrc = p2; } });
  wrapG('autoShot', (o, a) => { const p = killSrc; killSrc = a[3]; try { return o.apply(g, a); } finally { killSrc = p; } });
  wrapG('auraHit', (o, a) => { const p = killSrc; killSrc = a[2] === 'fire' ? 'fire' : 'aura'; try { return o.apply(g, a); } finally { killSrc = p; } });
  wrapG('airHit', (o, a) => { const p = killSrc; killSrc = 'air'; try { return o.apply(g, a); } finally { killSrc = p; } });   // AIR 폭발과 그 처치
  wrapG('bowl', (o, a) => { const p = killSrc; killSrc = 'bowl'; try { return o.apply(g, a); } finally { killSrc = p; } });     // 볼링(들이받기 계열)
  { const oa = ZK.arms.update; ZK.arms.update = function (...a) { const p1 = dmgSrc, p2 = killSrc; dmgSrc = 'nade'; killSrc = 'nade'; try { return oa.apply(ZK.arms, a); } finally { dmgSrc = p1; killSrc = p2; } }; }   // 수류탄 폭발 처치·버스 피해는 'nade'
  wrapG('blast', (o, a) => { const p = killSrc; killSrc = p === 'air' ? 'air' : p === 'nade' ? 'nade' : (a[1] === 2.8 && a[2] === 320 ? 'sign' : 'blast'); try { return o.apply(g, a); } finally { killSrc = p; } });   // 드럼통·분쇄 범퍼 폭발
  { const ou = ZK.mis.update, ob = ZK.mis.blowBarrel; ZK.mis.update = function (...a) { const p = dmgSrc; dmgSrc = 'blast'; try { return ou.apply(ZK.mis, a); } finally { dmgSrc = p; } }; ZK.mis.blowBarrel = function (...a) { const p = dmgSrc; dmgSrc = 'blast'; try { return ob.apply(ZK.mis, a); } finally { dmgSrc = p; } }; }   // 드럼통·간판이 버스에 준 피해
  wrapG('onCrash', (o, a) => { log('CRASH', +(a[1] ?? a[0]).toFixed(1)); if (R) { const h = (a[1] ?? a[0]) > 5; R[h ? 'crashHead' : 'crashScrape'] = (R[h ? 'crashHead' : 'crashScrape'] || 0) + 1; } if (B) B.crashed = true; return o.apply(g, a); });
  const zh = ZK.Zombie3.prototype.hit; ZK.Zombie3.prototype.hit = function (part, point, dir, dmg, opts = {}) {
    const wasCling = this.state === 'cling', r = zh.call(this, part, point, dir, dmg, opts);
    if (r && r.killed && R) { const s = killSrc || (opts.explosion ? 'chain' : 'player'); R.kills[s] = (R.kills[s] || 0) + 1; if (wasCling) R.clingKills = (R.clingKills || 0) + 1;
      if (this.type === 'chaser') { R.chaserKills = R.chaserKills || {}; const kk = s + (wasCling ? '@cling' : '@run'); R.chaserKills[kk] = (R.chaserKills[kk] || 0) + 1; } }
    return r;
  };

  // ── 봇 ──
  function pickCard(prof) {
    if (!prof.smartCards) return (Math.random() * 3) | 0;
    const F = ZK.fort.state, low = F.hp / F.maxHp < 0.5;
    const score = c => (low && ['강판 보강', '수리 드론', '긴급 수리'].includes(c.name) ? 10 : 0) + (['지붕 포탑', '화염 고리', '충각 가시', '매그넘 탄', '과잉 살상', '전기 울타리'].includes(c.name) ? 5 : 0)
      + (c.contract ? ({ lone: 6, blackout: 6, nitro: 2, blood: 2, nobrake: -5 }[c.id] || 0) : 0) + Math.random();   // 계약: 총잡이·정전은 받고, 브레이크 철거는 피한다(봇은 Space로 멈춘다)
    let best = 0; S.cards.forEach((c, i) => { if (score(c) > score(S.cards[best])) best = i; }); return best;
  }
  // ── 2단계 생존: 수치가 떨어지면 수색 원정(가까운 노란 지점으로 몰고 가서 내려 G 1.5초 → 돌아와 탑승) · 1초마다 H ──
  const press = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
  function needsStep(dt, prof) {
    const N = ZK.needs, s = N.s, inv = N.inv, F = ZK.fort.state;
    if ((B.useT -= dt) <= 0) { B.useT = 1;
      if ((s.bleeding && inv.bandage) || (s.infected && s.infection >= 30 && inv.anti) || (s.thirst < 60 && inv.water) || (s.hunger < 60 && inv.can) || (s.fatigue >= 70 && inv.pill) || (g.mode === 'drive' && s.fuel < 50 && inv.fuelcan)) { N.useBest(g); R.uses = (R.uses || 0) + 1; }
    }
    if (s.hunger <= 0 || s.thirst <= 0) R.zeroNeed = (R.zeroNeed || 0) + dt;
    if (s.fuel <= 0) R.fuelZero = (R.fuelZero || 0) + dt;
    if (g.mode === 'foot') R.footT = (R.footT || 0) + dt;
    if (s.infected && !R.infectedAt) R.infectedAt = Math.round(g.t);
    const want = (s.thirst < 50 && !inv.water) || (s.hunger < 50 && !inv.can) || (s.fuel < 35 && !inv.fuelcan) || (s.bleeding && !inv.bandage) || (s.infected && s.infection > 40 && !inv.anti);
    const urgent = s.thirst <= 0 || s.hunger <= 0 || s.fuel <= 0;
    if (!B.trip && want && g.mode === 'drive' && g.t < 500 && !B.hold && !(ZK.mis.offer && B.offerPick && !urgent) && (B.tripCd -= dt) <= 0) {   // 8:20 이후엔 탈출이 먼저 · 무전에서 고른 쪽으로 가는 중엔 미룸
      const pts = N.points.filter(q => !q.done && !q.cache && q.pos.distanceTo(F.pos) < 70 && !(B.skip.get(q) > g.t))
        .map(q => ({ q, d: q.pos.distanceTo(F.pos) + (q.name === '상점 셔터' ? 10 : 0) + 6 * g.zombies.filter(z => z.alive && z.aware === 'chase' && z.pos.distanceTo(q.pos) < 12).length }))   // 벽 앞 셔터는 박기 쉬워 조금 덜 선호
        .sort((a, b) => a.d - b.d);
      if (pts[0]) { B.trip = { p: pts[0].q, phase: 'drive', t: 0 }; R.trips = (R.trips || 0) + 1; log('TRIP'); } else B.tripCd = 5;
    }
    // ── 무기 보급함 원정: 필요한 것(조준경·소총이 없거나, 소총탄 < 30, 수류탄 < 2)이 든 상자가 가깝고 근처에 깬 좀비가 적으면 내려서 가져온다 ──
    if (!B.trip && g.mode === 'drive' && g.t > 25 && g.t < 470 && !B.hold && !(ZK.mis.offer && (B.offerPick || prof.risky > 0)) && !B.trapWatch && (B.armsCd = (B.armsCd || 0) - dt) <= 0 && ZK.arms) {   // 무전·덫 지켜보기 중엔 원정을 시작하지 않는다
      B.armsCd = 3; const G3 = ZK.gun3;
      const want = c => c.kind === 'scope' ? !G3.hasScope : c.kind === 'rifle' ? !G3.hasRifle : c.kind === 'ammo' ? G3.hasRifle && (inv.rifleAmmo || 0) < 30 : (inv.grenade || 0) < 2;
      const pick = ZK.arms.caches.filter(q => !q.opened && want(q) && q.pos.distanceTo(F.pos) < prof.armsR && !(B.skip.get(q.pt) > g.t))
        .map(q => ({ q, d: q.pos.distanceTo(F.pos), awake: ZK.arms.liveGuards(q).length + g.zombies.filter(z => z.alive && !z.cacheGuard && z.aware === 'chase' && z.pos.distanceTo(q.pos) < 12).length }))   // 상자 곁 경비(잠든 놈 포함) + 근처 추격자
        .filter(o => o.awake < prof.armsBrave).sort((a, b) => a.d - b.d)[0];
      if (pick) { B.trip = { p: pick.q.pt, phase: 'drive', t: 0, arms: pick.q.kind }; R.armsTrips = (R.armsTrips || 0) + 1; log('ARMS_TRIP', pick.q.kind); }
    }
    const tr = B.trip; if (!tr) return false;
    if (tr.arms && tr.phase === 'drive' && ZK.mis.offer && B.offerIdx !== ZK.mis.offer.idx && prof.risky > 0) { B.trip = null; return false; }   // 차로 가는 중에 무전이 오면 원정 취소
    tr.t += dt;
    if (tr.phase === 'drive') {
      if (g.mode !== 'drive') { tr.phase = 'walk'; return true; }
      const d = Math.hypot(tr.p.pos.x - F.pos.x, tr.p.pos.z - F.pos.z);
      if (tr.t > 30) { B.skip.set(tr.p, g.t + 40); B.trip = null; B.tripCd = 3; return false; }   // 못 다가가면 포기
      if (d < 8.5) { const nb = ZK.surv.contract.has('nobrake'); k.KeyW = false; k.KeyS = nb && F.speed > 0.5; k.Space = !nb; k.KeyA = k.KeyD = false;   /* 브레이크 철거면 S로 감속 */ if (Math.abs(F.speed) < 1.5) { press('KeyF'); tr.phase = 'walk'; tr.t2 = 0; } return true; }
      if (d < 20 && B.revT <= 0) {   // 가까워지면 초속 3m로 천천히 다가간다 (벽 앞 지점에 그대로 박지 않게)
        const fw = ZK.fort.forward(), dx = tr.p.pos.x - F.pos.x, dz = tr.p.pos.z - F.pos.z, side = Math.cos(F.heading) * dx - Math.sin(F.heading) * dz, ahead = fw.x * dx + fw.z * dz;
        let st2 = Math.max(-1, Math.min(1, side / 4)); if (ahead < 0) st2 = side >= 0 ? 1 : -1;
        const nb = ZK.surv.contract.has('nobrake'); k.KeyW = F.speed < 3; k.KeyS = nb && F.speed > 4.5; k.Space = !nb && F.speed > 4.5; k.KeyD = st2 > 0.15; k.KeyA = st2 < -0.15; return true;
      }
      B.goal = tr.p.pos; return false;   // 멀면 평소 운전 로직이 목표로 몰고 간다
    }
    // 걸어서: 조준 때문에 시선이 바뀌어도 목표 방향 기준으로 WASD를 고른다
    const ps2 = ps, go = (x, z) => { const dx = x - ps2.pos.x, dz = z - ps2.pos.z, l = Math.hypot(dx, dz) || 1, sy = Math.sin(ps2.yaw), cy = Math.cos(ps2.yaw);
      const df = (dx * -sy + dz * -cy) / l, dr = (dx * cy + dz * -sy) / l; k.KeyW = df > 0.35; k.KeyS = df < -0.35; k.KeyD = dr > 0.35; k.KeyA = dr < -0.35; k.ShiftLeft = prof !== PROFILES['초보'] && l > 3; return l; };
    tr.t2 = (tr.t2 || 0) + dt;
    if (tr.phase !== 'return' && (g.hp < 45 || tr.t2 > 30 || tr.p.done && tr.phase === 'walk')) tr.phase = 'return';
    if (tr.phase === 'walk') { const l = go(tr.p.pos.x, tr.p.pos.z); if (l < 1.3) { tr.phase = 'search'; } return true; }
    if (tr.phase === 'search') { k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.ShiftLeft = false; k.KeyG = true; if (tr.p.done || !N.prompt) { k.KeyG = false; tr.phase = 'return'; } return true; }
    if (tr.phase === 'return') {
      k.KeyG = false;
      if (g.mode === 'drive') { B.trip = null; B.tripCd = 4; for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) k[c] = false; return false; }
      const L = ZK.fort.local(ps2.pos);
      if (Math.abs(L.lx) < F.halfW + 2.2 && Math.abs(L.lz) < F.halfL + 2.2) { press('KeyF'); return true; }
      go(F.pos.x, F.pos.z); return true;
    }
    return false;
  }
  function botStep(dt, prof) {
    const F = ZK.fort.state;
    if (S.choosing) { S.openT = 1; S.choose(pickCard(prof)); }
    const busy = needsStep(dt, prof);
    if (!busy && g.mode === 'drive') driveStep(dt, prof, F);
    shootStep(dt, prof);
  }
  function driveStep(dt, prof, F) {
    if (B.crashed) { B.crashed = false; B.crashN++; if (R.profile !== '초보' || B.crashN >= 2) { B.revT = 0.9; B.goal = null; B.crashN = 0; } }
    if (!B.trip && (Math.random() < prof.seek * dt * 3 || B.goal)) {
      const npc = ZK.absorb.npcs.map(n => n.g.position).sort((a, c) => a.distanceTo(F.pos) - c.distanceTo(F.pos))[0];
      const car = ZK.world.cars.filter(c => c.alive && !c.truck).map(c => c.pos)   // 확성기 트럭은 덫으로 남긴다
        .sort((a, c) => a.distanceTo(F.pos) - c.distanceTo(F.pos))[0];
      B.goal = npc && npc.distanceTo(F.pos) < 45 ? npc : car && car.distanceTo(F.pos) < 35 ? car : null;
    }
    // 임무·탈출이 있으면 그쪽이 목표: 주유소·착륙장은 원 안에 서서 버티고, 숙주·도살자는 22m까지만 다가간다(들이받으면 버스가 튕김)
    let mt = ZK.mis.target(g); B.hold = false;
    // 무전: 처음 본 제안마다 위험(B)을 고를지 정하고 그쪽으로 몬다 (초보는 안 골라서 20초 뒤 A가 시작됨)
    const of = ZK.mis.offer;
    if (!of) B.offerPick = null;
    if (of && !B.trip) { if (B.offerIdx !== of.idx) { B.offerIdx = of.idx; B.offerPick = Math.random() < prof.risky ? 'b' : prof.risky > 0 ? 'a' : null; (R.radioIntent = R.radioIntent || []).push(B.offerPick || '-'); }
      if (B.offerPick) { const c = of[B.offerPick]; mt = { x: c.pos.x, z: c.pos.z, kind: 'offer' }; } }
    if (mt && !B.trip) {
      const md = Math.hypot(mt.x - F.pos.x, mt.z - F.pos.z);
      if (mt.kind === 'lz' && g.t < ZK.mis.HELI_T - 8) { const a = g.t * 0.3; B.goal = new T.Vector3(mt.x + Math.cos(a) * 16, 0, mt.z + Math.sin(a) * 16); }   // 헬기 오기 전엔 착륙장 주위를 돈다
      else if (!((mt.kind === 'host' || mt.kind === 'butcher') && md < 22)) B.goal = new T.Vector3(mt.x, 0, mt.z);
      if ((mt.kind === 'gas' && md < 5) || (mt.kind === 'lz' && g.t >= ZK.mis.HELI_T - 8 && md < 8)) B.hold = true;
    }
    // 덫 지켜보기(보통·숙련): 확성기를 켠 뒤 16초 동안 트럭에서 28m 거리로 돌며 무리가 모이길 기다렸다가 LPG를 쏜다
    if (B.trapWatch && (g.t > B.trapWatch.until || B.trapWatch.t.absorbed || !B.trapWatch.t.lpg.some(b => b.alive) || (!B.trapWatch.t.used && g.t > B.trapWatch.until - 14))) B.trapWatch = null;   // 빗나가서 안 켜졌으면 2초 뒤 포기
    if (B.trapWatch && !B.hold && !(mt && (mt.kind === 'gas' || mt.kind === 'lz' || mt.kind === 'offer'))) { const T0 = B.trapWatch.t, a = g.t * 0.5; B.goal = new T.Vector3(T0.pos.x + T0.sp.nx * 17 + Math.cos(a) * 9, 0, T0.pos.z + T0.sp.nz * 17 + Math.sin(a) * 9); }   // 트럭 앞 광장 쪽 17m를 중심으로 반경 9m (벽 밖으로 나가지 않게)
    const tgt = B.goal || new T.Vector3(Math.cos(g.t * 0.12) * 38, 0, Math.sin(g.t * 0.12) * 38);
    const fw = ZK.fort.forward(), dx = tgt.x - F.pos.x, dz = tgt.z - F.pos.z;
    const side = Math.cos(F.heading) * dx - Math.sin(F.heading) * dz, ahead = fw.x * dx + fw.z * dz;
    let steer = Math.max(-1, Math.min(1, side / 5)); if (ahead < 0) steer = side >= 0 ? 1 : -1;
    let gas = true, brake = false;
    if (prof.lookahead && B.revT <= 0) {
      const at = d => new T.Vector3(F.pos.x + fw.x * d, 0, F.pos.z + fw.z * d);
      const free = p => ZK.world.freeSpot(p.x, p.z, F.halfW + 0.3) || ZK.world.cars.some(c => c.alive && !c.truck && c.pos.distanceTo(p) < 3);   // 트럭은 '흡수할 차'로 보지 않음
      if (!free(at(F.halfL + 4))) {
        gas = F.speed < 2.5; brake = F.speed > 4;
        const rr = new T.Vector3(Math.cos(F.heading), 0, -Math.sin(F.heading)), pr = at(F.halfL + 4).addScaledVector(rr, 5), pl = at(F.halfL + 4).addScaledVector(rr, -5);
        steer = free(pr) ? 1 : free(pl) ? -1 : steer;
      }
    }
    if (B.hold) { gas = false; brake = true; B.stuckT = 0; B.revT = 0; }
    B.stuckT = !B.hold && Math.abs(F.speed) < 0.8 ? B.stuckT + dt : 0; if (B.stuckT > 1.5) { B.revT = 1.3; B.stuckT = 0; R.stuck++; }   // 일부러 서 있을 땐(B.hold) 끼임으로 안 봄
    // 끼임(움직인 거리 기준): 가속 중인데 2초 동안 1m도 못 움직이면 후진 — 벽에 붙어 앞뒤로 덜컹이며 속도만 0.5~2를 오가던 경우
    // __noUnstuck: A/B용으로 끌 수 있음 (주의: 2026-11-09 2단계 A/B 때는 이 줄이 주석에 먹혀 이 처리가 꺼져 있었다)
    if (!window.__noUnstuck && !B.hold && (B.posT -= dt) <= 0) { B.posT = 0.5; B.posH.push([F.pos.x, F.pos.z]); if (B.posH.length > 5) B.posH.shift();
      const a = B.posH[0], b = B.posH[B.posH.length - 1]; if (B.posH.length === 5 && B.revT <= 0 && k.KeyW && Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { B.revT = 1.4; B.posH.length = 0; R.unstuck = (R.unstuck || 0) + 1; } }
    if (B.revT > 0) { B.revT -= dt; k.KeyW = false; k.KeyS = true; k.Space = false; steer = -steer; }
    else if (ZK.surv.contract.has('nobrake')) { k.Space = false; k.KeyW = gas && !brake; k.KeyS = brake && F.speed > 0.5; }   // 브레이크 철거: Space는 드리프트라 S로 감속 (0 근처에서 놓아 후진하지 않게)
    else { k.KeyW = gas; k.KeyS = false; k.Space = brake; }
    k.KeyD = steer > 0.15; k.KeyA = steer < -0.15;
  }
  const F0 = () => ZK.fort.state;
  function shootStep(dt, prof) {
    // 사격: 매달린 좀비 우선, 그다음 가까운 순. 표적이 바뀌면 반응 지연 후 발사
    const G3 = ZK.gun3, gs = G3.state, cam = D.camera.position, mt = ZK.mis.target(g), mz = mt && mt.zb;
    const key = z => (z.state === 'cling' ? -100 : 0) + (z === mz ? -40 : 0) + z.pos.distanceTo(cam);   // 매달린 놈 > 임무 대상 > 가까운 순
    const z = g.zombies.filter(z => z.alive && (z.state === 'cling' || z.pos.distanceTo(cam) < (prof.quiet || 30))).sort((a, c) => key(a) - key(c))[0];
    if (z !== B.tz) { B.tz = z; B.react = prof.react; }
    B.react -= dt;
    // 자동소총: 15m 안에 5마리 이상이거나 매달린 놈이 2마리 이상이면 꺼내고, 3마리 밑이거나 탄이 없으면 리볼버로
    const crowd = g.zombies.filter(q => q.alive && q.pos.distanceTo(cam) < 15).length, rifleOk = G3.hasRifle && G3.rf.loaded + G3.rifleAmmo() > 0;
    if (rifleOk && (crowd >= 5 || F0().clingers >= 2)) { if (G3.weapon !== 'rifle') G3.switchTo('rifle'); }
    else if (G3.weapon === 'rifle' && (!rifleOk || crowd < 3)) G3.switchTo('revolver');
    if (G3.weapon === 'rifle' && G3.rf.loaded === 0 && !G3.rf.reloading && G3.rifleAmmo() > 0) G3.reload();
    // 산탄총: 8m 안이면 꺼내고 12m 밖이거나 탄이 없으면 리볼버로 (자꾸 바꾸지 않게 간격을 둠)
    if (G3.hasShotgun && z && G3.weapon !== 'rifle') { const d = z.pos.distanceTo(cam), ammo = G3.sg.loaded + G3.shells();
      if (G3.weapon === 'revolver' && d < 8 && ammo > 0) G3.switchTo('shotgun'); else if (G3.weapon === 'shotgun' && (d > 12 || ammo === 0)) G3.switchTo('revolver'); }
    if (G3.weapon === 'shotgun' && G3.sg.loaded === 0 && !G3.sg.reloading && G3.shells() > 0) G3.reload();
    if (G3.weapon === 'revolver' && gs.ammo === 0 && !gs.reloading && !(gs.auto > 0)) G3.reload();   // 탄 0인 채 멈춘 리볼버 장전
    const ready = G3.weapon === 'shotgun' ? gs.cd <= 0 && !G3.sg.reloading && G3.sg.loaded > 0 : G3.weapon === 'rifle' ? gs.cd <= 0 && !G3.rf.reloading && G3.rf.loaded > 0 : gs.cd <= 0 && !gs.reloading && gs.ammo > 0;
    // 수류탄: 9~24m에 좀비가 4m 안에 6마리 이상 뭉친 곳이 있으면 그 바닥으로 (6초에 한 번 · 나·버스에서 8m 넘게 떨어진 곳만)
    if ((B.nadeT = (B.nadeT || 0) - dt) <= 0 && (ZK.needs.inv.grenade || 0) > 0 && ZK.arms) {
      B.nadeT = 1.5;
      const near = g.zombies.filter(q => q.alive && q.state !== 'cling' && q.pos.distanceTo(cam) > 9 && q.pos.distanceTo(cam) < 24 && q.pos.distanceTo(F0().pos) > F0().halfL + 8);
      const c = near.find(q => near.filter(o => o.pos.distanceTo(q.pos) < 4).length >= 6);
      if (c) { B.nadeT = 6; const d0 = c.pos.clone().sub(cam); ps.yaw = Math.atan2(-d0.x, -d0.z); ps.pitch = Math.atan2(-cam.y, Math.hypot(d0.x, d0.z)); ps.lookYaw = ps.lookPitch = 0; ps.recP = ps.recY = 0; P.update(0.0001, { ads: false });
        if (ZK.arms.throwGrenade(g, D.camera)) R.nades = (R.nades || 0) + 1; }
    }
    // 화염병: 12m 안에 쫓아오는 좀비가 6마리 이상이면 지금 겨눈 쪽으로 (6초에 한 번)
    if ((B.molT = (B.molT || 0) - dt) <= 0 && z && (ZK.needs.inv.molotov > 0) && g.zombies.filter(q => q.alive && q.state !== 'cling' && q.pos.distanceTo(cam) < 12).length >= 6) {
      B.molT = 6; const d0 = z.torso.getWorldPosition(new T.Vector3()).sub(cam); ps.yaw = Math.atan2(-d0.x, -d0.z); ps.pitch = 0.12; P.update(0.0001, { ads: false });
      if (ZK.mis.throwMolotov(g, D.camera)) R.molotovs = (R.molotovs || 0) + 1;
    }
    // ── 6발 리듬: 장전 중 탁 닫기 (숙련도별 확률) · 가끔 너무 일찍 눌러 걸림 ──
    if (G3.weapon === 'revolver' && gs.reloading) {
      if (B.slamPlan === undefined) { const r0 = Math.random(); B.slamPlan = r0 < prof.jam ? 'early' : r0 < prof.jam + prof.slam ? 'slam' : 'none'; }
      if (B.slamPlan === 'early' && gs.rt >= 0.5) { G3.reload(); B.slamPlan = 'none'; }
      else if (B.slamPlan === 'slam' && gs.rt >= G3.slamWindow()[0] + 0.02) { G3.reload(); B.slamPlan = 'none'; }
    } else B.slamPlan = undefined;
    // ── 특수 표적 (리볼버일 때): 날아가는 시체(AIR) > 맥동하는 간판 볼트 > 좀비가 몰린 LPG > 소음이 찬 상태의 확성기 트럭 ──
    if (G3.weapon === 'revolver' && ready && gs.sprint < 0.3 && !g.zombies.some(q => q.alive && q.state === 'cling')) {   // 매달린 놈이 있으면 그쪽이 먼저
      let sp = null; const lim = prof.quiet || Infinity, Fs = F0();
      // 시야 확인: 목표 물체 앞을 다른 고정 물체(트럭·벽)가 가리면 쏘지 않는다 (좀비는 가려도 됨)
      const los = new T.Raycaster(), clearTo = (p, ok) => { const d = p.clone().sub(cam), L = d.length(); los.set(cam, d.divideScalar(L)); los.far = L + 0.5; const h = los.intersectObjects(ZK.world.solids, false)[0]; return !h || ok(h.object.userData); };
      for (const q of g.zombies) { if (!q.flying || !q.airMesh) continue; if (q.botSeen === undefined) { q.botSeen = Math.random() < prof.skeet; q.botT = g.t + prof.react; }
        if (q.botSeen && g.t >= q.botT && q.pos.distanceTo(cam) < Math.min(25, lim)) { sp = q.airMesh.getWorldPosition(new T.Vector3()); break; } }
      if (!sp) for (const sg of ZK.mis.signs || []) {   // 맥동하는(아래에 3마리+) 볼트만 · 15m 안 · 내가/버스가 낙하 범위 밖일 때
        if (sg.fall >= 0) continue; if ((g.mode === 'foot' && Math.hypot(ps.pos.x - sg.drop.x, ps.pos.z - sg.drop.z) < 3.5) || Fs.pos.distanceTo(sg.drop) < 2.8 + Fs.halfL + 1) continue;
        const b = sg.bolts.find(x => x.alive && x.mesh.material.emissiveIntensity > 0.65); if (!b) continue;
        const wp = b.mesh.getWorldPosition(new T.Vector3()); if (wp.distanceTo(cam) < Math.min(prof.boltR || 15, lim) && clearTo(wp, u => u.bolt === b)) { sp = wp; break; } }   // 숙련도별 사거리 12/20/28m
      if (!sp) for (const b of ZK.mis.barrels || []) {   // 좀비 6마리 이상 몰린 통 · 폭발 반경 + 여유 밖에서만 · 가리지 않을 때
        if (!b.alive || b.pos.distanceTo(cam) > Math.min(40, lim) || b.pos.distanceTo(Fs.pos) < b.r + 1 + Fs.halfL * 0.5 || (g.mode === 'foot' && Math.hypot(ps.pos.x - b.pos.x, ps.pos.z - b.pos.z) < b.r + 1)) continue;
        if (g.zombies.filter(q => q.alive && q.pos.distanceTo(b.pos) < 5).length < 6) continue;
        // 짐칸 위 가스통은 윗부분을 노린다
        const tp = b.pos.clone().setY(b.pos.y + (b.kind === 'lpg' ? 0.85 : 0.6)); if (clearTo(tp, u => u.barrel === b)) { sp = tp; break; } }
      if (!sp && !prof.quiet && g.noiseM >= 60 && (B.truckT = (B.truckT || 0) - dt) <= 0) for (const t of ZK.mis.trucks || []) {
        if (t.used || t.absorbed) continue; const d = t.pos.distanceTo(Fs.pos); if (d >= 22 && d <= 45 && clearTo(t.cabPos, u => u.truck === t)) { sp = t.cabPos.clone(); B.truckT = 3; R.truckShots = (R.truckShots || 0) + 1; if (prof.trapWatch && !(ZK.mis.offer && B.offerPick)) B.trapWatch = { t, until: g.t + 16 }; break; } }
      if (sp) {
        const d = sp.clone().sub(cam); ps.yaw = Math.atan2(-d.x, -d.z) + (Math.random() - 0.5) * 2 * prof.aim; ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + (Math.random() - 0.5) * 2 * prof.aim;
        ps.recP = ps.recY = 0; P.update(0.0001, { ads: false });
        dispatchEvent(new MouseEvent('mousedown', { button: 0 })); dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        return;
      }
    }
    if (z && B.react <= 0 && ready && gs.sprint < 0.3) {
      // 부위 사격: 매달린 놈은 팔(맞으면 떨어짐) · 숙주는 보이는 고름주머니 · 그 밖엔 머리/몸통
      let part = Math.random() < prof.head ? z.head : z.torso;
      if (z.state === 'cling' && Math.random() < prof.arm) { const a = z.arms.find(q => q.children.length && q.parent); if (a) part = a.children[0]; }
      if (z.T.host && z.sacs && Math.random() < prof.sac) { const sv = z.sacs.filter(q => q.visible).sort((a, c) => a.getWorldPosition(new T.Vector3()).distanceTo(cam) - c.getWorldPosition(new T.Vector3()).distanceTo(cam))[0]; if (sv) part = sv; }
      const head = part === z.head, d = part.getWorldPosition(new T.Vector3()).sub(cam);
      const aimE = prof.aim * (G3.hasScope && G3.weapon !== 'shotgun' && d.length() > 15 ? 0.5 : 1);   // 조준경: 먼 표적 조준 오차 절반 (봇은 정조준 확대를 쓰지 않으므로 이걸로 대신)
      ps.yaw = Math.atan2(-d.x, -d.z) + (Math.random() - 0.5) * 2 * aimE; ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + (Math.random() - 0.5) * 2 * aimE;
      ps.recP = ps.recY = 0; P.update(0.0001, { ads: false });
      dispatchEvent(new MouseEvent('mousedown', { button: 0 })); dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    }
  }
  window.__startRun = function (profile, seed) {
    for (const key in k) k[key] = false;
    dmgSrc = 'crash'; killSrc = null;   // 이전 판에서 끊긴 출처 표시 초기화
    Math.random = mulberry32(seed); D.start(); D.freeze(true); D.fast = true;
    R = { profile, seed, events: [], samples: [], dmg: {}, kills: {}, clingKills: 0, stuck: 0, result: '', cause: '', duration: 0, goal: 600, minHp: 1, minHpT: 0 };
    B = { stuckT: 0, revT: 0, goal: null, tz: null, react: 0, crashed: false, crashN: 0, useT: 1, trip: null, tripCd: 0, skip: new Map(), posT: 0, posH: [], hold: false, molT: 0 };
    if (g.mode === 'foot' && ZK.needs.startPack) B.trip = { p: ZK.needs.startPack, phase: 'walk', t: 0, t2: 0 };   // 걸어서 시작(B안): 출발 배낭 → 탑승
    window.__R = R; window.__lastS = -1; return 'started';
  };
  window.__continue = function (sec, dt = 1 / 30) {
    const prof = PROFILES[R.profile], F = ZK.fort.state;
    for (let i = 0; i < sec / dt && g.state === 'play'; i++) {
      botStep(dt, prof); D.tick(1, dt); if ((ZK.mis.trapN || 0) > (R.lastTrap || 0)) { R.lastTrap = ZK.mis.trapN; log('TRAP'); } const hr = F.hp / F.maxHp; if (hr < R.minHp) { R.minHp = hr; R.minHpT = Math.round(g.t); }
      if (g.t < 180 && hr <= 0) R.early = true;
      if (g.hordes !== R.lastHordes) { if (R.lastHordes !== undefined && g.hordes > R.lastHordes) { log('HORDE', g.hordeWhy); (R.hordeLog = R.hordeLog || []).push([Math.round(g.t), g.hordeWhy]); } R.lastHordes = g.hordes; }   // 포위: 소음 때문인지 시간 때문인지
      R.noiseSum = (R.noiseSum || 0) + (g.noiseM || 0) * dt;
      if (g.swarmT && g.swarmT !== R.lastSwarm) { R.lastSwarm = g.swarmT; R.swarms = (R.swarms || 0) + 1; log('SWARM'); }   // '포위됐다' 경고
      let na = 0; for (const z of g.zombies) if (z.state === 'attack') na++; if (na > (R.atkPeak || 0)) R.atkPeak = na;   // 요새를 동시에 때리려던 좀비 수 최대치
      if (Math.floor(g.t) !== R.lastSec) {   // 사망 직전 20초 기록: [초, 체력, 속도, 공격 중인 좀비 종류, 매달린 수, 1초간 출처별 피해]
        R.posH = (R.posH || []).concat([[F.pos.x, F.pos.z]]).slice(-4);   // 3초 동안 1.5m도 못 움직였는데 가속 중이면 '벽에 끼임'(봇 행동은 그대로, 기록만)
        if (R.posH.length === 4 && Math.hypot(R.posH[3][0] - R.posH[0][0], R.posH[3][1] - R.posH[0][1]) < 1.5 && k.KeyW) R.pinned = (R.pinned || 0) + 1;
        R.lastSec = Math.floor(g.t); const d = {}; for (const kk in R.dmg) { const v = Math.round(R.dmg[kk] - ((R.prevDmg || {})[kk] || 0)); if (v) d[kk] = v; } R.prevDmg = { ...R.dmg };
        R.trace = (R.trace || []).concat([[R.lastSec, Math.round(F.hp), +F.speed.toFixed(1), g.zombies.filter(z => z.state === 'attack').map(z => z.type[0]).join(''), F.clingers, d, R.pinned || 0]]).slice(-20);
      }
      if (Math.floor(g.t / 30) !== __lastS) {
        __lastS = Math.floor(g.t / 30);
        R.samples.push({ t: Math.round(g.t), kills: g.kills, hp: Math.round(F.hp), hpMax: F.maxHp, level: S.level, alive: g.zombies.filter(z => z.alive).length, mods: F.modules, gun: F.gunners.length, cling: F.clingers, noise: Math.round(g.noiseM || 0), aw: ['wander', 'alert', 'chase'].map(a => g.zombies.filter(z => z.alive && z.aware === a).length), dmg: Object.fromEntries(Object.entries(R.dmg).map(([a, v]) => [a, Math.round(v)])) });
      }
    }
    R.duration = +g.t.toFixed(1);
    R.rhythm = Object.assign({}, ZK.gun3.state.stat); R.skeet = { air: g.airN || 0, strike: g.strikeN || 0, tiers: Object.assign({}, g.tierN || {}) }; R.traps = { trucks: ZK.mis.truckOn || 0, traps: ZK.mis.trapN || 0, signs: ZK.mis.signDrops || 0 }; R.perfectN = g.perfectN || 0;
    R.parts = { helmet: g.helmetN || 0, sac: g.sacN || 0, drop: g.dropN || 0 };
    if (ZK.arms) { const a = ZK.arms.stats; R.arms = { trips: R.armsTrips || 0, opened: a.opened.slice(), openT: a.openT.slice(), scopeT: a.scopeT, rifleT: a.rifleT, nades: a.nades, nadeKills: a.nadeKills, rifleShots: a.rifleShots, rifleKills: a.rifleKills, selfNade: Math.round(a.hpLostFoot) }; } R.radio = { picked: ZK.mis.list.map(m => (m.risky ? 'B' : 'A') + ':' + m.how), intent: R.radioIntent || [], risky: ZK.mis.riskyDone || 0 }; R.contracts = [...ZK.surv.contract];
    R.dread = ZK.dread && ZK.dread.stats ? Object.assign({}, ZK.dread.stats, { mech: ZK.dread.mech }) : null;   // 공포 디렉터: 발견·덮치기·아슬아슬·지침·고위협 시간
    R.chasers = g.chasers || 0; R.searched = ZK.needs.searched; R.mis = ZK.mis.list.map(m => m.kind + (m.risky ? '!' : '') + ':' + m.state); R.misDone = ZK.mis.done; R.shotgun = ZK.gun3.hasShotgun; { const s2 = ZK.needs.s; R.endNeeds = [Math.round(s2.fuel), Math.round(s2.hunger), Math.round(s2.thirst), Math.round(s2.fatigue), Math.round(s2.infection)]; } R.meleeCut = Math.round(g.meleeCut || 0);   // 근접 피해 상한이 막아 준 피해
    if (g.state !== 'play' && !R.saved) { R.saved = true; R.result = g.state === 'win' ? 'win' : 'lose'; R.cause = g.overWhy || ''; window.__runs.push(R); }
    return R.profile + R.seed + ' ' + g.state + '@' + R.duration;
  };
  window.__runOne = function (profile, seed) { __startRun(profile, seed); let s; for (let i = 0; i < 4 && g.state === 'play'; i++) s = __continue(200); return s; };
  window.__export = function (title) {
    const keep = ['OVERKILL', 'CHAIN', 'LEVELUP', 'ELITE_KILL', 'RESCUE', 'ABSORB', 'CRATE', 'CRASH', 'RALLY', 'BURST', 'CHASER_SPAWN', 'SWARM', 'PERFECT', 'TRAP'];
    const runs = __runs.map(r => {
      const ev = [], seen = new Set(), fk = r.events.find(e => e[1] === 'KILL'); if (fk) ev.push([+fk[0].toFixed(1), 'KILL']);
      for (const e of r.events) { if (!keep.includes(e[1])) continue; const kk = e[1] + Math.floor(e[0]); if (e[1] !== 'LEVELUP' && seen.has(kk)) continue; seen.add(kk); ev.push([+e[0].toFixed(1), e[1]]); }
      return { profile: r.profile, seed: r.seed, duration: r.duration, goal: 600, result: r.result, cause: r.result === 'lose' ? (r.cause || '?') : '', events: ev,
        min_hp: +r.minHp.toFixed(3), min_hp_t: r.minHpT, chasers: r.chasers || 0, chaser_kills: r.chaserKills || {},
        rhythm: r.rhythm, skeet: r.skeet, traps: r.traps, truck_shots: r.truckShots || 0,
        missions: r.mis || [], missions_done: r.misDone || 0, stars: (r.result === 'win' ? 2 : 0) + Math.min(3, r.misDone || 0) + Math.min(3, (r.radio && r.radio.risky) || 0), parts: r.parts, arms: r.arms, radio: r.radio, contracts: r.contracts || [], molotovs: r.molotovs || 0, shotgun: !!r.shotgun,
        trips: r.trips || 0, searched: r.searched || 0, uses: r.uses || 0, foot_sec: Math.round(r.footT || 0), zero_need_sec: Math.round(r.zeroNeed || 0), fuel_zero_sec: Math.round(r.fuelZero || 0), infected_at: r.infectedAt || null, unstuck: r.unstuck || 0, end_needs: r.endNeeds,
        death_trace: r.result === 'lose' ? r.trace : undefined, hordes: r.hordeLog || [], noise_avg: r.duration ? +((r.noiseSum || 0) / r.duration).toFixed(1) : 0, crash_head: r.crashHead || 0, crash_scrape: r.crashScrape || 0, capped_hits: r.capped || 0, swarm_warnings: r.swarms || 0, pinned_sec: r.pinned || 0, melee_cut: r.meleeCut || 0, warn_to_death: r.result === 'lose' && r.lastSwarm ? +(r.duration - (r.lastSwarm - 30)).toFixed(1) : undefined, attack_peak: r.atkPeak || 0,
        raw_counts: r.events.reduce((m, e) => (m[e[1]] = (m[e[1]] || 0) + 1, m), {}),
        kills_by_source: r.kills, cling_kills: r.clingKills, damage_by_source: Object.fromEntries(Object.entries(r.dmg).map(([a, v]) => [a, Math.round(v)])),
        samples: r.samples.map(s => ({ t: s.t, kills: s.kills, hp: s.hp, hpMax: s.hpMax, level: s.level, cling: s.cling, noise: s.noise, aware: s.aw, dmg: s.dmg })) };
    });
    return JSON.stringify({ game: title || '좀비킬', reward_types: ['KILL'], big_moment_types: ['PERFECT', 'TRAP', 'OVERKILL', 'CHAIN', 'LEVELUP', 'ELITE_KILL', 'RESCUE', 'CRATE'], levelup_type: 'LEVELUP', runs });
  };
  // 한 판을 끝까지: 도구 호출 한 번이 20초를 넘지 않게 60초씩 진행하고, 못 끝내면 'PARTIAL' → 같은 인자로 다시 부르면 이어서
  window.__go = (p, sd) => { if (!R || R.saved || R.profile !== p || R.seed !== sd) __startRun(p, sd); return __continue(60); };
  window.__sum = () => [R.profile + R.seed + ' ' + R.result + '@' + R.duration, 'minHp ' + R.minHp.toFixed(2) + '@' + R.minHpT, 'capped ' + (R.capped || 0), 'cut ' + (R.meleeCut || 0),
    'atkPeak ' + R.atkPeak, 'swarm ' + (R.swarms || 0), 'hordes ' + (R.hordeLog || []).map(h => h[0] + (h[1] === 'noise' ? 'n' : 't')).join(','), 'pinned ' + (R.pinned || 0) + 's', 'trips ' + (R.trips || 0) + '/found ' + ZK.needs.searched, 'zero ' + Math.round(R.zeroNeed || 0) + 's', 'fuel0 ' + Math.round(R.fuelZero || 0) + 's', 'foot ' + Math.round(R.footT || 0) + 's', 'end ' + JSON.stringify(R.endNeeds), 'why ' + (g.overWhy || ''), 'mis ' + (R.mis || []).join(','), 'rhythm ' + JSON.stringify(ZK.gun3.state.stat), 'air ' + (g.airN || 0) + ' strike ' + (g.strikeN || 0) + ' tiers ' + JSON.stringify(g.tierN || {}), 'traps ' + JSON.stringify({ t: ZK.mis.truckOn, trap: ZK.mis.trapN, sign: ZK.mis.signDrops }), 'stars ' + ((g.state === 'win' ? 2 : 0) + Math.min(3, ZK.mis.done) + Math.min(3, ZK.mis.riskyDone || 0)), 'arms ' + JSON.stringify(ZK.arms ? { o: ZK.arms.stats.opened.length, rk: ZK.arms.stats.rifleKills, nk: ZK.arms.stats.nadeKills, n: ZK.arms.stats.nades } : {}), 'parts ' + JSON.stringify({ h: g.helmetN, s: g.sacN, d: g.dropN }), 'radio ' + ZK.mis.list.map(m => (m.risky ? 'B' : 'A') + m.how[0]).join(','), 'contract ' + [...ZK.surv.contract].join('+'), 'crash ' + (R.crashHead || 0) + '/' + (R.crashScrape || 0),
    JSON.stringify(Object.fromEntries(Object.entries(R.dmg).map(([a, v]) => [a, v | 0])))].join(' | ');
  window.__fullS = (p, sd, key = '__runsB') => {
    const t0 = performance.now(); let s;
    while (!(R && R.profile === p && R.seed === sd && R.saved) && performance.now() - t0 < 20000) s = __go(p, sd);
    if (R.saved) { try { localStorage.setItem(key, JSON.stringify(__runs)); } catch (e) {} return __sum(); }
    return 'PARTIAL ' + s;
  };
  // 5초씩 끊어 돌리기 (도구 호출이 'Internal error'로 끊기지 않게): 같은 인자로 다시 부르면 이어서
  window.__step = (p, sd, ms = 5000) => {
    if (!R || R.saved || R.profile !== p || R.seed !== sd) __startRun(p, sd);
    const t0 = performance.now(); while (!R.saved && performance.now() - t0 < ms) __continue(5);
    if (R.saved) { try { localStorage.setItem(window.__runKey || '__runsC', JSON.stringify(__runs)); } catch (e) {} return __sum(); }   // 배치마다 __runKey로 저장 칸을 나눔
    return 'PARTIAL ' + g.t.toFixed(0);
  };
  return 'harness ready';
})();
