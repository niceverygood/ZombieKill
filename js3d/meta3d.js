// 판이 끝나도 남는 것: 별(탈출 ★★ + 임무 성공마다 ★, 판당 최대 5) · 기록 · 별 누적으로 해금(시작 무기·버스 개조·특성)
// 저장은 이 브라우저의 localStorage. 봇 검수 때는 ZK.meta.bot = true로 저장·해금을 끈다(난이도 측정 오염 방지)
(function () {
  const M = {};
  const KEY = 'zk_meta_v1';
  const UNLOCKS = [
    { at: 4, id: 'mechanic', kind: 'perk', name: '특성: 정비공', desc: '연료 소모 −35% · 폐차 흡수 연료 2배' },
    { at: 8, id: 'shotgunStart', kind: 'mod', name: '산탄총으로 시작', desc: '시작부터 산탄총 + 산탄 6' },
    { at: 11, id: 'contractNitro', kind: 'contract', name: '계약: 직분사 부스트', desc: '무리한 개조 계약에 직분사 부스트가 나온다' },
    { at: 14, id: 'armorBus', kind: 'mod', name: '장갑 버스', desc: '시작 최대 체력 +100' },
    { at: 17, id: 'contractBlood', kind: 'contract', name: '계약: 혈액 연료 엔진', desc: '무리한 개조 계약에 혈액 연료 엔진이 나온다' },
    { at: 21, id: 'medic', kind: 'perk', name: '특성: 의무병', desc: '시작 붕대 +2 · 항생제 +1 · 출혈 피해 절반' },
    { at: 28, id: 'escortStart', kind: 'mod', name: '사수 동승', desc: '시작부터 사수 1명' },
    { at: 39, id: 'hunter', kind: 'perk', name: '특성: 사냥꾼', desc: '헤드샷 배율 +0.5 · 리볼버 피해 +10%' },
  ];
  const defaults = () => ({ stars: 0, runs: 0, wins: 0, bestKills: 0, bestTime: 0, bestStars: 0, perk: null });
  function load() { try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return defaults(); } }
  function save() { if (M.bot) return; try { localStorage.setItem(KEY, JSON.stringify(M.data)); } catch (e) { /* 저장 불가 창이면 이번 세션만 */ } }
  M.data = load(); M.bot = false; M.UNLOCKS = UNLOCKS;
  // 저장 옮기기 (2026-11-09): 판당 별이 5 → 8로 늘며 해금 구간을 ×1.4로 다시 잡았다 → 예전 저장의 별도 ×1.4 해 이미 연 해금을 잃지 않게 (한 번만)
  if (!M.data.ver) { if (M.data.runs > 0) { M.data.stars = Math.round(M.data.stars * 1.4); M.data.bestStars = Math.round(M.data.bestStars * 1.4); } M.data.ver = 2; save(); }   // 새 저장은 그냥 ver 2
  M.unlocked = id => !M.bot && M.data.stars >= UNLOCKS.find(u => u.id === id).at;
  M.perks = () => [null].concat(UNLOCKS.filter(u => u.kind === 'perk' && M.unlocked(u.id)).map(u => u.id));
  M.perk = () => (M.bot || !M.data.perk || !M.unlocked(M.data.perk) ? null : M.data.perk);
  M.perkName = id => (id ? UNLOCKS.find(u => u.id === id).name.replace('특성: ', '') : '없음');
  M.cyclePerk = () => { const p = M.perks(), i = p.indexOf(M.perk()); M.data.perk = p[(i + 1) % p.length]; save(); };

  // 판 시작 보너스 (resetGame 끝에서)
  M.applyStart = function () {
    if (M.bot) return;
    const F = ZK.fort.state, N = ZK.needs, S = ZK.surv.stats, p = M.perk();
    if (M.unlocked('armorBus')) { F.maxHp += 100; F.hp += 100; }
    if (M.unlocked('escortStart')) ZK.fort.addGunner();
    if (M.unlocked('shotgunStart')) { ZK.gun3.giveShotgun(); N.give('shell', 6); }
    if (p === 'medic') { N.give('bandage', 2); N.give('anti', 1); }
    if (p === 'hunter') { S.headMul += 0.5; S.dmgMul += 0.1; }
  };
  M.fuelK = () => (M.perk() === 'mechanic' ? 0.65 : 1);
  M.carFuel = () => (M.perk() === 'mechanic' ? 6 : 3);
  M.bleedK = () => (M.perk() === 'medic' ? 0.5 : 1);

  // 판 끝: 별 = 탈출 ★★ + 성공한 임무마다 ★ + 위험 임무 성공마다 ★ 하나 더 (최대 8) → 누적 별로 해금
  // 두 갈래 무전(2026-11-09)으로 판당 최대 별이 5 → 8이 되어 해금 구간을 ×1.4로 다시 잡았다 (3·6·10·15·20·28 → 4·8·14·21·28·39)
  M.MAX = 8;
  M.finish = function (g) {
    const win = g.state === 'win', done = ZK.mis.done, risky = ZK.mis.riskyDone || 0, stars = (win ? 2 : 0) + Math.min(3, done) + Math.min(3, risky), d = M.data, before = d.stars;
    d.runs++; if (win) d.wins++; d.stars += stars;
    const rec = { kills: g.kills > d.bestKills, time: Math.round(g.t) > d.bestTime && !win };
    d.bestKills = Math.max(d.bestKills, g.kills); d.bestTime = Math.max(d.bestTime, Math.round(g.t)); d.bestStars = Math.max(d.bestStars, stars);
    const fresh = M.bot ? [] : UNLOCKS.filter(u => before < u.at && d.stars >= u.at);
    save();
    M.last = { stars, win, done, risky, fresh, total: d.stars, rec, next: UNLOCKS.find(u => d.stars < u.at) };
    return M.last;
  };
  ZK.meta = M;
})();
