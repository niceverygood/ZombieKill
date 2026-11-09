// 3D 이펙트: 피 방울(중력) · 바닥 핏자국 · 피웅덩이 · 핏안개 · 살점 · 탄흔 · 먼지 · 연기 · 탄피 · 숫자 · 흔들림 · 히트스탑 · 슬로모
(function () {
  const T = THREE, { rand } = ZK;
  const F = {};
  const G = 15;                                   // 연출용 중력 (실제보다 약간 강하게)
  let scene;
  let hitstop = 0, slowT = 0, slowMax = 0, slowScale = 1, trauma = 0;
  F.time = 0;

  // ───────── 텍스처 (캔버스로 생성) ─────────
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size); const t = new T.CanvasTexture(c); return t;
  }
  const radial = (stops) => canvasTex(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  let dropTex, mistTex, smokeTex, splatTex, holeTex, sparkTex;

  // ───────── 풀(pool) 생성 ─────────
  function points(n, size, tex, additive) {
    const geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, alphaTest: additive ? 0 : 0.2, depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending });
    const p = new T.Points(geo, mat); p.frustumCulled = false; scene.add(p);
    return { n, pos, col, geo, v: new Float32Array(n * 3), life: new Float32Array(n), i: 0, splat: !additive };
  }
  function decals(n, tex, flat, color) {
    const geo = new T.PlaneGeometry(1, 1); if (flat) geo.rotateX(-Math.PI / 2);
    const mat = new T.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = false;
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { m.setMatrixAt(i, zero); m.setColorAt(i, new T.Color(color)); }
    scene.add(m); return { m, n, i: 0 };
  }
  function sprites(n, tex, additive) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
      s.visible = false; scene.add(s); arr.push({ s, life: 0, max: 1, grow: 0, op: 1, vel: new T.Vector3() });
    }
    return { arr, i: 0 };
  }
  let drops, bigDrops, sparks, ground, holes, mists, smokes, impacts, gibs = [], gibI = 0, casings = [], casI = 0, pools = [];
  const texts = [];
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(), _p = new T.Vector3(), _e = new T.Euler(), Z = new T.Vector3(0, 0, 1);

  F.init = function (sc) {
    scene = sc;
    dropTex = radial([[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    mistTex = radial([[0, 'rgba(170,10,16,0.9)'], [0.5, 'rgba(130,5,10,0.45)'], [1, 'rgba(90,0,4,0)']]);
    smokeTex = radial([[0, 'rgba(200,200,205,0.55)'], [0.6, 'rgba(160,160,170,0.2)'], [1, 'rgba(140,140,150,0)']]);
    sparkTex = radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,220,140,0.9)'], [1, 'rgba(255,140,40,0)']]);
    splatTex = canvasTex(128, (g, s) => {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.26, 0, 6.283); g.fill();
      for (let i = 0; i < 14; i++) { const a = rand(0, 6.283), d = rand(0.18, 0.44) * s, r = rand(0.02, 0.08) * s;
        g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, 6.283); g.fill(); }
      for (let i = 0; i < 6; i++) { const a = rand(0, 6.283); g.lineWidth = rand(3, 7); g.strokeStyle = '#fff'; g.lineCap = 'round';
        g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s * 0.4, s / 2 + Math.sin(a) * s * 0.4); g.stroke(); }
    });
    holeTex = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.22, 'rgba(10,10,10,1)'); gr.addColorStop(0.35, 'rgba(60,55,50,0.8)'); gr.addColorStop(1, 'rgba(40,38,35,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    drops = points(1600, 0.045, dropTex, false);
    bigDrops = points(500, 0.1, dropTex, false);
    sparks = points(300, 0.06, sparkTex, true);
    ground = decals(900, splatTex, true, 0x5a0307);
    holes = decals(250, holeTex, false, 0xffffff);
    mists = sprites(50, mistTex, false);
    smokes = sprites(50, smokeTex, false);
    impacts = sprites(24, sparkTex, true); for (const o of impacts.arr) o.s.material.depthTest = false;   // 몸 표면에 반쯤 묻히지 않게
    const gGeo = new T.BoxGeometry(1, 1, 1);
    const mats = [0x5b1a1a, 0x7a2626, 0x4a1212, 0x6f8a5e, 0xe8e0cc].map(c => new T.MeshLambertMaterial({ color: c }));
    F._gibMats = mats;
    for (let i = 0; i < 160; i++) { const m = new T.Mesh(gGeo, mats[0]); m.visible = false; scene.add(m); gibs.push({ m, v: new T.Vector3(), w: new T.Vector3(), life: 0, rest: false }); }
    const cGeo = new T.CylinderGeometry(0.0055, 0.0055, 0.033, 6), cMat = new T.MeshLambertMaterial({ color: 0xc9952f, emissive: 0x2a1a00 });
    for (let i = 0; i < 36; i++) { const m = new T.Mesh(cGeo, cMat); m.visible = false; scene.add(m); casings.push({ m, v: new T.Vector3(), w: new T.Vector3(), b: 0, life: 0 }); }
  };

  // ───────── 피 ─────────
  const RED = [[0.54, 0.04, 0.07], [0.64, 0.06, 0.1], [0.43, 0.03, 0.05], [0.72, 0.09, 0.12]];
  function emit(sys, p, vx, vy, vz, life, rgb) {
    const i = sys.i; sys.i = (sys.i + 1) % sys.n;
    sys.pos[i * 3] = p.x; sys.pos[i * 3 + 1] = p.y; sys.pos[i * 3 + 2] = p.z;
    sys.v[i * 3] = vx; sys.v[i * 3 + 1] = vy; sys.v[i * 3 + 2] = vz; sys.life[i] = life;
    const c = rgb || RED[(Math.random() * RED.length) | 0]; sys.col[i * 3] = c[0]; sys.col[i * 3 + 1] = c[1]; sys.col[i * 3 + 2] = c[2];
  }
  // 총알이 박힌 지점: 관통 방향으로 크게(출구), 쏜 쪽으로 조금(입구)
  F.blood = function (p, dir, power = 1, head = false) {
    const n = Math.round((head ? 80 : 46) * power);
    const side = new T.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < n; i++) {
      const sp = rand(1.2, 6.5) * power * (head ? 1.25 : 1), spr = rand(-0.55, 0.55), up = rand(-0.2, 1.1);
      const sys = Math.random() < 0.25 ? bigDrops : drops;
      emit(sys, p, (dir.x + side.x * spr) * sp, (dir.y + up) * sp * 0.6 + rand(0, 1.5), (dir.z + side.z * spr) * sp, 3);
    }
    for (let i = 0; i < 12; i++) emit(drops, p, -dir.x * rand(0.5, 2.2) + rand(-0.8, 0.8), rand(0.3, 2), -dir.z * rand(0.5, 2.2) + rand(-0.8, 0.8), 3);
    for (let i = 0; i < (head ? 5 : 3); i++) {
      const q = p.clone().addScaledVector(dir, 0.12 * i);
      F.sprite(mists, q, (0.28 + i * 0.07) * power, 1.6 * power, 0.45, dir.clone().multiplyScalar(0.6), 0.95);
    }
  };
  // 숙주 고름주머니가 터질 때: 연두색 방울 + 옅은 연기 (피와 구분되게)
  F.goo = function (p, dir) {
    const G = [[0.62, 1, 0.3], [0.45, 0.85, 0.2], [0.8, 1, 0.45]];
    for (let i = 0; i < 70; i++) emit(Math.random() < 0.3 ? bigDrops : drops, p, dir.x * rand(0.5, 3) + rand(-3, 3), rand(0.5, 5), dir.z * rand(0.5, 3) + rand(-3, 3), 3, G[i % 3]);
    for (let i = 0; i < 4; i++) F.sprite(mists, p.clone().add(new T.Vector3(rand(-0.2, 0.2), rand(0, 0.3), rand(-0.2, 0.2))), 0.5, 2.2, 0.6, new T.Vector3(0, 0.6, 0), 0.7);
  };
  F.spurt = function (p, power = 1) {
    for (let i = 0; i < 7; i++) emit(Math.random() < 0.3 ? bigDrops : drops, p, rand(-0.9, 0.9) * power, rand(2.5, 5) * power, rand(-0.9, 0.9) * power, 3);
  };
  F.gibs = function (p, dir, n, bone = false, power = 1) {
    for (let i = 0; i < n; i++) {
      const g = gibs[gibI]; gibI = (gibI + 1) % gibs.length;
      const isBone = bone && Math.random() < 0.35;
      g.m.material = F._gibMats[isBone ? 4 : (Math.random() * 4) | 0];
      const sz = rand(0.03, 0.09); g.m.scale.set(sz * rand(0.7, 1.4), sz * rand(0.5, 1), sz);
      g.m.position.copy(p); g.m.visible = true; g.rest = false; g.life = 25;
      g.v.set(dir.x * rand(1, 4) + rand(-2.5, 2.5), rand(1.5, 5.5), dir.z * rand(1, 4) + rand(-2.5, 2.5)).multiplyScalar(power);
      g.w.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
    }
  };
  F.groundSplat = function (x, z, size, ang = rand(0, 6.283), stretch = 1, dark = false) {
    const d = ground, i = d.i; d.i = (d.i + 1) % d.n;
    _e.set(0, ang, 0); _q.setFromEuler(_e); _p.set(x, 0.006 + (i % 50) * 0.0002, z); _s.set(size * stretch, 1, size);
    _m.compose(_p, _q, _s); d.m.setMatrixAt(i, _m); d.m.instanceMatrix.needsUpdate = true;
    const k = dark ? 0.55 : rand(0.75, 1.15); d.m.setColorAt(i, new T.Color(0.42 * k, 0.02 * k, 0.04 * k)); d.m.instanceColor.needsUpdate = true;
    return i;
  };
  F.pool = function (x, z, size) { pools.push({ x, z, size: size * rand(0.85, 1.2), t: 0, ang: rand(0, 6.283), idx: F.groundSplat(x, z, 0.01, 0, 1, true) }); };
  // 벽·바닥 탄흔
  F.hole = function (p, normal, ground = false) {
    const d = holes, i = d.i; d.i = (d.i + 1) % d.n;
    _q.setFromUnitVectors(Z, normal); const s = rand(0.05, 0.08);
    _p.copy(p).addScaledVector(normal, 0.004); _s.set(s, s, s);
    _m.compose(_p, _q, _s); d.m.setMatrixAt(i, _m); d.m.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 4; k++) F.sprite(smokes, p.clone().addScaledVector(normal, 0.05), rand(0.08, 0.16), 0.6, 0.6, normal.clone().multiplyScalar(rand(0.3, 0.8)), 0.7);
    F.sparks(p, normal, ground ? 6 : 9);
  };
  F.sparks = function (p, dir, n = 6) {
    for (let i = 0; i < n; i++) emit(sparks, p, dir.x * rand(1, 5) + rand(-2, 2), dir.y * rand(1, 5) + rand(0, 2.5), dir.z * rand(1, 5) + rand(-2, 2), rand(0.08, 0.22), [1, 0.85, 0.5]);
  };
  F.smoke = function (p, dir) { for (let i = 0; i < 4; i++) F.sprite(smokes, p.clone().addScaledVector(dir, 0.15 + i * 0.08), rand(0.03, 0.06), 0.35, rand(0.5, 0.9), dir.clone().multiplyScalar(rand(0.6, 1.6)).add(new T.Vector3(0, rand(0.1, 0.3), 0)), 0.28); };
  F.casing = function (p, v) {
    const c = casings[casI]; casI = (casI + 1) % casings.length;
    c.m.position.copy(p); c.m.visible = true; c.v.copy(v); c.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20)); c.b = 0; c.life = 6;
  };
  // 명중 섬광: 총알이 살에 박히는 순간 그 자리가 한 프레임 번쩍 (헤드샷은 금빛·크게, 처치는 붉게)
  F.impact = function (p, kind = 'body') {
    const big = kind === 'head' ? 1.6 : kind === 'kill' ? 1.3 : 1, col = kind === 'head' ? 0xffd860 : kind === 'kill' ? 0xff5a40 : 0xfff0d8;
    F.sprite(impacts, p, 0.32 * big, 5 * big, 0.075, null, 1); impacts.arr[(impacts.i + impacts.arr.length - 1) % impacts.arr.length].s.material.color.setHex(col);
    F.sparks(p, new T.Vector3(0, 0.6, 0), kind === 'head' ? 14 : 7);
  };
  F.sprite = function (pool, p, size, grow, life, vel, op = 1) {
    const o = pool.arr[pool.i]; pool.i = (pool.i + 1) % pool.arr.length;
    o.s.position.copy(p); o.s.scale.setScalar(size); o.s.visible = true; o.s.material.opacity = op; o.s.material.rotation = rand(0, 6.283);
    o.life = o.max = life; o.grow = grow; o.op = op; o.vel.copy(vel || new T.Vector3());
  };

  // ───────── 글자 (HUD 캔버스에 투영해서 그림) ─────────
  F.number = (p, val, type) => texts.push({ p: p.clone(), text: String(Math.round(val)), type, life: 0.8, max: 0.8, rise: 0 });
  F.text = (p, text, col, size, life = 1) => texts.push({ p: p.clone(), text, col, size, life, max: life, rise: 0, big: true });

  // ───────── 시간·흔들림 ─────────
  // 손맛 세기: 주소 뒤에 ?juice=0.5 (약하게) · ?juice=1.5 (더 세게). 흔들림·카메라 펀치·화면 섬광에만 곱한다 (히트스톱·슬로모는 그대로)
  const J = F.J = (v => (isFinite(v) ? ZK.clamp(v, 0, 2) : 1))(+(new URLSearchParams(location.search).get('juice') ?? 1));
  F.trauma = t => { trauma = Math.min(1, trauma + t * J); };
  F.hitstop = s => { hitstop = Math.max(hitstop, s); };
  F.slowmo = (scale, s) => { if (s >= slowT) { slowScale = scale; slowT = slowMax = s; } };
  // 카메라 펀치: 한 방 한 방이 화면을 '때리는' 스프링 (값 = 대략 최대 변위, 라디안·미터)
  // trauma(무작위 떨림)와 달리 방향이 있다 → 발사는 위로 튀고 뒤로 밀림, 피격은 맞은 쪽으로 꺾임
  const pun = { p: 0, pv: 0, y: 0, yv: 0, r: 0, rv: 0, b: 0, bv: 0 };
  F.punch = (pitch = 0, yaw = 0, roll = 0, back = 0) => { const k = 27 * J; pun.pv += pitch * k; pun.yv += yaw * k; pun.rv += roll * k; pun.bv += back * k; };
  function spring(dt) {
    const K = 220, C = 20;   // ω≈14.8 · 감쇠비 0.67 → 0.1초 안에 튀었다가 0.3초에 거의 복귀
    for (const [x, v] of [['p', 'pv'], ['y', 'yv'], ['r', 'rv'], ['b', 'bv']]) { pun[v] += (-K * pun[x] - C * pun[v]) * dt; pun[x] += pun[v] * dt; }
  }
  // 화면 섬광: 총구 불빛 · 헤드샷 금빛 테두리 · 피격 붉은 번쩍 (HUD 캔버스에 그림)
  const flashes = [];
  F.flash = (r, g, b, a, dur, kind = 'full') => { if (flashes.length > 6) flashes.shift(); flashes.push({ r, g, b, a: a * Math.min(1.3, J), t: dur, max: dur, kind }); };
  F.step = function (dt) {
    F.time += dt; trauma = Math.max(0, trauma - dt * 1.5);
    const sd = Math.min(dt, 1 / 30); spring(sd); if (dt > sd) spring(dt - sd);   // 스프링은 실제 시간으로 → 히트스톱 중에도 화면은 튄다
    if (hitstop > 0) { hitstop -= dt; return 0; }
    if (slowT > 0) { slowT -= dt; const k = ZK.clamp(slowT / (slowMax * 0.35), 0, 1); return dt * ZK.lerp(1, slowScale, k); }
    return dt;
  };
  // 흔들림: 예전엔 trauma² × 0.03이라 리볼버 한 발(0.16)이 0.04°밖에 안 흔들렸다 → 지수 1.6 · 진폭 약 2배 · 주파수 세 개를 섞어 덜 기계적으로
  F.shake = function () {
    const s = Math.pow(trauma, 1.6), t = F.time;
    const n = (a, b, c) => (Math.sin(t * a) + Math.sin(t * b + 1.3) * 0.6 + Math.sin(t * c + 2.1) * 0.35) / 1.95;
    return { yaw: 0.055 * s * n(59.1, 83.7, 31.3) + pun.y, pitch: 0.055 * s * n(47.3, 71.9, 23.1) + pun.p, roll: 0.08 * s * n(37.9, 61.3, 19.7) + pun.r,
      x: 0.05 * s * n(53.3, 77.1, 29.9), y: 0.05 * s * n(43.7, 67.3, 27.1), back: pun.b };
  };
  F.drawScreen = function (c, W, H, real) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.t -= real; if (f.t <= 0) { flashes.splice(i, 1); continue; }
      const k = f.t / f.max, a = f.a * k * k;   // 처음에 확 → 빠르게 빠짐
      if (f.kind === 'edge') {
        const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
        gr.addColorStop(0, `rgba(${f.r},${f.g},${f.b},0)`); gr.addColorStop(1, `rgba(${f.r},${f.g},${f.b},${a})`); c.fillStyle = gr;
      } else c.fillStyle = `rgba(${f.r},${f.g},${f.b},${a})`;
      c.fillRect(0, 0, W, H);
    }
  };

  // ───────── 업데이트 ─────────
  function stepPoints(sys, dt, gravity) {
    const P = sys.pos, V = sys.v;
    for (let i = 0; i < sys.n; i++) {
      if (sys.life[i] <= 0) continue;
      sys.life[i] -= dt; V[i * 3 + 1] -= gravity * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] <= 0.01 || sys.life[i] <= 0) {
        if (sys.splat && P[i * 3 + 1] <= 0.01) {
          const vx = V[i * 3], vz = V[i * 3 + 2], sp = Math.hypot(vx, vz);
          F.groundSplat(P[i * 3], P[i * 3 + 2], (sys === bigDrops ? rand(0.1, 0.22) : rand(0.04, 0.1)), -Math.atan2(vz, vx), 1 + Math.min(2.2, sp * 0.35));
        }
        sys.life[i] = 0; P[i * 3 + 1] = -999;
      }
    }
    sys.geo.attributes.position.needsUpdate = true; sys.geo.attributes.color.needsUpdate = true;
  }
  F.update = function (dt) {
    if (dt <= 0) return;
    stepPoints(drops, dt, G); stepPoints(bigDrops, dt, G); stepPoints(sparks, dt, 6);
    for (const pool of [mists, smokes, impacts]) for (const o of pool.arr) {
      if (o.life <= 0) continue;
      o.life -= dt; o.s.position.addScaledVector(o.vel, dt); o.vel.multiplyScalar(Math.exp(-dt * 3));
      o.s.scale.addScalar(o.grow * dt); o.s.material.opacity = o.op * Math.max(0, o.life / o.max);
      if (o.life <= 0) o.s.visible = false;
    }
    for (const g of gibs) {
      if (!g.m.visible || g.rest) continue;
      g.v.y -= G * dt; g.m.position.addScaledVector(g.v, dt);
      g.m.rotation.x += g.w.x * dt; g.m.rotation.y += g.w.y * dt; g.m.rotation.z += g.w.z * dt;
      if (g.m.position.y <= g.m.scale.y * 0.5) {
        g.m.position.y = g.m.scale.y * 0.5;
        if (g.v.y < -2) { F.groundSplat(g.m.position.x, g.m.position.z, rand(0.08, 0.16)); g.v.y *= -0.3; g.v.x *= 0.5; g.v.z *= 0.5; g.w.multiplyScalar(0.5); }
        else { g.rest = true; g.m.rotation.x = 0; g.m.rotation.z = 0; }
      }
    }
    for (const c of casings) {
      if (!c.m.visible) continue;
      c.life -= dt; c.v.y -= 22 * dt; c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.z += c.w.z * dt;
      if (c.m.position.y < 0.01 && c.v.y < 0) {
        c.m.position.y = 0.01; c.v.y *= -0.4; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6);
        if (c.b++ < 3) ZK.audio.casing(0.9 / c.b);
      }
      if (c.life <= 0) c.m.visible = false;
    }
    for (let i = pools.length - 1; i >= 0; i--) {
      const p = pools[i]; p.t += dt; const k = 1 - Math.pow(1 - Math.min(1, p.t / 1.8), 3);
      _e.set(0, p.ang, 0); _q.setFromEuler(_e); _p.set(p.x, 0.005, p.z); _s.set(p.size * k, 1, p.size * k * 0.8);
      _m.compose(_p, _q, _s); ground.m.setMatrixAt(p.idx, _m); ground.m.instanceMatrix.needsUpdate = true;
      if (p.t > 1.8) pools.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.rise += dt * (t.big ? 0.25 : 0.7); if (t.life <= 0) texts.splice(i, 1); }
  };

  const _v = new T.Vector3();
  F.drawTexts = function (c, camera, W, H) {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const t of texts) {
      _v.copy(t.p); _v.y += t.rise; _v.project(camera); if (_v.z > 1) continue;
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, age = t.max - t.life;
      const pop = age < 0.12 ? ZK.lerp(2.3, 1, 1 - Math.pow(1 - age / 0.12, 2)) : 1;   // 튀어나오며 커졌다가 제자리 (예전 1.7배)
      const jit = (t.type === 'head' || t.type === 'chain') && age < 0.18 ? (1 - age / 0.18) * 5 : 0;
      const col = t.col || (t.type === 'head' ? '#ffd23a' : t.type === 'chain' ? '#ff3b3b' : '#ffffff');
      const size = (t.size || (22 + Math.log2(Math.max(2, +t.text || 2)) * 3) * (t.type === 'head' ? 1.2 : 1)) * pop;
      c.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
      c.font = `900 ${size | 0}px "Arial Black", Impact, system-ui, sans-serif`;
      const jx = jit ? (Math.random() - 0.5) * jit * 2 : 0, jy = jit ? (Math.random() - 0.5) * jit * 2 : 0;
      c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.strokeText(t.text, x + jx, y + jy); c.fillStyle = col; c.fillText(t.text, x + jx, y + jy);
    }
    c.globalAlpha = 1;
  };
  F.reset = function () {
    for (const sys of [drops, bigDrops, sparks]) { sys.life.fill(0); for (let i = 0; i < sys.n; i++) sys.pos[i * 3 + 1] = -999; sys.geo.attributes.position.needsUpdate = true; }
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    for (const d of [ground, holes]) { for (let i = 0; i < d.n; i++) d.m.setMatrixAt(i, zero); d.m.instanceMatrix.needsUpdate = true; d.i = 0; }
    for (const g of gibs) g.m.visible = false; for (const c of casings) c.m.visible = false;
    for (const pool of [mists, smokes, impacts]) for (const o of pool.arr) { o.life = 0; o.s.visible = false; }
    pools.length = texts.length = flashes.length = 0; trauma = hitstop = slowT = 0; for (const k in pun) pun[k] = 0;
  };

  ZK.fx3 = F;
})();
