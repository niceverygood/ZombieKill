// 손맛 계측 프로브 (game-review 스킬 · 2026-11-10 손맛 검수용) — 게임 코드는 고치지 않고 함수를 감싸 기록만 한다
// 사용: bot_harness.js 를 먼저 불러온 뒤 → const c = await (await fetch('qa/juice_probe.js', {cache:'reload'})).text(); (0, eval)(c);
//       __startRun 을 부를 때마다 계측이 새로 시작되고, 판이 끝나면 __juiceRuns 에 쌓인다 → __juiceExport()
// 무엇을 재나:
//  · 시간: 히트스톱(게임이 멈춘 실제 시간) · 슬로모 · 1초 창마다 멈춘 비율 · 가장 길게 이어진 멈춤
//  · 화면: 흔들림 각도(요·피치 합성, 롤) · 위치 흔들림 · 화각 펀치(fovPunch)
//  · 섬광: 호출마다 밝기 증가량 추정 → WCAG 2.3.1(1초에 3번 넘는 번쩍임 · 붉은 번쩍임) 위반 창 수
//  · 조준: 한 발마다 '화면 가운데(조준선)'와 '실제 탄 방향(aimQuat)'의 차이 · 그 거리에서 좀비 머리가 보이는 각도와 비교
(function () {
  if (window.__juiceProbe) return 'probe already';
  window.__juiceProbe = true;
  const F = ZK.fx3, P = ZK.player, D = ZK.debug3, g = D.g, T = THREE, cam = D.camera;
  const DEG = 180 / Math.PI;
  window.__juiceRuns = window.__juiceRuns || [];
  let J = null;
  const newRun = () => ({
    realT: 0, frozenT: 0, slowT: 0, slowLost: 0, curFreeze: 0, maxFreeze: 0, freezeStreaks: [],
    secFreeze: [], secSlow: [],
    hitstops: {}, slowmos: {}, traumaCalls: 0, traumaSum: 0, punches: 0, fovKicks: 0, impacts: {},
    shakeHist: { a05: 0, a1: 0, a2: 0, a3: 0, r2: 0, r4: 0 }, shakeMax: { ang: 0, roll: 0, pos: 0, back: 0 }, shakeSum: 0,
    fovHist: { f3: 0, f6: 0 }, fovMax: 0, fovMin: 0,
    flashes: [], shots: [], hsLog: [], kills: 0, killConfirms: 0, J: F.J,
  });
  const flashLum = (r, gg, b) => { const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b); };

  // ── 시간 (F.step 은 매 틱 처음에 한 번 불린다) ──
  const ostep = F.step; F.step = function (dt) {
    const out = ostep.call(F, dt);
    if (!J || g.state !== 'play') return out;
    J.realT += dt; const sec = Math.floor(J.realT);
    const frozen = dt > 0 && out === 0, slow = out > 0 && out < dt * 0.995;
    if (frozen) { J.frozenT += dt; J.curFreeze += dt; J.secFreeze[sec] = (J.secFreeze[sec] || 0) + dt; }
    else { if (J.curFreeze > 0) { J.maxFreeze = Math.max(J.maxFreeze, J.curFreeze); if (J.curFreeze >= 0.15) J.freezeStreaks.push([+g.t.toFixed(1), +J.curFreeze.toFixed(3)]); } J.curFreeze = 0; }
    if (slow) { J.slowT += dt; J.slowLost += dt - out; J.secSlow[sec] = (J.secSlow[sec] || 0) + (dt - out); }
    // 흔들림 (이번 틱 카메라가 쓸 값)
    const s = F.shake(), ang = Math.hypot(s.yaw, s.pitch) * DEG, roll = Math.abs(s.roll) * DEG, pos = Math.hypot(s.x, s.y);
    const H = J.shakeHist; if (ang > 0.5) H.a05 += dt; if (ang > 1) H.a1 += dt; if (ang > 2) H.a2 += dt; if (ang > 3) H.a3 += dt; if (roll > 2) H.r2 += dt; if (roll > 4) H.r4 += dt;
    const M = J.shakeMax; M.ang = Math.max(M.ang, ang); M.roll = Math.max(M.roll, roll); M.pos = Math.max(M.pos, pos); M.back = Math.max(M.back, Math.abs(s.back)); J.shakeSum += ang * dt;
    const fp = P.state.fovPunch; if (Math.abs(fp) > 3) J.fovHist.f3 += dt; if (Math.abs(fp) > 6) J.fovHist.f6 += dt; J.fovMax = Math.max(J.fovMax, Math.min(12, fp)); J.fovMin = Math.min(J.fovMin, Math.max(-9, fp));
    return out;
  };
  const wrap = (obj, name, fn) => { const o = obj[name]; obj[name] = function (...a) { if (J && g.state === 'play') fn(a); return o.apply(this, a); }; };
  wrap(F, 'hitstop', a => { const k = (+a[0]).toFixed(3); J.hitstops[k] = (J.hitstops[k] || 0) + 1; J.hsLog.push([+J.realT.toFixed(4), +a[0]]); });   // 실제 시각과 요청 길이 → 오프라인에서 다른 규칙(상한·쿨다운)을 다시 계산
  wrap(F, 'slowmo', a => { const k = a[0] + '×' + a[1]; J.slowmos[k] = (J.slowmos[k] || 0) + 1; });
  wrap(F, 'trauma', a => { J.traumaCalls++; J.traumaSum += +a[0]; });
  wrap(F, 'punch', () => { J.punches++; });
  wrap(F, 'impact', a => { const k = a[1] || 'body'; J.impacts[k] = (J.impacts[k] || 0) + 1; });
  wrap(P, 'fovKick', () => { J.fovKicks++; });
  wrap(F, 'flash', a => {
    const [r, gg, b, al, dur, kind = 'full'] = a, aEff = al * Math.min(1.3, F.J);
    // 테두리 섬광은 화면 바깥쪽(넓이의 대략 60%)에만 평균 0.6배로 깔린다 → 밝기 증가 = 알파 × 색 밝기 × (테두리면 0.6)
    const dl = aEff * flashLum(r, gg, b) * (kind === 'edge' ? 0.6 : 1), red = r / (r + gg + b + 1e-6) >= 0.8 && aEff * (kind === 'edge' ? 0.6 : 1) >= 0.1;
    J.flashes.push([+J.realT.toFixed(3), +dl.toFixed(4), kind, red ? 1 : 0, r + ',' + gg + ',' + b, +aEff.toFixed(3)]);
  });
  if (ZK.audio.killConfirm) wrap(ZK.audio, 'killConfirm', () => { J.killConfirms++; });
  // ── 조준선 vs 실제 탄 방향 (발사 순간) ──
  const _cf = new T.Vector3(), _af = new T.Vector3(), _zp = new T.Vector3();
  const ofire = ZK.gun3.fire; ZK.gun3.fire = function (...a) {
    const r = ofire.apply(this, a);
    if (r && J && g.state === 'play') {
      cam.getWorldDirection(_cf); _af.set(0, 0, -1).applyQuaternion(P.aimQuat());
      const div = _cf.angleTo(_af) * DEG;
      // 탄 방향 5° 안에서 가장 가까운 좀비까지 거리 → 그 거리에서 머리(반지름 0.15m)가 보이는 각반지름
      let best = null; for (const z of g.zombies) { if (!z.alive) continue; z.head.getWorldPosition(_zp); const d = _zp.sub(cam.position); const L = d.length(); if (L > 60) continue; const ang = d.normalize().angleTo(_af) * DEG; if (ang < 5 && (!best || L < best)) best = L; }
      const headAng = best ? Math.atan(0.15 / best) * DEG : null;
      J.shots.push([+g.t.toFixed(2), r === 'shotgun' ? 'sg' : 'rv', +div.toFixed(3), best ? +best.toFixed(1) : null, headAng ? +headAng.toFixed(3) : null, +(P.state.adsK || 0).toFixed(2)]);
    }
    return r;
  };
  // ── 판 시작·끝 연결 ──
  const ostart = window.__startRun; window.__startRun = function (p, sd) { const r = ostart.apply(this, arguments); J = newRun(); J.profile = p; J.seed = sd; return r; };
  const ocont = window.__continue; window.__continue = function (...a) {
    const r = ocont.apply(this, a);
    if (J && window.__R && __R.saved && !J.saved) { J.saved = true; J.kills = g.kills; J.duration = __R.duration; J.result = __R.result; window.__juiceRuns.push(J); }
    return r;
  };
  // ── 집계 ──
  window.__juiceSummary = function (j) {
    const pct = (x, tot) => +(100 * x / Math.max(1e-6, tot)).toFixed(2);
    const secs = Math.ceil(j.realT), fz = []; for (let i = 0; i < secs; i++) fz.push(j.secFreeze[i] || 0);
    const sorted = fz.slice().sort((a, b) => a - b), p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0;
    // 섬광: 50ms 안에 시작된 것은 하나로 합쳐 '번쩍임 1회' · 1초 창(0.25초 간격으로 밀며)마다 3회 초과면 위반
    const big = j.flashes.filter(f => f[1] >= 0.1), red = j.flashes.filter(f => f[3]);
    const merge = arr => { const out = []; for (const f of arr) { if (out.length && f[0] - out[out.length - 1] < 0.05) continue; out.push(f[0]); } return out; };
    const win = ts => { let worst = 0, bad = 0; for (let t = 0; t < j.realT; t += 0.25) { const n = ts.filter(x => x >= t && x < t + 1).length; worst = Math.max(worst, n); if (n > 3) bad++; } return { worst, badWindows: bad }; };
    const bigT = merge(big), redT = merge(red), anyT = merge(j.flashes);
    const shots = j.shots, rv = shots.filter(s => s[1] === 'rv'), divs = rv.map(s => s[2]).sort((a, b) => a - b), q = (arr, x) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(x * arr.length))] : 0;
    const withHead = rv.filter(s => s[4] != null), offHead = withHead.filter(s => s[2] > s[4]);
    return {
      run: j.profile + j.seed, result: j.result, dur: j.duration, J: j.J, kills: j.kills, realT: +j.realT.toFixed(1),
      freeze_pct: pct(j.frozenT, j.realT), slow_pct: pct(j.slowT, j.realT), slow_lost_pct: pct(j.slowLost, j.realT),
      freeze_sec_p50: +(p(0.5) * 1000).toFixed(0), freeze_sec_p95: +(p(0.95) * 1000).toFixed(0), freeze_sec_max: +(sorted[sorted.length - 1] * 1000 || 0).toFixed(0),
      secs_over_20pct_frozen: fz.filter(x => x > 0.2).length, max_freeze_ms: +(j.maxFreeze * 1000).toFixed(0), freeze_streaks_150ms: j.freezeStreaks.length,
      hitstops: j.hitstops, slowmos: j.slowmos, trauma_calls_per_min: +(j.traumaCalls / (j.realT / 60)).toFixed(1), punches_per_min: +(j.punches / (j.realT / 60)).toFixed(1),
      shake_mean_deg: +(j.shakeSum / j.realT).toFixed(3), shake_pct_over_05: pct(j.shakeHist.a05, j.realT), shake_pct_over_1: pct(j.shakeHist.a1, j.realT), shake_pct_over_2: pct(j.shakeHist.a2, j.realT), shake_pct_over_3: pct(j.shakeHist.a3, j.realT),
      roll_pct_over_2: pct(j.shakeHist.r2, j.realT), roll_pct_over_4: pct(j.shakeHist.r4, j.realT), shake_max: { ang: +j.shakeMax.ang.toFixed(2), roll: +j.shakeMax.roll.toFixed(2), pos_cm: +(j.shakeMax.pos * 100).toFixed(1), back_cm: +(j.shakeMax.back * 100).toFixed(1) },
      fov_pct_over_3: pct(j.fovHist.f3, j.realT), fov_pct_over_6: pct(j.fovHist.f6, j.realT), fov_range: [+j.fovMin.toFixed(1), +j.fovMax.toFixed(1)],
      flashes_per_min: +(anyT.length / (j.realT / 60)).toFixed(1), big_flashes: bigT.length, red_flashes: redT.length,
      wcag_general: win(bigT), wcag_red: win(redT), flash_kinds: j.flashes.reduce((m, f) => (m[f[4] + (f[2] === 'edge' ? 'E' : 'F')] = (m[f[4] + (f[2] === 'edge' ? 'E' : 'F')] || 0) + 1, m), {}),
      shots_rv: rv.length, shots_sg: shots.length - rv.length, div_p50: +q(divs, 0.5).toFixed(3), div_p90: +q(divs, 0.9).toFixed(3), div_max: +(divs[divs.length - 1] || 0).toFixed(3),
      head_shots_measured: withHead.length, crosshair_off_head_pct: pct(offHead.length, withHead.length), impacts: j.impacts, kill_confirms: j.killConfirms,
    };
  };
  window.__juiceCur = () => J && __juiceSummary(J);
  // 60Hz로 끊어 돌리기 (사람 화면 주기 — 30Hz면 히트스톱이 프레임 단위로 부풀려진다)
  window.__step60 = (p, sd, ms = 8000) => { if (!window.__R || __R.saved || __R.profile !== p || __R.seed !== sd) __startRun(p, sd); const t0 = performance.now(); while (!__R.saved && performance.now() - t0 < ms) __continue(5, 1 / 60); return __R.saved ? __sum() : 'PARTIAL ' + D.g.t.toFixed(0); };
  window.__juiceExport = () => JSON.stringify(__juiceRuns.map(j => ({ summary: __juiceSummary(j), shots: j.shots, flashes: j.flashes, freezeStreaks: j.freezeStreaks, hsLog: j.hsLog, secFreeze: Array.from({ length: Math.ceil(j.realT) }, (_, i) => +((j.secFreeze[i] || 0)).toFixed(3)) })));
  return 'juice probe ready (J=' + F.J + ')';
})();
