// 이펙트: 피 튀김(2.5D 물리) · 바닥 핏자국 · 살점 · 연기 · 탄피 · 숫자 · 카메라 흔들림 · 히트스탑 · 슬로모
(function () {
  const { W, H, rand } = ZK;
  const F = {};
  const G = 2300;                         // 피 방울 중력 (월드 px/s²)
  const BLOOD = ['#8a0b12', '#a3101a', '#6d070d', '#b8161f', '#5a0509', '#9c0d16'];
  const FLESH = ['#5b1a1a', '#7a2626', '#4a1212', '#6f8a5e', '#5d7350'];
  const BONE = ['#e8e0cc', '#d6cdb5', '#f2ecdc'];

  let decal, dctx, mistSpr, smokeSpr, lightSpr;
  const parts = [], scr = [], mists = [], rings = [], pools = [], texts = [], splashes = [];
  let trauma = 0, kx = 0, ky = 0, kvx = 0, kvy = 0, zoom = 0;
  let hitstop = 0, slowT = 0, slowMax = 0, slowScale = 1;
  let light = 0, lx = 0, ly = 0, flashA = 0, flashCol = '#fff', hurtA = 0, fadeT = 0;
  F.time = 0;

  function sprite(r, stops) {
    const c = document.createElement('canvas'); c.width = c.height = r * 2;
    const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  F.init = function () {
    decal = document.createElement('canvas'); decal.width = W; decal.height = H; dctx = decal.getContext('2d');
    mistSpr = sprite(64, [[0, 'rgba(170,14,20,0.85)'], [0.5, 'rgba(130,6,12,0.45)'], [1, 'rgba(90,0,4,0)']]);
    smokeSpr = sprite(64, [[0, 'rgba(210,210,215,0.55)'], [0.6, 'rgba(160,160,170,0.2)'], [1, 'rgba(140,140,150,0)']]);
    lightSpr = sprite(128, [[0, 'rgba(255,225,170,1)'], [0.25, 'rgba(255,170,80,0.55)'], [1, 'rgba(255,120,40,0)']]);
  };
  F.reset = function () {
    dctx.clearRect(0, 0, W, H);
    parts.length = scr.length = mists.length = rings.length = pools.length = texts.length = splashes.length = 0;
    trauma = zoom = hitstop = slowT = light = flashA = hurtA = 0;
  };
  F.decalCtx = () => dctx;

  // ───────── 피 ─────────
  function drop(x, y, z, vx, vy, vz, r) {
    parts.push({ k: 0, x, y, z, vx, vy, vz, r, col: BLOOD[(Math.random() * BLOOD.length) | 0], life: 3 });
  }
  // 총알이 박힌 곳: 관통 방향으로 크게 뿜고(출구), 총 쪽으로 조금 튄다(입구)
  F.blood = function (hx, hy, footY, s, dx, dy, power = 1, head = false) {
    const z0 = Math.max(4, (footY - hy) / s), n = Math.round((head ? 50 : 32) * power);
    for (let i = 0; i < n; i++) {
      const sp = rand(80, 470) * power * (head ? 1.25 : 1), spr = rand(-0.6, 0.6);
      const ex = dx + spr * -dy, ey = dy + spr * dx;
      drop(hx, footY, z0, ex * sp, ey * sp * 0.5, rand(60, 520) * (head ? 1.3 : 1), rand(2.4, head ? 7 : 5.5));
    }
    for (let i = 0; i < 9; i++) drop(hx, footY, z0, -dx * rand(30, 160) + rand(-80, 80), -dy * rand(15, 80), rand(40, 260), rand(1.8, 3.6));
    for (let i = 0; i < (head ? 5 : 3); i++)
      mists.push({ x: hx + rand(-6, 6) * s + dx * 22 * s * i, y: hy + rand(-6, 6) * s + dy * 22 * s * i, r: (34 + i * 12) * s * power, g: 170 * s * power, life: 0.45, max: 0.45 });
    // 탄이 박히는 순간의 피 별모양 스플래시
    const spikes = Array.from({ length: head ? 11 : 8 }, () => ({ a: rand(0, 6.283), l: rand(0.5, 1) }));
    splashes.push({ x: hx, y: hy, r: (head ? 46 : 32) * s * Math.min(1.6, power), t: 0, life: 0.22, spikes });
  };
  // 목에서 뿜는 분수 (헤드샷 후 몸통)
  F.spurt = function (x, hy, footY, s, power = 1) {
    const z0 = (footY - hy) / s;
    for (let i = 0; i < 5; i++) drop(x + rand(-3, 3) * s, footY, z0, rand(-140, 140) * power, rand(-70, 40), rand(380, 820) * power, rand(1.8, 3.6));
  };
  // 살점·뼈 조각
  F.gibs = function (hx, hy, footY, s, dx, dy, n, bone = false, power = 1) {
    const z0 = Math.max(6, (footY - hy) / s);
    for (let i = 0; i < n; i++) {
      const sp = rand(120, 560) * power, a = Math.atan2(dy, dx) + rand(-1.3, 1.3);
      const isBone = bone && Math.random() < 0.4;
      parts.push({ k: 1, x: hx, y: footY, z: z0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: rand(250, 820) * power,
        r: rand(3.5, 8.5), rot: rand(0, 6.28), vr: rand(-18, 18), col: isBone ? BONE[(Math.random() * 3) | 0] : FLESH[(Math.random() * FLESH.length) | 0],
        sides: 4 + ((Math.random() * 3) | 0), life: 4, bounce: 0 });
    }
  };
  // 시체 아래 고이는 피 웅덩이
  F.pool = function (x, y, s, size) { pools.push({ x, y, s, r: 0, max: size * s * rand(0.8, 1.2), t: 0 }); };
  F.ring = function (x, y, s, max, col = 'rgba(255,90,60,', w = 10) { rings.push({ x, y, s, r: 8 * s, max: max * s, life: 0.32, t: 0, col, w }); };

  function splat(x, y, r, col, vx = 0, vy = 0) {
    const s = ZK.scaleAt(y), rr = r * s * 1.7;
    dctx.globalAlpha = rand(0.7, 0.92); dctx.fillStyle = col;
    const sp = Math.hypot(vx, vy);
    dctx.beginPath();
    if (sp > 300) { // 빠르게 떨어진 방울은 길쭉한 자국
      const a = Math.atan2(vy * 0.45, vx), len = Math.min(3.2, sp / 260);
      dctx.ellipse(x, y, rr * len, rr * 0.5, a, 0, 6.283);
    } else dctx.ellipse(x, y, rr * 1.15, rr * 0.5, 0, 0, 6.283);
    dctx.fill();
    if (Math.random() < 0.3) { dctx.beginPath(); dctx.arc(x + rand(-3, 3) * rr, y + rand(-1, 1) * rr * 0.5, rr * 0.35, 0, 6.283); dctx.fill(); }
    dctx.globalAlpha = 1;
  }
  function drawGib(c, x, y, p, s) {
    c.save(); c.translate(x, y); c.rotate(p.rot); c.fillStyle = p.col; c.beginPath();
    for (let i = 0; i < p.sides; i++) { const a = (i / p.sides) * 6.283, rr = p.r * s * (0.7 + ((i * 37) % 5) / 10); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
    c.closePath(); c.fill(); c.restore();
  }

  // ───────── 화면 공간: 연기·탄피·불꽃·먼지 ─────────
  F.smoke = function (x, y, dx, dy, n = 5) {
    for (let i = 0; i < n; i++) scr.push({ k: 0, x, y, vx: dx * rand(40, 160) + rand(-25, 25), vy: dy * rand(40, 160) - rand(10, 50), r: rand(10, 22), g: rand(40, 80), life: rand(0.7, 1.3), max: 1.3 });
  };
  F.casing = function (x, y, floor) {
    scr.push({ k: 1, x, y, vx: rand(-180, 180), vy: rand(-380, -120), rot: rand(0, 6.28), vr: rand(-25, 25), floor, b: 0, life: 2.2, max: 2.2 });
  };
  F.sparks = function (x, y, dx, dy, n = 6, col = '#ffd27a') {
    for (let i = 0; i < n; i++) { const a = Math.atan2(dy, dx) + rand(-0.7, 0.7), sp = rand(300, 900);
      scr.push({ k: 2, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.08, 0.2), max: 0.2, col }); }
  };
  F.dust = function (x, y, s) {
    for (let i = 0; i < 6; i++) scr.push({ k: 3, x, y, vx: rand(-160, 160) * s, vy: rand(-420, -120) * s, r: rand(1.5, 3.5) * s, floor: y + rand(0, 6), life: 0.7, max: 0.7 });
    for (let i = 0; i < 3; i++) scr.push({ k: 0, x, y: y - 6 * s, vx: rand(-40, 40), vy: rand(-60, -20), r: rand(8, 14) * s, g: 60 * s, life: 0.6, max: 0.6 });
  };

  // ───────── 글자 ─────────
  F.number = function (x, y, val, type) {
    const col = type === 'head' ? '#ffd23a' : type === 'over' ? '#ff8a2a' : type === 'chain' ? '#ff3b3b' : '#ffffff';
    const size = (20 + Math.log2(Math.max(2, val)) * 3.2) * (type === 'head' ? 1.25 : 1);
    texts.push({ x: x + rand(-10, 10), y, vy: -120, text: String(Math.round(val)), col, size, life: 0.75, max: 0.75 });
  };
  F.text = function (x, y, text, col = '#fff', size = 48, life = 1.0) { texts.push({ x, y, vy: -40, text, col, size, life, max: life, big: true }); };

  // ───────── 카메라·시간 ─────────
  F.trauma = t => { trauma = Math.min(1, trauma + t); };
  F.kick = (dx, dy) => { kvx += dx; kvy += dy; };
  F.zoomPunch = z => { zoom += z; };
  F.hitstop = sec => { hitstop = Math.max(hitstop, sec); };
  F.slowmo = (scale, sec) => { if (sec >= slowT) { slowScale = scale; slowT = slowMax = sec; } };
  F.light = (x, y, a) => { lx = x; ly = y; light = Math.max(light, a); };
  F.flash = (a, col = '#fff') => { flashA = Math.max(flashA, a); flashCol = col; };
  F.hurt = a => { hurtA = Math.max(hurtA, a); };
  F.shakeAmt = () => trauma * trauma;

  // 실제 시간 → 게임 시간 (히트스탑이면 0)
  F.step = function (dt) {
    F.time += dt;
    trauma = Math.max(0, trauma - dt * 1.5);
    kvx += (-260 * kx - 22 * kvx) * dt; kvy += (-260 * ky - 22 * kvy) * dt; kx += kvx * dt; ky += kvy * dt;
    zoom *= Math.exp(-dt * 9); light *= Math.exp(-dt * 26); flashA *= Math.exp(-dt * 14); hurtA *= Math.exp(-dt * 3);
    if (hitstop > 0) { hitstop -= dt; return 0; }
    if (slowT > 0) { slowT -= dt; const k = ZK.clamp(slowT / (slowMax * 0.35), 0, 1); return dt * ZK.lerp(1, slowScale, k); }
    return dt;
  };
  F.applyCamera = function (c, amount = 1) {
    const sh = trauma * trauma * amount, t = F.time;
    const ox = 30 * sh * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 117.7 + 1.3) * 0.4);
    const oy = 30 * sh * (Math.sin(t * 53.9 + 2.1) * 0.6 + Math.sin(t * 101.1 + 0.4) * 0.4);
    const rot = 0.04 * sh * Math.sin(t * 47.7 + 0.5);
    c.translate(W / 2, H / 2); c.rotate(rot); c.scale(1 + zoom, 1 + zoom);
    c.translate(-W / 2 + ox + kx * amount, -H / 2 + oy + ky * amount);
  };

  // ───────── 업데이트 ─────────
  F.update = function (dt) {
    if (dt <= 0) return;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vz -= G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.k === 1) p.rot += p.vr * dt;
      if (p.z <= 0) {
        if (p.k === 0) { splat(p.x, p.y, p.r, p.col, p.vx, p.vy); parts.splice(i, 1); continue; }
        if (p.bounce < 1 && p.vz < -260) { p.z = 0; p.vz *= -0.28; p.vx *= 0.45; p.vy *= 0.45; p.vr *= 0.5; p.bounce++;
          splat(p.x, p.y, p.r * 0.7, BLOOD[0]); continue; }
        drawGib(dctx, p.x, p.y, p, ZK.scaleAt(p.y)); parts.splice(i, 1); continue;
      }
      if (p.life <= 0) parts.splice(i, 1);
    }
    if (parts.length > 2600) parts.splice(0, parts.length - 2600);
    for (let i = splashes.length - 1; i >= 0; i--) { splashes[i].t += dt; if (splashes[i].t > splashes[i].life) splashes.splice(i, 1); }
    for (let i = mists.length - 1; i >= 0; i--) { const m = mists[i]; m.life -= dt; m.r += m.g * dt; m.y += 20 * dt; if (m.life <= 0) mists.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; r.r = ZK.lerp(r.r, r.max, 1 - Math.exp(-dt * 14)); if (r.t > r.life) rings.splice(i, 1); }
    for (let i = pools.length - 1; i >= 0; i--) {
      const p = pools[i]; p.t += dt; p.r = p.max * (1 - Math.pow(1 - Math.min(1, p.t / 1.6), 3));
      if (p.t > 1.6) { dctx.fillStyle = 'rgba(70,3,7,0.88)'; dctx.beginPath(); dctx.ellipse(p.x, p.y, p.r, p.r * 0.42, 0, 0, 6.283); dctx.fill(); pools.splice(i, 1); }
    }
    for (let i = scr.length - 1; i >= 0; i--) {
      const p = scr[i]; p.life -= dt;
      if (p.k === 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.r += p.g * dt; }
      else if (p.k === 1) {
        p.vy += 2600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.42; p.vx *= 0.6; p.vr *= 0.6; if (p.b++ < 3) ZK.audio.casing(0.9 / (p.b)); }
      } else if (p.k === 2) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
      else { p.vy += 1800 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.5; } }
      if (p.life <= 0) scr.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= 0.93; if (t.life <= 0) texts.splice(i, 1); }
    // 오래된 핏자국은 아주 천천히 마른다
    fadeT += dt;
    if (fadeT > 1.5) { fadeT = 0; dctx.globalCompositeOperation = 'destination-out'; dctx.fillStyle = 'rgba(0,0,0,0.03)'; dctx.fillRect(0, 0, W, H); dctx.globalCompositeOperation = 'source-over'; }
  };

  // ───────── 그리기 ─────────
  F.drawDecals = function (c) {
    c.drawImage(decal, 0, 0);
    for (const p of pools) { c.fillStyle = 'rgba(70,3,7,0.88)'; c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 0.42, 0, 0, 6.283); c.fill(); }
  };
  F.drawBlood = function (c) {
    for (const p of parts) {
      const s = ZK.scaleAt(p.y), x = p.x, y = p.y - p.z * s;
      if (p.k === 1) { drawGib(c, x, y, p, s); continue; }
      const dx = p.vx * 0.016, dy = (p.vy - p.vz * s) * 0.016;
      c.strokeStyle = p.col; c.lineWidth = Math.max(1.2, p.r * s * 1.5); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - dx, y - dy); c.stroke();
    }
    for (const m of mists) { c.globalAlpha = (m.life / m.max) * 0.95; c.drawImage(mistSpr, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2); }
    for (const p of splashes) {
      const k = p.t / p.life, grow = Math.min(1, p.t / 0.05), R = p.r * (0.45 + 0.55 * grow);
      c.globalAlpha = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
      for (const [col, f] of [['#5e0308', 1], ['#c0141e', 0.55]]) {
        c.fillStyle = col; c.beginPath();
        for (let i = 0; i < p.spikes.length; i++) {
          const sp = p.spikes[i], a2 = sp.a + 0.22;
          c.lineTo(p.x + Math.cos(sp.a) * R * sp.l * f, p.y + Math.sin(sp.a) * R * sp.l * f);
          c.lineTo(p.x + Math.cos(a2) * R * 0.3 * f, p.y + Math.sin(a2) * R * 0.3 * f);
        }
        c.closePath(); c.fill();
      }
    }
    c.globalAlpha = 1;
    for (const r of rings) {
      const a = 1 - r.t / r.life; c.strokeStyle = r.col + a + ')'; c.lineWidth = r.w * r.s * a + 1;
      c.beginPath(); c.ellipse(r.x, r.y, r.r, r.r * 0.45, 0, 0, 6.283); c.stroke();
    }
  };
  F.drawTexts = function (c) {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const t of texts) {
      const age = t.max - t.life, pop = age < 0.09 ? ZK.lerp(1.7, 1, age / 0.09) : 1;
      c.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
      const size = t.size * pop;
      c.font = `900 ${size | 0}px "Arial Black", Impact, system-ui, sans-serif`;
      const jx = t.big && age < 0.25 ? rand(-3, 3) : 0;
      c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.strokeText(t.text, t.x + jx, t.y);
      c.fillStyle = t.col; c.fillText(t.text, t.x + jx, t.y);
    }
    c.globalAlpha = 1;
  };
  F.drawScreen = function (c) {
    for (const p of scr) {
      const a = p.life / p.max;
      if (p.k === 0) { c.globalAlpha = a * 0.75; c.drawImage(smokeSpr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
      else if (p.k === 1) {
        c.globalAlpha = Math.min(1, a * 3); c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = '#b8862b'; c.fillRect(-7, -3, 14, 6); c.fillStyle = '#f3cf6e'; c.fillRect(-7, -3, 14, 2);
        c.fillStyle = '#7a5418'; c.fillRect(5, -3.5, 2.5, 7); c.restore();
      } else if (p.k === 2) {
        c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = 2.2; c.beginPath();
        c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke();
      } else { c.globalAlpha = a; c.fillStyle = '#8d8a84'; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    }
    c.globalAlpha = 1;
  };
  F.drawLight = function (c) {
    if (light < 0.02) return;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.min(1, light);
    const r = 760; c.drawImage(lightSpr, lx - r, ly - r, r * 2, r * 2);
    c.fillStyle = `rgba(255,190,120,${0.10 * light})`; c.fillRect(0, 0, W, H);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  };
  F.drawOverlay = function (c) {
    if (hurtA > 0.02) {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, `rgba(160,0,0,${hurtA})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (flashA > 0.02) { c.globalAlpha = flashA; c.fillStyle = flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  };

  ZK.fx = F;
})();
