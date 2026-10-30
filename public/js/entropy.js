// Where the game's randomness and clock come from. Outside an event (the page, old callers) it is crypto and
// Date.now, as before. Inside one (withEntropy) it is a seeded stream, so replaying the event log gives the same game.
let src = null;

export function withEntropy(e, fn) {
  const prev = src; src = e;
  try { return fn(); } finally { src = prev; }
}
export const randU32 = () => (src ? src.u32() : crypto.getRandomValues(new Uint32Array(1))[0]);
export const rand01 = () => randU32() / 0x100000000;
export const randBytes = (n) => (src ? Uint8Array.from({ length: n }, () => src.u32() & 255) : crypto.getRandomValues(new Uint8Array(n)));
export const nowMs = () => (src ? src.now : Date.now());

// xoshiro128**: 128 bits of state from four 32-bit words (an all-zero seed is nudged).
export function seededEntropy(words, now) {
  let [a, b, c, d] = words.map((x) => x >>> 0);
  if (!(a | b | c | d)) a = 1;
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  return {
    now,
    u32() {
      const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
      const t = b << 9;
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
      return r;
    },
  };
}
export const newSeed = () => [...crypto.getRandomValues(new Uint32Array(4))];
