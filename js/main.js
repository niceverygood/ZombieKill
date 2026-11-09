// 게임 루프 · 입력 · 판정(헤드샷/오버킬 연쇄) · 스폰 · 배경 · HUD
(function () {
  const { W, H, rand, clamp } = ZK;
  const DMG = 34, HEAD_MUL = 2.5;               // 리볼버: 몸통 34 / 머리 85
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  let scale = 1, dpr = 1;
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    scale = Math.min(innerWidth / W, innerHeight / H);
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  }
  addEventListener('resize', resize); resize();

  ZK.fx.init();
  const M = 60, bg = makeBackground(), fg = makeBarricade();
  const g = { state: 'title', zombies: [], tracers: [], chainQ: [], t: 0, spawnT: 0, packT: 10, hp: 100,
    kills: 0, heads: 0, shots: 0, hits: 0, combo: 0, comboT: 0, bestCombo: 0, bestChain: 0, barShake: 0, overT: 0, shakeMul: 1 };
  g.hitBarricade = function (dmg, z) {
    if (g.state !== 'play') return;
    g.hp = Math.max(0, g.hp - dmg); g.barShake = 1;
    ZK.audio.barricade(z.pan); ZK.fx.trauma(0.14); ZK.fx.hurt(0.25 + (1 - g.hp / 100) * 0.3);
    if (g.hp <= 0) { g.state = 'over'; g.overT = 0; ZK.fx.slowmo(0.25, 1.2); ZK.audio.thud(); ZK.fx.flash(0.5, '#600'); }
  };

  // ───────── 입력 ─────────
  let aimX = W / 2, aimY = 640, down = false;
  const toLocal = e => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const setAim = e => { const p = toLocal(e); aimX = clamp(p.x, 10, W - 10); aimY = clamp(p.y, 40, H - 40); };
  cv.addEventListener('pointerdown', e => {
    ZK.audio.init(); setAim(e);
    if (e.button === 2) { ZK.gun.reload(); return; }
    if (g.state === 'title' || (g.state === 'over' && g.overT > 1.2)) { start(); return; }
    down = true; if (g.state === 'play') shoot();
  });
  cv.addEventListener('pointermove', setAim);
  addEventListener('pointerup', () => (down = false));
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.code === 'KeyR') ZK.gun.reload();
    if (e.code === 'KeyM') ZK.audio.toggleMute();
    if (e.code === 'KeyS') { g.shakeMul = g.shakeMul === 1 ? 0.5 : g.shakeMul === 0.5 ? 0 : 1; ZK.fx.text(W / 2, 200, `흔들림 ${g.shakeMul * 100}%`, '#9cf', 30, 0.8); }
  });

  function start() {
    ZK.fx.reset(); ZK.gun.reset();
    Object.assign(g, { state: 'play', zombies: [], tracers: [], chainQ: [], t: 0, spawnT: 0.8, packT: 9, hp: 100,
      kills: 0, heads: 0, shots: 0, hits: 0, combo: 0, comboT: 0, bestCombo: 0, bestChain: 0 });
    for (let i = 0; i < 3; i++) spawn('walker', ZK.HORIZON + 120 + i * 90);
  }
  function spawn(type, y = ZK.HORIZON + rand(0, 25), x) {
    const half = ZK.roadHalfAt(y) - 16;
    g.zombies.push(new ZK.Zombie(type, x ?? W / 2 + rand(-half, half), y));
  }

  // ───────── 사격 판정 ─────────
  function shoot() {
    const s = ZK.gun.fire(); if (!s) return;
    g.shots++;
    let hit = null, part = null;
    for (const z of g.zombies) { const p = z.hitTest(s.tx, s.ty); if (p && (!hit || z.y > hit.y)) { hit = z; part = p; } }
    const L = Math.hypot(s.tx - s.mx, s.ty - s.my) || 1, dx = (s.tx - s.mx) / L, dy = (s.ty - s.my) / L;
    g.tracers.push({ x1: s.mx, y1: s.my, x2: s.tx, y2: s.ty, t: 0.07, hit: !!hit });
    if (!hit) {
      if (s.ty > ZK.HORIZON) {
        const sc = ZK.scaleAt(s.ty), d = ZK.fx.decalCtx();
        d.fillStyle = 'rgba(8,8,8,0.9)'; d.beginPath(); d.ellipse(s.tx, s.ty, 4 * sc, 2 * sc, 0, 0, 6.283); d.fill();
        ZK.fx.dust(s.tx, s.ty, sc); ZK.fx.sparks(s.tx, s.ty, -dx, -1, 5);
        ZK.audio.ground(((s.tx - W / 2) / W) * 1.5);
      } else ZK.fx.sparks(s.tx, s.ty, -dx, -dy, 4);
      return;
    }
    g.hits++;
    const head = part === 'head', dmg = Math.round(DMG * (head ? HEAD_MUL : 1) * rand(0.96, 1.04));
    const r = hit.takeHit(s.tx, s.ty, dmg, part, dx, dy);
    ZK.fx.hitstop(head ? 0.075 : 0.04);
    ZK.fx.number(s.tx + 46 * hit.s, s.ty - 34 * hit.s, dmg, head ? 'head' : 'body'); // 피 튀는 지점을 가리지 않게 옆으로
    ZK.gun.hitMarker(r.killed ? (head ? 'head' : 'kill') : 'hit');
    if (head) { ZK.fx.trauma(0.14); ZK.fx.zoomPunch(0.012); }
    if (r.killed) {
      if (head) ZK.fx.text(s.tx, s.ty - 120 * hit.s - 20, 'HEADSHOT', '#ffd23a', 30, 0.7);
      onKill(hit, head, r.overkill, 0);
    }
  }
  function onKill(z, head, overkill, depth) {
    g.kills++; g.combo++; g.comboT = 1.6; g.bestCombo = Math.max(g.bestCombo, g.combo);
    if (head) g.heads++;
    ZK.audio.killTick(g.combo);
    // 넘친 데미지가 최대 HP의 50% 이상이면 시체가 터진다 (머리 터진 뒤 '펑')
    if (overkill >= z.maxHp * 0.5 && depth < 12) g.chainQ.push({ t: depth === 0 ? 0.13 : 0.06, z, dmg: overkill * 0.8, depth: depth + 1 });
  }
  function processChain(dt) {
    for (let i = g.chainQ.length - 1; i >= 0; i--) {
      const q = g.chainQ[i]; q.t -= dt; if (q.t > 0) continue;
      g.chainQ.splice(i, 1);
      const z = q.z; if (z.remove) continue;
      const s = z.s, cy = z.y - 100 * s;
      z.explode(); ZK.audio.gibBurst(z.pan);
      ZK.fx.ring(z.x, z.y, s, 150); ZK.fx.trauma(0.26 + q.depth * 0.05); ZK.fx.hitstop(0.05); ZK.fx.zoomPunch(0.015);
      g.bestChain = Math.max(g.bestChain, q.depth);
      ZK.fx.text(z.x, cy - 50 * s, q.depth > 1 ? `CHAIN ×${q.depth}` : 'OVERKILL!', q.depth > 1 ? '#ff3b3b' : '#ff8a2a', 34 + q.depth * 5, 0.9);
      if (q.depth >= 3) ZK.fx.slowmo(0.3, 0.45);
      const R = 125 * s;
      for (const o of g.zombies) {
        if (!o.alive) continue;
        const d = Math.hypot(o.x - z.x, (o.y - z.y) * 1.8); if (d > R) continue;
        const ddx = (o.x - z.x) / (d || 1), ddy = (o.y - z.y) / (d || 1), oy = o.y - 100 * o.s;
        const r = o.takeHit(o.x, oy, Math.round(q.dmg), 'body', ddx, ddy, { explosion: true, ex: z.x });
        ZK.fx.number(o.x, oy - 20 * o.s, q.dmg, 'chain');
        if (r && r.killed) onKill(o, false, r.overkill, q.depth);
      }
    }
  }

  // ───────── 업데이트 ─────────
  function update(dt) {
    if (g.state === 'play') {
      g.t += dt;
      g.spawnT -= dt; g.packT -= dt;
      if (g.spawnT <= 0) {
        g.spawnT = Math.max(0.42, 1.7 - g.t * 0.012) * rand(0.7, 1.3);
        spawn(g.t > 14 && Math.random() < Math.min(0.45, 0.12 + g.t / 220) ? 'runner' : 'walker');
      }
      if (g.packT <= 0) { // 뭉쳐서 오는 무리 = 오버킬 연쇄 재료
        g.packT = rand(9, 14);
        const y = ZK.HORIZON + 10, cx = W / 2 + rand(-40, 40), type = g.t > 20 ? 'runner' : 'walker';
        for (let i = 0; i < 4 + Math.min(4, (g.t / 30) | 0); i++) spawn(type, y + rand(0, 40), cx + rand(-45, 45));
      }
      g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
    } else if (g.state === 'over') g.overT += dt;
    for (const z of g.zombies) z.update(dt, g);
    g.zombies = g.zombies.filter(z => !z.remove);
    g.zombies.sort((a, b) => (a.alive === b.alive ? a.y - b.y : a.alive ? 1 : -1));
    processChain(dt);
  }

  // ───────── 렌더 ─────────
  function render(real) {
    c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    c.fillStyle = '#050608'; c.fillRect(0, 0, W, H);
    c.save(); ZK.fx.applyCamera(c, g.shakeMul);
    c.drawImage(bg, -M, -M);
    ZK.fx.drawDecals(c);
    for (const z of g.zombies) z.draw(c);
    ZK.fx.drawBlood(c);
    const fog = c.createLinearGradient(0, ZK.HORIZON - 40, 0, 820);
    fog.addColorStop(0, 'rgba(10,12,22,0.62)'); fog.addColorStop(1, 'rgba(10,12,22,0)');
    c.fillStyle = fog; c.fillRect(-M, ZK.HORIZON - 40, W + 2 * M, 860 - ZK.HORIZON);
    g.barShake = Math.max(0, g.barShake - real * 5);
    c.drawImage(fg, -M + Math.sin(ZK.fx.time * 70) * g.barShake * 5, 0);
    c.globalCompositeOperation = 'lighter';
    for (const t of g.tracers) {
      const a = t.t / 0.07; t.t -= real;
      c.strokeStyle = `rgba(255,200,120,${0.5 * a})`; c.lineWidth = 7 * a; c.beginPath(); c.moveTo(t.x1, t.y1); c.lineTo(t.x2, t.y2); c.stroke();
      c.strokeStyle = `rgba(255,250,230,${a})`; c.lineWidth = 2; c.beginPath(); c.moveTo(ZK.lerp(t.x1, t.x2, 0.3), ZK.lerp(t.y1, t.y2, 0.3)); c.lineTo(t.x2, t.y2); c.stroke();
      c.fillStyle = `rgba(255,240,200,${a})`; c.beginPath(); c.arc(t.x2, t.y2, (t.hit ? 14 : 8) * a, 0, 6.283); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    g.tracers = g.tracers.filter(t => t.t > 0);
    ZK.fx.drawLight(c);
    ZK.fx.drawTexts(c);
    c.restore();

    c.save(); ZK.fx.applyCamera(c, 0.35 * g.shakeMul); ZK.gun.draw(c); ZK.fx.drawScreen(c); c.restore();
    drawHUD();
    ZK.fx.drawOverlay(c);
    if (g.state === 'title') drawTitle();
    if (g.state === 'over') drawOver();
    ZK.gun.drawCrosshair(c);
  }

  function label(t, x, y, size, col = '#fff', align = 'center') {
    c.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y);
  }
  function drawHUD() {
    if (g.state === 'title') return;
    label(`${g.kills}`, 30, 52, 40, '#fff', 'left');
    c.font = '700 16px system-ui, sans-serif'; c.fillStyle = '#9aa3b2'; c.textAlign = 'left'; c.fillText('KILLS', 32, 84);
    // 바리케이드 HP
    const bw = 260, bx = W / 2 - bw / 2, by = 40, p = g.hp / 100;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - 3, by - 3, bw + 6, 20);
    c.fillStyle = p > 0.3 ? '#d8a23a' : '#e0402e'; c.fillRect(bx, by, bw * p, 14);
    c.font = '700 14px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#c9ced8'; c.fillText('바리케이드', W / 2, by + 34);
    if (g.combo >= 2) {
      const pop = 1 + Math.max(0, g.comboT - 1.45) * 4;
      label(`${g.combo}`, W - 30, 52, 44 * pop, g.combo >= 20 ? '#ff5a3a' : g.combo >= 10 ? '#ffd23a' : '#fff', 'right');
      c.font = '700 16px system-ui, sans-serif'; c.fillStyle = '#9aa3b2'; c.textAlign = 'right'; c.fillText('COMBO', W - 32, 86);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(W - 130, 96, 100, 4); c.fillStyle = '#fff'; c.fillRect(W - 130, 96, 100 * clamp(g.comboT / 1.6, 0, 1), 4);
    }
    ZK.gun.drawHUD(c);
  }
  function panel(a) { c.fillStyle = `rgba(4,5,8,${a})`; c.fillRect(0, 0, W, H); }
  function drawTitle() {
    panel(0.55);
    label('좀비킬', W / 2, 430, 96, '#e8e2d0');
    label('리볼버 손맛 프로토타입', W / 2, 510, 28, '#d23a2a');
    const blink = 0.6 + Math.sin(ZK.fx.time * 4) * 0.4;
    c.globalAlpha = blink; label('클릭해서 시작', W / 2, 680, 38, '#fff'); c.globalAlpha = 1;
    c.font = '600 20px system-ui, sans-serif'; c.fillStyle = '#aab2c0'; c.textAlign = 'center';
    ['마우스 조준 · 클릭 사격 · 누르고 있으면 연사', '머리를 노려라 — 헤드샷 ×2.5', 'R / 우클릭 장전 · S 흔들림 조절 · M 음소거']
      .forEach((t, i) => c.fillText(t, W / 2, 780 + i * 36));
  }
  function drawOver() {
    panel(Math.min(0.7, g.overT * 0.8));
    if (g.overT < 0.5) return;
    label('바리케이드 붕괴', W / 2, 400, 64, '#e0402e');
    const acc = g.shots ? Math.round((g.hits / g.shots) * 100) : 0, hs = g.kills ? Math.round((g.heads / g.kills) * 100) : 0;
    [['처치', g.kills], ['헤드샷 비율', hs + '%'], ['명중률', acc + '%'], ['최고 콤보', g.bestCombo], ['최고 연쇄', g.bestChain], ['생존', g.t.toFixed(1) + '초']]
      .forEach(([k, v], i) => { label(k, W / 2 - 30, 500 + i * 58, 26, '#aab2c0', 'right'); label(String(v), W / 2 + 10, 500 + i * 58, 32, '#fff', 'left'); });
    if (g.overT > 1.2) { c.globalAlpha = 0.6 + Math.sin(ZK.fx.time * 4) * 0.4; label('클릭해서 다시', W / 2, 900, 36, '#fff'); c.globalAlpha = 1; }
  }

  // ───────── 배경 (한 번만 그려 두고 재사용) ─────────
  function makeBackground() {
    const b = document.createElement('canvas'); b.width = W + M * 2; b.height = H + M * 2;
    const x = b.getContext('2d'); x.translate(M, M);
    const HZ = ZK.HORIZON, sky = x.createLinearGradient(0, -M, 0, HZ);
    sky.addColorStop(0, '#05070d'); sky.addColorStop(0.7, '#121522'); sky.addColorStop(1, '#2a1d1e');
    x.fillStyle = sky; x.fillRect(-M, -M, W + M * 2, HZ + M);
    const edge = (y, side, extra = 0) => W / 2 + side * (ZK.roadHalfAt(y) + extra * ZK.scaleAt(y));
    // 원경 빌딩 실루엣
    x.fillStyle = '#0b0d14';
    for (let i = 0; i < 26; i++) { const bx = -M + i * 32, bh = rand(40, 170); x.fillRect(bx, HZ - bh, 30, bh + 4); }
    x.fillStyle = 'rgba(255,190,110,0.5)';
    for (let i = 0; i < 70; i++) x.fillRect(rand(-M, W + M), HZ - rand(10, 150), 3, 4);
    // 양옆 건물 벽
    for (const side of [-1, 1]) {
      let y = HZ;
      while (y < H + M) {
        const y2 = Math.min(H + M, y + 30 + (y - HZ) * 0.55), s1 = ZK.scaleAt(y), s2 = ZK.scaleAt(y2);
        const h1 = rand(380, 620) * s1, h2 = h1 * (s2 / s1);
        const xa = edge(y, side, 120), xb = edge(y2, side, 120), far = side * (W + M * 2);
        x.fillStyle = `hsl(${rand(210, 235)},${rand(8, 18)}%,${rand(7, 12)}%)`;
        x.beginPath(); x.moveTo(xa, y); x.lineTo(xb, y2); x.lineTo(xb, y2 - h2); x.lineTo(xa, y - h1); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(xb, y2); x.lineTo(W / 2 + far, y2); x.lineTo(W / 2 + far, y2 - h2); x.lineTo(xb, y2 - h2); x.closePath(); x.fill();
        for (let k = 0; k < 6; k++) if (Math.random() < 0.35) {
          const t = rand(0.15, 0.85), wy = ZK.lerp(y, y2, t) - rand(0.3, 0.9) * ZK.lerp(h1, h2, t), wx = ZK.lerp(xa, xb, t), ws = ZK.lerp(s1, s2, t);
          x.fillStyle = Math.random() < 0.5 ? 'rgba(255,200,120,0.55)' : 'rgba(140,180,255,0.35)'; x.fillRect(wx - 6 * ws, wy, 12 * ws, 16 * ws);
        }
        y = y2;
      }
    }
    // 인도·도로
    for (const side of [-1, 1]) {
      x.fillStyle = '#25272c'; x.beginPath(); x.moveTo(edge(HZ, side), HZ); x.lineTo(edge(HZ, side, 120), HZ); x.lineTo(edge(H + M, side, 120), H + M); x.lineTo(edge(H + M, side), H + M); x.closePath(); x.fill();
    }
    const road = x.createLinearGradient(0, HZ, 0, H);
    road.addColorStop(0, '#15161b'); road.addColorStop(1, '#1e2026');
    x.fillStyle = road; x.beginPath(); x.moveTo(edge(HZ, -1), HZ); x.lineTo(edge(HZ, 1), HZ); x.lineTo(edge(H + M, 1), H + M); x.lineTo(edge(H + M, -1), H + M); x.closePath(); x.fill();
    for (let i = 0; i < 1400; i++) { const yy = rand(HZ, H), half = ZK.roadHalfAt(yy); x.fillStyle = `rgba(255,255,255,${rand(0.01, 0.04)})`; x.fillRect(W / 2 + rand(-half, half), yy, 2, 1); }
    for (const side of [-1, 1]) { x.strokeStyle = '#3b3d44'; x.lineWidth = 3; x.beginPath(); x.moveTo(edge(HZ, side), HZ); x.lineTo(edge(H + M, side), H + M); x.stroke(); }
    let y = HZ + 4;
    while (y < H) { const s = ZK.scaleAt(y), len = 46 * s; x.fillStyle = 'rgba(200,190,140,0.35)'; x.fillRect(W / 2 - 3 * s, y, 6 * s, len); y += len * 2.2; }
    // 가로등 + 빛 웅덩이
    for (const yy of [HZ + 60, HZ + 230, HZ + 520]) for (const side of [-1, 1]) {
      const s = ZK.scaleAt(yy), px = edge(yy, side, 60), top = yy - 330 * s;
      x.strokeStyle = '#1a1c22'; x.lineWidth = 7 * s; x.beginPath(); x.moveTo(px, yy); x.lineTo(px, top); x.lineTo(px - side * 50 * s, top); x.stroke();
      const lxp = px - side * 50 * s;
      let gl = x.createRadialGradient(lxp, top, 0, lxp, top, 40 * s); gl.addColorStop(0, 'rgba(255,210,140,0.9)'); gl.addColorStop(1, 'rgba(255,170,80,0)');
      x.fillStyle = gl; x.fillRect(lxp - 40 * s, top - 40 * s, 80 * s, 80 * s);
      x.save(); x.globalCompositeOperation = 'lighter'; x.translate(lxp, yy + 10 * s); x.scale(1, 0.42);
      gl = x.createRadialGradient(0, 0, 0, 0, 0, 230 * s); gl.addColorStop(0, 'rgba(255,180,100,0.16)'); gl.addColorStop(1, 'rgba(255,150,80,0)');
      x.fillStyle = gl; x.fillRect(-230 * s, -230 * s, 460 * s, 460 * s); x.restore();
    }
    const v = x.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = v; x.fillRect(-M, -M, W + M * 2, H + M * 2);
    return b;
  }
  // 모래주머니 바리케이드 (좀비 다리를 가림)
  function makeBarricade() {
    const b = document.createElement('canvas'); b.width = W + M * 2; b.height = H;
    const x = b.getContext('2d'); x.translate(M, 0);
    x.fillStyle = '#0d0e11'; x.fillRect(-M, 1090, W + M * 2, H - 1090);
    for (let row = 0; row < 3; row++) {
      const y = 1010 + row * 34, off = row % 2 ? 0 : 40;
      for (let i = -1; i < 10; i++) {
        const bx = i * 82 + off - 20, sh = 40 - row * 6;
        x.fillStyle = `hsl(${rand(34, 42)},${rand(18, 28)}%,${rand(20, 27) - row * 3}%)`;
        x.beginPath(); x.roundRect(bx, y, 86, 44, 18); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 3; x.stroke();
        x.fillStyle = 'rgba(255,240,210,0.07)'; x.beginPath(); x.roundRect(bx + 8, y + 4, 70, 10, 6); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx + 18, y + 6); x.lineTo(bx + 14, y + 38); x.moveTo(bx + 68, y + 6); x.lineTo(bx + 72, y + 38); x.stroke();
        if (sh) {}
      }
    }
    x.strokeStyle = '#3a3d42'; x.lineWidth = 2;
    x.beginPath(); for (let i = -M; i < W + M; i += 6) x.lineTo(i, 1004 + Math.sin(i * 0.21) * 7); x.stroke();
    return b;
  }

  // ───────── 루프 ─────────
  // 개발용: 콘솔에서 ZK.debug.shoot('head', 120) → 가장 가까운 좀비 머리를 쏘고 120ms 뒤 화면 정지
  let paused = false;
  ZK.debug = {
    g,
    pause(on) { paused = on; },
    shoot(part = 'head', freezeMs = 0, idx = 0) {
      const alive = g.zombies.filter(z => z.alive).sort((a, b) => b.y - a.y), z = alive[idx]; if (!z) return 'no zombie';
      const h = z.headPos(); aimX = z.x; aimY = part === 'head' ? h.y : z.y - 110 * z.s;
      ZK.gun.update(0, aimX, aimY); ZK.gun.state.cd = 0; ZK.gun.state.bloom = 0; shoot();
      if (freezeMs) setTimeout(() => (paused = true), freezeMs);
      return { x: aimX, y: aimY, type: z.type, hp: z.hp };
    },
  };
  let last = performance.now();
  function frame(ts) {
    const real = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (paused) { render(0); requestAnimationFrame(frame); return; }
    const dt = ZK.fx.step(real);
    ZK.gun.update(real, aimX, aimY);
    if (down && g.state === 'play') shoot();
    update(dt);
    ZK.fx.update(dt);
    render(real);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
