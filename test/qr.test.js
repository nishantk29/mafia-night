import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQR, qrSvg, joinUrl } from '../public/js/qr.js';

// An independent QR reader: its own GF(256) maths, its own function-module map and its own block layout.
const gmul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a <<= 1; if (a & 256) a ^= 0x11d; b >>= 1; } return r; };
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // versions 1 to 10, error correction M
const ECPB = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const POS = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => ((y >> 1) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0];
// remainder of v divided by generator g (g has `glen` bits)
const polyMod = (v, g, glen) => { for (let i = 31; i >= glen - 1; i--) if ((v >>> i) & 1) v ^= g << (i - glen + 1); return v; };

function decode(m) {
  const n = m.length; const ver = (n - 17) / 4;
  assert.ok(Number.isInteger(ver) && ver >= 1 && ver <= 10, 'size is a valid version');
  const word = (pairs) => pairs.reduce((a, [x, y], i) => a | ((m[y][x] ? 1 : 0) << i), 0);
  const c1 = word([[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]);
  const c2 = word([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [n - 1 - i, 8]).concat([0, 1, 2, 3, 4, 5, 6].map((i) => [8, n - 7 + i])));
  assert.equal(c1, c2, 'both format copies agree');
  const f = c1 ^ 0x5412;
  assert.equal(polyMod(f, 0x537, 11), 0, 'format bits are a valid BCH codeword');
  assert.equal(f >> 13, 0, 'error correction level is M');
  const mask = (f >> 10) & 7;
  assert.equal(m[n - 8][8], true, 'dark module');
  if (ver >= 7) {
    let v1 = 0; let v2 = 0;
    for (let i = 0; i < 18; i++) { v1 |= (m[Math.floor(i / 3)][n - 11 + (i % 3)] ? 1 : 0) << i; v2 |= (m[n - 11 + (i % 3)][Math.floor(i / 3)] ? 1 : 0) << i; }
    assert.equal(v1, v2); assert.equal(v1 >> 12, ver, 'version bits'); assert.equal(polyMod(v1, 0x1f25, 13), 0);
  }
  // modules that are not data: finders, timing, alignment, format, version
  const res = Array.from({ length: n }, () => new Array(n).fill(false));
  const box = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < n && y < n) res[y][x] = true; };
  box(0, 0, 8, 8); box(n - 8, 0, n - 1, 8); box(0, n - 8, 8, n - 1); box(0, 6, n - 1, 6); box(6, 0, 6, n - 1);
  if (ver >= 7) { box(n - 11, 0, n - 9, 5); box(0, n - 11, 5, n - 9); }
  const pos = POS[ver - 1]; const last = pos[pos.length - 1];
  for (const a of pos) for (const b of pos) { if ((a === 6 && b === 6) || (a === 6 && b === last) || (a === last && b === 6)) continue; box(a - 2, b - 2, a + 2, b + 2); }
  const bits = []; let up = true;
  for (let x = n - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let k = 0; k < n; k++) { const y = up ? n - 1 - k : k; for (const xx of [x, x - 1]) if (!res[y][xx]) bits.push(m[y][xx] !== MASK[mask](xx, y)); }
    up = !up;
  }
  const words = [];
  for (let i = 0; i + 8 <= TOTAL[ver - 1] * 8; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + (b ? 1 : 0), 0));
  const nb = BLOCKS[ver - 1]; const ec = ECPB[ver - 1]; const dataTotal = TOTAL[ver - 1] - nb * ec;
  const lens = Array.from({ length: nb }, (_, i) => Math.floor(dataTotal / nb) + (i >= nb - (dataTotal % nb) ? 1 : 0));
  const blocks = lens.map(() => []); const eblocks = lens.map(() => []); let w = 0;
  for (let i = 0; i < Math.max(...lens); i++) for (let b = 0; b < nb; b++) if (i < lens[b]) blocks[b].push(words[w++]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) eblocks[b].push(words[w++]);
  assert.equal(w, TOTAL[ver - 1], 'every codeword placed');
  // every block must have zero Reed-Solomon syndromes
  blocks.forEach((d, b) => {
    const cw = [...d, ...eblocks[b]];
    for (let j = 0, a = 1; j < ec; j++, a = gmul(a, 2)) { let s = 0; for (const c of cw) s = gmul(s, a) ^ c; assert.equal(s, 0, `syndrome ${j} of block ${b}`); }
  });
  const bs = blocks.flat().flatMap((c) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (c >> i) & 1));
  const take = (k, len) => bs.slice(k, k + len).reduce((a, b) => a * 2 + b, 0);
  assert.equal(take(0, 4), 0b0100, 'byte mode');
  const cb = ver < 10 ? 8 : 16; const len = take(4, cb);
  const out = Uint8Array.from({ length: len }, (_, i) => take(4 + cb + i * 8, 8));
  return { text: new TextDecoder().decode(out), ver, mask };
}

// The matrix as drawn: parse the SVG path back into modules and check the 4-module white border.
function fromSvg(svg) {
  const vb = +/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]; const n = vb - 8;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  for (const [, x, y, l] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    assert.ok(+x >= 4 && +y >= 4 && +x + +l <= n + 4 && +y < n + 4, 'dark modules stay inside the quiet zone');
    for (let i = 0; i < +l; i++) m[+y - 4][+x - 4 + i] = true;
  }
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/); assert.match(svg, /fill="#000"/);
  return m;
}

test('published format bit strings for ECC M are valid BCH codewords for their mask', () => {
  const known = { 0: '101010000010010', 1: '101000100100101', 2: '101111001111100', 5: '100000011001110' }; // ISO 18004 table C.1
  for (const [mask, str] of Object.entries(known)) {
    const f = parseInt(str, 2) ^ 0x5412;
    assert.equal(f >> 10, +mask); assert.equal(polyMod(f, 0x537, 11), 0);
  }
});

const SAMPLES = ['A', 'https://mafia.hatethespurs.com/#/join/ABCDEF', joinUrl('https://mafia-app.hatethespurs.workers.dev', 'QWERTY'),
  joinUrl('http://localhost:8787', 'ZZZZZZ'), 'https://example.com/' + 'x'.repeat(100), 'café ☕ ' + 'y'.repeat(190)];
for (const text of SAMPLES) {
  test(`QR encodes then decodes back to the payload (${text.length} chars)`, () => {
    assert.equal(decode(encodeQR(text).rows).text, text);
    assert.equal(decode(fromSvg(qrSvg(text))).text, text, 'the drawn SVG decodes to the same text');
  });
}

test('the room QR payload equals the room join URL exactly', () => {
  const url = joinUrl('https://mafia.hatethespurs.com', 'KJHGFD');
  assert.equal(url, 'https://mafia.hatethespurs.com/#/join/KJHGFD');
  assert.equal(decode(fromSvg(qrSvg(url))).text, url);
});

test('too much data is rejected, not mis-encoded', () => assert.throws(() => encodeQR('z'.repeat(300)), RangeError));
