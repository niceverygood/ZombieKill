// 메인: 이동 요새 서바이벌 — 요새 운전 + 지붕에서 리볼버(1인칭) · 하차(F)해서 걷기 · 들이받기 · 흡수 성장 · 레벨업 카드
// 10분 생존 · 사방 포위 웨이브 · 엘리트(덩치) · 레이더 · HUD
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const DMG = 34, WIN_T = 600;
  const glc = document.getElementById('gl'), hud = document.getElementById('hud'), h = hud.getContext('2d');
  const renderer = new T.WebGLRenderer({ canvas: glc, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.autoClear = false;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 220); scene.add(camera);
  const muzzleLight = new T.PointLight(0xffb060, 0, 24, 1.5); scene.add(muzzleLight);   // 손맛: 섬광이 더 멀리 거리·좀비를 비춘다
  const boomLight = new T.PointLight(0xff4020, 0, 14, 1.6); scene.add(boomLight);
  ZK.world.build(scene); ZK.tower.init(scene); ZK.fx3.init(scene); ZK.gun3.init(camera); ZK.player.init(camera, glc); ZK.char.init(scene); ZK.fort.init(scene); ZK.absorb.init(scene); ZK.needs.init(scene); ZK.mart.init(scene); ZK.police.init(scene); ZK.mis.init(scene); ZK.raid.init(scene); ZK.bail.init(scene); ZK.arms.init(scene);
  const fpp = () => ZK.player.state.mode === 'fpp', S = () => ZK.surv.stats, F = ZK.fort.state, ps = ZK.player.state;
  ps.mountPos = new T.Vector3(); ps.mountVel = new T.Vector3();
  let W = 0, H = 0, dpr = 1;
  function resize() {
    W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); ZK.gun3.resize(W, H);
    hud.width = W * dpr; hud.height = H * dpr;
  }
  resize(); addEventListener('resize', resize);
  const _r = new T.Vector3();
  ZK.panFor = p => { _r.set(1, 0, 0).applyQuaternion(camera.quaternion); return clamp(p.clone().sub(camera.position).normalize().dot(_r), -1, 1) * 0.85; };

  const g = { state: 'title', mode: 'drive', zombies: [], chainQ: [], tracers: [], notices: [], player: ZK.player };
  function resetGame() {
    for (const z of g.zombies) z.dispose();
    Object.assign(g, { zombies: [], chainQ: [], tracers: [], notices: [], hp: 100, regenT: 0, kills: 0, heads: 0, shots: 0, hits: 0, rams: 0,
      combo: 0, comboT: 0, bestCombo: 0, bestChain: 0, t: 0, spawnT: 1, hordeClock: 0, hordeWhy: '', noiseM: 0, noisePeak: null, rings: [], driveNoiseT: 0, recycleT: 2, sight: 12, bruteT: 60, carT: 15, hitT: 0, hitType: 'hit', hurtA: 0, overT: 0, overWhy: '', zapCd: 0, clingNoticed: false, finalWave: false, chaserT: 0, chasers: 0, hordes: 0, atk: new Map(), melee: 0, meleeT: 0, swarmT: 0, meleeCut: 0, deathBy: '', stuckH: [], stuckS: 0, stuckHint: 0, airN: 0, strikeN: 0, perfectN: 0, tierN: { crush: 0, launch: 0, shred: 0 }, quietT: 0, forceHorde: false, helmetN: 0, sacN: 0, dropN: 0, lastRamT: 0, blackout: false });
    if (g.clearSplats) g.clearSplats(); ZK.Zombie3.clearDebris();
    ZK.world.resetCars();   // 폐차 원위치 (트럭은 아래 mis.reset이 다시 놓는다) — 예전엔 직전 판 차 배치로 시작했다
    g.batSwings = g.batHits = g.batKills = 0; g.batHitT = 0;   // 방망이 집계 (판마다 — 예전엔 안 지워져 판 사이에 쌓였다)
    g.shakeT = 0; g.shakeCd = 0; g.shakeN = 0; g.hordeCapped = 0; g.stuckCut = 0;   // 털어내기 · 포위 상한 · 끼임 상한 횟수 (실력 맞춤 디렉터) — g.bailT 초기화는 아래 bail 리셋 줄에 있다
    ZK.fx3.reset(); ZK.inv.reset(); ZK.player.reset(); ZK.gun3.reset(); ZK.fort.reset(); ZK.absorb.reset(); ZK.surv.reset(); ZK.needs.reset(); ZK.mis.reset(g); ZK.arms.reset(g); ZK.mart.reset(g); ZK.police.reset(g); ZK.dread.reset(); ZK.tide.reset(); ZK.raid.reset(); ZK.torch.reset(); ZK.bail.reset(); ZK.tower.reset(g); g.bailT = -99; g.chaserWarn = null; g.lastHorde = null; setNight(0); ZK.world.lightsOn();
    // B안: 버스 옆에 걸어서 시작 → 옆 배낭을 G로 챙기고(시작 꾸러미) → F로 탑승해 출발. 내리기·뒤지기·타기를 처음 30초에 배운다
    g.mode = 'foot'; ps.mounted = false; ps.pos.set(4.4, 0, 4.2); ps.vel.set(0, 0, 0); ps.yaw = Math.PI; ps.pitch = -0.12; g.tutor = 1; g.lastHeading = F.heading;
    for (let i = 0; i < 6; i++) spawn('walker', new T.Vector3(rand(-10, 10), 0, rand(-40, -25)), 'wander');   // 처음 6마리는 배회: 총을 쏘면 몰려온다
    notice('배낭을 챙겨라 — 노란 고리에서 F', '#ffd23a');
    g.metaDone = false; ZK.meta.applyStart(g);   // 해금한 시작 보너스(장갑 버스·사수 동승·산탄총·특성)
  }
  const hemi = scene.children.find(o => o.isHemisphereLight), amb = scene.children.find(o => o.isAmbientLight), base = [hemi ? hemi.intensity : 1, amb ? amb.intensity : 0.35];
  function setNight(k) {
    g.nightK = k; g.sight = 12 + 5 * k;
    if (scene.fog) { let d = 0.02 + 0.022 * k; if (ZK.mart && ZK.mart.darkOn) d = Math.max(d, 0.075); if (ZK.police && ZK.police.darkOn) d = Math.max(d, 0.07); scene.fog.density = d; }   // 건물 안(마트·경찰서)의 어둠은 밤·정전이 와도 유지
    if (hemi) hemi.intensity = base[0] * (1 - 0.5 * k); if (amb) amb.intensity = base[1] * (1 - 0.5 * k);
  }
  function mount() { g.mode = 'drive'; ps.mounted = true; ps.yaw = F.heading; ps.pitch = -0.08; if (ZK.gun3.weapon === 'bat') ZK.gun3.switchTo('revolver'); }   // 방망이는 걸어서만
  function dismount() { g.mode = 'foot'; ps.mounted = false; ps.pos.copy(ZK.fort.sidePoint()); ps.vel.set(0, 0, 0); }
  function nearFort(p, pad) { const L = ZK.fort.local(p); return Math.abs(L.lx) < F.halfW + pad && Math.abs(L.lz) < F.halfL + pad; }
  g.mountFort = () => { mount(); ZK.needs.onMount(g); };   // 버스 탈출(bail3d): 시동 건 차에 바로 탄다

  // ───────── 좀비·요새가 부르는 훅 ─────────
  // 2탄 타워: 길찾기가 반환값을 감싼다 (타워 안이면 계단·복도 경로 점, 같은 구간이면 플레이어)
  g.targetFor = z => { let t = baseTarget(z); if (ZK.tower) t = ZK.tower.routeTarget(z, t); if (ZK.mart && ZK.mart.routeTarget) t = ZK.mart.routeTarget(z, t); return ZK.police && ZK.police.routeTarget ? ZK.police.routeTarget(z, t) : t; };   // 1탄 마트: 진열대 사이 길 지도
  function baseTarget(z) {
    if (g.mode === 'foot') { const d = z.pos.distanceTo(ps.pos); if (ZK.bail.wrecked || d < 16 || d < z.pos.distanceTo(F.pos)) return { x: ps.pos.x, z: ps.pos.z, kind: 'player' }; }   // 버스가 터졌으면 모두 나를 쫓는다
    const n = ZK.fort.nearestPoint(z.pos); return { x: n.x, z: n.z, kind: 'fort' };
  };
  g.hurtTarget = function (dmg, z, tg) {
    if (g.state !== 'play') return;
    if (tg.kind === 'player') return hurtPlayer(dmg, z);
    if (!tg.quiet && !atkSlot(z)) return;
    let amt = tg.quiet ? dmg : dmg * 0.55;   // 땅에서 때리는 좀비는 장갑 버스에 55%만 (멈추면 즉사하던 문제 완화)
    if (z.T.chaser) { ZK.fort.hurt(amt); return hitFx(z, tg); }   // 추격자는 일부러 만든 6분 이후 위기라 상한에서 뺀다 (체력 35% 미만이면 무리가 안 옴)
    // 근접 피해 상한: 최근 1초 피해(지수 평균 ≈ 초당 피해)가 MELEE_CEIL을 넘으면 그 뒤 타격은 20%만
    // (덩치 4 + 좀비 30마리 포위에 초당 130 → 4초 만에 320이 녹던 급사 → 상한 뒤엔 약 초당 55, 6초 이상 버팀)
    // 끼였을 때(W를 누르는데 2초 동안 1.2m도 못 감 → '막혔다' 안내 중)는 상한을 20으로 낮춘다 (2026-11-10)
    // 끼임 급사 3건(초보 210·235초, 숙련 231초): 4~6초 동안 공격 중 좀비 14~21마리, 지상 18~27/초 + 매달림 6~17/초가 상한 35 언저리라
    // 상한이 거의 안 걸리고 200HP가 5~6초에 녹았다 — 조작이 막힌 순간의 죽음은 플레이어의 선택이 아니다
    const cur = g.melee * Math.exp(-(g.t - g.meleeT)), ceil = g.stuckHint > 0 ? MELEE_CEIL_STUCK : MELEE_CEIL;
    if (cur > ceil) { g.meleeCut += amt * 0.8; amt *= 0.2; if (g.stuckHint > 0) g.stuckCut = (g.stuckCut || 0) + 1; }
    ZK.fort.hurt(amt);
    g.melee = cur + amt; g.meleeT = g.t;
    // 초당 25를 넘으면 경고 — 체력이 녹는 걸 HUD 숫자로만 알다가 갑자기 죽지 않게 (30초에 한 번)
    if (g.mode === 'drive' && g.melee > 25 && g.t > g.swarmT) { g.swarmT = g.t + 30; notice('포위됐다! 체력이 녹는다 — 매달린 놈부터 쏘고 빠져나가라', '#ff3b3b'); }
    hitFx(z, tg);
  };
  const MELEE_CEIL = 35, MELEE_CEIL_STUCK = 20;
  function hitFx(z, tg) {
    if (!tg.quiet) ZK.audio.barricade(ZK.panFor(z.pos));
    if (g.mode === 'drive') { ZK.fx3.trauma(tg.quiet ? 0.015 : 0.06); g.hurtA = Math.min(1, g.hurtA + (tg.quiet ? 0.05 : 0.15)); if (!tg.quiet) ZK.fx3.punch(-0.004, 0, rand(-0.012, 0.012), 0); }
  };
  // 땅에서 요새를 때리는 좀비는 동시에 ATK_CAP마리까지만 피해를 준다. 나머지는 휘두르기만 하고 '차례를 기다림'
  // (멈춘 버스를 20마리가 한꺼번에 때려 4초 만에 300이 녹던 급사 방지 · 위의 초당 피해 상한과 함께 작동)
  // 자리는 마지막으로 때린 지 1.3초가 지나거나 그 좀비가 죽으면 비고, 매달린 좀비·추격자는 따로 센다
  const ATK_CAP = 8;
  function atkSlot(z) {
    for (const [k, t] of g.atk) if (g.t - t > 1.3 || !k.alive) g.atk.delete(k);
    if (!g.atk.has(z) && g.atk.size >= ATK_CAP) return false;
    g.atk.set(z, g.t); return true;
  }
  // 계약을 받은 순간: 한 줄 안내 + 정전이면 바로 밤
  ZK.surv.onContract = function (u) {
    const msg = { lone: '외로운 총잡이 — 사수들이 장갑판이 됐다. 이제 7발이다', nobrake: '브레이크 철거 — Space는 드리프트, 감속은 S로만', blackout: '정전 — 가로등이 꺼졌다. 끝까지 밤이다', nitro: '직분사 부스트 — Shift가 버스 체력을 태운다 · 뒤에 불꽃 꼬리', blood: '혈액 연료 엔진 — 쳐야 달린다 (로드킬마다 연료 +1.2)' }[u.id];
    if (u.id === 'blackout') g.blackout = true;
    notice('계약: ' + msg, '#ff5a4a'); ZK.audio.thud(); ZK.fx3.trauma(0.2);
  };
  g.onCling = function () { if (!g.clingNoticed) { g.clingNoticed = true; notice('좀비가 요새에 매달렸다! 쏴서 떨어뜨려라', '#ff6a4a'); } };
  function hurtPlayer(dmg, z) {
    if (!ZK.bail.hurtGate()) return;   // 버스에서 튕겨 나온 직후 1.2초 무적 · 시동 중 물리면 0.4초 되돌림
    g.hp -= dmg; g.regenT = 4; g.hurtA = Math.min(1, g.hurtA + 0.55);
    ZK.needs.onBite(g);   // 걸어 다닐 때 물리면 출혈·감염 (버스 위는 안전지대)
    ZK.fx3.trauma(0.28); ZK.audio.flesh(false, ZK.panFor(z.pos)); ZK.audio.thud();
    ZK.fx3.punch(-0.02, rand(-0.02, 0.02), ZK.panFor(z.pos) > 0 ? -0.05 : 0.05, 0); ZK.fx3.flash(190, 0, 0, 0.3, 0.22);   // 물리면 맞은 쪽으로 고개가 꺾이고 화면이 붉게 번쩍
    ps.vel.addScaledVector(ps.pos.clone().sub(z.pos).setY(0).normalize(), 4);
  }
  g.ramZombie = function (z, dmg, dir) {
    const p = z.pos.clone().setY(1.1);
    if (z.T.heavy) { // 덩치·숙주·도살자는 들이받으면 요새가 튕겨 멈춘다 (피해 20)
      ZK.fort.state.speed *= -0.2; ZK.fort.hurt(20); ZK.fx3.trauma(0.45); ZK.audio.thud(); ZK.audio.barricade(0);
      ZK.fx3.punch(-0.04, 0, rand(-0.05, 0.05), -0.16); ZK.fx3.flash(255, 240, 220, 0.14, 0.08); ZK.fx3.hitstop(0.05);   // 덩치에 박음: 몸이 앞으로 쏠리며 '쾅'
      const r = z.hit('body', p, dir, Math.round(dmg * 0.5), { explosion: true }); z.kv.addScaledVector(dir, 3);
      ZK.fx3.number(p.clone().setY(2.6), Math.round(dmg * 0.5), 'body'); if (r && r.killed) onKill(z, false, 0, 99, 'ram');
      return;
    }
    const res = z.hit('body', p, dir, Math.round(dmg), { explosion: true });
    if (!res) return;
    if (!S().grinder) ZK.fort.hurt(z.type === 'runner' ? 1 : 2);   // 들이받기 반동: 좀비를 칠 때마다 요새도 조금씩 상함 (분쇄 범퍼면 없음)
    if (res.killed) {
      // 로드킬 속도 3단: 초속 4.5 미만 '깔아뭉개기'(폭발 없음) · 4.5~9.5 '날리기'(공중에서 쏘면 AIR) · 9.5 이상 '분쇄'(몸 폭발)
      // 예전엔 모든 로드킬이 폭발이라 무뎌지고 상시 빅 모먼트가 됐다 → 폭발은 부스트로 달릴 때의 보상
      const Fs = ZK.fort.state, v = Math.abs(Fs.speed), flying = g.zombies.reduce((n, q) => n + (q.flying ? 1 : 0), 0);
      const tier = (Fs.boost && v >= 9.5) || (v >= 4.5 && flying >= 6) ? 'shred' : v >= 4.5 ? 'launch' : 'crush';   // 분쇄는 부스트 중일 때만
      g.rams++; g.noise('ram', p); g.tierN = g.tierN || { crush: 0, launch: 0, shred: 0 }; g.tierN[tier]++;
      if (tier === 'shred') { z.explode(); ZK.audio.gibBurst(ZK.panFor(p)); ZK.fx3.trauma(0.14); ZK.fx3.hitstop(0.03); ZK.fx3.punch(-0.012, 0, rand(-0.02, 0.02), -0.05); ZK.fx3.number(p.clone().setY(2), dmg, 'chain'); }
      else if (tier === 'launch') {   // 앞 + 옆(좀비가 있던 쪽)×0.9 방향으로 띄움: 수평 v×1.15 · 수직 3+0.35v → 0.5~0.7초 체공, 최고점 2.0~2.4m
        const L = ZK.fort.local(z.pos), right = new T.Vector3(Math.cos(Fs.heading), 0, -Math.sin(Fs.heading)), d2 = dir.clone().setY(0).normalize().addScaledVector(right, (L.lx >= 0 ? 1 : -1) * 0.9).normalize();
        const vel = d2.multiplyScalar(v * 1.15); vel.y = 3 + 0.35 * v; z.launch(vel);
        ZK.audio.flesh(false, ZK.panFor(p)); ZK.audio.thud(); ZK.fx3.trauma(0.07); ZK.fx3.punch(-0.006, 0, rand(-0.01, 0.01), -0.03); ZK.fx3.number(p.clone().setY(2), dmg, 'body');
      } else {   // 깔아뭉개기: 우지끈 · 진행 방향으로 늘어진 핏자국 · 버스가 살짝 덜컹(속도 ×0.94)
        const fw = ZK.fort.forward(); ZK.fx3.pool(z.pos.x + fw.x * 0.9, z.pos.z + fw.z * 0.9, 1.8); ZK.fx3.pool(z.pos.x + fw.x * 2, z.pos.z + fw.z * 2, 1.1);
        ZK.audio.bodyFall(1.2, ZK.panFor(p)); ZK.audio.flesh(false, ZK.panFor(p)); ZK.fx3.trauma(0.05); ZK.fx3.punch(-0.005, 0, 0, -0.02); Fs.speed *= 0.94;
      }
      ZK.fort.trophy && ZK.fort.trophy(g.rams);   // 그릴 트로피: 15·40·80회째 앞 장갑이 검붉어지고 팔·머리가 걸린다
      onKill(z, false, 0, 99, 'ram');
      // 로드킬 연속: 1.2초 안에 이어서 치면 ×N — 3마리부터 글자·흔들림이 커진다
      g.ramN = g.t - (g.ramLast || -9) < 1.2 ? (g.ramN || 0) + 1 : 1; g.ramLast = g.t;
      if (g.ramN >= 3) { ZK.fx3.text(p.clone().setY(3), `ROADKILL ×${g.ramN}`, '#ffb24a', 30 + Math.min(16, g.ramN * 2), 0.7); ZK.fx3.trauma(0.18); }
      if (S().grinder) g.blast(p, 3.2, 90, 'ram');   // 분쇄 범퍼: 주변 폭발
    } else { z.kv.addScaledVector(dir, 7); ZK.fx3.number(p.clone().setY(2), dmg, 'body'); }
  };
  g.autoShot = function (from, z, dmg, kind) {
    const head = kind === 'gunner' && Math.random() < 0.2, tp = (head ? z.head : z.torso).getWorldPosition(new T.Vector3());
    const dir = tp.clone().sub(from).normalize();
    g.tracers.push({ a: from, b: tp, t: 0.05, col: kind === 'cannon' ? '255,140,60' : '160,220,255' });
    if (kind === 'cannon') { ZK.audio.thud(); ZK.fx3.smoke(from, dir); }
    g.noise(kind === 'cannon' ? 'cannon' : 'gunner', from);
    const res = z.hit(head ? 'head' : 'body', tp, dir, Math.round(dmg * (head ? 2 : 1) * (z.T.chaser ? 0.5 : 1)), {});   // 추격자는 자동 무기에 절반
    if (res && res.killed) onKill(z, head, res.overkill, 0, kind);
  };
  g.auraHit = function (z, dmg, kind) {
    const p = z.pos.clone().setY(1.1), dir = p.clone().sub(F.pos).setY(0.3).normalize();
    if (kind === 'shock') { ZK.fx3.sparks(p, dir, 5); if ((g.zapCd -= 0.1) <= 0) { g.zapCd = 0.5; ZK.audio.zap(ZK.panFor(p)); } }
    const res = z.hit('body', p, dir, z.T.chaser ? Math.round(dmg * 0.5) : dmg, { explosion: true });
    if (res && res.killed) onKill(z, false, res.overkill, 0, kind === 'fire' ? 'fire' : 'aura');   // 화염병·드럼통 불길 처치는 경험치 온전히
  };
  g.onAbsorb = function (kind, pos) {
    const p = pos.clone().setY(2.6);
    if (kind === 'car') { ZK.audio.absorb(); ZK.fx3.trauma(0.25); ZK.fx3.sparks(p, new T.Vector3(0, 1, 0), 14); ZK.fx3.text(p, '+장갑판', '#8fd18f', 34, 1.0); ZK.needs.onCar(); }   // 폐차 흡수: 연료 +3
    if (kind === 'survivor') { ZK.audio.levelUp(); ZK.fx3.text(p, '생존자 합류!', '#7dff9a', 32, 1.2); notice(F.gunners.length >= 4 ? '사수 4명 — 만원! 이제 생존자는 장갑판이 된다' : `사수 ${F.gunners.length}명`, '#7dff9a'); }
    if (kind === 'survivorFull') { ZK.audio.absorb(); ZK.fx3.text(p, '+장갑판', '#8fd18f', 26, 0.8); }
    if (kind === 'survivorFood') { ZK.audio.absorb(); ZK.fx3.text(p, '+통조림·생수', '#ffd27a', 26, 0.8); }   // 외로운 총잡이: 생존자는 식량을 두고 간다   // 사수 만원: 팡파르 없이 작게
    // 보급 상자 (2026-11-09 카드 과다): 카드는 50%만, 나머지 50%는 무기 보급(산탄총이 있으면 산탄 4, 없으면 화염병 1)
    // 덩치를 판당 8~9마리 잡아 상자 카드만 8~9장이 쏟아지던 것을 줄인다
    if (kind === 'crate') { ZK.audio.absorb();
      if (Math.random() < 0.5) { ZK.surv.grant(1); ZK.fx3.text(p, '보급품!', '#ffd23a', 32, 1.0); }
      else { const sh = ZK.gun3.hasShotgun; ZK.needs.give(sh ? 'shell' : 'molotov', sh ? 4 : 1); ZK.fx3.text(p, sh ? '보급품 — 산탄 +4' : '보급품 — 화염병 +1', '#ffd23a', 28, 1.0); }
      if (Math.random() < 0.6) { ZK.needs.give('anti'); ZK.fx3.text(p.clone().setY(3.3), '+항생제', '#9aff5a', 26, 1.0); } }   // 항생제는 덩치 보급 상자에서만
  };
  g.onCrash = function (speed, hitN = speed) {   // 정면 충돌은 크게 흔들고 '쾅', 비스듬히 긁으면 가볍게
    const head = hitN > 5; ZK.fx3.trauma(head ? Math.min(0.6, hitN * 0.06) : 0.12); if (head) { ZK.audio.thud(); g.noise('crash', F.pos); } ZK.audio.barricade(0);
  };
  g.onNotice = (t, col) => notice(t, col);

  // ───────── 소음 ─────────
  // 소음 사건 = [반경 m, 게이지 증가]. 반경 안의 배회·경계 좀비는 그 자리로 걸어오고(경계 20초),
  // 게이지(0~100, 초당 −0.8)가 100이 되면 포위 무리가 가장 큰 소리가 난 곳을 둘러싼다 → '쏠까 말까'의 대가
  // 사수·포탑·주행처럼 플레이어가 끌 수 없는 소리는 게이지를 조금만 올린다(합쳐도 초당 약 0.6 < 감소 0.8):
  // 예전 값(사수 0.15 · 포탑 0.4 · 주행 0.25)은 사격을 멈춰도 게이지가 계속 올라 '조용히 하면 덜 온다'가 성립하지 않았다
  // 사수·포탑 반경은 18·25 → 12·18m: 자동 무기가 주변을 다 깨우면 몰래 지나갈 틈이 없었다(1분 뒤 추적 83%)
  const NOISE = { bat: [6, 0.04], revolver: [35, 1.2], cannon: [18, 0.15], gunner: [12, 0.05], crash: [25, 2], burst: [20, 0.5], ram: [14, 0.3], search: [10, 0.4], shotgun: [40, 2], barrel: [30, 3], speaker: [45, 0], molotov: [20, 1.5], siren: [35, 2.5], boost: [18, 0.8], drive: [8, 0.15], idle: [4, 0.05], footstep: [9, 0.03], cache: [16, 0.8], grenade: [50, 3], rifle: [45, 0.9] };   // 무기 보급함 비틀기 · 수류탄 · 자동소총(연사라 한 발 게이지는 작게)   // footstep: 걸어 다닐 때 질주 발소리(L7, 0.45초마다)
  g.noise = function (kind, pos) {
    if (g.state !== 'play') return;
    const [r, gain] = NOISE[kind];
    g.noiseM = Math.min(100, g.noiseM + gain);
    if (gain > 0 && (!g.noisePeak || r >= g.noisePeak.r)) g.noisePeak = { x: pos.x, z: pos.z, r };   // 게이지를 안 올리는 소리(확성기)는 포위 위치가 되지 않는다
    const last = g.rings[g.rings.length - 1];
    if (kind === 'rifle' && last && last.kind === 'rifle' && last.t > 0.5) { last.x = pos.x; last.z = pos.z; last.t = 0.9; }   // 연사는 원 하나를 갱신 (다른 소음 원을 밀어내지 않게)
    else if (r >= 14) { g.rings.push({ x: pos.x, z: pos.z, r, t: 0.9, kind }); if (g.rings.length > 10) g.rings.shift(); }   // 레이더에 그릴 소음 원
    const r2 = r * r;
    for (const z of g.zombies) {
      if (!z.alive || z.aware === 'chase' || z.retreat) continue;   // 물러나는 무리(해일 고요)는 소리에 돌아오지 않는다
      const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z;
      const d2 = dx * dx + dz * dz; if (d2 >= r2) continue;
      if (z.sleep && (SLEEP_DEAF[kind] || d2 > (z.hearR ? z.hearR(kind) ** 2 : 324))) continue;   // z.hearR: 소리별 깨는 반경을 따로 쓰는 경비(1탄 마트)   // 잠든 무기고 경비: 자동 무기·주행 소리엔 안 깨고, 18m 안의 플레이어 소리에만 깬다(L5)
      z.aware = 'alert'; z.alertPos.set(pos.x, 0, pos.z); z.alertT = 20;
    }
  };
  const SLEEP_DEAF = { cannon: 1, gunner: 1, drive: 1, idle: 1, ram: 1, boost: 1 };
  function notice(text, col = '#fff') { g.notices.unshift({ text, col, t: 3 }); g.notices.length = Math.min(4, g.notices.length); ZK.audio.notice(); }

  // ───────── 입력 ─────────
  let mouseL = false, mouseR = false;
  glc.addEventListener('click', () => {
    ZK.audio.init();
    if (g.state === 'title' || ((g.state === 'over' || g.state === 'win') && g.overT > 1.2)) { resetGame(); g.state = 'play'; }
    else if (g.state === 'pause') g.state = 'play';
    const fallback = () => { ps.locked = true; };
    try { const pr = glc.requestPointerLock && glc.requestPointerLock(); if (pr && pr.catch) pr.catch(fallback); else if (!pr) setTimeout(() => { if (!document.pointerLockElement) fallback(); }, 300); }
    catch (e) { fallback(); }
  });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && g.state === 'play' && !ZK.surv.choosing) { g.state = 'pause'; mouseL = mouseR = false; } });
  addEventListener('mousedown', e => {
    if (g.state !== 'play') return;
    if (ZK.surv.choosing) { if (e.button === 0) ZK.surv.onClick(); return; }
    if (e.button === 0) { mouseL = true; if (ZK.inv.throwSel && !ZK.inv.open) ZK.inv.throwNow(g, camera); else if (!ZK.inv.holdFire()) shoot(); } if (e.button === 2) mouseR = true;   // 5로 투척무기를 들었으면 좌클릭 = 던지기 · Tab 소지품 창이 열려 있으면 안 쏜다 (inv3d)
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
  addEventListener('mousemove', e => { if (ZK.surv.choosing) ZK.surv.onMouse(e.movementX || 0); });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && !e.repeat && g.state === 'play' && !ZK.surv.choosing) { g.state = 'pause'; mouseL = mouseR = false; document.exitPointerLock && document.exitPointerLock(); return; }   // 마우스가 잠기지 않은 채(대체 모드)여도 ESC로 일시정지 → 설정 패널이 열린다(settings3d). 잠겨 있으면 브라우저가 ESC를 먹고 pointerlockchange로 온다
    if (g.state === 'play' && ZK.surv.choosing) { if (!e.repeat) ZK.surv.onKey(e.code); return; }   // 카드 화면: 누르고 있던 Space(드리프트)·D의 키 반복으로 카드(특히 되돌릴 수 없는 계약)가 저절로 골라지지 않게
    if (e.code === 'KeyR' && !e.repeat && g.state === 'play') ZK.gun3.reload();   // 키 반복 무시: 누르고 있거나 연타로 탁 닫기가 공짜로 되지 않게
    if (e.code === 'KeyN') ZK.audio.toggleMute();   // 음소거 (M은 배그처럼 지도 — city3d)
    if (e.code === 'KeyP' && g.state === 'title') ZK.meta.cyclePerk();   // 해금한 특성 고르기
    if (e.code === 'KeyG' && g.state === 'play' && !e.repeat) {   // 버스 타기·내리기 = G (차는 G · 줍기·상호작용은 F로 바로 — 사용자 요청 2026-11-10)
      if (g.mode === 'drive') { const lim = ZK.surv.contract.has('nobrake') ? 1.67 : 3; if (Math.abs(F.speed) < lim) dismount(); else notice(lim < 3 ? '브레이크가 없다 — S로 시속 6km 아래까지 줄여야 내린다' : '속도를 줄여야 내릴 수 있다', '#ccc'); }   // 브레이크 철거: 시속 11 → 6km
      else if (!ZK.bail.wrecked && nearFort(ps.pos, 2.5)) { mount(); ZK.needs.onMount(g); if (g.tutor) { g.tutor = 0; notice('출발! WASD 운전 · 마우스로 조준 · 총소리는 좀비를 부른다', '#7dff9a'); } }
    }
    if (e.code === 'KeyH' && g.state === 'play' && !e.repeat && !ZK.surv.choosing) ZK.needs.useBest(g);   // 가장 급한 것부터 사용
    if (g.state === 'play' && !e.repeat && !ZK.surv.choosing) {
      if (e.code === 'KeyX' && g.mode === 'drive') { ps.yaw = F.heading; ps.lookYaw = 0; }   // 버스 앞쪽 보기
      // 무기 1~5 · 소모품 7~0 · Tab 소지품 · 휠 순환은 배그식 키 배치로 inv3d.js가 받는다 (T·B 즉시 던지기는 5번 투척무기 칸으로 옮겼다)
    }
  });

  // ───────── 사격 (관통 지원) ─────────
  const ray = new T.Raycaster();
  // 부위 사격 알림: 고름주머니 · 숙주 무릎 · 매달린 놈 떨어뜨림
  function partNotes(z, res, p) {
    if (res.sac) { g.sacN++; ZK.fx3.text(p.clone().add(new T.Vector3(0, 0.6, 0)), '고름주머니!', '#9aff4a', 26, 0.7);
      if (z.kneel && !z.kneelShown) { z.kneelShown = true; ZK.fx3.text(z.pos.clone().setY(4.2), '숙주가 무릎 꿇었다 — 피해 ×1.6', '#9aff4a', 30, 1.3); ZK.fx3.trauma(0.2); } }
    if (res.dropped) { g.dropN++; ZK.fx3.text(p.clone().add(new T.Vector3(0, 0.5, 0)), '떨어뜨렸다!', '#ff8a4a', 22, 0.6); }
  }
  function shoot() {
    if (ZK.gun3.weapon === 'bat' && g.mode !== 'foot') ZK.gun3.switchTo('revolver');   // 버스·새 차 위: 방망이는 닿지 않는다
    const fired = ZK.gun3.fire(); if (!fired) return;
    if (fired === 'bat') { g.batHitT = ZK.gun3.BAT_HIT; g.batSwings = (g.batSwings || 0) + 1; ZK.player.kick(0.006, rand(-0.01, 0.01)); return; }   // 맞는 건 휘두른 지 0.12초 뒤 (batHit)
    if (fired === 'shotgun') return shootShotgun();
    if (fired === 'rifle') return shootRifle();
    g.shots++; g.noise('revolver', camera.position); ZK.needs.onShot();
    // 6발 리듬: 달군 탄(퍼펙트 보상) · 탁 닫기 뒤 첫 발(퍼짐 절반)
    const hot = ZK.gun3.takeHot(), steady = ZK.gun3.takeSteady(), railed = !!S().headBurst;
    const sp = ZK.player.spread() * (steady ? 0.5 : 1), adsK = ps.adsK || 0;
    const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * sp;
    const dir = new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(ZK.player.aimQuat());   // 흔들림을 뺀 진짜 조준
    // 피로 70+: 반동 +20% (예전엔 이 주석이 줄 끝의 흔들림 코드를 삼켜 리볼버 화면 흔들림이 빠져 있었다)
    const rk = ZK.needs.recoilK(); ZK.player.kick(rand(0.03, 0.04) * (1 - adsK * 0.35) * rk, rand(-0.009, 0.009) * rk);
    // 손맛: 한 발마다 화면이 위로 '탁' 튀고 뒤로 밀린다(펀치) · 총구 불빛이 거리를 크게 밝히고 화면이 잠깐 따뜻하게 번쩍
    ZK.fx3.trauma(hot ? 0.26 : 0.2); ZK.fx3.punch(0.02 * (1 - adsK * 0.4), rand(-0.006, 0.006), rand(-0.016, 0.016), 0.055 * (1 - adsK * 0.5));
    ZK.fx3.flash(255, hot ? 150 : 190, hot ? 60 : 110, 0.085 * (1 - adsK * 0.3), 0.07);
    const mz = ZK.gun3.muzzleWorld(); muzzleLight.position.copy(mz); muzzleLight.intensity = hot ? 12 : 9; ZK.fx3.smoke(mz, dir);
    ray.set(ZK.player.aimOrigin(), dir); ray.far = 160;
    const targets = ZK.world.solids.slice();
    for (const z of g.zombies) { if (z.alive) { for (const m of z.hitMeshes) if (m.userData.part !== 'none') targets.push(m); } else if (z.flying && z.airMesh) targets.push(z.airMesh); }
    const hits = ray.intersectObjects(targets, false);
    let left = 1 + S().pierce + (hot && !railed ? 1 : 0), end = null, mark = 'miss'; const done = new Set();
    const markHit = part => { if (mark !== 'head') mark = part === 'head' ? 'head' : 'body'; };
    for (const hit of hits) {
      const ud = hit.object.userData;
      if (ud.part === 'air') { if (ud.z.flying) { g.airHit(ud.z); markHit('body'); g.hits++; } end = hit.point; if (--left <= 0) break; continue; }   // 날아가는 시체 → AIR
      if (!ud.z && ud.barrel) { ZK.mis.blowBarrel(ud.barrel, g, 'player'); markHit('body'); end = hit.point; break; }   // 드럼통·LPG 명중 → 폭발
      if (!ud.z && ud.truck) { if (ZK.mis.hitTruck(ud.truck, g)) markHit('body');   // 이미 쓴 트럭은 빗나감(벽)과 같다
        end = hit.point; ZK.fx3.sparks(hit.point, dir.clone().negate(), 6); break; }   // 확성기 트럭 켜기
      if (!ud.z && ud.bolt) { ZK.mis.hitBolt(ud.bolt, g); markHit('body'); end = hit.point; break; }   // 간판 볼트 끊기
      if (!ud.z) { const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new T.Vector3(0, 1, 0);
        ZK.fx3.hole(hit.point, n, n.y > 0.7); ZK.audio.ground(ZK.panFor(hit.point)); end = hit.point; break; }
      if (done.has(ud.z) || !ud.z.alive) continue; done.add(ud.z);
      // 부위 사격: 머리 ×headMul · 팔·다리 ×0.75 · 고름주머니는 숙주 최대 HP 12% (zombie3d가 정함)
      const z = ud.z, head = ud.part === 'head', limb = ud.part === 'arm' || ud.part === 'leg', dmg = Math.round(DMG * S().dmgMul * (head ? S().headMul : limb ? 0.75 : 1) * rand(0.96, 1.04) * (hot ? (railed ? 1.25 : 1.4) : 1));
      g.hits++;
      const res = z.hit(ud.part, hit.point, dir, dmg, { mesh: hit.object }); if (!res) continue;
      markHit(res.helmet ? 'body' : ud.part);   // 안전모 도탄은 머리 명중으로 치지 않는다
      if (res.helmet) { ZK.fx3.text(hit.point.clone().add(new T.Vector3(0, 0.5, 0)), '팅! 안전모', '#ffc81a', 24, 0.6); ZK.fx3.hitstop(0.05); g.hitT = g.hitMax = 0.15; g.hitType = 'hit'; g.helmetN++; end = hit.point; break; }   // 도탄: 탄은 거기서 멈춘다
      partNotes(z, res, hit.point);
      ZK.fx3.hitstop(head ? 0.08 : 0.045, !head);   // 손맛: 머리 80ms · 몸통 명중은 minor(예산 규칙에선 안 멈춤 — fx3d F.hitstop)
      if (!res.killed) { ZK.fx3.impact(hit.point, head ? 'head' : 'body'); ZK.fx3.punch(0.004, 0, rand(-0.006, 0.006), 0); }
      ZK.fx3.number(hit.point.clone().add(new T.Vector3(0, 0.3, 0)), res.dealt, head ? 'head' : 'body');
      g.hitT = g.hitMax = res.killed || head ? 0.3 : 0.16; g.hitType = res.killed ? (head ? 'head' : 'kill') : 'hit';
      if (res.killed) { if (head) ZK.fx3.text(hit.point.clone().add(new T.Vector3(0, 0.6, 0)), 'HEADSHOT', '#ffd23a', 38, 0.8); killJuice(head, hit.point); onKill(z, head, res.overkill, 0, 'player'); }
      end = hit.point; if (--left <= 0) break;
    }
    g.tracers.push({ a: mz, b: end ? end.clone() : camera.position.clone().addScaledVector(dir, 160), t: 0.06, col: hot ? '255,130,40' : undefined });
    // 6발째에 판정: 클린은 HUD 실린더 옆 작은 표시만, 퍼펙트(6/6 헤드샷)만 큰 연출 (빅 모먼트를 늘리지 않게)
    const verdict = ZK.gun3.mark(mark);
    if (verdict === 'perfect') { const fw = new T.Vector3(); camera.getWorldDirection(fw); ZK.fx3.text(camera.position.clone().addScaledVector(fw, 6), `PERFECT — 달군 탄 ${ZK.gun3.cap}발`, '#ff8a2a', 40, 1.2); ZK.fx3.trauma(0.25); ZK.audio.levelUp(); g.perfectN = (g.perfectN || 0) + 1; }
  }
  // ── 손맛: 내가 직접 쏴서 죽였을 때의 처치 확인 연출 (리볼버·산탄총만. 사수·포탑·들이받기는 제외) ──
  // 몸 처치: 히트스톱 65ms · 붉은 테두리 번쩍 · 묵직한 '턱' · 화각 살짝 당김 · 명중 섬광
  // 헤드샷 처치: 히트스톱 100ms · 금빛 테두리 + 흰 번쩍 · 줌 펀치 · 0.2초 동안 반쯤 느려짐(1.4초에 한 번만 — 연사할 때 늘어지지 않게)
  // ── 야구 방망이 (기본 무기, 4번 · 걸어서만): 휘두른 지 0.12초 뒤 앞 110° · 2.1m 안의 좀비 최대 3마리를 친다 ──
  // 피해 45 × 카드 피해 배율 (머리 ×1.6 — 조준점이 머리 쪽이면) · 크게 밀쳐내고 0.75초 비틀거리게(덩치·도살자는 조금만) · 소리는 6m · 피로 +0.6
  // 같은 층만 친다(타워 계단: 높이 차 1.2m 안). 버스에 매달린 놈은 2.8m 높이까지 닿고, 맞으면 떨어진다
  const BAT_DMG = 45, BAT_R = 2.1, BAT_COS = Math.cos(55 * Math.PI / 180);
  function batHit() {
    if (g.state !== 'play' || g.mode !== 'foot' || ZK.gun3.weapon !== 'bat') return;
    const eye = camera.position, fw = new T.Vector3(); camera.getWorldDirection(fw);
    const fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl, hp = new T.Vector3(), cand = [];
    for (const z of g.zombies) {
      if (!z.alive) continue;
      const dy = z.pos.y - ps.pos.y; if (dy < -1.2 || dy > (z.state === 'cling' ? 2.8 : 1.2)) continue;
      const dx = z.pos.x - eye.x, dz = z.pos.z - eye.z, dd = Math.hypot(dx, dz) || 1e-3, d = dd - 0.3 * (z.T.scale || 1);
      if (d > BAT_R) continue;
      if (dd > 0.6 && (dx * fx + dz * fz) / dd < BAT_COS) continue;
      cand.push({ z, d });
    }
    cand.sort((a, b) => a.d - b.d);
    ZK.needs.s.fatigue = Math.min(100, ZK.needs.s.fatigue + 0.6);
    g.noise('bat', ps.pos);
    if (!cand.length) return;
    let hitAny = false, killedHead = false, kp = null;
    for (const { z } of cand.slice(0, 3)) {
      const hm = z.hitMeshes.find(m => m.userData.part === 'head');
      const headP = hm ? hm.getWorldPosition(hp).clone() : z.pos.clone().setY(z.pos.y + 1.6 * (z.T.scale || 1));
      const toH = headP.clone().sub(eye).normalize(), head = toH.dot(fw) > Math.cos(16 * Math.PI / 180);   // 조준점이 머리 쪽(16° 안)이면 머리
      const point = head ? headP : z.pos.clone().setY(z.pos.y + 1.1 * (z.T.scale || 1));
      const dir = new T.Vector3(z.pos.x - ps.pos.x, 0, z.pos.z - ps.pos.z).normalize(); dir.y = 0.12;
      const heavy = !!z.T.heavy, wasCling = z.state === 'cling';
      const dmg = Math.round(BAT_DMG * S().dmgMul * (head ? 1.6 : 1) * rand(0.95, 1.05));
      const res = z.hit(head ? 'head' : 'body', point, dir, dmg, {}); if (!res) continue;
      hitAny = true; g.batHits = (g.batHits || 0) + 1;
      if (res.helmet) { ZK.fx3.text(point.clone().add(new T.Vector3(0, 0.4, 0)), '퍽! 안전모', '#ffc81a', 22, 0.6); continue; }   // 방망이는 안전모를 벗겨 낸다
      if (wasCling && !res.killed && z.state === 'cling') z.dropOff();
      if (!res.killed) { z.kv.addScaledVector(dir, heavy ? 1.2 : 6); z.stagger = Math.max(z.stagger, heavy ? 0.3 : 0.75); z.leanV -= heavy ? 3 : 10; ZK.fx3.impact(point, head ? 'head' : 'body'); }
      ZK.fx3.number(point.clone().add(new T.Vector3(0, 0.3, 0)), res.dealt, head ? 'head' : 'body');
      g.hitT = g.hitMax = res.killed || head ? 0.3 : 0.16; g.hitType = res.killed ? (head ? 'head' : 'kill') : 'hit';
      if (res.killed) { g.batKills = (g.batKills || 0) + 1; if (head) killedHead = true; kp = point; onKill(z, head, res.overkill, 0, 'player'); }
    }
    if (!hitAny) return;
    ZK.audio.slam && ZK.audio.slam(); ZK.fx3.hitstop(0.07); ZK.fx3.trauma(0.22);   // 나무가 '딱' 하고 박히는 소리(장전 탁 닫기 소리를 빌림) — 살 소리는 z.hit이 낸다 ZK.fx3.punch(0.012, rand(-0.008, 0.008), rand(-0.02, 0.02), 0.03);
    if (kp) killJuice(killedHead, kp);
  }
  function killJuice(head, p) {
    ZK.audio.killConfirm && ZK.audio.killConfirm(head); ZK.fx3.impact(p, head ? 'head' : 'kill');
    if (head) {
      ZK.fx3.hitstop(0.1); ZK.fx3.trauma(0.24); ZK.fx3.punch(0.012, rand(-0.01, 0.01), Math.random() < 0.5 ? -0.03 : 0.03, 0);
      ZK.fx3.flash(255, 205, 70, 0.42, 0.22, 'edge'); ZK.fx3.flash(255, 250, 230, 0.12, 0.06); ZK.player.fovKick(-4);
      if (ZK.fx3.time - (g.hsSlowT ?? -9) > 1.4) { g.hsSlowT = ZK.fx3.time; ZK.fx3.slowmo(0.4, 0.2); }
    } else {
      ZK.fx3.hitstop(0.065); ZK.fx3.trauma(0.14); ZK.fx3.punch(0.006, 0, rand(-0.018, 0.018), 0);
      ZK.fx3.flash(210, 20, 20, 0.26, 0.16, 'edge'); ZK.player.fovKick(-1.6);
    }
  }
  // src: 'player'(리볼버·그 연쇄) · 'ram' · 'gunner' · 'cannon' · 'aura'
  function onKill(z, head, overkill, depth, src = 'player', air = false) {
    ZK.mis.onKill(z, g);
    g.kills++; g.combo++; g.comboT = 2.2; g.bestCombo = Math.max(g.bestCombo, g.combo);
    if (head) g.heads++;
    ZK.audio.killTick(g.combo);
    const auto = src === 'gunner' || src === 'cannon' || src === 'aura';
    ZK.surv.addXP((z.T.xp || 1) * (auto ? 0.5 : 1));                       // 자동 무기 처치는 경험치 절반
    if (z.type === 'brute') { ZK.absorb.spawnCrate(z.pos.clone()); notice('덩치 처치! 보급품 드롭', '#ffd23a'); }
    const C = ZK.surv.contract;
    if (src === 'ram') { g.lastRamT = g.t; if (C.has('blood')) ZK.needs.s.fuel = Math.min(100, ZK.needs.s.fuel + 1.2); }   // 혈액 연료 엔진
    if (src === 'player' && head && depth === 0 && C.has('lone') && ZK.gun3.weapon === 'revolver') { const gs = ZK.gun3.state; if (!gs.reloading && gs.ammo < ZK.gun3.cap) { gs.ammo++; gs.auto = -1; /* 이미 걸린 자동 장전을 취소해야 +1발이 살아 있다 */ ZK.fx3.text(camera.position.clone().add(camera.getWorldDirection(new T.Vector3()).multiplyScalar(4)).add(new T.Vector3(0.6, -0.5, 0)), '+1발', '#ffd23a', 18, 0.5); } }   // 외로운 총잡이: 헤드샷 처치마다 1발 즉시 장전
    if (src === 'player' && head && depth === 0 && F.gunners.length) {      // 지휘: 내 헤드샷 → 사수 3초간 연사 2배
      if (!(F.rally > 0)) ZK.fx3.text(z.pos.clone().setY(2.4), '집중 사격!', '#7dff9a', 24, 0.7);
      F.rally = 3;
    }
    // 시체 폭발(오버킬)은 플레이어 사격으로 시작된 경우만 → '잭팟'의 가치를 지킨다
    if (src === 'player' && depth < 12 && (overkill >= z.maxHp * S().okThresh || (head && depth === 0 && S().headBurst && ZK.gun3.weapon === 'revolver'))) g.chainQ.push({ t: depth === 0 ? 0.13 : 0.07, z, dmg: overkill * 0.8, depth: depth + 1, air });
  }
  function processChain(dt) {
    for (let i = g.chainQ.length - 1; i >= 0; i--) {
      const q = g.chainQ[i]; if ((q.t -= dt) > 0) continue;
      g.chainQ.splice(i, 1); const z = q.z; if (z.remove) continue;
      const c = z.pos.clone().setY(1.1);
      z.explode(); ZK.audio.gibBurst(ZK.panFor(c)); g.noise('burst', c);
      // 주변 피해를 먼저 계산 → 같이 날린 좀비가 있을 때만 'OVERKILL!' 큰 연출 (혼자 터지면 피·살점만, 흔들림 작게)
      // 매 헤드샷마다 배너가 뜨면 둔감해져서(분당 빅 모먼트 8~13회) 잭팟의 가치를 지키려고 나눴다
      let took = 0;
      for (const o of g.zombies) {
        if (!o.alive || Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) > 2.8 * S().okRadius) continue;   // 수평 거리: 큰 버스 위(4m)에서 죽은 매달린 놈의 폭발도 바로 아래 좀비에 닿게
        const dir = o.pos.clone().sub(z.pos).setY(0.2).normalize(), p = o.pos.clone().setY(1.2);
        const res = o.hit('body', p, dir, Math.round(q.dmg), { explosion: true });
        ZK.fx3.number(p.clone().setY(1.9), q.dmg, 'chain');
        if (res && res.killed) { took++; onKill(o, false, res.overkill, q.depth, 'player', q.air); }
      }
      // 연출 3단(루프 L4): 큰 연출·배너는 연쇄 3단계부터 또는 같이 날린 좀비 3마리부터 · 2단계/2마리는 '중간'(흔들림·히트스톱만, 배너 없음)
      // (예전 기준 2단계/2마리는 숙련 분당 빅 모먼트 6~9로 판 내내 배너가 떴다 → 목표 2~4)
      const big = q.depth >= 3 || took >= 3, mid = !big && (q.depth === 2 || took === 2), near =
        Math.max(0.3, 1 - c.distanceTo(camera.position) / 25);
      boomLight.position.copy(c); boomLight.intensity = big ? 5 : mid ? 3.5 : 2.2;
      ZK.fx3.trauma(big ? Math.min(0.6, 0.3 * near + q.depth * 0.04) : mid ? 0.2 * near : 0.1 * near); ZK.fx3.hitstop(big ? 0.06 : mid ? 0.035 : 0.02, !big && !mid /* 작은 연쇄는 minor */);
      if (big) { ZK.fx3.punch(0.01, 0, rand(-0.03, 0.03), 0.04 * near); ZK.fx3.flash(255, 90, 40, 0.18 * near, 0.16, 'edge'); ZK.player.fovKick(2.5 * near); ZK.audio.duck && ZK.audio.duck(0.5, 0.35); }
      g.bestChain = Math.max(g.bestChain, q.depth);
      if (big && !(g.quietT > 0)) ZK.fx3.text(c.clone().setY(2.2), q.depth >= 3 ? `CHAIN ×${q.depth}` : `OVERKILL! ×${took + 1}`, q.depth >= 3 ? '#ff3b3b' : '#ff8a2a', 34 + q.depth * 5 + Math.min(10, took * 3), 0.9);
      if (q.depth >= (q.air ? 4 : 3)) ZK.fx3.slowmo(0.3, 0.5);   // AIR에서 시작된 연쇄는 4단계부터 슬로모
    }
  }

  // ───────── 웨이브 디렉터 ─────────
  // ── 임무·드럼통·화염병이 쓰는 도우미 ──
  g.spawnZ = (type, pos, aware) => spawn(type, pos, aware);
  g.fireHit = (z, dmg) => g.auraHit(z, dmg, 'fire');
  g.boom = function (pos, power = 1) {   // 큰 폭발 연출: 빛 · 흔들림 · 히트스톱 · 저음
    const near = Math.max(0.3, 1 - pos.distanceTo(camera.position) / 40);
    boomLight.position.copy(pos).setY(1.6); boomLight.intensity = 6 * power; ZK.fx3.trauma(Math.min(0.75, 0.45 * power * near)); ZK.fx3.hitstop(0.07);
    ZK.fx3.punch(0.03 * near, 0, rand(-0.05, 0.05) * near, 0.12 * near); ZK.fx3.flash(255, 150, 60, 0.3 * near * Math.min(1.2, power), 0.22); ZK.player.fovKick(5 * near); ZK.audio.duck && ZK.audio.duck(0.8, 0.6);   // 손맛: 폭풍이 얼굴을 때린다
    ZK.audio.thud(); ZK.audio.gibBurst(ZK.panFor(pos)); ZK.fx3.sparks(pos.clone().setY(1), new T.Vector3(0, 1, 0), 24); ZK.fx3.smoke(pos.clone().setY(1), new T.Vector3(0, 1, 0));
  };
  g.blast = function (pos, r, dmg, src = 'player', depth = 50, air = false) {   // depth 50 = 연쇄 없음 · AIR는 depth 0으로 넘겨 연쇄 허용   // 반경 피해: 가까울수록 세고, 죽으면 몸이 통째로 터진다
    let kills = 0;
    for (const z of g.zombies) {
      if (!z.alive) continue; const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z); if (d > r) continue;
      const dir = z.pos.clone().sub(pos).setY(0.4).normalize(), res = z.hit('body', z.pos.clone().setY(1.2), dir, Math.round(dmg * (1 - d / r * 0.5)), { explosion: true });
      z.kv.addScaledVector(dir, 9);
      if (res && res.killed) { kills++; const nq = g.chainQ.length; onKill(z, false, res.overkill, depth, src, air); if (g.chainQ.length === nq && !z.remove && z.state !== 'cling') z.explode(); }   // 연쇄에 들어간 몸은 processChain이 터뜨린다
    }
    if (kills >= 2) ZK.fx3.text(pos.clone().setY(3.2), `×${kills}`, '#ff8a2a', 30 + kills * 3, 0.8);
    return kills;
  };
  // ── 로드킬 스키트 ──
  // AIR: 날아가는 시체를 쏘면 공중 폭발 → 반경 2.8m에 40 + 최대HP×0.6 (작은 노란 'AIR' + 히트스톱 40ms)
  g.airHit = function (z) {
    if (!z.flying) return; z.flying = false;
    const c = z.pos.clone(), ground = c.clone().setY(0);
    z.explode(); ZK.audio.gibBurst(ZK.panFor(c)); ZK.fx3.hitstop(0.06); ZK.fx3.trauma(0.16); ZK.fx3.punch(0.01, 0, rand(-0.02, 0.02), 0.03); ZK.fx3.flash(255, 225, 80, 0.2, 0.14, 'edge'); ZK.audio.killConfirm && ZK.audio.killConfirm(false);
    ZK.fx3.text(c.clone().setY(c.y + 0.9), 'AIR', '#ffe14a', 26, 0.6); boomLight.position.copy(c); boomLight.intensity = 2.5;
    g.airN = (g.airN || 0) + 1; g.blast(ground, 2.8 * S().okRadius, Math.round(40 + 0.6 * z.maxHp), 'player', 0, true);   // 플레이어 오버킬로 취급 → 연쇄 가능
  };
  // 볼링: 날아가는 시체가 서 있는 좀비를 스치면 피해 35 + 0.9초 넘어짐 · 한 시체로 3마리 이상이면 작은 'STRIKE'
  g.bowl = function (f, o) {
    const dir = f.fv.clone().setY(0).normalize(), res = o.hit('body', o.pos.clone().setY(1.1), dir, 35, { explosion: true });
    o.stagger = 0.9; o.kv.addScaledVector(dir, 5); f.strikes++;
    if (res && res.killed) onKill(o, false, res.overkill, 50, 'ram');
    if (f.strikes === 3) { ZK.fx3.text(o.pos.clone().setY(2.4), 'STRIKE', '#ffd23a', 24, 0.6); g.strikeN = (g.strikeN || 0) + 1; }
  };
  // 벽치기: 수평 초속 5m 이상으로 벽에 부딪힌 시체는 세로 핏자국을 남긴다 (최대 60개, 판 끝까지)
  const splatTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},0,${Math.random() * 10},${0.5 + Math.random() * 0.4})`; x.beginPath(); x.arc(32 + (Math.random() - 0.5) * 30, 26 + (Math.random() - 0.5) * 26, 4 + Math.random() * 12, 0, 6.283); x.fill(); }
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(110,0,4,0.7)'; x.fillRect(20 + Math.random() * 24, 30, 2 + Math.random() * 3, 20 + Math.random() * 14); }
    return new T.CanvasTexture(c); })();
  const splats = [];
  g.wallSplat = function (p, nx, nz) {
    const l = Math.hypot(nx, nz) || 1, m = new T.Mesh(new T.PlaneGeometry(1.5, 2), new T.MeshBasicMaterial({ map: splatTex, transparent: true, depthWrite: false }));
    m.position.set(p.x - nx / l * 0.28, Math.max(1, p.y), p.z - nz / l * 0.28); m.lookAt(m.position.x + nx, m.position.y, m.position.z + nz); scene.add(m); splats.push(m);
    if (splats.length > 60) { const o = splats.shift(); scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
    ZK.audio.splatter && ZK.audio.splatter(8, 0.3, 0.3, ZK.panFor(p));
  };
  g.clearSplats = () => { for (const o of splats) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); } splats.length = 0; };
  // 산탄총: 8알을 한꺼번에 쏴서 맞은 좀비별로 피해를 합친다 (가까우면 한 방에 몸이 터진다)
  // 자동소총 (무기 보급함): 한 발 24 · 머리 ×2.2 · 팔다리 ×0.75 · 관통 없음 · 6발 리듬에는 안 들어감(리볼버의 것)
  // 리볼버 카드(매그넘 탄 등)는 받지 않는다 — 소총은 '주워 온 힘'이고, 탄이 떨어지면 끝
  function shootRifle() {
    g.shots++; g.noise('rifle', camera.position); ZK.needs.onShot(); ZK.arms.stats.rifleShots++;
    const sp = ZK.player.spread(), adsK = ps.adsK || 0, a = rand(0, 6.283), r = Math.sqrt(Math.random()) * sp;
    const dir = new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(ZK.player.aimQuat());
    const rk = ZK.needs.recoilK(); ZK.player.kick(rand(0.008, 0.013) * (1 - adsK * 0.4) * rk, rand(-0.006, 0.006) * rk, 0.25);   // 연사라 화각 펀치·퍼짐 누적은 1/4
    ZK.fx3.trauma(0.05); ZK.fx3.punch(0.006 * (1 - adsK * 0.4), rand(-0.003, 0.003), rand(-0.005, 0.005), 0.02);
    const mz = ZK.gun3.muzzleWorld(); muzzleLight.position.copy(mz); muzzleLight.intensity = 6;
    ray.set(ZK.player.aimOrigin(), dir); ray.far = 140;
    const targets = ZK.world.solids.slice();
    for (const z of g.zombies) { if (z.alive) { for (const m of z.hitMeshes) if (m.userData.part !== 'none') targets.push(m); } else if (z.flying && z.airMesh) targets.push(z.airMesh); }
    let end = null;
    for (const hit of ray.intersectObjects(targets, false)) {
      const ud = hit.object.userData;
      if (ud.part === 'air') { if (!ud.z.flying) continue; g.airHit(ud.z); g.hits++; end = hit.point; break; }
      if (!ud.z && ud.barrel) { ZK.mis.blowBarrel(ud.barrel, g, 'player'); end = hit.point; break; }
      if (!ud.z && ud.truck) { ZK.mis.hitTruck(ud.truck, g); ZK.fx3.sparks(hit.point, dir.clone().negate(), 4); end = hit.point; break; }
      if (!ud.z && ud.bolt) { ZK.mis.hitBolt(ud.bolt, g); end = hit.point; break; }
      if (!ud.z) { const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new T.Vector3(0, 1, 0); ZK.fx3.hole(hit.point, n, n.y > 0.7); end = hit.point; break; }
      if (!ud.z.alive) continue;
      const z = ud.z, head = ud.part === 'head', limb = ud.part === 'arm' || ud.part === 'leg', dmg = Math.round(24 * (head ? 2.2 : limb ? 0.75 : 1) * rand(0.95, 1.05));
      g.hits++; end = hit.point;
      const res = z.hit(ud.part, hit.point, dir, dmg, { mesh: hit.object }); if (!res) break;
      if (res.helmet) { ZK.fx3.text(hit.point.clone().add(new T.Vector3(0, 0.5, 0)), '팅!', '#ffc81a', 18, 0.4); g.helmetN++; break; }
      partNotes(z, res, hit.point);
      if (!res.killed) ZK.fx3.impact(hit.point, head ? 'head' : 'body');
      ZK.fx3.number(hit.point.clone().add(new T.Vector3(0, 0.3, 0)), res.dealt, head ? 'head' : 'body');
      g.hitT = g.hitMax = res.killed ? 0.22 : 0.1; g.hitType = res.killed ? (head ? 'head' : 'kill') : 'hit';
      if (res.killed) { ZK.arms.stats.rifleKills++; if (head) ZK.fx3.hitstop(0.04); onKill(z, head, res.overkill, 0, 'player'); }
      break;   // 관통 없음
    }
    g.tracers.push({ a: mz, b: end ? end.clone() : camera.position.clone().addScaledVector(dir, 140), t: 0.04, col: '255,225,150' });
  }
  function shootShotgun() {
    g.shots++; g.noise('shotgun', camera.position); ZK.needs.onShot(); ZK.needs.onShot();
    const rk = ZK.needs.recoilK(); ZK.player.kick(rand(0.085, 0.1) * rk, rand(-0.02, 0.02) * rk); ZK.fx3.trauma(0.42);
    // 손맛: 리볼버보다 훨씬 크게 — 어깨를 치는 펀치 · 화각 확 넓어짐 · 화면 번쩍 · 넓은 저음
    ZK.fx3.punch(0.05, rand(-0.012, 0.012), rand(-0.04, 0.04), 0.14); ZK.player.fovKick(4); ZK.fx3.flash(255, 180, 90, 0.16, 0.09); ZK.audio.shotgunBoom && ZK.audio.shotgunBoom();
    const mz = ZK.gun3.muzzleWorld(), fwd = new T.Vector3(); camera.getWorldDirection(fwd);
    muzzleLight.position.copy(mz); muzzleLight.intensity = 15; ZK.fx3.smoke(mz, fwd);
    const targets = ZK.world.solids.slice();
    for (const z of g.zombies) { if (z.alive) { for (const m of z.hitMeshes) if (m.userData.part !== 'none') targets.push(m); } else if (z.flying && z.airMesh) targets.push(z.airMesh); }
    const per = new Map(), sp = 0.075 + ZK.player.spread() * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * sp, dir = new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(ZK.player.aimQuat());
      ray.set(ZK.player.aimOrigin(), dir); ray.far = 60;
      const hit = ray.intersectObjects(targets, false).find(h => h.object.userData.part !== 'air' || h.object.userData.z.flying); let end = null;   // 이미 터진 시체의 공중 판정은 건너뜀
      if (hit) { const ud = hit.object.userData; end = hit.point;
        if (ud.part === 'air') { if (ud.z.flying) g.airHit(ud.z); }
        else if (ud.barrel) ZK.mis.blowBarrel(ud.barrel, g, 'player');
        else if (ud.truck) ZK.mis.hitTruck(ud.truck, g);
        else if (ud.bolt) ZK.mis.hitBolt(ud.bolt, g);
        else if (ud.z && ud.z.alive) { const head = ud.part === 'head', limb = ud.part === 'arm' || ud.part === 'leg', fall = clamp(1 - (hit.distance - 10) / 22, 0.25, 1), e = per.get(ud.z) || { dmg: 0, head: false, part: 'body', point: hit.point, dir, mesh: hit.object };
          e.dmg += 22 * S().dmgMul * fall * (head ? 1.5 : limb ? 0.75 : 1); if (head) { e.head = true; e.part = 'head'; e.point = hit.point; e.mesh = hit.object; }
          else if (!e.head && e.part === 'body' && (ud.part === 'sac' || (ud.part === 'arm' && ud.z.state === 'cling'))) { e.part = ud.part; e.point = hit.point; e.mesh = hit.object; }   // 주머니·매달린 팔에 한 알이라도 맞으면 그 효과
          per.set(ud.z, e); }
        else if (!ud.z) { const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new T.Vector3(0, 1, 0); ZK.fx3.hole(hit.point, n, n.y > 0.7); } }
      g.tracers.push({ a: mz, b: end ? end.clone() : camera.position.clone().addScaledVector(dir, 40), t: 0.05 });
    }
    let kills = 0, killHead = false, killP = null;   // 명중률(g.hits)은 한 발(8알) 단위로 센다
    for (const [z, e] of per) {
      if (e.head && z.helmet) { z.hit('head', e.point, e.dir, 0, { mesh: e.mesh }); g.helmetN++; e.head = false; e.part = 'body'; }   // 산탄 머리 알갱이는 안전모만 날리고 나머지는 몸으로
      const dmg = Math.round(e.dmg), res = z.hit(e.part, e.point, e.dir, dmg, { mesh: e.mesh }); if (!res) continue;
      partNotes(z, res, e.point);
      z.kv.addScaledVector(e.dir.clone().setY(0).normalize(), 12); ZK.fx3.impact(e.point, e.head ? 'head' : 'body'); ZK.fx3.number(e.point.clone().add(new T.Vector3(0, 0.3, 0)), res.dealt, e.head ? 'head' : 'body');
      if (res.killed) { kills++; if (!killP || e.head) { killP = e.point; killHead = killHead || e.head; } onKill(z, e.head, res.overkill, 0, 'player'); }
    }
    if (per.size) { g.hits++; ZK.fx3.hitstop(kills ? 0.085 : 0.045, !kills /* 처치 없는 산탄 명중은 minor */); g.hitT = g.hitMax = kills ? 0.3 : 0.24; g.hitType = kills ? (killHead ? 'head' : 'kill') : 'hit'; }
    if (killP) killJuice(killHead, killP);
    if (kills >= 2) ZK.fx3.text(fwd.clone().multiplyScalar(6).add(camera.position), `SHOTGUN ×${kills}`, '#ffb24a', 32 + kills * 4, 0.8);
  }
  function spawn(type, pos, aware = 'chase') { const z = new ZK.Zombie3(type, pos, scene, 1 + g.t / 220); z.aware = aware; g.zombies.push(z); return z; }
  // 실력 맞춤 디렉터 (2026-11-09 실력 차 난이도) — g.pressOff = true면 전부 끔(봇 A/B용)
  // 봇 데이터로 본 실력 차: 3분 뒤 버스 체력은 초보·보통·숙련 모두 40~60%로 비슷하다(숙련도 70%에 거의 안 닿는다).
  //   갈리는 것은 '버티는 힘'과 매달림이다: 초보 매달림 피해 분당 37~45 vs 숙련 1~2(팔을 쏴서 뗀다).
  // · 여유(firm): 체력 40% 이상(처음 45%)이면 추격자 무리 +2·20초 간격, 최후의 파도 덩치 5 — 8분에 숙련은 28~56%, 보통은 16~48%
  //   (처음엔 70%·60%로 잡았는데 숙련도 거의 안 닿아 규칙이 사실상 꺼져 있었다)
  // · 숨 돌림(lo): 35% 밑이면 포위 무리 ×0.75 · 추격자 건너뜀
  // · 털어내기(shake): 50% 밑에서 3마리 이상이 2초 넘게 매달려 있으면 차체가 요동쳐 전부 떨어진다(20초에 한 번) — 숙련은 직접 떼어내 거의 안 걸린다
  // firm 45% → 40% (2026-11-10): 상한 170·해일 상한이 들어간 뒤 보통 생존이 3묶음 합계 14/18(78%)로 기준 30~60%를 넘었다
  // loK 0.75 → 0.85 · lo 덩치 2 → 3 · 첫 4분 소음 포위 간격 40 → 55초 (2026-11-10 17차): 4묶음 합계 초보 42% · 보통 71%로 기준보다 무르고,
  // 4분 전 사망이 24판 중 6번 → 몰린 사람에게 주던 덤은 줄이고, 판 초반의 억울한 죽음만 덜어 준다
  // loK 0.85 → 1.0 (2026-11-10 19차): 버스 탈출(bail3d)이 두 번째 기회가 되어 생존이 초보 1→3/6 · 보통 4→5/6으로 올랐다 → 포위 덤은 없앤다(추격자 건너뜀은 유지)
  g.PRESS = { firm: 0.40, lo: 0.35, loK: 1.0, loBrutes: 3, earlyLoud: 55, earlyT: 240, shakeBelow: 0.5, shakeN: 3, shakeHold: 2, shakeCd: 20, cap: 170 };   // cap: 포위가 채우는 동시 좀비 상한 (2026-11-10 성능)
  function pressK() { if (g.pressOff) return 1; return F.hp / F.maxHp < g.PRESS.lo ? g.PRESS.loK : 1; }
  // 재시동 직후 30초는 '여유'로 보지 않는다 (2026-11-10, bail3d): 시동 건 새 차는 체력 비율이 100%에서 시작해
  // 6분 이후라면 바로 추격자 +2·덩치 5가 걸릴 수 있었다 — 막 살아난 사람을 다시 몰아치지 않게
  const firm = () => !g.pressOff && g.t - (g.bailT ?? -99) > 30 && F.hp / F.maxHp >= g.PRESS.firm;
  g.pressK = pressK;   // 해일(tide3d) 규모에도 같은 숨 돌림 보정
  function shakeOff(dt) {
    const P = g.PRESS;
    g.shakeT = !g.pressOff && F.hp / F.maxHp < P.shakeBelow && F.clingers >= P.shakeN ? (g.shakeT || 0) + dt : 0;
    g.shakeCd = (g.shakeCd || 0) - dt;
    if (g.shakeT >= P.shakeHold && g.shakeCd <= 0) {
      g.shakeT = 0; g.shakeCd = P.shakeCd; let n = 0;
      for (const z of g.zombies) if (z.state === 'cling') { z.dropOff(); n++; }
      g.shakeN = (g.shakeN || 0) + 1; notice(`차체가 요동쳐 ${n}마리를 털어냈다!`, '#ffb24a'); ZK.fx3.trauma(0.4); ZK.audio.thud(); ZK.audio.barricade && ZK.audio.barricade(0);
    }
  }
  function director(dt) {
    if (ZK.tower && ZK.tower.inside) { g.noiseM = Math.max(0, g.noiseM - 0.8 * dt); return; }   // 2탄 타워 안: 광장 스폰·포위·추격자는 멈춘다 (따라오는 무리는 tower3d가 입구로 보낸다)
    shakeOff(dt);
    const center = g.mode === 'drive' ? F.pos : ps.pos, alive = g.zombies.filter(z => z.alive && !z.guard).length;   // 셔터·임무 경비는 디렉터 예산에서 뺀다
    const target = Math.min(85, 10 + g.t * 0.3) * (ZK.tide.lull(g) ? 0.4 : 1);   // 9:12~9:28 '폭풍 전 고요': 새 좀비를 거의 안 낸다
    if ((g.spawnT -= dt) <= 0 && alive < target) {
      g.spawnT = 0.28;
      // 운전 중이면 60%는 진행 방향 앞쪽에 → 계속 달려도 무리를 뚫고 지나가야 한다
      const fw = ZK.fort.forward(), ahead = g.mode === 'drive' && Math.random() < 0.6;
      const pos = ahead ? ZK.world.spawnRing(center, 30, 46, Math.atan2(fw.z, fw.x), 1.05) : ZK.world.spawnRing(center, 30, 46);
      // 평소 스폰의 75%는 배회로 나온다(예전 50%): 소리를 내거나 12m 안에 들어와야 달려든다 → 조용히 다니면 실제로 덜 붙는다
      spawn(Math.random() < Math.min(0.5, 0.1 + g.t / 360) ? 'runner' : 'walker', pos, Math.random() < 0.75 ? 'wander' : 'chase');
    }
    // 소음: 게이지는 초당 0.8씩 빠지고, 주행 소리는 1초마다 (부스트 18m · 주행 8m · 공회전 4m)
    g.noiseM = Math.max(0, g.noiseM - 0.8 * dt);
    if (g.mode === 'drive' && (g.driveNoiseT -= dt) <= 0) {
      g.driveNoiseT = 1; const sp = Math.abs(F.speed);
      g.noise(sp < 0.5 ? 'idle' : ZK.player.keys.ShiftLeft && sp > 3 ? 'boost' : 'drive', F.pos);
    }
    // 멀리(62m 밖) 배회하는 좀비는 정리해서 스폰 몫을 돌려받는다 (안 그러면 아무도 안 오는 판이 된다)
    if ((g.recycleT -= dt) <= 0) { g.recycleT = 1; for (const z of g.zombies) if (z.alive && !z.guard && z.aware === 'wander' && z.pos.distanceTo(center) > 62) z.dispose(); }   // 경비(셔터 앞·위험 임무 호위)는 멀어져도 남긴다 (예전엔 z.guard를 읽지 않아 판 시작 2초 만에 셔터 경비가 다 사라졌다)
    // 포위: 소음 게이지가 100이 되면(직전 포위 뒤 40초 이상) 가장 큰 소리가 난 곳을 둘러싸고,
    // 조용히 지내도 90초가 지나면 온다(숨어 있기 방지). 최후의 파도 중엔 30초마다 무조건
    // 규모는 시간이 갈수록 커짐: 8 + 경과초/10, 최대 22 + 경과초/15 (첫 포위 14 → 2분대 21 → 7분쯤 48~52)
    g.hordeClock += dt;
    // 최후의 파도: '30초마다 두 배'를 '15초마다 한 배'로 나눴다(2026-11-10 성능) — 같은 시간에 나오는 수는 같고, 한 번에 생기는 수는 절반
    // 예전엔 두 배 포위 한 번에 약 100마리가 한꺼번에 생겨 동시 좀비 215~310, 무리 쪽 드로우콜 1,000~1,450이었다
    const loud = !g.finalWave && g.noiseM >= 100 && g.hordeClock >= (g.t < g.PRESS.earlyT ? g.PRESS.earlyLoud : 40), due = g.hordeClock >= (g.finalWave ? 15 : 90), forced = g.forceHorde;
    if ((loud || due || forced) && !ZK.tide.active && !ZK.tide.lull(g)) {   // 해일(9:28~)이 나오면 일반 포위는 멈춘다
      const at = loud && g.noisePeak ? g.noisePeak : center;
      // 확성기 트럭이 방송 중이고 버스가 22m 이상 떨어져 있으면 무리는 트럭 반경 16m에 나타나 '경계' 상태로 트럭에 모인다 (최후의 파도 중엔 절반만)
      const lure = ZK.mis.lure(), lureAt = lure && Math.hypot(lure.x - F.pos.x, lure.z - F.pos.z) >= 22 && Math.hypot(lure.x - ps.pos.x, lure.z - ps.pos.z) >= 22 ? lure : null;
      g.hordeClock = 0; g.noiseM = 0; g.noisePeak = null; g.hordes++; g.hordeWhy = forced ? (lureAt ? 'lure' : 'lureNear') : loud ? 'noise' : 'time'; g.forceHorde = false;
      g.lastHorde = { x: (lureAt || at).x, z: (lureAt || at).z };   // 공포 디렉터: 그쪽에서 땅울림
      notice(forced ? (lureAt ? '무리를 불러냈다! 확성기 트럭으로 몰려간다' : '무리를 불러냈다! 트럭이 너무 가깝다 — 이쪽으로 온다') : g.finalWave ? '포위 공격! (최후의 파도)' : lureAt ? '포위 무리가 확성기 트럭으로 간다' : loud ? '소음을 듣고 무리가 몰려온다!' : '포위 공격!', '#ff5a4a');
      const hk = pressK();   // 숨 돌림: 버스 체력 35% 밑이면 무리 ×0.75 (실력 맞춤 디렉터)
      // 동시 좀비 상한(g.PRESS.cap): 살아 있는 좀비가 이미 많으면 포위는 상한까지만 채운다(최소 6) — 성능 안전장치이자, 무리에 파묻힌 사람에겐 숨 돌림
      const hn0 = Math.round(Math.min(22 + Math.floor(g.t / 15), 8 + Math.floor(g.t / 10)) * (1 + 0.25 * (g.nightK || 0)) * hk);
      const liveN = g.zombies.reduce((c, z) => c + (z.alive ? 1 : 0), 0), hn = Math.min(hn0, Math.max(6, g.PRESS.cap - liveN));
      if (hn < hn0) g.hordeCapped = (g.hordeCapped || 0) + 1;
      for (let i = 0; i < hn; i++) { const a = (i / hn) * 6.283 + rand(-0.1, 0.1), toLure = !!lureAt && (!g.finalWave || i % 2 === 0), base = toLure ? lureAt : at, rad = toLure ? 16 : 26;
        const p = new T.Vector3(clamp(base.x + Math.cos(a) * rad, -ZK.world.B + 1, ZK.world.B - 1), 0, clamp(base.z + Math.sin(a) * rad, -ZK.world.B + 1, ZK.world.B - 1));
        if (!ZK.world.freeSpot(p.x, p.z, 0.5)) continue;
        const z = spawn(g.t > 120 && i % 3 === 0 ? 'runner' : 'walker', p, toLure ? 'alert' : 'chase');
        if (toLure) { z.alertPos.set(lureAt.x, 0, lureAt.z); z.alertT = 30; } }
    }
    if ((g.bruteT -= dt) <= 0) {
      g.bruteT = 70; const n = 1 + Math.floor(g.t / 200); notice(n > 1 ? `덩치 ${n}마리 출현!` : '덩치 출현!', '#ff9a4a');
      for (let i = 0; i < n; i++) spawn('brute', ZK.world.spawnRing(center, 32, 44));
    }
    if (!g.finalWave && g.t >= 480) { // 8분: 최후의 파도 — 덩치 3마리(버스 체력 40% 이상이면 5 · 35% 밑이면 g.PRESS.loBrutes) + 즉시 포위, 이후 15초마다
      g.finalWave = true; notice('최후의 파도! 2분만 버텨라', '#ff3b3b'); ZK.audio.thud(); ZK.fx3.trauma(0.35);
      const nb = g.pressOff ? 3 : firm() ? 5 : F.hp / F.maxHp < g.PRESS.lo ? g.PRESS.loBrutes : 3;
      for (let i = 0; i < nb; i++) spawn('brute', ZK.world.spawnRing(center, 30, 40));
      g.hordeClock = g.hordeClock < 15 ? g.hordeClock + 15 : 999;   // 직전 포위가 15초 안이면 겹치지 않게 그 15초 뒤로 (두 무리가 같은 초에 오던 문제)
    }
    // 6분~: 추격자 무리 — 진행 방향 뒤쪽에서 나타나 요새를 쫓아와 뛰어오른다
    // 무리 크기는 시간(2 + 45초마다 +1)과 요새 체력에 따라: 55% 이상이면 +2·20초 간격(여유 있는 고수에게 위기),
    // 35% 미만이면 이번 무리는 건너뜀(숨 돌릴 틈) → 위기 → 해방 리듬이 숙련도와 상관없이 생긴다
    // 예고(공포 디렉터): 나타나기 2.8초 전 뒤쪽에서 먼 비명 + "뒤에서 비명이…" → 레이더에 아직 아무것도 없는 그 몇 초가 가장 무섭다
    if (g.t >= 360 && !g.chaserWarn && !ZK.tide.lull(g) && (g.chaserT -= dt) <= 0) {   // 고요 동안엔 추격자도 쉰다
      const r = F.hp / F.maxHp, base = 2 + Math.floor((g.t - 360) / 45);
      const fm = g.pressOff ? r >= 0.55 : firm();   // 여유 기준 55% → 45% (실력 맞춤 디렉터: 숙련도 55%엔 거의 안 닿았다)
      const n = r < 0.35 ? 0 : fm ? base + 2 : base;
      g.chaserT = n === 0 ? 10 : fm || g.finalWave ? 20 : 30;
      if (n > 0) { g.chaserWarn = { t: 2.8, n }; notice(g.chasers ? '뒤에서 비명이 들린다…' : '뒤에서 비명이 들린다… 뭔가 빠른 게 온다', '#ff8ae0'); ZK.dread.warnChasers(); }
    }
    if (g.chaserWarn && (g.chaserWarn.t -= dt) <= 0) {
      const n = g.chaserWarn.n, fw = ZK.fort.forward(); g.chaserWarn = null;
      notice(g.chasers ? `추격자 ${n}마리!` : '추격자 등장! 뒤쫓아 와서 요새로 뛰어오른다', '#ff4ad2');
      for (let i = 0; i < n; i++) spawn('chaser', ZK.world.spawnRing(center, 34, 44, Math.atan2(-fw.z, -fw.x), 0.9));
      g.chasers += n; ZK.audio.shriek && ZK.audio.shriek(0, 1);
    }
    if ((g.carT -= dt) <= 0) { // 흡수할 폐차 보충
      g.carT = 18;
      const city = ZK.world.MAP === 'city';   // 1탄 도시: 넓으니 '내 주변 90m 안의 폐차'가 4대 밑이면 35~80m에 보충
      if (ZK.world.cars.filter(c => c.alive && !c.truck && (!city || c.pos.distanceTo(center) < 90)).length < (city ? 4 : 9)) for (let k = 0; k < 10; k++) {   // 확성기 트럭은 폐차 수에서 뺀다
        const sp0 = city ? ZK.world.spawnRing(center, 35, 80) : null, x = city ? sp0.x : rand(-70, 70), z = city ? sp0.z : rand(-70, 70);
        if (Math.hypot(x - center.x, z - center.z) > 30 && ZK.world.freeSpot(x, z, 3)) { ZK.world.addCar(x, z, rand(0, 3.14)); break; }
      }
    }
  }

  // ───────── HUD ─────────
  function label(t, x, y, size, col = '#fff', align = 'center') {
    h.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`; h.textAlign = align; h.textBaseline = 'middle';
    h.lineJoin = 'round'; h.lineWidth = size * 0.18; h.strokeStyle = 'rgba(0,0,0,0.85)'; h.strokeText(t, x, y); h.fillStyle = col; h.fillText(t, x, y);
  }
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function drawRadar(real) {
    const R = 72, cx = W - R - 22, cy = R + 40, c = g.mode === 'drive' ? F.pos : ps.pos, sc = R / 45, yaw = ps.yaw;
    const pr = p => { const dx = p.x - c.x, dz = p.z - c.z; return [cx + (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * sc, cy + (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * sc]; };
    h.save(); h.beginPath(); h.arc(cx, cy, R, 0, 6.283); h.fillStyle = 'rgba(6,14,10,0.62)'; h.fill();
    h.strokeStyle = 'rgba(120,255,160,0.35)'; h.lineWidth = 2; h.stroke(); h.clip();
    h.strokeStyle = 'rgba(120,255,160,0.12)'; h.beginPath(); h.arc(cx, cy, R / 2, 0, 6.283); h.stroke();
    if (ZK.city && ZK.city.drawRadar) ZK.city.drawRadar(h, cx, cy, R, c, yaw, sc);   // 1탄 도시: 도로·마트·막힌 길
    // 소음 원: 내 리볼버·충돌은 노랗게, 사수·포탑·폭발은 옅게 — 원 안의 배회 좀비가 몰려온다
    for (const r of g.rings) { r.t -= real; if (r.t <= 0) continue; const [x, y] = pr(r), mine = r.kind === 'revolver' || r.kind === 'crash' || r.kind === 'boost' || r.kind === 'rifle' || r.kind === 'shotgun' || r.kind === 'grenade';
      h.strokeStyle = mine ? `rgba(255,214,90,${0.5 * r.t})` : `rgba(255,214,90,${0.18 * r.t})`; h.lineWidth = mine ? 2 : 1; h.beginPath(); h.arc(x, y, r.r * sc * (1.15 - r.t * 0.15), 0, 6.283); h.stroke(); }
    g.rings = g.rings.filter(r => r.t > 0);
    for (const car of ZK.world.cars) if (car.alive && !car.truck) { const [x, y] = pr(car.pos); h.fillStyle = '#9aa0a8'; h.fillRect(x - 3, y - 3, 6, 6); }
    // 좀비 점: 추적은 빨강, 경계(소리 쪽으로 오는 중)는 주황빛, 배회는 어두운 적갈색
    for (const z of g.zombies) if (z.alive) { const [x, y] = pr(z.pos);
      h.fillStyle = z.type === 'brute' ? '#ff9a3a' : z.type === 'chaser' ? '#ff4ad2' : z.aware === 'wander' ? '#6e2c2c' : z.aware === 'alert' ? '#d8704a' : '#ff3b3b';
      h.beginPath(); h.arc(x, y, z.type === 'brute' ? 4 : z.type === 'chaser' ? 3 : 2, 0, 6.283); h.fill(); }
    const blink = Math.sin(ZK.fx3.time * 8) > 0;
    for (const n of ZK.absorb.npcs) { const [x, y] = pr(n.g.position); h.fillStyle = blink ? '#7dff9a' : '#2a8a4a'; h.beginPath(); h.arc(x, y, 5, 0, 6.283); h.fill(); }
    for (const k of ZK.absorb.crates) { const [x, y] = pr(k.g.position); h.fillStyle = '#ffd23a'; h.fillRect(x - 4, y - 4, 8, 8); }
    for (const m of ZK.mis.radarMarks(g)) { const [x, y] = pr(m); h.fillStyle = m.col; h.strokeStyle = m.col; if (m.big) { h.lineWidth = 2; h.beginPath(); h.arc(x, y, 6 + Math.sin(ZK.fx3.time * 6) * 2, 0, 6.283); h.stroke(); h.beginPath(); h.arc(x, y, 3, 0, 6.283); h.fill(); } else h.fillRect(x - 2, y - 2, 4, 4); }   // 임무 목표(맥동 원) · 드럼통(빨간 점)
    h.strokeStyle = '#e8c860'; h.lineWidth = 1.5; for (const q of ZK.needs.points) if (!q.done) { const [x, y] = pr(q.pos); h.strokeRect(x - 3, y - 3, 6, 6); }   // 수색 지점: 노란 빈 네모
    { const [x, y] = pr(F.pos); h.save(); h.translate(x, y); h.rotate(yaw - F.heading); h.fillStyle = '#8fd18f'; h.fillRect(-F.halfW * sc, -F.halfL * sc, F.halfW * 2 * sc, F.halfL * 2 * sc); h.fillStyle = '#ffc81a'; h.fillRect(-F.halfW * sc, -F.halfL * sc, F.halfW * 2 * sc, 3); h.restore(); }   // 노란 쪽이 버스 앞
    h.fillStyle = '#fff'; const [px, py] = pr(ps.pos); h.beginPath(); h.moveTo(px, py - 6); h.lineTo(px - 4, py + 4); h.lineTo(px + 4, py + 4); h.fill();
    h.restore();
    ZK.tide.drawRadar(h, cx, cy, R, c, yaw, sc);   // 해일 방향 (레이더 밖일 때 테두리 호)
    ZK.raid.drawRadar(h, cx, cy, R, c, yaw, sc);   // 골목 무기고
    ZK.arms.drawRadar(h, cx, cy, R, c, yaw, sc);   // 무기 보급함 (내용물 색 마름모)
    ZK.bail.drawRadar(h, cx, cy, R, c, yaw, sc);   // 버스 탈출: 시동 걸 폐차
    // 소음 게이지 (레이더 아래): 100이 되면 포위 무리가 온다. 75부터 빨갛게 깜빡
    const nw = R * 2, nx = cx - R, ny = cy + R + 14, nk = clamp(g.noiseM / 100, 0, 1), hot = nk >= 0.75;
    h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(nx - 2, ny - 2, nw + 4, 12);
    h.fillStyle = hot ? (Math.sin(ZK.fx3.time * 10) > 0 ? '#ff4a3a' : '#a02a20') : nk >= 0.45 ? '#ffd23a' : '#9fd18f'; h.fillRect(nx, ny, nw * nk, 8);
    h.font = '700 12px system-ui, sans-serif'; h.textAlign = 'left'; h.fillStyle = hot ? '#ff8a7a' : '#aab2c0';
    h.fillText(hot ? '소음 — 무리가 듣고 있다' : '소음', nx, ny + 22);
  }
  function drawHUD(real) {
    h.setTransform(dpr, 0, 0, dpr, 0, 0); h.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, gs = ZK.gun3.state;
    h.globalCompositeOperation = 'lighter';
    for (const t of g.tracers) {
      const a = t.a.clone().project(camera), b = t.b.clone().project(camera); t.t -= real; if (a.z > 1 || b.z > 1) continue;
      const k = Math.max(0, t.t / 0.06), ax = (a.x + 1) / 2 * W, ay = (1 - a.y) / 2 * H, bx = (b.x + 1) / 2 * W, by = (1 - b.y) / 2 * H, col = t.col || '255,210,140';
      h.strokeStyle = `rgba(${col},${0.55 * k})`; h.lineWidth = 5 * k; h.beginPath(); h.moveTo(ax, ay); h.lineTo(bx, by); h.stroke();
      h.strokeStyle = `rgba(255,250,235,${k})`; h.lineWidth = 1.5; h.beginPath(); h.moveTo(ZK.lerp(ax, bx, 0.25), ZK.lerp(ay, by, 0.25)); h.lineTo(bx, by); h.stroke();
    }
    h.globalCompositeOperation = 'source-over';
    g.tracers = g.tracers.filter(t => t.t > 0);
    ZK.fx3.drawScreen(h, W, H, real);   // 손맛 화면 섬광 (총구·처치·폭발·피격)
    ZK.fx3.drawTexts(h, camera, W, H);
    ZK.arms.drawScope(h, W, H);   // 조준경 테두리 (HUD 글자 아래 · 판 진행 중에만 — scopeView가 확인)
    if (g.state === 'title') return drawTitle();
    g.hurtA = Math.max(0, g.hurtA - real * 1.2);
    const low = g.mode === 'foot' ? 1 - clamp(g.hp / 100, 0, 1) : 1 - clamp(F.hp / F.maxHp, 0, 1), va = Math.min(0.85, g.hurtA * 0.6 + Math.max(0, low - 0.5) * 0.9);
    if (va > 0.02) { const gr = h.createRadialGradient(cx, cy, Math.min(W, H) * 0.25, cx, cy, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${va})`); h.fillStyle = gr; h.fillRect(0, 0, W, H); }
    ZK.dread.draw(h, W, H, g, label, camera);   // 공포 디렉터: 조여 오는 어둠 · 위협 방향 · '!' · 뒤 경고 · 지구력
    // 조준선
    const spreadPx = Math.tan(ZK.player.spread()) / Math.tan((camera.fov * Math.PI) / 360) * (H / 2), vis = (1 - (fpp() ? ps.adsK || 0 : 0)) * (1 - gs.sprint);
    if (vis > 0.05) {
      const gap = 6 + spreadPx; h.globalAlpha = vis;
      for (const [w, c] of [[4, 'rgba(0,0,0,0.6)'], [2, gs.reloading ? '#9aa0a8' : '#fff']]) { h.strokeStyle = c; h.lineWidth = w; h.beginPath();
        h.moveTo(cx - gap - 11, cy); h.lineTo(cx - gap, cy); h.moveTo(cx + gap, cy); h.lineTo(cx + gap + 11, cy);
        h.moveTo(cx, cy - gap - 11); h.lineTo(cx, cy - gap); h.moveTo(cx, cy + gap); h.lineTo(cx, cy + gap + 11); h.stroke(); }
      h.globalAlpha = 1;
    }
    h.fillStyle = 'rgba(255,255,255,0.85)'; h.beginPath(); h.arc(cx, cy, 1.6, 0, 6.283); h.fill();
    // 히트마커 (손맛): 맞는 순간 크게 튀어나왔다 줄어든다 · 처치는 굵은 붉은 X + 퍼지는 고리 · 헤드샷은 금빛 + 떨림
    if ((g.hitT -= real) > 0) {
      const kind = g.hitType, max = g.hitMax || 0.22, age = clamp(max - g.hitT, 0, 1), fade = clamp(g.hitT / (max * 0.5), 0, 1);
      const big = kind === 'head' ? 1.75 : kind === 'kill' ? 1.45 : 1.05, pop = age < 0.07 ? ZK.lerp(1.9, 1, age / 0.07) : 1;
      const rr = (11 + age * 26) * big * pop, col = kind === 'head' ? '#ffd23a' : kind === 'kill' ? '#ff3030' : '#fff';
      const jit = kind === 'head' && age < 0.12 ? 3 : kind === 'kill' && age < 0.08 ? 1.5 : 0, mx = cx + rand(-jit, jit), my = cy + rand(-jit, jit);
      const thick = kind === 'hit' ? 1 : 1.5;
      h.globalAlpha = fade;
      for (const [w, c] of [[6 * thick, 'rgba(0,0,0,0.6)'], [3 * thick, col]]) { h.strokeStyle = c; h.lineWidth = w; h.lineCap = 'round'; h.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { h.moveTo(mx + sx * rr * 0.42, my + sy * rr * 0.42); h.lineTo(mx + sx * rr, my + sy * rr); } h.stroke(); }
      if (kind !== 'hit') {   // 처치 고리: 바깥으로 퍼지며 사라짐
        const ring = rr * 1.25 + age * 160 * big, ra = clamp(1 - age / 0.22, 0, 1);
        h.globalAlpha = ra * 0.85; h.strokeStyle = col; h.lineWidth = 3 * ra + 0.5; h.beginPath(); h.arc(mx, my, ring, 0, 6.283); h.stroke();
      }
      h.globalAlpha = 1; h.lineCap = 'butt';
    }
    // 경험치 바 · 레벨 · 타이머 · 처치
    const sv = ZK.surv; h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(0, 0, W, 10); h.fillStyle = '#5ad8ff'; h.fillRect(0, 0, W * clamp(sv.xp / sv.next, 0, 1), 10);
    label(`Lv ${sv.level}`, 18, 30, 20, '#9fe8ff', 'left');
    if (sv.pending > 0 && !sv.choosing) { h.globalAlpha = 0.7 + Math.sin(ZK.fx3.time * 12) * 0.3; label(sv.pending > 1 ? `LEVEL UP ×${sv.pending}` : 'LEVEL UP!', 86, 30, 18, '#ffe27a', 'left'); h.globalAlpha = 1; }
    label(mmss(g.t), cx, 34, 28, g.t > WIN_T - 30 ? '#7dff9a' : '#fff');
    if (ps.noLock) { h.font = '600 12px system-ui, sans-serif'; h.fillStyle = '#ffb24a'; h.textAlign = 'center'; h.fillText('마우스 잠금이 안 되는 창 — 커서를 화면 가장자리에 대거나 ←→↑↓ 키로 둘러보기', cx, 104); }
    h.font = '600 12px system-ui'; h.fillStyle = '#9aa3b2'; h.textAlign = 'center'; h.fillText(`임무를 해내고 ${mmss(WIN_T)}에 헬기로 탈출`, cx, 56);
    label(`${g.kills}`, 18, 62, 26, '#fff', 'left'); h.font = '700 12px system-ui'; h.fillStyle = '#9aa3b2'; h.textAlign = 'left'; h.fillText('KILLS', 20, 82);
    if (g.combo >= 2) label(`${g.combo} COMBO`, cx, 84, 22, g.combo >= 20 ? '#ff5a3a' : g.combo >= 10 ? '#ffd23a' : '#fff');
    drawRadar(real);
    // 알림
    const ny0 = ZK.mis.offer ? Math.max(H * 0.24, 236) : H * 0.24;   // 무전 상자(98~210)에 가리지 않게
    g.notices.forEach((n, i) => { n.t -= real; h.globalAlpha = clamp(n.t, 0, 1); label(n.text, cx, ny0 + i * 34, 24, n.col); });
    h.globalAlpha = 1; g.notices = g.notices.filter(n => n.t > 0);
    // 요새 체력 · 속도
    const bw = Math.min(420, W * 0.5), bx = cx - bw / 2, by = H - 52, p = clamp(F.hp / F.maxHp, 0, 1);
    h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(bx - 3, by - 3, bw + 6, 20); h.fillStyle = p > 0.35 ? '#8fd18f' : '#e0402e'; h.fillRect(bx, by, bw * p, 14);
    h.font = '700 13px system-ui, sans-serif'; h.fillStyle = '#d8dde6'; h.textAlign = 'center';
    h.fillText(ZK.bail.wrecked ? ZK.bail.bar() : `요새 ${Math.ceil(F.hp)}/${F.maxHp}  ·  장갑판 ${F.modules}  ·  사수 ${F.gunners.length}`, cx, by + 32);
    label(`${Math.round(Math.abs(F.speed) * 3.6)} km/h`, bx + bw + 14, by + 7, 18, '#d8dde6', 'left');
    // 버스 방향 표시: 위에서 본 버스(노란 앞 · 빨간 뒤)가 지금 시선 기준으로 돌아간다 — 앞을 보고 있으면 노란 쪽이 위
    if (g.mode === 'drive') {
      const rel = Math.atan2(Math.sin(ps.yaw + ps.lookYaw - F.heading), Math.cos(ps.yaw + ps.lookYaw - F.heading)), ix = Math.min(W - 30, bx + bw + 118), iy = by + 4;   // km/h 오른쪽
      h.save(); h.translate(ix, iy); h.fillStyle = 'rgba(0,0,0,0.55)'; h.beginPath(); h.arc(0, 0, 22, 0, 6.283); h.fill(); h.rotate(rel);
      h.fillStyle = '#8fd18f'; h.fillRect(-6, -10, 12, 22); h.fillStyle = '#ff3a2a'; h.fillRect(-6, 10, 12, 3);
      h.fillStyle = '#ffc81a'; h.beginPath(); h.moveTo(0, -19); h.lineTo(7, -9); h.lineTo(-7, -9); h.closePath(); h.fill();
      h.fillStyle = '#ff3a2a'; for (const z of g.zombies) if (z.state === 'cling') { h.beginPath(); h.arc(z.cling.side * 9, clamp(z.cling.lz / 3.8, -1, 1) * 10 + 1, 3, 0, 6.283); h.fill(); }   // 버스 아이콘 위 매달린 자리(빨간 점)
      h.restore();
      if (Math.abs(rel) > 1.9) { h.globalAlpha = 0.7 + Math.sin(ZK.fx3.time * 8) * 0.3; label('뒤를 보는 중 — X: 앞 보기', Math.min(ix, W - 110), iy - 34, 14, '#ffc81a'); h.globalAlpha = 1; }
    }
    if (F.clingers > 0) { h.globalAlpha = 0.75 + Math.sin(ZK.fx3.time * 10) * 0.25; label(`매달린 좀비 ${F.clingers} — 쏴서 떨어뜨려라!`, cx, by - 44, 18, '#ff6a4a'); h.globalAlpha = 1;
      // 어디 붙었는지 표시: 화면 안이면 머리 위 빨간 ▼, 밖이면 그쪽 화면 가장자리에 화살표 (등 뒤면 좌우로 돌 방향)
      const pulse = 0.65 + Math.sin(ZK.fx3.time * 10) * 0.35; h.fillStyle = `rgba(255,70,50,${pulse})`;
      for (const z of g.zombies) {
        if (z.state !== 'cling') continue;
        const wp = z.head.getWorldPosition(new T.Vector3()), v = wp.clone().applyMatrix4(camera.matrixWorldInverse), pr = wp.project(camera);
        if (v.z < 0 && Math.abs(pr.x) < 0.92 && Math.abs(pr.y) < 0.9) {
          const sx = (pr.x + 1) / 2 * W, sy = (1 - pr.y) / 2 * H - 24;
          h.beginPath(); h.moveTo(sx, sy + 10); h.lineTo(sx - 8, sy - 4); h.lineTo(sx + 8, sy - 4); h.closePath(); h.fill();
        } else {
          const a = v.z < 0 ? Math.atan2(-v.y, v.x) : Math.atan2(0.25, v.x >= 0 ? 1 : -1), ex = cx + Math.cos(a) * W * 0.4, ey = cy + Math.sin(a) * H * 0.36;
          h.save(); h.translate(ex, ey); h.rotate(a); h.beginPath(); h.moveTo(18, 0); h.lineTo(-6, -12); h.lineTo(-6, 12); h.closePath(); h.fill(); h.restore();
        }
      }
    }
    if (F.rally > 0) label(`사수 집중 사격 ×2  ${F.rally.toFixed(1)}s`, cx, by - (F.clingers > 0 ? 70 : 44), 15, '#7dff9a');
    if (g.stuckHint > 0) { h.globalAlpha = 0.7 + Math.sin(ZK.fx3.time * 10) * 0.3; label('막혔다 — S로 후진해서 빠져나가라', cx, by - 96, 20, '#ffe27a'); h.globalAlpha = 1; }
    {   // 사람 체력 (버스 체력 막대 위 왼쪽 · 이름표 '체력 n' — 이름이 없어 무슨 막대인지 몰랐다는 사용자 피드백)
      const hw = bw * 0.4, hy = by - 31, hp = clamp(g.hp, 0, 100), hc = hp > 60 ? '#e8e8e8' : hp > 35 ? '#ffb24a' : '#e0402e';
      h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(bx - 3, hy, hw + 6, 14); h.fillStyle = hc; h.fillRect(bx, hy + 2, hw * hp / 100, 10);
      h.save(); h.font = '800 12px system-ui, sans-serif'; h.textAlign = 'left'; h.textBaseline = 'middle'; h.fillStyle = hc; h.fillText(`체력 ${Math.ceil(hp)}${ZK.needs && ZK.needs.s && ZK.needs.s.bleeding ? ' · 출혈' : ''}`, bx + hw + 10, hy + 7); h.restore();
    }
    const hint = g.mode === 'drive' ? `W 전진 · S 후진 · A/D 회전 · Shift 부스트 · Space ${ZK.surv.contract.has('nobrake') ? '드리프트' : '정지'} · X 앞 보기 · G 하차` : ZK.bail.wrecked ? ZK.bail.hint() : nearFort(ps.pos, 2.5) ? 'G  탑승' : '요새로 돌아가 G로 탑승 · F 줍기';
    h.font = '600 13px system-ui, sans-serif'; h.fillStyle = g.mode === 'foot' && nearFort(ps.pos, 2.5) ? '#ffe27a' : '#8a93a2'; h.fillText(hint, cx, H - 92);
    // 탄약: 산탄총이면 장전된 2발 + 남은 산탄, 자동소총이면 탄창 막대 + 남은 소총탄, 아니면 리볼버 실린더
    const ax = 82, ay = H - 110;
    if (ZK.gun3.weapon === 'bat') {   // 방망이: 탄 대신 '조용함 · 걸어서만'
      h.fillStyle = 'rgba(30,32,38,0.85)'; h.beginPath(); h.arc(ax, ay, 44, 0, 6.283); h.fill();
      h.save(); h.translate(ax, ay - 4); h.rotate(-0.7); h.fillStyle = '#c99a62'; h.beginPath(); h.moveTo(-3, 26); h.lineTo(3, 26); h.lineTo(6, -24); h.arc(0, -24, 6, 0, Math.PI, true); h.closePath(); h.fill(); h.fillStyle = '#1b1d22'; h.fillRect(-3.5, 10, 7, 17); h.restore();
      h.font = '700 12px system-ui, sans-serif'; h.fillStyle = '#d8dce4'; h.textAlign = 'center'; h.fillText(g.mode === 'foot' ? '방망이 · 조용함' : '걸어서만', ax, ay + 30);
    } else if (ZK.gun3.weapon === 'rifle') {
      const rf = ZK.gun3.rf, M = ZK.gun3.RF_MAG; h.fillStyle = 'rgba(30,32,38,0.85)'; h.beginPath(); h.arc(ax, ay, 44, 0, 6.283); h.fill();
      h.font = '900 26px system-ui, sans-serif'; h.textAlign = 'center'; h.textBaseline = 'middle'; h.fillStyle = rf.loaded > 8 ? '#f2f2ea' : '#ff8a5a'; h.fillText(String(rf.loaded), ax, ay - 6);
      for (let i = 0; i < M; i++) { h.fillStyle = i < rf.loaded ? '#e8c860' : 'rgba(255,255,255,0.12)'; h.fillRect(ax - 30 + i * 2, ay + 12, 1.4, 7); }
      h.font = '700 12px system-ui, sans-serif'; h.fillStyle = '#d8dce4'; h.fillText(`소총탄 ${ZK.gun3.rifleAmmo()}`, ax, ay + 30);
      if (rf.reloading) { h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(ax - 36, ay - 76, 72, 6); h.fillStyle = '#e8c860'; h.fillRect(ax - 36, ay - 76, 72 * clamp(rf.rt / 1.8, 0, 1), 6); }
      if (rf.loaded === 0 && !rf.reloading) label(ZK.gun3.rifleAmmo() ? 'R  장전' : '소총탄 없음 — 1번', ax + 60, ay, 18, '#ff5a4a', 'left');
    } else if (ZK.gun3.weapon === 'shotgun') {
      const sgs = ZK.gun3.sg; h.fillStyle = 'rgba(30,32,38,0.85)'; h.beginPath(); h.arc(ax, ay, 44, 0, 6.283); h.fill();
      for (let i = 0; i < 2; i++) { const x = ax - 12 + i * 24; h.fillStyle = '#0d0e10'; h.beginPath(); h.arc(x, ay - 4, 11, 0, 6.283); h.fill();
        if (i < sgs.loaded) { h.fillStyle = '#b8261c'; h.beginPath(); h.arc(x, ay - 4, 9, 0, 6.283); h.fill(); h.fillStyle = '#d8b04a'; h.beginPath(); h.arc(x, ay - 4, 4, 0, 6.283); h.fill(); } }
      h.font = '700 12px system-ui, sans-serif'; h.fillStyle = '#d8dce4'; h.textAlign = 'center'; h.fillText(`산탄 ${ZK.gun3.shells()}`, ax, ay + 24);
      if (sgs.loaded === 0 && !sgs.reloading) label(ZK.gun3.shells() ? 'R  장전' : '산탄 없음 — 1번', ax + 60, ay, 18, '#ff5a4a', 'left');
    } else {
    const cap = ZK.gun3.cap, stp = 2 * Math.PI / cap;   // 외로운 총잡이면 7칸
    h.save(); h.translate(ax, ay); h.rotate(-gs.cyl * stp);
    h.fillStyle = 'rgba(30,32,38,0.85)'; h.beginPath(); h.arc(0, 0, 44, 0, 6.283); h.fill();
    const cur = Math.round(gs.cylT), loaded = gs.reloading && gs.ev >= 3 ? cap : gs.ammo;
    for (let i = 0; i < cap; i++) { const an = i * stp - Math.PI / 2, x = Math.cos(an) * 25, y = Math.sin(an) * 25, k = (((i - cur) % cap) + cap) % cap;
      h.fillStyle = '#0d0e10'; h.beginPath(); h.arc(x, y, 10, 0, 6.283); h.fill();
      if (k < loaded) { h.fillStyle = k < gs.hot ? '#e0602a' : '#c9952f'; h.beginPath(); h.arc(x, y, 8, 0, 6.283); h.fill(); h.fillStyle = k < gs.hot ? '#ffb070' : '#f2d17a'; h.beginPath(); h.arc(x - 2, y - 2, 3.5, 0, 6.283); h.fill(); }
      else { const r2 = gs.ch[k - loaded];   // 6발 리듬: 빈 약실에 그 발의 결과 (금색 헤드 · 빨강 몸 · 회색 X 빗나감)
        if (r2 === 'miss') { h.strokeStyle = '#8a8f98'; h.lineWidth = 2.5; h.beginPath(); h.moveTo(x - 4.5, y - 4.5); h.lineTo(x + 4.5, y + 4.5); h.moveTo(x + 4.5, y - 4.5); h.lineTo(x - 4.5, y + 4.5); h.stroke(); }
        else if (r2) { h.fillStyle = r2 === 'head' ? '#ffd23a' : '#e0402e'; h.beginPath(); h.arc(x, y, 5, 0, 6.283); h.fill(); } } }
    h.restore();
    if (gs.ammo === 0 && !gs.reloading) label('R  장전', ax + 60, ay, 20, '#ff5a4a', 'left');
    if (gs.cleanT > 0) { h.globalAlpha = Math.min(1, gs.cleanT); label('CLEAN', ax + 52, ay - 24, 16, '#7dff9a', 'left'); h.globalAlpha = 1; }
    if (gs.hot > 0) label(`달군 탄 ${gs.hot}`, ax + 52, ay - 34, 14, '#ff8a2a', 'left');
    if (gs.slamT > 0) { h.globalAlpha = Math.min(1, gs.slamT * 2); label(gs.slamTxt, ax, ay - 78, 18, gs.slamTxt === '탁!' ? '#ffe27a' : '#9aa0a8'); h.globalAlpha = 1; }
    else if (gs.reloading) { const [lo] = ZK.gun3.slamWindow(), k = clamp((gs.rt - 0.32) / (1.0 - 0.32), 0, 1);   // 장전 막대: 노란 칸에서 R → 탁 닫기
      const bx2 = ax - 36, by2 = ay - 76, w2 = 72; h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(bx2, by2, w2, 6); h.fillStyle = 'rgba(255,226,122,0.55)'; h.fillRect(bx2 + w2 * (lo - 0.32) / 0.68, by2, w2 * (1 - lo) / 0.68, 6);
      h.fillStyle = '#fff'; h.fillRect(bx2 + w2 * k - 1, by2 - 2, 2, 10); }
    }
    h.font = '600 11px system-ui, sans-serif'; h.fillStyle = '#8a93a2'; h.textAlign = 'center';
    { const inv = ZK.needs.inv || {}, G3 = ZK.gun3;   // 무기 줄 (조준경은 리볼버 옆 ⊕) · 길어서 왼쪽 정렬
      const mw = Math.max(90, W / 2 - 236);   // 가운데 버스 체력 막대와 겹치지 않게 두 줄 · 최대 폭
      h.textAlign = 'left'; h.fillText(`1 소총${G3.hasRifle ? '' : '(없음)'} · 2 산탄총${G3.hasShotgun ? '' : '(없음)'} · 3 리볼버${G3.hasScope ? '⊕' : ''} · 4 방망이`, 14, ay + 54, mw);   // 배그식: 1·2 주무기 · 3 권총 · 4 근접 · 5 투척 (inv3d)
      h.fillText(`5 투척: 수류탄 ${inv.grenade || 0} · 화염병 ${inv.molotov || 0} · Tab 소지품`, 14, ay + 68, mw); h.textAlign = 'center'; }
    ZK.mis.drawHUD(h, W, H, g, label);
    ZK.tide.drawHUD(h, W, H, g, label); ZK.tower.drawHUD(h, W, H, g, label);   // 해일까지 거리 · 헬기까지 남은 시간
    ZK.raid.drawHUD(h, W, H, g, label);   // 골목 무기고 안내 · G 진행
    ZK.arms.drawHUD(h, W, H, g, label);   // 조준경 화면 · 가까운 무기 보급함 안내
    ZK.bail.drawHUD(h, W, H, g, label);
    if (!ZK.police.showing(g)) ZK.mart.drawHUD(h, W, H, g, label); ZK.police.drawHUD(h, W, H, g, label);   // 경찰서 근처면 마트 목표 줄(132) 대신 경찰서 줄   // 1탄: 한빛마트 목표 줄 (다른 임무·착륙장이 없을 때)
    if (ZK.city && ZK.city.showMap && g.state === 'play') ZK.city.drawMap(h, W, H, g, label);   // Tab: 도시 지도   // 버스 탈출: 폐차까지 거리 · 방향 화살표 · G 진행
    ZK.needs.draw(h, W, H, g, label);
    ZK.inv.draw(h, W, H, g, label);   // Tab 소지품 창 · 투척무기를 들었을 때 안내 (맨 위에 그린다)
    ZK.surv.draw(h, W, H);
    if (g.state === 'pause') {   // ESC: 일시정지 + 설정 패널(가운데, settings3d) — 패널이 열려 있으면 글자를 위로 올린다
      const so = ZK.cfgUI && ZK.cfgUI.isOpen(); h.fillStyle = 'rgba(0,0,0,0.55)'; h.fillRect(0, 0, W, H);
      label('일시정지', cx, so ? cy - 150 : cy - 20, 48); label(so ? '화면을 클릭해서 계속 · ESC 설정 닫기' : '클릭해서 계속 · ESC 설정', cx, so ? cy - 106 : cy + 40, so ? 20 : 24, '#ccc');
    }
    if (g.state === 'over' || g.state === 'win') drawEnd(real);
  }
  function drawTitle() {
    h.fillStyle = 'rgba(0,0,0,0.5)'; h.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    label('좀비킬', cx, cy - 150, 84, '#e8e2d0'); label('이동 요새 서바이벌', cx, cy - 86, 26, '#d23a2a');
    h.globalAlpha = 0.6 + Math.sin(ZK.fx3.time * 4) * 0.4; label('클릭해서 시작', cx, cy - 20, 34); h.globalAlpha = 1;
    // 판이 끝나도 남는 것: 별 · 기록 · 해금
    const md = ZK.meta.data;
    label(`★ ${md.stars}   ·   ${md.runs}판 · 탈출 ${md.wins} · 최고 처치 ${md.bestKills}`, cx, cy + 32, 20, '#ffd23a');
    if (ZK.meta.perks().length > 1) label(`특성: ${ZK.meta.perkName(ZK.meta.perk())}  (P로 바꾸기)`, cx, cy + 60, 16, '#9fe8ff');
    h.font = '600 13px system-ui, sans-serif'; h.textAlign = 'center';
    const ul = ZK.meta.UNLOCKS.map(u => (md.stars >= u.at ? '✓ ' : `★${u.at} `) + u.name.replace('특성: ', ''));
    h.fillStyle = '#8a93a2'; h.fillText('해금: ' + ul.slice(0, 4).join('   '), cx, cy + 82); h.fillText(ul.slice(4).join('   '), cx, cy + 100);   // 8개라 두 줄
    h.font = '600 15px system-ui, sans-serif'; h.fillStyle = '#b8c0cc';
    ['버스 옆에서 시작 — 배낭을 챙기고(F) 버스에 올라(G) · 무전이 부르는 임무 중 하나를 골라 해내고 10:00에 헬기(초록 연기)로 탈출',
      'WASD 운전 · Shift 부스트 · 마우스 조준(←→↑↓) · 좌클릭 사격 · R 장전 · 1~4 무기 · 5 투척 · Tab 소지품 · M 지도 · Alt 둘러보기',
      '총소리는 좀비를 부른다(레이더 아래 소음 게이지) · 빨간 드럼통은 쏘거나 들이받으면 터진다 · 노란 표시를 뒤져 물자를 모아라',
      '폐차 들이받기 = 장갑판 · 초록 신호 생존자 = 지붕 사수 · 레벨업마다 카드 1장 · 탈출 ★★, 임무 성공 ★, 위험 임무는 ★ 하나 더 → 해금',
      '걸을 때 C 앉기 = 몰래 · L 손전등 · 4:42 골목 무기고(걸어서 털기) · 9:20 좀비 해일 — 헬기까지 버텨라 · Esc → ⚙ 설정']
      .forEach((t, i) => h.fillText(t, cx, cy + 132 + i * 28));
  }
  function drawEnd(real) {
    g.overT += real; const cx = W / 2, cy = H / 2, win = g.state === 'win';
    h.fillStyle = win ? `rgba(0,20,8,${Math.min(0.75, g.overT * 0.8)})` : `rgba(20,0,0,${Math.min(0.75, g.overT * 0.8)})`; h.fillRect(0, 0, W, H);
    if (g.overT < 0.5) return;
    label(win ? '탈출 성공!' : g.overWhy, cx, cy - 215, 56, win ? '#7dff9a' : '#e0402e');
    const ml = ZK.meta.last;
    if (ml) { label('★'.repeat(ml.stars) + '☆'.repeat(Math.max(0, ZK.meta.MAX - ml.stars)), cx, cy - 160, 36, '#ffd23a');   // 판당 최대 8 (탈출 2 + 임무 3 + 위험 3)
      h.font = '600 14px system-ui, sans-serif'; h.fillStyle = '#c8cfdb'; h.textAlign = 'center';
      h.fillText(`탈출 ${ml.win ? '★★' : '—'} · 임무 ${ml.done}/3 성공 ${'★'.repeat(Math.min(3, ml.done))} · 위험 ${ml.risky || 0} ${'★'.repeat(Math.min(3, ml.risky || 0))} · 누적 ★ ${ml.total}`, cx, cy - 128); }
    const acc = g.shots ? Math.round(g.hits / g.shots * 100) : 0;
    if (ZK.surv.contract.size) label('이번 판 계약: ' + [...ZK.surv.contract].map(id => ZK.surv.CONTRACTS.find(c => c.id === id).name).join(' · '), cx, cy - 110, 15, '#ff6a5a');
    [['생존', mmss(g.t)], ['레벨', ZK.surv.level], ['처치', g.kills + (ml && ml.rec.kills ? '  최고 기록!' : '')], ['들이받아 처치', g.rams], ['장갑판 / 사수', `${F.modules} / ${F.gunners.length}`], ['명중률', acc + '%'], ['최고 연쇄', g.bestChain]]
      .forEach(([k, v], i) => { label(k, cx - 20, cy - 92 + i * 32, 17, '#aab2c0', 'right'); label(String(v), cx + 10, cy - 92 + i * 32, 21, '#fff', 'left'); });
    // 이번 판의 순간(L6): 쫓긴 기억 2줄 — 가장 아슬아슬했던 체력 · 무기고 · 아슬아슬 회피 · 해일 · 큰 연쇄 (공포 디렉터가 고른다)
    const hl = ZK.dread.highlights ? ZK.dread.highlights(g) : []; hl.forEach((t, i) => label('▶ ' + t, cx, cy + 134 + i * 24, 17, '#ffd23a'));
    if (ml) { let y = cy + 146 + (hl.length ? hl.length * 24 + 4 : 0);
      for (const u of ml.fresh) { label(`새로 해금: ${u.name} — ${u.desc}`, cx, y, 18, '#7dff9a'); y += 26; }
      if (ml.next) { h.font = '600 13px system-ui, sans-serif'; h.fillStyle = '#8a93a2'; h.textAlign = 'center'; h.fillText(`다음 해금: ${ml.next.name} (★${ml.next.at}, ${ml.next.at - ml.total}개 남음)`, cx, y + 4); } }
    if (g.overT > 1.2) { h.globalAlpha = 0.6 + Math.sin(ZK.fx3.time * 4) * 0.4; label('클릭해서 다시', cx, cy + 232, 26); h.globalAlpha = 1; }
  }

  // ───────── 개발용 ─────────
  let frozen = false;
  ZK.debug3 = {
    g, camera,
    freeze(on) { frozen = on; },
    start() { ZK.audio.init(); resetGame(); g.state = 'play'; },
    aimAt(part = 'head', idx = 0) {
      const zs = g.zombies.filter(z => z.alive).sort((a, b) => a.pos.distanceTo(camera.position) - b.pos.distanceTo(camera.position)), z = zs[idx]; if (!z) return 'none';
      const tp = part === 'head' ? z.head.getWorldPosition(new T.Vector3()) : z.torso.getWorldPosition(new T.Vector3());
      const d = tp.clone().sub(camera.position); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ps.recP = ps.recY = 0; return { dist: d.length().toFixed(1), type: z.type };
    },
    shoot(part = 'head', idx = 0) {
      ZK.gun3.state.cd = 0; ZK.gun3.state.sprint = 0; ps.bloom = 0;
      for (let i = 0; i < 4; i++) { this.aimAt(part, idx); ps.aimK = 1; ZK.player.update(0.001, { ads: true }); }
      shoot();
    },
  };

  // ───────── 루프 ─────────
  let last = performance.now();
  function frame(ts) {
    const real = Math.min(0.05, (ts - last) / 1000); last = ts;
    requestAnimationFrame(frame);
    if (frozen) { renderer.clear(); renderer.render(scene, camera); if (fpp()) ZK.gun3.render(renderer); return; }
    tick(real);
  }
  ZK.debug3.tick = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); return ZK.fx3.time.toFixed(2); };
  function tick(real) {
    const playing = g.state === 'play', choosing = ZK.surv.choosing;
    const dt = ZK.fx3.step(real), wdt = choosing ? 0 : dt;
    if (playing) ZK.surv.update(real);
    const k = ZK.player.keys, drive = g.mode === 'drive';
    if (playing && !choosing) {
      g.lastHeading = F.heading;
      if (!ZK.bail.wrecked) ZK.fort.update(dt, drive ? { throttle: (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), steer: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), boost: !!k.ShiftLeft, brake: !!k.Space }
        : { throttle: 0, steer: 0, brake: true }, g);
    } else ZK.audio.engine && ZK.audio.engine(0);
    ps.mounted = drive;
    if (drive && playing && !choosing) ps.yaw += F.heading - g.lastHeading;   // 버스가 돌면 시선도 같이 돈다 (운전대를 꺾었는데 화면이 그대로라 '안 돈다'고 느꼈다)
    if (drive) { ps.mountPos.copy(ZK.fort.deckPoint()); ps.mountVel.copy(ZK.fort.forward()).multiplyScalar(F.speed); }
    const m = ZK.player.mouseFrame();
    const adsOn = mouseR && ZK.gun3.weapon !== 'bat';   // 방망이엔 정조준이 없다
    if ((playing && !choosing) || g.state === 'title') ZK.player.update(real, { ads: adsOn, reloading: ZK.gun3.state.reloading || ZK.gun3.rf.reloading || ZK.gun3.sg.reloading, firing: mouseL });
    if (playing && !choosing && mouseL && !ZK.inv.holdFire()) shoot();
    if (playing && !choosing && g.batHitT > 0 && (g.batHitT -= real) <= 0) batHit();
    ZK.gun3.update(real, { ads: adsOn, sprint: ps.sprint, move: ps.move, air: !ps.onGround, mdx: m.mdx, mdy: m.mdy });
    ZK.char.setVisible(!fpp()); ZK.char.update(real, ps, ZK.gun3.state);
    if ((g.state === 'over' || g.state === 'win') && !g.metaDone) { g.metaDone = true; ZK.meta.finish(g); }   // 별·기록 저장 (한 번만)
    ZK.lod.update(real, g, camera);   // 먼 좀비 장식 생략 (드로우콜)
    ZK.torch.update(real, g, camera);   // 걸을 때 손전등 (L)
    ZK.dread.update(dt, g, camera);   // 공포 디렉터: 위협도·심장박동·긴장 음악 + 추격 규칙(z.rush) — 좀비 이동보다 먼저
    if (playing || g.state === 'over' || g.state === 'win') {
      if (playing && !choosing) {
        g.t += dt; director(dt); ZK.tide.update(dt, g); ZK.raid.update(dt, g); ZK.arms.update(dt, g); ZK.mart.update(dt, g); ZK.police.update(dt, g); ZK.bail.update(dt, g); ZK.tower.update(dt, g); ZK.absorb.update(dt, g);
        if ((g.comboT -= dt) <= 0) g.combo = 0;
        ZK.needs.update(dt, g); ZK.mis.update(dt, g); g.quietT -= dt;
        // 밤 (7:00~): 30초에 걸쳐 어두워지고 안개가 짙어진다 · 좀비 시야 12 → 17m · 포위 +25%
        const nk = g.blackout ? 1 : clamp((g.t - 420) / 30, 0, 1);   // 계약 '정전'이면 그때부터 끝까지 밤
        if (nk !== g.nightK) { if (!g.nightK && nk > 0 && !g.blackout) notice('밤이 온다 — 어두워지고 좀비가 더 멀리서 알아챈다', '#9ab0ff'); setNight(nk); }
        if (g.tutor === 1 && ZK.needs.startPack.done && g.mode === 'foot') { g.tutor = 2; notice('버스로 가서 G로 탑승 — 출발!', '#7dff9a'); ZK.dread.openingScare && ZK.dread.openingScare(g, camera); }   // 첫 습격(L9): 배낭을 줍는 순간 출근러 1마리가 튀어나온다
        // 사람 체력 회복: 4초 동안 안 맞으면 초당 25 (출혈·굶주림 중엔 멈춤) — 이제 버스 위에서도 회복
        if ((g.regenT -= dt) <= 0 && g.hp < 100 && !ZK.needs.s.bleeding && !(g.mode === 'foot' && ZK.needs.starving())) g.hp = Math.min(100, g.hp + 25 * dt);
        // 끼임 안내: 가속 중인데 2초 동안 1.2m도 못 움직이면 "S로 후진" (벽에 붙어 앞뒤로 덜컹이기만 하던 문제)
        if (g.mode === 'drive' && (g.stuckS -= dt) <= 0) { g.stuckS = 0.5; g.stuckH.push([F.pos.x, F.pos.z, !!ZK.player.keys.KeyW]); if (g.stuckH.length > 5) g.stuckH.shift();
          const a = g.stuckH[0], b = g.stuckH[g.stuckH.length - 1]; if (g.stuckH.length === 5 && g.stuckH.every(q => q[2]) && Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.2) g.stuckHint = 1.5; }
        g.stuckHint -= dt;
        if ((F.hp <= 0 && !ZK.bail.onWreck(g)) || g.hp <= 0) { g.state = 'over'; g.overT = 0; g.overWhy = g.hp > 0 ? '요새 파괴' : g.deathBy || (ZK.bail.wrecked ? '탈출하다 쓰러졌다' : '사망'); ZK.fx3.slowmo(0.25, 1.2); ZK.audio.thud(); document.exitPointerLock && document.exitPointerLock(); }   // 버스 체력 0 → 탈출(bail3d) · 게임 오버는 사람이 쓰러질 때
        // 승리: 10:00 이후 헬기 착륙장(반경 10m) 안 · 10:30까지 못 오면 헬기가 떠난다
        if (g.state === 'play' && ZK.mis.canWin(g)) { g.state = 'win'; g.overT = 0; ZK.mis.onWin(); ZK.audio.levelUp(); document.exitPointerLock && document.exitPointerLock(); }
        else if (g.state === 'play' && ZK.mis.missed(g)) { g.state = 'over'; g.overT = 0; g.overWhy = '헬기를 놓쳤다'; ZK.audio.thud(); document.exitPointerLock && document.exitPointerLock(); }
      }
      for (const z of g.zombies) z.update(wdt, g);
      ZK.Zombie3.tickDebris(wdt);   // 날아간 안전모·팔
      g.zombies = g.zombies.filter(z => !z.remove);
      processChain(wdt);
    }
    ZK.fx3.update(wdt); ZK.world.update(real, ZK.fx3.time); if (ZK.city && ZK.city.update) ZK.city.update(real, camera);   // 1탄 도시: 가까운 가로등 8개에 진짜 빛
    muzzleLight.intensity *= Math.exp(-real * 32); boomLight.intensity *= Math.exp(-real * 9);
    if (ZK.debug3.fast) { scene.updateMatrixWorld(); g.tracers.length = 0; g.notices.length = 0; return; }   // 개발용: 렌더 없이 빠른 시뮬레이션 (판정용 위치 행렬은 갱신)
    renderer.clear(); renderer.render(scene, camera);
    if (g.state !== 'title' && fpp() && !ZK.arms.scopeView() && !ZK.inv.throwSel) ZK.gun3.render(renderer);   // 조준경으로 들여다볼 때·투척무기를 들었을 땐 총을 그리지 않는다
    drawHUD(real);
  }
  ZK.debug3.renderer = renderer;
  requestAnimationFrame(frame);
})();
