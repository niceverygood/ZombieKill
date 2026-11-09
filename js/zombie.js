// 좀비: 걷기·피격 경련·넉백·헤드샷 머리 터짐·목 분수·쓰러짐·시체
(function () {
  const { W, rand, clamp } = ZK;
  const pick = a => a[(Math.random() * a.length) | 0];
  const TYPES = {
    walker: { hp: 60, speed: 34, dmg: 6, skin: ['#7d9a6a', '#86a172', '#6f8c60', '#8a9d77'], shirts: ['#2d3a4f', '#4a3b2c', '#5a2a2a', '#3d4a3a', '#555b63', '#6b5a3a'] },
    runner: { hp: 30, speed: 95, dmg: 4, skin: ['#8fa47a', '#9aae84'], shirts: ['#1f2530', '#2b2f3a', '#33363f'], suit: true }, // 출근러
  };
  let lastGroan = 0;
  const wcache = {};
  function whiten(hex, t) { // 피격 플래시: 원래 색을 하얗게 섞기 (완전 흰 실루엣 X)
    const k = hex + t; if (wcache[k]) return wcache[k];
    const n = parseInt(hex.slice(1), 16), f = v => Math.round(v + (255 - v) * t);
    return (wcache[k] = `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`);
  }

  class Zombie {
    constructor(type, x, y) {
      const T = TYPES[type];
      this.type = type; this.T = T; this.x = x; this.y = y;
      this.hp = this.maxHp = T.hp; this.speed = T.speed * rand(0.85, 1.15);
      this.skin = pick(T.skin); this.shirt = pick(T.shirts); this.pants = pick(['#22262c', '#2e2a24', '#1d2230', '#33302a']);
      this.hair = Math.random() < 0.6 ? pick(['#1a1715', '#2b2420', '#3a332c', '#5a5550']) : null;
      this.tears = Array.from({ length: (Math.random() * 3) | 0 }, () => ({ x: rand(-20, 20), y: rand(-145, -90), r: rand(4, 8) }));
      this.phase = rand(0, 6.28); this.seed = rand(0, 100); this.tilt = rand(-0.18, 0.18);
      this.state = 'walk'; this.flash = 0; this.stagger = 0; this.kvx = 0; this.kvy = 0;
      this.lean = 0; this.leanV = 0; this.snap = 0; this.wounds = [];
      this.headless = false; this.spurtT = 0; this.pulse = 0;
      this.fallA = 0; this.fallV = 0; this.fallDir = 1; this.fallDelay = 0; this.landed = 0; this.deadT = 0;
      this.atkT = rand(0.4, 1.0); this.swing = 0; this.remove = false;
    }
    get s() { return ZK.scaleAt(this.y); }
    get alive() { return this.state === 'walk' || this.state === 'attack'; }
    get pan() { return ((this.x - W / 2) / (W / 2)) * 0.75; }
    bob() { return this.state === 'walk' ? -Math.abs(Math.sin(this.phase)) * 4 : 0; }
    sway() { return Math.sin(this.phase) * 3; }
    headPos() { const s = this.s; return { x: this.x + this.sway() * s, y: this.y + (-176 + this.bob()) * s }; }

    hitTest(px, py) {
      if (!this.alive) return null;
      const s = this.s, h = this.headPos();
      if (!this.headless && (px - h.x) ** 2 + (py - h.y) ** 2 <= (24 * s) ** 2) return 'head';
      if (Math.abs(px - this.x) <= 31 * s && py >= this.y - 158 * s && py <= this.y + 4 * s) return 'body';
      return null;
    }

    // 맞았다: 피·상처·넉백·경련. 반환값으로 오버킬 계산
    takeHit(px, py, dmg, part, dx, dy, opt = {}) {
      if (!this.alive) return null;
      const s = this.s, prev = this.hp;
      this.hp -= dmg;
      const killed = this.hp <= 0, overkill = killed ? dmg - prev : 0, head = part === 'head';
      this.flash = 0.06;
      ZK.fx.blood(px, py, this.y, s, dx, dy, opt.explosion ? 0.7 : head ? 1.3 : 1, head);
      if (!opt.explosion) {
        const lx = clamp((px - this.x) / s, -24, 24), ly = clamp((py - this.y) / s, -150, -20);
        if (!head) this.wounds.push({ x: lx, y: ly, d: rand(8, 16) });
        if (head) this.snap = 1;
      }
      this.kvy -= (head ? 120 : 90) * (opt.explosion ? 1.4 : 1);
      this.kvx += dx * 70 + (opt.explosion ? (this.x - opt.ex) * 2 : 0);
      this.leanV += (dx >= 0 ? 1 : -1) * (head ? 2.5 : 4.5);
      this.stagger = head ? 0.35 : 0.24;
      ZK.audio.flesh(head, this.pan);
      if (killed) this.die(part, dx, opt);
      return { killed, overkill, prev };
    }

    die(part, dx, opt) {
      this.state = 'dying';
      this.fallDir = Math.abs(dx) > 0.12 ? Math.sign(dx) : Math.random() < 0.5 ? -1 : 1;
      this.kvy -= 150; this.fallV = 1.2; this.fallDelay = 0.04;
      if (part === 'head' && !opt.explosion) {
        // 머리가 터진다: 뼈·살점 + 핏안개, 몸은 잠깐 서 있다가 쓰러짐
        const h = this.headPos(), s = this.s;
        this.headless = true; this.spurtT = 0.9; this.fallDelay = 0.3; this.fallV = 0.3;
        ZK.fx.gibs(h.x, h.y, this.y, s, 0, -1, 16, true, 1.2);
        ZK.fx.blood(h.x, h.y, this.y, s, 0, -1, 1.7, true);
        ZK.audio.splatter(14, 0.4, 0.35, this.pan);
      }
    }

    // 오버킬 폭발: 몸이 통째로 터져 시체를 남기지 않는다
    explode() {
      const s = this.s, cy = this.y - 100 * s;
      ZK.fx.gibs(this.x, cy, this.y, s, 0, -1, 26, true, 1.5);
      ZK.fx.blood(this.x, cy, this.y, s, 0, -1, 2.3, true);
      ZK.fx.blood(this.x, cy, this.y, s, rand(-1, 1), 0.4, 1.4, false);
      ZK.fx.pool(this.x, this.y, s, 70);
      this.remove = true;
    }

    update(dt, game) {
      const s = this.s;
      this.flash = Math.max(0, this.flash - dt);
      this.kvx *= Math.exp(-dt * 7); this.kvy *= Math.exp(-dt * 7);
      this.x += this.kvx * dt * s; this.y += this.kvy * dt * s;
      this.leanV += (-60 * this.lean - 9 * this.leanV) * dt; this.lean += this.leanV * dt;
      this.snap *= Math.exp(-dt * 6);
      if (this.alive) {
        this.stagger -= dt;
        const sp = this.stagger > 0 ? 0.1 : 1;
        if (ZK.fx.time - lastGroan > 0.7 && Math.random() < dt * 0.12) { lastGroan = ZK.fx.time; ZK.audio.groan(this.pan, s); }
        if (this.state === 'walk') {
          this.y += this.speed * s * sp * dt;
          this.phase += dt * (this.speed / 34) * 4.2 * sp;
          this.x += Math.sin(this.phase * 0.31 + this.seed) * 10 * s * dt;
          const half = ZK.roadHalfAt(this.y) - 24 * s;
          this.x = clamp(this.x, W / 2 - half, W / 2 + half);
          if (this.y >= ZK.LINE) { this.y = ZK.LINE; this.state = 'attack'; }
        } else {
          this.swing = Math.max(0, this.swing - dt * 4);
          this.atkT -= dt * sp;
          if (this.atkT <= 0) { this.atkT = 1.1; this.swing = 1; game.hitBarricade(this.T.dmg, this); }
          if (this.y < ZK.LINE - 6) this.state = 'walk';
        }
      } else if (this.state === 'dying') {
        if (this.spurtT > 0) {
          this.spurtT -= dt; this.pulse -= dt;
          if (this.pulse <= 0) { this.pulse = 0.085; const n = this.neckPos(); ZK.fx.spurt(n.x, n.y, this.y, s, 0.5 + this.spurtT); }
        }
        this.fallDelay -= dt;
        if (this.fallDelay <= 0) {
          this.fallV += 13 * dt; this.fallA += this.fallV * dt;
          if (this.fallA >= 1.5) {
            this.fallA = 1.5;
            if (!this.landed) {
              this.landed = 1; this.fallV = -this.fallV * 0.16;
              ZK.audio.bodyFall(s, this.pan); ZK.fx.trauma(0.05 * s);
              ZK.fx.pool(this.x + this.fallDir * 60 * s, this.y, s, 42);
            } else { this.state = 'dead'; }
          }
        }
      } else {
        this.deadT += dt;
        if (this.deadT > 3.5) { // 바닥 핏자국 레이어에 시체를 '굽고' 엔티티 제거
          const d = ZK.fx.decalCtx(); d.save(); d.globalAlpha = 0.8; this.draw(d, true); d.restore(); this.remove = true;
        }
      }
    }
    neckPos() {
      const s = this.s, a = this.fallA * this.fallDir + this.lean * 0.12, r = 160 * s;
      return { x: this.x + Math.sin(a) * r, y: this.y - Math.cos(a) * r };
    }

    draw(c, baked = false) {
      const s = this.s, fl = this.flash > 0, col = cc => (fl ? whiten(cc, 0.62) : cc);
      const ph = this.phase, walking = this.state === 'walk';
      c.save(); c.translate(this.x, this.y); c.scale(s, s);
      if (!baked && this.state !== 'dead') { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 0, 32, 9, 0, 0, 6.283); c.fill(); }
      c.rotate(this.fallA * this.fallDir + this.lean * 0.12);
      c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2.5;
      const bob = this.bob(), sw = this.sway();
      // 다리
      const lift = walking ? Math.sin(ph) * 7 : 0;
      c.fillStyle = col(this.pants);
      c.beginPath(); c.roundRect(-20, -84 + bob, 15, 84 - Math.max(0, lift), 5); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(5, -84 + bob, 15, 84 - Math.max(0, -lift), 5); c.fill(); c.stroke();
      c.translate(sw, bob); c.rotate(this.lean * 0.1 + this.tilt * 0.3);
      // 몸통
      c.fillStyle = col(this.shirt);
      c.beginPath(); c.roundRect(-28, -154, 56, 76, 10); c.fill(); c.stroke();
      {
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(8, -150, 18, 70);
        c.fillStyle = this.skin; for (const t of this.tears) { c.beginPath(); c.arc(t.x, t.y, t.r, 0, 6.283); c.fill(); }
        if (this.T.suit) { c.fillStyle = '#d8d8d0'; c.beginPath(); c.moveTo(-9, -154); c.lineTo(9, -154); c.lineTo(0, -132); c.fill();
          c.fillStyle = '#8a1a1a'; c.beginPath(); c.moveTo(-3, -150); c.lineTo(3, -150); c.lineTo(4, -112); c.lineTo(0, -106); c.lineTo(-4, -112); c.fill(); }
        for (const w of this.wounds) {
          c.fillStyle = '#7a0a10'; c.fillRect(w.x - 1.5, w.y, 3, w.d);
          c.fillStyle = '#2a0103'; c.beginPath(); c.arc(w.x, w.y, 4.6, 0, 6.283); c.fill();
          c.fillStyle = '#b3141d'; c.beginPath(); c.arc(w.x - 1, w.y - 1, 2.2, 0, 6.283); c.fill();
        }
      }
      // 팔 (카메라 쪽으로 뻗은 자세, 공격 시 내려찍기)
      const reach = this.state === 'attack' ? -18 + this.swing * 26 : Math.sin(ph + 1.5) * 5;
      c.strokeStyle = col(this.T.suit ? this.shirt : this.skin); c.lineWidth = 13; c.lineCap = 'round';
      for (const side of [-1, 1]) {
        const hy = -118 + reach * (side > 0 ? 1 : 0.7);
        c.beginPath(); c.moveTo(side * 25, -146); c.lineTo(side * 36, hy); c.stroke();
        c.fillStyle = col(this.skin); c.beginPath(); c.arc(side * 37, hy + 4, 8.5, 0, 6.283); c.fill();
      }
      c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,0.55)';
      // 목·머리
      if (this.headless) {
        c.fillStyle = col('#7a0a10'); c.beginPath(); c.ellipse(0, -157, 11, 6, 0, 0, 6.283); c.fill();
        c.fillStyle = col('#e8e0cc'); c.beginPath(); c.arc(0, -158, 3.5, 0, 6.283); c.fill();
      } else {
        c.fillStyle = col(this.skin); c.fillRect(-7, -164, 14, 12);
        c.save(); c.translate(0, -176); c.rotate(this.tilt - this.snap * 0.5 * this.fallDir); c.translate(0, -this.snap * 6);
        c.beginPath(); c.ellipse(0, 0, 20, 22, 0, 0, 6.283); c.fillStyle = col(this.skin); c.fill(); c.stroke();
        {
          if (this.hair) { c.fillStyle = this.hair; c.beginPath(); c.ellipse(0, -12, 20, 11, 0, Math.PI, 6.283); c.fill(); }
          c.fillStyle = '#1b0e08'; c.beginPath(); c.ellipse(-8, -3, 5, 4, 0, 0, 6.283); c.ellipse(8, -3, 5, 4, 0, 0, 6.283); c.fill();
          c.fillStyle = '#e6dd7a'; c.beginPath(); c.arc(-8, -3, 1.8, 0, 6.283); c.arc(8, -3, 1.8, 0, 6.283); c.fill();
          c.fillStyle = '#2a0808'; c.beginPath(); c.ellipse(0, 10, 7, 4.5, 0, 0, 6.283); c.fill();
          c.fillStyle = '#7a0a10'; c.fillRect(-2, 12, 3, 7);
        }
        c.restore();
      }
      c.restore();
    }
  }
  Zombie.TYPES = TYPES;
  ZK.Zombie = Zombie;
})();
