// 흡수 대상: 구조 신호를 보내는 생존자(요새로 가까이 가면 탑승 → 지붕 사수) · 보급 상자(엘리트 처치 시 드롭 → 무료 카드)
(function () {
  const T = THREE, { rand } = ZK;
  const A = {};
  let scene, spawnT = 10, flareTex;
  const npcs = [], crates = [];
  A.npcs = npcs; A.crates = crates;

  A.init = function (sc) {
    scene = sc;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(220,255,220,1)'); gr.addColorStop(0.3, 'rgba(80,255,120,0.8)'); gr.addColorStop(1, 'rgba(0,200,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); flareTex = new T.CanvasTexture(c);
  };
  A.reset = function () { for (const n of npcs) scene.remove(n.g); for (const c of crates) scene.remove(c.g); npcs.length = crates.length = 0; spawnT = 8; };
  const lam = c => new T.MeshLambertMaterial({ color: c });
  function box(w, h, d, m, x, y, z, p) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }

  A.spawnNpc = function (pos) {
    const g = new T.Group(); g.position.copy(pos); scene.add(g);
    box(0.36, 0.6, 0.22, lam(0x2a5a8a), 0, 1.2, 0, g); box(0.3, 0.85, 0.2, lam(0x2a2d33), 0, 0.45, 0, g);
    const hd = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), lam(0xc48a66)); hd.position.y = 1.65; g.add(hd);
    const arms = [-1, 1].map(s => { const a = new T.Group(); a.position.set(s * 0.22, 1.45, 0); g.add(a); box(0.1, 0.55, 0.1, lam(0x2a5a8a), 0, 0.27, 0, a); return a; });
    const fl = new T.Sprite(new T.SpriteMaterial({ map: flareTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); fl.position.y = 3.2; fl.scale.setScalar(1.6); g.add(fl);
    const light = new T.PointLight(0x40ff70, 1.4, 12, 1.5); light.position.y = 2.6; g.add(light);
    npcs.push({ g, arms, fl, t: rand(0, 6), life: 75 });
  };
  A.spawnCrate = function (pos) {
    const g = new T.Group(); g.position.copy(pos).setY(0); scene.add(g);
    const b = box(0.8, 0.6, 0.6, new T.MeshLambertMaterial({ color: 0x8a6a2a, emissive: 0x3a2a00 }), 0, 0.5, 0, g);
    box(0.82, 0.08, 0.62, lam(0x2a2a2a), 0, 0.62, 0, g);
    const fl = new T.Sprite(new T.SpriteMaterial({ map: flareTex, color: 0xffd040, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); fl.position.y = 1.4; fl.scale.setScalar(1.3); g.add(fl);
    crates.push({ g, b, fl, t: 0, life: 45 });
  };

  A.update = function (dt, game) {
    const F = ZK.fort.state, near = (p, pad) => { const L = ZK.fort.local(p); return Math.abs(L.lx) < F.halfW + pad && Math.abs(L.lz) < F.halfL + pad; };
    if ((spawnT -= dt) <= 0 && npcs.length < 3) {
      const full = F.gunners.length >= 4;   // 사수가 다 차면 구조 신호 알림은 생략 (주기는 그대로 — 장갑판·회복원이라 줄이면 난이도가 바뀐다)
      spawnT = rand(16, 26);
      A.spawnNpc(ZK.world.spawnRing(F.pos, 28, 55)); if (!full) game.onNotice('생존자 구조 신호!', '#6f6');
    }
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i]; n.t += dt; n.life -= dt;
      n.arms[0].rotation.z = 2.6 + Math.sin(n.t * 7) * 0.4; n.arms[1].rotation.z = -2.6 - Math.sin(n.t * 7 + 1) * 0.4;   // 손 흔들기
      n.g.rotation.y = Math.atan2(F.pos.x - n.g.position.x, F.pos.z - n.g.position.z);
      n.fl.scale.setScalar(1.4 + Math.sin(n.t * 9) * 0.25);
      const pl = game.player.pos, onFootNear = game.mode === 'foot' && pl.distanceTo(n.g.position) < 2;
      if (near(n.g.position, 2.6) || onFootNear) {
        scene.remove(n.g); npcs.splice(i, 1); const lone = ZK.surv.contract && ZK.surv.contract.has('lone'), joined = ZK.fort.addGunner(); game.onAbsorb(joined ? 'survivor' : lone ? 'survivorFood' : 'survivorFull', n.g.position.clone()); continue;
      }
      if (n.life <= 0) { scene.remove(n.g); npcs.splice(i, 1); if (F.gunners.length < 4) game.onNotice('생존자를 놓쳤다…', '#aaa'); }
    }
    for (let i = crates.length - 1; i >= 0; i--) {
      const c = crates[i]; c.t += dt; c.life -= dt;
      c.b.rotation.y += dt * 1.5; c.b.position.y = 0.5 + Math.sin(c.t * 3) * 0.08;
      const pl = game.player.pos, got = near(c.g.position, 2.2) || (game.mode === 'foot' && pl.distanceTo(c.g.position) < 1.8);
      if (got) { scene.remove(c.g); crates.splice(i, 1); game.onAbsorb('crate', c.g.position.clone()); continue; }
      if (c.life <= 0) { scene.remove(c.g); crates.splice(i, 1); }
    }
  };
  ZK.absorb = A;
})();
