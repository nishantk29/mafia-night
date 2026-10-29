// @ts-check
// Entrances play once per mount. The app repaints #app with innerHTML on every state change (a socket update, a
// timer tick), so a sheet, card or overlay that carries an entrance animation would replay it each time. Before a
// repaint we note which entrance elements are on screen; after it, the same elements (same classes and identifying
// attributes) get .is-settled, which stops the animation. A new or changed element still animates once.
export const ENTER_SEL = '.is-entering, .hw-card, .check-card';

/** @param {Element} el */
export function enterKey(el) {
  const cls = [...el.classList].filter((c) => c !== 'is-settled').sort().join('.');
  const attrs = ['role', 'aria-labelledby', 'aria-label', 'data-i', 'data-a', 'data-dir'].map((a) => el.getAttribute(a) || '').join('|');
  // A card's content is part of its identity (the walk's next card animates); a sheet keeps its identity while its body updates.
  const text = el.matches('.sheet, .overlay-in, .modal') ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${el.tagName}.${cls}|${attrs}|${text}`;
}

/** @param {ParentNode} root @returns {Set<string>} */
export function enterKeys(root) {
  return new Set([...root.querySelectorAll(ENTER_SEL)].map(enterKey));
}

/** Marks entrance elements that were already on screen before the repaint. @param {ParentNode} root @param {Set<string>} before */
export function settle(root, before) {
  let n = 0;
  if (!before.size) return n;
  for (const el of root.querySelectorAll(ENTER_SEL)) if (before.has(enterKey(el))) { el.classList.add('is-settled'); n++; }
  return n;
}
