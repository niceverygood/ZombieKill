// 손맛 A/B 검수 도구 (2026-11-10) — 게임 코드는 고치지 않고, 페이지에서 함수만 감싼다. 새로고침하면 사라진다.
// 불러오기: fps.html 을 연 뒤 개발자 콘솔(⌥⌘J)에 아래 한 줄을 붙여 넣고 Enter
//   fetch('qa/juice_ab.js', {cache: 'reload'}).then(r => r.text()).then(eval)
// 키:
//   [ → 히트스톱 규칙 바꾸기: 지금(예산 규칙, 2026-11-10 적용) → 예전(명중마다 멈춤) → 끔 → 지금 …  (게임의 ZK.fx3.hitstopRule 을 바꾼다 · 주소 ?hitstop=old 와 같음)
//   ] → 화면 흔들림·펀치·섬광 세기 바꾸기: 100% → 0% → 50% → 150% → 100% …  (설정 패널의 '화면 흔들림·섬광'과 같은 값)
// (예전엔 9·0키였는데, 배그식 키 배치에서 9·0이 소모품 키가 돼 [ ]로 옮겼다)
// 왼쪽 위 배지에 지금 규칙과 '최근 1초 동안 화면이 멈춘 시간'이 보인다.
(function () {
  if (window.__juiceAB) return '이미 불러왔어요 ([ · ] 키)';
  const F = ZK.fx3, ostep = F.step;
  if (!F.hitstopRule) return '이 빌드에는 히트스톱 규칙 스위치가 없어요 — Cmd+Shift+R 로 새로고침한 뒤 다시 불러오세요';
  const AB = window.__juiceAB = { frozen: [], juiceSteps: [1, 0, 0.5, 1.5] };
  const NAMES = { budget: '지금(예산)', old: '예전(명중마다)', off: '끔' };
  // 최근 1초 동안 멈춘 시간 (배지 표시용)
  F.step = function (dt) { const out = ostep.call(F, dt); if (dt > 0) { AB.frozen.push([F.time, out === 0 ? dt : 0]); while (AB.frozen.length && AB.frozen[0][0] < F.time - 1) AB.frozen.shift(); } return out; };
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:12px;top:12px;z-index:9;pointer-events:none;background:rgba(10,12,16,.78);color:#e8ecf2;font:600 12px/1.5 system-ui,sans-serif;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);font-variant-numeric:tabular-nums';
  document.body.appendChild(badge);
  let pulse = 0;
  const draw = () => {
    const ms = Math.round(AB.frozen.reduce((m, f) => m + f[1], 0) * 1000), col = ms > 200 ? '#ff6a5a' : ms > 120 ? '#ffc84a' : '#9fe6a0';
    badge.innerHTML = `손맛 A/B · <b style="color:#ffd23a">[</b> 히트스톱: <b>${NAMES[F.hitstopRule]}</b> · <b style="color:#ffd23a">]</b> 화면 효과: <b>${Math.round(F.J * 100)}%</b><br>최근 1초 멈춤 <b style="color:${col}">${ms}ms</b>`;
    badge.style.outline = pulse > 0 ? '2px solid #ffd23a' : 'none';
  };
  setInterval(() => { pulse--; draw(); }, 100);
  addEventListener('keydown', e => {
    if (e.code === 'BracketLeft') { const m = ['budget', 'old', 'off']; F.hitstopRule = m[(m.indexOf(F.hitstopRule) + 1) % 3]; pulse = 6; }
    else if (e.code === 'BracketRight') { const st = AB.juiceSteps, i = st.findIndex(v => Math.abs(v - F.J) < 1e-6); F.setJuice(st[(i + 1) % st.length]); if (ZK.cfg) ZK.cfg.juice = F.J; pulse = 6; }
    else return;
    draw();
  });
  draw();
  return '손맛 A/B 준비됨 — [: 히트스톱(지금/예전/끔) · ]: 화면 효과(100/0/50/150%)';
})();
