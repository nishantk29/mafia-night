// E2E (Chromium + WebKit, reduced motion on and off): the death card stays up until someone taps Close
// (design review, Oct 30 2026: "The card that shows who died is too quick"). One host and eight phones play night 1 and the day vote.
// The vote card must still be on the host's and a player's phone after 60 s, go only on that phone's Close, and name no role.
// Run: node test/e2e/death-card.e2e.mjs   (starts `wrangler dev --local`; BASE=... uses a running one)
//   SHOTS=<dir> saves t=0 and t=60s shots. ONLY=webkit|chromium and MOTION=reduce|no-preference narrow the runs.
//   With an https BASE (live) WebKit is skipped: the dev machine's WebKit had no TLS. E2E_WEBKIT=1 forces it, E2E_WEBKIT=0 skips it. WAIT_MS overrides 60000.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engines, ledger, server, DEVICES } from './phones.mjs';
import { ROLE_BY_ID } from '../../public/js/roles.js';

// playwright-core is an optional dev tool (not a package.json dependency): install it, or set PW to its folder.
const PW = process.env.PW || 'playwright-core';
const pwEntry = /^(\.|\/|[A-Za-z]:)/.test(PW) ? `${PW}/index.mjs` : PW; // a folder path, or the bare package name
const { chromium, webkit } = await import(pwEntry);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const WAIT_MS = +(process.env.WAIT_MS || 60000);
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'];
const ROLE_WORDS = /\b(Doctor|Detective|Cop|Villager|Mafia|Godfather|Vigilante|Jester|Bodyguard|Medium|Sheriff|Serial Killer|Framer|Janitor|Mayor)\b/;
const L = ledger('mafia death card e2e');
const srv = await server(ROOT);
const BASE = srv.base;
const card = (P) => P.page.locator('#fx .fx-out');
const cardState = (P) => P.page.evaluate(() => {
  const el = document.querySelector('#fx .fx-out'); if (!el) return null;
  const inner = el.querySelector('.fx-in'); const r = el.querySelector('.fx-card').getBoundingClientRect();
  return { text: el.innerText.replace(/\s+/g, ' ').trim(), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' && +getComputedStyle(inner).opacity > 0.9,
    anim: getComputedStyle(inner).animationName, button: el.querySelector('[data-fx-continue]')?.textContent || '' };
});

