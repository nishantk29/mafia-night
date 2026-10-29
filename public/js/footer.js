// Site footer: one row of game links, and a small Credits expander for licences. Link text is always a name.
export const GAME_LINKS = [
  ['All games', 'https://gamenight.hatethespurs.com/'],
  ['Quest Night', 'https://avalon.hatethespurs.com/'],
  ['The Gilded Chamber', 'https://secrethitler.hatethespurs.com/'],
];

export function siteFooter() {
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  return `<footer class="site-foot">
    <nav class="foot-games" aria-label="Games">${GAME_LINKS.map(([n, h]) => `<a href="${h}">${n}</a>`).join('')}</nav>
    <details class="foot-credits"><summary>Credits</summary>
      <ul>
        <li>Role icons: ${ext('https://game-icons.net', 'game-icons.net')} by Lorc, Delapouite and contributors, ${ext('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0')}.</li>
        <li>Interface icons: ${ext('https://phosphoricons.com', 'Phosphor')}, MIT.</li>
        <li>Fonts: Rubik and Limelight, SIL Open Font License.</li>
      </ul>
    </details>
  </footer>`;
}
