// E2E (Chromium): the host setup carousel with six phones, Presets page, Customize, refresh mid-carousel, and the offline own-deck flow.
// Run: node test/e2e/setup-carousel.e2e.mjs   (starts the dev server from this repo; BASE=http://localhost:8941 uses a running one)
// Shots: SHOTS=<dir>. Exit 1 on any failure.
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay'];
const L = ledger('mafia setup carousel e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const count = (p) => p.page.locator('.setup-count').innerText();
const shot = (p, f) => (SHOTS ? p.shot(SHOTS, f) : null);
const full = (p, f) => (SHOTS ? p.page.screenshot({ path: `${SHOTS}/${f}.png`, fullPage: true, animations: 'disabled' }) : null);
const size = (p, w, h) => p.page.setViewportSize({ width: w, height: h });
const next = async (p) => { await p.page.locator('.action-dock [data-a="setupNext"]').click(); await p.page.waitForTimeout(150); };
const skipWalk = (p) => p.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
const addNames = async (p, names) => { for (const n of names) { await p.page.locator('#add-name').fill(n); await p.page.locator('#add-name').press('Enter'); await p.page.waitForTimeout(60); } await p.page.locator('#add-name').blur(); };
try {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await shot(host, 'home-390');
  L.check('home: three paths and one primary', (await host.page.locator('.path').count()) === 3 && (await host.page.locator('.home-cta .btn.big').count()) === 1);
  await size(host, 375, 667); await shot(host, 'home-375'); L.check('home 375x667: no sideways scroll', !(await host.overflow()));
  await size(host, 1280, 800); await shot(host, 'home-1280'); L.check('home 1280x800: no sideways scroll', !(await host.overflow()));
  await size(host, 390, 844);
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  await skipWalk(host);
  await host.page.locator('.setup-card.is-active').waitFor();
  L.check('step 1 of 4: Players, with the room code chip', (await count(host)) === 'Step 1 of 4: Players' && (await host.page.locator('.room-chip .code').innerText()) === code);
  const disabled0 = await host.page.locator('.action-dock [data-a="setupNext"]').getAttribute('aria-disabled');
  L.check('with nobody in, Next is disabled and names the reason and a fix', disabled0 === 'true' && /Add 5 more players/.test(await host.page.locator('#setup-why').innerText()) && (await host.page.locator('#setup-why [data-a="focusAdd"]').count()) === 1);
  await shot(host, 'mafia-1-players-short-390');

  const players = [];
  for (const n of NAMES) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/join/' + code);
    const input = p.page.locator('[data-i="joinName"]');
    await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  await host.page.waitForFunction((ns) => ns.every((n) => document.querySelector('.chips')?.innerText.includes(n)), NAMES, { timeout: 15000 });
  L.check('six phones joined and show as chips with a phone mark', (await host.page.locator('.chip .chip-phone').count()) === 6);
  await addNames(host, ['Gus']);
  await host.page.waitForFunction(() => document.querySelector('.chips')?.innerText.includes('Gus'));
  L.check('Add a name works with Enter (7 players)', (await host.page.locator('.chip').count()) === 7);
  await shot(host, 'mafia-1-players-390');
  await size(host, 375, 667); await shot(host, 'mafia-1-players-375');
  L.check('375x667: step 1 has no sideways scroll', !(await host.overflow()));
  await size(host, 1280, 800); await shot(host, 'mafia-1-players-1280');
  await size(host, 390, 844);

  await next(host);
  L.check('Next opens step 2: Preset, announced, heading focused', (await count(host)) === 'Step 2 of 4: Preset' && (await host.page.locator('#setup-live').innerText()).includes('Step 2 of 4') && (await host.page.evaluate(() => document.activeElement?.id)) === 'setup-h');
  L.check('Speakeasy is preselected with 7 players: 2 Mafia, Doctor, Detective, Villagers', await host.page.waitForFunction(() => /Speakeasy/.test(document.querySelector('.pp-name')?.textContent || '') && document.querySelectorAll('.mix-row').length === 4, null, { timeout: 5000 }).then(() => true, () => false));
  await shot(host, 'mafia-2-preset-390');
  await size(host, 375, 667); await shot(host, 'mafia-2-preset-375'); await size(host, 390, 844);

  // Presets page
  await host.page.locator('[data-a="setupPresets"]').first().click();
  await host.page.locator('.pc-list').first().waitFor();
  const names = await host.page.locator('.pc-name').allInnerTexts();
  L.check('presets page lists the seven names as drawn', ['Speakeasy', 'Last Orders', 'Smoke and Mirrors', 'Tommy Gun Night', 'The Family Business', 'Hard Boiled', 'Blind Tiger'].every((n) => names.includes(n)), names.join(','));
  L.check('out-of-range presets are dimmed, not hidden', (await host.page.locator('.pcard-btn.is-dim').count()) >= 3);
  await shot(host, 'presets-390'); await full(host, 'presets-390-full');
  await size(host, 1280, 800); await shot(host, 'presets-1280'); await size(host, 390, 844);
  await host.page.locator('[data-a="setupPreview"][data-v="hard-boiled"]').click();
  L.check('a misfit preset opens a sheet that says why and never blocks', /Needs 12 or more players/.test(await host.page.locator('.setup-sheet').innerText()) && (await host.page.locator('.setup-sheet [data-a="setupAddPlayers"]').count()) === 1);
  await shot(host, 'preset-preview-misfit-390');
  await host.page.locator('.setup-sheet [data-a="setupSheetClose"]').first().click();
  await host.page.locator('[data-a="setupPreview"][data-v="last-orders"]').click();
  await shot(host, 'preset-preview-390');
  await host.page.locator('[data-a="setupCustomizeFrom"]').click();
  await host.page.locator('.deck-list').first().waitFor();
  await shot(host, 'customize-390'); await full(host, 'customize-390-full');
  { // role groups: team sections, then a subhead per type
    const g = await host.page.evaluate(() => [...document.querySelectorAll('.setup-page section.tg')].map((s) => ({ team: s.dataset.team, h: s.querySelector('.tg-name')?.textContent, n: s.querySelector('.tg-n')?.textContent,
      types: [...s.querySelectorAll('.tg-sub')].map((t) => [t.dataset.type, t.querySelector('.tg-type')?.textContent, t.querySelectorAll('.deck-item').length]) })));
    L.check('customize: roles grouped by team (Town, Mafia, Neutral order) with card counts', g.length >= 2 && g[0].team === 'town' && g[0].h === 'Town' && g.every((x) => /^\d+ cards?$/.test(x.n)) && g.map((x) => x.team).join() === ['town', 'mafia', 'third'].filter((t) => g.some((x) => x.team === t)).join(), JSON.stringify(g).slice(0, 300));
    L.check('customize: every team has a subhead per type, even with one type', g.every((x) => x.types.length >= 1 && x.types.every(([d, h, c]) => d === h && c >= 1)));
    const fs = await host.page.evaluate(() => [...new Set([...document.querySelectorAll('.tg-type, .tg-h, .deck-item .rc')].map((e) => e.className.split(' ')[0] + ':' + getComputedStyle(e).fontSize))]);
    L.check('customize: type subheads are 16px, team heads 22px', fs.includes('tg-type:16px') && fs.includes('tg-h:22px'), fs.join(' '));
    await host.page.locator('.setup-page [data-a="openAddRole"]').click();
    await host.page.locator('.add-role-sheet').waitFor(); await host.page.waitForTimeout(450);
    await shot(host, 'addrole-390');
    const a = await host.page.evaluate(() => ({ top: !!document.querySelector('.add-role-sheet .add-role-top .search-field'), teams: [...document.querySelectorAll('.add-role-list section.tg')].map((s) => s.dataset.team),
      types: [...document.querySelectorAll('.add-role-list .tg-sub')].map((t) => t.dataset.team + '/' + t.dataset.type) }));
    L.check('add role: Town, Mafia, Neutral sections with data-team', a.teams.join() === 'town,mafia,third', a.teams.join());
    L.check('add role: approved types (Plain kept, Mafia Killing and Support, no Vote)', a.types.includes('town/Plain') && a.types.includes('mafia/Killing') && a.types.includes('mafia/Support') && !a.types.some((t) => /Vote/.test(t)), a.types.join());
    L.check('add role: the sheet top holds the search in its own row (ready for a filter)', a.top);
    await host.page.locator('.add-role-sheet input.search').fill('godfather'); await host.page.waitForTimeout(100);
    const vis = await host.page.evaluate(() => ({ subs: [...document.querySelectorAll('.add-role-list .tg-sub')].filter((t) => !t.hidden).map((t) => t.dataset.team + '/' + t.dataset.type), secs: [...document.querySelectorAll('.add-role-list section.tg')].filter((t) => !t.hidden).length }));
    L.check('add role: search hides type and team sections with no match', vis.subs.join() === 'mafia/Killing' && vis.secs === 1, JSON.stringify(vis));
    await shot(host, 'addrole-search-390');
    await host.page.locator('.add-role-sheet input.search').fill(''); await host.page.waitForTimeout(100);
    L.check('add role: clearing the search shows every section again', (await host.page.locator('.add-role-list .tg-sub[hidden]').count()) === 0);
    await host.page.locator('.add-role-sheet .add-role-done').click(); await host.page.waitForTimeout(450);
  }
  await host.page.locator('.deck-list [data-a="addRole"][data-id="villager"]').click();
  await host.page.waitForTimeout(200);
  L.check('customize: 8 roles for 7 players shows the mismatch', /need to match/.test(await host.page.locator('.setup-page').innerText()));
  await shot(host, 'customize-mismatch-390');
  await host.page.locator('.deck-list [data-a="subRole"][data-id="villager"]').click();
  await host.page.locator('[data-a="setupSave"]').click();
  await host.page.locator('[data-i="presetName"]').fill('Night one');
  await shot(host, 'save-preset-390');
  await host.page.locator('[data-a="setupSaveDo"]').click();
  await host.page.waitForTimeout(200);
  await host.page.locator('[data-a="setupPresets"]').first().click();
  L.check('a saved preset shows under Saved with a star', (await host.page.locator('.pc-list .badge', { hasText: '★ Saved' }).count()) >= 1 && /Night one/.test(await host.page.locator('.pc-list').last().innerText()));
  await shot(host, 'presets-saved-390');
  await host.page.locator('[data-a="setupMenu"]').click(); await host.page.locator('[data-a="setupMenuMode"][data-v="rename"]').click();
  await host.page.locator('[data-i="presetName"]').fill('Night two'); await host.page.locator('[data-a="setupRenameDo"]').click();
  L.check('Rename works', /Night two/.test(await host.page.locator('.pc-list').last().innerText()));
  await host.page.locator('[data-a="setupMenu"]').click(); await host.page.locator('[data-a="setupMenuMode"][data-v="delete"]').click(); await host.page.locator('[data-a="setupDeleteDo"]').click();
  L.check('Delete removes it', (await host.page.locator('.badge', { hasText: '★ Saved' }).count()) === 0);
  await host.page.locator('[data-a="setupPreview"][data-v="speakeasy"]').click(); await host.page.locator('[data-a="setupUse"]').click();
  await host.page.locator('.setup-card.is-active').waitFor();
  L.check('back on step 2 with Speakeasy', /Speakeasy/.test(await host.page.locator('.pp-name').innerText()));
  await next(host);
  L.check('step 3: Seating preselected Mixed (6 phones and 1 added name)', (await count(host)) === 'Step 3 of 4: Seating' && (await host.page.locator('[role="radio"][aria-checked="true"]').innerText()).startsWith('Mixed'));
  await shot(host, 'mafia-3-seating-390');

  // Refresh mid-carousel
  await host.page.reload({ waitUntil: 'domcontentloaded' });
  await host.page.locator('.setup-count').waitFor({ timeout: 15000 });
  L.check('refresh restores step 3', (await count(host)) === 'Step 3 of 4: Seating');
  await next(host);
  L.check('step 4: three summary rows, Advanced collapsed', (await count(host)) === 'Step 4 of 4: Deal' && (await host.page.locator('.sum-row').count()) === 3 && (await host.page.locator('#adv-body').isHidden()));
  await shot(host, 'mafia-4-deal-390');
  await host.page.locator('[data-a="setupAdvOpen"]').click();
  await shot(host, 'mafia-4-deal-advanced-390');
  await host.page.locator('[data-a="setupAdvOpen"]').click();
  await host.page.locator('.sum-row [data-a="setupGo"]').first().click();
  L.check('Edit jumps back to Players', (await count(host)) === 'Step 1 of 4: Players');
  for (let i = 0; i < 3; i++) await next(host);
  await checkPhones(L, all, 'carousel');
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  for (const p of players) await p.page.locator('.hand').first().waitFor({ timeout: 15000 }).catch(() => {});
  const hands = await Promise.all(players.map((p) => p.page.locator('.hand').count()));
  L.check('every phone shows its hand after Deal roles', hands.every((n) => n > 0), hands.join(','));
  await checkPhones(L, all, 'dealt');

  // Offline: own deck
  const solo = await phone(browser, srv.base, 'offline'); all.push(solo);
  await solo.goto('/#/local');
  await skipWalk(solo);
  await solo.page.locator('.setup-card.is-active').waitFor();
  L.check('offline: three steps, no room code', (await count(solo)) === 'Step 1 of 3: Players' && (await solo.page.locator('.room-chip').count()) === 0);
  await addNames(solo, ['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy']);
  await solo.page.waitForFunction(() => document.querySelectorAll('.chip').length === 9);
  await next(solo);
  L.check('offline step 2 is the same role selector (9 players: Speakeasy with a Jester)', await solo.page.waitForFunction(() => document.querySelectorAll('.mix-row').length === 5 && /Jester/.test(document.querySelector('.mix-list').innerText), null, { timeout: 5000 }).then(() => true, () => false));
  await shot(solo, 'offline-2-roles-390');
  await next(solo);
  L.check('offline step 3: how do you want to deal roles, three choices', /How do you want to deal roles/.test(await solo.page.locator('.setup-h').innerText()) && (await solo.page.locator('.setup-choice').count()) === 3);
  await shot(solo, 'offline-390');
  await solo.page.locator('.setup-choice', { hasText: 'Your own playing cards' }).click();
  await solo.page.locator('.own-deck').waitFor();
  L.check('own deck key shows Jester J♥ and Print this key', (await solo.page.locator('.own-deck').innerText()).includes('J♥') && (await solo.page.locator('[data-a="printKey"]').count()) === 1);
  await shot(solo, 'own-deck-390'); await full(solo, 'own-deck-390-full');
  await size(solo, 375, 667); await shot(solo, 'own-deck-375');
  L.check('375x667: own deck has no sideways scroll', !(await solo.overflow()));
  await size(solo, 1280, 800); await shot(solo, 'own-deck-1280'); await size(solo, 390, 844);
  await solo.page.locator('.action-dock [data-a="setupDeal2"]').click();
  await solo.page.waitForFunction(() => !document.querySelector('.setup'), null, { timeout: 8000 }).catch(() => {});
  L.check('offline own-deck deal moves on from setup', (await solo.page.locator('.setup').count()) === 0, (await solo.text()).slice(0, 80));
  await shot(solo, 'offline-dealt-390');
  await checkPhones(L, [solo], 'offline');

  // Offline: a setup that needs the printable deck
  const solo2 = await phone(browser, srv.base, 'offline2'); all.push(solo2);
  await solo2.goto('/#/local');
  await skipWalk(solo2);
  await solo2.page.locator('.setup-card.is-active').waitFor();
  await addNames(solo2, ['Ann', 'Bob', 'Cid', 'Dot', 'Eli', 'Flo', 'Gil', 'Hex', 'Ian', 'Joy']);
  await next(solo2);
  await solo2.page.locator('[data-a="setupPresets"]').first().click(); await solo2.page.locator('[data-a="setupPreview"][data-v="family-business"]').click(); await solo2.page.locator('[data-a="setupUse"]').click();
  await next(solo2);
  await solo2.page.locator('.setup-choice', { hasText: 'Your own playing cards' }).click();
  L.check('a setup with a Janitor says it needs the printable deck, with a one-tap switch', /needs the printable deck/.test(await solo2.page.locator('.setup-card.is-active').innerText()) && /needs the printable deck/.test(await solo2.page.locator('#setup-why').innerText()));
  await shot(solo2, 'own-deck-needs-printable-390');
  await solo2.page.locator('.setup-choice[data-v="pass"]').click();
  await solo2.page.locator('.action-dock [data-a="setupDeal2"]').click();
  await solo2.page.waitForFunction(() => !document.querySelector('.setup'), null, { timeout: 8000 }).catch(() => {});
  L.check('switching to No cards deals', (await solo2.page.locator('.setup').count()) === 0, (await solo2.text()).slice(0, 80));
  await checkPhones(L, [solo2], 'offline2');
} catch (e) {
  for (const p of all.slice(0, 1)) { await p.page.screenshot({ path: '/tmp/e2e-fail.png' }).catch(() => {}); console.log((await p.text()).slice(0, 300), p.errors.slice(0, 3)); }
  L.check('suite ran to the end', false, String((e && e.stack) || e).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close(); srv.stop(); L.done();
}
