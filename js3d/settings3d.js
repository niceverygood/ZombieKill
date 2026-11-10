// 설정 패널 (2026-11-10 루프 L6) — 타이틀·일시정지 화면 아래에 뜬다. 값은 이 브라우저에 저장(zk_settings_v1)
// 왜: 공포 디렉터(비네트·시야 좁힘·박동 흔들림)와 손맛 강화(카메라 펀치·섬광)가 겹친다. 멀미·피로가 나면 끌 방법이 있어야 한다(GDD 11장 접근성)
//  · 전체 소리 · 긴장 음악·심장박동 · 화면 효과 세기(흔들림·펀치·섬광 = fx3 juice) · 공포 화면 효과(비네트·시야 좁힘) · 마우스 감도
(function () {
  const KEY = 'zk_settings_v1';
  const DEF = { master: 1, dread: 1, juice: null, fear: 1, sens: 1 };
  const cfg = ZK.cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
  if (cfg.juice === null || cfg.juice === undefined) cfg.juice = ZK.fx3 ? ZK.fx3.J : 1;   // 처음엔 주소의 ?juice= 값(없으면 1)
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 무시 */ } };
  function apply() {
    ZK.audio.setMaster && ZK.audio.setMaster(cfg.master);
    ZK.audio.setDread && ZK.audio.setDread(cfg.dread);
    ZK.fx3.setJuice && ZK.fx3.setJuice(cfg.juice);
  }
  apply();

  const ROWS = [
    ['master', '전체 소리', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
    ['dread', '긴장 음악·심장박동', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
    ['juice', '화면 흔들림·섬광', 0, 1.5, 0.05, v => Math.round(v * 100) + '%'],
    ['fear', '공포 화면 효과(어두워짐·시야 좁힘)', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
    ['sens', '마우스 감도', 0.4, 2, 0.05, v => v.toFixed(2) + '×'],
  ];
  const css = `#zkset{position:fixed;right:16px;bottom:16px;z-index:5;background:rgba(12,14,18,.86);border:1px solid rgba(255,255,255,.14);
    border-radius:10px;padding:12px 16px;color:#d8dde6;font:600 13px system-ui,sans-serif;min-width:0;max-width:calc(100vw - 32px);box-sizing:border-box;display:none;user-select:none}
    #zkset #zk_tog{width:100%;text-align:left} #zkset .body{display:none;margin-top:8px} #zkset.open .body{display:block} #zkset.open{min-width:320px} #zkset .hint{color:#8a93a2;font-weight:600;font-size:11px;margin-bottom:4px}
    #zkset .r{display:grid;grid-template-columns:1fr 120px 44px;gap:8px;align-items:center;margin:5px 0}
    #zkset input[type=range]{width:100%;accent-color:#ffd23a} #zkset .v{text-align:right;color:#fff;font-variant-numeric:tabular-nums}
    #zkset.mid{right:auto;bottom:auto;left:50%;top:calc(50% - 80px);transform:translateX(-50%);min-width:min(360px,calc(100vw - 32px));max-height:calc(50% + 64px);overflow:auto}
    #zkset .b{display:flex;gap:8px;justify-content:flex-end;margin-top:8px} #zkset button{font:700 12px system-ui,sans-serif;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#20242c;color:#d8dde6;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'zkset';
  // 접혀 있다가(⚙ 설정) 누르면 펼친다 — 펼친 채로 두면 작은 창에서 타이틀 안내 글자를 가렸다
  box.innerHTML = '<button id="zk_tog" type="button">⚙ 설정</button><div class="body"><div class="hint">이 브라우저에 저장된다</div>' + ROWS.map(([k, name, lo, hi, step]) =>
    `<div class="r"><label for="zk_${k}">${name}</label><input id="zk_${k}" type="range" min="${lo}" max="${hi}" step="${step}"><span class="v" id="zkv_${k}"></span></div>`).join('') +
    '<div class="b"><button id="zk_reset" type="button">기본값</button></div></div>';
  document.body.appendChild(box);
  const sync = () => { for (const [k, , , , , fmt] of ROWS) { box.querySelector('#zk_' + k).value = cfg[k]; box.querySelector('#zkv_' + k).textContent = fmt(+cfg[k]); } };
  for (const [k, , , , , fmt] of ROWS) box.querySelector('#zk_' + k).addEventListener('input', e => { cfg[k] = +e.target.value; box.querySelector('#zkv_' + k).textContent = fmt(cfg[k]); apply(); save(); });
  const setOpen = on => { box.classList.toggle('open', on); box.querySelector('#zk_tog').textContent = on ? '⚙ 설정 ▾  (ESC 닫기)' : '⚙ 설정  (ESC)'; };
  ZK.cfgUI = { isOpen: () => box.classList.contains('open') && box.style.display === 'block', setOpen };
  box.querySelector('#zk_tog').addEventListener('click', () => setOpen(!box.classList.contains('open')));
  // ESC: 일시정지·타이틀에서 패널을 열고 닫는다 (게임 중 ESC → 일시정지는 game3d·pointerlockchange가 하고, 아래 타이머가 패널을 연다)
  // 캡처 단계: 슬라이더에 포커스가 있어도(패널이 keydown 전파를 막는다) 받는다. ESC로는 마우스를 다시 잠글 수 없어(브라우저 규칙) 계속은 클릭이다
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' || e.repeat) return;
    const g = ZK.debug3 && ZK.debug3.g; if (!g || (g.state !== 'pause' && g.state !== 'title') || performance.now() - pausedAt < 400) return;   // 마우스 잠금을 푼 그 ESC가 뒤늦게 또 와도 방금 연 패널을 닫지 않게
    setOpen(!box.classList.contains('open')); if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur();
  }, true);
  box.querySelector('#zk_reset').addEventListener('click', () => { Object.assign(cfg, DEF, { juice: 1 }); sync(); apply(); save(); });
  for (const ev of ['mousedown', 'click', 'keydown']) box.addEventListener(ev, e => e.stopPropagation());   // 패널을 만져도 게임이 시작·재개되지 않게
  sync(); setOpen(false);
  // 보이기: 타이틀·일시정지일 때만 (rAF가 멈춘 창에서도 동작하게 타이머로)
  // 게임 중 → 일시정지로 바뀌는 순간(ESC·창 전환) 패널을 화면 가운데에 펼친다. 타이틀에선 오른쪽 아래에 접힌 채
  let prev = null, pausedAt = -1e9;
  const tick = () => {
    const g = ZK.debug3 && ZK.debug3.g, s = g ? g.state : null, on = s === 'title' || s === 'pause';
    if (s !== prev) { if (s === 'pause') { box.classList.add('mid'); setOpen(true); pausedAt = performance.now(); } else if (s === 'title') { box.classList.remove('mid'); setOpen(false); } prev = s; }
    if ((box.style.display === 'block') !== on) box.style.display = on ? 'block' : 'none';
  };
  setInterval(tick, 200);
  document.addEventListener('pointerlockchange', () => setTimeout(tick, 0));   // 200ms 기다리지 않고 바로
})();
