// Inline SVG icons. No text anywhere in the controls, so a child who can't read can play.
const S = (body, vb = '0 0 100 100') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  left: S('<path d="M62 18 L28 50 L62 82" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>'),
  right: S('<path d="M38 18 L72 50 L38 82" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>'),
  fly: S(`
    <path d="M50 58 C38 40 22 34 6 38 C16 46 22 54 26 64 C34 60 42 60 50 66 C58 60 66 60 74 64 C78 54 84 46 94 38 C78 34 62 40 50 58 Z" fill="#fff"/>
    <path d="M50 12 L66 32 L56 32 L56 46 L44 46 L44 32 L34 32 Z" fill="#fff"/>`),
  stunt: S(`
    <path d="M50 16 A34 34 0 1 1 18 62" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
    <path d="M6 52 L20 74 L34 54 Z" fill="#fff"/>
    <circle cx="50" cy="50" r="9" fill="#fff"/>`),
  bug: S(`
    <circle cx="50" cy="54" r="30" fill="#fff59a" opacity=".45"/>
    <ellipse cx="34" cy="40" rx="16" ry="11" fill="#fff" opacity=".9" transform="rotate(-25 34 40)"/>
    <ellipse cx="66" cy="40" rx="16" ry="11" fill="#fff" opacity=".9" transform="rotate(25 66 40)"/>
    <ellipse cx="50" cy="58" rx="15" ry="20" fill="#c6f53a" stroke="#6b8f12" stroke-width="3"/>
    <circle cx="50" cy="36" r="10" fill="#3a2f4a"/>
    <circle cx="46" cy="34" r="3" fill="#fff"/><circle cx="54" cy="34" r="3" fill="#fff"/>
    <path d="M44 28 L36 16 M56 28 L64 16" stroke="#3a2f4a" stroke-width="3" stroke-linecap="round"/>`),
  apple: S(`
    <path d="M50 30 C38 20 16 24 16 50 C16 74 34 90 50 84 C66 90 84 74 84 50 C84 24 62 20 50 30 Z" fill="#ff4d4d" stroke="#b81f2c" stroke-width="3"/>
    <path d="M50 30 L52 12" stroke="#7a4b2a" stroke-width="6" stroke-linecap="round"/>
    <path d="M54 20 C62 8 76 10 78 16 C70 24 60 24 54 20 Z" fill="#5cc95c"/>
    <ellipse cx="34" cy="46" rx="6" ry="10" fill="#fff" opacity=".55"/>`),
  orange: S(`
    <circle cx="50" cy="54" r="34" fill="#ffa024" stroke="#d26f00" stroke-width="3"/>
    <path d="M50 22 C56 10 72 10 76 16 C68 24 58 26 50 22 Z" fill="#5cc95c"/>
    <circle cx="50" cy="22" r="4" fill="#7a4b2a"/>
    <ellipse cx="36" cy="44" rx="7" ry="10" fill="#fff" opacity=".45"/>`),
  banana: S(`
    <path d="M18 30 C20 70 60 88 86 64 C80 62 76 60 74 56 C58 72 34 62 30 30 Z" fill="#ffe14d" stroke="#c9a400" stroke-width="3" stroke-linejoin="round"/>
    <path d="M18 30 L22 22 L30 30 Z" fill="#7a4b2a"/>
    <circle cx="84" cy="62" r="4" fill="#7a4b2a"/>`),
  grapes: S(`
    <path d="M50 22 L54 8" stroke="#7a4b2a" stroke-width="6" stroke-linecap="round"/>
    <path d="M54 14 C62 4 76 8 76 14 C68 20 60 20 54 14 Z" fill="#5cc95c"/>
    <g fill="#9b5de5" stroke="#5f2b9e" stroke-width="2.5">
      <circle cx="34" cy="34" r="11"/><circle cx="54" cy="32" r="11"/><circle cx="72" cy="36" r="11"/>
      <circle cx="42" cy="52" r="11"/><circle cx="62" cy="52" r="11"/>
      <circle cx="50" cy="70" r="11"/><circle cx="32" cy="66" r="9" opacity="0"/>
      <circle cx="52" cy="86" r="9"/>
    </g>`),
  heart: S('<path d="M50 86 C20 64 8 48 8 32 C8 18 20 8 32 8 C40 8 46 12 50 20 C54 12 60 8 68 8 C80 8 92 18 92 32 C92 48 80 64 50 86 Z" fill="#ff5f8f" stroke="#c22f62" stroke-width="4"/>'),
  heartEmpty: S('<path d="M50 86 C20 64 8 48 8 32 C8 18 20 8 32 8 C40 8 46 12 50 20 C54 12 60 8 68 8 C80 8 92 18 92 32 C92 48 80 64 50 86 Z" fill="#ffffff" fill-opacity=".55" stroke="#9fb3c8" stroke-width="5"/>'),
  sound: S(`
    <path d="M14 38 L32 38 L54 18 L54 82 L32 62 L14 62 Z" fill="#fff"/>
    <path d="M66 34 C74 42 74 58 66 66 M76 24 C90 38 90 62 76 76" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`),
  mute: S(`
    <path d="M14 38 L32 38 L54 18 L54 82 L32 62 L14 62 Z" fill="#fff"/>
    <path d="M66 38 L88 62 M88 38 L66 62" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`),
  play: S('<path d="M34 20 L82 50 L34 80 Z" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>'),
  install: S(`
    <path d="M50 12 L50 60 M30 42 L50 62 L70 42" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 70 L16 86 L84 86 L84 70" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`),
  hand: S(`
    <path d="M40 92 C30 80 18 66 22 58 C26 52 34 56 40 64 L40 22 C40 14 52 14 52 22 L52 48 L52 40 C52 32 64 32 64 40 L64 50 C64 42 76 42 76 50 L76 58 C76 52 86 52 86 60 L86 72 C86 84 78 92 70 92 Z"
      fill="#fff" stroke="#2b3a55" stroke-width="5" stroke-linejoin="round"/>`),
  rotate: S(`
    <rect x="30" y="14" width="40" height="72" rx="8" fill="none" stroke="#fff" stroke-width="7"/>
    <path d="M86 56 A36 36 0 0 1 56 90" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <path d="M48 84 L60 96 L62 80 Z" fill="#fff"/>`),
  crest: S(`
    <circle cx="50" cy="62" r="28" fill="#fff" stroke="#c8d3de" stroke-width="3"/>
    <path d="M40 38 C30 18 34 8 42 6 C44 18 48 28 50 36 C50 22 56 8 64 8 C62 20 60 30 58 38 C64 28 74 22 80 26 C72 32 66 38 62 44 Z" fill="var(--crest, #ffd23f)"/>
    <circle cx="60" cy="58" r="6" fill="#1b1b24"/>
    <path d="M74 62 C84 62 86 72 80 78 C78 72 74 70 70 70 Z" fill="#7d838c"/>`),
};

/** Fill every element that has data-icon with its SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
}

export function setIcon(el, name) {
  if (el.dataset.current === name) return;
  el.dataset.current = name;
  el.innerHTML = ICONS[name] || '';
}
