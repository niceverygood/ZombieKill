// 성장: 경험치 → 레벨업 → 카드 3장 중 1장 (리볼버 · 요새 · 자동 무기 · 오버킬) · 수치(stats)는 총·요새·게임이 읽어 감
(function () {
  const S = {};
  const BASE = { dmgMul: 1, rateMul: 1, reloadMul: 1, pierce: 0, headMul: 2.5, okThresh: 0.5, okRadius: 1, xpMul: 1,
    engineMul: 1, ramMul: 1, armor: 0, regen: 0, gunnerMul: 1, cannonLv: 0, flameLv: 0, shockLv: 0, headBurst: false, grinder: false, hellfire: false };
  const CAT = { '리볼버': '#ffd23a', '오버킬': '#ff6a4a', '요새': '#8fd18f', '자동 무기': '#6fb8ff', '성장': '#c89bff', '응급': '#ff9a9a', '진화': '#ff4ad2', '계약': '#ff3b3b' };
  const UP = [
    { id: 'dmg', cat: '리볼버', name: '매그넘 탄', max: 5, desc: () => '리볼버 데미지 +25%', apply: s => { s.dmgMul += 0.25; } },
    { id: 'rate', cat: '리볼버', name: '빠른 손', max: 4, desc: () => '연사 속도 +18%', apply: s => { s.rateMul += 0.18; } },
    { id: 'reload', cat: '리볼버', name: '스피드로더', max: 3, desc: () => '장전 속도 +35%', apply: s => { s.reloadMul += 0.35; } },
    { id: 'pierce', cat: '리볼버', name: '관통탄', max: 3, desc: () => '탄이 좀비를 1마리 더 뚫고 나감', apply: s => { s.pierce += 1; } },
    { id: 'head', cat: '리볼버', name: '헤드헌터', max: 3, desc: () => '헤드샷 배율 +0.7', apply: s => { s.headMul += 0.7; } },
    { id: 'ok', cat: '오버킬', name: '과잉 살상', max: 3, desc: () => '시체 폭발 조건 완화 · 폭발 반경 +30%', apply: s => { s.okThresh = Math.max(0.2, s.okThresh - 0.1); s.okRadius += 0.3; } },
    { id: 'ram', cat: '요새', name: '충각 가시', max: 4, desc: () => '들이받기 피해 +50%', apply: s => { s.ramMul += 0.5; } },
    { id: 'engine', cat: '요새', name: '엔진 개조', max: 3, desc: () => '요새 최고 속도 +12%', apply: s => { s.engineMul += 0.12; } },
    { id: 'armor', cat: '요새', name: '강판 보강', max: 5, desc: () => '받는 피해 -8% · 최대 체력 +60', apply: s => { s.armor += 1; ZK.fort.state.maxHp += 60; ZK.fort.state.hp += 60; } },
    { id: 'repair', cat: '요새', name: '수리 드론', max: 3, desc: () => '요새 체력 초당 +0.6 회복', apply: s => { s.regen += 0.6; } },
    { id: 'cannon', cat: '자동 무기', name: '지붕 포탑', max: 5, desc: l => (l ? '포탑 연사·피해 증가' : '지붕에 자동 포탑 설치'), apply: s => { s.cannonLv++; ZK.fort.unlockCannon(); } },
    { id: 'flame', cat: '자동 무기', name: '화염 고리', max: 4, desc: l => (l ? '화염 피해 증가' : '요새 주변 좀비를 태우는 불길'), apply: s => { s.flameLv++; } },
    { id: 'shock', cat: '자동 무기', name: '전기 울타리', max: 4, desc: l => (l ? '감전 피해 증가' : '요새에 달라붙은 좀비를 감전'), apply: s => { s.shockLv++; } },
    { id: 'gunner', cat: '자동 무기', name: '사수 훈련', max: 4, desc: () => '생존자 사수 피해 +30%', apply: s => { s.gunnerMul += 0.3; }, need: () => ZK.fort.state.gunners.length > 0 },
    { id: 'xp', cat: '성장', name: '전리품 감각', max: 3, desc: () => '경험치 +20%', apply: s => { s.xpMul += 0.2; } },
  ];
  // 진화: 두 카드를 충분히 올리면 한 번만 나오는 최종 형태 (나오면 맨 앞 칸에 고정)
  const EVO = [
    { id: 'rail', cat: '진화', name: '레일 리볼버', max: 1, evo: true, req: l => (l.dmg || 0) >= 3 && (l.pierce || 0) >= 2, desc: () => '관통 무제한 · 헤드샷으로 죽이면 언제나 시체 폭발', apply: s => { s.pierce += 99; s.headBurst = true; } },
    { id: 'grinder', cat: '진화', name: '분쇄 범퍼', max: 1, evo: true, req: l => (l.ram || 0) >= 3 && (l.engine || 0) >= 2, desc: () => '들이받아 죽이면 주변 3m 폭발 · 들이받기 반동 피해 없음', apply: s => { s.grinder = true; } },
    { id: 'hellfire', cat: '진화', name: '지옥불 고리', max: 1, evo: true, req: l => (l.flame || 0) >= 3 && (l.shock || 0) >= 1, desc: () => '화염 고리 범위 1.5배 · 피해 2배', apply: s => { s.hellfire = true; } },
  ];
  const HEAL = { id: 'heal', cat: '응급', name: '긴급 수리', max: 999, desc: () => '요새 체력 +100', apply: () => { const f = ZK.fort.state; f.hp = Math.min(f.maxHp, f.hp + 100); } };
  // 무리한 개조 계약 (2026-11-09): 레벨 6부터 카드 화면 3번에 1번꼴로 셋째 칸에 뜬다 · 판당 최대 2장 · 거절해도 된다(다른 카드 고르기)
  // 고르면 그 판의 놀이 방식이 통째로 바뀌고 버스 외형도 바뀐다. ①②③은 처음부터, ④⑤는 누적 별로 해금(meta)
  const CONTRACTS = [
    { id: 'lone', name: '외로운 총잡이', desc: () => '사수 전원 → 장갑판 · 이후 생존자는 식량으로 · 리볼버 7발 · 피해 +40% · 헤드샷 처치마다 1발 즉시 장전',
      apply: s => { s.dmgMul += 0.4; ZK.gun3.setCap(7); const n = ZK.fort.dropGunners(); for (let i = 0; i < n; i++) ZK.fort.grow(0x3a3a3a); } },
    { id: 'nobrake', name: '브레이크 철거', desc: () => 'Space가 드리프트(회전 ×2) · 최고 속도 +25% · 들이받기 +80% · 감속은 S로만, 내리려면 시속 6km 아래',
      apply: s => { s.ramMul += 0.8; } },
    // 경험치 ×1.5 → ×1.2 (2026-11-09 카드 과다): 계약을 끈 A/B보다 10분 레벨이 4~5 높았다
    { id: 'blackout', name: '정전', desc: () => '가로등이 모두 꺼지고 끝까지 밤(좀비 시야 17m) · 전조등 +30% · 경험치 ×1.2',
      apply: s => { s.xpMul *= 1.2; ZK.world.lightsOff(); ZK.fort.headlightK(1.3); } },
    { id: 'nitro', name: '직분사 부스트', unlock: 'contractNitro', desc: () => '부스트가 연료 대신 버스 체력을 초당 3 태운다 · 대신 버스 뒤 6m에 불꽃 꼬리(초당 40)',
      apply: () => {} },
    { id: 'blood', name: '혈액 연료 엔진', unlock: 'contractBlood', desc: () => '연료가 시간으로 줄지 않는다 · 로드킬 1마리마다 연료 +1.2 · 4초 넘게 로드킬이 없으면 출력 −30%',
      apply: () => {} },
  ].map(c => Object.assign(c, { cat: '계약', max: 1, contract: true }));
  S.CONTRACTS = CONTRACTS;

  // 필요 경험치: 6 + 5L + XP_Q·L² (2026-11-09 카드 과다)
  // 예전 4 + 3.2L은 41~53레벨이라 카드가 12초마다 떴다 → 6 + 5L + 0.12L²로 18~22레벨을 노렸다
  // 그 뒤 처치가 늘어(AIR·스키트·계약) 보통·숙련이 25~33레벨, 판당 카드 40~50장이 됐다
  // 봇 18판: 0.5면 숙련 20~23레벨·위기 생김, 보통은 8~19레벨로 0/6 생존(너무 셈) → 중간값을 쓴다
  const XP_Q = 0.3; S.XP_Q = XP_Q;
  const nextFor = L => Math.round(6 + 5 * L + (S.xpQ ?? XP_Q) * L * L);   // S.xpQ: 개발용 덮어쓰기(봇 A/B)
  S.reset = function () { Object.assign(S, { stats: { ...BASE }, lv: {}, level: 1, xp: 0, next: nextFor(1), pending: 0, choosing: false, cards: [], sel: 1, selX: 0, openT: 0,
    hold: 0, waitT: 0, batchN: 0, batchI: 0, contract: new Set() }); };
  S.reset();
  S.addXP = function (v) {
    S.xp += v * S.stats.xpMul;
    while (S.xp >= S.next) { S.xp -= S.next; S.level++; S.next = nextFor(S.level); S.pending++; S.hold = 0; }
  };
  S.grant = n => { S.pending += n; S.hold = 0; };
  // 레벨업 묶기: 레벨이 오르면 바로 화면을 멈추지 않고 1초 더 기다린다(최대 3초).
  // 그사이 또 오른 레벨은 같은 카드 화면에서 연달아 고른다 → 팡파르·정지 화면은 한 번만
  S.update = function (dt) {
    if (!S.choosing && S.pending > 0) { S.hold += dt; S.waitT += dt; if (S.hold >= 1 || S.waitT >= 3) open(true); }
    if (S.choosing) S.openT += dt;
  };
  function open(first) {
    const pool = UP.filter(u => (S.lv[u.id] || 0) < u.max && (!u.need || u.need()));
    for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    S.cards = pool.slice(0, 3); while (S.cards.length < 3) S.cards.push(HEAL);
    const evo = EVO.find(e => !S.lv[e.id] && e.req(S.lv)); if (evo) S.cards[0] = evo;
    if (S.level >= 6 && S.contract.size < 2 && Math.random() < 1 / 3) {   // 계약은 셋째 칸
      const cs = CONTRACTS.filter(c => !S.contract.has(c.id) && (!c.unlock || (ZK.meta && ZK.meta.unlocked(c.unlock))));
      if (cs.length) S.cards[2] = cs[(Math.random() * cs.length) | 0];
    }
    S.sel = 1; S.selX = 0; S.choosing = true;
    if (first) { S.batchN = S.pending; S.batchI = 1; S.openT = 0; ZK.audio.levelUp && ZK.audio.levelUp(); }
    else { S.batchI++; S.openT = 0.12; }   // 묶음의 다음 장: 페이드·팡파르 없이 바로 (오클릭 방지 대기 0.18초만)
  }
  S.choose = function (i) {
    if (!S.choosing || S.openT < 0.3) return;   // 실수로 바로 넘기지 않게 잠깐 대기
    const u = S.cards[i]; if (!u) return;
    const l = S.lv[u.id] || 0; u.apply(S.stats, l); S.lv[u.id] = l + 1;
    if (u.contract) { S.contract.add(u.id); ZK.fort.contractLook && ZK.fort.contractLook(u.id); S.onContract && S.onContract(u); }
    S.pending--; S.choosing = false; ZK.audio.cylIn();
    if (S.pending > 0 && S.batchI < S.batchN) open(false);   // 같은 묶음이면 이어서
    else { S.hold = 0; S.waitT = 0; S.batchN = S.batchI = 0; }
  };
  S.onKey = function (code) {
    if (!S.choosing) return false;
    if (code === 'Digit1') S.choose(0); else if (code === 'Digit2') S.choose(1); else if (code === 'Digit3') S.choose(2);
    else if (code === 'KeyA' || code === 'ArrowLeft') S.sel = Math.max(0, S.sel - 1);
    else if (code === 'KeyD' || code === 'ArrowRight') S.sel = Math.min(2, S.sel + 1);
    else if (code === 'Enter' || code === 'Space') S.choose(S.sel);
    return true;
  };
  S.onMouse = function (dx) { if (!S.choosing) return; S.selX += dx; if (S.selX > 80) { S.sel = Math.min(2, S.sel + 1); S.selX = 0; } if (S.selX < -80) { S.sel = Math.max(0, S.sel - 1); S.selX = 0; } };
  S.onClick = function () { if (S.choosing) S.choose(S.sel); };

  function wrap(h, text, x, y, maxW, lh) {
    let line = '', yy = y;
    for (const ch of text.split(' ')) { const t = line ? line + ' ' + ch : ch; if (h.measureText(t).width > maxW && line) { h.fillText(line, x, yy); line = ch; yy += lh; } else line = t; }
    if (line) h.fillText(line, x, yy);
  }
  S.draw = function (h, W, H) {
    if (!S.choosing) return;
    const k = Math.min(1, S.openT / 0.25);
    h.fillStyle = `rgba(5,6,10,${0.62 * k})`; h.fillRect(0, 0, W, H);
    h.textAlign = 'center'; h.textBaseline = 'middle';
    h.font = '900 40px "Arial Black", Impact, system-ui'; h.lineWidth = 7; h.strokeStyle = '#000';
    const lvT = `레벨 ${S.level}`;   // 보급 상자 카드는 레벨이 오르지 않으므로 '몇 번째 카드인지'만 따로 표시
    h.strokeText(lvT, W / 2, H * 0.17); h.fillStyle = '#ffe27a'; h.fillText(lvT, W / 2, H * 0.17);
    if (S.batchN > 1) { h.font = '800 18px system-ui, sans-serif'; h.fillStyle = '#c8cfdb'; h.fillText(`카드  ${S.batchI} / ${S.batchN}`, W / 2, H * 0.17 + 36); }
    const cw = Math.min(250, W * 0.28), ch = 300, gap = 22, x0 = W / 2 - (cw * 3 + gap * 2) / 2, y0 = H / 2 - ch / 2 + (1 - k) * 60;
    S.cards.forEach((u, i) => {
      const sel = i === S.sel, x = x0 + i * (cw + gap), y = y0 - (sel ? 14 : 0), col = CAT[u.cat] || '#fff', l = S.lv[u.id] || 0;
      h.globalAlpha = k;
      h.fillStyle = sel ? 'rgba(30,34,44,0.97)' : 'rgba(18,20,26,0.92)'; h.fillRect(x, y, cw, ch);
      h.strokeStyle = sel ? col : 'rgba(255,255,255,0.18)'; h.lineWidth = sel ? 4 : 2; h.strokeRect(x, y, cw, ch);
      h.fillStyle = col; h.fillRect(x, y, cw, 6);
      if (u.contract) {   // 계약 카드: 빨강·검정 사선 줄무늬 테두리
        h.save(); h.beginPath(); h.rect(x, y, cw, ch); h.rect(x + 12, y + 12, cw - 24, ch - 24); h.clip('evenodd');
        for (let sx = -ch; sx < cw + ch; sx += 24) { h.fillStyle = (sx / 24) % 2 ? '#111' : '#c81e1e'; h.beginPath(); h.moveTo(x + sx, y); h.lineTo(x + sx + 12, y); h.lineTo(x + sx + 12 - ch, y + ch); h.lineTo(x + sx - ch, y + ch); h.closePath(); h.fill(); }
        h.restore();
      }
      h.font = '700 15px system-ui, sans-serif'; h.fillStyle = col; h.fillText(u.cat, x + cw / 2, y + 34);
      h.font = '900 26px system-ui, sans-serif'; h.fillStyle = '#fff'; h.fillText(u.name, x + cw / 2, y + 84);
      h.font = '800 16px system-ui, sans-serif'; h.fillStyle = l === 0 && u.id !== 'heal' ? '#7dff9a' : '#aab2c0';
      if (u.evo) h.fillStyle = '#ff4ad2';
      if (u.contract) h.fillStyle = '#ff5a4a';
      h.fillText(u.contract ? '이번 판 끝까지 · 되돌릴 수 없음' : u.evo ? '진화!' : u.id === 'heal' ? '즉시' : l === 0 ? 'NEW' : `Lv ${l} → ${l + 1}`, x + cw / 2, y + 120);
      h.font = '500 16px system-ui, sans-serif'; h.fillStyle = '#d8dce4'; wrap(h, u.desc(l), x + cw / 2, y + 168, cw - 34, 24);
      h.font = '900 22px system-ui, sans-serif'; h.fillStyle = sel ? col : '#666'; h.fillText(String(i + 1), x + cw / 2, y + ch - 30);
    });
    h.globalAlpha = 1;
    h.font = '600 15px system-ui, sans-serif'; h.fillStyle = '#aab2c0';
    h.fillText('1 · 2 · 3 키로 선택  ·  마우스 좌우로 고르고 클릭', W / 2, y0 + ch + 44);
  };
  ZK.surv = S;
})();
