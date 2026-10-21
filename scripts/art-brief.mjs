// Writes art-source/BRIEF.md (ChatGPT prompts, 6 roles per image) and art-source/sheets.json.
// Run: npm run art:brief
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../public/js/roles.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'art-source');
fs.mkdirSync(path.join(out, 'sheets'), { recursive: true });

// Core roles first so the first free-tier generations cover the most-used cards.
const CORE = ['mafia', 'villager', 'doctor', 'cop', 'detective', 'godfather', 'jester', 'bodyguard', 'vigilante', 'hunter', 'mason', 'killer',
  'cult', 'executioner', 'survivor', 'jailer', 'hooker', 'framer', 'janitor', 'veteran', 'tracker', 'lookout', 'merlin', 'president', 'traitor',
  'amnesiac', 'opportunist', 'miller', 'grandma', 'bomb'];
const rank = (r) => { const i = CORE.indexOf(r.id); return i >= 0 ? i : 1000; };
const roles = [...ROLES].sort((a, b) => rank(a) - rank(b) || a.alignment.localeCompare(b.alignment) || a.name.localeCompare(b.name));

const PER = 6; // 2 columns x 3 rows on one portrait image
const TEAM = {
  town: 'warm gold and amber light on deep brown',
  mafia: 'crimson red and black with cold shadow',
  third: 'violet and indigo with pale lavender highlights',
};
const STYLE = `Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.`;

const sheets = [];
let md = `# Art brief\n\nUse ChatGPT (image generation). One prompt gives six roles at once; free accounts have a daily image limit, so do the sheets in order (sheet 1 holds the most-used roles).\n\n## Shared style (already included in every prompt)\n${STYLE}\n\n## Workflow\n1. Paste a prompt and ask for a **portrait 1024x1536** image. If the grid comes out wrong, say: "Redo as exactly 2 columns by 3 rows, six equal square cells, thin dark gutters."\n2. Save the image as \`art-source/sheets/sheet-NN.png\` (matching the sheet number).\n3. Run \`npm run art:slice -- art-source/sheets/sheet-NN.png\` to cut it into per-role portraits.\n4. Run \`npm run deploy\`.\n\nKeep the same chat for every sheet so the style stays consistent ("same style as before").\n\n`;
for (let i = 0; i < roles.length; i += PER) {
  const group = roles.slice(i, i + PER);
  const n = String(sheets.length + 1).padStart(2, '0');
  sheets.push({ sheet: n, roles: group.map((r) => r.id) });
  const cells = group.map((r, k) => `${k + 1}. ${r.name} (${r.alignment === 'third' ? 'third-party' : r.alignment}; palette: ${TEAM[r.alignment]}): ${r.blurb}`).join('\n');
  md += `## Sheet ${n}: ${group.map((r) => r.name).join(', ')}\n\n\`\`\`text\nCreate ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.\nStyle for all six: ${STYLE}\nEach cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):\n${cells}\n\`\`\`\n\n`;
}
fs.writeFileSync(path.join(out, 'BRIEF.md'), md);
fs.writeFileSync(path.join(out, 'sheets.json'), JSON.stringify(sheets, null, 2));
console.log(`${roles.length} roles -> ${sheets.length} sheets. Wrote art-source/BRIEF.md`);
