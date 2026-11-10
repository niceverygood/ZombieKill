// 좀비킬 원격 조종기 — 다른 AI(코덱스 등)가 진짜 키 입력으로 게임을 하며 검수할 수 있게 (2026-11-10)
// 하는 일: ① 게임 폴더를 직접 띄움(기본 8131) ② 헤드리스 크로뮴(소프트웨어 WebGL)으로 fps.html을 엶 ③ 8132에서 조종 명령을 받음
// 실행:  node qa/codex_play.cjs            (끄기: curl -s -X POST localhost:8132/quit) · 창을 보이게: HEADED=1 · GPU 없이: SOFT=1
//   ※ 한 조종기 = 한 사람. 누가 이미 8131/8132를 쓰고 있으면 거기에 명령을 보내지 말고 GAME_PORT=8141 CTL_PORT=8142 처럼 다른 포트로 띄운다
// 명령:  curl -s localhost:8132/act -d '[{"start":true},{"hold":["KeyW"],"ms":1500},{"shot":"walk"}]'
//   ※ 기본은 턴제: 명령을 처리하는 동안만 게임이 흐르고 응답 뒤엔 멈춘다(REALTIME=1이면 계속 흐름)
//   reload           페이지 새로고침(봇 하네스를 쓴 뒤 직접 플레이로 돌아갈 때)
//   start            타이틀에서 클릭해 시작(이미 하는 중이면 무시)       press "KeyF"       키 한 번 (e.code 이름)
//   hold [키…] ms     키를 ms 동안 누름 (예: ["KeyW","ShiftLeft"])       fire ms            좌클릭을 ms 동안 누름(연사) · click: 한 번
//   ads true/false   우클릭 조준 누름/뗌                                 wait ms            그냥 기다림(게임은 실시간으로 흐름)
//   shot "이름"       화면 저장 → qa/codex_shots/                        state true         상태 요약(JSON)
//   aim "head"|"body" 가장 가까운 좀비로 시선 맞춤 — 조준 보조(사람은 못 함: 리포트에 쓴 횟수를 밝힐 것)
//   eval "js"        페이지에서 JS 실행 (디버그·강제 상황 만들기 전용 — 리포트에 밝힐 것) · 결과는 4000자까지
//   evalToFile "js", file "이름.json"   큰 결과를 qa/이름.json 으로 저장 (봇 플레이테스트 내보내기용)
// 응답: { results:[…], state:{…}, errors:[새 콘솔 오류] }
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'codex_shots');
const GAME_PORT = +process.env.GAME_PORT || 8131, CTL_PORT = +process.env.CTL_PORT || 8132;

// playwright 찾기: 프로젝트·전역 → 없으면 npx 캐시(~/.npm/_npx/*/node_modules/playwright)
function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* 다음 후보 */ }
  const base = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'node_modules', 'playwright');
    if (fs.existsSync(p)) { try { return require(p); } catch (e) { /* 다음 */ } }
  }
  console.error('playwright를 못 찾았다. 네트워크가 되면:  cd ' + ROOT + ' && npm i --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

// ① 정적 파일 서버 (python http.server 대신 — 따로 띄울 필요 없게)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.css': 'text/css' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(ROOT, u === '/' ? 'fps.html' : u);
  if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }   // 브라우저가 저절로 찾는 아이콘 — 오류로 안 보이게
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).on('error', e => { console.error(e.code === 'EADDRINUSE' ? `포트 ${GAME_PORT}을 이미 누가 쓰고 있다(다른 조종기?) — 그쪽에 명령을 보내지 말고 GAME_PORT·CTL_PORT로 다른 포트를 써라` : e); process.exit(1); }).listen(GAME_PORT, '127.0.0.1');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let page, browser, errors = [], shotN = 0;