async function run(engine, motion) {
  const tag = `${engine} ${motion === 'reduce' ? 'reduced motion' : 'motion on'}`;
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const all = [];
  const phone = async (name) => {
    const ctx = await browser.newContext({ ...DEVICES.p390, serviceWorkers: 'block', reducedMotion: motion });
    const page = await ctx.newPage(); const errors = []; const frames = [];
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { frames.push(JSON.parse(f.payload)); } catch { /* binary */ } }));
    const P = { name, page, errors, frames, shot: async (f) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `${engine}-${motion}-${f}.png`) }); } };
    all.push(P); return P;
  };
  const wait = (P, ms) => P.page.waitForTimeout(ms);
  try {
    const host = await phone('host');
    await host.page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
    await host.page.locator('[data-a="hostLive"]').first().click();
    await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
    const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
    const skipWalk = () => host.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
    await skipWalk();
    const players = [];
    for (const n of NAMES) {
      const p = await phone(n); players.push(p);
      await p.page.goto(BASE + '/#/join/' + code, { waitUntil: 'domcontentloaded' });
      const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
      for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
    }
    await host.page.waitForFunction((ns) => ns.every((n) => document.body.innerText.includes(n)), NAMES, { timeout: 15000 }).catch(() => {});
    await skipWalk();
    for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click(); await wait(host, 150); }
    await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
    for (const p of players) await p.page.locator('[data-a="seeRoles"]').click({ timeout: 15000 }).catch(() => {});
    await host.page.locator('[data-a="seeRoles"]').click({ timeout: 15000 }).catch(() => {});
    // night 1: Mafia take the first name, everyone else the last
    await host.page.locator('.action-dock [data-a="startNight"]').click();
    await host.page.locator('.st-card').waitFor({ timeout: 10000 });
    for (let i = 0; i < 30; i++) {
      const kicker = await host.page.evaluate(() => document.querySelector('.st-card .st-kicker')?.textContent || '');
      if (!kicker) break;
      const toks = host.page.locator('.st-card .st-tok:not(.is-none)');
      if (await toks.count()) await (/Mafia/.test(kicker) ? toks.first() : toks.last()).click();
      else if (await host.page.locator('.st-card [data-a="alert"][data-v="1"]').count()) await host.page.locator('.st-card [data-a="alert"][data-v="1"]').first().click();
      await wait(host, 120);
      const check = host.page.locator('.check-card'); if (await check.count()) { await check.click(); await wait(host, 150); }
      if (await host.page.locator('.action-dock .btn.big.disabled').count()) { await host.page.locator('.st-card [data-a="skip"], .dock-why [data-a="skip"], .dock-why [data-a="skipIdentify"]').first().click(); await wait(host, 120); }
      await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
      if (await host.page.locator('.st-card [data-a="selCondemn"], .st-kicker:text("Morning")').count()) break;
    }
    await host.page.locator('.st-card .st-kicker:text("Morning")').waitFor({ timeout: 8000 }).catch(() => {});
    const say = await host.page.evaluate(() => document.querySelector('.st-card .st-say')?.textContent || '');
    const killed = NAMES.filter((n) => new RegExp(`${n} was killed in the night`).test(say));
    if (killed.length) {
      await card(host).waitFor({ timeout: 3000 }).catch(() => {});
      await wait(host, 2000); // five times the old 400 ms
      const s = await cardState(host);
      L.check(`${tag}: night death card is still up on the host after 2 s`, s?.visible && s.text.toLowerCase().includes(killed[0].toLowerCase()) && /Killed/i.test(s.text), s);
      await host.page.locator('#fx [data-fx-continue]').click();
      L.check(`${tag}: host Close removes the night card`, (await card(host).count()) === 0);
      const other = players.find((p) => !killed.includes(p.name));
      L.check(`${tag}: the night card waits on a player phone too`, (await cardState(other))?.visible === true);
      for (const p of players) if (await card(p).count()) await p.page.locator('#fx [data-fx-continue]').click();
    } else L.check(`${tag}: (no night death this deal: night card not checked)`, true, say.slice(0, 80));
    // the vote: someone who is not Mafia, so the game goes on
    if (await host.page.locator('.st-kicker:text("Morning")').count()) { await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250); }
    if (await host.page.locator('.st-card .st-kicker:text("Talk")').count()) { await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250); }
    await host.page.locator('.st-card [data-a="selCondemn"]').first().waitFor({ timeout: 5000 });
    const hv = host.frames.filter((m) => m.type === 'view' && m.view?.kind === 'host').at(-1)?.view;
    // pick someone whose vote-out keeps the game going: never a third-party role (side wins), and a Mafia only when one would be left
    const side = (q) => ROLE_BY_ID[q.roleId]?.alignment;
    const alive = hv.players.filter((q) => q.alive);
    const maf = alive.filter((q) => side(q) === 'mafia').length; const tw = alive.filter((q) => side(q) === 'town').length;
    const goesOn = (q) => { const m = maf - (side(q) === 'mafia'); const t = tw - (side(q) === 'town'); return m > 0 && m < t; };
    const town = alive.find((q) => side(q) !== 'third' && goesOn(q)) || alive.find((q) => side(q) === 'town');
    const tok = host.page.locator(`.st-card [data-a="selCondemn"][data-id="${town.id}"]`);
    await tok.click(); await wait(host, 150);
    await host.page.locator('.action-dock .btn.big').click();
    const watcher = players.find((p) => p.name !== town.name && !killed.includes(p.name));
    await card(host).waitFor({ timeout: 8000 }).catch(async () => { await host.shot('debug-host-novote'); throw new Error('no vote card on the host: ' + (await host.page.evaluate(() => document.body.innerText.slice(0, 400)))); });
    await card(watcher).waitFor({ timeout: 8000 }).catch(async () => { await watcher.shot('debug-player-novote'); throw new Error('no vote card on ' + watcher.name + ': ' + (await watcher.page.evaluate(() => document.body.innerText.slice(0, 300)))); });
    const t0 = Date.now();
    await wait(host, motion === 'reduce' ? 50 : 450); // let the entrance finish before the t=0 shot
    const h0 = await cardState(host); const w0 = await cardState(watcher);
    L.check(`${tag}: vote card is up on the host at t=0 with a Close button`, h0?.visible && h0.text.toLowerCase().includes(town.name.toLowerCase()) && /Voted out/i.test(h0.text) && h0.button === 'Close', h0);
    L.check(`${tag}: vote card is up on ${watcher.name}'s phone at t=0`, w0?.visible && w0.text.toLowerCase().includes(town.name.toLowerCase()), w0);
    L.check(`${tag}: entrance ${motion === 'reduce' ? 'has no motion' : 'is the spring-in'}`, motion === 'reduce' ? h0?.anim === 'none' : h0?.anim === 'fx-spring-stay', h0?.anim);
    await host.shot('host-t0'); await watcher.shot('player-t0');
    await wait(host, Math.max(0, WAIT_MS - (Date.now() - t0)));
    const secs = Math.round((Date.now() - t0) / 1000);
    const h60 = await cardState(host); const w60 = await cardState(watcher);
    L.check(`${tag}: vote card is still up on the host at t=${secs}s (no self-dismiss)`, h60?.visible === true, h60);
    L.check(`${tag}: vote card is still up on ${watcher.name}'s phone at t=${secs}s`, w60?.visible === true, w60);
    L.check(`${tag}: the card names no role`, !ROLE_WORDS.test(NAMES.reduce((s, n) => s.split(n).join(''), `${h60?.text} ${w60?.text}`).replace(/Voted out|Killed/gi, '')), `${h60?.text}`);
    await host.shot('host-t60'); await watcher.shot('player-t60');
    await host.page.locator('#fx [data-fx-continue]').click();
    L.check(`${tag}: host Close removes the host's card`, (await card(host).count()) === 0);
    L.check(`${tag}: ${watcher.name}'s card waits for their own tap`, (await card(watcher).count()) === 1);
    // Engine PR C: Host Undo, then Redo, re-render every phone. The undone vote-out takes its card away; the Redo shows it
    // once on each phone, never queued twice (review, Oct 30 2026).
    const nCards = (P) => P.page.evaluate(() => document.querySelectorAll('#fx .fx-out').length);
    if (await host.page.locator('[data-a="undo"]').count()) {
      await host.page.locator('[data-a="undo"]').click(); await wait(host, 900);
      L.check(`${tag}: after Undo ${town.name} is back and ${watcher.name}'s card is gone`, (await nCards(watcher)) === 0 && (await nCards(host)) === 0, `${await nCards(watcher)}/${await nCards(host)}`);
      await host.page.locator('[data-a="redo"]').click(); await wait(host, 900);
      await wait(host, 1500); // any second card would have queued by now
      const hc = await nCards(host); const wc = await nCards(watcher);
      L.check(`${tag}: after Redo each phone shows the vote card once (host ${hc}, ${watcher.name} ${wc})`, hc === 1 && wc === 1 && /Voted out/i.test((await cardState(watcher))?.text || ''));
      await host.page.locator('#fx [data-fx-continue]').click(); await wait(host, 300);
      L.check(`${tag}: one Close on the host and nothing queued behind it`, (await nCards(host)) === 0);
    } else L.check(`${tag}: host Undo button present (Engine PR C)`, false);
    await watcher.page.locator('#fx [data-fx-continue]').click();
    L.check(`${tag}: ${watcher.name}'s Close removes it`, (await card(watcher).count()) === 0);
    const next = await host.page.evaluate(() => document.querySelector('.action-dock .btn.big')?.textContent || '');
    L.check(`${tag}: the host can carry on after Close (the dock is reachable)`, /night/i.test(next), next);
    const errs = all.flatMap((p) => p.errors);
    L.check(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    L.check(`${tag}: suite ran to the end`, false, String(e?.stack || e).split('\n').slice(0, 3).join(' '));
  } finally { await browser.close(); }
}

try {
  for (const engine of engines(BASE)) { // WebKit is skipped for an https BASE: see engines() in phones.mjs
    if (process.env.ONLY && process.env.ONLY !== engine) continue;
    for (const motion of ['reduce', 'no-preference']) {
      if (process.env.MOTION && process.env.MOTION !== motion) continue;
      await run(engine, motion);
    }
  }
} finally { srv.stop(); L.done(); }
