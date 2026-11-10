// 손전등 (2026-11-10 루프 L8) — 걸어 다닐 때 L로 켜고 끈다
// 왜: 7:00부터 밤 안개가 짙어지고 공포 화면 효과(가장자리 어둠)가 겹쳐, 걸을 때 앞이 거의 안 보였다(버스는 전조등이 있다)
//  · 켜면 앞 28m가 밝아지는 대신 좀비가 나를 알아채는 거리 ×1.3 (몰래 걷기 L7과 맞물리는 선택: 보고 들킬까, 숨어서 더듬을까)
//  · 버스에 타면 꺼진다. 밤에 처음 내렸는데 꺼져 있으면 한 번 알려 준다
//  · 빛은 처음 한 번만 만들고 세기만 바꾼다 — 빛 개수가 바뀌면 모든 재질 셰이더가 다시 컴파일돼 화면이 멈칫한다
(function () {
  const T = THREE;
  const R = ZK.torch = { on: false, hinted: false, stats: { onSec: 0, toggles: 0 } };
  let light = null, target = null, flick = 0;
  const _f = new T.Vector3();
  function ensure(cam) {
    if (light || !cam.parent) return;
    light = new T.SpotLight(0xfff2d8, 0, 30, 0.5, 0.5, 1.2); target = new T.Object3D();
    cam.parent.add(light); cam.parent.add(target); light.target = target;
  }
  R.reset = function () { R.on = false; R.hinted = false; R.stats = { onSec: 0, toggles: 0 }; if (light) light.intensity = 0; };
  addEventListener('keydown', e => {
    if (e.code !== 'KeyL' || e.repeat) return;
    const g = ZK.debug3 && ZK.debug3.g; if (!g || g.state !== 'play' || g.mode !== 'foot' || (ZK.surv && ZK.surv.choosing)) return;
    R.on = !R.on; R.stats.toggles++; ZK.audio.ting && ZK.audio.ting(0);   // 딸깍
  });
  R.update = function (real, g, cam) {
    ensure(cam); if (!light) return;
    if (g.state !== 'play' || g.mode !== 'foot') { if (g.mode === 'drive') R.on = false; light.intensity = 0; return; }
    if (!R.hinted && (g.nightK || 0) > 0.5 && !R.on) { R.hinted = true; g.onNotice && g.onNotice('어둡다 — L: 손전등 (대신 더 잘 들킨다)', '#ffe8b0'); }
    if (!R.on) { light.intensity = 0; return; }
    R.stats.onSec += real;
    cam.getWorldDirection(_f);
    light.position.copy(cam.position).addScaledVector(_f, 0.3); light.position.y -= 0.15;
    target.position.copy(cam.position).addScaledVector(_f, 10);
    flick += real; light.intensity = 4.2 * (0.96 + 0.04 * Math.sin(flick * 23) * Math.sin(flick * 7.3));   // 아주 약한 떨림
  };
  R.stealthMul = () => (R.on ? 1.3 : 1);
})();
