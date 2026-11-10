// 3D 좀비: 플레이어 추격 · 공격 · 피격 경련/넉백 · 몸에 박히는 탄흔 · 헤드샷 머리 터짐 + 목 분수 · 뒤로 쓰러짐 · 오버킬 폭발
(function () {
  const T = THREE, { rand, clamp } = ZK;
  const pick = a => a[(Math.random() * a.length) | 0];
  const TYPES = {
    walker: { hp: 60, speed: 1.35, dmg: 14, skin: [0x7d9a6a, 0x86a172, 0x6f8c60, 0x8a9d77], shirt: [0x2d3a4f, 0x4a3b2c, 0x5a2a2a, 0x3d4a3a, 0x555b63, 0x6b5a3a] },
    runner: { hp: 30, speed: 3.9, dmg: 9, skin: [0x8fa47a, 0x9aae84], shirt: [0x1f2530, 0x2b2f3a, 0x33363f], suit: true, xp: 2 }, // 출근러
    brute: { hp: 420, speed: 1.05, dmg: 28, skin: [0x5d6e4c, 0x56664a], shirt: [0x3a2222, 0x2a2a30], scale: 1.6, xp: 20, heavy: true },       // 엘리트: 덩치
    // 임무 대상: 숙주(움직이지 않고 좀비를 계속 낳는 부푼 거구) · 도살자(빠르고 단단한 거대 덩치)
    host: { hp: 650, speed: 0, dmg: 0, skin: [0x9a6a5a, 0x8a5a4e], shirt: [0x4a1416], scale: 2.4, xp: 40, heavy: true, host: true },
    butcher: { hp: 1600, speed: 1.75, dmg: 40, skin: [0x6e4a3e], shirt: [0x5a0a0a], scale: 1.95, xp: 60, heavy: true },
    // 추격자(6분~): 요새보다 빠르게 뒤쫓아 와 4m 안에서 어느 방향이든 뛰어올라 매달린다 · 매달리면 초당 12 (일반 5)
    // 자동 무기(사수·포탑·화염·전기)에는 피해 절반 → 리볼버로 직접 떼어내야 하는 적
    chaser: { hp: 100, speed: 7.4, dmg: 10, skin: [0x6b6f5a, 0x5f6650], shirt: [0x5a0f14, 0x3e0c12], scale: 0.95, xp: 6, chaser: true, clingDmg: 6 },
  };
  TYPES.walker.xp = 1;
  const WOUND_GEO = new T.CircleGeometry(0.032, 10), WOUND_MAT = new T.MeshBasicMaterial({ color: 0x2a0204, side: T.DoubleSide });
  const WOUND_IN = new T.CircleGeometry(0.016, 8), WOUND_IN_MAT = new T.MeshBasicMaterial({ color: 0xa3101a, side: T.DoubleSide });
  const _v = new T.Vector3(), _n = new T.Vector3();
  // 스키트: 날아가는 시체의 사격 판정 (보이지 않는 구, 몸통보다 1.4배 크게)
  const AIR_GEO = new T.SphereGeometry(0.75, 8, 6), AIR_MAT = new T.MeshBasicMaterial({ visible: false });
  const EYE_MAT = new T.MeshBasicMaterial({ color: 0xe6dd7a }), JAW_MAT = new T.MeshBasicMaterial({ color: 0x2a0808 }), EYE_RED = new T.MeshBasicMaterial({ color: 0xff2a2a });
  const HELMET_MAT = new T.MeshLambertMaterial({ color: 0xffc81a, emissive: 0x2a2000 });
  // 공유 지오메트리·재질 (2026-11-09 메모리 누수 수정)
  // 예전엔 좀비마다 부위 지오메트리를 새로 만들고, 사라질 때 장면에서 빼기만 했다(해제 없음).
  // 렌더러가 지오메트리를 계속 붙잡고 있어서, 25판 뒤 등록된 지오메트리가 96,071개였다(장면에 실제로 있는 것은 1,569개).
  // 부위 크기는 고정이니 한 번만 만들어 함께 쓴다. 좀비마다 따로 두는 것은 피부·셔츠·바지 재질뿐이다(피격 번쩍임·도살자 분노 색).
  const GEO = {
    leg: new T.BoxGeometry(0.17, 0.88, 0.19), torso: new T.BoxGeometry(0.52, 0.64, 0.29), arm: new T.BoxGeometry(0.13, 0.74, 0.14),
    tie: new T.BoxGeometry(0.06, 0.34, 0.01), collar: new T.BoxGeometry(0.18, 0.08, 0.01),
    head: new T.SphereGeometry(0.15, 10, 8), eye: new T.BoxGeometry(0.14, 0.03, 0.02), eyeChaser: new T.BoxGeometry(0.14, 0.045, 0.02), jaw: new T.BoxGeometry(0.1, 0.05, 0.02),
    hair: new T.SphereGeometry(0.155, 10, 6, 0, 6.283, 0, 1.3),
    helmet: new T.SphereGeometry(0.175, 12, 8, 0, 6.283, 0, 1.45), brim: new T.CylinderGeometry(0.235, 0.235, 0.025, 14), ridge: new T.BoxGeometry(0.04, 0.05, 0.3), helmetHit: new T.SphereGeometry(0.24, 8, 6),
    sac: new T.SphereGeometry(0.21, 12, 8),
  };
  const TIE_MAT = new T.MeshLambertMaterial({ color: 0x8a1a1a }), COLLAR_MAT = new T.MeshLambertMaterial({ color: 0xd8d8d0 });
  const HAIR_MATS = [0x1a1715, 0x2b2420, 0x3a332c].map(c => new T.MeshLambertMaterial({ color: c }));
  // 떨어져 나간 조각(안전모·팔): 좀비가 사라져도 땅에 떨어질 때까지 따로 움직인다
  // owner: 조각이 그 좀비의 재질을 쓰고 있으면(팔), 조각이 사라진 뒤에 좀비 재질을 해제한다
  const DEBRIS = [];
  function fling(obj, scene, v, spin, life = 4, owner = null) {
    const wp = obj.getWorldPosition(new T.Vector3()), wq = obj.getWorldQuaternion(new T.Quaternion()), ws = obj.getWorldScale(new T.Vector3());
    obj.parent.remove(obj); obj.position.copy(wp); obj.quaternion.copy(wq); obj.scale.copy(ws); scene.add(obj);
    obj.traverse(o => { o.userData.part = 'none'; });   // 떨어진 조각은 사격 판정에서 뺀다
    DEBRIS.push({ o: obj, scene, v, spin, life, owner });
  }
  const freeIfDone = z => { if (z && z.freeLater && !DEBRIS.some(x => x.owner === z)) z.freeMats(); };
  function tickDebris(dt) {
    for (let i = DEBRIS.length - 1; i >= 0; i--) {
      const d = DEBRIS[i]; d.life -= dt; d.v.y -= 18 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.spin * dt; d.o.rotation.z += d.spin * 0.7 * dt;
      if (d.o.position.y < 0.08) { d.o.position.y = 0.08; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; d.spin *= 0.5; }
      if (d.life <= 0) { d.scene.remove(d.o); DEBRIS.splice(i, 1); freeIfDone(d.owner); }
    }
  }
  function clearDebris() { const owners = DEBRIS.map(d => d.owner); for (const d of DEBRIS) d.scene.remove(d.o); DEBRIS.length = 0; owners.forEach(freeIfDone); }

  class Zombie3 {
    constructor(type, pos, scene, hpMul = 1) {
      const Ty = TYPES[type]; this.type = type; this.T = Ty; this.scene = scene;
      this.hp = this.maxHp = Math.round(Ty.hp * hpMul); this.speed = Ty.speed * rand(0.85, 1.15);
      this.state = 'walk'; this.phase = rand(0, 6); this.flash = 0; this.stagger = 0; this.atkT = rand(0.3, 0.8); this.swing = 0;
      this.kv = new T.Vector3(); this.lean = 0; this.leanV = 0; this.snap = 0; this.wounds = 0;
      this.fall = 0; this.fallV = 0; this.fallDelay = 0; this.landed = false; this.deadT = 0; this.spurtT = 0; this.pulse = 0;
      this.remove = false; this.groanT = rand(2, 8); this.detour = 0; this.detourT = 0;
      // 인지: 'wander'(배회) → 'alert'(소리 난 곳으로) → 'chase'(요새·플레이어로 곧장). 기본은 추적(덩치·추격자·포위 무리)
      this.aware = 'chase'; this.alertPos = new T.Vector3(); this.alertT = 0; this.senseT = rand(0, 0.3); this.wp = null; this.wpT = 0;

      const lam = c => new T.MeshLambertMaterial({ color: c, emissive: 0xffffff, emissiveIntensity: 0 });
      this.mats = { skin: lam(pick(Ty.skin)), shirt: lam(pick(Ty.shirt)), pants: lam(pick([0x22262c, 0x2e2a24, 0x1d2230, 0x33302a])) };
      const root = this.root = new T.Group(); root.position.copy(pos); scene.add(root); root.scale.setScalar(Ty.scale || 1);
      const body = this.body = new T.Group(); root.add(body);
      this.hitMeshes = [];
      const part = (geo, mat, parent, x, y, z, partName = 'body') => {
        const m = new T.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
        m.userData = { z: this, part: partName }; this.hitMeshes.push(m); return m;
      };
      // 다리 (엉덩이 피벗)
      this.legs = [-0.12, 0.12].map(x => { const g = new T.Group(); g.position.set(x, 0.88, 0); body.add(g);
        part(GEO.leg, this.mats.pants, g, 0, -0.44, 0, 'leg'); return g; });   // 부위 사격: 팔·다리는 피해 ×0.75
      // 몸통
      this.torso = part(GEO.torso, this.mats.shirt, body, 0, 1.2, 0);
      if (Ty.suit) {
        const tie = new T.Mesh(GEO.tie, TIE_MAT); tie.position.set(0, 0.06, 0.15); this.torso.add(tie);
        const col = new T.Mesh(GEO.collar, COLLAR_MAT); col.position.set(0, 0.27, 0.15); this.torso.add(col);
      }
      // 팔 (어깨 피벗, 앞으로 뻗음)
      this.arms = [-0.33, 0.33].map(x => { const g = new T.Group(); g.position.set(x, 1.48, 0); body.add(g); g.rotation.x = -1.35;
        part(GEO.arm, Ty.suit ? this.mats.shirt : this.mats.skin, g, 0, -0.36, 0, 'arm'); return g; });   // 팔+손 한 덩어리 (대군 성능)
      this.armDmg = [0, 0]; this.armOff = [false, false];
      // 목·머리 (목 피벗 = 헤드샷 스냅용)
      this.neck = new T.Group(); this.neck.position.set(0, 1.53, 0); body.add(this.neck);
      this.head = part(GEO.head, this.mats.skin, this.neck, 0, 0.2, 0.01, 'head');
      this.head.scale.set(1, 1.12, 1);
      const eye = new T.Mesh(Ty.chaser ? GEO.eyeChaser : GEO.eye, Ty.chaser ? EYE_RED : EYE_MAT); eye.position.set(0, 0.02, 0.138); this.head.add(eye);
      const jaw = new T.Mesh(GEO.jaw, JAW_MAT); jaw.position.set(0, -0.07, 0.14); this.head.add(jaw);
      if (Math.random() < 0.3) { const hair = new T.Mesh(GEO.hair, pick(HAIR_MATS)); this.head.add(hair); }   // pick은 난수를 한 번만 쓴다(시드 재현성 그대로)
      this.tilt = rand(-0.25, 0.25); this.neck.rotation.z = this.tilt;
      // 덩치: 노란 공사장 안전모 — 첫 머리 명중은 '팅' 도탄(피해 0) + 모자가 날아가고 0.6초 휘청 → 그다음부터 헤드샷
      if (type === 'brute') {
        const hm = this.helmet = new T.Group(); hm.position.set(0, 0.05, 0); this.head.add(hm);
        hm.add(new T.Mesh(GEO.helmet, HELMET_MAT));
        const brim = new T.Mesh(GEO.brim, HELMET_MAT); brim.position.y = 0.0; hm.add(brim);
        const ridge = new T.Mesh(GEO.ridge, HELMET_MAT); ridge.position.y = 0.16; hm.add(ridge);
        const hx = new T.Mesh(GEO.helmetHit, AIR_MAT); hx.position.y = 0.03; hm.add(hx); hx.userData = { z: this, part: 'head' }; this.hitMeshes.push(hx);   // 보이는 모자 전체가 맞는 판정 (날아가면 fling이 'none'으로)
      }
      // 숙주: 연두색으로 빛나는 고름주머니 4개(실제 반지름 약 0.5m) — 리볼버 한 발에 터지고, 터질 때마다 최대 HP 12% 피해 + 산란 6초 정지
      // 4개 다 터지면 무릎을 꿇고 받는 피해 ×1.6
      if (Ty.host) {
        this.sacs = []; this.vuln = 1; this.sacPause = 0; this.sacMat = new T.MeshLambertMaterial({ color: 0x9aff4a, emissive: 0x4aff2a, emissiveIntensity: 0.7 });
        for (const [x, y, z] of [[0.3, 1.38, 0.17], [-0.31, 1.12, 0.17], [0.27, 1.05, -0.18], [-0.24, 1.42, -0.18]]) {
          const s = part(GEO.sac, this.sacMat, body, x, y, z, 'sac'); this.sacs.push(s);
        }
      }
    }
    get alive() { return this.state === 'walk' || this.state === 'attack' || this.state === 'cling' || this.state === 'down'; }
    // 로드킬 '날리기': 죽은 몸을 포물선으로 띄운다 (중력 18) → 공중에서 맞히면 AIR 폭발 · 서 있는 좀비를 스치면 볼링 · 벽에 부딪히면 핏자국
    launch(v) {
      this.state = 'flying'; this.flying = true; this.fv = v.clone(); this.bowled = new Set(); this.strikes = 0;
      this.spinX = rand(-9, 9); this.spinZ = rand(-7, 7); this.wallHit = false;
      if (!this.airMesh) { this.airMesh = new T.Mesh(AIR_GEO, AIR_MAT); this.airMesh.position.y = 1.0; this.airMesh.userData = { z: this, part: 'air' }; this.root.add(this.airMesh); }
      this.airMesh.updateWorldMatrix(true, false);   // 같은 틱의 사격 판정이 원점에 있지 않게
    }
    get pos() { return this.root.position; }
    // 요새 차체에 매달리기 (요새 로컬 좌표, 기본 크기 기준)
    grabFort(c, leap) {
      this.state = 'cling'; this.cling = c; this.clingT = 0.6; this.kv.set(0, 0, 0);
      this.leapT = leap ? 0.38 : 0; this.leapFrom = this.pos.clone();   // 추격자: 땅에서 차체로 포물선 도약
    }

    hit(part, point, dir, dmg, opts = {}) {
      if (!this.alive) return null;
      this.aware = 'chase';   // 맞으면 바로 알아챈다
      // 안전모: 첫 머리 명중은 도탄 (폭발은 모자와 상관없이 몸으로 들어온다)
      if (part === 'head' && this.helmet && !opts.explosion) { this.popHelmet(point, dir); return { killed: false, overkill: 0, prev: this.hp, dealt: 0, helmet: true }; }
      let sac = false;
      if (part === 'sac') { if (opts.mesh && opts.mesh.userData.part === 'sac') { this.popSac(opts.mesh, dir); sac = true; dmg = Math.round(this.maxHp * 0.12); } part = 'body'; }
      if (this.vuln > 1) dmg = Math.round(dmg * this.vuln);   // 무릎 꿇은 숙주
      const prev = this.hp; this.hp -= dmg;
      const killed = this.hp <= 0, overkill = killed ? dmg - prev : 0, head = part === 'head';
      this.flash = killed ? 0.1 : 0.08;
      ZK.fx3.blood(point, dir, opts.explosion ? 0.7 : head ? 1.3 : 1, head);
      if (!opts.explosion && !head && opts.mesh && this.wounds < 4) { // 맞은 자리에 탄흔을 붙인다
        this.wounds++;
        const w = new T.Mesh(WOUND_GEO, WOUND_MAT), wi = new T.Mesh(WOUND_IN, WOUND_IN_MAT);
        opts.mesh.add(w);
        w.position.copy(opts.mesh.worldToLocal(_v.copy(point).addScaledVector(dir, -0.006)));
        w.lookAt(_n.copy(point).sub(dir));   // 원판이 쏜 쪽을 보게 (월드 좌표)
        wi.position.z = 0.001; w.add(wi);
      }
      // 손맛: 총알이 '박히는' 게 보이게 밀림·젖혀짐을 키움 (예전 몸 2.2 · 머리 1.6) · 처치 탄은 몸을 뒤로 날려 보낸다
      this.kv.addScaledVector(_v.set(dir.x, 0, dir.z).normalize(), (opts.explosion ? 3.5 : head ? 2.8 : 3.8) + (killed && !opts.explosion ? (head ? 3 : 5) : 0));
      this.leanV -= head ? 5 : 9; if (head) this.snap = 1.3;
      this.stagger = head ? 0.4 : 0.28;
      ZK.audio.flesh(head, ZK.panFor(this.pos));
      // 팔: 누적 피해가 최대 HP 35%면 떨어져 나간다 · 매달린 놈은 팔에 맞으면 바로 손을 놓고 떨어져 1초 쓰러진다
      let dropped = false;
      if (part === 'arm' && !killed) {
        const i = opts.mesh ? this.arms.findIndex(a => a.children.includes(opts.mesh)) : -1;
        if (i >= 0) { this.armDmg[i] += dmg; if (!this.armOff[i] && this.armDmg[i] >= this.maxHp * 0.35) this.severArm(i, dir); }
        if (this.state === 'cling') { this.dropOff(); dropped = true; }
      }
      if (killed) this.die(part, dir, opts);
      return { killed, overkill, prev, dealt: dmg, sac, dropped };
    }
    popHelmet(point, dir) {
      const hm = this.helmet; this.helmet = null;
      fling(hm, this.scene, new T.Vector3(dir.x * 3 + rand(-1, 1), rand(4, 6), dir.z * 3 + rand(-1, 1)), rand(8, 14), 5);
      ZK.fx3.sparks(point, dir.clone().negate(), 14); ZK.audio.ting && ZK.audio.ting();
      this.stagger = 0.6; this.leanV -= 6; this.snap = 1; this.flash = 0.06;
    }
    popSac(s, dir) {
      const wp = s.getWorldPosition(new T.Vector3()); s.visible = false; s.userData.part = 'none';
      ZK.fx3.goo(wp, dir); ZK.audio.splatter && ZK.audio.splatter(10, 0.5, 0.3, ZK.panFor(wp));
      this.sacPause = 6; this.leanV -= 8;
      if (this.sacs.every(q => !q.visible)) { this.vuln = 1.6; this.kneel = true; }   // 4개 다 → 무릎 꿇음, 받는 피해 ×1.6
    }
    severArm(i, dir) {
      this.armOff[i] = true; const a = this.arms[i], sp = a.getWorldPosition(new T.Vector3());
      fling(a, this.scene, new T.Vector3(dir.x * 2.5 + rand(-1, 1), rand(2, 4), dir.z * 2.5 + rand(-1, 1)), rand(6, 12), 6, this);   // 팔은 이 좀비의 재질을 쓴다
      this.arms[i] = new T.Group();   // 애니메이션 코드가 날아간 팔을 계속 돌리지 않게 빈 자리로 바꿈
      ZK.fx3.gibs(sp, dir, 8, true, 0.8); ZK.fx3.blood(sp, dir, 1.1); for (let k = 0; k < 3; k++) ZK.fx3.spurt(sp, 0.9);   // 어깨에서 바로 뿜는다
      if (this.armOff[0] && this.armOff[1]) this.noArms = true;   // 두 팔 다 없으면 매달리지 못하고 할퀴는 힘도 절반
    }
    // 매달린 자리에서 떨어져 1초 쓰러짐 (차체 바깥쪽으로 튕겨 나감)
    dropOff() {
      this.state = 'down'; this.downT = 1; this.dropV = 0; this.clingRolled = true; this.cling = null; this.leapT = 0;
      this.kv.addScaledVector(this.pos.clone().sub(ZK.fort.state.pos).setY(0).normalize(), 4);
    }
    die(part, dir, opts) {
      const wasDown = this.state === 'down';
      if (this.state === 'cling') { this.dropV = 0; this.kv.addScaledVector(this.pos.clone().sub(ZK.fort.state.pos).setY(0).normalize(), 3); }   // 차체에서 떨어져 나감
      this.state = 'dying';
      if (!wasDown) this.root.rotation.y = Math.atan2(-dir.x, -dir.z) + rand(-0.4, 0.4); // 쏜 쪽을 보게 하고 뒤로 넘어뜨림
      this.fallV = opts.explosion ? 1.4 : 2.4; this.fallDelay = 0.03;   // 총에 맞아 죽으면 더 빨리 '털썩' 넘어간다
      if (part === 'head' && !opts.explosion) {
        const hp = this.head.getWorldPosition(new T.Vector3());
        this.head.visible = false; this.head.userData.part = 'none';
        ZK.fx3.gibs(hp, dir, 16, true, 1.1); ZK.fx3.blood(hp, dir, 1.8, true);
        ZK.audio.splatter(14, 0.4, 0.35, ZK.panFor(this.pos));
        this.spurtT = 0.9; this.fallDelay = 0.32; this.fallV = 0.4;
      }
      if (wasDown) { this.fall = Math.min(1.5, Math.max(0, -this.body.rotation.x)); this.fallV = 0.5; this.fallDelay = 0; }   // 누운 채로 죽으면 일으켜 세우지 않고 그 자세에서 이어서
    }
    explode() {
      const c = this.torso.getWorldPosition(new T.Vector3()), up = new T.Vector3(0, 1, 0);
      ZK.fx3.gibs(c, up, 28, true, 1.5); ZK.fx3.blood(c, up, 2.2, true); ZK.fx3.blood(c, new T.Vector3(rand(-1, 1), 0.2, rand(-1, 1)).normalize(), 1.4);
      ZK.fx3.pool(this.pos.x, this.pos.z, 1.6);
      this.dispose();
    }
    // 장면에서 빼고, 이 좀비만 쓰던 재질(피부·셔츠·바지·고름주머니)을 해제한다. 지오메트리는 공유라 해제하지 않는다
    // 날아간 팔이 아직 굴러다니면(같은 재질), 그 조각이 사라질 때 해제한다
    dispose() {
      this.scene.remove(this.root); this.remove = true;
      if (DEBRIS.some(d => d.owner === this)) this.freeLater = true; else this.freeMats();
    }
    freeMats() {
      if (this.freed) return; this.freed = true; this.freeLater = false;
      for (const k in this.mats) this.mats[k].dispose(); if (this.sacMat) this.sacMat.dispose();
    }

    update(dt, game) {
      const p = this.pos;
      this.flash = Math.max(0, this.flash - dt);
      const fe = this.flash > 0 ? 0.45 + this.flash * 9 : 0; this.mats.skin.emissiveIntensity = this.mats.shirt.emissiveIntensity = this.mats.pants.emissiveIntensity = fe;
      p.addScaledVector(this.kv, dt); this.kv.multiplyScalar(Math.exp(-dt * 7));
      this.leanV += (-70 * this.lean - 10 * this.leanV) * dt; this.lean += this.leanV * dt;
      this.snap *= Math.exp(-dt * 6);
      this.neck.rotation.x = -this.snap * 0.7;

      if (this.state === 'flying') {
        this.fv.y -= 18 * dt; p.addScaledVector(this.fv, dt);
        this.body.rotation.x += this.spinX * dt; this.body.rotation.z += this.spinZ * dt;
        for (const o of game.zombies) {   // 볼링: 날아가며 0.8m 안을 스친 서 있는 좀비
          if (!o.alive || o.state === 'cling' || this.bowled.has(o) || p.y > 2.2) continue;
          const dx = o.pos.x - p.x, dz = o.pos.z - p.z; if (dx * dx + dz * dz < 0.64) { this.bowled.add(o); game.bowl && game.bowl(this, o); }
        }
        const hs = Math.hypot(this.fv.x, this.fv.z), sx = p.x, sz = p.z, hb = ZK.world.collide(p, 0.3);
        if (Math.hypot(p.x - sx, p.z - sz) > 0.01) {   // 핏자국은 건물·방벽 같은 고정 벽에만 (맵 경계·흡수될 차에는 안 남김)
          if (hb && !ZK.world.cars.some(c => c.col === hb) && hs >= 5 && !this.wallHit) { this.wallHit = true; game.wallSplat && game.wallSplat(p.clone(), p.x - sx, p.z - sz); }
          this.fv.x *= -0.15; this.fv.z *= -0.15; }
        if (p.y <= 0) {   // 착지: 평범한 시체가 되어 5초 뒤 가라앉는다
          p.y = 0; this.flying = false; this.state = 'dead'; this.landed = true; this.fall = 1.5; this.deadT = 0;
          this.body.rotation.set(-1.5, 0, 0); ZK.fx3.pool(p.x, p.z, 1.2); ZK.audio.bodyFall(1, ZK.panFor(p));
        }
        return;
      }
      if (this.state === 'down') {   // 매달렸다가 팔을 맞고 떨어짐: 땅에 닿은 뒤 1초 누워 있다가 일어난다
        if (p.y > 0) { this.dropV = (this.dropV || 0) + 18 * dt; p.y = Math.max(0, p.y - this.dropV * dt); }
        else if ((this.downT -= dt) <= 0) { this.state = 'walk'; this.body.rotation.x = 0.12; this.body.position.y = 0; return; }
        this.body.rotation.x = ZK.damp(this.body.rotation.x, -1.35, 10, dt); this.body.position.y = 0;
        this.arms[0].rotation.x = ZK.damp(this.arms[0].rotation.x, -2.6, 6, dt); this.arms[1].rotation.x = ZK.damp(this.arms[1].rotation.x, -2.2, 6, dt);
        ZK.world.collide(p, 0.32);
        return;
      }
      if (this.state === 'cling') {
        // 매달림: 요새를 따라 움직이며 벽을 긁어 0.5초마다 피해 (플레이어가 쏴야 떨어진다)
        const c = this.cling, wp = ZK.fort.clingPoint(c), F = ZK.fort.state;
        if (this.leapT > 0) { this.leapT = Math.max(0, this.leapT - dt); const k = 1 - this.leapT / 0.38; p.lerpVectors(this.leapFrom, wp, k); p.y += Math.sin(k * Math.PI) * 1.8; }
        else p.copy(wp);
        this.root.rotation.y = Math.atan2(-c.side * Math.cos(F.heading), c.side * Math.sin(F.heading));   // 옆면에 수직으로 난간 너머 갑판 쪽을 본다
        const t = ZK.fx3.time * 7 + this.phase;
        this.arms[0].rotation.x = -2.7 + Math.sin(t) * 0.35; this.arms[1].rotation.x = -2.7 - Math.sin(t) * 0.35;
        this.legs[0].rotation.x = Math.sin(t * 0.7) * 0.4; this.legs[1].rotation.x = -Math.sin(t * 0.7) * 0.4;
        this.body.rotation.x = 0.35; this.body.position.y = 0;
        if (this.leapT <= 0 && (this.clingT -= dt) <= 0) { this.clingT = 0.5; game.hurtTarget(this.T.clingDmg || 2.5, this, { kind: 'fort', quiet: true }); }   // 초당 5 (추격자 12)
        return;
      }
      if (this.alive) {
        // 목표: 요새 표면의 가장 가까운 점 또는 걸어 다니는 플레이어
        // 배회·경계 중이면 0.3초마다 둘러봐서 시야(낮 12m) 안에 요새·플레이어가 있으면 추적으로 바뀐다
        if (this.aware !== 'chase' && (this.senseT -= dt) <= 0) {
          this.senseT = 0.3; const s = game.targetFor(this);
          if (Math.hypot(s.x - p.x, s.z - p.z) < (game.sight || 12) * (s.kind === 'player' && ZK.dread && ZK.dread.stealthK ? ZK.dread.stealthK() : 1)) this.aware = 'chase';   // 몰래 걷기(L7): 앉음·엎드림이면 덜 보이고 질주는 더 보인다
        }
        if (this.T.host) {   // 숙주: 제자리에서 숨 쉬듯 부풀었다 줄었다 (공격·이동 없음)
          const b = 1 + Math.sin(ZK.fx3.time * 3 + this.phase) * 0.06; this.body.scale.set(b * 1.15, b, b * 1.15);
          this.sacMat.emissiveIntensity = 0.45 + Math.sin(ZK.fx3.time * 5 + this.phase) * 0.3;
          if (this.kneel) { this.body.position.y = ZK.damp(this.body.position.y, -0.3, 4, dt); this.body.rotation.x = ZK.damp(this.body.rotation.x, 0.75, 4, dt); }   // 주머니가 다 터지면 무릎 꿇음
          else this.body.rotation.x = 0.35;
          return;
        }
        let tg;
        if (this.aware === 'chase') tg = game.targetFor(this);
        else {
          // 경계: 20초 안에 소리 난 곳에 도착하거나 시간이 지나면 그 근처를 배회
          if (this.aware === 'alert' && ((this.alertT -= dt) <= 0 || Math.hypot(this.alertPos.x - p.x, this.alertPos.z - p.z) < 1.5)) { this.aware = 'wander'; this.wp = null; }
          if (this.aware === 'wander' && (!this.wp || (this.wpT -= dt) <= 0 || Math.hypot(this.wp.x - p.x, this.wp.z - p.z) < 1)) {
            const a = rand(0, 6.283), r = rand(3, 9); this.wp = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }; this.wpT = rand(4, 8);
          }
          tg = this.aware === 'alert' ? { x: this.alertPos.x, z: this.alertPos.z, kind: 'point' } : { x: this.wp.x, z: this.wp.z, kind: 'point' };
        }
        const dx = tg.x - p.x, dz = tg.z - p.z, dist = Math.hypot(dx, dz) || 1e-3, rch = 0.95 * (this.T.scale || 1);
        this.stagger -= dt; const sp = (this.stagger > 0 ? 0.1 : 1) * (this.aware === 'wander' ? 0.45 : this.aware === 'alert' ? 0.85 : 1);   // 배회는 45% 속도로 어슬렁
        if ((this.groanT -= dt) <= 0) { this.groanT = rand(4, 11); const dc = p.distanceTo(ZK.debug3 ? ZK.debug3.camera.position : p); if (dc < 22) ZK.audio.groan(ZK.panFor(p), clamp(1.4 - dc / 18, 0.2, 1.2)); }
        if (dist > rch || tg.kind === 'point') {   // 배회·경계 목표 지점은 때리지 않고 걸어가기만
          this.state = 'walk';
          let mx = dx / dist, mz = dz / dist;
          for (const o of game.zombies) { // 서로 겹치지 않게
            if (o === this || !o.alive) continue;
            const ox = p.x - o.pos.x, oz = p.z - o.pos.z, d2 = ox * ox + oz * oz;
            if (d2 < 0.55 && d2 > 1e-4) { const d = Math.sqrt(d2); mx += (ox / d) * (0.75 - d) * 2; mz += (oz / d) * (0.75 - d) * 2; }
          }
          if (this.detourT > 0) { this.detourT -= dt; const k = 1.6 * this.detour; const tx = -mz * k, tz = mx * k; mx += tx; mz += tz; }
          const ml = Math.hypot(mx, mz) || 1;
          const ru = this.rush || 1, vx = (mx / ml) * this.speed * sp * ru * dt, vz = (mz / ml) * this.speed * sp * ru * dt, sx = p.x, sz = p.z;   // rush: 공포 디렉터의 질주·덮치기 배율
          p.x += vx; p.z += vz;
          ZK.world.collide(p, 0.32);
          // 차·벽에 막히면 옆으로 돌아간다
          const want = Math.hypot(vx, vz);
          if (want > 1e-4 && Math.hypot(p.x - sx, p.z - sz) < want * 0.45) {
            if (!(this.detourT > 0)) this.detour = (dx * vz - dz * vx) > 0 ? 1 : -1;
            this.detourT = 0.9;
          }
          this.phase += dt * this.speed * 3.2 * sp * ru;
          this.root.rotation.y = ZK.damp(this.root.rotation.y, Math.atan2(dx, dz), 8, dt);
        } else {
          this.state = 'attack';
          this.root.rotation.y = Math.atan2(dx, dz);
          this.swing = Math.max(0, this.swing - dt * 4);
          if ((this.atkT -= dt * sp) <= 0) { this.atkT = 1.1; this.swing = 1; game.hurtTarget(this.T.dmg * (this.dmgK || 1) * (this.noArms ? 0.5 : 1), this, tg); }   // dmgK: 분노한 도살자 · 두 팔 잃으면 절반
        }
        ZK.world.collide(p, 0.32);
        // 걷기 애니메이션
        const s = Math.sin(this.phase), walking = this.state === 'walk';
        this.legs[0].rotation.x = walking ? s * 0.55 : 0; this.legs[1].rotation.x = walking ? -s * 0.55 : 0;
        const reach = this.state === 'attack' ? -1.9 + this.swing * 1.3 : -1.35 + Math.sin(this.phase + 1.4) * 0.12;
        this.arms[0].rotation.x = reach + (walking ? s * 0.1 : 0); this.arms[1].rotation.x = reach - (walking ? s * 0.1 : 0);
        this.body.position.y = walking ? Math.abs(s) * 0.04 : 0; this.body.rotation.z = walking ? s * 0.06 : 0;
        this.body.rotation.x = (this.T.chaser || (this.rush || 1) > 1.25 ? 0.5 : 0.12) + this.lean * 0.15;   // 추격자·질주·덮치는 놈은 상체를 숙이고 달린다
      } else if (this.state === 'dying') {
        if (p.y > 0) { this.dropV = (this.dropV || 0) + 18 * dt; p.y = Math.max(0, p.y - this.dropV * dt); }   // 매달렸다 죽으면 바닥으로 떨어짐
        else if (this.kv.lengthSq() > 0.04) ZK.world.collide(p, 0.32);   // 처치 탄에 밀려난 시체가 벽·차에 파묻히지 않게
        if (this.spurtT > 0) {
          this.spurtT -= dt; this.pulse -= dt;
          if (this.pulse <= 0) { this.pulse = 0.085; ZK.fx3.spurt(this.neck.getWorldPosition(_v), 0.5 + this.spurtT); }
        }
        if ((this.fallDelay -= dt) <= 0) {
          this.fallV += 12 * dt; this.fall += this.fallV * dt;
          if (this.fall >= 1.5) {
            this.fall = 1.5;
            if (p.y > 0) { /* 매달렸다 죽은 몸: 땅에 닿을 때까지 기다린다 (큰 버스 위 4m에서 공중에 멈춰 있던 문제) */ }
            else if (!this.landed) {
              this.landed = true; this.fallV = -this.fallV * 0.15;
              ZK.audio.bodyFall(1, ZK.panFor(p)); ZK.fx3.trauma(0.05);
              const back = new T.Vector3(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
              ZK.fx3.pool(p.x + back.x * 1.1, p.z + back.z * 1.1, 1.3);
            } else this.state = 'dead';
          }
        }
        this.body.rotation.x = -this.fall;
        this.legs[0].rotation.x = ZK.damp(this.legs[0].rotation.x, 0.2, 6, dt); this.legs[1].rotation.x = ZK.damp(this.legs[1].rotation.x, -0.1, 6, dt);
        this.arms[0].rotation.x = ZK.damp(this.arms[0].rotation.x, -2.6, 5, dt); this.arms[1].rotation.x = ZK.damp(this.arms[1].rotation.x, -2.2, 5, dt);
      } else {
        this.deadT += dt;   // 대군이라 시체는 5초 뒤 땅으로 가라앉혀 정리
        if (this.deadT > 5) { this.root.position.y -= dt * 0.45; if (this.deadT > 7.5) this.dispose(); }
      }
    }
  }
  Zombie3.TYPES = TYPES; Zombie3.tickDebris = tickDebris; Zombie3.clearDebris = clearDebris;
  ZK.Zombie3 = Zombie3;
})();