// 상태 요약: 사람이 화면에서 읽을 만한 것만
const STATE_JS = `(() => { const g = ZK.debug3 && ZK.debug3.g; if (!g) return { loading: true };
  const F = ZK.fort.state, ps = ZK.player.state, S = ZK.surv, cam = ZK.debug3.camera.position, mt = ZK.mis.target ? ZK.mis.target(g) : null;
  const alive = g.zombies.filter(z => z.alive), near = alive.map(z => z.pos.distanceTo(cam)).sort((a, b) => a - b);
  const mm = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  return { clock: mm(g.t || 0), state: g.state, mode: g.mode, hp: Math.round(g.hp || 0), bus: Math.round(F.hp) + '/' + F.maxHp, busSpeed: +Math.abs(F.speed).toFixed(1),
    kills: g.kills, level: S.level, choosingCards: S.choosing ? S.cards.map(c => c.name) : null, weapon: ZK.gun3.weapon, ammo: ZK.gun3.state.ammo,
    zombiesAlive: alive.length, nearest3m: near.slice(0, 3).map(d => +d.toFixed(1)), clinging: alive.filter(z => z.state === 'cling').length, noise: Math.round(g.noiseM || 0),
    stamina: ZK.dread ? Math.round(ZK.dread.stam) : null, threat: ZK.dread ? +ZK.dread.k.toFixed(2) : null, stance: ps.stance, torch: ZK.torch ? ZK.torch.on : null,
    mission: mt ? (mt.name + ' — ' + (mt.sub || '') + ' · ' + Math.round(Math.hypot(mt.x - cam.x, mt.z - cam.z)) + 'm') : null,
    bail: ZK.bail ? { wrecked: ZK.bail.wrecked, toHelipad: ZK.bail.toLZ, hold: +ZK.bail.hold.toFixed(1) } : null,
    notices: (g.notices || []).map(n => n.text), overWhy: g.overWhy || null, fps: window.__fps || null, drawCalls: (() => { const r = ZK.debug3.renderer; if (!r || ZK.debug3.fast) return null; r.info.autoReset = false; r.info.reset(); ZK.debug3.tick(1, 0.0001); const c = r.info.render.calls; r.info.autoReset = true; return c; })() }; })()`;   // 한 프레임 전체(장면 + 총) — renderer.info는 마지막 그리기(총)만 세서 따로 잰다

async function act(step) {
  const k = page.keyboard, m = page.mouse, W = 1280, H = 720;
  if (step.reload) { await page.reload(); await page.waitForFunction('window.ZK && ZK.debug3 && ZK.debug3.g', null, { timeout: 30000 }); return 'reloaded (봇 하네스·빠른 모드 해제, 타이틀 화면)'; }
  if (step.start) { const st = await page.evaluate('ZK.debug3 && ZK.debug3.g.state'); if (st === 'play') return 'already playing'; await m.click(W / 2, H / 2); await sleep(300); return 'clicked to start'; }
  if (step.press) { await k.press(step.press); return 'pressed ' + step.press; }
  if (step.hold) { for (const c of step.hold) await k.down(c); await sleep(step.ms || 500); for (const c of step.hold) await k.up(c); return 'held ' + step.hold.join('+') + ' ' + (step.ms || 500) + 'ms'; }
  if (step.fire !== undefined) { await m.move(W / 2, H / 2); await m.down(); await sleep(step.fire || 120); await m.up(); return 'fired ' + (step.fire || 120) + 'ms'; }
  if (step.click) { await m.click(W / 2, H / 2); return 'clicked'; }
  if (step.ads !== undefined) { await m.move(W / 2, H / 2); if (step.ads) await m.down({ button: 'right' }); else await m.up({ button: 'right' }); return 'ads ' + step.ads; }
  if (step.aim) return await page.evaluate(([p, i]) => ZK.debug3.aimAt(p, i), [step.aim, step.idx || 0]);
  if (step.wait) { await sleep(step.wait); return 'waited ' + step.wait + 'ms'; }
  if (step.shot) { fs.mkdirSync(SHOTS, { recursive: true }); const f = path.join(SHOTS, String(++shotN).padStart(3, '0') + '_' + String(step.shot).replace(/[^\w가-힣-]/g, '_') + '.png'); await page.screenshot({ path: f }); return f; }
  if (step.state) return await page.evaluate(STATE_JS);
  if (step.evalToFile) {   // 큰 결과(봇 플레이테스트 JSON 등)를 qa/ 안 파일로 — 이름은 영문·숫자·_- 만
    const name = String(step.file || 'codex_out.json').replace(/[^\w.-]/g, '_'), f = path.join(__dirname, name), r = await page.evaluate(step.evalToFile);
    fs.writeFileSync(f, typeof r === 'string' ? r : JSON.stringify(r)); return f + ' (' + fs.statSync(f).size + ' bytes)'; }
  if (step.eval) { const r = await page.evaluate(step.eval); return typeof r === 'string' ? r.slice(0, 4000) : JSON.stringify(r === undefined ? null : r).slice(0, 4000); }
  return 'unknown step ' + JSON.stringify(step);
}

