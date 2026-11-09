// 리볼버: 반동 스프링(뒤로 밀림 + 총구 들림) · 해머 · 실린더 회전 · 총구 화염 · 스피드로더 장전 · 조준점 · 탄약 HUD
(function () {
  const { W, H, rand, clamp } = ZK;
  const G = {};
  const FIRE_INTERVAL = 0.3;            // 더블액션 연사 간격
  const SCALE = 1.55;
  const MZ = [130, -13];                // 총구 위치 (총 로컬 좌표)
  const RELOAD = [[0, 'out'], [0.24, 'eject'], [0.62, 'load'], [0.9, 'in'], [0.98, 'spin'], [1.16, 'done']];
  const st = {
    ammo: 6, cd: 0, reloading: false, rt: 0, ev: 0, pose: 0, auto: -1, spent: 0,
    kick: 0, kickV: 0, flip: 0, flipV: 0, hammer: 1, cyl: 0, cylT: 0, cylSpin: 0,
    flashT: 0, flashRot: 0, flashSize: 1, aimX: W / 2, aimY: 640, px: 0, py: 0, ang: -1.57,
    bloom: 0, hitT: 0, hitType: 'hit', loadedVisual: 6,
  };
  G.state = st;
  G.reset = () => Object.assign(st, { ammo: 6, cd: 0, reloading: false, auto: -1, spent: 0, loadedVisual: 6, bloom: 0 });

  function local(lx, ly) { // 총 로컬 좌표 → 화면 좌표
    const a = st.drawAng, c = Math.cos(a), s = Math.sin(a), k = SCALE * st.drawScale;
    return { x: st.drawX + (lx * c - ly * s) * k, y: st.drawY + (lx * s + ly * c) * k };
  }
  G.muzzle = function () {
    const m = local(MZ[0], MZ[1]), a = st.drawAng;
    return { x: m.x, y: m.y, dx: Math.cos(a), dy: Math.sin(a) };
  };

  G.update = function (dt, aimX, aimY) {
    st.aimX = aimX; st.aimY = aimY;
    st.cd -= dt; st.flashT -= dt; st.hitT -= dt;
    st.bloom = Math.max(0, st.bloom - dt * 2.4);
    st.kickV += (-430 * st.kick - 27 * st.kickV) * dt; st.kick += st.kickV * dt;
    st.flipV += (-320 * st.flip - 21 * st.flipV) * dt; st.flip += st.flipV * dt;
    if (st.cd < FIRE_INTERVAL - 0.09) st.hammer = Math.min(1, st.hammer + dt * 7);
    st.cyl += (st.cylT - st.cyl) * (1 - Math.exp(-dt * 20));
    st.cylSpin *= Math.exp(-dt * 3.5);
    if (st.auto > 0 && (st.auto -= dt) <= 0) G.reload();

    if (st.reloading) {
      st.rt += dt;
      while (st.ev < RELOAD.length && st.rt >= RELOAD[st.ev][0]) reloadEvent(RELOAD[st.ev++][1]);
      st.pose = Math.min(1, st.pose + dt * 7);
    } else st.pose = Math.max(0, st.pose - dt * 7);

    // 손 위치: 화면 아래 오른쪽, 조준 방향으로 살짝 따라감
    st.px = W / 2 + 70 + (aimX - W / 2) * 0.32;
    st.py = H - 150 + clamp((aimY - 700) * 0.05, -18, 18);
    st.ang = Math.atan2(aimY - st.py, aimX - st.px);
    const e = st.pose * st.pose * (3 - 2 * st.pose);
    st.drawAng = st.ang - st.flip + e * (-0.95 - (st.ang + 1.57) * 0.6);
    st.drawX = st.px - Math.cos(st.ang) * st.kick + e * 60;
    st.drawY = st.py - Math.sin(st.ang) * st.kick + e * 70;
    st.drawScale = 1 + st.kick * 0.0035;
  };

  G.fire = function () {
    if (st.reloading || st.cd > 0) return null;
    if (st.ammo <= 0) { ZK.audio.dry(); st.cd = 0.25; st.hammer = 0; st.flipV += 2; G.reload(); return null; }
    st.ammo--; st.spent++; st.loadedVisual = st.ammo; st.cd = FIRE_INTERVAL;
    st.kickV += 1450; st.flipV += 12 + rand(-1.5, 1.5); st.hammer = 0; st.cylT += 1;
    st.flashT = 0.06; st.flashRot = rand(-0.25, 0.25); st.flashSize = rand(0.85, 1.25);
    const m = G.muzzle();
    ZK.audio.shot();
    ZK.fx.light(m.x, m.y, 1.1);
    ZK.fx.smoke(m.x + m.dx * 20, m.y + m.dy * 20, m.dx, m.dy, 7);
    ZK.fx.sparks(m.x, m.y, m.dx, m.dy, 6);
    ZK.fx.trauma(0.34); ZK.fx.kick(rand(-4, 4), 18); ZK.fx.zoomPunch(0.022);
    const spread = st.bloom * 24; st.bloom = Math.min(1, st.bloom + 0.6);
    if (st.ammo === 0) st.auto = 0.38;
    const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * spread;
    return { mx: m.x, my: m.y, tx: st.aimX + Math.cos(a) * r, ty: st.aimY + Math.sin(a) * r };
  };

  G.reload = function () {
    if (st.reloading || st.ammo >= 6) return;
    st.reloading = true; st.rt = 0; st.ev = 0; st.auto = -1;
  };
  function reloadEvent(e) {
    const cylW = local(22, 30);
    if (e === 'out') ZK.audio.cylOut();
    else if (e === 'eject') {
      for (let i = 0; i < st.spent; i++) ZK.fx.casing(cylW.x + rand(-8, 8), cylW.y, H - 30 - rand(0, 45));
      st.spent = 0; st.flipV -= 2;
    } else if (e === 'load') { ZK.audio.speedload(); st.loadedVisual = 6; st.flipV += 1.5; }
    else if (e === 'in') { ZK.audio.cylIn(); st.kickV += 250; ZK.fx.trauma(0.06); }
    else if (e === 'spin') { ZK.audio.spin(); st.cylSpin = 9; }
    else if (e === 'done') { st.ammo = 6; st.reloading = false; st.cylT = Math.round(st.cylT); }
  }
  G.hitMarker = function (type) { st.hitT = type === 'head' || type === 'kill' ? 0.2 : 0.12; st.hitType = type; };

  // ───────── 그리기 ─────────
  G.draw = function (c) {
    // 팔 (소매)
    const grip = local(-20, 30);
    c.lineCap = 'round';
    c.strokeStyle = '#1c1f25'; c.lineWidth = 64; c.beginPath(); c.moveTo(grip.x + 170, H + 120); c.lineTo(grip.x + 10, grip.y + 22); c.stroke();
    c.strokeStyle = '#2b3039'; c.lineWidth = 54; c.beginPath(); c.moveTo(grip.x + 170, H + 120); c.lineTo(grip.x + 12, grip.y + 22); c.stroke();
    c.strokeStyle = '#3a404b'; c.lineWidth = 10; c.beginPath(); c.moveTo(grip.x + 150, H + 110); c.lineTo(grip.x + 6, grip.y + 6); c.stroke();

    c.save(); c.translate(st.drawX, st.drawY); c.rotate(st.drawAng); c.scale(SCALE * st.drawScale, SCALE * st.drawScale);
    c.lineJoin = 'round'; c.strokeStyle = '#0b0c0e'; c.lineWidth = 2;
    // 그립 (나무)
    c.fillStyle = '#6b3f22'; c.beginPath(); c.moveTo(-18, -2); c.lineTo(-44, 46); c.quadraticCurveTo(-36, 62, -18, 58); c.lineTo(10, 8); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,210,160,0.2)'; c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-24 + i * 3, 6 + i * 7.5); c.lineTo(-8 + i * 3, 8 + i * 7.5); c.stroke(); }
    c.strokeStyle = '#0b0c0e'; c.lineWidth = 2;
    // 방아쇠울·방아쇠
    c.beginPath(); c.arc(16, 10, 12, 0.1, Math.PI - 0.1); c.stroke();
    c.fillStyle = '#1a1c20'; c.fillRect(13, 6, 4, 10 - (1 - st.hammer) * 4);
    // 주먹 (그립을 감싼 손)
    c.fillStyle = '#c48a66'; c.beginPath(); c.ellipse(-18, 30, 21, 17, -1.05, 0, 6.283); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(80,40,20,0.55)'; c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6 - i * 7, 22 + i * 10); c.lineTo(-20 - i * 7, 20 + i * 10); c.stroke(); }
    c.strokeStyle = '#0b0c0e'; c.lineWidth = 2;
    // 프레임
    c.fillStyle = '#2a2d33'; c.beginPath(); c.roundRect(-20, -20, 56, 30, 6); c.fill(); c.stroke();
    // 해머 (쏘면 떨어지고 다시 젖혀짐)
    c.save(); c.translate(-16, -18); c.rotate(-0.95 * st.hammer); c.fillStyle = '#3a3e46';
    c.beginPath(); c.moveTo(-4, 2); c.lineTo(4, 2); c.lineTo(1, -16); c.lineTo(-11, -18); c.closePath(); c.fill(); c.stroke(); c.restore();
    // 엄지
    c.strokeStyle = '#c48a66'; c.lineWidth = 11; c.lineCap = 'round'; c.beginPath(); c.moveTo(-14, -2); c.lineTo(4, -6); c.stroke();
    c.strokeStyle = '#0b0c0e'; c.lineWidth = 2;
    // 실린더 (장전 중엔 옆으로 빠짐)
    const e = st.pose, out = e * 30;
    c.save(); c.translate(0, out);
    c.fillStyle = '#3a3e46'; c.beginPath(); c.roundRect(2, -27, 46, 36, 8); c.fill(); c.stroke();
    const off = ((st.cyl + st.cylSpin) % 1) * 11;
    c.strokeStyle = '#1e2126'; c.lineWidth = 4;
    for (let i = -1; i < 4; i++) { const y = -24 + i * 11 + off; if (y > -26 && y < 8) { c.beginPath(); c.moveTo(7, y); c.lineTo(43, y); c.stroke(); } }
    c.fillStyle = 'rgba(200,210,225,0.25)'; c.fillRect(5, -26, 40, 4);
    c.restore(); c.strokeStyle = '#0b0c0e'; c.lineWidth = 2;
    // 총열(짧고 굵게)·이젝터 하우징·가늠쇠
    c.fillStyle = '#272a30'; c.beginPath(); c.roundRect(48, -6, 58, 11, 4); c.fill(); c.stroke();
    c.fillStyle = '#30343b'; c.beginPath(); c.roundRect(46, -22, 82, 18, 4); c.fill(); c.stroke();
    c.fillStyle = '#23262b'; c.fillRect(46, -27, 82, 6);
    c.fillStyle = '#8a929e'; c.fillRect(50, -20, 74, 2.5);
    c.fillStyle = '#16181c'; c.fillRect(124, -18, 4, 10);
    c.fillStyle = '#23262b'; c.fillRect(118, -35, 7, 9);
    c.restore();

    // 총구 화염 (가산 합성)
    if (st.flashT > 0) {
      const a = st.flashT / 0.06, m = local(MZ[0], MZ[1]), sz = st.flashSize * SCALE;
      c.save(); c.globalCompositeOperation = 'lighter'; c.translate(m.x, m.y); c.rotate(st.drawAng + st.flashRot);
      c.globalAlpha = a;
      c.fillStyle = '#ffb347';
      for (let i = 0; i < 7; i++) {
        const ang = (i - 3) * 0.24 + rand(-0.08, 0.08), len = (i === 3 ? 95 : rand(40, 75)) * sz, w = 11 * sz;
        c.beginPath(); c.moveTo(0, -w * Math.cos(ang)); c.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); c.lineTo(0, w * Math.cos(ang)); c.fill();
      }
      c.fillStyle = '#fff3c4'; c.beginPath(); c.ellipse(20 * sz, 0, 30 * sz, 14 * sz, 0, 0, 6.283); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(10 * sz, 0, 14 * sz, 8 * sz, 0, 0, 6.283); c.fill();
      c.restore();
      // 실린더 틈새 가스 화염 (리볼버만의 디테일)
      const g = local(47, -12);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.9; c.translate(g.x, g.y); c.rotate(st.drawAng);
      c.fillStyle = '#ffc56a';
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(-4, 0); c.lineTo(rand(-4, 4), sd * rand(26, 40)); c.lineTo(5, 0); c.fill(); }
      c.restore();
    }
  };

  G.drawCrosshair = function (c) {
    const x = st.aimX, y = st.aimY, gap = 10 + st.bloom * 26;
    c.lineCap = 'round';
    for (const [w, col] of [[6, 'rgba(0,0,0,0.75)'], [2.5, st.reloading ? '#9aa0a8' : '#ffffff']]) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath();
      c.moveTo(x - gap - 14, y); c.lineTo(x - gap, y); c.moveTo(x + gap, y); c.lineTo(x + gap + 14, y);
      c.moveTo(x, y - gap - 14); c.lineTo(x, y - gap); c.moveTo(x, y + gap); c.lineTo(x, y + gap + 14); c.stroke();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 2, 0, 6.283); c.fill();
    if (st.hitT > 0) {
      const big = st.hitType === 'head' ? 1.5 : st.hitType === 'kill' ? 1.25 : 1, r = (9 + (0.2 - st.hitT) * 30) * big;
      const col = st.hitType === 'head' ? '#ffd23a' : st.hitType === 'kill' ? '#ff3030' : '#ffffff';
      for (const [w, cc] of [[6, 'rgba(0,0,0,0.7)'], [3, col]]) {
        c.strokeStyle = cc; c.lineWidth = w; c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(x + sx * r * 0.45, y + sy * r * 0.45); c.lineTo(x + sx * r, y + sy * r); }
        c.stroke();
      }
    }
  };

  // 탄약 = 실린더 아이콘 (쏠 때마다 60°씩 돌아감)
  G.drawHUD = function (c) {
    const cx = 86 + st.pose * 16, cy = H - 92, R = 50;
    c.save(); c.translate(cx, cy); c.rotate(-(st.cyl + st.cylSpin) * (Math.PI / 3));
    c.fillStyle = '#2a2d33'; c.strokeStyle = '#0b0c0e'; c.lineWidth = 3;
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.arc(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 13, a + 1.3, a - 1.3, true); } c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#4a4f58'; c.beginPath(); c.arc(0, 0, 9, 0, 6.283); c.fill();
    const cur = Math.round(st.cylT);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2, x = Math.cos(a) * 29, y = Math.sin(a) * 29;
      const k = (((i - cur) % 6) + 6) % 6, loaded = k < st.loadedVisual;
      c.fillStyle = '#0d0e10'; c.beginPath(); c.arc(x, y, 11, 0, 6.283); c.fill();
      if (loaded) {
        c.fillStyle = '#c9952f'; c.beginPath(); c.arc(x, y, 9, 0, 6.283); c.fill();
        c.fillStyle = '#f2d17a'; c.beginPath(); c.arc(x - 2, y - 2, 4, 0, 6.283); c.fill();
        c.fillStyle = '#9a6e22'; c.beginPath(); c.arc(x, y, 3, 0, 6.283); c.fill();
      }
    }
    c.restore();
    if (st.ammo === 0 && !st.reloading) {
      c.font = '900 22px system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ff5a4a';
      c.fillText('R  장전', cx + 64, cy + 8);
    }
  };

  ZK.gun = G;
})();
