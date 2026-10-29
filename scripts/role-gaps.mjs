// Lists role NAMES from other public Mafia sites that our catalogue doesn't have yet, for a human to review.
// Only names are read and printed: never descriptions or any other text. New roles must be written in our own
// words (see HANDOFF.md).
//
// Usage:
//   node scripts/role-gaps.mjs                       fetch the public sources and list what we're missing
//   node scripts/role-gaps.mjs --save names.txt      ...and save the fetched names (names only) for later
//   node scripts/role-gaps.mjs --offline --file names.txt
//                                                    no network: use a saved or pasted list instead
//   --file can be given more than once. A list file has one role name per line; blank lines and lines starting
//   with # are ignored, and "# source: <label>" starts a new labelled group.
// If a fetch fails (offline, site changed), the script says so and carries on with whatever else it has.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROLES, LEGACY_ROLES, ROLE_ALIASES } from '../public/js/roles.js';

// Names that mean one of our roles under another name. Add pairs here once a human has checked them.
export const ALIASES = { mafioso: 'mafia', townie: 'villager' };

export const norm = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

// Every way our catalogue can be named: role names, role ids, and the aliases above.
export function knownKeys(roles = ROLES) {
  const keys = new Set();
  for (const r of roles) { keys.add(norm(r.name)); keys.add(norm(r.id)); }
  const ids = new Set(roles.map((r) => r.id));
  for (const [alias, id] of Object.entries(ALIASES)) if (ids.has(id)) keys.add(alias);
  for (const old of Object.keys(ROLE_ALIASES)) keys.add(norm(old)); // retired twin ids
  for (const r of LEGACY_ROLES) { keys.add(norm(r.name)); keys.add(norm(r.id)); } // Cop, Parity Cop...: the pre-merge names still count as known
  return keys;
}

// Placeholder entries like "(Random Cop)" are slots, not roles.
const isRoleName = (n) => n && n.length <= 40 && !/^\(.*\)$/.test(n);

// mafia.gg is a single-page app; its role list ships in the app bundle as objects that start
// {name:"...",description:...}. Only the name is taken.
export function namesFromMafiaGG(bundle) {
  return [...String(bundle).matchAll(/\{name:"((?:[^"\\]|\\.){1,60})",description:/g)].map((m) => JSON.parse(`"${m[1]}"`)).filter(isRoleName);
}

// mafiarole.com shows each role as a heading followed by the role's emoji. Only the heading text is taken.
export function namesFromMafiaRole(html) {
  const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
  return [...String(html).matchAll(/>([^<>]{2,40})<\/h[2-4]><span[^>]*aria-hidden="true"/g)].map((m) => unescape(m[1].trim())).filter(isRoleName);
}

// A pasted or saved list: one name per line. "# source: label" starts a group; other # lines are comments.
export function parseList(text, label = 'list') {
  const groups = []; let cur = { source: label, names: [] };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const src = line.match(/^#\s*source:\s*(.+)$/i);
    if (src) { if (cur.names.length) groups.push(cur); cur = { source: src[1].trim(), names: [] }; continue; }
    if (!line || line.startsWith('#')) continue;
    if (isRoleName(line)) cur.names.push(line);
  }
  if (cur.names.length) groups.push(cur);
  return groups;
}

// Names we don't have, de-duplicated (by normalized name) and sorted.
export function missingNames(names, keys = knownKeys()) {
  const seen = new Map();
  for (const n of names) { const k = norm(n); if (k && !keys.has(k) && !seen.has(k)) seen.set(k, n); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const SOURCES = [
  { source: 'mafia.gg', url: 'https://mafia.gg/assets/app.js', extract: namesFromMafiaGG },
  { source: 'mafiarole.com', url: 'https://mafiarole.com/', extract: namesFromMafiaRole },
];

export async function fetchSource({ source, url, extract }) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'mafia-night role-gaps (names only)' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const names = extract(await res.text());
    if (!names.length) throw new Error('no role names found (the page layout may have changed)');
    return { source, names };
  } catch (e) {
    console.error(`! ${source}: could not read role names (${e.message}). Save a list by hand and pass it with --file.`);
    return null;
  }
}

async function main(argv) {
  const files = []; let save = null; let offline = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') files.push(argv[++i]);
    else if (argv[i] === '--save') save = argv[++i];
    else if (argv[i] === '--offline') offline = true;
    else { console.error(`Unknown option ${argv[i]}. See the top of scripts/role-gaps.mjs.`); return 2; }
  }
  const groups = [];
  if (!offline) for (const s of SOURCES) { const g = await fetchSource(s); if (g) groups.push(g); }
  for (const f of files) groups.push(...parseList(readFileSync(f, 'utf8'), f));
  if (!groups.length) { console.error('No role names to compare. Run with network access, or pass a list with --file.'); return 2; }
  if (save) {
    const fetched = groups.filter((g) => SOURCES.some((s) => s.source === g.source));
    writeFileSync(save, fetched.map((g) => `# source: ${g.source}\n${g.names.join('\n')}\n`).join('\n'));
    console.error(`Saved ${fetched.reduce((t, g) => t + g.names.length, 0)} names to ${save}.`);
  }
  const keys = knownKeys();
  const seen = new Set();
  console.log(`Our catalogue: ${ROLES.length} roles.`);
  for (const g of groups) {
    const miss = missingNames(g.names, keys).filter((n) => !seen.has(norm(n)));
    miss.forEach((n) => seen.add(norm(n)));
    console.log(`\n${g.source}: ${g.names.length} names, ${miss.length} we don't have${miss.length ? ':' : '.'}`);
    for (const n of miss) console.log(`  ${n}`);
  }
  console.log('\nThese are names only. Review them, then write any new role in our own words in roles_extra*.js.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = await main(process.argv.slice(2));
