// Lists role NAMES from other public Mafia sites that our catalogue doesn't have yet, for a human to review.
// Only names are read and printed: never descriptions or any other text. New roles must be written in our own
// words (see HANDOFF.md).
//
// Usage:
//   node scripts/role-gaps.mjs                       fetch the public sources and list what we're missing
//   node scripts/role-gaps.mjs --save names.txt      ...and save the fetched names (names only) for later
//   node scripts/role-gaps.mjs --offline --file names.txt
//                                                    no network: use a saved or pasted list instead
//   --picklist picks.md                              also write the missing names as a Markdown checklist to tick
//   --file can be given more than once. A list file has one role name per line; blank lines and lines starting
//   with # are ignored, and "# source: <label>" starts a new labelled group.
// If a fetch fails (offline, site changed), the script says so and carries on with whatever else it has.
//
// The picklist has one "## source" section per source, then a last section of names that are probably jokes or
// site-specific. A name goes there if it has a digit; any character other than letters (any script), spaces,
// hyphens, apostrophes, periods or ampersands; more than 3 words; or a whole word from SITE_WORDS (gg, discord,
// mod, bot, ...). It is only a sorting hint: those names are still listed, a human still decides.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROLES } from '../public/js/roles.js';

// Names that mean one of our roles under another name. Add pairs here once a human has checked them.
export const ALIASES = { mafioso: 'mafia', townie: 'villager' };

export const norm = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

// Every way our catalogue can be named: role names, role ids, and the aliases above.
export function knownKeys(roles = ROLES) {
  const keys = new Set();
  for (const r of roles) { keys.add(norm(r.name)); keys.add(norm(r.id)); }
  const ids = new Set(roles.map((r) => r.id));
  for (const [alias, id] of Object.entries(ALIASES)) if (ids.has(id)) keys.add(alias);
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

// Missing names for each source, in source order. A name an earlier source already listed is not repeated.
export function missingBySource(groups, keys = knownKeys()) {
  const seen = new Set();
  return groups.map((g) => {
    const names = missingNames(g.names, keys).filter((n) => !seen.has(norm(n)));
    names.forEach((n) => seen.add(norm(n)));
    return { source: g.source, total: g.names.length, names };
  });
}

// Words that point at a site's own staff, bots or in-jokes rather than a playable role.
export const SITE_WORDS = ['gg', 'mafiagg', 'mafiarole', 'epicmafia', 'discord', 'admin', 'mod', 'moderator', 'dev', 'test', 'bot', 'host'];

// A sorting hint for the picklist, not a verdict. A name is flagged if it has a digit; any character other than
// letters (any script, accents included), spaces, hyphens, apostrophes, periods or ampersands (so emoji, quotes,
// !, ?, brackets and slashes); more than 3 words; or one of SITE_WORDS as a whole word, ignoring case.
export function isLikelyJoke(name) {
  const s = String(name).trim();
  if (/\p{Nd}/u.test(s) || /[^\p{L}\p{M}\s'’.&-]/u.test(s)) return true;
  if (s.split(/\s+/).length > 3) return true;
  return s.toLowerCase().split(/[^\p{L}\p{M}]+/u).some((w) => SITE_WORDS.includes(w));
}

// Names and source labels go into Markdown as plain text: one line, no links, emphasis, code, HTML or headings.
const mdText = (s) => String(s).replace(/[\p{Cc}\s]+/gu, ' ').trim().replace(/[\\`*_[\]<>~|]/g, '\\$&').replace(/&(?=#?\w+;)/g, '\\&').replace(/^#/, '\\#');

// The picklist file: names only, grouped by source, likely jokes last. Nothing in it depends on the date or run.
export function picklistMarkdown(groups, keys = knownKeys()) {
  const out = ['# Role picks', '', 'Names only. Tick the ones worth adding, then write them in our own words in `roles_extra*.js`.'];
  const jokes = [];
  for (const { source, names } of missingBySource(groups, keys)) {
    const keep = names.filter((n) => !isLikelyJoke(n));
    names.filter(isLikelyJoke).forEach((name) => jokes.push({ name, source }));
    if (keep.length) out.push('', `## ${mdText(source)}`, ...keep.map((n) => `- [ ] ${mdText(n)}`));
  }
  if (jokes.length) {
    jokes.sort((a, b) => a.name.localeCompare(b.name));
    out.push('', '## Probably jokes or site-specific', ...jokes.map((j) => `- [ ] ${mdText(j.name)} (${mdText(j.source)})`));
  }
  return out.join('\n') + '\n';
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
  const files = []; let save = null; let picklist = null; let offline = false;
  for (let i = 0; i < argv.length; i++) {
    if (['--file', '--save', '--picklist'].includes(argv[i]) && i + 1 >= argv.length) { console.error(`${argv[i]} needs a file name.`); return 2; }
    if (argv[i] === '--file') files.push(argv[++i]);
    else if (argv[i] === '--save') save = argv[++i];
    else if (argv[i] === '--picklist') picklist = argv[++i];
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
  const missing = missingBySource(groups, keys);
  console.log(`Our catalogue: ${ROLES.length} roles.`);
  for (const { source, total, names } of missing) {
    console.log(`\n${source}: ${total} names, ${names.length} we don't have${names.length ? ':' : '.'}`);
    for (const n of names) console.log(`  ${n}`);
  }
  console.log('\nThese are names only. Review them, then write any new role in our own words in roles_extra*.js.');
  if (picklist) {
    writeFileSync(picklist, picklistMarkdown(groups, keys));
    console.error(`Wrote ${missing.reduce((t, m) => t + m.names.length, 0)} names to ${picklist}.`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = await main(process.argv.slice(2));
