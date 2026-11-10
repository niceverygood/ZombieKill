// 배그식 키 배치 + Tab 소지품 창 + 투척무기 칸 (2026-11-10, 손맛 강화 세션)
// 사용자: "키를 배그랑 비슷하게 해줘 — 탭은 내 소지 아이템 보기, 1,2,3,4 숫자키로 무기변경" · "alt 누른 상태에서는 마우스로 뒤도 돌아볼 수 있게"
//  · 1 자동소총 · 2 산탄총 · 3 리볼버(권총) · 4 방망이(근접, 걸어서만) · 5 투척무기(수류탄/화염병 — 다시 누르면 종류 바꿈, 좌클릭으로 던짐)
//  · 마우스 휠: 무기 순환 · Tab: 소지품 창(열린 동안 시점·사격 잠금, 걷기는 됨) · M: 지도(city3d) · N: 음소거(game3d)
//  · 7 붕대 · 8 항생제 · 9 진통제 · 0 생수/통조림(더 급한 쪽) — H(가장 급한 것 자동 사용)는 그대로
//  · T·B 즉시 던지기는 없앴다: 배그에서 B는 사격 모드라, 손에 익은 사람이 수류탄을 날려 버린다
//  · 투척무기 칸: 총은 그대로 두고 그리지만 않는다(game3d가 gun3d.render를 건너뜀) — 던지기는 기존 throwGrenade/throwMolotov 그대로
(function () {
  const I = ZK.inv = { open: false, throwSel: null, wheelT: 0, msg: null };
  const G3 = () => ZK.gun3, N = () => ZK.needs;
  const SLOTS = [['rifle', '자동소총'], ['shotgun', '산탄총'], ['revolver', '리볼버'], ['bat', '방망이']];
  const MISSING = { rifle: '자동소총이 없다 — 주황 아이콘 무기 보급함을 걸어가서 열어라', shotgun: '산탄총이 없다 — 임무를 성공하면 얻는다' };
  const has = w => w === 'revolver' || (w === 'shotgun' && G3().hasShotgun) || (w === 'rifle' && G3().hasRifle) || (w === 'bat' && G3().hasBat);
  const game = () => ZK.debug3 && ZK.debug3.g;
  const live = g => g && g.state === 'play' && !(ZK.surv && ZK.surv.choosing);
  I.reset = () => { I.open = false; I.throwSel = null; I.wheelT = 0; };
  I.holdFire = () => I.open || !!I.throwSel;   // game3d: 이게 참이면 총을 쏘지 않는다

  function equip(w, g) {
    if (w === 'bat' && g.mode !== 'foot') { g.onNotice('방망이는 걸어서만 — 버스에서 내려(G) 휘둘러라', '#ccc'); return false; }
    if (!has(w)) { if (MISSING[w]) g.onNotice(MISSING[w], '#ccc'); return false; }
    const wasThrow = !!I.throwSel; I.throwSel = null;
    if (!G3().switchTo(w) && wasThrow) ZK.audio.cylIn && ZK.audio.cylIn();   // 같은 총이면 다시 꺼내기만
    return true;
  }
  // 투척무기: 수류탄 수 · 화염병 수(술병 + 천 + 연료 5로도 만들 수 있다 — 만들기는 throwMolotov가 한다)
  const craftable = () => { const n = N(); return n.inv.bottle > 0 && n.inv.cloth > 0 && n.s.fuel >= 5; };
  const throwables = () => { const inv = N().inv, out = []; if (inv.grenade > 0) out.push('grenade'); if (inv.molotov > 0 || craftable()) out.push('molotov'); return out; };
  const TNAME = { grenade: '수류탄', molotov: '화염병' };
  function selectThrow() {
    const av = throwables();
    if (!av.length) { N().msg = { text: '던질 게 없다 — 수류탄은 무기 보급함, 화염병은 술병 + 천 + 연료로', t: 1.6 }; return; }
    I.throwSel = I.throwSel ? av[(av.indexOf(I.throwSel) + 1) % av.length] : av[0];
    ZK.audio.cylIn && ZK.audio.cylIn();
  }
  I.throwNow = function (g, cam) {
    const k = I.throwSel; if (!k) return false;
    const ok = k === 'grenade' ? ZK.arms.throwGrenade(g, cam) : ZK.mis.throwMolotov(g, cam);
    if (!throwables().includes(k)) I.throwSel = null;   // 마지막 것을 던졌으면 들고 있던 총으로
    return ok;
  };

  // 소모품 7·8·9·0 (효과는 survival3d의 N.useItem — H와 같은 값)
  function quickUse(code, g) {
    const n = N(), s = n.s, inv = n.inv, say = text => { n.msg = { text, t: 1.4 }; };
    if (code === 'Digit7') return inv.bandage > 0 ? (s.bleeding ? n.useItem('bandage', g) : say('출혈이 없다 — 붕대는 아껴 둔다')) : say('붕대가 없다');
    if (code === 'Digit8') return inv.anti > 0 ? (s.infected ? n.useItem('anti', g) : say('감염되지 않았다')) : say('항생제가 없다');
    if (code === 'Digit9') return inv.pill > 0 ? (s.fatigue >= 5 ? n.useItem('pill', g) : say('피곤하지 않다')) : say('진통제가 없다');
    if (code === 'Digit0') {
      const opts = [['water', 'thirst'], ['can', 'hunger']].filter(([k, st]) => inv[k] > 0 && s[st] < 95).sort((a, b) => s[a[1]] - s[b[1]]);
      return opts[0] ? n.useItem(opts[0][0], g) : say(inv.water > 0 || inv.can > 0 ? '배고프거나 목마르지 않다' : '생수·통조림이 없다');
    }
  }

  addEventListener('keydown', e => {
    if (e.code === 'Tab') e.preventDefault();   // 브라우저가 포커스를 옮기지 않게
    const g = game(); if (!live(g) || e.repeat) return;
    if (e.code === 'Tab') { I.open = !I.open; if (I.open && ZK.city) ZK.city.showMap = false; return; }
    const slot = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (slot !== undefined) { equip(SLOTS[slot][0], g); return; }
    if (e.code === 'Digit5') { selectThrow(); return; }
    if (e.code === 'Digit7' || e.code === 'Digit8' || e.code === 'Digit9' || e.code === 'Digit0') quickUse(e.code, g);
  });
  // 휠: 무기 순환(가진 것만 · 방망이는 걸을 때만) — 트랙패드는 작은 이벤트를 잔뜩 보내서 크기·0.18초 간격을 둔다
  addEventListener('wheel', e => {
    const g = game(); if (!live(g) || I.open || Math.abs(e.deltaY) < 4) return;
    const now = performance.now(); if (now - I.wheelT < 180) return; I.wheelT = now;
    const order = SLOTS.map(s => s[0]).filter(w => has(w) && (w !== 'bat' || g.mode === 'foot'));
    const cur = I.throwSel ? -1 : order.indexOf(G3().weapon), d = e.deltaY > 0 ? 1 : -1;
    const next = order[((cur < 0 ? (d > 0 ? -1 : 0) : cur) + d + order.length) % order.length];
    if (next) equip(next, g);
  }, { passive: true });
  addEventListener('blur', () => { I.open = false; });

  // ───────── 그리기 ─────────
  I.draw = function (h, W, H, g, label) {
    if (g.state !== 'play') { I.open = false; return; }
    if (I.throwSel && !I.open) {   // 투척무기를 든 상태: 총 대신 조준점 아래에 든 것·남은 수·던지는 법
      const inv = N().inv, k = I.throwSel, n = k === 'grenade' ? inv.grenade : inv.molotov;
      label(`${TNAME[k]} ${n}${k === 'molotov' && craftable() ? ' (+만들기)' : ''} — 좌클릭 던지기 · 5 바꾸기 · 1~4 무기`, W / 2, H * 0.62, 16, '#ffd27a');
    }
    if (!I.open) return;
    const n = N(), inv = n.inv, s = n.s, G = G3(), gs = G.state;
    const pw = Math.min(780, W - 32), ph = Math.min(450, H - 120), x0 = (W - pw) / 2, y0 = Math.max(60, (H - ph) / 2);
    h.save();
    h.fillStyle = 'rgba(10,12,16,0.86)'; h.fillRect(x0, y0, pw, ph);
    h.strokeStyle = 'rgba(255,255,255,0.16)'; h.lineWidth = 1; h.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, ph - 1);
    label('소지품', x0 + 18, y0 + 30, 20, '#ffffff', 'left');
    label('Tab 닫기', x0 + pw - 18, y0 + 30, 13, '#8a93a2', 'right');
    const col = (x, y, title) => { label(title, x, y, 13, '#ffd23a', 'left'); return y + 26; };
    const row = (x, y, key, name, info, on, owned = true) => {
      if (on) { h.fillStyle = 'rgba(255,210,58,0.14)'; h.fillRect(x - 8, y - 15, pw / 2 - 26, 22); }
      label(key, x, y, 14, owned ? '#ffd23a' : '#59606b', 'left');
      label(name, x + 22, y, 15, owned ? '#e8ecf2' : '#59606b', 'left');
      label(info, x + 108, y, 13, owned ? '#aab2c0' : '#59606b', 'left');
      return y + 26;
    };
    // 왼쪽: 무기
    const lx = x0 + 26; let y = col(lx, y0 + 66, '무기');
    const cur = I.throwSel ? null : G.weapon, rifleAmmo = inv.rifleAmmo || 0;
    y = row(lx, y, '1', '자동소총', G.hasRifle ? `탄창 ${G.rf.loaded}/${G.RF_MAG} · 소총탄 ${rifleAmmo}` : '없음 — 무기 보급함', cur === 'rifle', G.hasRifle);
    y = row(lx, y, '2', '산탄총', G.hasShotgun ? `장전 ${G.sg.loaded}/2 · 산탄 ${inv.shell || 0}` : '없음 — 임무 보상', cur === 'shotgun', G.hasShotgun);
    y = row(lx, y, '3', '리볼버', `실린더 ${gs.ammo}/${G.cap} · 예비 ${G.reserve === Infinity ? '∞' : G.reserve}${G.hasScope ? ' · 조준경' : ''}`, cur === 'revolver');
    y = row(lx, y, '4', '방망이', g.mode === 'foot' ? '근접 — 휘둘러 밀쳐 낸다' : '근접 — 걸어서만', cur === 'bat', G.hasBat);
    const tw = `수류탄 ${inv.grenade || 0} · 화염병 ${inv.molotov || 0}${craftable() ? ' (+만들기)' : ''}`;
    y = row(lx, y, '5', '투척무기', tw, !!I.throwSel, (inv.grenade || 0) + (inv.molotov || 0) > 0 || craftable());
    y += 10; y = col(lx, y, '재료');
    label(`고철 ${inv.scrap || 0} · 천 ${inv.cloth || 0} · 술병 ${inv.bottle || 0} · 목재 ${inv.wood || 0}`, lx, y, 14, '#c8cfdb', 'left'); y += 20;
    label('술병 + 천 + 연료 5 = 화염병 (5로 꺼내 던지면 바로 만든다)', lx, y, 12, '#8a93a2', 'left');
    // 오른쪽: 소모품 · 상태
    const rx = x0 + pw / 2 + 14; let y2 = col(rx, y0 + 66, '소모품');
    y2 = row(rx, y2, '7', '붕대', `${inv.bandage || 0}개 — 출혈 멈춤`, false, inv.bandage > 0);
    y2 = row(rx, y2, '8', '항생제', `${inv.anti || 0}개 — 감염 −50`, false, inv.anti > 0);
    y2 = row(rx, y2, '9', '진통제', `${inv.pill || 0}개 — 피로 −30`, false, inv.pill > 0);
    y2 = row(rx, y2, '0', '생수·통조림', `${inv.water || 0} · ${inv.can || 0} — 갈증·허기 +40`, false, inv.water > 0 || inv.can > 0);
    y2 = row(rx, y2, 'H', '연료통', `${inv.fuelcan || 0}개 — 연료 +35 (버스에서)`, false, inv.fuelcan > 0);
    y2 += 10; y2 = col(rx, y2, '상태');
    const st = (name, v, warn) => `${name} ${Math.round(v)}${warn ? '!' : ''}`;
    label([st('연료', s.fuel, s.fuel < 25), st('허기', s.hunger, s.hunger < 25), st('갈증', s.thirst, s.thirst < 25), st('피로', s.fatigue, s.fatigue >= 70)].join(' · '), rx, y2, 14, '#c8cfdb', 'left'); y2 += 20;
    const flags = [s.bleeding ? '출혈 중 → 7' : '', s.infected ? `감염 ${Math.round(s.infection)} → 8` : ''].filter(Boolean).join(' · ');
    if (flags) label(flags, rx, y2, 14, '#ff6a5a', 'left');
    label('1~5 무기   |   7 8 9 0 소모품 바로 사용   |   H 가장 급한 것   |   M 지도   |   열려 있는 동안 시점·사격 잠금', W / 2, y0 + ph - 16, 13, '#9aa3b2');   // 12px 굵은 글씨에선 가운뎃점이 테두리에 묻혀 '7 6 9 0'처럼 보였다
    h.restore();
  };
})();
