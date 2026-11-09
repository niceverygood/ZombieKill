// 리볼버 손맛 사운드 — 샘플 파일 없이 WebAudio로 실시간 합성
// 총성 = 해머 틱 + 초음속 크랙 + 폭발 몸통 + 서브 쿵 + 저역 잔향 + 건물 반사음(슬랩백)
(function () {
  const A = {};
  let ctx = null, master, sfxBus, revSend, echoSend, noiseBuf, DIST, muffleF, dreadBus;
  let muted = false;
  let bed = null, ambDuck = null;   // 손맛 덕킹: 엔진(bed)·바람(ambDuck)을 총성 순간 눌러 준다
  const R = (a, b) => a + Math.random() * (b - a);

  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.001; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.95;
    comp.connect(master); master.connect(ctx.destination);
    // 공포 디렉터: 효과음 버스 → 먹먹함 필터(빈사 상태에서 귀가 막힌 듯) → 컴프레서. 평소엔 20kHz라 들리지 않는다
    muffleF = ctx.createBiquadFilter(); muffleF.type = 'lowpass'; muffleF.frequency.value = 20000; muffleF.Q.value = 0.5; muffleF.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(muffleF);
    bed = ctx.createGain(); bed.connect(muffleF); ambDuck = ctx.createGain(); ambDuck.connect(master);
    dreadBus = ctx.createGain(); dreadBus.gain.value = 1; dreadBus.connect(comp);   // 심장박동·긴장 음악은 먹먹함 필터를 거치지 않는다(오히려 더 크게 들려야 한다)

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    DIST = shaperCurve(5);

    // 야외 거리 잔향
    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.4, 3.4);
    const revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 3000;
    const revOut = ctx.createGain(); revOut.gain.value = 0.6;
    revSend = ctx.createGain();
    revSend.connect(conv); conv.connect(revLP); revLP.connect(revOut); revOut.connect(comp);

    // 건물에 맞고 돌아오는 슬랩백 에코
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlLP = ctx.createBiquadFilter(); dlLP.type = 'lowpass'; dlLP.frequency.value = 1700;
    const echoOut = ctx.createGain(); echoOut.gain.value = 0.55;
    echoSend = ctx.createGain();
    echoSend.connect(dl); dl.connect(dlLP); dlLP.connect(fb); fb.connect(dl); dlLP.connect(echoOut); echoOut.connect(comp);

    startAmbience();
    loadSamples();
  };

  // ───────── ElevenLabs 샘플 (없으면 합성음으로 대체) ─────────
  const SAMPLES = ['shot1', 'shot2', 'hit1', 'hit2', 'headshot', 'fall', 'gib', 'cyl_open', 'casing', 'speedload', 'cyl_close', 'dry', 'groan1', 'groan2'];
  const smp = {};
  function loadSamples() {
    SAMPLES.forEach(async n => {
      try {
        const buf = await ctx.decodeAudioData(await (await fetch('sfx/' + n + '.mp3')).arrayBuffer());
        const d = buf.getChannelData(0); let peak = 0, on = 0;
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.08) { on = i; break; }
        if (peak < 0.02) return; // 사실상 무음이면 쓰지 않음
        smp[n] = { buf, norm: Math.min(12, 0.95 / peak), off: Math.max(0, on / buf.sampleRate - 0.004) };
      } catch (e) { /* file:// 등으로 못 불러오면 합성음 사용 */ }
    });
  }
  const has = (...ns) => ns.every(n => smp[n]);
  A.samples = () => Object.keys(smp);
  function play(names, o = {}) {
    const list = (Array.isArray(names) ? names : [names]).filter(n => smp[n]); if (!list.length) return;
    const s = smp[list[(Math.random() * list.length) | 0]], t = o.t ?? now();
    const src = ctx.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = o.rate ?? R(0.95, 1.05);
    const g = ctx.createGain(); g.gain.value = (o.vol ?? 1) * s.norm;
    src.connect(g); g.connect(panned(o.pan)); sends(g, o.send, o.echo);
    src.start(t, s.off);
  }

  A.toggleMute = function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.95; return muted; };
  // 덕킹(사이드체인): 총을 쏘는 순간 엔진·바람을 depth만큼 확 줄였다가 rel초에 걸쳐 되돌린다 → 총성이 '뚫고' 나온다
  A.duck = function (depth = 0.5, rel = 0.25) {
    if (!bed) return; const t = ctx.currentTime;
    for (const g of [bed.gain, ambDuck.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.05, 1 - depth), t + 0.003); g.setTargetAtTime(1, t + 0.04, rel / 3); }
  };

  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * 0.5;
      [0.012, 0.024, 0.039, 0.055, 0.078].forEach((tt, k) => {
        const idx = Math.floor((tt + c * 0.004) * ctx.sampleRate);
        ch[idx] += (k % 2 ? -1 : 1) * (0.9 - k * 0.13);
      });
    }
    return buf;
  }
  function shaperCurve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }
  const now = () => ctx.currentTime + 0.004;
  function panned(pan) {
    if (pan == null || !ctx.createStereoPanner) return sfxBus;
    const p = ctx.createStereoPanner(); p.pan.value = ZK.clamp(pan, -1, 1); p.connect(sfxBus); return p;
  }
  function sends(g, send, echo) {
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(revSend); }
    if (echo) { const s = ctx.createGain(); s.gain.value = echo; g.connect(s); s.connect(echoSend); }
  }
  function env(g, t, gain, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  // 필터된 노이즈 한 방
  function noise(t, decay, o = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + decay);
    const g = ctx.createGain(); const atk = o.attack ?? 0.001;
    env(g, t, o.gain ?? 0.5, atk, decay);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus); sends(g, o.send, o.echo);
    src.start(t, Math.random() * 1.5); src.stop(t + atk + decay + 0.05);
  }
  // 오실레이터 한 방 (피치 드롭·디스토션 선택)
  function tone(t, o = {}) {
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    const dur = o.dur ?? 0.2, atk = o.attack ?? 0.001;
    osc.frequency.setValueAtTime(o.freq || 100, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    const g = ctx.createGain(); env(g, t, o.gain ?? 0.4, atk, dur);
    let node = osc;
    if (o.dist) { const ws = ctx.createWaveShaper(); ws.curve = DIST; ws.oversample = '2x'; osc.connect(ws); node = ws; }
    node.connect(g); g.connect(o.dest || sfxBus); sends(g, o.send, o.echo);
    osc.start(t); osc.stop(t + atk + dur + 0.05);
  }
  const ok = () => ctx && !muted && ctx.state === 'running';   // 멈춘 컨텍스트(첫 클릭 전·숨은 창·헤드리스)에선 소리 노드를 만들지 않는다 — 끝나지 않고 쌓여 점점 느려졌다(2026-11-09 봇 배치)

  // ───────── 리볼버 ─────────
  A.shot = function () {
    if (!ok()) return;
    const t = now(), v = R(0.93, 1.07);
    if (has('shot1')) {
      // 실제 총성 샘플 + 합성 크랙(어택 선명하게) + 서브 쿵(가슴 펀치) + 건물 에코
      play(['shot1', 'shot2'], { t, vol: 1.0, rate: R(0.94, 1.05), echo: 0.45, send: 0.2 });
      noise(t, 0.025, { type: 'highpass', freq: 2600 * v, gain: 1.0 });
      noise(t + 0.001, 0.05, { type: 'bandpass', freq: 1100 * v, q: 1.1, gain: 0.55 });              // 중역 '빡' — 노트북 스피커에서도 때리는 맛
      tone(t + 0.002, { freq: 150 * v, freqEnd: 38, dur: 0.22, gain: 1.0, dist: true });
      tone(t + 0.003, { freq: 62 * v, freqEnd: 30, dur: 0.38, gain: 0.85 });                          // 서브 '쿵' — 가슴이 울리는 저음 꼬리
      noise(t + 0.17, 0.014, { type: 'bandpass', freq: 3300, q: 7, gain: 0.22 });
      A.duck(0.55, 0.3);
      return;
    }
    noise(t, 0.012, { type: 'highpass', freq: 5200, gain: 0.3 });                                   // 해머 타격
    noise(t + 0.002, 0.03, { type: 'highpass', freq: 2300 * v, gain: 1.6, send: 0.3 });              // 크랙
    noise(t + 0.002, 0.07, { type: 'bandpass', freq: 3600 * v, q: 0.9, gain: 0.9 });
    noise(t + 0.003, 0.3, { type: 'lowpass', freq: 2800 * v, freqEnd: 340, q: 0.9, gain: 1.8, send: 0.7, echo: 0.6 }); // 몸통
    tone(t + 0.002, { freq: 160 * v, freqEnd: 40, dur: 0.24, gain: 1.4, dist: true });               // 가슴 치는 쿵
    tone(t + 0.002, { type: 'triangle', freq: 95 * v, freqEnd: 33, dur: 0.34, gain: 0.8 });
    noise(t + 0.025, 1.0, { type: 'lowpass', freq: 380, q: 0.5, gain: 0.4, send: 0.3, echo: 0.35 }); // 저역 꼬리
    // 실린더가 한 칸 돌아가는 래칫
    noise(t + 0.17, 0.014, { type: 'bandpass', freq: 3300, q: 7, gain: 0.22 });
    tone(t + 0.17, { type: 'triangle', freq: 2100, dur: 0.03, gain: 0.05 });
    A.duck(0.55, 0.3);
  };
  // 산탄총 추가 저음: 리볼버보다 넓고 무거운 '콰앙'
  A.shotgunBoom = function () {
    if (!ok()) return; const t = now();
    tone(t + 0.002, { freq: 90, freqEnd: 26, dur: 0.55, gain: 1.1, dist: true });
    noise(t + 0.004, 0.35, { type: 'lowpass', freq: 1800, freqEnd: 200, q: 0.8, gain: 1.0, send: 0.5, echo: 0.5 });
    A.duck(0.75, 0.45);
  };
  // 처치 확인음: '퍽' 뒤에 딱 떨어지는 묵직한 '턱' — 헤드샷은 금속성 '챙'과 깊은 저음이 더해진다
  A.killConfirm = function (head = false) {
    if (!ok()) return; const t = now() + 0.012;
    tone(t, { freq: 240, freqEnd: 85, dur: 0.11, gain: 0.42, dist: true });
    noise(t, 0.045, { type: 'bandpass', freq: 1700, q: 1.4, gain: 0.5 });
    if (head) {
      tone(t + 0.005, { freq: 70, freqEnd: 28, dur: 0.42, gain: 0.8, dist: true });
      tone(t + 0.01, { type: 'triangle', freq: 2640, dur: 0.22, gain: 0.09 }); tone(t + 0.01, { type: 'sine', freq: 3960, dur: 0.16, gain: 0.05 });
      noise(t + 0.008, 0.06, { type: 'highpass', freq: 4200, gain: 0.35 });
      A.duck(0.6, 0.4);
    }
  };
  A.dry = function () {
    if (!ok()) return;
    if (has('dry')) return play('dry', { vol: 0.7 });
    const t = now();
    noise(t, 0.01, { type: 'highpass', freq: 4200, gain: 0.5 });
    noise(t, 0.04, { type: 'bandpass', freq: 2600, q: 8, gain: 0.35 });
    tone(t, { type: 'square', freq: 1400, dur: 0.02, gain: 0.06 });
  };
  A.cylOut = function () {
    if (!ok()) return;
    if (has('cyl_open')) return play('cyl_open', { vol: 0.65 });
    const t = now();
    noise(t, 0.05, { type: 'bandpass', freq: 2200, q: 4, gain: 0.7 });
    tone(t, { type: 'triangle', freq: 760, dur: 0.07, gain: 0.22 });
    noise(t + 0.06, 0.09, { type: 'bandpass', freq: 1500, freqEnd: 2600, q: 3, gain: 0.3 });      // 이젝터 로드
  };
  A.casing = function (vol = 1) {
    if (!ok()) return;
    if (has('casing')) return play('casing', { vol: 0.4 * vol, rate: R(0.85, 1.3) });
    const t = now(), f = R(2500, 3700);
    noise(t, 0.008, { type: 'highpass', freq: 6000, gain: 0.15 * vol });
    tone(t, { type: 'sine', freq: f, dur: R(0.12, 0.22), gain: 0.13 * vol });
    tone(t, { type: 'sine', freq: f * 2.76, dur: 0.1, gain: 0.06 * vol });
    tone(t, { type: 'sine', freq: f * 5.4, dur: 0.06, gain: 0.03 * vol });
  };
  A.speedload = function () {
    if (!ok()) return;
    if (has('speedload')) return play('speedload', { vol: 0.65 });
    const t = now();
    [0, 0.045].forEach((dt, i) => {
      noise(t + dt, 0.03, { type: 'bandpass', freq: 3000 - i * 600, q: 6, gain: 0.45 });
      tone(t + dt, { type: 'triangle', freq: 1250 - i * 200, dur: 0.04, gain: 0.1 });
    });
  };
  A.cylIn = function () {
    if (!ok()) return;
    if (has('cyl_close')) return play('cyl_close', { vol: 0.75 }); // 닫힘+스핀이 한 샘플에 들어 있음
    const t = now();
    noise(t, 0.06, { type: 'bandpass', freq: 1800, q: 3, gain: 1.0 });
    noise(t, 0.02, { type: 'highpass', freq: 4200, gain: 0.45 });
    tone(t, { type: 'triangle', freq: 620, dur: 0.09, gain: 0.32 });
  };
  A.spin = function () {
    if (!ok() || has('cyl_close')) return;
    let t = now(), dt = 0.026;
    for (let i = 0; i < 10; i++) {
      noise(t, 0.012, { type: 'bandpass', freq: 3400, q: 8, gain: 0.28 * (1 - i / 12) });
      t += dt; dt *= 1.17;
    }
  };

  // ───────── 좀비 피격 ─────────
  A.flesh = function (head, pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    if (has('hit1')) {
      play(['hit1', 'hit2'], { t, vol: head ? 0.7 : 0.85, rate: R(0.9, 1.1), pan });
      tone(t, { freq: 110, freqEnd: 45, dur: 0.12, gain: 0.6, dest });                                // 저음 보강
      if (head) {
        play('headshot', { t, vol: 0.95, rate: R(0.95, 1.08), pan, send: 0.12 });
        tone(t, { type: 'triangle', freq: 1900, dur: 0.28, gain: 0.07 });                          // 헤드샷 '팅' (게임 피드백)
        tone(t, { freq: 2870, dur: 0.2, gain: 0.04 });
      }
      return;
    }
    noise(t, 0.09, { type: 'bandpass', freq: 820, q: 1.2, gain: 1.1, dest });                       // 퍽
    noise(t, 0.15, { type: 'lowpass', freq: 2600, freqEnd: 260, q: 3, gain: 0.7, dest });          // 질척
    tone(t, { freq: 115, freqEnd: 46, dur: 0.14, gain: 1.0, dest });
    if (head) {
      for (let i = 0; i < 4; i++) noise(t + 0.003 + i * R(0.006, 0.014), 0.02, { type: 'highpass', freq: R(1700, 3200), gain: 0.7, dest }); // 뼈 부서짐
      noise(t + 0.01, 0.3, { type: 'lowpass', freq: 1700, freqEnd: 180, q: 4, gain: 0.9, send: 0.15, dest });
      tone(t, { type: 'triangle', freq: 1900, dur: 0.28, gain: 0.07 });                           // 헤드샷 '팅'
      tone(t, { type: 'sine', freq: 2870, dur: 0.2, gain: 0.04 });
    }
  };
  A.splatter = function (n = 10, spread = 0.35, vol = 0.3, pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    for (let i = 0; i < n; i++) noise(t + Math.random() * spread, 0.03, { type: 'bandpass', freq: R(500, 2400), q: 2, gain: vol * R(0.3, 1), dest });
  };
  A.bodyFall = function (sc = 1, pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    if (has('fall')) return play('fall', { t, vol: 0.75 * sc, rate: R(0.9, 1.08), pan });
    tone(t, { freq: 78, freqEnd: 36, dur: 0.26, gain: 0.9 * sc, dest });
    noise(t, 0.2, { type: 'lowpass', freq: 380, q: 1, gain: 0.7 * sc, dest });
    A.splatter(5, 0.12, 0.18 * sc, pan);
  };
  A.gibBurst = function (pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    if (has('gib')) {
      play('gib', { t, vol: 1.0, rate: R(0.9, 1.08), pan, send: 0.25, echo: 0.2 });
      tone(t, { freq: 95, freqEnd: 30, dur: 0.4, gain: 1.0, dist: true, dest });
      return;
    }
    tone(t, { freq: 95, freqEnd: 30, dur: 0.42, gain: 1.3, dist: true, dest });
    noise(t, 0.45, { type: 'lowpass', freq: 1500, freqEnd: 140, q: 1.5, gain: 1.4, send: 0.45, echo: 0.3, dest });
    A.splatter(22, 0.5, 0.45, pan);
  };
  A.killTick = function (combo) {
    if (!ok()) return;
    const steps = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
    const f = 440 * Math.pow(2, steps[(combo - 1) % 12] / 12), t = now() + 0.03;
    tone(t, { freq: f, dur: 0.12, gain: 0.12 });
    tone(t, { type: 'triangle', freq: f * 2, dur: 0.08, gain: 0.04 });
  };
  A.ground = function (pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    noise(t, 0.05, { type: 'highpass', freq: 1900, gain: 0.55, dest });
    noise(t, 0.12, { type: 'lowpass', freq: 900, q: 1, gain: 0.4, dest });
    if (Math.random() < 0.45) tone(t + 0.01, { freq: R(2600, 3400), freqEnd: R(700, 1000), dur: 0.3, gain: 0.06, send: 0.3, dest }); // 도탄음
  };
  A.barricade = function (pan) {
    if (!ok()) return;
    const t = now(), dest = panned(pan);
    tone(t, { freq: 130, freqEnd: 70, dur: 0.13, gain: 0.55, dest });
    noise(t, 0.11, { type: 'bandpass', freq: 420, q: 2, gain: 0.7, dest });
  };
  A.groan = function (pan, sc = 1) {
    if (!ok()) return;
    if (has('groan1')) return play(['groan1', 'groan2'], { vol: 0.3 * sc, rate: R(0.82, 1.12), pan, send: 0.2 });
    const t = now(), dest = panned(pan), dur = R(0.7, 1.4);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(R(68, 105), t);
    o.frequency.linearRampToValueAtTime(R(55, 80), t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = R(4, 7); lg.gain.value = 7;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(380, 620); f.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * sc, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest); sends(g, 0.2, 0);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  };
  A.shriek = function (pan, sc = 1) { // 추격자 비명: 신음 샘플을 빠르게 + 톱니파 하강
    if (!ok()) return; const t = now(), dest = panned(pan);
    if (has('groan1')) play(['groan1', 'groan2'], { vol: 0.42 * sc, rate: R(1.65, 1.95), pan, send: 0.3 });
    tone(t, { type: 'sawtooth', freq: R(900, 1100), freqEnd: R(380, 460), dur: 0.42, gain: 0.07 * sc, dest });
    noise(t, 0.3, { type: 'bandpass', freq: 2400, q: 3, gain: 0.25 * sc, dest });
  };
  A.step = function (v = 1) { // 아스팔트 발소리
    if (!ok()) return;
    const t = now();
    noise(t, 0.06, { type: 'lowpass', freq: R(450, 650), q: 1, gain: 0.22 * v });
    noise(t + 0.005, 0.025, { type: 'bandpass', freq: R(1800, 2600), q: 1.2, gain: 0.06 * v });
  };
  // ───────── 요새·성장 ─────────
  let eng = null;
  A.engine = function (v) { // 요새 엔진: 속도에 따라 음높이·밝기 상승
    if (!ctx) return;
    if (!eng) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'sawtooth'; o2.type = 'square';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2; const g = ctx.createGain(); g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(bed || sfxBus); o.start(); o2.start(); eng = { o, o2, f, g };
    }
    const t = ctx.currentTime, k = muted ? 0 : 1;
    eng.o.frequency.setTargetAtTime(36 + v * 72, t, 0.12); eng.o2.frequency.setTargetAtTime(18 + v * 36, t, 0.12);
    eng.f.frequency.setTargetAtTime(200 + v * 760, t, 0.12); eng.g.gain.setTargetAtTime((0.045 + v * 0.07) * k, t, 0.12);
  };
  A.engineOff = () => { if (eng) eng.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); };
  A.levelUp = function () {
    if (!ok()) return; const t = now();
    [523, 659, 784, 1046, 1318].forEach((f, i) => { tone(t + i * 0.07, { type: 'triangle', freq: f, dur: 0.28, gain: 0.13 }); tone(t + i * 0.07, { freq: f * 2, dur: 0.15, gain: 0.04 }); });
  };
  A.absorb = function () { // 폐차를 들이받아 장갑으로 용접하는 소리
    if (!ok()) return; const t = now();
    tone(t, { freq: 180, freqEnd: 60, dur: 0.35, gain: 1.0, dist: true });
    noise(t, 0.3, { type: 'bandpass', freq: 900, q: 2, gain: 1.0, send: 0.3, echo: 0.2 });
    for (let i = 0; i < 4; i++) noise(t + 0.08 + i * 0.05, 0.05, { type: 'bandpass', freq: R(1800, 3200), q: 6, gain: 0.4 });
  };
  A.notice = function () { if (!ok()) return; const t = now(); tone(t, { type: 'triangle', freq: 880, dur: 0.12, gain: 0.1 }); tone(t + 0.1, { type: 'triangle', freq: 1320, dur: 0.18, gain: 0.1 }); };
  A.zap = function (pan) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    noise(t, 0.07, { type: 'highpass', freq: 3000, gain: 0.35, dest }); tone(t, { type: 'square', freq: 1300, freqEnd: 260, dur: 0.08, gain: 0.07, dest });
  };
  A.thud = function () { // 큰 이벤트용 저음 펀치
    if (!ok()) return;
    tone(now(), { freq: 70, freqEnd: 28, dur: 0.5, gain: 1.0, dist: true });
  };
  // ── 6발 리듬 · 스키트 · 도시 덫 (2026-11-09) ──
  // 같은 실린더에서 연속으로 맞힐 때마다 반음씩 올라가는 '팅' (0~5) · 빗나가면 둔한 '퍽'
  A.hitPing = function (semi = 0) {
    if (!ok()) return; const t = now(), k = Math.pow(2, semi / 12);
    tone(t, { type: 'triangle', freq: 1180 * k, dur: 0.07, gain: 0.13 }); tone(t, { type: 'sine', freq: 2360 * k, dur: 0.04, gain: 0.05 });
  };
  A.missThud = function () { if (!ok()) return; noise(now(), 0.06, { type: 'lowpass', freq: 600, gain: 0.18 }); };
  A.clean = function () { if (!ok()) return; const t = now(); [0, 4, 7].forEach((s, i) => tone(t + i * 0.05, { type: 'triangle', freq: 880 * Math.pow(2, s / 12), dur: 0.16, gain: 0.12 })); };
  A.slam = function () { if (!ok()) return; const t = now(); noise(t, 0.035, { type: 'bandpass', freq: 2400, q: 3, gain: 0.7 }); tone(t, { freq: 180, freqEnd: 70, dur: 0.09, gain: 0.5 }); };
  A.jam = function () { if (!ok()) return; const t = now(); noise(t, 0.05, { type: 'bandpass', freq: 900, q: 6, gain: 0.35 }); noise(t + 0.06, 0.03, { type: 'highpass', freq: 3000, gain: 0.12 }); };
  A.ting = function (pan = 0) { if (!ok()) return; const t = now(); tone(t, { type: 'square', freq: 2900, freqEnd: 2500, dur: 0.12, gain: 0.08 }); noise(t, 0.02, { type: 'highpass', freq: 5000, gain: 0.3 }); };
  // 확성기 트럭: "고물 삽니다~" 대신 두 음 반복 + 잡음 섞인 방송 (목소리 없이)
  A.speaker = function (vol = 1) {
    if (!ok()) return; const t = now();
    [[523, 0], [392, 0.22], [523, 0.44], [659, 0.66]].forEach(([f, d]) => tone(t + d, { type: 'square', freq: f, dur: 0.18, gain: 0.05 * vol, send: 0.4, echo: 0.5 }));
    noise(t, 0.9, { type: 'bandpass', freq: 1400, q: 1.5, gain: 0.05 * vol, attack: 0.05 });
  };

  // ───────── 공포 디렉터 (2026-11-09): 쫓기는 긴장 ─────────
  // 긴장 음악 3겹(샘플 없이 합성): ① 저음 드론 — 늘 깔리고 위협이 클수록 커지고 밝아진다(라 + 트라이톤)
  // ② 맥박 북 — dread3d가 심장박동에 맞춰 친다 ③ 높은 현 트레몰로 — 위협 0.5부터 반음 부딪힘이 떨며 올라온다
  let tens = null, tensSet = 0;
  A.tension = function (k, on = true) {
    if (!ctx) return;
    if (!tens) {
      const osc = (type, f, det = 0) => { const n = ctx.createOscillator(); n.type = type; n.frequency.value = f; n.detune.value = det; n.start(); return n; };
      const droneF = ctx.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 120; droneF.Q.value = 2.5;
      const droneG = ctx.createGain(); droneG.gain.value = 0;
      [osc('sawtooth', 55, -8), osc('sawtooth', 55, 7), osc('sawtooth', 77.78), osc('sine', 27.5)].forEach(n => n.connect(droneF));
      const lfo = osc('sine', 0.11), lg = ctx.createGain(); lg.gain.value = 45; lfo.connect(lg); lg.connect(droneF.frequency);   // 숨 쉬듯 천천히 열렸다 닫힘
      droneF.connect(droneG); droneG.connect(dreadBus);
      const strF = ctx.createBiquadFilter(); strF.type = 'bandpass'; strF.frequency.value = 1100; strF.Q.value = 0.9;
      const trem = ctx.createGain(); trem.gain.value = 0.55; const tl = osc('sine', 9), tlg = ctx.createGain(); tlg.gain.value = 0.45; tl.connect(tlg); tlg.connect(trem.gain);
      const strG = ctx.createGain(); strG.gain.value = 0;
      [osc('sawtooth', 440, -5), osc('sawtooth', 466.16, 6), osc('sawtooth', 622.25), osc('sawtooth', 932.33, 4)].forEach(n => n.connect(strF));
      strF.connect(trem); trem.connect(strG); strG.connect(dreadBus); sends(strG, 0.4, 0);
      tens = { droneF, droneG, strF, strG, tl };
    }
    const t = ctx.currentTime; if (t - tensSet < 0.08) return; tensSet = t;   // 초당 12번이면 충분
    const s = ZK.clamp((k - 0.5) / 0.5, 0, 1);
    tens.droneG.gain.setTargetAtTime(on ? 0.035 + 0.12 * k : 0, t, on ? 0.5 : 0.25);
    tens.droneF.frequency.setTargetAtTime(110 + 650 * k * k, t, 0.5);
    tens.strG.gain.setTargetAtTime(on ? 0.05 * s * s : 0, t, 0.3);
    tens.strF.frequency.setTargetAtTime(900 + 1500 * s, t, 0.4); tens.tl.frequency.setTargetAtTime(6 + 10 * s, t, 0.4);
  };
  // 심장박동: 쿵-쿵 (두 번째가 조금 약하다) · 먹먹함 필터를 거치지 않아 빈사일 때 오히려 크게 들린다
  A.heartbeat = function (v = 1) {
    if (!ok()) return; const t = now();
    tone(t, { freq: 64, freqEnd: 36, dur: 0.15, gain: 0.6 * v, attack: 0.005, dest: dreadBus });
    noise(t, 0.05, { type: 'lowpass', freq: 150, gain: 0.3 * v, dest: dreadBus });
    tone(t + 0.16, { freq: 55, freqEnd: 33, dur: 0.19, gain: 0.42 * v, attack: 0.005, dest: dreadBus });
  };
  A.drum = function (v = 1) {   // 맥박 북 (긴장 음악 ②)
    if (!ok()) return; const t = now();
    tone(t, { freq: 96, freqEnd: 44, dur: 0.32, gain: 0.45 * v, dist: true, dest: dreadBus });
    noise(t, 0.14, { type: 'bandpass', freq: 240, q: 1.3, gain: 0.32 * v, send: 0.35, dest: dreadBus });
  };
  // 발견 스팅어: 조용하다가 처음 들킨 순간의 '쾅' — 불협 화음 + 긁는 고음 + 저음
  A.stinger = function (v = 1) {
    if (!ok()) return; const t = now();
    [233.08, 246.94, 349.23, 466.16].forEach(f => tone(t, { type: 'sawtooth', freq: f, freqEnd: f * 0.93, dur: 0.75, gain: 0.045 * v, attack: 0.008, send: 0.5, dest: dreadBus }));
    noise(t, 0.55, { type: 'bandpass', freq: 3200, freqEnd: 1100, q: 4, gain: 0.2 * v, send: 0.4, dest: dreadBus });
    tone(t, { freq: 72, freqEnd: 28, dur: 0.55, gain: 0.55 * v, dist: true, dest: dreadBus });
  };
  // 좀비가 나를 알아챈 비명 (배회·경계 → 추적)
  A.spot = function (pan, v = 1) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    if (has('groan1')) play(['groan1', 'groan2'], { t, vol: 0.55 * v, rate: R(1.25, 1.5), pan, send: 0.35 });
    tone(t, { type: 'sawtooth', freq: R(300, 360), freqEnd: R(170, 210), dur: 0.35, gain: 0.07 * v, dist: true, dest });
    noise(t, 0.25, { type: 'bandpass', freq: 1700, q: 2, gain: 0.22 * v, dest });
  };
  // 쫓아오는 발소리 (걸어 다닐 때 가까운 추적 좀비)
  A.zstep = function (pan, v = 1) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    noise(t, 0.07, { type: 'lowpass', freq: R(260, 420), q: 1.2, gain: 0.5 * v, dest });
    noise(t + 0.01, 0.04, { type: 'bandpass', freq: R(900, 1500), q: 1.5, gain: 0.13 * v, dest });
    tone(t, { freq: R(70, 90), freqEnd: 40, dur: 0.08, gain: 0.25 * v, dest });
  };
  // 으르렁: 가까이 붙은 놈 · 덮치기 직전
  A.snarl = function (pan, v = 1) {
    if (!ok()) return; const t = now(), dest = panned(pan), dur = R(0.35, 0.6);
    if (has('groan1')) play(['groan1', 'groan2'], { t, vol: 0.45 * v, rate: R(1.05, 1.3), pan });
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(R(110, 150), t); o.frequency.linearRampToValueAtTime(R(78, 100), t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = R(22, 32); lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
    const ws = ctx.createWaveShaper(); ws.curve = DIST;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(500, 800); f.Q.value = 2;
    const g = ctx.createGain(); env(g, t, 0.11 * v, 0.03, dur);
    o.connect(ws); ws.connect(f); f.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  };
  // 내 숨소리 (들이쉼·내쉼) — 지구력이 떨어지거나 쫓길수록 빠르고 거칠다
  A.breath = function (v = 1, inhale = true) {
    if (!ok()) return; const t = now();
    noise(t, inhale ? 0.3 : 0.4, { type: 'bandpass', freq: inhale ? 1500 : 850, freqEnd: inhale ? 2200 : 560, q: 1.1, gain: 0.15 * v, attack: inhale ? 0.1 : 0.04, dest: dreadBus });
  };
  // 아슬아슬하게 피한 덮치기: 휙 + 이빨 딱
  A.whoosh = function (pan) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    noise(t, 0.22, { type: 'bandpass', freq: 500, freqEnd: 2600, q: 1.4, gain: 0.55, attack: 0.05, dest });
    noise(t + 0.12, 0.03, { type: 'highpass', freq: 2500, gain: 0.35, dest }); tone(t + 0.12, { type: 'triangle', freq: 1400, freqEnd: 900, dur: 0.05, gain: 0.12, dest });
  };
  // 무리가 몰려오는 소리: 땅울림이 부풀고 그쪽에서 신음이 겹친다
  A.rumble = function (pan, v = 1, dur = 3) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    noise(t, dur, { type: 'lowpass', freq: 80, freqEnd: 240, q: 1, gain: 0.55 * v, attack: dur * 0.6, send: 0.3, dest });
    if (has('groan1')) for (let i = 0; i < 6; i++) play(['groan1', 'groan2'], { t: t + i * dur / 6 + R(0, 0.3), vol: 0.17 * v * (0.5 + i / 8), rate: R(0.7, 1.0), pan: ZK.clamp((pan || 0) + R(-0.35, 0.35), -1, 1), send: 0.5 });
  };
  // 먼 비명 (추격자 예고): 잔향이 길고 작게
  A.farShriek = function (pan) {
    if (!ok()) return; const t = now(), dest = panned(pan);
    if (has('groan1')) play(['groan1', 'groan2'], { t, vol: 0.3, rate: R(1.7, 2.0), pan, send: 0.9, echo: 0.6 });
    tone(t, { type: 'sawtooth', freq: R(1000, 1200), freqEnd: R(420, 500), dur: 0.65, gain: 0.03, send: 0.9, echo: 0.5, dest });
  };
  // 빈사 먹먹함: 0이면 평소, 1이면 효과음이 귀가 막힌 듯 (심장박동·긴장 음악은 그대로)
  A.muffle = function (k) { if (!ctx) return; muffleF.frequency.setTargetAtTime(20000 * Math.pow(1200 / 20000, ZK.clamp(k, 0, 1)), ctx.currentTime, 0.15); };

  function startAmbience() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 140;
    lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(ambDuck || master);
    src.start(); lfo.start();
  }

  ZK.audio = A;
})();
