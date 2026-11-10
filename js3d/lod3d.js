// 먼 좀비 장식 생략 (드로우콜 절감, 2026-11-10 루프 L3)
// 좀비 1마리 = 몸 부위 6개 + 장식(눈·턱·머리카락·넥타이·깃·탄흔 최대 8개)이 각각 드로우콜이다.
// 최후의 파도 정점(좀비 약 220마리)에서 프레임당 1,100번 → 카메라에서 20m 밖 좀비는 장식을 그리지 않는다(그 거리에선 2~3픽셀).
// 남기는 것: 몸 부위(사격 판정 메시), 덩치 안전모, 해일 좀비(붉은 눈이 핵심), 스프라이트
(function () {
  const L = ZK.lod = { on: true, far: 20, stats: { hidden: 0 } };
  let t = 0;
  function collect(z) {   // 장식 = 사격 판정이 없는(userData.part 없음) 메시, 안전모 아래는 제외
    const out = [];
    z.root.traverse(o => { if (!o.isMesh || o.userData.part !== undefined) return; for (let p = o.parent; p && p !== z.root; p = p.parent) if (p === z.helmet) return; out.push(o); });
    z._decor = out; z._decorW = z.wounds; z._lodFar = false;
  }
  function apply(z, far) {
    if (!z._decor || z._decorW !== z.wounds) { if (z._decor && z._lodFar) for (const m of z._decor) m.visible = true; collect(z); }
    if (z._lodFar === far) return; z._lodFar = far;
    for (const m of z._decor) m.visible = !far;
  }
  L.update = function (real, g, cam) {
    if ((ZK.debug3 && ZK.debug3.fast) || (t -= real) > 0) return; t = 0.3;
    const far = L.far * Math.max(1, 76 / cam.fov), cx = cam.position.x, cz = cam.position.z, f2 = far * far; let hidden = 0;   // 조준경 확대(화각 30°) 중엔 그만큼 멀리까지 장식을 그린다 (무기 보급함, 2026-11-10)
    for (const z of g.zombies) {
      if (z.remove || z.tide) continue;
      const dx = z.pos.x - cx, dz = z.pos.z - cz, far = L.on && dx * dx + dz * dz > f2;
      apply(z, far); if (far) hidden += z._decor.length;
    }
    L.stats.hidden = hidden;
  };
})();