(async () => {
  const { chromium } = loadPlaywright();
  // 브라우저: playwright 기본 → 설치된 구글 크롬 → 캐시에 있는 다른 판 크로뮴 (playwright 판과 브라우저 판이 어긋나 기본이 없을 때가 있다)
  // 기본은 맥 GPU(Metal) — M5에서 60fps. SOFT=1이면 소프트웨어(swiftshader): 13~21fps라 게임 시간이 실제보다 느리게 흐른다(한 프레임 최대 0.05초)
  const args = (!process.env.SOFT ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']).concat('--autoplay-policy=no-user-gesture-required');
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), cands = [];
  if (fs.existsSync(cache)) for (const d of fs.readdirSync(cache).sort().reverse()) {
    if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'), path.join(cache, d, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'), path.join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
  }
  for (const opt of [{}, { channel: 'chrome' }, ...cands.filter(p => fs.existsSync(p)).map(p => ({ executablePath: p }))]) {
    try { browser = await chromium.launch({ headless: !process.env.HEADED, args, ...opt }); console.log('browser:', JSON.stringify(opt)); break; } catch (e) { console.log('launch failed', JSON.stringify(opt), String(e).split('\n')[0]); }
  }
  if (!browser) { console.error('크로뮴을 못 띄웠다 — npx playwright install chromium 이 필요하다'); process.exit(1); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });   // 새 컨텍스트 = 저장된 별·해금 없음(매번 첫 판 상태)
  page = await ctx.newPage();
  await page.addInitScript(() => { let n = 0, t0 = performance.now(); const f = () => { n++; const t = performance.now(); if (t - t0 >= 1000) { window.__fps = Math.round(n * 1000 / (t - t0)); n = 0; t0 = t; } requestAnimationFrame(f); }; requestAnimationFrame(f); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  await page.goto(`http://127.0.0.1:${GAME_PORT}/fps.html`);
  await page.waitForFunction('window.ZK && ZK.debug3 && ZK.debug3.g', null, { timeout: 30000 });
  http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      const send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o, null, 1)); };
      try {
        if (req.url.startsWith('/quit')) { send({ bye: true }); await browser.close(); process.exit(0); }
        if (req.url.startsWith('/state')) return send(await page.evaluate(STATE_JS));
        if (req.url.startsWith('/act')) {
          let steps = JSON.parse(body || '[]'); if (!Array.isArray(steps)) steps = [steps];
          // 턴제(기본): 명령을 처리하는 동안만 게임 시간이 흐르고, 끝나면 멈춘다 — 생각하는 동안 좀비가 때리지 않게. REALTIME=1이면 계속 흐름
          await page.evaluate('ZK.debug3.freeze(false)');
          const results = []; for (const s of steps) results.push(await act(s));
          const state = await page.evaluate(STATE_JS);
          if (!process.env.REALTIME) await page.evaluate('ZK.debug3 && ZK.debug3.freeze(true)');
          const newErr = errors.splice(0); return send({ results, state, errors: newErr });
        }
        send({ usage: 'POST /act [steps] · GET /state · POST /quit' });
      } catch (e) { send({ error: String(e) }, 500); }
    });
  }).listen(CTL_PORT, '127.0.0.1', () => console.log(`ready — game http://127.0.0.1:${GAME_PORT}/fps.html · control http://127.0.0.1:${CTL_PORT}/act`));
})().catch(e => { console.error(e); process.exit(1); });
