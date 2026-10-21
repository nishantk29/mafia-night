// Cuts a 2x3 ChatGPT sheet into per-role portraits in public/art/<roleId>.webp, then rebuilds the art manifest.
// Run: npm run art:slice -- art-source/sheets/sheet-01.png
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) { console.error('Usage: npm run art:slice -- art-source/sheets/sheet-NN.png'); process.exit(1); }
const num = (path.basename(file).match(/(\d+)/) || [])[1];
const sheets = JSON.parse(fs.readFileSync(path.join(root, 'art-source/sheets.json'), 'utf8'));
const sheet = sheets.find((s) => s.sheet === String(num).padStart(2, '0'));
if (!sheet) { console.error('No sheet', num, 'in sheets.json'); process.exit(1); }

const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file]).toString().split(' ').map(Number);
const cols = 2, rows = 3, cw = w / cols, ch = h / rows;
const inset = Math.round(Math.min(cw, ch) * 0.025); // trim gutters
fs.mkdirSync(path.join(root, 'public/art'), { recursive: true });
sheet.roles.forEach((id, i) => {
  const x = Math.round((i % cols) * cw + inset), y = Math.round(Math.floor(i / cols) * ch + inset);
  const cwi = Math.round(cw - inset * 2), chi = Math.round(ch - inset * 2);
  const dst = path.join(root, 'public/art', `${id}.webp`);
  execFileSync('magick', [file, '-crop', `${cwi}x${chi}+${x}+${y}`, '+repage', '-gravity', 'center', '-resize', '720x778^', '-extent', '720x778', '-quality', '82', dst]);
  console.log('wrote', path.relative(root, dst));
});
execFileSync('node', [path.join(root, 'scripts/build-assets.mjs')], { stdio: 'inherit' });
